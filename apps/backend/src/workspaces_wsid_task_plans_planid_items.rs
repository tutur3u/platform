//! GET /api/v1/workspaces/:wsId/task-plans/:planId/items
//!
//! Faithfully ports the legacy Next.js GET handler from:
//! `apps/web/src/app/api/v1/workspaces/[wsId]/task-plans/[planId]/items/route.ts`
//!
//! Auth model (mirrors `resolveTaskPlanRouteAuth` + `requireTaskPlanAccess`):
//!
//! 1. Extract caller JWT from the Authorization header.
//! 2. Resolve the authenticated user via Supabase Auth.
//! 3. Normalize the workspace ID (personal/internal slugs → UUID).
//! 4. Verify workspace membership (service-role lookup, must be type MEMBER).
//! 5. Call the `can_access_task_plan` RPC with permission `"view"`.
//! 6. Fetch `task_plan_items` ordered by `planned_start asc nulls last`,
//!    then `sort_key asc`, using the full column projection defined in
//!    `TASK_PLAN_ITEM_SELECT`.
//! 7. Return `{ ok: true, schemaAvailable: true, items: [...] }`.
//!
//! Behavior gaps vs. legacy:
//!
//! - The legacy route uses the Supabase JS client with RLS (caller JWT for the
//!   RPC, admin client elsewhere). This port uses service-role for membership
//!   and plan-item reads; the `can_access_task_plan` RPC is called with the
//!   service-role key but passes `p_user_id` explicitly, matching the digest
//!   handler pattern already established in `workspaces_task_plans_digest.rs`.
//! - POST / PATCH / DELETE are NOT handled here — `None` is returned so the
//!   dispatch chain falls through to the still-live Next.js route.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CAN_ACCESS_TASK_PLAN_RPC: &str = "can_access_task_plan";
const TASK_PLAN_ITEM_SELECT: &str = "id,plan_id,task_id,target_ws_id,target_board_id,target_list_id,\
     planned_start,planned_end,sort_key,status,notes,snapshot_title,\
     created_by_user_id,created_at,updated_at";
const ITEMS_ORDER: &str = "planned_start.asc.nullslast,sort_key.asc";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace membership";
const WORKSPACE_ACCESS_DENIED_MESSAGE: &str = "Workspace access denied";
const FORBIDDEN_PLAN_MESSAGE: &str = "Task plan access denied";
const ACCESS_VERIFY_FAILED_MESSAGE: &str = "Failed to verify task plan access";
const LIST_ITEMS_FAILED_MESSAGE: &str = "Failed to list task plan items";
const SCHEMA_UNAVAILABLE_MESSAGE: &str =
    "Task plans are not available until the latest database migration is applied.";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Public handler
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_task_plans_planid_items_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, plan_id) = items_path(request.path)?;

    Some(match request.method {
        "GET" => get_items_response(config, request, raw_ws_id, plan_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET response
// ---------------------------------------------------------------------------

async fn get_items_response(
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

    match can_access_task_plan(contact_data, outbound, plan_id, &user_id).await {
        TaskPlanAccess::Granted => {}
        TaskPlanAccess::Denied => return error_response(403, FORBIDDEN_PLAN_MESSAGE),
        TaskPlanAccess::SchemaUnavailable => return schema_unavailable_response(),
        TaskPlanAccess::Error => return error_response(500, ACCESS_VERIFY_FAILED_MESSAGE),
    }

    let items = match fetch_task_plan_items(contact_data, outbound, plan_id).await {
        FetchResult::Ok(rows) => rows,
        FetchResult::SchemaUnavailable => return schema_unavailable_response(),
        FetchResult::Error => return error_response(500, LIST_ITEMS_FAILED_MESSAGE),
    };

    no_store_response(json_response(
        200,
        json!({
            "ok": true,
            "schemaAvailable": true,
            "items": items,
        }),
    ))
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

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

async fn fetch_task_plan_items(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    plan_id: &str,
) -> FetchResult<Vec<Value>> {
    let Some(url) = contact_data.rest_url(
        "task_plan_items",
        &[
            ("select", TASK_PLAN_ITEM_SELECT.to_owned()),
            ("plan_id", format!("eq.{plan_id}")),
            ("order", ITEMS_ORDER.to_owned()),
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

    match response.json::<Vec<Value>>() {
        Ok(rows) => FetchResult::Ok(rows),
        Err(_) => FetchResult::Error,
    }
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
        if is_direct_workspace_lookup_identifier(&handle) {
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

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

fn items_path(path: &str) -> Option<(&str, &str)> {
    let segments = path_segments(path);

    // Expects exactly 7 segments:
    // api / v1 / workspaces / {wsId} / task-plans / {planId} / items
    if segments.len() == 7
        && segments.first() == Some(&"api")
        && segments.get(1) == Some(&"v1")
        && segments.get(2) == Some(&"workspaces")
        && segments.get(3).map(|s| !s.is_empty()).unwrap_or(false)
        && segments.get(4) == Some(&"task-plans")
        && segments.get(5).map(|s| !s.is_empty()).unwrap_or(false)
        && segments.get(6) == Some(&"items")
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

// ---------------------------------------------------------------------------
// Workspace ID resolution helpers (mirrors the digest handler exactly)
// ---------------------------------------------------------------------------

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
            .all(|(index, ch)| match index {
                8 | 13 | 18 | 23 => ch == '-',
                _ => ch.is_ascii_hexdigit(),
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

// ---------------------------------------------------------------------------
// Response builders
// ---------------------------------------------------------------------------

fn is_schema_unavailable_status(status: u16) -> bool {
    // PostgREST returns 404 for a missing function/relation and 400/406 for
    // unknown columns; treat those as the legacy "schema unavailable" fallback.
    matches!(status, 400 | 404 | 406)
}

fn schema_unavailable_response() -> BackendResponse {
    no_store_response(json_response(
        200,
        json!({
            "ok": false,
            "code": "schema_unavailable",
            "schemaAvailable": false,
            "message": SCHEMA_UNAVAILABLE_MESSAGE,
            "items": [],
        }),
    ))
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // --- items_path ---

    #[test]
    fn path_matches_exact_structure() {
        let result = items_path("/api/v1/workspaces/ws-123/task-plans/plan-456/items");
        assert_eq!(result, Some(("ws-123", "plan-456")));
    }

    #[test]
    fn path_with_uuid_segments() {
        let ws = "00000000-0000-0000-0000-000000000001";
        let plan = "00000000-0000-0000-0000-000000000002";
        let path = format!("/api/v1/workspaces/{ws}/task-plans/{plan}/items");
        assert_eq!(items_path(&path), Some((ws, plan)));
    }

    #[test]
    fn path_missing_items_suffix_returns_none() {
        assert!(items_path("/api/v1/workspaces/ws-123/task-plans/plan-456").is_none());
    }

    #[test]
    fn path_extra_trailing_segment_returns_none() {
        assert!(items_path("/api/v1/workspaces/ws-123/task-plans/plan-456/items/extra").is_none());
    }

    #[test]
    fn path_wrong_static_segment_returns_none() {
        assert!(items_path("/api/v1/workspaces/ws-123/task-plans/plan-456/other").is_none());
    }

    #[test]
    fn path_empty_ws_id_returns_none() {
        assert!(items_path("/api/v1/workspaces//task-plans/plan-456/items").is_none());
    }

    #[test]
    fn path_empty_plan_id_returns_none() {
        assert!(items_path("/api/v1/workspaces/ws-123/task-plans//items").is_none());
    }

    #[test]
    fn path_no_v1_returns_none() {
        assert!(items_path("/api/workspaces/ws-123/task-plans/plan-456/items").is_none());
    }

    // --- workspace ID resolution helpers ---

    #[test]
    fn resolve_workspace_id_internal_slug() {
        assert_eq!(resolve_workspace_id("internal"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("INTERNAL"), ROOT_WORKSPACE_ID);
    }

    #[test]
    fn resolve_workspace_id_uuid_passthrough() {
        let uuid = "12345678-1234-1234-1234-123456789abc";
        assert_eq!(resolve_workspace_id(uuid), uuid);
    }

    #[test]
    fn is_workspace_uuid_literal_valid() {
        assert!(is_workspace_uuid_literal(
            "12345678-1234-1234-1234-123456789abc"
        ));
    }

    #[test]
    fn is_workspace_uuid_literal_wrong_length() {
        assert!(!is_workspace_uuid_literal("12345678-1234-1234-1234"));
    }

    #[test]
    fn is_workspace_handle_valid() {
        assert!(is_workspace_handle("my-workspace"));
        assert!(is_workspace_handle("ws123"));
    }

    #[test]
    fn is_workspace_handle_leading_hyphen() {
        assert!(!is_workspace_handle("-bad"));
    }

    #[test]
    fn is_workspace_handle_empty() {
        assert!(!is_workspace_handle(""));
    }

    // --- is_schema_unavailable_status ---

    #[test]
    fn schema_unavailable_statuses() {
        assert!(is_schema_unavailable_status(400));
        assert!(is_schema_unavailable_status(404));
        assert!(is_schema_unavailable_status(406));
        assert!(!is_schema_unavailable_status(200));
        assert!(!is_schema_unavailable_status(500));
    }
}
