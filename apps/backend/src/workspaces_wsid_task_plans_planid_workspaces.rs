//! Handler for `GET /api/v1/workspaces/:wsId/task-plans/:planId/workspaces`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/task-plans/[planId]/workspaces/route.ts`
//! (legacy methods GET, POST, DELETE — only GET is migrated here; POST and DELETE
//! return `None` so the live Next.js route still handles them).
//!
//! Legacy auth (`resolveTaskPlanRouteAuth`): resolve the authenticated session
//! user, `normalizeWorkspaceId(rawWsId)`, then `verifyWorkspaceMembershipType`
//! (default `MEMBER`). This is a membership-only gate (no workspace permission).
//! Status codes:
//!
//! - missing session / no user  -> `401 { "error": "Unauthorized" }`
//! - membership lookup failure  -> `500 { "error": "Failed to verify workspace membership" }`
//! - not a workspace member     -> `403 { "error": "Workspace access denied" }`
//!
//! Then `requireTaskPlanAccess({ permission: 'view' })` calls the
//! `can_access_task_plan(p_plan_id, p_required_permission, p_user_id)` RPC with
//! the caller's token (RLS active):
//!
//! - schema-unavailable error -> `200 { ok:false, code:"schema_unavailable", ..., workspaces:[] }`
//! - other RPC failure        -> `500 { "error": "Failed to verify task plan access" }`
//! - result not `true`        -> `403 { "error": "Task plan access denied" }`
//!
//! On success the GET reads `task_plan_workspaces` selecting `plan_id,ws_id,created_at`
//! filtered by `plan_id = planId` with the caller's token (RLS active), and returns
//! `{ ok: true, schemaAvailable: true, workspaces: [...] }`.
//!
//! NOTE / behavior gaps:
//!
//! - The legacy "schema unavailable" detection inspects PostgREST error
//!   codes/messages. Here it is approximated by HTTP status (`400 | 404 | 406`),
//!   mirroring the sibling `workspaces_wsid_task_plans_planid` handler.
//! - Only GET is migrated; POST and DELETE return `None` so the live Next.js
//!   route handles them.

use serde::Deserialize;
use serde_json::{Value, json};

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
const LIST_FAILED_MESSAGE: &str = "Failed to list task plan workspaces";
const SCHEMA_UNAVAILABLE_MESSAGE: &str =
    "Task plans are not available until the latest database migration is applied.";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const CAN_ACCESS_TASK_PLAN_RPC: &str = "can_access_task_plan";
const VIEW_PERMISSION: &str = "view";

const TASK_PLAN_WORKSPACES_SELECT: &str = "plan_id,ws_id,created_at";

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

pub(crate) async fn handle_workspaces_wsid_task_plans_planid_workspaces_route(
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

    match check_task_plan_access(contact_data, outbound, plan_id, &user_id, &access_token).await {
        FetchResult::Ok(true) => {}
        FetchResult::Ok(false) => return error_response(403, PLAN_ACCESS_DENIED_MESSAGE),
        FetchResult::SchemaUnavailable => return schema_unavailable_response(),
        FetchResult::Error => return error_response(500, VERIFY_ACCESS_FAILED_MESSAGE),
    }

    match fetch_plan_workspaces(contact_data, outbound, plan_id, &access_token).await {
        FetchResult::Ok(workspaces) => success_response(workspaces),
        FetchResult::SchemaUnavailable => schema_unavailable_response(),
        FetchResult::Error => error_response(500, LIST_FAILED_MESSAGE),
    }
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

    match response.json::<Value>() {
        Ok(value) => FetchResult::Ok(value.as_bool() == Some(true)),
        Err(_) => FetchResult::Error,
    }
}

async fn fetch_plan_workspaces(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    plan_id: &str,
    access_token: &str,
) -> FetchResult<Vec<Value>> {
    let Some(url) = contact_data.rest_url(
        "task_plan_workspaces",
        &[
            ("select", TASK_PLAN_WORKSPACES_SELECT.to_owned()),
            ("plan_id", format!("eq.{plan_id}")),
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

/// Extract `(wsId, planId)` from the exact mount path
/// `/api/v1/workspaces/:wsId/task-plans/:planId/workspaces`.
///
/// Returns `None` for any other path shape so the shared dispatch chain keeps
/// running other handlers / Next.js.
fn extract_ids(path: &str) -> Option<(&str, &str)> {
    let segments: Vec<&str> = path.split('/').collect();
    if segments.len() != 8 {
        return None;
    }
    if segments.get(1) != Some(&"api")
        || segments.get(2) != Some(&"v1")
        || segments.get(3) != Some(&"workspaces")
        || segments.get(5) != Some(&"task-plans")
        || segments.get(7) != Some(&"workspaces")
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

fn success_response(workspaces: Vec<Value>) -> BackendResponse {
    no_store_response(json_response(
        200,
        json!({
            "ok": true,
            "schemaAvailable": true,
            "workspaces": workspaces,
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
            "workspaces": [],
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
            extract_ids("/api/v1/workspaces/ws-123/task-plans/plan-1/workspaces"),
            Some(("ws-123", "plan-1"))
        );
        assert_eq!(
            extract_ids("/api/v1/workspaces/personal/task-plans/abc/workspaces"),
            Some(("personal", "abc"))
        );
        assert_eq!(
            extract_ids(
                "/api/v1/workspaces/00000000-0000-0000-0000-000000000000/task-plans/plan-abc/workspaces"
            ),
            Some(("00000000-0000-0000-0000-000000000000", "plan-abc"))
        );
    }

    #[test]
    fn path_guard_rejects_unrelated_or_short_paths() {
        // Too short.
        assert_eq!(
            extract_ids("/api/v1/workspaces/ws-123/task-plans/plan-1"),
            None
        );
        assert_eq!(extract_ids("/api/v1/workspaces"), None);
        assert_eq!(extract_ids("/"), None);
        assert_eq!(extract_ids(""), None);
        // Wrong terminal segment.
        assert_eq!(
            extract_ids("/api/v1/workspaces/ws-123/task-plans/plan-1/shares"),
            None
        );
        // No v1.
        assert_eq!(
            extract_ids("/api/workspaces/ws-123/task-plans/plan-1/workspaces"),
            None
        );
        // Deeper path (9 segments).
        assert_eq!(
            extract_ids("/api/v1/workspaces/ws-123/task-plans/plan-1/workspaces/extra"),
            None
        );
        // Empty dynamic segments.
        assert_eq!(
            extract_ids("/api/v1/workspaces//task-plans/plan-1/workspaces"),
            None
        );
        assert_eq!(
            extract_ids("/api/v1/workspaces/ws-123/task-plans//workspaces"),
            None
        );
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
    fn resolve_workspace_id_maps_internal_slug_to_root() {
        assert_eq!(resolve_workspace_id("internal"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("INTERNAL"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("ws-123"), "ws-123");
    }

    #[test]
    fn workspace_uuid_literal_detection() {
        assert!(is_workspace_uuid_literal(
            "00000000-0000-0000-0000-000000000000"
        ));
        assert!(is_workspace_uuid_literal(
            "550e8400-e29b-41d4-a716-446655440000"
        ));
        assert!(!is_workspace_uuid_literal("personal"));
        assert!(!is_workspace_uuid_literal("internal"));
        assert!(!is_workspace_uuid_literal(""));
    }
}
