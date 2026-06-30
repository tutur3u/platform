//! Handler for `GET /api/v1/workspaces/:wsId/settings`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/settings/route.ts` (GET only; the
//! legacy `POST` upsert is intentionally left to the still-live Next.js route).
//!
//! Legacy GET behavior (wrapped by `withSessionAuth`, `cache: { maxAge: 60, swr: 30 }`):
//!   1. Requires an authenticated Supabase session. `withSessionAuth` does NOT
//!      enable app-session or AI-temp auth for this route, so only a Supabase
//!      access token (bearer or auth cookie) is accepted. Missing/invalid
//!      session -> `401 { "error": "Unauthorized" }`.
//!   2. Verifies workspace membership via `verifyWorkspaceMembershipType`
//!      (default `requiredType = 'MEMBER'`) using the CALLER's RLS client:
//!        * lookup error                       -> `500 { "error": "Failed to verify workspace access" }`
//!        * no membership / non-`MEMBER` type  -> `403 { "error": "Workspace access denied" }`
//!          NOTE: the legacy route uses `wsId` verbatim (no `normalizeWorkspaceId`),
//!          so this handler does NOT resolve `personal`/handle aliases either — a
//!          non-UUID `wsId` simply fails the membership lookup and yields `403`.
//!   3. Reads `workspaces.personal` with the CALLER's RLS client (`maybeSingle`).
//!      The legacy route ignores read errors here and treats the workspace as
//!      absent (falsy `personal`), so this handler mirrors that best-effort read.
//!   4. Reads `workspace_settings.*` (`ws_id = wsId`, `maybeSingle`) with the
//!      admin (service-role) client, bypassing RLS. Read error ->
//!      `500 { "error": "Failed to fetch workspace settings" }`.
//!   5. Success (`200`):
//!        * personal workspace -> `{ ...settings, missed_entry_date_threshold: null }`
//!          (when `settings` is null this collapses to
//!          `{ "missed_entry_date_threshold": null }`, matching JS `{...null}`).
//!        * otherwise          -> the bare `settings` row (JSON `null` when absent).
//!          Successful `2xx` GET responses carry
//!          `Cache-Control: private, max-age=60, stale-while-revalidate=30`.
//!
//! BEHAVIOR GAPS vs legacy:
//!   * Rate limiting, IP-block checks, user-suspension checks, and adaptive
//!     step-up challenges from `withSessionAuth` are not reproduced here; the
//!     worker relies on its own edge protections. The authenticated read path is
//!     otherwise faithful.
//!   * Non-2xx responses carry no `Cache-Control` header, matching the legacy
//!     route (the cache header is applied only to successful GETs).

use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const SETTINGS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const SETTINGS_PATH_SUFFIX: &str = "/settings";
const MEMBER_MEMBERSHIP_TYPE: &str = "MEMBER";
const MISSED_ENTRY_DATE_THRESHOLD_KEY: &str = "missed_entry_date_threshold";
const WORKSPACE_SETTINGS_CACHE_CONTROL: &str = "private, max-age=60, stale-while-revalidate=30";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const WORKSPACE_ACCESS_DENIED_MESSAGE: &str = "Workspace access denied";
const SETTINGS_FETCH_FAILED_MESSAGE: &str = "Failed to fetch workspace settings";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

pub(crate) async fn handle_workspaces_wsid_settings_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = settings_ws_id(request.path)?;

    Some(match request.method {
        "GET" => settings_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn settings_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return error_response(500, INTERNAL_SERVER_ERROR_MESSAGE);
    }

    // 1. Authenticate the Supabase session (bearer or auth cookie; app-session
    //    tokens are ignored to mirror `withSessionAuth` without `allowAppSessionAuth`).
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) = user.id.filter(|id| !id.trim().is_empty()) else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };

    // 2. Verify workspace membership with the caller's RLS client.
    match fetch_membership_type(contact_data, outbound, raw_ws_id, &user_id, &access_token).await {
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
        Ok(membership_type) => {
            if membership_type.as_deref() != Some(MEMBER_MEMBERSHIP_TYPE) {
                return error_response(403, WORKSPACE_ACCESS_DENIED_MESSAGE);
            }
        }
    }

    // 3. Read `workspaces.personal` with the caller's RLS client (best-effort:
    //    the legacy route ignores errors here and treats them as falsy).
    let personal = fetch_workspace_personal(contact_data, outbound, raw_ws_id, &access_token).await;

    // 4. Read `workspace_settings.*` with the admin (service-role) client.
    let settings = match fetch_workspace_settings(contact_data, outbound, raw_ws_id).await {
        Ok(settings) => settings,
        Err(()) => return error_response(500, SETTINGS_FETCH_FAILED_MESSAGE),
    };

    // 5. Shape and return the success body.
    let mut response = json_response(200, build_settings_body(settings, personal));
    response.cache_control = Some(WORKSPACE_SETTINGS_CACHE_CONTROL);
    response
}

async fn fetch_membership_type(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_members",
            &[
                ("select", "type".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("user_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {access_token}");

    let response = send_rest_get(outbound, &url, &bearer, service_role_key).await?;
    if !is_success_status(response.status) {
        return Err(());
    }

    let body = response.json::<Value>().map_err(|_| ())?;
    Ok(extract_membership_type(&body).map(str::to_owned))
}

async fn fetch_workspace_personal(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    access_token: &str,
) -> bool {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "personal".to_owned()),
            ("id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return false;
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return false;
    };
    let bearer = format!("Bearer {access_token}");

    let Ok(response) = send_rest_get(outbound, &url, &bearer, service_role_key).await else {
        return false;
    };
    if !is_success_status(response.status) {
        return false;
    }

    response
        .json::<Value>()
        .ok()
        .as_ref()
        .map(extract_personal_flag)
        .unwrap_or(false)
}

async fn fetch_workspace_settings(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Option<Value>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_settings",
            &[
                ("select", "*".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    // Legacy reads with the admin (service-role) client, bypassing RLS.
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let response = send_rest_get(outbound, &url, &bearer, service_role_key).await?;
    if !is_success_status(response.status) {
        return Err(());
    }

    let body = response.json::<Value>().map_err(|_| ())?;
    Ok(first_row(body))
}

async fn send_rest_get(
    outbound: &impl OutboundHttpClient,
    url: &str,
    bearer: &str,
    service_role_key: &str,
) -> Result<OutboundResponse, ()> {
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

// --- Pure helpers ---

fn settings_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(SETTINGS_PATH_PREFIX)?
        .strip_suffix(SETTINGS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

/// Extract the membership `type` of the first row in a PostgREST response body.
fn extract_membership_type(body: &Value) -> Option<&str> {
    first_row_ref(body)?.get("type").and_then(Value::as_str)
}

/// Read the boolean `personal` flag from the first workspace row (falsy when
/// absent/non-boolean), mirroring the legacy `workspace?.personal` truthiness.
fn extract_personal_flag(body: &Value) -> bool {
    first_row_ref(body)
        .and_then(|row| row.get("personal"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

/// Take the first row of a PostgREST array body (PostgREST always returns an
/// array; `maybeSingle` in the legacy route collapses it to the first element).
fn first_row(body: Value) -> Option<Value> {
    match body {
        Value::Array(rows) => rows.into_iter().next(),
        Value::Null => None,
        other => Some(other),
    }
}

fn first_row_ref(body: &Value) -> Option<&Value> {
    match body {
        Value::Array(rows) => rows.first(),
        Value::Null => None,
        other => Some(other),
    }
}

/// Build the success body, mirroring the legacy response shaping:
///   * personal workspace -> spread `settings` then force
///     `missed_entry_date_threshold = null` (JS `{ ...settings, ... }`); when
///     `settings` is null this yields `{ "missed_entry_date_threshold": null }`.
///   * otherwise          -> the bare `settings` value (JSON `null` when absent).
fn build_settings_body(settings: Option<Value>, personal: bool) -> Value {
    if personal {
        let mut map = match settings {
            Some(Value::Object(map)) => map,
            _ => Map::new(),
        };
        map.insert(MISSED_ENTRY_DATE_THRESHOLD_KEY.to_owned(), Value::Null);
        Value::Object(map)
    } else {
        settings.unwrap_or(Value::Null)
    }
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    // Legacy error responses carry no `Cache-Control` header (the cache directive
    // is applied only to successful GETs), so leave `cache_control` unset.
    json_response(status, json!({ "error": message }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_ws_id_from_matching_path() {
        assert_eq!(
            settings_ws_id("/api/v1/workspaces/abc/settings"),
            Some("abc")
        );
        assert_eq!(
            settings_ws_id("/api/v1/workspaces/11111111-1111-4111-8111-111111111111/settings"),
            Some("11111111-1111-4111-8111-111111111111")
        );
    }

    #[test]
    fn rejects_non_matching_paths() {
        // Wrong version prefix.
        assert_eq!(settings_ws_id("/api/workspaces/abc/settings"), None);
        // Sub-routes under /settings must not match this handler.
        assert_eq!(
            settings_ws_id("/api/v1/workspaces/abc/settings/email-audit"),
            None
        );
        assert_eq!(
            settings_ws_id("/api/v1/workspaces/abc/settings/permissions"),
            None
        );
        // Empty workspace id.
        assert_eq!(settings_ws_id("/api/v1/workspaces//settings"), None);
        // Extra path segments before /settings.
        assert_eq!(
            settings_ws_id("/api/v1/workspaces/abc/extra/settings"),
            None
        );
        // Missing suffix.
        assert_eq!(settings_ws_id("/api/v1/workspaces/abc"), None);
    }

    #[test]
    fn extracts_membership_type_from_first_row() {
        assert_eq!(
            extract_membership_type(&json!([{ "type": "MEMBER" }])),
            Some("MEMBER")
        );
        assert_eq!(
            extract_membership_type(&json!([{ "type": "GUEST" }, { "type": "MEMBER" }])),
            Some("GUEST")
        );
        assert_eq!(extract_membership_type(&json!([])), None);
        assert_eq!(extract_membership_type(&json!([{ "type": null }])), None);
        assert_eq!(extract_membership_type(&Value::Null), None);
    }

    #[test]
    fn extracts_personal_flag() {
        assert!(extract_personal_flag(&json!([{ "personal": true }])));
        assert!(!extract_personal_flag(&json!([{ "personal": false }])));
        assert!(!extract_personal_flag(&json!([{ "personal": null }])));
        assert!(!extract_personal_flag(&json!([])));
        assert!(!extract_personal_flag(&json!([{}])));
    }

    #[test]
    fn first_row_collapses_array_body() {
        assert_eq!(first_row(json!([{ "a": 1 }])), Some(json!({ "a": 1 })));
        assert_eq!(first_row(json!([])), None);
        assert_eq!(first_row(Value::Null), None);
    }

    #[test]
    fn builds_settings_body_for_non_personal_workspace() {
        let settings = json!({ "ws_id": "abc", "missed_entry_date_threshold": "2024-01-01" });
        assert_eq!(build_settings_body(Some(settings.clone()), false), settings);
        // Absent settings serialize as JSON null.
        assert_eq!(build_settings_body(None, false), Value::Null);
    }

    #[test]
    fn builds_settings_body_for_personal_workspace_overrides_threshold() {
        let settings = json!({ "ws_id": "abc", "missed_entry_date_threshold": "2024-01-01" });
        assert_eq!(
            build_settings_body(Some(settings), true),
            json!({ "ws_id": "abc", "missed_entry_date_threshold": null })
        );
    }

    #[test]
    fn builds_settings_body_for_personal_workspace_with_null_settings() {
        // Mirrors JS `{ ...null, missed_entry_date_threshold: null }`.
        assert_eq!(
            build_settings_body(None, true),
            json!({ "missed_entry_date_threshold": null })
        );
    }
}
