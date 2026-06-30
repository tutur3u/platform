//! Handler for `GET /api/v1/workspaces/:wsId/task-progress/leaderboards/:leaderboardId/members`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/task-progress/leaderboards/[leaderboardId]/members/route.ts`
//! (and its shared `_utils.ts` helper). Only the `GET` method is migrated;
//! `POST` (member creation) falls through to the still-live Next.js route by
//! returning `None`.
//!
//! Auth model (legacy `resolveTaskProgressRouteAuth`): authenticate the Supabase
//! session user, normalize the workspace id (`personal` slug / handle / UUID /
//! `internal`), then require **workspace membership of type `MEMBER`** — there is
//! no specific workspace permission gate. This port reproduces that
//! membership-only check directly (token -> user -> `workspace_members` lookup),
//! mirroring the sibling `workspaces_wsid_task_progress_goals` handler.
//!
//! Legacy status codes preserved (mirror of `taskProgressErrorResponse`):
//!
//! - no authenticated user                  -> `401 { "error": "Unauthorized" }`
//! - member lookup transport/query failure   -> `500 { "error": "Failed to verify workspace membership" }`
//! - not a `MEMBER` of the workspace         -> `403 { "error": "Workspace access denied" }`
//! - leaderboard not found / archived        -> `404 { "error": "Leaderboard not found" }`
//! - task-progress schema missing            -> `200 { ok:false, code:"schema_unavailable", schemaAvailable:false, message:..., members:[] }`
//! - any other read failure                  -> `500 { "error": "Failed to list task leaderboard members" }`
//! - success                                 -> `200 { ok:true, schemaAvailable:true, members:[...] }`
//!
//! The legacy GET reads `task_leaderboard_members` (with the embedded
//! `team:task_leaderboard_teams(*)`) via the admin (service-role) client,
//! filtered by `leaderboard_id` and ordered by `created_at` ascending.
//!
//! Behavior gap: `POST` is not migrated; only `GET` is handled here.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const EXPECTED_MIDDLE_SEGMENTS: [&str; 3] = ["task-progress", "leaderboards", "members"];
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const SCHEMA_UNAVAILABLE_MESSAGE: &str =
    "Task progress is not available until the latest database migration is applied.";
const MEMBERS_FAILURE_MESSAGE: &str = "Failed to list task leaderboard members";
const MEMBER_SELECT: &str = "*, team:task_leaderboard_teams(*)";

#[derive(Clone, Copy)]
enum MembershipError {
    Unauthorized,
    LookupFailed,
    AccessDenied,
}

enum FetchError {
    SchemaUnavailable,
    Other,
}

#[derive(Deserialize)]
struct IdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct MembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

/// Parsed path components for this route.
struct RouteParams<'a> {
    raw_ws_id: &'a str,
    leaderboard_id: &'a str,
}

pub(crate) async fn handle_workspaces_wsid_task_progress_leaderboards_leaderboardid_members_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let params = extract_route_params(request.path)?;

    Some(match request.method {
        "GET" => members_response(config, request, params, outbound).await,
        _ => return None,
    })
}

fn extract_route_params(path: &str) -> Option<RouteParams<'_>> {
    // Strip the leading prefix so we are left with:
    //   {wsId}/task-progress/leaderboards/{leaderboardId}/members
    let after_prefix = path.strip_prefix(PATH_PREFIX)?;
    let segments: Vec<&str> = after_prefix.splitn(5, '/').collect();

    // Require exactly 5 segments: wsId, "task-progress", "leaderboards",
    // leaderboardId, "members".
    if segments.len() != 5 {
        return None;
    }

    let raw_ws_id = segments[0];
    let leaderboard_id = segments[3];

    if raw_ws_id.is_empty()
        || leaderboard_id.is_empty()
        || segments[1] != EXPECTED_MIDDLE_SEGMENTS[0]
        || segments[2] != EXPECTED_MIDDLE_SEGMENTS[1]
        || segments[4] != EXPECTED_MIDDLE_SEGMENTS[2]
    {
        return None;
    }

    Some(RouteParams {
        raw_ws_id,
        leaderboard_id,
    })
}

async fn members_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    params: RouteParams<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        return error_response(500, "Failed to verify workspace membership");
    }

    let ws_id = match authorize_membership(contact_data, request, params.raw_ws_id, outbound).await
    {
        Ok(ws_id) => ws_id,
        Err(MembershipError::Unauthorized) => return error_response(401, "Unauthorized"),
        Err(MembershipError::LookupFailed) => {
            return error_response(500, "Failed to verify workspace membership");
        }
        Err(MembershipError::AccessDenied) => {
            return error_response(403, "Workspace access denied");
        }
    };

    // Verify the leaderboard exists in this workspace and is not archived.
    match leaderboard_exists(contact_data, outbound, &ws_id, params.leaderboard_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(404, "Leaderboard not found"),
        Err(FetchError::SchemaUnavailable) => return schema_unavailable_response(),
        Err(FetchError::Other) => return error_response(500, MEMBERS_FAILURE_MESSAGE),
    }

    let url = members_url(contact_data, params.leaderboard_id);
    let members = match fetch_rows::<Value>(contact_data, outbound, &url).await {
        Ok(rows) => rows,
        Err(FetchError::SchemaUnavailable) => return schema_unavailable_response(),
        Err(FetchError::Other) => return error_response(500, MEMBERS_FAILURE_MESSAGE),
    };

    success_response(members)
}

// ---------------------------------------------------------------------------
// Membership authorization (mirror of `resolveTaskProgressRouteAuth`)
// ---------------------------------------------------------------------------

async fn authorize_membership(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<String, MembershipError> {
    let access_token =
        supabase_auth::request_access_token(request).ok_or(MembershipError::Unauthorized)?;
    let user = supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
        .await
        .ok_or(MembershipError::Unauthorized)?;
    let user_id = user
        .id
        .filter(|id| !id.trim().is_empty())
        .ok_or(MembershipError::Unauthorized)?;

    let ws_id = normalize_ws_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
        .await
        .map_err(|_| MembershipError::LookupFailed)?;

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
        .ok_or(MembershipError::LookupFailed)?;
    let response = caller_get(contact_data, outbound, &url, &access_token)
        .await
        .map_err(|_| MembershipError::LookupFailed)?;
    if !is_success(response.status) {
        return Err(MembershipError::LookupFailed);
    }

    let membership = response
        .json::<Vec<MembershipRow>>()
        .map_err(|_| MembershipError::LookupFailed)?
        .into_iter()
        .next()
        .ok_or(MembershipError::AccessDenied)?;

    if membership.membership_type.as_deref() == Some("MEMBER") {
        Ok(ws_id)
    } else {
        Err(MembershipError::AccessDenied)
    }
}

async fn normalize_ws_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let resolved = if raw_ws_id.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        raw_ws_id.to_owned()
    };

    if resolved == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_uuid_literal(&resolved) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_lookup_identifier(&handle) {
            return Ok(resolved);
        }
        if let Some(id) =
            workspace_id_by_handle(contact_data, outbound, &handle, Some(access_token)).await?
        {
            return Ok(id);
        }
        if let Some(id) = workspace_id_by_handle(contact_data, outbound, &handle, None).await? {
            return Ok(id);
        }
    }

    Ok(resolved)
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
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
    let response = caller_get(contact_data, outbound, &url, access_token).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response
        .json::<Vec<IdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id)
        .ok_or(())
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    access_token: Option<&str>,
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
    let response = match access_token {
        Some(token) => caller_get(contact_data, outbound, &url, token).await?,
        None => service_get(contact_data, outbound, &url).await?,
    };
    if !is_success(response.status) {
        return Ok(None);
    }
    Ok(response
        .json::<Vec<IdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

// ---------------------------------------------------------------------------
// Data fetch
// ---------------------------------------------------------------------------

async fn leaderboard_exists(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    leaderboard_id: &str,
) -> Result<bool, FetchError> {
    let url = contact_data
        .rest_url(
            "task_leaderboards",
            &[
                ("select", "id".to_owned()),
                ("id", format!("eq.{leaderboard_id}")),
                ("ws_id", format!("eq.{ws_id}")),
                ("archived_at", "is.null".to_owned()),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(FetchError::Other)?;
    let response = service_get(contact_data, outbound, &url)
        .await
        .map_err(|_| FetchError::Other)?;
    if !is_success(response.status) {
        let body = response.json::<Value>().unwrap_or(Value::Null);
        return Err(if is_schema_unavailable(&body) {
            FetchError::SchemaUnavailable
        } else {
            FetchError::Other
        });
    }
    let rows = response
        .json::<Vec<IdRow>>()
        .map_err(|_| FetchError::Other)?;
    Ok(!rows.is_empty())
}

fn members_url(contact_data: &contact::ContactDataConfig, leaderboard_id: &str) -> String {
    contact_data
        .rest_url(
            "task_leaderboard_members",
            &[
                ("select", MEMBER_SELECT.to_owned()),
                ("leaderboard_id", format!("eq.{leaderboard_id}")),
                ("order", "created_at.asc".to_owned()),
            ],
        )
        .unwrap_or_default()
}

async fn fetch_rows<T: for<'de> Deserialize<'de>>(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<Vec<T>, FetchError> {
    if url.is_empty() {
        return Err(FetchError::Other);
    }
    let response = service_get(contact_data, outbound, url)
        .await
        .map_err(|_| FetchError::Other)?;
    if !is_success(response.status) {
        let body = response.json::<Value>().unwrap_or(Value::Null);
        return Err(if is_schema_unavailable(&body) {
            FetchError::SchemaUnavailable
        } else {
            FetchError::Other
        });
    }
    response.json::<Vec<T>>().map_err(|_| FetchError::Other)
}

async fn service_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    send_get(outbound, url, service_role_key, service_role_key).await
}

async fn caller_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    send_get(outbound, url, access_token, service_role_key).await
}

async fn send_get(
    outbound: &impl OutboundHttpClient,
    url: &str,
    bearer_token: &str,
    apikey: &str,
) -> Result<OutboundResponse, ()> {
    let authorization = format!("Bearer {bearer_token}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", apikey),
        )
        .await
        .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Schema-unavailable detection (mirror of `isTaskProgressSchemaUnavailableError`)
// ---------------------------------------------------------------------------

fn is_schema_unavailable(body: &Value) -> bool {
    let code = body.get("code").and_then(Value::as_str).unwrap_or("");
    let message = body.get("message").and_then(Value::as_str).unwrap_or("");
    let details = body.get("details").and_then(Value::as_str).unwrap_or("");
    let text = format!("{message} {details}").to_lowercase();
    let mentions = text.contains("task_progress_") || text.contains("task_leaderboard");
    let looks_missing = text.contains("schema cache")
        || text.contains("could not find")
        || text.contains("does not exist")
        || text.contains("column")
        || text.contains("relation");

    code == "42P01"
        || code == "42703"
        || code == "PGRST204"
        || code == "PGRST205"
        || (mentions && looks_missing)
}

// ---------------------------------------------------------------------------
// Misc helpers / responses
// ---------------------------------------------------------------------------

fn is_uuid_literal(value: &str) -> bool {
    let value = value.trim();
    value.len() == 36
        && value
            .chars()
            .enumerate()
            .all(|(index, character)| match index {
                8 | 13 | 18 | 23 => character == '-',
                _ => character.is_ascii_hexdigit(),
            })
}

fn is_workspace_handle(value: &str) -> bool {
    let length = value.len();
    if length == 0 || length > 64 {
        return false;
    }
    value.chars().enumerate().all(|(index, character)| {
        let is_edge = index == 0 || index + 1 == length;
        character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || (!is_edge && matches!(character, '_' | '-'))
    })
}

fn is_direct_lookup_identifier(value: &str) -> bool {
    let normalized = value.trim().to_lowercase();
    normalized == PERSONAL_WORKSPACE_SLUG
        || normalized == ROOT_WORKSPACE_ID
        || normalized == INTERNAL_WORKSPACE_SLUG
        || is_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

fn success_response(members: Vec<Value>) -> BackendResponse {
    no_store_response(json_response(
        200,
        json!({
            "ok": true,
            "schemaAvailable": true,
            "members": members,
        }),
    ))
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

fn schema_unavailable_response() -> BackendResponse {
    no_store_response(json_response(
        200,
        json!({
            "ok": false,
            "code": "schema_unavailable",
            "schemaAvailable": false,
            "message": SCHEMA_UNAVAILABLE_MESSAGE,
            "members": [],
        }),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_extracts_ws_id_and_leaderboard_id() {
        let params =
            extract_route_params("/api/v1/workspaces/abc/task-progress/leaderboards/lb-1/members")
                .expect("should match");
        assert_eq!(params.raw_ws_id, "abc");
        assert_eq!(params.leaderboard_id, "lb-1");
    }

    #[test]
    fn path_guard_accepts_uuid_segments() {
        let ws = "11111111-1111-4111-8111-111111111111";
        let lb = "22222222-2222-4222-8222-222222222222";
        let path = format!("/api/v1/workspaces/{ws}/task-progress/leaderboards/{lb}/members");
        let params = extract_route_params(&path).expect("should match uuid path");
        assert_eq!(params.raw_ws_id, ws);
        assert_eq!(params.leaderboard_id, lb);
    }

    #[test]
    fn path_guard_rejects_missing_suffix() {
        assert!(
            extract_route_params(
                "/api/v1/workspaces/abc/task-progress/leaderboards/lb-1/members/extra"
            )
            .is_none()
        );
        assert!(
            extract_route_params("/api/v1/workspaces/abc/task-progress/leaderboards/lb-1")
                .is_none()
        );
    }

    #[test]
    fn path_guard_rejects_wrong_static_segments() {
        assert!(
            extract_route_params("/api/v1/workspaces/abc/task-progress/WRONG/lb-1/members")
                .is_none()
        );
        assert!(
            extract_route_params("/api/v1/workspaces/abc/WRONG/leaderboards/lb-1/members")
                .is_none()
        );
    }

    #[test]
    fn path_guard_rejects_empty_segments() {
        assert!(
            extract_route_params("/api/v1/workspaces//task-progress/leaderboards/lb-1/members")
                .is_none()
        );
        assert!(
            extract_route_params("/api/v1/workspaces/abc/task-progress/leaderboards//members")
                .is_none()
        );
    }

    #[test]
    fn path_guard_rejects_unrelated_path() {
        assert!(extract_route_params("/api/v1/workspaces/abc/finance/invoices").is_none());
        assert!(extract_route_params("/totally/unrelated").is_none());
    }

    #[test]
    fn schema_unavailable_detects_postgrest_codes() {
        assert!(is_schema_unavailable(&json!({ "code": "PGRST205" })));
        assert!(is_schema_unavailable(&json!({ "code": "42P01" })));
        assert!(is_schema_unavailable(&json!({
            "message": "Could not find the table for task_leaderboard_members in the schema cache"
        })));
        assert!(!is_schema_unavailable(
            &json!({ "code": "23505", "message": "duplicate key" })
        ));
    }

    #[test]
    fn is_uuid_literal_validates_shape() {
        assert!(is_uuid_literal("11111111-1111-4111-8111-111111111111"));
        assert!(!is_uuid_literal("personal"));
        assert!(!is_uuid_literal("not-a-uuid"));
    }

    #[test]
    fn success_response_shape_matches_legacy() {
        let members: Vec<Value> = vec![json!({ "id": "m1", "user_id": "u1" })];
        let resp = success_response(members);
        assert_eq!(resp.status, 200);
        assert_eq!(resp.body["ok"], json!(true));
        assert_eq!(resp.body["schemaAvailable"], json!(true));
        assert!(resp.body["members"].is_array());
        assert_eq!(resp.body["members"][0]["id"], json!("m1"));
    }

    #[test]
    fn schema_unavailable_response_shape_matches_legacy() {
        let resp = schema_unavailable_response();
        assert_eq!(resp.status, 200);
        assert_eq!(resp.body["ok"], json!(false));
        assert_eq!(resp.body["schemaAvailable"], json!(false));
        assert_eq!(resp.body["code"], json!("schema_unavailable"));
        assert!(resp.body["members"].is_array());
        assert!(resp.body["members"].as_array().unwrap().is_empty());
    }

    #[test]
    fn error_response_shape_matches_legacy() {
        let resp = error_response(404, "Leaderboard not found");
        assert_eq!(resp.status, 404);
        assert_eq!(resp.body["error"], json!("Leaderboard not found"));
    }
}
