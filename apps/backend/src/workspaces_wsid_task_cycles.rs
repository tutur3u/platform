//! Handler for `GET /api/v1/workspaces/:wsId/task-cycles`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/task-cycles/route.ts` (GET only;
//! the legacy `POST` create path is intentionally left to the still-live Next.js
//! route, so this handler returns `None` for every non-`GET` method).
//!
//! Auth model (legacy `GET`): the route builds an RLS-respecting Supabase client
//! (`createClient`), resolves the authenticated session user
//! (`resolveAuthenticatedSessionUser`), then calls `verifyWorkspaceMembershipType`
//! with the default `requiredType = 'MEMBER'`. There is **no specific workspace
//! permission gate** and **no workspace-id normalization** — the raw `wsId` path
//! segment is used verbatim both for the membership lookup and the `task_cycles`
//! read. This port reproduces that membership-only check directly (caller token ->
//! user -> `workspace_members` lookup) using the caller's access token (RLS active)
//! for every Supabase read, exactly like the legacy RLS client.
//!
//! Legacy status codes preserved:
//!   * no authenticated session user             -> `401 { "error": "Unauthorized" }`
//!   * membership lookup transport/query failure  -> `500 { "error": "Failed to verify workspace access" }`
//!   * not a `MEMBER` of the workspace            -> `403 { "error": "Forbidden" }`
//!   * `task_cycles` read failure                 -> `500 { "error": "Failed to fetch cycles" }`
//!   * success                                    -> `200 [ ...serialized cycles ]`
//!
//! On success the legacy route returns a bare JSON array of serialized cycles,
//! each shaped as `{ id, name, description, status, start_date, end_date,
//! created_at, creator, tasksCount }` where `creator` is the embedded
//! `users` row (or `null`) and `tasksCount` is `task_cycle_tasks?.length ?? 0`.
//!
//! BEHAVIOR GAPS: none known for the authenticated GET path. The legacy route
//! sets no explicit cache headers; this port responds `no-store` to match the
//! crate's read convention (the legacy `NextResponse.json` is likewise uncached).

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/task-cycles";

const CYCLE_SELECT: &str = "*,creator:users!task_cycles_creator_id_fkey(id,display_name,avatar_url),task_cycle_tasks(task_id)";

#[derive(Clone, Copy)]
enum MembershipError {
    Unauthorized,
    LookupFailed,
    Forbidden,
}

#[derive(Deserialize)]
struct MembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct CycleRow {
    #[serde(default)]
    id: Value,
    #[serde(default)]
    name: Value,
    #[serde(default)]
    description: Value,
    #[serde(default)]
    status: Value,
    #[serde(default)]
    start_date: Value,
    #[serde(default)]
    end_date: Value,
    #[serde(default)]
    created_at: Value,
    #[serde(default)]
    creator: Value,
    #[serde(default)]
    task_cycle_tasks: Option<Vec<Value>>,
}

pub(crate) async fn handle_workspaces_wsid_task_cycles_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = task_cycles_ws_id(request.path)?;

    Some(match request.method {
        "GET" => task_cycles_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

fn task_cycles_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

async fn task_cycles_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        return error_response(500, "Internal server error");
    }

    let access_token = match authorize_membership(contact_data, request, raw_ws_id, outbound).await {
        Ok(token) => token,
        Err(MembershipError::Unauthorized) => return error_response(401, "Unauthorized"),
        Err(MembershipError::LookupFailed) => {
            return error_response(500, "Failed to verify workspace access");
        }
        Err(MembershipError::Forbidden) => return error_response(403, "Forbidden"),
    };

    match fetch_cycles(contact_data, outbound, raw_ws_id, &access_token).await {
        Ok(rows) => no_store_response(json_response(200, serialize_cycles(&rows))),
        Err(()) => error_response(500, "Failed to fetch cycles"),
    }
}

/// Reproduce `resolveAuthenticatedSessionUser` + `verifyWorkspaceMembershipType`
/// (default `requiredType = 'MEMBER'`). Returns the caller access token so the
/// follow-up `task_cycles` read runs under the same RLS-active session.
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

    // Legacy uses the raw `wsId` verbatim (no normalization).
    let url = contact_data
        .rest_url(
            "workspace_members",
            &[
                ("select", "type".to_owned()),
                ("ws_id", format!("eq.{raw_ws_id}")),
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

    // `membership_lookup_failed` -> 500; `membership_missing` /
    // `membership_type_mismatch` -> `!membership.ok` -> 403.
    let membership = response
        .json::<Vec<MembershipRow>>()
        .map_err(|_| MembershipError::LookupFailed)?
        .into_iter()
        .next()
        .ok_or(MembershipError::Forbidden)?;

    if membership.membership_type.as_deref() == Some("MEMBER") {
        Ok(access_token)
    } else {
        Err(MembershipError::Forbidden)
    }
}

async fn fetch_cycles(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    access_token: &str,
) -> Result<Vec<CycleRow>, ()> {
    let url = contact_data
        .rest_url(
            "task_cycles",
            &[
                ("select", CYCLE_SELECT.to_owned()),
                ("ws_id", format!("eq.{raw_ws_id}")),
                ("order", "created_at.desc".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = caller_get(contact_data, outbound, &url, access_token).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response.json::<Vec<CycleRow>>().map_err(|_| ())
}

fn serialize_cycles(rows: &[CycleRow]) -> Value {
    Value::Array(rows.iter().map(serialize_cycle).collect())
}

fn serialize_cycle(cycle: &CycleRow) -> Value {
    let tasks_count = cycle.task_cycle_tasks.as_ref().map_or(0, Vec::len);
    json!({
        "id": cycle.id,
        "name": cycle.name,
        "description": cycle.description,
        "status": cycle.status,
        "start_date": cycle.start_date,
        "end_date": cycle.end_date,
        "created_at": cycle.created_at,
        "creator": cycle.creator,
        "tasksCount": tasks_count,
    })
}

/// Forward the caller's access token (RLS active) with the service-role key as
/// the PostgREST `apikey`, mirroring the legacy RLS Supabase client.
async fn caller_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cycle_row(json_text: &str) -> CycleRow {
        serde_json::from_str(json_text).expect("valid cycle row")
    }

    #[test]
    fn path_guard_extracts_ws_id() {
        assert_eq!(
            task_cycles_ws_id("/api/v1/workspaces/abc/task-cycles"),
            Some("abc")
        );
    }

    #[test]
    fn path_guard_rejects_foreign_and_short_paths() {
        assert_eq!(task_cycles_ws_id("/api/v1/workspaces//task-cycles"), None);
        assert_eq!(
            task_cycles_ws_id("/api/v1/workspaces/abc/def/task-cycles"),
            None
        );
        assert_eq!(task_cycles_ws_id("/api/v1/workspaces/abc/task-cycles/x"), None);
        assert_eq!(task_cycles_ws_id("/api/v1/workspaces/abc"), None);
        // No `v1` segment must not match.
        assert_eq!(task_cycles_ws_id("/api/workspaces/abc/task-cycles"), None);
        assert_eq!(task_cycles_ws_id("/totally/unrelated"), None);
    }

    #[test]
    fn serialize_cycle_maps_fields_and_counts_tasks() {
        let row = cycle_row(
            r#"{
                "id": "cycle-1",
                "name": "Sprint 1",
                "description": "first sprint",
                "status": "active",
                "start_date": "2026-01-01",
                "end_date": null,
                "created_at": "2026-01-01T00:00:00Z",
                "ws_id": "ws-1",
                "creator_id": "user-1",
                "creator": { "id": "user-1", "display_name": "Ada", "avatar_url": null },
                "task_cycle_tasks": [{ "task_id": "t1" }, { "task_id": "t2" }]
            }"#,
        );

        assert_eq!(
            serialize_cycle(&row),
            json!({
                "id": "cycle-1",
                "name": "Sprint 1",
                "description": "first sprint",
                "status": "active",
                "start_date": "2026-01-01",
                "end_date": null,
                "created_at": "2026-01-01T00:00:00Z",
                "creator": { "id": "user-1", "display_name": "Ada", "avatar_url": null },
                "tasksCount": 2,
            })
        );
    }

    #[test]
    fn serialize_cycle_defaults_missing_tasks_and_creator() {
        // Null embed and absent `task_cycle_tasks` mirror `?.length ?? 0`.
        let row = cycle_row(
            r#"{
                "id": "cycle-2",
                "name": "Backlog",
                "description": null,
                "status": null,
                "start_date": null,
                "end_date": null,
                "created_at": "2026-02-02T00:00:00Z",
                "creator": null,
                "task_cycle_tasks": null
            }"#,
        );

        let value = serialize_cycle(&row);
        assert_eq!(value["creator"], Value::Null);
        assert_eq!(value["tasksCount"], json!(0));
        assert_eq!(value["status"], Value::Null);
    }

    #[test]
    fn serialize_cycles_wraps_rows_in_array_order() {
        let rows = vec![
            cycle_row(r#"{"id":"a","name":"A","created_at":"2","task_cycle_tasks":[{"task_id":"x"}]}"#),
            cycle_row(r#"{"id":"b","name":"B","created_at":"1"}"#),
        ];
        let serialized = serialize_cycles(&rows);
        let Value::Array(items) = serialized else {
            panic!("expected array");
        };
        assert_eq!(items.len(), 2);
        assert_eq!(items[0]["id"], json!("a"));
        assert_eq!(items[0]["tasksCount"], json!(1));
        assert_eq!(items[1]["id"], json!("b"));
        assert_eq!(items[1]["tasksCount"], json!(0));
    }

    #[test]
    fn is_success_matches_2xx_only() {
        assert!(is_success(200));
        assert!(is_success(299));
        assert!(!is_success(300));
        assert!(!is_success(404));
        assert!(!is_success(500));
    }
}
