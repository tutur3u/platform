//! Handler for `GET /api/v1/workspaces/:wsId/teach/courses/:courseId/tests`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/teach/courses/[courseId]/tests/route.ts`.
//!
//! ## Auth model
//!
//! The legacy route calls `requireTeachWorkspaceAccess` with the
//! `view_user_groups` workspace permission, then validates the course belongs to
//! the workspace via `validateTeachCourse` (queries `workspace_user_groups`
//! with `id = courseId AND ws_id = ws_id AND is_guest = false`).
//!
//! This handler reproduces that flow using
//! `workspace_permission_check::authorize_workspace_permission` followed by a
//! service-role read against `workspace_user_groups`.
//!
//! ## Response shape
//!
//! On success the legacy route returns `{ data: [...] }` where every element is
//! shaped as:
//!
//! ```json
//! {
//!   "id": "...",
//!   "course_id": "...",
//!   "name": "...",
//!   "created_at": "...",
//!   "start_at": null,
//!   "duration_in_minutes": null,
//!   "description": null,
//!   "is_published": false,
//!   "is_score_published": false,
//!   "module_ids": ["..."]
//! }
//! ```
//!
//! `module_ids` is derived by flattening `course_test_modules(module_id)`.
//!
//! ## Behavior gaps vs. legacy
//!
//! - `POST` and `PATCH` are **not** migrated; `None` is returned for those
//!   methods so the worker falls through to the still-active Next.js route.
//! - No per-route rate-limiting is applied at this layer (handled upstream).
//! - The `allowAppSessionAuth: { targetApp: 'teach' }` option on the legacy
//!   route accepts app-session tokens issued for the `teach` app. Those tokens
//!   are not currently supported by `authorize_workspace_permission`; callers
//!   using such tokens will receive a `401`.

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

const VIEW_USER_GROUPS_PERMISSION: &str = "view_user_groups";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FETCH_ERROR_MESSAGE: &str = "Error fetching course tests";
const COURSE_NOT_FOUND_MESSAGE: &str = "Course not found";

#[derive(Deserialize)]
struct CourseTestModuleRow {
    module_id: Option<String>,
}

#[derive(Deserialize)]
struct CourseTestRow {
    id: Option<String>,
    course_id: Option<String>,
    name: Option<String>,
    created_at: Option<String>,
    start_at: Option<Value>,
    duration_in_minutes: Option<Value>,
    description: Option<Value>,
    is_published: Option<bool>,
    is_score_published: Option<bool>,
    course_test_modules: Option<Vec<CourseTestModuleRow>>,
}

pub(crate) async fn handle_workspaces_wsid_teach_courses_courseid_tests_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, course_id) = extract_path_params(request.path)?;

    Some(match request.method {
        "GET" => tests_get_response(config, request, raw_ws_id, course_id, outbound).await,
        _ => return None,
    })
}

async fn tests_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    course_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let authorization = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        VIEW_USER_GROUPS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(auth) => auth,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return message_response(401, UNAUTHORIZED_MESSAGE);
        }
        Err(
            WorkspacePermissionAuthorizationError::Forbidden
            | WorkspacePermissionAuthorizationError::NotFound,
        ) => {
            return message_response(403, UNAUTHORIZED_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, FETCH_ERROR_MESSAGE);
        }
    };

    let ws_id = &authorization.ws_id;

    match validate_course(&config.contact_data, outbound, ws_id, course_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(404, COURSE_NOT_FOUND_MESSAGE),
        Err(()) => return message_response(500, FETCH_ERROR_MESSAGE),
    }

    match fetch_course_tests(&config.contact_data, outbound, course_id).await {
        Ok(tests) => no_store_response(json_response(200, json!({ "data": tests }))),
        Err(()) => message_response(500, FETCH_ERROR_MESSAGE),
    }
}

/// Validates that `course_id` belongs to `ws_id` by querying
/// `workspace_user_groups` with `is_guest = false`.
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
                ("is_guest", "eq.false".to_owned()),
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

    #[derive(Deserialize)]
    struct Row {
        id: Option<String>,
    }

    Ok(response
        .json::<Vec<Row>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|r| r.id)
        .is_some())
}

/// Fetches all course tests for `course_id`, ordered by `created_at` descending,
/// and joins `course_test_modules(module_id)` to build `module_ids`.
async fn fetch_course_tests(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    course_id: &str,
) -> Result<Vec<Value>, ()> {
    let url = contact_data
        .rest_url(
            "course_tests",
            &[
                (
                    "select",
                    concat!(
                        "id,course_id,name,created_at,start_at,",
                        "duration_in_minutes,description,",
                        "is_published,is_score_published,",
                        "course_test_modules(module_id)"
                    )
                    .to_owned(),
                ),
                ("course_id", format!("eq.{course_id}")),
                ("order", "created_at.desc".to_owned()),
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

    let rows = response.json::<Vec<CourseTestRow>>().map_err(|_| ())?;
    Ok(rows.into_iter().map(map_test_row).collect())
}

fn map_test_row(row: CourseTestRow) -> Value {
    let module_ids: Vec<String> = row
        .course_test_modules
        .unwrap_or_default()
        .into_iter()
        .filter_map(|m| m.module_id)
        .collect();

    json!({
        "id": row.id,
        "course_id": row.course_id,
        "name": row.name,
        "created_at": row.created_at,
        "start_at": row.start_at,
        "duration_in_minutes": row.duration_in_minutes,
        "description": row.description,
        "is_published": row.is_published,
        "is_score_published": row.is_score_published,
        "module_ids": module_ids,
    })
}

/// Extracts `(raw_ws_id, course_id)` from
/// `/api/v1/workspaces/:wsId/teach/courses/:courseId/tests`.
///
/// Returns `None` when the path shape does not match this route.
fn extract_path_params(path: &str) -> Option<(&str, &str)> {
    let segments = path_segments(path);

    // ["api", "v1", "workspaces", wsId, "teach", "courses", courseId, "tests"]
    if segments.len() == 8
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && !segments[3].is_empty()
        && segments[4] == "teach"
        && segments[5] == "courses"
        && !segments[6].is_empty()
        && segments[7] == "tests"
    {
        Some((segments[3], segments[6]))
    } else {
        None
    }
}

fn path_segments(path: &str) -> Vec<&str> {
    path.trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect()
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_path_params_matches() {
        let path = "/api/v1/workspaces/ws-123/teach/courses/course-456/tests";
        let result = extract_path_params(path);
        assert_eq!(result, Some(("ws-123", "course-456")));
    }

    #[test]
    fn test_extract_path_params_no_leading_slash() {
        let path = "api/v1/workspaces/ws-abc/teach/courses/course-xyz/tests";
        let result = extract_path_params(path);
        assert_eq!(result, Some(("ws-abc", "course-xyz")));
    }

    #[test]
    fn test_extract_path_params_wrong_suffix() {
        assert!(
            extract_path_params("/api/v1/workspaces/ws-123/teach/courses/course-456/other")
                .is_none()
        );
    }

    #[test]
    fn test_extract_path_params_missing_teach_segment() {
        assert!(
            extract_path_params("/api/v1/workspaces/ws-123/courses/course-456/tests").is_none()
        );
    }

    #[test]
    fn test_extract_path_params_empty_ws_id() {
        // An empty ws_id segment is filtered out by path_segments, so the
        // length check fails.
        assert!(
            extract_path_params("/api/v1/workspaces//teach/courses/course-456/tests").is_none()
        );
    }

    #[test]
    fn test_extract_path_params_empty_course_id() {
        assert!(extract_path_params("/api/v1/workspaces/ws-123/teach/courses//tests").is_none());
    }

    #[test]
    fn test_map_test_row_with_modules() {
        let row = CourseTestRow {
            id: Some("test-1".to_owned()),
            course_id: Some("course-1".to_owned()),
            name: Some("Test 1".to_owned()),
            created_at: Some("2024-01-01T00:00:00Z".to_owned()),
            start_at: None,
            duration_in_minutes: None,
            description: None,
            is_published: Some(false),
            is_score_published: Some(false),
            course_test_modules: Some(vec![
                CourseTestModuleRow {
                    module_id: Some("mod-1".to_owned()),
                },
                CourseTestModuleRow {
                    module_id: Some("mod-2".to_owned()),
                },
            ]),
        };
        let value = map_test_row(row);
        assert_eq!(value["id"].as_str().unwrap(), "test-1");
        assert_eq!(value["course_id"].as_str().unwrap(), "course-1");
        let module_ids = value["module_ids"].as_array().unwrap();
        assert_eq!(module_ids.len(), 2);
        assert_eq!(module_ids[0].as_str().unwrap(), "mod-1");
        assert_eq!(module_ids[1].as_str().unwrap(), "mod-2");
    }

    #[test]
    fn test_map_test_row_no_modules() {
        let row = CourseTestRow {
            id: Some("test-2".to_owned()),
            course_id: Some("course-1".to_owned()),
            name: Some("Test 2".to_owned()),
            created_at: None,
            start_at: None,
            duration_in_minutes: None,
            description: None,
            is_published: None,
            is_score_published: None,
            course_test_modules: None,
        };
        let value = map_test_row(row);
        let module_ids = value["module_ids"].as_array().unwrap();
        assert!(module_ids.is_empty());
    }

    #[test]
    fn test_map_test_row_filters_null_module_ids() {
        let row = CourseTestRow {
            id: Some("test-3".to_owned()),
            course_id: Some("course-1".to_owned()),
            name: Some("Test 3".to_owned()),
            created_at: None,
            start_at: None,
            duration_in_minutes: None,
            description: None,
            is_published: None,
            is_score_published: None,
            course_test_modules: Some(vec![
                CourseTestModuleRow { module_id: None },
                CourseTestModuleRow {
                    module_id: Some("mod-valid".to_owned()),
                },
            ]),
        };
        let value = map_test_row(row);
        let module_ids = value["module_ids"].as_array().unwrap();
        assert_eq!(module_ids.len(), 1);
        assert_eq!(module_ids[0].as_str().unwrap(), "mod-valid");
    }
}
