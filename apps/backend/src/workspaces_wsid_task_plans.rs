//! Handler for `GET /api/v1/workspaces/:wsId/task-plans`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/task-plans/route.ts`.
//!
//! Legacy auth (`resolveTaskPlanRouteAuth`): resolve the authenticated session
//! user, `normalizeWorkspaceId(rawWsId)`, then `verifyWorkspaceMembershipType`
//! (default `MEMBER`). This is a membership-only gate (no workspace permission
//! is checked), so it does NOT use `authorize_workspace_permission`; it mirrors
//! the sibling `workspaces_task_plans_digest` handler instead. Status codes:
//!   * missing session / no user          -> `401 { "error": "Unauthorized" }`
//!   * membership lookup failure           -> `500 { "error": "Failed to verify workspace membership" }`
//!   * not a workspace member              -> `403 { "error": "Workspace access denied" }`
//!
//! On success the GET reads `task_plans` with the CALLER's token (RLS active,
//! and notably NOT filtered by `ws_id` — the legacy query scopes visibility via
//! RLS only), ordered `period_start desc, created_at desc`, optionally filtered
//! by the `period_type` and `status` query params. Each plan is hydrated with
//! its `task_plan_workspaces`, `task_plan_items`, and `task_plan_shares` rows
//! (read with the caller token), then returned as
//! `{ ok: true, schemaAvailable: true, plans }`.
//!
//! NOTE / behavior gaps:
//!   * The legacy "schema unavailable" detection inspects PostgREST error
//!     codes/messages. Here it is approximated by HTTP status (`400 | 404 | 406`),
//!     mirroring `workspaces_task_plans_digest`. A schema-unavailable read returns
//!     `{ ok:false, code:"schema_unavailable", schemaAvailable:false, message, plans:[] }`.
//!   * Any other upstream failure returns `500 { "error": "Failed to list task plans" }`.
//!   * Only GET is migrated; POST returns `None` so the live Next.js route handles it.

use serde::Deserialize;
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/task-plans";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace membership";
const WORKSPACE_ACCESS_DENIED_MESSAGE: &str = "Workspace access denied";
const LIST_FAILED_MESSAGE: &str = "Failed to list task plans";
const SCHEMA_UNAVAILABLE_MESSAGE: &str =
    "Task plans are not available until the latest database migration is applied.";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const TASK_PLAN_SELECT: &str = "id,owner_id,personal_ws_id,title,period_type,period_start,period_end,timezone,status,default_target_ws_id,default_target_board_id,default_target_list_id,created_at,updated_at,archived_at";
const TASK_PLAN_WORKSPACES_SELECT: &str = "plan_id,ws_id,created_at";
const TASK_PLAN_ITEMS_SELECT: &str =
    "plan_id,id,task_id,target_ws_id,planned_start,planned_end,status";
const TASK_PLAN_SHARES_SELECT: &str =
    "plan_id,id,shared_with_ws_id,shared_with_user_id,shared_with_email,permission";

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

pub(crate) async fn handle_workspaces_wsid_task_plans_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = task_plans_ws_id(request.path)?;

    Some(match request.method {
        "GET" => list_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn list_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        return error_response(500, LIST_FAILED_MESSAGE);
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

    let period_type = query_param(request.url, "period_type");
    let status = query_param(request.url, "status");

    let plans = match fetch_plans(
        contact_data,
        outbound,
        &access_token,
        period_type.as_deref(),
        status.as_deref(),
    )
    .await
    {
        FetchResult::Ok(plans) => plans,
        FetchResult::SchemaUnavailable => return schema_unavailable_response(),
        FetchResult::Error => return error_response(500, LIST_FAILED_MESSAGE),
    };

    // Mirror hydratePlans: skip child queries entirely when there are no plans.
    if plans.is_empty() {
        return success_response(Vec::new());
    }

    let plan_ids: Vec<String> = plans
        .iter()
        .filter_map(|plan| plan.get("id").and_then(Value::as_str).map(str::to_owned))
        .collect();

    let workspaces = match fetch_children(
        contact_data,
        outbound,
        &access_token,
        "task_plan_workspaces",
        TASK_PLAN_WORKSPACES_SELECT,
        &plan_ids,
    )
    .await
    {
        FetchResult::Ok(rows) => rows,
        FetchResult::SchemaUnavailable => return schema_unavailable_response(),
        FetchResult::Error => return error_response(500, LIST_FAILED_MESSAGE),
    };
    let items = match fetch_children(
        contact_data,
        outbound,
        &access_token,
        "task_plan_items",
        TASK_PLAN_ITEMS_SELECT,
        &plan_ids,
    )
    .await
    {
        FetchResult::Ok(rows) => rows,
        FetchResult::SchemaUnavailable => return schema_unavailable_response(),
        FetchResult::Error => return error_response(500, LIST_FAILED_MESSAGE),
    };
    let shares = match fetch_children(
        contact_data,
        outbound,
        &access_token,
        "task_plan_shares",
        TASK_PLAN_SHARES_SELECT,
        &plan_ids,
    )
    .await
    {
        FetchResult::Ok(rows) => rows,
        FetchResult::SchemaUnavailable => return schema_unavailable_response(),
        FetchResult::Error => return error_response(500, LIST_FAILED_MESSAGE),
    };

    success_response(hydrate_plans(plans, &workspaces, &items, &shares))
}

async fn fetch_plans(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
    period_type: Option<&str>,
    status: Option<&str>,
) -> FetchResult<Vec<Value>> {
    let mut params = vec![
        ("select", TASK_PLAN_SELECT.to_owned()),
        ("order", "period_start.desc,created_at.desc".to_owned()),
    ];
    if let Some(period_type) = period_type {
        params.push(("period_type", format!("eq.{period_type}")));
    }
    if let Some(status) = status {
        params.push(("status", format!("eq.{status}")));
    }

    let Some(url) = contact_data.rest_url("task_plans", &params) else {
        return FetchResult::Error;
    };
    decode_rows(send_caller_get(contact_data, outbound, &url, access_token).await)
}

async fn fetch_children(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
    table: &str,
    select: &str,
    plan_ids: &[String],
) -> FetchResult<Vec<Value>> {
    let Some(url) = contact_data.rest_url(
        table,
        &[
            ("select", select.to_owned()),
            ("plan_id", in_filter(plan_ids)),
        ],
    ) else {
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

/// Mirror `hydratePlans`: attach `workspaces`, `items`, and `shares` arrays to
/// each plan, grouped by matching `plan_id`, preserving the upstream row order.
fn hydrate_plans(
    plans: Vec<Value>,
    workspaces: &[Value],
    items: &[Value],
    shares: &[Value],
) -> Vec<Value> {
    plans
        .into_iter()
        .map(|plan| {
            let plan_id = plan
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned();
            let plan_id = plan_id.as_str();
            let mut object = match plan {
                Value::Object(map) => map,
                other => {
                    let mut map = Map::new();
                    map.insert("value".to_owned(), other);
                    map
                }
            };
            object.insert(
                "workspaces".to_owned(),
                Value::Array(rows_for_plan(workspaces, plan_id)),
            );
            object.insert(
                "items".to_owned(),
                Value::Array(rows_for_plan(items, plan_id)),
            );
            object.insert(
                "shares".to_owned(),
                Value::Array(rows_for_plan(shares, plan_id)),
            );
            Value::Object(object)
        })
        .collect()
}

fn rows_for_plan(rows: &[Value], plan_id: &str) -> Vec<Value> {
    rows.iter()
        .filter(|row| row.get("plan_id").and_then(Value::as_str) == Some(plan_id))
        .cloned()
        .collect()
}

fn in_filter(plan_ids: &[String]) -> String {
    format!("in.({})", plan_ids.join(","))
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

fn query_param(request_url: Option<&str>, key: &str) -> Option<String> {
    url::Url::parse(request_url?)
        .ok()?
        .query_pairs()
        .find_map(|(name, value)| (name == key && !value.is_empty()).then(|| value.into_owned()))
}

fn task_plans_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
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

fn success_response(plans: Vec<Value>) -> BackendResponse {
    no_store_response(json_response(
        200,
        json!({
            "ok": true,
            "schemaAvailable": true,
            "plans": plans,
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
            "plans": [],
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
            task_plans_ws_id("/api/v1/workspaces/ws-123/task-plans"),
            Some("ws-123")
        );
        assert_eq!(
            task_plans_ws_id("/api/v1/workspaces/personal/task-plans"),
            Some("personal")
        );
    }

    #[test]
    fn path_guard_rejects_unrelated_or_deeper_paths() {
        assert_eq!(task_plans_ws_id("/api/v1/workspaces//task-plans"), None);
        assert_eq!(
            task_plans_ws_id("/api/v1/workspaces/ws-123/task-plans/plan-1/digest"),
            None
        );
        assert_eq!(task_plans_ws_id("/api/workspaces/ws-123/task-plans"), None);
        assert_eq!(task_plans_ws_id("/api/v1/workspaces/ws-123/tasks"), None);
    }

    #[test]
    fn query_param_returns_value_and_skips_empty() {
        let url =
            Some("https://x.localhost/api/v1/workspaces/ws/task-plans?period_type=week&status=");
        assert_eq!(query_param(url, "period_type"), Some("week".to_owned()));
        assert_eq!(query_param(url, "status"), None);
        assert_eq!(query_param(url, "missing"), None);
        assert_eq!(query_param(None, "period_type"), None);
    }

    #[test]
    fn in_filter_builds_postgrest_list() {
        assert_eq!(in_filter(&["a".to_owned()]), "in.(a)");
        assert_eq!(in_filter(&["a".to_owned(), "b".to_owned()]), "in.(a,b)");
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
    fn hydrate_plans_groups_children_by_plan_id() {
        let plans = vec![
            json!({ "id": "p1", "title": "First" }),
            json!({ "id": "p2", "title": "Second" }),
        ];
        let workspaces = vec![
            json!({ "plan_id": "p1", "ws_id": "w1", "created_at": "t" }),
            json!({ "plan_id": "p2", "ws_id": "w2", "created_at": "t" }),
        ];
        let items = vec![json!({ "plan_id": "p1", "id": "i1", "status": "planned" })];
        let shares = vec![json!({ "plan_id": "p2", "id": "s1", "permission": "view" })];

        let hydrated = hydrate_plans(plans, &workspaces, &items, &shares);

        assert_eq!(hydrated.len(), 2);
        assert_eq!(hydrated[0]["title"], json!("First"));
        assert_eq!(
            hydrated[0]["workspaces"],
            json!([{ "plan_id": "p1", "ws_id": "w1", "created_at": "t" }])
        );
        assert_eq!(
            hydrated[0]["items"],
            json!([{ "plan_id": "p1", "id": "i1", "status": "planned" }])
        );
        assert_eq!(hydrated[0]["shares"], json!([]));
        assert_eq!(hydrated[1]["workspaces"].as_array().unwrap().len(), 1);
        assert_eq!(hydrated[1]["items"], json!([]));
        assert_eq!(
            hydrated[1]["shares"],
            json!([{ "plan_id": "p2", "id": "s1", "permission": "view" }])
        );
    }

    #[test]
    fn resolve_workspace_id_maps_internal_slug_to_root() {
        assert_eq!(resolve_workspace_id("internal"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("ws-123"), "ws-123");
    }
}
