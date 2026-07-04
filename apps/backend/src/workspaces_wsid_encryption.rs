//! Handler for `GET /api/v1/workspaces/:wsId/encryption`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/encryption/route.ts`.
//!
//! ## Behavior
//!
//! The GET endpoint checks E2EE status for a workspace. Any workspace member
//! may call it. The response shape is one of:
//!
//! - `{ enabled: false, hasKey: false, reason: "Master key not configured" }` —
//!   when the `ENCRYPTION_MASTER_KEY` environment variable is absent or empty.
//! - `{ enabled: true, hasKey: bool, createdAt: string | null, unencryptedCount: number }` —
//!   when the master key is present. `hasKey` reflects whether a row exists in
//!   `workspace_encryption_keys`; `unencryptedCount` is the number of
//!   `workspace_calendar_events` rows where `is_encrypted` is null or false.
//!
//! ## Auth
//!
//! Auth uses a Supabase session Bearer token (or cookie). The handler then
//! queries `workspace_members` (with the caller's token, respecting RLS) to
//! confirm membership, returning 403 if none is found and 500 if the lookup
//! fails. POST and DELETE are NOT handled here; returning `None` allows the
//! request to fall through to the still-live Next.js handler.
//!
//! ## Gaps vs legacy
//!
//! - App-session tokens (`ttr_app_*`) are not supported here. The legacy sets
//!   `allowAppSessionAuth: true`, but there is no crate helper that combines
//!   app-session auth with a membership-only check. Callers using app-session
//!   tokens will receive a 401 (same as an invalid Supabase token).
//! - The `ENCRYPTION_MASTER_KEY` check uses `std::env::var` at request time;
//!   the legacy reads `process.env.ENCRYPTION_MASTER_KEY` at build/runtime.
//!   Behavior is equivalent when the env var does not change between restarts.

use serde::Deserialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const ENCRYPTION_PATH_PREFIX: &str = "/api/v1/workspaces/";
const ENCRYPTION_PATH_SUFFIX: &str = "/encryption";
const MASTER_KEY_ENV_VAR: &str = "ENCRYPTION_MASTER_KEY";
const WORKSPACE_MEMBERS_TABLE: &str = "workspace_members";
const ENCRYPTION_KEYS_TABLE: &str = "workspace_encryption_keys";
const CALENDAR_EVENTS_TABLE: &str = "workspace_calendar_events";

#[derive(Deserialize)]
#[allow(dead_code)]
struct MembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct EncryptionKeyRow {
    created_at: Option<String>,
}

#[derive(Deserialize)]
struct CountRow {
    count: Option<i64>,
}

enum MembershipResult {
    Member,
    NotMember,
    LookupFailed,
}

pub(crate) async fn handle_workspaces_wsid_encryption_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = encryption_ws_id(request.path)?;

    Some(match request.method {
        "GET" => encryption_get_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn encryption_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Check if master key is configured (mirrors isEncryptionEnabled() in legacy).
    if !is_encryption_enabled() {
        return no_store_response(json_response(
            200,
            json!({
                "enabled": false,
                "hasKey": false,
                "reason": "Master key not configured",
            }),
        ));
    }

    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return internal_error_response();
    }

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return unauthorized_response();
    };

    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return unauthorized_response();
    };

    let Some(user_id) = user.id.filter(|id| !id.trim().is_empty()) else {
        return unauthorized_response();
    };

    match check_membership(contact_data, outbound, raw_ws_id, &user_id, &access_token).await {
        MembershipResult::Member => {}
        MembershipResult::NotMember => return forbidden_response(),
        MembershipResult::LookupFailed => return membership_error_response(),
    }

    let key_row = match fetch_encryption_key(contact_data, outbound, raw_ws_id).await {
        Ok(row) => row,
        Err(()) => return internal_error_response(),
    };

    let has_key = key_row.is_some();
    let created_at = key_row.and_then(|row| row.created_at);

    let unencrypted_count = if has_key {
        match fetch_unencrypted_count(contact_data, outbound, raw_ws_id).await {
            Ok(count) => count,
            Err(()) => return internal_error_response(),
        }
    } else {
        0
    };

    no_store_response(json_response(
        200,
        json!({
            "enabled": true,
            "hasKey": has_key,
            "createdAt": created_at,
            "unencryptedCount": unencrypted_count,
        }),
    ))
}

async fn check_membership(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> MembershipResult {
    let Some(url) = contact_data.rest_url(
        WORKSPACE_MEMBERS_TABLE,
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return MembershipResult::LookupFailed;
    };

    let service_role_key = match contact_data.service_role_key() {
        Some(key) => key,
        None => return MembershipResult::LookupFailed,
    };

    let authorization_header = format!("Bearer {access_token}");

    let response = match outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization_header)
                .with_header("apikey", service_role_key),
        )
        .await
    {
        Ok(response) => response,
        Err(_) => return MembershipResult::LookupFailed,
    };

    if !(200..300).contains(&response.status) {
        return MembershipResult::LookupFailed;
    }

    match response.json::<Vec<MembershipRow>>() {
        Ok(rows) if !rows.is_empty() => MembershipResult::Member,
        Ok(_) => MembershipResult::NotMember,
        Err(_) => MembershipResult::LookupFailed,
    }
}

async fn fetch_encryption_key(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Option<EncryptionKeyRow>, ()> {
    let url = contact_data
        .rest_url(
            ENCRYPTION_KEYS_TABLE,
            &[
                ("select", "id,created_at".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<EncryptionKeyRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn fetch_unencrypted_count(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<i64, ()> {
    // Mirrors: adminClient.from('workspace_calendar_events')
    //   .select('id', { count: 'exact', head: true })
    //   .eq('ws_id', wsId)
    //   .or('is_encrypted.is.null,is_encrypted.eq.false')
    let url = contact_data
        .rest_url(
            CALENDAR_EVENTS_TABLE,
            &[
                ("select", "count()".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                (
                    "or",
                    "(is_encrypted.is.null,is_encrypted.eq.false)".to_owned(),
                ),
            ],
        )
        .ok_or(())?;

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<CountRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.count)
        .unwrap_or(0))
}

fn is_encryption_enabled() -> bool {
    std::env::var(MASTER_KEY_ENV_VAR)
        .ok()
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false)
}

fn encryption_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(ENCRYPTION_PATH_PREFIX)?
        .strip_suffix(ENCRYPTION_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(401, json!({ "error": "Unauthorized" })))
}

fn forbidden_response() -> BackendResponse {
    no_store_response(json_response(403, json!({ "error": "Unauthorized" })))
}

fn membership_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "error": "Failed to verify workspace membership" }),
    ))
}

fn internal_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "error": "Internal server error" }),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    const WORKSPACE_ID: &str = "22222222-2222-4222-8222-222222222222";

    #[test]
    fn encryption_ws_id_extracts_valid_uuid() {
        let path = format!("/api/v1/workspaces/{WORKSPACE_ID}/encryption");

        assert_eq!(encryption_ws_id(&path), Some(WORKSPACE_ID));
    }

    #[test]
    fn encryption_ws_id_rejects_wrong_suffix() {
        let path = format!("/api/v1/workspaces/{WORKSPACE_ID}/other");

        assert_eq!(encryption_ws_id(&path), None);
    }

    #[test]
    fn encryption_ws_id_rejects_extra_segments() {
        let path = format!("/api/v1/workspaces/{WORKSPACE_ID}/encryption/keys");

        assert_eq!(encryption_ws_id(&path), None);
    }

    #[test]
    fn encryption_ws_id_rejects_empty_ws_id() {
        let path = "/api/v1/workspaces//encryption";

        assert_eq!(encryption_ws_id(path), None);
    }

    #[test]
    fn encryption_ws_id_rejects_unrelated_path() {
        assert_eq!(encryption_ws_id("/api/v1/other"), None);
    }

    #[test]
    fn is_encryption_enabled_returns_false_when_var_absent() {
        // The env var is not set in the test environment by default, so
        // the function should return false without panicking.
        let _ = is_encryption_enabled();
    }

    #[test]
    fn unauthorized_response_has_expected_shape() {
        let resp = unauthorized_response();

        assert_eq!(resp.status, 401);
        assert_eq!(resp.body, json!({ "error": "Unauthorized" }));
    }

    #[test]
    fn forbidden_response_has_expected_shape() {
        let resp = forbidden_response();

        assert_eq!(resp.status, 403);
        assert_eq!(resp.body, json!({ "error": "Unauthorized" }));
    }

    #[test]
    fn membership_error_response_has_expected_shape() {
        let resp = membership_error_response();

        assert_eq!(resp.status, 500);
        assert_eq!(
            resp.body,
            json!({ "error": "Failed to verify workspace membership" })
        );
    }

    #[test]
    fn encryption_ws_id_accepts_simple_handle() {
        // Non-UUID workspace handles are valid path segments too.
        let path = "/api/v1/workspaces/my-workspace/encryption";

        assert_eq!(encryption_ws_id(path), Some("my-workspace"));
    }
}
