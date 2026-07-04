//! Handler for `GET /api/v1/workspaces/:wsId/workforce/users/:userId`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/workforce/users/[userId]/route.ts`.
//!
//! Behavior (GET only):
//!
//!   * Auth via session token; `401` on failure.
//!   * Workspace not found -> `404 { "error": "Not found" }`.
//!   * Access requires `view_workforce` OR `manage_workforce` OR the caller's
//!     platform user is linked to the requested `userId` in the workspace.
//!   * Missing access -> `403 { "error": "Forbidden" }`.
//!   * On success returns `200` with the `workspace_users` row spread and
//!     augmented with `platform_user`, `current_contract`, `contracts_count`.
//!
//! NOTES / behavior gaps:
//!
//!   * PATCH and DELETE are NOT ported; this handler returns `None` for
//!     non-GET methods so the worker falls through to Next.js.
//!   * When the caller qualifies only via the linked-user path, data fetches
//!     use the raw workspace-ID segment rather than the PostgREST-resolved
//!     UUID. This is equivalent for UUID workspace IDs (the common case);
//!     for handle-slug or `personal` IDs the linked-user check may not match
//!     when the database stores the resolved UUID.
//!   * `current_contract` uses UTC date strings (YYYY-MM-DD). The legacy
//!     JavaScript uses local time; behaviour may differ in non-UTC timezones.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_MID: &str = "/workforce/users/";
const VIEW_WORKFORCE: &str = "view_workforce";
const MANAGE_WORKFORCE: &str = "manage_workforce";

pub(crate) async fn handle_workspaces_wsid_workforce_users_userid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, raw_user_id) = extract_path_ids(request.path)?;

    Some(match request.method {
        "GET" => workforce_user_get(config, request, raw_ws_id, raw_user_id, outbound).await,
        _ => return None,
    })
}

async fn workforce_user_get(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    raw_user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let cd = &config.contact_data;
    if !cd.configured() {
        return err_resp(500, "Internal server error");
    }

    let ws_id = match resolve_access(cd, request, raw_ws_id, raw_user_id, outbound).await {
        Ok(id) => id,
        Err(r) => return r,
    };

    let workspace_user = match fetch_workspace_user(cd, outbound, &ws_id, raw_user_id).await {
        Ok(Some(u)) => u,
        Ok(None) => return err_resp(404, "User not found"),
        Err(()) => return err_resp(500, "Failed to fetch user"),
    };

    let empty: Vec<Value> = Vec::new();
    let contracts = workspace_user
        .get("workforce_contracts")
        .and_then(Value::as_array)
        .unwrap_or(&empty);
    let contracts_count = contracts.len();
    let today = today_utc();
    let current_contract = contracts
        .iter()
        .find(|c| contract_active(c, &today))
        .cloned();
    let platform_user = fetch_platform_user(cd, outbound, &ws_id, raw_user_id).await;

    let mut obj = match workspace_user {
        Value::Object(m) => m,
        _ => return err_resp(500, "Internal server error"),
    };
    obj.insert("platform_user".to_owned(), json!(platform_user));
    obj.insert("current_contract".to_owned(), json!(current_contract));
    obj.insert("contracts_count".to_owned(), json!(contracts_count));
    no_store_response(json_response(200, Value::Object(obj)))
}

/// Resolves the `view_workforce` / `manage_workforce` / linked-user gate,
/// returning the normalized workspace ID on success.
async fn resolve_access(
    cd: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    raw_user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<String, BackendResponse> {
    // Try view_workforce.
    match authorize_workspace_permission(cd, request, raw_ws_id, VIEW_WORKFORCE, outbound).await {
        Ok(a) => return Ok(a.ws_id),
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {}
        Err(e) => return Err(map_auth_err(e)),
    }

    // Try manage_workforce.
    match authorize_workspace_permission(cd, request, raw_ws_id, MANAGE_WORKFORCE, outbound).await {
        Ok(a) => return Ok(a.ws_id),
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {}
        Err(e) => return Err(map_auth_err(e)),
    }

    // Check linked-user fallback.
    let Some(token) = supabase_auth::request_access_token(request) else {
        return Err(err_resp(401, "Unauthorized"));
    };
    let Some(user) = supabase_auth::fetch_supabase_auth_user(cd, &token, outbound).await else {
        return Err(err_resp(401, "Unauthorized"));
    };
    let Some(caller_id) = user.id.filter(|id| !id.trim().is_empty()) else {
        return Err(err_resp(401, "Unauthorized"));
    };

    if is_linked_user(cd, outbound, raw_ws_id, &caller_id, raw_user_id).await {
        Ok(raw_ws_id.to_owned())
    } else {
        Err(err_resp(403, "Forbidden"))
    }
}

fn map_auth_err(e: WorkspacePermissionAuthorizationError) -> BackendResponse {
    match e {
        WorkspacePermissionAuthorizationError::Unauthorized => err_resp(401, "Unauthorized"),
        WorkspacePermissionAuthorizationError::NotFound => err_resp(404, "Not found"),
        WorkspacePermissionAuthorizationError::Forbidden => err_resp(403, "Forbidden"),
        WorkspacePermissionAuthorizationError::Internal => err_resp(500, "Internal server error"),
    }
}

/// Returns `true` when `caller_id` is linked to `virtual_user_id` in `ws_id`.
async fn is_linked_user(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    caller_id: &str,
    virtual_user_id: &str,
) -> bool {
    let Some(url) = cd.rest_url(
        "workspace_user_linked_users",
        &[
            ("select", "virtual_user_id".to_owned()),
            ("platform_user_id", format!("eq.{caller_id}")),
            ("virtual_user_id", format!("eq.{virtual_user_id}")),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return false;
    };
    let Some(key) = cd.service_role_key() else {
        return false;
    };
    let bearer = format!("Bearer {key}");
    let Ok(r) = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", key),
        )
        .await
    else {
        return false;
    };
    if !(200..300).contains(&r.status) {
        return false;
    }
    r.json::<Vec<Value>>()
        .map(|v| !v.is_empty())
        .unwrap_or(false)
}

/// Fetches the `workspace_users` row with embedded contract/compensation/benefit data.
async fn fetch_workspace_user(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Option<Value>, ()> {
    let url = cd
        .rest_url(
            "workspace_users",
            &[
                (
                    "select",
                    "*,workforce_contracts(*,workforce_compensation(*),workforce_benefits(*))"
                        .to_owned(),
                ),
                ("id", format!("eq.{user_id}")),
                ("ws_id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let key = cd.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {key}");
    let r = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", key),
        )
        .await
        .map_err(|_| ())?;
    if !(200..300).contains(&r.status) {
        return Err(());
    }
    Ok(r.json::<Vec<Value>>().map_err(|_| ())?.into_iter().next())
}

#[derive(Deserialize)]
struct LinkedUserRow {
    platform_user_id: Option<String>,
}

/// Fetches the linked platform `users` profile for `virtual_user_id`, if any.
async fn fetch_platform_user(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    virtual_user_id: &str,
) -> Option<Value> {
    let url = cd.rest_url(
        "workspace_user_linked_users",
        &[
            ("select", "platform_user_id".to_owned()),
            ("virtual_user_id", format!("eq.{virtual_user_id}")),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    )?;
    let key = cd.service_role_key()?;
    let bearer = format!("Bearer {key}");
    let r = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", key),
        )
        .await
        .ok()?;
    if !(200..300).contains(&r.status) {
        return None;
    }
    let platform_user_id = r
        .json::<Vec<LinkedUserRow>>()
        .ok()?
        .into_iter()
        .next()
        .and_then(|row| row.platform_user_id)?;

    // Fetch the user profile.
    let url2 = cd.rest_url(
        "users",
        &[
            ("select", "id,display_name,avatar_url".to_owned()),
            ("id", format!("eq.{platform_user_id}")),
            ("limit", "1".to_owned()),
        ],
    )?;
    let bearer2 = format!("Bearer {key}");
    let r2 = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url2)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer2)
                .with_header("apikey", key),
        )
        .await
        .ok()?;
    if !(200..300).contains(&r2.status) {
        return None;
    }
    r2.json::<Vec<Value>>().ok()?.into_iter().next()
}

/// Extracts `(raw_ws_id, raw_user_id)` from a path that matches
/// `/api/v1/workspaces/:wsId/workforce/users/:userId`.
fn extract_path_ids(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let (ws_id, user_id) = rest.split_once(PATH_MID)?;
    if ws_id.is_empty() || ws_id.contains('/') || user_id.is_empty() || user_id.contains('/') {
        return None;
    }
    Some((ws_id, user_id))
}

/// Returns `true` when the contract is active as of `today` (YYYY-MM-DD).
///
/// Mirrors `!c.end_date || new Date(c.end_date) >= new Date()`:
/// active if `end_date` is absent/null or lexicographically >= `today`.
fn contract_active(contract: &Value, today: &str) -> bool {
    match contract.get("end_date") {
        None | Some(Value::Null) => true,
        Some(Value::String(d)) => d.as_str() >= today,
        _ => false,
    }
}

/// Returns today's date as `YYYY-MM-DD` (UTC).
fn today_utc() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let (y, m, d) = unix_days_to_ymd(secs / 86400);
    format!("{y:04}-{m:02}-{d:02}")
}

/// Converts Unix epoch days to `(year, month, day)`.
fn unix_days_to_ymd(days: u64) -> (u32, u32, u32) {
    let mut rem = days as u32;
    let mut yr = 1970u32;
    loop {
        let n = if is_leap(yr) { 366u32 } else { 365u32 };
        if rem < n {
            break;
        }
        rem -= n;
        yr += 1;
    }
    let ml: [u32; 12] = if is_leap(yr) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut mo = 1u32;
    for &n in &ml {
        if rem < n {
            break;
        }
        rem -= n;
        mo += 1;
    }
    (yr, mo, rem + 1)
}

fn is_leap(y: u32) -> bool {
    (y.is_multiple_of(4) && !y.is_multiple_of(100)) || y.is_multiple_of(400)
}

fn err_resp(status: u16, error: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": error })))
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── path extraction ────────────────────────────────────────────────────

    #[test]
    fn path_ids_matches_uuid_path() {
        let ws = "11111111-1111-4111-8111-111111111111";
        let uid = "22222222-2222-4222-8222-222222222222";
        assert_eq!(
            extract_path_ids(&format!("/api/v1/workspaces/{ws}/workforce/users/{uid}")),
            Some((ws, uid))
        );
    }

    #[test]
    fn path_ids_rejects_bad_paths() {
        // wrong middle segment
        assert_eq!(
            extract_path_ids("/api/v1/workspaces/w/workforce/members/u"),
            None
        );
        // missing v1
        assert_eq!(
            extract_path_ids("/api/workspaces/w/workforce/users/u"),
            None
        );
        // empty ws_id
        assert_eq!(
            extract_path_ids("/api/v1/workspaces//workforce/users/u"),
            None
        );
        // empty user_id
        assert_eq!(
            extract_path_ids("/api/v1/workspaces/w/workforce/users/"),
            None
        );
        // extra segment
        assert_eq!(
            extract_path_ids("/api/v1/workspaces/w/workforce/users/u/x"),
            None
        );
    }

    // ── contract activity ──────────────────────────────────────────────────

    #[test]
    fn contract_active_no_end_date() {
        assert!(contract_active(&json!({}), "2024-06-01"));
        assert!(contract_active(&json!({"end_date": null}), "2024-06-01"));
    }

    #[test]
    fn contract_active_future_date() {
        assert!(contract_active(
            &json!({"end_date": "2099-12-31"}),
            "2024-06-01"
        ));
    }

    #[test]
    fn contract_active_same_day() {
        assert!(contract_active(
            &json!({"end_date": "2024-06-01"}),
            "2024-06-01"
        ));
    }

    #[test]
    fn contract_active_past_date() {
        assert!(!contract_active(
            &json!({"end_date": "2023-12-31"}),
            "2024-06-01"
        ));
    }

    // ── date arithmetic ────────────────────────────────────────────────────

    #[test]
    fn ymd_epoch() {
        assert_eq!(unix_days_to_ymd(0), (1970, 1, 1));
    }

    #[test]
    fn ymd_leap_year_start() {
        // 365 + 365 = 730 days after epoch => 1972-01-01
        assert_eq!(unix_days_to_ymd(730), (1972, 1, 1));
    }

    #[test]
    fn leap_checks() {
        assert!(is_leap(2000));
        assert!(is_leap(2024));
        assert!(!is_leap(1900));
        assert!(!is_leap(2023));
    }
}
