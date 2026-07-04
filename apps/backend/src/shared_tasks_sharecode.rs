//! Handler for `GET /api/v1/shared/tasks/:shareCode`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/shared/tasks/[shareCode]/route.ts`.
//!
//! ## Auth
//!
//! Standard Supabase session only (bearer token or auth cookie). App-session
//! tokens are NOT accepted — the legacy route uses `createClient()` which is
//! session-scoped, not an app-session client.
//!
//! ## Data access
//!
//! All Supabase reads use the service-role key (bypassing RLS), matching the
//! legacy `adminClient` usage.
//!
//! ## Behavior gaps vs. legacy
//!
//! - **PATCH is not ported.** This handler returns `None` for non-GET methods
//!   so the worker falls through to the still-live Next.js route.
//! - The legacy single deeply-nested `!inner` join is split into sequential
//!   flat REST calls (share_link → task → list → board → workspace) to keep
//!   deserialization straightforward. Observable response shape and status
//!   codes are preserved exactly.
//! - `task_share_link_uses` recording is attempted fire-and-continue style;
//!   failures are silently ignored (matching the legacy `if (!recentUsage)`
//!   guard, which does not surface insert errors).

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/shared/tasks/";

// ---------------------------------------------------------------------------
// Row structs — only fields we need to inspect programmatically
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct ShareLinkRow {
    id: String,
    task_id: String,
    public_access: Option<String>,
    requires_invite: Option<bool>,
}

#[derive(Deserialize)]
struct TaskRow {
    id: String,
    name: Option<Value>,
    description: Option<Value>,
    priority: Option<Value>,
    start_date: Option<Value>,
    end_date: Option<Value>,
    created_at: Option<Value>,
    completed_at: Option<Value>,
    closed_at: Option<Value>,
    estimation_points: Option<Value>,
    display_number: Option<Value>,
    list_id: Option<String>,
}

#[derive(Deserialize)]
struct ListRow {
    id: String,
    name: Option<Value>,
    board_id: Option<String>,
}

#[derive(Deserialize)]
struct BoardRow {
    id: String,
    name: Option<Value>,
    ws_id: String,
    ticket_prefix: Option<Value>,
    estimation_type: Option<Value>,
    extended_estimation: Option<Value>,
    allow_zero_estimates: Option<Value>,
}

#[derive(Deserialize)]
struct WorkspaceRow {
    id: String,
    name: Option<Value>,
}

#[derive(Deserialize)]
struct MemberTypeRow {
    #[serde(rename = "type")]
    member_type: Option<String>,
}

#[derive(Deserialize)]
struct UserEmailRow {
    email: Option<String>,
}

#[derive(Deserialize)]
struct SharePermRow {
    permission: Option<String>,
}

// ---------------------------------------------------------------------------
// Route entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_shared_tasks_sharecode_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let share_code = extract_share_code(request.path)?;
    Some(match request.method {
        "GET" => get_response(config, request, share_code, outbound).await,
        _ => return None,
    })
}

fn extract_share_code(path: &str) -> Option<&str> {
    let code = path.strip_prefix(PATH_PREFIX)?;
    (!code.is_empty() && !code.contains('/')).then_some(code)
}

// ---------------------------------------------------------------------------
// GET response
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_lines)]
async fn get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    share_code: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let cd = &config.contact_data;
    if !cd.configured() {
        return err(500, "Internal server error");
    }

    // 1. Authenticate — session only (no app-session).
    let access_token = match supabase_auth::request_access_token(request) {
        Some(t) => t,
        None => return err(401, "Authentication required to access shared tasks"),
    };
    let user = match supabase_auth::fetch_supabase_auth_user(cd, &access_token, outbound).await {
        Some(u) if u.id.as_deref().is_some_and(|id| !id.is_empty()) => u,
        _ => return err(401, "Authentication required to access shared tasks"),
    };
    let user_id = user.id.unwrap_or_default();

    // 2. Share link.
    let sl = match svc_first::<ShareLinkRow>(
        cd,
        outbound,
        "task_share_links",
        &[
            (
                "select",
                "id,task_id,public_access,requires_invite".to_owned(),
            ),
            ("code", format!("eq.{share_code}")),
            ("limit", "1".to_owned()),
        ],
    )
    .await
    {
        Ok(Some(row)) => row,
        _ => return err(404, "Share link not found or expired"),
    };

    // 3. Task.
    let task_row = match svc_first::<TaskRow>(
        cd,
        outbound,
        "tasks",
        &[
            (
                "select",
                "id,name,description,priority,start_date,end_date,created_at,\
            completed_at,closed_at,estimation_points,display_number,list_id"
                    .to_owned(),
            ),
            ("id", format!("eq.{}", sl.task_id)),
            ("limit", "1".to_owned()),
        ],
    )
    .await
    {
        Ok(Some(row)) => row,
        _ => return err(404, "Share link not found or expired"),
    };

    // 4. List.
    let list_id = match task_row.list_id.as_deref().filter(|s| !s.is_empty()) {
        Some(id) => id.to_owned(),
        None => return err(500, "Invalid task configuration"),
    };
    let list_row = match svc_first::<ListRow>(
        cd,
        outbound,
        "task_lists",
        &[
            ("select", "id,name,board_id".to_owned()),
            ("id", format!("eq.{list_id}")),
            ("limit", "1".to_owned()),
        ],
    )
    .await
    {
        Ok(Some(row)) => row,
        _ => return err(500, "Invalid task configuration"),
    };

    // 5. Board.
    let board_id = match list_row.board_id.as_deref().filter(|s| !s.is_empty()) {
        Some(id) => id.to_owned(),
        None => return err(500, "Invalid task configuration"),
    };
    let board_row = match svc_first::<BoardRow>(
        cd,
        outbound,
        "workspace_boards",
        &[
            (
                "select",
                "id,name,ws_id,ticket_prefix,estimation_type,\
            extended_estimation,allow_zero_estimates"
                    .to_owned(),
            ),
            ("id", format!("eq.{board_id}")),
            ("limit", "1".to_owned()),
        ],
    )
    .await
    {
        Ok(Some(row)) => row,
        _ => return err(500, "Invalid task configuration"),
    };
    let ws_id = board_row.ws_id.clone();

    // 6. Workspace (best-effort; None is acceptable on error).
    let workspace_val: Option<Value> = svc_first::<WorkspaceRow>(
        cd,
        outbound,
        "workspaces",
        &[
            ("select", "id,name".to_owned()),
            ("id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    )
    .await
    .ok()
    .flatten()
    .map(|w| json!({ "id": w.id, "name": w.name }));

    // 7. Workspace membership (legacy: lookup failure → 500).
    let is_workspace_member = match svc_first::<MemberTypeRow>(
        cd,
        outbound,
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    )
    .await
    {
        Ok(Some(row)) => row.member_type.as_deref() == Some("MEMBER"),
        Ok(None) => false,
        Err(()) => return err(500, "Failed to verify workspace access"),
    };

    // 8. User email for task_shares lookup.
    let email: Option<String> = svc_first::<UserEmailRow>(
        cd,
        outbound,
        "user_private_details",
        &[
            ("select", "email".to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    )
    .await
    .ok()
    .flatten()
    .and_then(|r| r.email);

    // 9. Task share permission.
    let or_filter = if let Some(ref em) = email {
        format!("(shared_with_user_id.eq.{user_id},shared_with_email.ilike.{em})")
    } else {
        format!("(shared_with_user_id.eq.{user_id})")
    };
    let recipient_permission: Option<String> = svc_first::<SharePermRow>(
        cd,
        outbound,
        "task_shares",
        &[
            ("select", "permission".to_owned()),
            ("task_id", format!("eq.{}", sl.task_id)),
            ("or", or_filter),
            ("limit", "1".to_owned()),
        ],
    )
    .await
    .ok()
    .flatten()
    .and_then(|r| r.permission);

    // 10. Eligibility and invite checks.
    let has_public_access = sl.public_access.as_deref() == Some("view");
    let is_eligible = is_workspace_member || recipient_permission.is_some() || has_public_access;
    if !is_eligible {
        return err(403, "You do not have access to this shared task");
    }
    if sl.requires_invite.unwrap_or(false) && !is_workspace_member && recipient_permission.is_none()
    {
        return err(403, "You are not invited to access this shared task");
    }

    let effective_permission =
        if is_workspace_member || recipient_permission.as_deref() == Some("edit") {
            "edit"
        } else {
            "view"
        };

    // 11. Record usage (best-effort; ignore failures).
    let _ = maybe_record_usage(cd, outbound, &sl.id, &user_id).await;

    // 12. Enrichment queries — failures yield empty arrays.
    let assignees = fetch_assignees(cd, outbound, &sl.task_id).await;
    let labels = fetch_task_labels(cd, outbound, &sl.task_id).await;
    let task_projects = fetch_task_projects(cd, outbound, &sl.task_id).await;
    let available_lists = svc_all::<Value>(
        cd,
        outbound,
        "task_lists",
        &[
            ("select", "id,name,position,board_id,created_at".to_owned()),
            ("board_id", format!("eq.{board_id}")),
            ("deleted", "eq.false".to_owned()),
            ("order", "position.asc,created_at.asc".to_owned()),
        ],
    )
    .await
    .unwrap_or_default();
    let workspace_labels = svc_all::<Value>(
        cd,
        outbound,
        "workspace_task_labels",
        &[
            ("select", "id,name,color,created_at".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("order", "name.asc".to_owned()),
        ],
    )
    .await
    .unwrap_or_default();
    let workspace_projects = svc_all::<Value>(
        cd,
        outbound,
        "task_projects",
        &[
            ("select", "id,name,status".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("deleted", "eq.false".to_owned()),
            ("order", "name.asc".to_owned()),
        ],
    )
    .await
    .unwrap_or_default();
    let workspace_members = build_workspace_members(cd, outbound, &ws_id).await;

    // 13. Build response payload. Use `&` to borrow fields that appear in
    //     multiple json!() expansions without moving them prematurely.
    let task_val = json!({
        "id": &task_row.id,
        "name": &task_row.name,
        "description": &task_row.description,
        "priority": &task_row.priority,
        "start_date": &task_row.start_date,
        "end_date": &task_row.end_date,
        "created_at": &task_row.created_at,
        "completed_at": &task_row.completed_at,
        "closed_at": &task_row.closed_at,
        "estimation_points": &task_row.estimation_points,
        "display_number": &task_row.display_number,
        "list_id": &task_row.list_id,
        "task_lists": {
            "id": &list_row.id,
            "name": &list_row.name,
            "workspace_boards": {
                "id": &board_row.id,
                "name": &board_row.name,
                "ws_id": &ws_id,
                "ticket_prefix": &board_row.ticket_prefix,
                "estimation_type": &board_row.estimation_type,
                "extended_estimation": &board_row.extended_estimation,
                "allow_zero_estimates": &board_row.allow_zero_estimates,
                "workspaces": &workspace_val,
            }
        },
        "assignees": assignees,
        "labels": labels,
        "projects": task_projects,
    });

    let board_config = json!({
        "id": &board_row.id,
        "name": &board_row.name,
        "ws_id": &ws_id,
        "ticket_prefix": &board_row.ticket_prefix,
        "estimation_type": &board_row.estimation_type,
        "extended_estimation": &board_row.extended_estimation,
        "allow_zero_estimates": &board_row.allow_zero_estimates,
    });

    no_store_response(json_response(
        200,
        json!({
            "task": task_val,
            "permission": effective_permission,
            "workspace": &workspace_val,
            "board": { "id": &board_row.id, "name": &board_row.name },
            "list": { "id": &list_row.id, "name": &list_row.name },
            "boardConfig": board_config,
            "availableLists": available_lists,
            "workspaceLabels": workspace_labels,
            "workspaceProjects": workspace_projects,
            "workspaceMembers": workspace_members,
        }),
    ))
}

// ---------------------------------------------------------------------------
// Supabase service-role helpers
// ---------------------------------------------------------------------------

async fn svc_get(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let key = cd.service_role_key().ok_or(())?;
    let auth = format!("Bearer {key}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &auth)
                .with_header("apikey", key),
        )
        .await
        .map_err(|_| ())
}

/// Fetch all rows of type `T` from `table` using the given PostgREST params.
async fn svc_all<T: serde::de::DeserializeOwned>(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    params: &[(&str, String)],
) -> Result<Vec<T>, ()> {
    let url = cd.rest_url(table, params).ok_or(())?;
    let resp = svc_get(cd, outbound, &url).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    resp.json::<Vec<T>>().map_err(|_| ())
}

/// Fetch the first row of type `T`, or `None` when the table returns no rows.
async fn svc_first<T: serde::de::DeserializeOwned>(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    params: &[(&str, String)],
) -> Result<Option<T>, ()> {
    Ok(svc_all::<T>(cd, outbound, table, params)
        .await?
        .into_iter()
        .next())
}

/// POST a JSON body to `table` with the service-role key (for inserts).
async fn svc_post(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    body: &str,
) -> Result<(), ()> {
    let url = cd.rest_url(table, &[]).ok_or(())?;
    let key = cd.service_role_key().ok_or(())?;
    let auth = format!("Bearer {key}");
    let resp = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Content-Type", "application/json")
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &auth)
                .with_header("apikey", key)
                .with_header("Prefer", "return=minimal")
                .with_body(body),
        )
        .await
        .map_err(|_| ())?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Enrichment helpers
// ---------------------------------------------------------------------------

async fn fetch_assignees(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    task_id: &str,
) -> Vec<Value> {
    #[derive(Deserialize)]
    struct Row {
        user_id: Option<String>,
        users: Option<Value>,
    }

    let rows: Vec<Row> = svc_all(
        cd,
        outbound,
        "task_assignees",
        &[
            (
                "select",
                "user_id,users(id,display_name,handle,avatar_url)".to_owned(),
            ),
            ("task_id", format!("eq.{task_id}")),
        ],
    )
    .await
    .unwrap_or_default();

    rows.into_iter()
        .map(|row| {
            // PostgREST may return a single object or a 1-element array.
            let user = row.users.as_ref().and_then(|u| {
                if u.is_object() {
                    Some(u)
                } else {
                    u.as_array()?.first()
                }
            });
            json!({
                "id":           user.and_then(|u| u.get("id")),
                "user_id":      &row.user_id,
                "display_name": user.and_then(|u| u.get("display_name")),
                "handle":       user.and_then(|u| u.get("handle")),
                "avatar_url":   user.and_then(|u| u.get("avatar_url")),
            })
        })
        .collect()
}

async fn fetch_task_labels(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    task_id: &str,
) -> Vec<Value> {
    #[derive(Deserialize)]
    struct Row {
        workspace_task_labels: Option<Value>,
    }

    let rows: Vec<Row> = svc_all(
        cd,
        outbound,
        "task_labels",
        &[
            ("select", "workspace_task_labels(id,name,color)".to_owned()),
            ("task_id", format!("eq.{task_id}")),
        ],
    )
    .await
    .unwrap_or_default();

    rows.into_iter()
        .filter_map(|row| {
            let label = row.workspace_task_labels?;
            let obj = if label.is_object() {
                label
            } else {
                label.as_array()?.first()?.clone()
            };
            Some(json!({
                "id":    obj.get("id"),
                "name":  obj.get("name"),
                "color": obj.get("color"),
            }))
        })
        .collect()
}

async fn fetch_task_projects(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    task_id: &str,
) -> Vec<Value> {
    #[derive(Deserialize)]
    struct Row {
        task_projects: Option<Value>,
    }

    let rows: Vec<Row> = svc_all(
        cd,
        outbound,
        "task_project_tasks",
        &[
            ("select", "task_projects(id,name,status)".to_owned()),
            ("task_id", format!("eq.{task_id}")),
        ],
    )
    .await
    .unwrap_or_default();

    rows.into_iter()
        .filter_map(|row| {
            let proj = row.task_projects?;
            let obj = if proj.is_object() {
                proj
            } else {
                proj.as_array()?.first()?.clone()
            };
            Some(json!({
                "id":     obj.get("id"),
                "name":   obj.get("name"),
                "status": obj.get("status"),
            }))
        })
        .collect()
}

async fn build_workspace_members(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Vec<Value> {
    #[derive(Deserialize)]
    struct Row {
        user_id: Option<String>,
        users: Option<Value>,
    }

    let rows: Vec<Row> = svc_all(
        cd,
        outbound,
        "workspace_members",
        &[
            (
                "select",
                "user_id,users!inner(id,display_name,avatar_url)".to_owned(),
            ),
            ("ws_id", format!("eq.{ws_id}")),
        ],
    )
    .await
    .unwrap_or_default();

    rows.into_iter()
        .filter_map(|row| {
            let uid = row.user_id.as_deref().filter(|s| !s.is_empty())?;
            let user = row.users.as_ref()?;
            let obj = if user.is_object() {
                user
            } else {
                user.as_array()?.first()?
            };
            let display_name = obj
                .get("display_name")
                .and_then(Value::as_str)
                .unwrap_or("Unknown User");
            Some(json!({
                "id":           uid,
                "user_id":      uid,
                "display_name": display_name,
                "avatar_url":   obj.get("avatar_url"),
            }))
        })
        .collect()
}

/// Record a share link usage unless one was recorded in the last hour.
async fn maybe_record_usage(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    share_link_id: &str,
    user_id: &str,
) -> Result<(), ()> {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let one_hour_ago = unix_secs_to_iso8601(now_secs.saturating_sub(3_600));

    #[derive(Deserialize)]
    struct UsageRow {
        #[allow(dead_code)]
        id: Value,
    }

    let recent = svc_first::<UsageRow>(
        cd,
        outbound,
        "task_share_link_uses",
        &[
            ("select", "id".to_owned()),
            ("share_link_id", format!("eq.{share_link_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("accessed_at", format!("gte.{one_hour_ago}")),
            ("limit", "1".to_owned()),
        ],
    )
    .await;

    if matches!(recent, Ok(None)) {
        let body =
            serde_json::to_string(&json!({ "share_link_id": share_link_id, "user_id": user_id }))
                .map_err(|_| ())?;
        svc_post(cd, outbound, "task_share_link_uses", &body).await?;
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Date helpers (no external crate needed)
// ---------------------------------------------------------------------------

fn unix_secs_to_iso8601(secs: u64) -> String {
    let days = secs / 86_400;
    let secs_of_day = secs % 86_400;
    let h = secs_of_day / 3_600;
    let m = (secs_of_day % 3_600) / 60;
    let s = secs_of_day % 60;
    let (year, month, day) = civil_from_days(days as i64);
    format!("{year:04}-{month:02}-{day:02}T{h:02}:{m:02}:{s:02}.000Z")
}

// Howard Hinnant's days-from-civil algorithm (same as in shared_task_boards).
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    let year = if month <= 2 { year + 1 } else { year };
    (year, month, day)
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

fn err(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ---------------------------------------------------------------------------
// Tests (pure/sync helpers only — no async handler tests here)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_share_code_accepts_valid_paths() {
        assert_eq!(
            extract_share_code("/api/v1/shared/tasks/abc123"),
            Some("abc123")
        );
        assert_eq!(
            extract_share_code("/api/v1/shared/tasks/SHARE-CODE-XYZ"),
            Some("SHARE-CODE-XYZ")
        );
    }

    #[test]
    fn extract_share_code_rejects_wrong_prefix() {
        assert_eq!(extract_share_code("/api/v1/shared/task-boards/abc"), None);
        assert_eq!(extract_share_code("/api/v1/tasks/abc"), None);
        assert_eq!(extract_share_code("/api/v2/shared/tasks/abc"), None);
    }

    #[test]
    fn extract_share_code_rejects_empty_segment() {
        assert_eq!(extract_share_code("/api/v1/shared/tasks/"), None);
    }

    #[test]
    fn extract_share_code_rejects_extra_segments() {
        assert_eq!(extract_share_code("/api/v1/shared/tasks/abc/extra"), None);
    }

    #[test]
    fn unix_secs_to_iso8601_known_epoch() {
        // 2024-01-01T00:00:00.000Z = 1 704 067 200 seconds since epoch
        assert_eq!(
            unix_secs_to_iso8601(1_704_067_200),
            "2024-01-01T00:00:00.000Z"
        );
    }

    #[test]
    fn err_builds_no_store_json_response() {
        let resp = err(403, "forbidden");
        assert_eq!(resp.status, 403);
        assert_eq!(resp.body["error"], "forbidden");
        assert!(resp.cache_control.unwrap_or_default().contains("no-store"));
    }
}
