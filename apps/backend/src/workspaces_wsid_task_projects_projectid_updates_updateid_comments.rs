//! Handler for
//! `GET /api/v1/workspaces/:wsId/task-projects/:projectId/updates/:updateId/comments`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/task-projects/[projectId]/updates/[updateId]/comments/route.ts`.
//!
//! Auth model reproduced:
//!
//! - Resolve the caller's Supabase session (cookie or `Bearer` token) to a user id;
//!   missing or invalid session -> `401 { "error": "Unauthorized" }`.
//! - Verify the caller has any `workspace_members` row for `:wsId`; lookup
//!   failure -> `500 { "error": "Failed to verify workspace access" }`, non-member
//!   -> `403 { "error": "Forbidden" }`.
//! - Verify `:projectId` belongs to `:wsId` and `:updateId` belongs to that
//!   project before any service-role comment fetch; no matching row ->
//!   `404 { "error": "Update not found" }`.
//! - Fetch `task_project_update_comments` filtered by `update_id`, not deleted,
//!   ordered by `created_at ASC`; fetch failure ->
//!   `500 { "error": "Failed to fetch comments" }`.
//!
//! On success the legacy route builds a threaded comment tree and returns
//! `200 { "comments": [...topLevelComments] }` with no explicit cache headers
//! (this port adds `Cache-Control: no-store` to match worker defaults).
//!
//! NOTE / GAPS:
//!
//! - The legacy route reads comments through the caller's RLS-scoped Supabase
//!   client. This port uses the service-role key after independently confirming
//!   workspace membership and update/project/workspace ownership.
//! - The legacy membership check accepts any membership type (MEMBER or GUEST).
//!   This port mirrors that by checking for the existence of any
//!   `workspace_members` row, not just `type = MEMBER`.
//! - The `POST` method is not migrated; `None` is returned so the worker falls
//!   through to the still-active Next.js route.

use serde_json::{Value, json};
use std::collections::HashMap;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const TASK_PROJECTS_SEG: &str = "/task-projects/";
const UPDATES_SEG: &str = "/updates/";
const COMMENTS_SUFFIX: &str = "/comments";

const UNAUTHORIZED_ERROR: &str = "Unauthorized";
const LOOKUP_FAILED_ERROR: &str = "Failed to verify workspace access";
const FORBIDDEN_ERROR: &str = "Forbidden";
const FETCH_ERROR: &str = "Failed to fetch comments";
const UPDATE_NOT_FOUND_ERROR: &str = "Update not found";

struct CommentEntry {
    id: String,
    parent_id: Option<String>,
    data: serde_json::Map<String, Value>,
}

pub(crate) async fn handle_workspaces_wsid_task_projects_projectid_updates_updateid_comments_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (ws_id, project_id, update_id) = match_path(request.path)?;

    Some(match request.method {
        "GET" => get_comments(config, request, ws_id, project_id, update_id, outbound).await,
        _ => return None,
    })
}

fn match_path(path: &str) -> Option<(&str, &str, &str)> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let (ws_id, rest) = rest.split_once(TASK_PROJECTS_SEG)?;
    let (project_id, rest) = rest.split_once(UPDATES_SEG)?;
    let update_id = rest.strip_suffix(COMMENTS_SUFFIX)?;

    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }
    if project_id.is_empty() || project_id.contains('/') {
        return None;
    }
    if update_id.is_empty() || update_id.contains('/') {
        return None;
    }

    Some((ws_id, project_id, update_id))
}

async fn get_comments(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    project_id: &str,
    update_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return err_response(500, FETCH_ERROR);
    }

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return err_response(401, UNAUTHORIZED_ERROR);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|u| u.id.filter(|id| !id.trim().is_empty()))
    else {
        return err_response(401, UNAUTHORIZED_ERROR);
    };

    match verify_any_workspace_member(contact_data, outbound, ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return err_response(403, FORBIDDEN_ERROR),
        Err(()) => return err_response(500, LOOKUP_FAILED_ERROR),
    }

    match verify_update_scope(contact_data, outbound, ws_id, project_id, update_id).await {
        Ok(true) => {}
        Ok(false) => return err_response(404, UPDATE_NOT_FOUND_ERROR),
        Err(()) => return err_response(500, FETCH_ERROR),
    }

    match fetch_comments(contact_data, outbound, update_id).await {
        Ok(raw) => {
            let threaded = build_comment_tree(raw);
            no_store_response(json_response(200, json!({ "comments": threaded })))
        }
        Err(()) => err_response(500, FETCH_ERROR),
    }
}

async fn verify_any_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
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
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    Ok(!rows.is_empty())
}

async fn verify_update_scope(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    project_id: &str,
    update_id: &str,
) -> Result<bool, ()> {
    let project_url = contact_data
        .rest_url(
            "task_projects",
            &[
                ("select", "id".to_owned()),
                ("id", format!("eq.{project_id}")),
                ("ws_id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let project_response = service_role_get(contact_data, outbound, &project_url).await?;
    if !(200..300).contains(&project_response.status) {
        return Err(());
    }
    let project_rows = project_response.json::<Vec<Value>>().map_err(|_| ())?;
    if project_rows.is_empty() {
        return Ok(false);
    }

    let update_url = contact_data
        .rest_url(
            "task_project_updates",
            &[
                ("select", "id".to_owned()),
                ("id", format!("eq.{update_id}")),
                ("project_id", format!("eq.{project_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let update_response = service_role_get(contact_data, outbound, &update_url).await?;
    if !(200..300).contains(&update_response.status) {
        return Err(());
    }
    let update_rows = update_response.json::<Vec<Value>>().map_err(|_| ())?;
    Ok(!update_rows.is_empty())
}

async fn fetch_comments(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    update_id: &str,
) -> Result<Vec<Value>, ()> {
    let url = contact_data
        .rest_url(
            "task_project_update_comments",
            &[
                (
                    "select",
                    "*,user:users(id,display_name,avatar_url)".to_owned(),
                ),
                ("update_id", format!("eq.{update_id}")),
                ("deleted_at", "is.null".to_owned()),
                ("order", "created_at.asc".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    response.json::<Vec<Value>>().map_err(|_| ())
}

async fn service_role_get(
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

fn build_comment_tree(raw: Vec<Value>) -> Vec<Value> {
    let items: Vec<CommentEntry> = raw
        .into_iter()
        .filter_map(|v| {
            let mut obj = match v {
                Value::Object(o) => o,
                _ => return None,
            };
            let id = obj.get("id").and_then(Value::as_str)?.to_owned();
            let parent_id = match obj.get("parent_id") {
                Some(Value::String(s)) if !s.is_empty() => Some(s.clone()),
                _ => None,
            };
            obj.insert("replies".to_owned(), json!([]));
            Some(CommentEntry {
                id,
                parent_id,
                data: obj,
            })
        })
        .collect();

    let mut children: HashMap<String, Vec<usize>> = HashMap::new();
    let mut top_level: Vec<usize> = Vec::new();

    for (i, item) in items.iter().enumerate() {
        match &item.parent_id {
            Some(pid) => children.entry(pid.clone()).or_default().push(i),
            None => top_level.push(i),
        }
    }

    fn build_node(
        index: usize,
        items: &[CommentEntry],
        children: &HashMap<String, Vec<usize>>,
    ) -> Value {
        let item = &items[index];
        let mut obj = item.data.clone();
        let replies: Vec<Value> = children
            .get(&item.id)
            .map(|child_indices| {
                child_indices
                    .iter()
                    .map(|&ci| build_node(ci, items, children))
                    .collect()
            })
            .unwrap_or_default();
        obj.insert("replies".to_owned(), json!(replies));
        Value::Object(obj)
    }

    top_level
        .iter()
        .map(|&i| build_node(i, &items, &children))
        .collect()
}

fn err_response(status: u16, error: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": error })))
}

#[cfg(test)]
mod tests;
