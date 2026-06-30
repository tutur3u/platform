//! Port of the legacy `GET /api/v1/users/me/workspaces/:wsId/configs/:configId`
//! route (`apps/web/src/app/api/v1/users/me/workspaces/[wsId]/configs/[configId]/route.ts`).
//!
//! **Auth model**: pure Supabase session (Bearer access token or auth cookie).
//! No app-session or finance/CLI token is accepted (the legacy handler uses
//! `resolveAuthenticatedSessionUser` without `allowAppSessionAuth`).
//!
//! **GET behavior reproduced exactly**:
//!
//!   1. Resolve the authenticated user (access token -> `/auth/v1/user`).
//!   2. Normalize the workspace id (handle `personal`, `internal`, UUID, and
//!      handle aliases — mirrors `normalizeWorkspaceId` in the legacy helper).
//!   3. Verify workspace membership (`workspace_members` lookup). A Supabase
//!      error on this lookup returns `500`; absent membership returns `403`.
//!   4. Read `user_workspace_configs.value` filtered by `user_id`, `ws_id`, and
//!      `id`. A Supabase error returns `500`; absent row returns
//!      `{ "value": null }`.
//!
//! **Status codes / response shapes**:
//!
//!   * missing or invalid session          -> `401 { "message": "Unauthorized" }`
//!   * membership lookup failed            -> `500 { "message": "Failed to verify workspace access" }`
//!   * user not a member                   -> `403 { "message": "Workspace access denied" }`
//!   * config read error / misconfig       -> `500 { "message": "Error fetching user workspace config" }`
//!   * success                             -> `200 { "value": <json-or-null> }`
//!
//! **Cache**: the legacy route sets no explicit cache header, so all responses
//! are wrapped with `no_store_response`.
//!
//! **GET only**: every non-GET method returns `None` so the still-live Next.js
//! route continues to serve `PUT`.
//!
//! **NOTE (behavior gap)**: workspace-id alias resolution here uses service-role
//! reads (bypassing RLS) and only checks for a membership row; the legacy
//! `verifyWorkspaceMembershipType` also checks the member `type` field when
//! deciding `ok`. In practice the `ok` field is `true` for any present
//! membership row regardless of type, so the effective membership gate is
//! identical.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// ---------------------------------------------------------------------------
// Path constants
// ---------------------------------------------------------------------------

const PATH_PREFIX: &str = "/api/v1/users/me/workspaces/";
const CONFIGS_SEGMENT: &str = "/configs/";

// ---------------------------------------------------------------------------
// Workspace-id normalization constants (mirrors legacy normalizeWorkspaceId)
// ---------------------------------------------------------------------------

const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";

// ---------------------------------------------------------------------------
// Response message constants (must match legacy exactly)
// ---------------------------------------------------------------------------

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const MEMBERSHIP_DENIED_MESSAGE: &str = "Workspace access denied";
const FETCH_ERROR_MESSAGE: &str = "Error fetching user workspace config";

// ---------------------------------------------------------------------------
// Deserialize helpers
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct ConfigValueRow {
    value: Option<Value>,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_users_me_workspaces_wsid_configs_configid_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (raw_ws_id, config_id) = extract_route_parts(request.path)?;

    if !config.contact_data.configured() {
        return None;
    }

    Some(match request.method {
        "GET" => get_response(config, request, raw_ws_id, config_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    config_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // 1. Authenticate via Supabase session (access token).
    let access_token = match supabase_auth::request_access_token(request) {
        Some(token) => token,
        None => return message_response(401, UNAUTHORIZED_MESSAGE),
    };
    let user = match supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
        .await
    {
        Some(u) => u,
        None => return message_response(401, UNAUTHORIZED_MESSAGE),
    };
    let user_id = match user.id.as_deref().filter(|id| !id.trim().is_empty()) {
        Some(id) => id.to_owned(),
        None => return message_response(401, UNAUTHORIZED_MESSAGE),
    };

    // 2. Normalize workspace id (mirrors legacy normalizeWorkspaceId).
    let ws_id = match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id).await {
        Ok(Some(id)) => id,
        Ok(None) => return message_response(401, UNAUTHORIZED_MESSAGE),
        Err(()) => return message_response(401, UNAUTHORIZED_MESSAGE),
    };

    // 3. Verify workspace membership. A DB error here maps to 500;
    //    absent membership maps to 403.
    match verify_membership(contact_data, outbound, &ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(403, MEMBERSHIP_DENIED_MESSAGE),
        Err(()) => return message_response(500, MEMBERSHIP_FAILED_MESSAGE),
    }

    // 4. Read the config value from user_workspace_configs.
    match fetch_config_value(contact_data, outbound, &user_id, &ws_id, config_id).await {
        Ok(value) => no_store_response(json_response(200, json!({ "value": value }))),
        Err(()) => message_response(500, FETCH_ERROR_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

// (Auth is inlined in get_response above via supabase_auth helpers.)

// ---------------------------------------------------------------------------
// Workspace id normalization
// ---------------------------------------------------------------------------

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
) -> Result<Option<String>, ()> {
    let trimmed = raw_ws_id.trim();

    if trimmed.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
    }

    if trimmed.eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG) {
        return personal_workspace_id(contact_data, outbound, user_id).await;
    }

    // If it looks like a UUID literal, use it directly.
    if is_workspace_uuid_literal(trimmed) {
        return Ok(Some(trimmed.to_owned()));
    }

    // Try to look up a workspace by handle.
    if is_workspace_handle(trimmed)
        && let Some(ws_id) =
            workspace_id_by_handle(contact_data, outbound, &trimmed.to_lowercase()).await?
    {
        return Ok(Some(ws_id));
    }

    // Fall back to using the raw value as-is (e.g. direct UUID without dashes
    // check above — treat it as provided).
    Ok(Some(trimmed.to_owned()))
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Option<String>, ()> {
    let url = contact_data
        .rest_url(
            "workspaces",
            &[
                (
                    "select",
                    "id,workspace_members!inner(user_id,type)".to_owned(),
                ),
                ("personal", "eq.true".to_owned()),
                ("workspace_members.user_id", format!("eq.{user_id}")),
                ("workspace_members.type", "eq.MEMBER".to_owned()),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = send_service_role_get(contact_data, outbound, &url).await?;

    if !is_success_status(resp.status) {
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceIdRow>(&resp)?.and_then(|row| row.id))
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
) -> Result<Option<String>, ()> {
    let url = contact_data
        .rest_url(
            "workspaces",
            &[
                ("select", "id".to_owned()),
                ("handle", format!("eq.{handle}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = send_service_role_get(contact_data, outbound, &url).await?;

    if !is_success_status(resp.status) {
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceIdRow>(&resp)?.and_then(|row| row.id))
}

// ---------------------------------------------------------------------------
// Membership check
// ---------------------------------------------------------------------------

/// Returns `Ok(true)` if the user is a member, `Ok(false)` if not,
/// and `Err(())` on a Supabase error (maps to 500).
async fn verify_membership(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            "workspace_members",
            &[
                ("select", "user_id".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("user_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = send_service_role_get(contact_data, outbound, &url).await?;

    if !is_success_status(resp.status) {
        return Err(());
    }

    let rows = resp.json::<Vec<serde_json::Value>>().map_err(|_| ())?;
    Ok(!rows.is_empty())
}

// ---------------------------------------------------------------------------
// Config read
// ---------------------------------------------------------------------------

async fn fetch_config_value(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    ws_id: &str,
    config_id: &str,
) -> Result<Value, ()> {
    let url = contact_data
        .rest_url(
            "user_workspace_configs",
            &[
                ("select", "value".to_owned()),
                ("user_id", format!("eq.{user_id}")),
                ("ws_id", format!("eq.{ws_id}")),
                ("id", format!("eq.{config_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = send_service_role_get(contact_data, outbound, &url).await?;

    if !is_success_status(resp.status) {
        return Err(());
    }

    // Mirror the legacy `data?.value ?? null`: absent row or null value -> null.
    Ok(decode_first_row::<ConfigValueRow>(&resp)?
        .and_then(|row| row.value)
        .unwrap_or(Value::Null))
}

// ---------------------------------------------------------------------------
// Shared HTTP helper
// ---------------------------------------------------------------------------

async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {key}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", key),
        )
        .await
        .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/// Extract `(raw_ws_id, config_id)` from a path that exactly matches
/// `/api/v1/users/me/workspaces/<wsId>/configs/<configId>`.
fn extract_route_parts(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let slash_pos = rest.find('/')?;
    let ws_id = &rest[..slash_pos];
    let after = &rest[slash_pos..];
    let config_id = after.strip_prefix(CONFIGS_SEGMENT)?;

    if ws_id.is_empty() || config_id.is_empty() || config_id.contains('/') {
        return None;
    }
    Some((ws_id, config_id))
}

fn is_workspace_uuid_literal(value: &str) -> bool {
    value.len() == 36
        && value.chars().enumerate().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        })
}

fn is_workspace_handle(value: &str) -> bool {
    let len = value.len();
    if len == 0 || len > 64 {
        return false;
    }
    value.chars().enumerate().all(|(i, c)| {
        let is_edge = i == 0 || i + 1 == len;
        c.is_ascii_lowercase() || c.is_ascii_digit() || (!is_edge && matches!(c, '_' | '-'))
    })
}

fn decode_first_row<T: for<'de> Deserialize<'de>>(
    response: &OutboundResponse,
) -> Result<Option<T>, ()> {
    response
        .json::<Vec<T>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/// All error shapes in the legacy route use the `message` key.
fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_route_parts_matches_exact_path() {
        assert_eq!(
            extract_route_parts(
                "/api/v1/users/me/workspaces/11111111-1111-4111-8111-111111111111/configs/dark_mode"
            ),
            Some(("11111111-1111-4111-8111-111111111111", "dark_mode"))
        );
        assert_eq!(
            extract_route_parts("/api/v1/users/me/workspaces/personal/configs/SIDEBAR_STATE"),
            Some(("personal", "SIDEBAR_STATE"))
        );
    }

    #[test]
    fn extract_route_parts_rejects_invalid_paths() {
        // Collection path — no configId.
        assert_eq!(
            extract_route_parts("/api/v1/users/me/workspaces/abc/configs"),
            None
        );
        // Trailing slash without config id.
        assert_eq!(
            extract_route_parts("/api/v1/users/me/workspaces/abc/configs/"),
            None
        );
        // Nested sub-segment after configId.
        assert_eq!(
            extract_route_parts("/api/v1/users/me/workspaces/abc/configs/dark_mode/extra"),
            None
        );
        // Wrong path segment — settings instead of configs.
        assert_eq!(
            extract_route_parts("/api/v1/users/me/workspaces/abc/settings/dark_mode"),
            None
        );
        // Missing /me/ segment.
        assert_eq!(
            extract_route_parts("/api/v1/users/workspaces/abc/configs/dark_mode"),
            None
        );
        // No version prefix.
        assert_eq!(
            extract_route_parts("/api/users/me/workspaces/abc/configs/dark_mode"),
            None
        );
        // Empty wsId.
        assert_eq!(
            extract_route_parts("/api/v1/users/me/workspaces//configs/dark_mode"),
            None
        );
    }

    #[test]
    fn uuid_literal_detection() {
        assert!(is_workspace_uuid_literal(
            "11111111-1111-4111-8111-111111111111"
        ));
        assert!(is_workspace_uuid_literal(
            "00000000-0000-0000-0000-000000000000"
        ));
        assert!(!is_workspace_uuid_literal("not-a-uuid"));
        assert!(!is_workspace_uuid_literal("personal"));
        // 32 hex chars without dashes — not the canonical form.
        assert!(!is_workspace_uuid_literal("111111111111411181111111111111"));
    }

    #[test]
    fn workspace_handle_detection() {
        assert!(is_workspace_handle("acme"));
        assert!(is_workspace_handle("my-workspace"));
        assert!(is_workspace_handle("my_workspace"));
        assert!(is_workspace_handle("acme123"));
        // Edges cannot be dashes or underscores.
        assert!(!is_workspace_handle("-acme"));
        assert!(!is_workspace_handle("acme-"));
        assert!(!is_workspace_handle("_acme"));
        // Empty or too long.
        assert!(!is_workspace_handle(""));
        assert!(!is_workspace_handle(&"a".repeat(65)));
        // Uppercase not allowed.
        assert!(!is_workspace_handle("Acme"));
    }

    #[test]
    fn message_response_uses_message_key() {
        let resp = message_response(401, UNAUTHORIZED_MESSAGE);
        assert_eq!(resp.status, 401);
        assert_eq!(
            resp.body,
            serde_json::json!({ "message": UNAUTHORIZED_MESSAGE })
        );

        let resp_403 = message_response(403, MEMBERSHIP_DENIED_MESSAGE);
        assert_eq!(resp_403.status, 403);
        assert_eq!(
            resp_403.body,
            serde_json::json!({ "message": MEMBERSHIP_DENIED_MESSAGE })
        );
    }
}
