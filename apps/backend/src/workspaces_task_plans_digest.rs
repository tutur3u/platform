use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const CAN_ACCESS_TASK_PLAN_RPC: &str = "can_access_task_plan";
const FORBIDDEN_PLAN_MESSAGE: &str = "Task plan access denied";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace membership";
const WORKSPACE_ACCESS_DENIED_MESSAGE: &str = "Workspace access denied";
const ACCESS_VERIFY_FAILED_MESSAGE: &str = "Failed to verify task plan access";
const DIGEST_FAILED_MESSAGE: &str = "Failed to generate task plan digest";
const SCHEMA_UNAVAILABLE_MESSAGE: &str =
    "Task plans are not available until the latest database migration is applied.";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Serialize)]
struct CanAccessTaskPlanRequest<'a> {
    p_plan_id: &'a str,
    p_required_permission: &'a str,
    p_user_id: &'a str,
}

#[derive(Deserialize)]
struct TaskPlanRow {
    title: Option<String>,
    period_start: Option<String>,
    period_end: Option<String>,
}

#[derive(Deserialize)]
struct TaskPlanItemRow {
    planned_start: Option<String>,
    sort_key: Option<f64>,
    snapshot_title: Option<String>,
    target_ws_id: Option<String>,
}

pub(crate) async fn handle_workspaces_task_plans_digest_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, plan_id) = task_plan_digest_path(request.path)?;

    Some(match request.method {
        "GET" => digest_response(config, request, raw_ws_id, plan_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn digest_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    plan_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

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

    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(403, WORKSPACE_ACCESS_DENIED_MESSAGE),
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    // Verify task plan access via the can_access_task_plan RPC (security definer).
    match can_access_task_plan(contact_data, outbound, plan_id, &user_id).await {
        TaskPlanAccess::Granted => {}
        TaskPlanAccess::Denied => return error_response(403, FORBIDDEN_PLAN_MESSAGE),
        TaskPlanAccess::SchemaUnavailable => return schema_unavailable_response(),
        TaskPlanAccess::Error => return error_response(500, ACCESS_VERIFY_FAILED_MESSAGE),
    }

    let plan = match fetch_task_plan(contact_data, outbound, plan_id).await {
        FetchResult::Ok(Some(plan)) => plan,
        FetchResult::Ok(None) => return error_response(500, DIGEST_FAILED_MESSAGE),
        FetchResult::SchemaUnavailable => return schema_unavailable_response(),
        FetchResult::Error => return error_response(500, DIGEST_FAILED_MESSAGE),
    };

    let items = match fetch_task_plan_items(contact_data, outbound, plan_id).await {
        FetchResult::Ok(items) => items,
        FetchResult::SchemaUnavailable => return schema_unavailable_response(),
        FetchResult::Error => return error_response(500, DIGEST_FAILED_MESSAGE),
    };

    let item_count = items.len();
    let digest = build_task_plan_digest(&plan, &items);

    no_store_response(json_response(
        200,
        json!({
            "ok": true,
            "schemaAvailable": true,
            "digest": digest,
            "itemCount": item_count,
        }),
    ))
}

enum TaskPlanAccess {
    Granted,
    Denied,
    SchemaUnavailable,
    Error,
}

enum FetchResult<T> {
    Ok(T),
    SchemaUnavailable,
    Error,
}

async fn can_access_task_plan(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    plan_id: &str,
    user_id: &str,
) -> TaskPlanAccess {
    let Some(rpc_url) = contact_data.rpc_url(CAN_ACCESS_TASK_PLAN_RPC) else {
        return TaskPlanAccess::Error;
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return TaskPlanAccess::Error;
    };
    let Ok(body) = serde_json::to_string(&CanAccessTaskPlanRequest {
        p_plan_id: plan_id,
        p_required_permission: "view",
        p_user_id: user_id,
    }) else {
        return TaskPlanAccess::Error;
    };
    let authorization = format!("Bearer {service_role_key}");
    let response = match outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
    {
        Ok(response) => response,
        Err(_) => return TaskPlanAccess::Error,
    };

    if !(200..300).contains(&response.status) {
        // A missing function / schema is treated as schema-unavailable, mirroring
        // the legacy isTaskPlanSchemaUnavailableError fallback.
        if is_schema_unavailable_status(response.status) {
            return TaskPlanAccess::SchemaUnavailable;
        }
        return TaskPlanAccess::Error;
    }

    match response.json::<bool>() {
        Ok(true) => TaskPlanAccess::Granted,
        Ok(false) => TaskPlanAccess::Denied,
        Err(_) => TaskPlanAccess::Error,
    }
}

async fn fetch_task_plan(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    plan_id: &str,
) -> FetchResult<Option<TaskPlanRow>> {
    let Some(url) = contact_data.rest_url(
        "task_plans",
        &[
            ("select", "title,period_start,period_end".to_owned()),
            ("id", format!("eq.{plan_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return FetchResult::Error;
    };

    let response = match send_service_role_get(contact_data, outbound, &url).await {
        Ok(response) => response,
        Err(()) => return FetchResult::Error,
    };

    if !(200..300).contains(&response.status) {
        if is_schema_unavailable_status(response.status) {
            return FetchResult::SchemaUnavailable;
        }
        return FetchResult::Error;
    }

    match response.json::<Vec<TaskPlanRow>>() {
        Ok(rows) => FetchResult::Ok(rows.into_iter().next()),
        Err(_) => FetchResult::Error,
    }
}

async fn fetch_task_plan_items(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    plan_id: &str,
) -> FetchResult<Vec<TaskPlanItemRow>> {
    let Some(url) = contact_data.rest_url(
        "task_plan_items",
        &[
            (
                "select",
                "planned_start,sort_key,snapshot_title,target_ws_id".to_owned(),
            ),
            ("plan_id", format!("eq.{plan_id}")),
            (
                "order",
                "planned_start.asc.nullslast,sort_key.asc".to_owned(),
            ),
        ],
    ) else {
        return FetchResult::Error;
    };

    let response = match send_service_role_get(contact_data, outbound, &url).await {
        Ok(response) => response,
        Err(()) => return FetchResult::Error,
    };

    if !(200..300).contains(&response.status) {
        if is_schema_unavailable_status(response.status) {
            return FetchResult::SchemaUnavailable;
        }
        return FetchResult::Error;
    }

    match response.json::<Vec<TaskPlanItemRow>>() {
        Ok(rows) => FetchResult::Ok(rows),
        Err(_) => FetchResult::Error,
    }
}

fn build_task_plan_digest(plan: &TaskPlanRow, items: &[TaskPlanItemRow]) -> String {
    let title = plan.title.as_deref().unwrap_or("");
    let period_start = plan.period_start.as_deref().unwrap_or("");
    let period_end = plan.period_end.as_deref().unwrap_or("");

    let mut lines: Vec<String> = vec![
        format!("# {title}"),
        String::new(),
        format!("{period_start} to {period_end}"),
        String::new(),
    ];

    // Group items by planned_start (or "Unscheduled"), preserving insertion order.
    let mut group_keys: Vec<String> = Vec::new();
    let mut grouped: Vec<(String, Vec<&TaskPlanItemRow>)> = Vec::new();

    for item in items {
        let key = item
            .planned_start
            .clone()
            .unwrap_or_else(|| "Unscheduled".to_owned());
        if let Some(index) = group_keys.iter().position(|existing| existing == &key) {
            grouped[index].1.push(item);
        } else {
            group_keys.push(key.clone());
            grouped.push((key, vec![item]));
        }
    }

    // Sort group keys lexicographically (matches String.localeCompare ordering for
    // the date/"Unscheduled" keys used here).
    grouped.sort_by(|a, b| a.0.cmp(&b.0));

    for (date, group_items) in &mut grouped {
        lines.push(format!("## {date}"));

        // Stable sort by sort_key ascending (default 0 when null).
        group_items.sort_by(|a, b| {
            let a_key = a.sort_key.unwrap_or(0.0);
            let b_key = b.sort_key.unwrap_or(0.0);
            a_key
                .partial_cmp(&b_key)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        for item in group_items.iter() {
            // The select does not join the task row, so the title always falls back
            // to snapshot_title, then "Untitled task".
            let item_title = item.snapshot_title.as_deref().unwrap_or("Untitled task");
            let scope = match item.target_ws_id.as_deref() {
                Some(ws) if !ws.is_empty() => format!(" ({ws})"),
                _ => String::new(),
            };
            lines.push(format!("- {item_title}{scope}"));
        }

        lines.push(String::new());
    }

    lines.join("\n").trim().to_owned()
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
            workspace_id_by_handle(contact_data, outbound, &handle, access_token).await?
        {
            return Ok(workspace_id);
        }
        if let Some(workspace_id) =
            workspace_id_by_handle_service_role(contact_data, outbound, &handle).await?
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
    access_token: &str,
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
    let response = send_caller_get(contact_data, outbound, &url, access_token).await?;

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

async fn workspace_id_by_handle_service_role(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
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
    let response = send_service_role_get(contact_data, outbound, &url).await?;

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
    let response = send_service_role_get(contact_data, outbound, &url).await?;

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
    // PostgREST returns 404 for a missing function/relation and 400/406 for
    // unknown columns; treat those as the legacy "schema unavailable" fallback.
    matches!(status, 400 | 404 | 406)
}

fn task_plan_digest_path(path: &str) -> Option<(&str, &str)> {
    let segments = path_segments(path);

    if segments.len() == 7
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && !segments[3].is_empty()
        && segments[4] == "task-plans"
        && !segments[5].is_empty()
        && segments[6] == "digest"
    {
        Some((segments[3], segments[5]))
    } else {
        None
    }
}

fn path_segments(path: &str) -> Vec<&str> {
    path.trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect()
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

fn schema_unavailable_response() -> BackendResponse {
    no_store_response(json_response(
        200,
        json!({
            "ok": false,
            "code": "schema_unavailable",
            "schemaAvailable": false,
            "message": SCHEMA_UNAVAILABLE_MESSAGE,
            "digest": "",
        }),
    ))
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
