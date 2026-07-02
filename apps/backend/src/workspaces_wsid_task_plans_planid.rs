//! Handler for `GET /api/v1/workspaces/:wsId/task-plans/:planId`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/task-plans/[planId]/route.ts`
//! (legacy methods GET, PATCH, DELETE — only GET is migrated here; the other
//! methods return `None` so the live Next.js route still handles them).
//!
//! Legacy auth (`resolveTaskPlanRouteAuth`): resolve the authenticated session
//! user, `normalizeWorkspaceId(rawWsId)`, then `verifyWorkspaceMembershipType`
//! (default `MEMBER`). This is a membership-only gate (no workspace permission),
//! mirroring the sibling `workspaces_wsid_task_plans` handler. Status codes:
//!   * missing session / no user -> `401 { "error": "Unauthorized" }`
//!   * membership lookup failure  -> `500 { "error": "Failed to verify workspace membership" }`
//!   * not a workspace member     -> `403 { "error": "Workspace access denied" }`
//!
//! Then `requireTaskPlanAccess({ permission: 'view' })` calls the
//! `can_access_task_plan(p_plan_id, p_required_permission, p_user_id)` RPC with
//! the CALLER's token (RLS active):
//!   * schema-unavailable error -> `200 { ok:false, code:"schema_unavailable", ... }`
//!   * other RPC failure        -> `500 { "error": "Failed to verify task plan access" }`
//!   * result not `true`        -> `403 { "error": "Task plan access denied" }`
//!
//! On success the GET reads (with the caller token, RLS active):
//!   * `task_plans` (selected columns) where `id = planId`, `.single()`
//!   * `task_plan_workspaces` (`*`) where `plan_id = planId`
//!   * `task_plan_items` (`*`) where `plan_id = planId`, ordered by `sort_key`
//!   * `task_plan_shares` (`*`) where `plan_id = planId`
//!     and responds with
//!     `{ ok: true, schemaAvailable: true, plan: { ...plan, workspaces, items, shares } }`.
//!
//! NOTE / behavior gaps:
//!   * The legacy "schema unavailable" detection inspects PostgREST error
//!     codes/messages. Here it is approximated by HTTP status (`400 | 404 | 406`),
//!     mirroring the sibling `workspaces_wsid_task_plans` handler. A
//!     schema-unavailable read/RPC returns
//!     `{ ok:false, code:"schema_unavailable", schemaAvailable:false, message }`.
//!   * `.single()` with zero rows is a PostgREST error in the legacy route that
//!     does not look like a schema-unavailable error, so it falls through to the
//!     generic `500 { "error": "Failed to load task plan" }`; an empty
//!     `task_plans` read is mapped to that same `500` here.

use serde::Deserialize;
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace membership";
const WORKSPACE_ACCESS_DENIED_MESSAGE: &str = "Workspace access denied";
const VERIFY_ACCESS_FAILED_MESSAGE: &str = "Failed to verify task plan access";
const PLAN_ACCESS_DENIED_MESSAGE: &str = "Task plan access denied";
const LOAD_FAILED_MESSAGE: &str = "Failed to load task plan";
const SCHEMA_UNAVAILABLE_MESSAGE: &str =
    "Task plans are not available until the latest database migration is applied.";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const CAN_ACCESS_TASK_PLAN_RPC: &str = "can_access_task_plan";
const VIEW_PERMISSION: &str = "view";

const TASK_PLAN_SELECT: &str = "id,owner_id,personal_ws_id,title,period_type,period_start,period_end,timezone,status,default_target_ws_id,default_target_board_id,default_target_list_id,created_at,updated_at,archived_at";

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

enum FetchResult<T> {
    Ok(T),
    SchemaUnavailable,
    Error,
}

pub(crate) async fn handle_workspaces_wsid_task_plans_planid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, plan_id) = extract_ids(request.path)?;

    Some(match request.method {
        "GET" => get_response(config, request, raw_ws_id, plan_id, outbound).await,
        _ => return None,
    })
}

async fn get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    plan_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        return error_response(500, LOAD_FAILED_MESSAGE);
    }

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };

    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
        };

    match verify_workspace_member(
        contact_data,
        outbound,
        &resolved_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(true) => {}
        Ok(false) => return error_response(403, WORKSPACE_ACCESS_DENIED_MESSAGE),
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    // requireTaskPlanAccess({ permission: 'view' }) via the can_access_task_plan RPC.
    match check_task_plan_access(contact_data, outbound, plan_id, &user_id, &access_token).await {
        FetchResult::Ok(true) => {}
        FetchResult::Ok(false) => return error_response(403, PLAN_ACCESS_DENIED_MESSAGE),
        FetchResult::SchemaUnavailable => return schema_unavailable_response(),
        FetchResult::Error => return error_response(500, VERIFY_ACCESS_FAILED_MESSAGE),
    }

    let plan = match fetch_plan(contact_data, outbound, plan_id, &access_token).await {
        FetchResult::Ok(Some(plan)) => plan,
        FetchResult::Ok(None) => return error_response(500, LOAD_FAILED_MESSAGE),
        FetchResult::SchemaUnavailable => return schema_unavailable_response(),
        FetchResult::Error => return error_response(500, LOAD_FAILED_MESSAGE),
    };

    let workspaces = match fetch_children(
        contact_data,
        outbound,
        "task_plan_workspaces",
        plan_id,
        None,
        &access_token,
    )
    .await
    {
        FetchResult::Ok(rows) => rows,
        FetchResult::SchemaUnavailable => return schema_unavailable_response(),
        FetchResult::Error => return error_response(500, LOAD_FAILED_MESSAGE),
    };
    let items = match fetch_children(
        contact_data,
        outbound,
        "task_plan_items",
        plan_id,
        Some("sort_key"),
        &access_token,
    )
    .await
    {
        FetchResult::Ok(rows) => rows,
        FetchResult::SchemaUnavailable => return schema_unavailable_response(),
        FetchResult::Error => return error_response(500, LOAD_FAILED_MESSAGE),
    };
    let shares = match fetch_children(
        contact_data,
        outbound,
        "task_plan_shares",
        plan_id,
        None,
        &access_token,
    )
    .await
    {
        FetchResult::Ok(rows) => rows,
        FetchResult::SchemaUnavailable => return schema_unavailable_response(),
        FetchResult::Error => return error_response(500, LOAD_FAILED_MESSAGE),
    };

    success_response(build_plan(plan, workspaces, items, shares))
}

async fn check_task_plan_access(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    plan_id: &str,
    user_id: &str,
    access_token: &str,
) -> FetchResult<bool> {
    let Some(url) = contact_data.rpc_url(CAN_ACCESS_TASK_PLAN_RPC) else {
        return FetchResult::Error;
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return FetchResult::Error;
    };
    let body = match serde_json::to_string(&json!({
        "p_plan_id": plan_id,
        "p_required_permission": VIEW_PERMISSION,
        "p_user_id": user_id,
    })) {
        Ok(body) => body,
        Err(_) => return FetchResult::Error,
    };
    let authorization = format!("Bearer {access_token}");

    let response = match outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
    {
        Ok(response) => response,
        Err(_) => return FetchResult::Error,
    };

    if !(200..300).contains(&response.status) {
        if is_schema_unavailable_status(response.status) {
            return FetchResult::SchemaUnavailable;
        }
        return FetchResult::Error;
    }

    // The RPC returns a scalar boolean; mirror the legacy `data !== true` gate.
    match response.json::<Value>() {
        Ok(value) => FetchResult::Ok(value.as_bool() == Some(true)),
        Err(_) => FetchResult::Error,
    }
}

async fn fetch_plan(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    plan_id: &str,
    access_token: &str,
) -> FetchResult<Option<Value>> {
    let Some(url) = contact_data.rest_url(
        "task_plans",
        &[
            ("select", TASK_PLAN_SELECT.to_owned()),
            ("id", format!("eq.{plan_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return FetchResult::Error;
    };

    match decode_rows(send_caller_get(contact_data, outbound, &url, access_token).await) {
        FetchResult::Ok(rows) => FetchResult::Ok(rows.into_iter().next()),
        FetchResult::SchemaUnavailable => FetchResult::SchemaUnavailable,
        FetchResult::Error => FetchResult::Error,
    }
}

async fn fetch_children(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    plan_id: &str,
    order: Option<&str>,
    access_token: &str,
) -> FetchResult<Vec<Value>> {
    let mut params = vec![
        ("select", "*".to_owned()),
        ("plan_id", format!("eq.{plan_id}")),
    ];
    if let Some(order) = order {
        params.push(("order", order.to_owned()));
    }

    let Some(url) = contact_data.rest_url(table, &params) else {
        return FetchResult::Error;
    };
    decode_rows(send_caller_get(contact_data, outbound, &url, access_token).await)
}

fn decode_rows(response: Result<OutboundResponse, ()>) -> FetchResult<Vec<Value>> {
    let response = match response {
        Ok(response) => response,
        Err(()) => return FetchResult::Error,
    };

    if !(200..300).contains(&response.status) {
        if is_schema_unavailable_status(response.status) {
            return FetchResult::SchemaUnavailable;
        }
        return FetchResult::Error;
    }

    match response.json::<Vec<Value>>() {
        Ok(rows) => FetchResult::Ok(rows),
        Err(_) => FetchResult::Error,
    }
}

/// Mirror `{ ...planResult.data, workspaces, items, shares }`.
fn build_plan(plan: Value, workspaces: Vec<Value>, items: Vec<Value>, shares: Vec<Value>) -> Value {
    let mut object = match plan {
        Value::Object(map) => map,
        other => {
            let mut map = Map::new();
            map.insert("value".to_owned(), other);
            map
        }
    };
    object.insert("workspaces".to_owned(), Value::Array(workspaces));
    object.insert("items".to_owned(), Value::Array(items));
    object.insert("shares".to_owned(), Value::Array(shares));
    Value::Object(object)
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(resolved_ws_id);
        }

        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, Some(access_token)).await?
        {
            return Ok(workspace_id);
        }
        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, None).await?
        {
            return Ok(workspace_id);
        }
    }

    Ok(resolved_ws_id)
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let Some(url) = contact_data.rest_url(
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
    ) else {
        return Err(());
    };
    let response = send_caller_get(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response
        .json::<Vec<WorkspaceIdRow>>()
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
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id".to_owned()),
            ("handle", format!("eq.{handle}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = match access_token {
        Some(token) => send_caller_get(contact_data, outbound, &url, token).await?,
        None => send_service_role_get(contact_data, outbound, &url).await?,
    };

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn verify_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_caller_get(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        == Some("MEMBER"))
}

async fn send_caller_get(
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

async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

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

fn is_schema_unavailable_status(status: u16) -> bool {
    matches!(status, 400 | 404 | 406)
}

/// Match the verbatim mount path `/api/v1/workspaces/:wsId/task-plans/:planId`
/// and extract `(wsId, planId)`. Returns `None` for any other shape so the
/// shared dispatch chain keeps running other handlers / Next.js.
fn extract_ids(path: &str) -> Option<(&str, &str)> {
    let segments: Vec<&str> = path.split('/').collect();
    if segments.len() != 7 {
        return None;
    }
    if segments.get(1) != Some(&"api")
        || segments.get(2) != Some(&"v1")
        || segments.get(3) != Some(&"workspaces")
        || segments.get(5) != Some(&"task-plans")
    {
        return None;
    }

    let ws_id = *segments.get(4)?;
    let plan_id = *segments.get(6)?;
    if ws_id.is_empty() || plan_id.is_empty() {
        return None;
    }

    Some((ws_id, plan_id))
}

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn is_direct_workspace_lookup_identifier(identifier: &str) -> bool {
    let normalized = identifier.trim().to_lowercase();

    normalized == PERSONAL_WORKSPACE_SLUG
        || normalized == ROOT_WORKSPACE_ID
        || normalized == INTERNAL_WORKSPACE_SLUG
        || is_workspace_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

fn is_workspace_uuid_literal(value: &str) -> bool {
    value.trim().len() == 36
        && value
            .trim()
            .chars()
            .enumerate()
            .all(|(index, value)| match index {
                8 | 13 | 18 | 23 => value == '-',
                _ => value.is_ascii_hexdigit(),
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

fn success_response(plan: Value) -> BackendResponse {
    no_store_response(json_response(
        200,
        json!({
            "ok": true,
            "schemaAvailable": true,
            "plan": plan,
        }),
    ))
}

fn schema_unavailable_response() -> BackendResponse {
    no_store_response(json_response(
        200,
        json!({
            "ok": false,
            "code": "schema_unavailable",
            "schemaAvailable": false,
            "message": SCHEMA_UNAVAILABLE_MESSAGE,
        }),
    ))
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_matches_exact_mount_path() {
        assert_eq!(
            extract_ids("/api/v1/workspaces/ws-123/task-plans/plan-1"),
            Some(("ws-123", "plan-1"))
        );
        assert_eq!(
            extract_ids("/api/v1/workspaces/personal/task-plans/abc"),
            Some(("personal", "abc"))
        );
    }

    #[test]
    fn path_guard_rejects_unrelated_or_short_paths() {
        // Short paths must not panic and must return None.
        assert_eq!(extract_ids("/api/v1/workspaces/ws-123/task-plans"), None);
        assert_eq!(extract_ids("/api/v1/workspaces"), None);
        assert_eq!(extract_ids("/"), None);
        assert_eq!(extract_ids(""), None);
        // Wrong segments / no v1 / deeper path.
        assert_eq!(
            extract_ids("/api/workspaces/ws-123/task-plans/plan-1"),
            None
        );
        assert_eq!(extract_ids("/api/v1/workspaces/ws-123/tasks/plan-1"), None);
        assert_eq!(
            extract_ids("/api/v1/workspaces/ws-123/task-plans/plan-1/digest"),
            None
        );
        // Empty dynamic segments.
        assert_eq!(extract_ids("/api/v1/workspaces//task-plans/plan-1"), None);
        assert_eq!(extract_ids("/api/v1/workspaces/ws-123/task-plans/"), None);
    }

    #[test]
    fn schema_unavailable_status_classification() {
        for status in [400u16, 404, 406] {
            assert!(is_schema_unavailable_status(status));
        }
        for status in [401u16, 403, 409, 500] {
            assert!(!is_schema_unavailable_status(status));
        }
    }

    #[test]
    fn build_plan_attaches_child_collections() {
        let plan = json!({ "id": "p1", "title": "First" });
        let workspaces = vec![json!({ "plan_id": "p1", "ws_id": "w1" })];
        let items = vec![json!({ "plan_id": "p1", "id": "i1", "sort_key": 1 })];
        let shares: Vec<Value> = Vec::new();

        let result = build_plan(plan, workspaces, items, shares);

        assert_eq!(result["id"], json!("p1"));
        assert_eq!(result["title"], json!("First"));
        assert_eq!(
            result["workspaces"],
            json!([{ "plan_id": "p1", "ws_id": "w1" }])
        );
        assert_eq!(
            result["items"],
            json!([{ "plan_id": "p1", "id": "i1", "sort_key": 1 }])
        );
        assert_eq!(result["shares"], json!([]));
    }

    #[test]
    fn resolve_workspace_id_maps_internal_slug_to_root() {
        assert_eq!(resolve_workspace_id("internal"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("ws-123"), "ws-123");
    }
}
