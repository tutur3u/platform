use super::crypto::{hex_decode, iso8601_to_millis, now_millis, scrypt};
use super::*;
use crate::{constant_time_eq, contact, outbound::OutboundHttpClient};

// ---------------------------------------------------------------------------
// API key validation + permission resolution (validateApiKey).
// Copied file-local from `storage_analytics.rs` (private fns there).
// ---------------------------------------------------------------------------

pub(super) fn extract_api_key(authorization: Option<&str>) -> Option<String> {
    let header = authorization?.trim();

    if header.len() >= 7 && header[..7].eq_ignore_ascii_case("bearer ") {
        let token = header[7..].trim();
        return (!token.is_empty()).then(|| token.to_owned());
    }

    if header.starts_with(API_KEY_PREFIX) {
        return Some(header.to_owned());
    }

    None
}

/// Mirrors `validateApiKey`. Returns the workspace context of the matching key,
/// or `None` when the key is invalid/expired. `Err(())` only for backend/config
/// failures (the caller maps both `None` and `Err` to 401, like the legacy null).
pub(super) async fn validate_api_key(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    api_key: &str,
) -> Result<Option<ApiKeyContext>, ()> {
    if !api_key.starts_with(API_KEY_PREFIX) {
        return Ok(None);
    }
    if api_key.len() < KEY_PREFIX_LEN {
        return Ok(None);
    }
    let key_prefix = &api_key[..KEY_PREFIX_LEN];

    let Some(url) = contact_data.rest_url(
        "workspace_api_keys",
        &[
            ("select", "id,ws_id,key_hash,role_id,expires_at".to_owned()),
            ("key_prefix", format!("eq.{key_prefix}")),
            ("or", "(expires_at.is.null,expires_at.gt.now())".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }

    let rows: Vec<ApiKeyRow> = response.json().map_err(|_| ())?;

    for row in rows {
        let Some(key_hash) = row.key_hash.as_deref().filter(|h| !h.is_empty()) else {
            continue;
        };

        if !verify_api_key_hash(api_key, key_hash) {
            continue;
        }

        // Defensive expiry recheck (the REST filter already excludes expired rows,
        // but the legacy code rechecks against `now()` in JS).
        if let Some(expires_at) = row.expires_at.as_deref()
            && let Some(expires_ms) = iso8601_to_millis(expires_at)
            && expires_ms < now_millis()
        {
            return Ok(None);
        }

        let Some(ws_id) = row.ws_id.filter(|id| !id.trim().is_empty()) else {
            return Ok(None);
        };

        return Ok(Some(ApiKeyContext {
            ws_id,
            role_id: row.role_id.filter(|id| !id.trim().is_empty()),
        }));
    }

    Ok(None)
}

/// Union of role permissions (when `role_id` is set, enabled) and workspace
/// default permissions (`member_type = MEMBER`, enabled).
pub(super) async fn resolve_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    role_id: Option<&str>,
) -> Result<Vec<String>, ()> {
    let mut permissions: Vec<String> = Vec::new();

    if let Some(role_id) = role_id {
        permissions.extend(role_permissions(contact_data, outbound, ws_id, role_id).await?);
    }

    for permission in default_permissions(contact_data, outbound, ws_id).await? {
        if !permissions.contains(&permission) {
            permissions.push(permission);
        }
    }

    Ok(permissions)
}

async fn role_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    role_id: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_role_permissions",
        &[
            ("select", "permission".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("role_id", format!("eq.{role_id}")),
            ("enabled", "eq.true".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    Ok(response
        .json::<Vec<PermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
}

async fn default_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_default_permissions",
        &[
            ("select", "permission".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("member_type", "eq.MEMBER".to_owned()),
            ("enabled", "eq.true".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    Ok(response
        .json::<Vec<PermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
}

/// Verifies a raw key against a stored `salt:hex` hash using scrypt with Node's
/// default parameters (N=16384, r=8, p=1, dkLen=64), constant-time comparison.
fn verify_api_key_hash(key: &str, stored_hash: &str) -> bool {
    #[cfg(test)]
    if let Some(expected) = stored_hash.strip_prefix("test-plain:") {
        return constant_time_eq(key.as_bytes(), expected.as_bytes());
    }

    let mut parts = stored_hash.splitn(2, ':');
    let (Some(salt), Some(expected_hex)) = (parts.next(), parts.next()) else {
        return false;
    };
    if salt.is_empty() || expected_hex.is_empty() {
        return false;
    }

    let Some(expected) = hex_decode(expected_hex) else {
        return false;
    };

    // Node passes the salt as the utf-8 hex string itself (not decoded bytes).
    let Some(derived) = scrypt(key.as_bytes(), salt.as_bytes(), 16384, 8, 1, expected.len()) else {
        return false;
    };

    constant_time_eq(&derived, &expected)
}
