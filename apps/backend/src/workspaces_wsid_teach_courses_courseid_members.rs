//! Handler for `GET /api/v1/workspaces/:wsId/teach/courses/:courseId/members`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/teach/courses/[courseId]/members/route.ts`.
//!
//! ## Auth
//!
//! The legacy route uses `requireTeachWorkspaceAccess` with permission
//! `view_user_groups`. This handler reproduces that via
//! `workspace_permission_check::authorize_workspace_permission`.
//!
//! ## GET response shape
//!
//! ```json
//! { "data": [{ "id": "...", "display_name": "...", "full_name": "...",
//!              "email": "...", "avatar_url": "...", "archived": false,
//!              "role": "STUDENT" }] }
//! ```
//!
//! ## Behavior gaps
//!
//! - `POST` is intentionally not migrated; `None` is returned so the worker
//!   falls through to the still-live Next.js route.
//! - The legacy `validateTeachCourse` helper queries `workspace_user_groups`
//!   with the admin client. This handler replicates that check via a direct
//!   PostgREST call with the service-role key.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const MEMBERS_PERMISSION: &str = "view_user_groups";
const COURSE_NOT_FOUND_MSG: &str = "Course not found";
const MEMBERS_FETCH_ERROR_MSG: &str = "Error fetching course members";
const UNAUTHORIZED_MSG: &str = "Unauthorized";

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_teach_courses_courseid_members_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (raw_ws_id, course_id) = extract_path_params(request.path)?;

    Some(match request.method {
        "GET" => members_get_response(config, request, raw_ws_id, course_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn members_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    course_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // 1. Authenticate and check workspace permission.
    let authorization = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        MEMBERS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(auth) => auth,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return message_response(401, UNAUTHORIZED_MSG);
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return message_response(403, UNAUTHORIZED_MSG);
        }
        Err(WorkspacePermissionAuthorizationError::NotFound) => {
            return message_response(403, "You don't have access to this workspace");
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, MEMBERS_FETCH_ERROR_MSG);
        }
    };

    let ws_id = &authorization.ws_id;

    // 2. Validate that the course (workspace_user_group) exists in this workspace.
    match validate_course(&config.contact_data, outbound, ws_id, course_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(404, COURSE_NOT_FOUND_MSG),
        Err(()) => return message_response(500, MEMBERS_FETCH_ERROR_MSG),
    }

    // 3. Fetch members.
    match fetch_members(&config.contact_data, outbound, course_id).await {
        Ok(data) => no_store_response(json_response(200, json!({ "data": data }))),
        Err(()) => message_response(500, MEMBERS_FETCH_ERROR_MSG),
    }
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

/// Checks that a `workspace_user_groups` row with `id = course_id` and
/// `ws_id = ws_id` exists, mirroring `validateTeachCourse` in the legacy route.
async fn validate_course(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    course_id: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            "workspace_user_groups",
            &[
                ("select", "id".to_owned()),
                ("id", format!("eq.{course_id}")),
                ("ws_id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // PostgREST returns a JSON array; non-empty means the course exists.
    let rows = response.json::<Value>().map_err(|_| ())?;
    Ok(rows.as_array().is_some_and(|arr| !arr.is_empty()))
}

/// Fetches members from `workspace_user_groups_users` joined with
/// `workspace_users`, mirroring the legacy Supabase query:
///
/// ```text
/// .from('workspace_user_groups_users')
/// .select('role, workspace_users!workspace_user_roles_users_user_id_fkey(
///     id, display_name, full_name, email, avatar_url, archived)')
/// .eq('group_id', courseId)
/// .order('role', { ascending: true })
/// ```
///
/// Each returned row is flattened: the `workspace_users` object is spread at
/// the top level and `role` is added alongside it, mirroring the legacy `.map`
/// transform.
async fn fetch_members(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    course_id: &str,
) -> Result<Value, ()> {
    let select = "role,workspace_users!workspace_user_roles_users_user_id_fkey(id,display_name,full_name,email,avatar_url,archived)";
    let url = contact_data
        .rest_url(
            "workspace_user_groups_users",
            &[
                ("select", select.to_owned()),
                ("group_id", format!("eq.{course_id}")),
                ("order", "role.asc".to_owned()),
            ],
        )
        .ok_or(())?;

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<MemberRow>>().map_err(|_| ())?;

    // Mirror the legacy `.map` transform: spread workspace_users fields then
    // add `role`.
    let data: Vec<Value> = rows
        .into_iter()
        .map(|row| {
            // The join may come back as an object or a single-element array;
            // normalise to an object.
            let user_obj = match row.workspace_users {
                Value::Array(mut arr) if !arr.is_empty() => arr.swap_remove(0),
                Value::Object(_) => row.workspace_users,
                _ => Value::Object(serde_json::Map::new()),
            };

            let mut merged = match user_obj {
                Value::Object(map) => map,
                _ => serde_json::Map::new(),
            };
            merged.insert("role".to_owned(), json!(row.role));
            Value::Object(merged)
        })
        .collect();

    Ok(Value::Array(data))
}

// ---------------------------------------------------------------------------
// Path extraction
// ---------------------------------------------------------------------------

/// Extracts `(wsId, courseId)` from
/// `/api/v1/workspaces/:wsId/teach/courses/:courseId/members`.
///
/// Returns `None` when the path shape does not match this route.
fn extract_path_params(path: &str) -> Option<(&str, &str)> {
    let segments = path_segments(path);

    // Expected: api / v1 / workspaces / :wsId / teach / courses / :courseId / members
    //           [0]   [1]     [2]        [3]     [4]     [5]        [6]         [7]
    if segments.len() != 8 {
        return None;
    }

    let ws_id = segments.get(3)?;
    let course_id = segments.get(6)?;

    if segments[0] != "api"
        || segments[1] != "v1"
        || segments[2] != "workspaces"
        || ws_id.is_empty()
        || segments[4] != "teach"
        || segments[5] != "courses"
        || course_id.is_empty()
        || segments[7] != "members"
    {
        return None;
    }

    Some((ws_id, course_id))
}

fn path_segments(path: &str) -> Vec<&str> {
    path.trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect()
}

// ---------------------------------------------------------------------------
// Serde types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct MemberRow {
    role: Option<String>,
    workspace_users: Value,
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_valid_path() {
        let ws_id = "ws-abc-123";
        let course_id = "course-uuid-456";
        let path = format!("/api/v1/workspaces/{ws_id}/teach/courses/{course_id}/members");
        let result = extract_path_params(&path);
        assert_eq!(result, Some((ws_id, course_id)));
    }

    #[test]
    fn extract_no_trailing_slash() {
        let path = "/api/v1/workspaces/ws1/teach/courses/c1/members";
        let (ws, course) = extract_path_params(path).expect("should match");
        assert_eq!(ws, "ws1");
        assert_eq!(course, "c1");
    }

    #[test]
    fn extract_wrong_suffix_returns_none() {
        let path = "/api/v1/workspaces/ws1/teach/courses/c1/other";
        assert!(extract_path_params(path).is_none());
    }

    #[test]
    fn extract_missing_segment_returns_none() {
        let path = "/api/v1/workspaces/ws1/teach/courses/members";
        assert!(extract_path_params(path).is_none());
    }

    #[test]
    fn extract_wrong_prefix_returns_none() {
        let path = "/api/workspaces/ws1/teach/courses/c1/members";
        assert!(extract_path_params(path).is_none());
    }

    #[test]
    fn extract_extra_segment_returns_none() {
        let path = "/api/v1/workspaces/ws1/teach/courses/c1/members/extra";
        assert!(extract_path_params(path).is_none());
    }

    #[test]
    fn member_row_flattening_object() {
        let row = MemberRow {
            role: Some("STUDENT".to_owned()),
            workspace_users: json!({
                "id": "u1",
                "display_name": "Alice",
                "full_name": "Alice Smith",
                "email": "alice@example.com",
                "avatar_url": null,
                "archived": false
            }),
        };

        let user_obj = match row.workspace_users {
            Value::Array(mut arr) if !arr.is_empty() => arr.swap_remove(0),
            Value::Object(_) => row.workspace_users,
            _ => Value::Object(serde_json::Map::new()),
        };

        let mut merged = match user_obj {
            Value::Object(map) => map,
            _ => serde_json::Map::new(),
        };
        merged.insert("role".to_owned(), json!(row.role));
        let result = Value::Object(merged);

        assert_eq!(result["id"], "u1");
        assert_eq!(result["role"], "STUDENT");
        assert_eq!(result["archived"], false);
    }

    #[test]
    fn member_row_flattening_single_element_array() {
        let row = MemberRow {
            role: Some("TEACHER".to_owned()),
            workspace_users: json!([{
                "id": "u2",
                "display_name": "Bob",
                "full_name": null,
                "email": "bob@example.com",
                "avatar_url": null,
                "archived": false
            }]),
        };

        let user_obj = match row.workspace_users {
            Value::Array(mut arr) if !arr.is_empty() => arr.swap_remove(0),
            Value::Object(_) => row.workspace_users,
            _ => Value::Object(serde_json::Map::new()),
        };

        let mut merged = match user_obj {
            Value::Object(map) => map,
            _ => serde_json::Map::new(),
        };
        merged.insert("role".to_owned(), json!(row.role));
        let result = Value::Object(merged);

        assert_eq!(result["id"], "u2");
        assert_eq!(result["role"], "TEACHER");
    }
}
