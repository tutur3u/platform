//! Handler for `GET /api/v1/workspaces/:wsId/task-projects/:projectId/tasks`.
//!
//! Ports the legacy Next.js GET handler at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/task-projects/[projectId]/tasks/route.ts`.
//!
//! ## Auth model
//!
//! The legacy verifies a Supabase session user then calls
//! `verifyWorkspaceMembershipType` — any membership type is accepted; no
//! specific permission string is required. Reproduced here by:
//!
//! 1. Extracting the caller's Supabase access token (bearer or cookie).
//! 2. Resolving `user_id` via the Supabase Auth `/user` endpoint.
//! 3. Querying `workspace_members` with the caller token (RLS) — any row
//!    returned means membership is confirmed.
//!
//! ## Behavior gaps
//!
//! - Workspace-ID normalization only handles UUID literals, `"internal"`, and
//!   the `"personal"` slug. Handle-based slugs fall back to the raw value
//!   (membership check returns 403 for non-existent identifiers). The
//!   dashboard always sends UUIDs in practice.
//! - The `created_at` null default for lists uses a static epoch string
//!   instead of the legacy `new Date().toISOString()`.
//! - POST and all non-GET methods return `None` so Next.js serves mutations.

use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const TASK_PROJECTS_MIDDLE: &str = "/task-projects/";
const TASKS_SUFFIX: &str = "/tasks";
const PERSONAL_SLUG: &str = "personal";
const INTERNAL_SLUG: &str = "internal";
const ROOT_WS_ID: &str = "00000000-0000-0000-0000-000000000000";

const PROJ_TASKS_SELECT: &str = "task:tasks!inner(*,task_lists(name,status,workspace_boards(ws_id)),\
     assignees:task_assignees(user:users(id,display_name,avatar_url)),\
     labels:task_labels(label:workspace_task_labels(id,name,color,created_at)),\
     projects:task_project_tasks(project:task_projects(id,name,status)))";

pub(crate) async fn handle_workspaces_wsid_task_projects_projectid_tasks_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, project_id) = extract_path_ids(request.path)?;
    Some(match request.method {
        "GET" => get_response(config, request, raw_ws_id, project_id, outbound).await,
        _ => return None,
    })
}

async fn get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    project_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let cd = &config.contact_data;
    if !cd.configured() {
        return err(500, "Internal server error");
    }

    // 1. Auth: resolve session user.
    let token = match supabase_auth::request_access_token(request) {
        Some(t) => t,
        None => return err(401, "Unauthorized"),
    };
    let user = match supabase_auth::fetch_supabase_auth_user(cd, &token, outbound).await {
        Some(u) => u,
        None => return err(401, "Unauthorized"),
    };
    let user_id = match user.id.filter(|id| !id.trim().is_empty()) {
        Some(id) => id,
        None => return err(401, "Unauthorized"),
    };

    // 2. Normalize workspace ID.
    let ws_id = match resolve_ws_id(cd, outbound, raw_ws_id, &user_id, &token).await {
        Ok(Some(id)) => id,
        Ok(None) => return err(404, "Workspace not found"),
        Err(()) => return err(500, "Internal server error"),
    };

    // 3. Verify workspace membership (any type).
    match check_membership(cd, outbound, &ws_id, &user_id, &token).await {
        Ok(true) => {}
        Ok(false) => return err(403, "Forbidden"),
        Err(()) => return err(500, "Membership lookup failed"),
    }

    let srk = match cd.service_role_key() {
        Some(k) => k.to_owned(),
        None => return err(500, "Internal server error"),
    };

    // 4. Verify project belongs to workspace (service-role).
    match check_project_ws(cd, outbound, &srk, project_id, &ws_id).await {
        Ok(true) => {}
        Ok(false) => return err(404, "Project not found"),
        Err(()) => return err(500, "Failed to load project"),
    }

    // 5. Fetch tasks with nested relations (service-role).
    let rows = match service_role_get_json(
        cd,
        outbound,
        &srk,
        "task_project_tasks",
        &[
            ("select", PROJ_TASKS_SELECT.to_owned()),
            ("project_id", format!("eq.{project_id}")),
            ("task.deleted_at", "is.null".to_owned()),
        ],
    )
    .await
    {
        Ok(v) => v,
        Err(()) => return err(500, "Failed to fetch project tasks"),
    };

    // 6. Filter tasks: non-deleted and matching workspace.
    let raw_tasks: Vec<Value> = rows
        .into_iter()
        .filter_map(|row| {
            let task = row.get("task")?.clone();
            if task
                .get("deleted_at")
                .map(|v| !v.is_null())
                .unwrap_or(false)
            {
                return None;
            }
            let board_ws_matches = task
                .get("task_lists")
                .and_then(|tl| tl.get("workspace_boards"))
                .and_then(|wb| wb.get("ws_id"))
                .and_then(Value::as_str)
                == Some(ws_id.as_str());
            board_ws_matches.then_some(task)
        })
        .collect();

    // 7. Split work tasks / document tasks.
    fn task_list_status(t: &Value) -> Option<&str> {
        t.get("task_lists")
            .and_then(|tl| tl.get("status"))
            .and_then(Value::as_str)
    }
    let work_tasks: Vec<Value> = raw_tasks
        .iter()
        .filter(|t| task_list_status(t) != Some("documents"))
        .cloned()
        .collect();
    let doc_tasks: Vec<Value> = raw_tasks
        .iter()
        .filter(|t| task_list_status(t) == Some("documents"))
        .cloned()
        .collect();

    // 8. Collect unique list IDs from work tasks.
    let mut list_ids: Vec<String> = Vec::new();
    for task in &work_tasks {
        if let Some(id) = task.get("list_id").and_then(Value::as_str) {
            let owned = id.to_owned();
            if !list_ids.contains(&owned) {
                list_ids.push(owned);
            }
        }
    }

    // 9. Fetch task lists (service-role).
    let raw_lists = if list_ids.is_empty() {
        Vec::new()
    } else {
        let ids_str = list_ids.join(",");
        match service_role_get_json(
            cd,
            outbound,
            &srk,
            "task_lists",
            &[
                ("select", "*".to_owned()),
                ("id", format!("in.({ids_str})")),
                ("deleted", "eq.false".to_owned()),
            ],
        )
        .await
        {
            Ok(lists) => lists,
            Err(()) => return err(500, "Failed to fetch task lists"),
        }
    };

    no_store_response(json_response(
        200,
        json!({
            "tasks": work_tasks.iter().map(format_task).collect::<Vec<_>>(),
            "documents": doc_tasks.iter().map(format_task).collect::<Vec<_>>(),
            "lists": raw_lists.iter().map(format_list).collect::<Vec<_>>(),
        }),
    ))
}

// ---------------------------------------------------------------------------
// Workspace-ID helpers
// ---------------------------------------------------------------------------

async fn resolve_ws_id(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw: &str,
    user_id: &str,
    token: &str,
) -> Result<Option<String>, ()> {
    if raw.eq_ignore_ascii_case(INTERNAL_SLUG) {
        return Ok(Some(ROOT_WS_ID.to_owned()));
    }
    if raw.trim().eq_ignore_ascii_case(PERSONAL_SLUG) {
        let srk = cd.service_role_key().ok_or(())?;
        let url = cd
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
        let bearer = format!("Bearer {token}");
        let resp = outbound
            .send(
                OutboundRequest::new(OutboundMethod::Get, &url)
                    .with_header("Accept", APPLICATION_JSON)
                    .with_header("Authorization", &bearer)
                    .with_header("apikey", srk),
            )
            .await
            .map_err(|_| ())?;
        if !(200..300).contains(&resp.status) {
            return Ok(None);
        }
        return Ok(resp
            .json::<Vec<Value>>()
            .map_err(|_| ())?
            .into_iter()
            .next()
            .and_then(|r| r.get("id").and_then(Value::as_str).map(str::to_owned)));
    }
    Ok(Some(raw.to_owned()))
}

async fn check_membership(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    token: &str,
) -> Result<bool, ()> {
    let srk = cd.service_role_key().ok_or(())?;
    let url = cd
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
    let bearer = format!("Bearer {token}");
    let resp = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", srk),
        )
        .await
        .map_err(|_| ())?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    Ok(!resp.json::<Vec<Value>>().map_err(|_| ())?.is_empty())
}

// ---------------------------------------------------------------------------
// Service-role data helpers
// ---------------------------------------------------------------------------

async fn check_project_ws(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    srk: &str,
    project_id: &str,
    ws_id: &str,
) -> Result<bool, ()> {
    let rows = service_role_get_json(
        cd,
        outbound,
        srk,
        "task_projects",
        &[
            ("select", "ws_id".to_owned()),
            ("id", format!("eq.{project_id}")),
            ("limit", "1".to_owned()),
        ],
    )
    .await?;
    let proj_ws = rows
        .into_iter()
        .next()
        .and_then(|r| r.get("ws_id").and_then(Value::as_str).map(str::to_owned));
    Ok(proj_ws.as_deref() == Some(ws_id))
}

async fn service_role_get_json(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    srk: &str,
    table: &str,
    params: &[(&str, String)],
) -> Result<Vec<Value>, ()> {
    let url = cd.rest_url(table, params).ok_or(())?;
    let bearer = format!("Bearer {srk}");
    let resp: OutboundResponse = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", srk),
        )
        .await
        .map_err(|_| ())?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    resp.json::<Vec<Value>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Response shaping (mirrors legacy formatTask / TaskList spread)
// ---------------------------------------------------------------------------

fn format_task(task: &Value) -> Value {
    let mut map: Map<String, Value> = match task.as_object() {
        Some(obj) => obj.clone(),
        None => return task.clone(),
    };
    let tl = task.get("task_lists");
    map.insert(
        "source_list_name".to_owned(),
        tl.and_then(|t| t.get("name"))
            .cloned()
            .unwrap_or(Value::Null),
    );
    map.insert(
        "source_list_status".to_owned(),
        tl.and_then(|t| t.get("status"))
            .cloned()
            .unwrap_or(Value::Null),
    );

    // labels: [{label:{...}}] -> [{...}]
    let labels: Vec<Value> = task
        .get("labels")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|e| e.get("label").cloned())
                .filter(|l| !l.is_null())
                .collect()
        })
        .unwrap_or_default();
    map.insert("labels".to_owned(), Value::Array(labels));

    // projects: [{project:{...}}] -> [{...}]
    let projs: Vec<Value> = task
        .get("projects")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|e| e.get("project").cloned())
                .filter(|p| !p.is_null())
                .collect()
        })
        .unwrap_or_default();
    map.insert("projects".to_owned(), Value::Array(projs));

    // assignees: [{user:{id,display_name,avatar_url}}] -> [{id,display_name,avatar_url}]
    let assignees: Vec<Value> = task
        .get("assignees")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|e| {
                    let u = e.get("user")?;
                    Some(json!({
                        "id": u.get("id").cloned().unwrap_or(Value::Null),
                        "display_name": u.get("display_name").cloned().unwrap_or(Value::Null),
                        "avatar_url": u.get("avatar_url").cloned().unwrap_or(Value::Null),
                    }))
                })
                .collect()
        })
        .unwrap_or_default();
    map.insert("assignees".to_owned(), Value::Array(assignees));

    Value::Object(map)
}

fn format_list(list: &Value) -> Value {
    let mut map: Map<String, Value> = match list.as_object() {
        Some(obj) => obj.clone(),
        None => return list.clone(),
    };
    let null_or_absent =
        |m: &Map<String, Value>, k: &str| m.get(k).map(Value::is_null).unwrap_or(true);
    if null_or_absent(&map, "name") {
        map.insert("name".to_owned(), json!("Untitled list"));
    }
    if null_or_absent(&map, "archived") {
        map.insert("archived".to_owned(), json!(false));
    }
    if null_or_absent(&map, "created_at") {
        map.insert("created_at".to_owned(), json!("1970-01-01T00:00:00.000Z"));
    }
    if null_or_absent(&map, "board_id") {
        map.insert("board_id".to_owned(), json!(""));
    }
    if null_or_absent(&map, "creator_id") {
        map.insert("creator_id".to_owned(), json!(""));
    }
    if null_or_absent(&map, "deleted") {
        map.insert("deleted".to_owned(), json!(false));
    }
    if null_or_absent(&map, "position") {
        map.insert("position".to_owned(), json!(0));
    }
    if null_or_absent(&map, "status") {
        map.insert("status".to_owned(), json!("active"));
    }
    if null_or_absent(&map, "color") {
        map.insert("color".to_owned(), json!("gray"));
    }
    Value::Object(map)
}

fn err(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ---------------------------------------------------------------------------
// Path extraction
// ---------------------------------------------------------------------------

fn extract_path_ids(path: &str) -> Option<(&str, &str)> {
    // /api/v1/workspaces/{wsId}/task-projects/{projectId}/tasks
    let tail = path.strip_prefix(PATH_PREFIX)?;
    let slash = tail.find('/')?;
    let ws_id = &tail[..slash];
    let rest = tail[slash..].strip_prefix(TASK_PROJECTS_MIDDLE)?; // "{projectId}/tasks"
    let project_id = rest.strip_suffix(TASKS_SUFFIX)?;
    if ws_id.is_empty() || project_id.is_empty() || project_id.contains('/') {
        return None;
    }
    Some((ws_id, project_id))
}

// ---------------------------------------------------------------------------
// Tests (pure / sync helpers only)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const WS: &str = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const PROJ: &str = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

    fn p(ws: &str, proj: &str) -> String {
        format!("/api/v1/workspaces/{ws}/task-projects/{proj}/tasks")
    }

    #[test]
    fn extract_ids_valid() {
        assert_eq!(extract_path_ids(&p(WS, PROJ)), Some((WS, PROJ)));
        assert_eq!(
            extract_path_ids(&p("personal", PROJ)),
            Some(("personal", PROJ))
        );
    }

    #[test]
    fn extract_ids_rejects_empty_segments() {
        assert!(
            extract_path_ids(&format!("/api/v1/workspaces//task-projects/{PROJ}/tasks")).is_none()
        );
        assert!(
            extract_path_ids(&format!("/api/v1/workspaces/{WS}/task-projects//tasks")).is_none()
        );
    }

    #[test]
    fn extract_ids_rejects_sub_routes() {
        // Extra segment after /tasks must not match.
        assert!(
            extract_path_ids(&format!(
                "/api/v1/workspaces/{WS}/task-projects/{PROJ}/tasks/extra"
            ))
            .is_none()
        );
        // Slash inside projectId segment must not match.
        assert!(
            extract_path_ids(&format!(
                "/api/v1/workspaces/{WS}/task-projects/{PROJ}/sub/tasks"
            ))
            .is_none()
        );
    }

    #[test]
    fn extract_ids_rejects_wrong_prefix() {
        assert!(
            extract_path_ids(&format!(
                "/api/v2/workspaces/{WS}/task-projects/{PROJ}/tasks"
            ))
            .is_none()
        );
    }

    #[test]
    fn format_task_normalizes_all_relations() {
        let task = json!({
            "id": "t1",
            "task_lists": { "name": "Sprint", "status": "active", "workspace_boards": { "ws_id": "ws1" } },
            "labels": [{ "label": { "id": "l1", "name": "Bug", "color": "red", "created_at": null } }],
            "projects": [{ "project": { "id": "p1", "name": "Alpha", "status": null } }],
            "assignees": [{ "user": { "id": "u1", "display_name": "Alice", "avatar_url": null } }],
        });
        let out = format_task(&task);
        assert_eq!(
            out.get("source_list_name").and_then(Value::as_str),
            Some("Sprint")
        );
        assert_eq!(
            out.get("source_list_status").and_then(Value::as_str),
            Some("active")
        );
        let labels = out.get("labels").and_then(Value::as_array).unwrap();
        assert_eq!(labels.len(), 1);
        assert!(
            labels[0].get("label").is_none(),
            "label wrapper must be stripped"
        );
        assert_eq!(labels[0].get("id").and_then(Value::as_str), Some("l1"));
        let assignees = out.get("assignees").and_then(Value::as_array).unwrap();
        assert!(
            assignees[0].get("user").is_none(),
            "user wrapper must be stripped"
        );
        assert_eq!(assignees[0].get("id").and_then(Value::as_str), Some("u1"));
    }

    #[test]
    fn format_list_applies_defaults() {
        let list = json!({ "id": "l1", "name": null, "archived": null, "status": null, "color": null, "position": null, "board_id": null, "creator_id": null, "deleted": null, "created_at": null });
        let out = format_list(&list);
        assert_eq!(
            out.get("name").and_then(Value::as_str),
            Some("Untitled list")
        );
        assert_eq!(out.get("status").and_then(Value::as_str), Some("active"));
        assert_eq!(out.get("color").and_then(Value::as_str), Some("gray"));
        assert_eq!(out.get("position").and_then(Value::as_i64), Some(0));
        assert_eq!(out.get("archived").and_then(Value::as_bool), Some(false));
    }

    #[test]
    fn format_list_preserves_non_null_values() {
        let list = json!({ "id": "l2", "name": "Backlog", "status": "review", "color": "blue", "position": 5, "archived": true });
        let out = format_list(&list);
        assert_eq!(out.get("name").and_then(Value::as_str), Some("Backlog"));
        assert_eq!(out.get("status").and_then(Value::as_str), Some("review"));
        assert_eq!(out.get("color").and_then(Value::as_str), Some("blue"));
        assert_eq!(out.get("position").and_then(Value::as_i64), Some(5));
    }
}
