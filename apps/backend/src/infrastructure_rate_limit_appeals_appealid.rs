//! Handler for `GET /api/v1/infrastructure/rate-limit-appeals/:appealId`.
//!
//! Ports the legacy Next.js GET handler at
//! `apps/web/src/app/api/v1/infrastructure/rate-limit-appeals/[appealId]/route.ts`.
//!
//! Only **GET** is migrated. `PATCH` (and every other method) returns `None`
//! so the Cloudflare worker falls through to the still-active Next.js route.
//!
//! # Auth
//!
//! Mirrors `authorizeAbuseIntelligenceRequest` (default permission):
//!
//! - No/invalid session token -> `401 { "message": "Unauthorized" }`
//! - Missing `view_infrastructure` permission on root workspace
//!   -> `403 { "message": "Forbidden" }`
//!
//! # Response
//!
//! - `400 { "message": "Invalid appeal ID" }` — `appealId` is not a valid UUID.
//! - `404 { "message": "Appeal not found" }` — no row in `rate_limit_appeals`.
//! - `500 { "message": "Failed to load rate-limit appeal" }` — upstream error.
//! - `200 { "appeal": <enriched> }` — success.
//!
//! # Behavior gaps vs legacy
//!
//! - `enrichRateLimitAppeals` is reimplemented inline (the sibling module's
//!   helpers are private and not importable). Behavior is identical for the
//!   single-appeal case.
//! - The `400` UUID validation uses a hand-rolled hex-segment check rather than
//!   Zod's `z.string().uuid()`, but accepts/rejects the same values for
//!   well-formed RFC 4122 UUIDs.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    infrastructure_root_auth::ROOT_WORKSPACE_ID,
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const PATH_PREFIX: &str = "/api/v1/infrastructure/rate-limit-appeals/";
const VIEW_INFRASTRUCTURE_PERMISSION: &str = "view_infrastructure";
const APPEALS_TABLE: &str = "rate_limit_appeals";
const LOAD_ERROR_MESSAGE: &str = "Failed to load rate-limit appeal";

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_infrastructure_rate_limit_appeals_appealid_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let appeal_id = appeal_id_segment(request.path)?;

    Some(match request.method {
        "GET" => get_response(config, request, appeal_id, outbound).await,
        _ => return None,
    })
}

/// Extract the `:appealId` segment from the path.
///
/// Returns `None` if the path does not match this route (no trailing segment,
/// or a deeper nested path with extra slashes).
fn appeal_id_segment(path: &str) -> Option<&str> {
    let segment = path.strip_prefix(PATH_PREFIX)?;
    (!segment.is_empty() && !segment.contains('/')).then_some(segment)
}

/// Validate that `s` looks like a lowercase/mixed-case RFC 4122 UUID.
///
/// Format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` (8-4-4-4-12 hex digits).
fn is_valid_uuid(s: &str) -> bool {
    let parts: Vec<&str> = s.split('-').collect();
    if parts.len() != 5 {
        return false;
    }
    let expected_lengths = [8usize, 4, 4, 4, 12];
    parts
        .iter()
        .zip(expected_lengths.iter())
        .all(|(part, &len)| part.len() == len && part.chars().all(|c| c.is_ascii_hexdigit()))
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    appeal_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    match authorize_workspace_permission(
        &config.contact_data,
        request,
        ROOT_WORKSPACE_ID,
        VIEW_INFRASTRUCTURE_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(_) => {}
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return message_response(401, "Unauthorized");
        }
        Err(
            WorkspacePermissionAuthorizationError::Forbidden
            | WorkspacePermissionAuthorizationError::NotFound,
        ) => {
            return message_response(403, "Forbidden");
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, LOAD_ERROR_MESSAGE);
        }
    }

    if !is_valid_uuid(appeal_id) {
        return message_response(400, "Invalid appeal ID");
    }

    let contact_data = &config.contact_data;
    let Some(service_role_key) = contact_data.service_role_key() else {
        return message_response(500, LOAD_ERROR_MESSAGE);
    };

    let appeal = match fetch_appeal(contact_data, outbound, service_role_key, appeal_id).await {
        FetchResult::Found(appeal) => appeal,
        FetchResult::NotFound => return message_response(404, "Appeal not found"),
        FetchResult::Error => return message_response(500, LOAD_ERROR_MESSAGE),
    };

    let enriched = enrich_appeal(contact_data, outbound, service_role_key, appeal).await;
    no_store_response(json_response(200, json!({ "appeal": enriched })))
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

enum FetchResult {
    Found(Value),
    NotFound,
    Error,
}

async fn fetch_appeal(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    service_role_key: &str,
    appeal_id: &str,
) -> FetchResult {
    let params = [
        ("select", "*".to_owned()),
        ("id", format!("eq.{appeal_id}")),
        ("limit", "1".to_owned()),
    ];
    let Some(url) = contact_data.rest_url(APPEALS_TABLE, &params) else {
        return FetchResult::Error;
    };
    let Ok(response) = service_role_get(outbound, &url, service_role_key).await else {
        return FetchResult::Error;
    };
    if !(200..300).contains(&response.status) {
        return FetchResult::Error;
    }
    match response.json::<Vec<Value>>() {
        Ok(mut rows) if !rows.is_empty() => FetchResult::Found(rows.remove(0)),
        Ok(_) => FetchResult::NotFound,
        Err(_) => FetchResult::Error,
    }
}

async fn service_role_get(
    outbound: &impl OutboundHttpClient,
    url: &str,
    service_role_key: &str,
) -> Result<OutboundResponse, ()> {
    let bearer = format!("Bearer {service_role_key}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

async fn fetch_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    service_role_key: &str,
    table: &str,
    params: &[(&str, String)],
) -> Option<Vec<Value>> {
    let url = contact_data.rest_url(table, params)?;
    let response = service_role_get(outbound, &url, service_role_key)
        .await
        .ok()?;
    if !(200..300).contains(&response.status) {
        return None;
    }
    response.json::<Vec<Value>>().ok()
}

// ---------------------------------------------------------------------------
// Enrichment (mirrors enrichRateLimitAppeals for a single appeal)
// ---------------------------------------------------------------------------

async fn enrich_appeal(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    service_role_key: &str,
    appeal: Value,
) -> Value {
    let workspace_id = non_empty_str(&appeal, "workspace_id").map(str::to_owned);
    let creator_id = non_empty_str(&appeal, "creator_id").map(str::to_owned);
    let client_ip = non_empty_str(&appeal, "client_ip").map(str::to_owned);

    let workspace = if let Some(ref ws_id) = workspace_id {
        load_workspace(contact_data, outbound, service_role_key, ws_id).await
    } else {
        Value::Null
    };

    let requester = if let Some(ref user_id) = creator_id {
        load_user(contact_data, outbound, service_role_key, user_id, &appeal).await
    } else {
        json!({
            "avatarUrl": Value::Null,
            "displayName": Value::Null,
            "email": opt(&appeal, "user_email"),
            "handle": Value::Null,
            "id": opt(&appeal, "creator_id"),
        })
    };

    let active_block_id = if let Some(ref ip) = client_ip {
        find_active_block(contact_data, outbound, service_role_key, ip).await
    } else {
        None
    };

    let membership_type = match (&workspace_id, &creator_id) {
        (Some(ws), Some(user)) => {
            find_membership(contact_data, outbound, service_role_key, ws, user).await
        }
        _ => None,
    };

    let active = active_block_id.is_some();
    let has_workspace = !workspace.is_null();
    let membership_verified = membership_type.is_some();

    let membership_label = if workspace_id.is_none() {
        "No workspace captured".to_owned()
    } else if membership_verified {
        format!(
            "Requester is a {}",
            membership_type
                .as_ref()
                .and_then(Value::as_str)
                .unwrap_or("member")
        )
    } else {
        "Requester is not verified in this workspace".to_owned()
    };

    let membership_status = if workspace_id.is_none() {
        "not_applicable"
    } else if membership_verified {
        "member"
    } else {
        "not_member"
    };

    let disabled_reason: Value = if !has_workspace {
        Value::String("No workspace was captured with this appeal.".to_owned())
    } else if !membership_verified {
        Value::String("Requester is not verified as a member of this workspace.".to_owned())
    } else {
        Value::Null
    };
    let requires_advanced_override = !disabled_reason.is_null();

    let recommended_actions = json!([
        {
            "createWorkspaceRule": true,
            "description": "Clear the IP block and give this workspace 3x limits for 30 days.",
            "disabledReason": disabled_reason.clone(),
            "expiresInDays": 30,
            "key": "trusted_workspace",
            "label": "Approve trusted workspace",
            "recommended": has_workspace && membership_verified,
            "requiresAdvancedOverride": requires_advanced_override,
            "trustMultiplier": 3,
        },
        {
            "createWorkspaceRule": true,
            "description": "Short event/classroom uplift: 5x limits for 7 days.",
            "disabledReason": disabled_reason.clone(),
            "expiresInDays": 7,
            "key": "event_or_classroom",
            "label": "Short event or classroom",
            "recommended": false,
            "requiresAdvancedOverride": requires_advanced_override,
            "trustMultiplier": 5,
        },
        {
            "createWorkspaceRule": true,
            "description": "Extended trusted workspace: 10x limits for 30 days.",
            "disabledReason": disabled_reason,
            "expiresInDays": 30,
            "key": "extended_trusted",
            "label": "Extended trusted workspace",
            "recommended": false,
            "requiresAdvancedOverride": requires_advanced_override,
            "trustMultiplier": 10,
        },
        {
            "createWorkspaceRule": false,
            "description": if active {
                "Clear the active IP block without changing rate limits."
            } else {
                "Close as approved without a workspace uplift."
            },
            "disabledReason": Value::Null,
            "expiresInDays": Value::Null,
            "key": "clear_ip_only",
            "label": "Clear IP only",
            "recommended": active && !membership_verified,
            "requiresAdvancedOverride": false,
            "trustMultiplier": Value::Null,
        },
    ]);

    let review_context = json!({
        "activeBlock": {
            "active": active,
            "blockedIpId": active_block_id.map(Value::String).unwrap_or(Value::Null),
            "label": if active { "Active IP block found" } else { "No active IP block" },
        },
        "membership": {
            "label": membership_label,
            "status": membership_status,
            "type": membership_type.unwrap_or(Value::Null),
            "verified": membership_verified,
        },
        "recommendedActions": recommended_actions,
        "requester": requester,
        "workspace": workspace,
    });

    let mut object = appeal.as_object().cloned().unwrap_or_default();
    object.insert("reviewContext".to_owned(), review_context);
    Value::Object(object)
}

async fn load_workspace(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    service_role_key: &str,
    ws_id: &str,
) -> Value {
    let params = [
        ("select", "id,name,handle,avatar_url,personal".to_owned()),
        ("id", format!("eq.{ws_id}")),
        ("limit", "1".to_owned()),
    ];
    let Some(mut rows) = fetch_rows(
        contact_data,
        outbound,
        service_role_key,
        "workspaces",
        &params,
    )
    .await
    else {
        return Value::Null;
    };
    let Some(row) = rows.first_mut().map(|r| r.take()) else {
        return Value::Null;
    };
    json!({
        "avatarUrl": opt(&row, "avatar_url"),
        "handle": opt(&row, "handle"),
        "id": opt(&row, "id"),
        "name": opt(&row, "name"),
        "personal": opt(&row, "personal"),
    })
}

async fn load_user(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    service_role_key: &str,
    user_id: &str,
    appeal: &Value,
) -> Value {
    let user_params = [
        ("select", "id,display_name,handle,avatar_url".to_owned()),
        ("id", format!("eq.{user_id}")),
        ("limit", "1".to_owned()),
    ];
    let private_params = [
        ("select", "user_id,email,full_name".to_owned()),
        ("user_id", format!("eq.{user_id}")),
        ("limit", "1".to_owned()),
    ];

    let user_row = fetch_rows(
        contact_data,
        outbound,
        service_role_key,
        "users",
        &user_params,
    )
    .await
    .and_then(|mut rows| rows.drain(..).next());

    let private_row = fetch_rows(
        contact_data,
        outbound,
        service_role_key,
        "user_private_details",
        &private_params,
    )
    .await
    .and_then(|mut rows| rows.drain(..).next());

    let display_name = user_row
        .as_ref()
        .and_then(|r| clean_field(r, "display_name"))
        .or_else(|| {
            private_row
                .as_ref()
                .and_then(|r| clean_field(r, "full_name"))
        });
    let email = private_row
        .as_ref()
        .and_then(|r| r.get("email").cloned())
        .unwrap_or_else(|| opt(appeal, "user_email"));

    json!({
        "avatarUrl": user_row.as_ref().map(|r| opt(r, "avatar_url")).unwrap_or(Value::Null),
        "displayName": display_name.map(Value::String).unwrap_or(Value::Null),
        "email": email,
        "handle": user_row.as_ref().map(|r| opt(r, "handle")).unwrap_or(Value::Null),
        "id": user_row.as_ref().map(|r| opt(r, "id")).unwrap_or_else(|| opt(appeal, "creator_id")),
    })
}

async fn find_active_block(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    service_role_key: &str,
    ip: &str,
) -> Option<String> {
    let params = [
        ("select", "id".to_owned()),
        ("ip_address", format!("eq.{ip}")),
        ("status", "eq.active".to_owned()),
        ("order", "blocked_at.desc".to_owned()),
        ("limit", "1".to_owned()),
    ];
    let rows = fetch_rows(
        contact_data,
        outbound,
        service_role_key,
        "blocked_ips",
        &params,
    )
    .await?;
    rows.into_iter()
        .next()
        .and_then(|row| row.get("id").and_then(Value::as_str).map(str::to_owned))
}

async fn find_membership(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    service_role_key: &str,
    ws_id: &str,
    user_id: &str,
) -> Option<Value> {
    let params = [
        ("select", "type".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("user_id", format!("eq.{user_id}")),
        ("limit", "1".to_owned()),
    ];
    let rows = fetch_rows(
        contact_data,
        outbound,
        service_role_key,
        "workspace_members",
        &params,
    )
    .await?;
    rows.into_iter()
        .next()
        .map(|row| row.get("type").cloned().unwrap_or(Value::Null))
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

fn non_empty_str<'a>(value: &'a Value, field: &str) -> Option<&'a str> {
    value
        .get(field)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
}

fn clean_field(value: &Value, field: &str) -> Option<String> {
    value
        .get(field)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}

fn opt(value: &Value, field: &str) -> Value {
    value.get(field).cloned().unwrap_or(Value::Null)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // Path guard

    #[test]
    fn appeal_id_segment_returns_none_for_collection_path() {
        assert!(appeal_id_segment("/api/v1/infrastructure/rate-limit-appeals").is_none());
        assert!(appeal_id_segment("/api/v1/infrastructure/rate-limit-appeals/").is_none());
    }

    #[test]
    fn appeal_id_segment_returns_none_for_deeper_paths() {
        assert!(
            appeal_id_segment("/api/v1/infrastructure/rate-limit-appeals/some-id/extra").is_none()
        );
    }

    #[test]
    fn appeal_id_segment_extracts_segment() {
        assert_eq!(
            appeal_id_segment(
                "/api/v1/infrastructure/rate-limit-appeals/00000000-0000-0000-0000-000000000001"
            ),
            Some("00000000-0000-0000-0000-000000000001")
        );
    }

    // UUID validation

    #[test]
    fn is_valid_uuid_accepts_well_formed_uuids() {
        assert!(is_valid_uuid("00000000-0000-0000-0000-000000000000"));
        assert!(is_valid_uuid("123e4567-e89b-12d3-a456-426614174000"));
        assert!(is_valid_uuid("AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE"));
    }

    #[test]
    fn is_valid_uuid_rejects_malformed_values() {
        assert!(!is_valid_uuid("not-a-uuid"));
        assert!(!is_valid_uuid(""));
        assert!(!is_valid_uuid("00000000-0000-0000-0000-00000000000Z"));
        assert!(!is_valid_uuid("00000000-0000-0000-0000"));
        assert!(!is_valid_uuid("00000000-0000-0000-0000-0000000000001"));
    }

    // opt / non_empty_str

    #[test]
    fn opt_returns_null_for_missing_field() {
        let val = json!({ "a": "b" });
        assert_eq!(opt(&val, "missing"), Value::Null);
        assert_eq!(opt(&val, "a"), Value::String("b".to_owned()));
    }

    #[test]
    fn non_empty_str_filters_empty() {
        let val = json!({ "a": "", "b": "hello" });
        assert!(non_empty_str(&val, "a").is_none());
        assert_eq!(non_empty_str(&val, "b"), Some("hello"));
        assert!(non_empty_str(&val, "missing").is_none());
    }
}
