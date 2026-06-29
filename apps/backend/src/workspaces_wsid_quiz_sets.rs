//! Handler for `GET /api/v1/workspaces/:wsId/quiz-sets`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/quiz-sets/route.ts`.
//!
//! The legacy route is gated by `requireEducationWorkspaceAccess` (default
//! `ai_lab` permission), which normalizes the workspace id, verifies workspace
//! membership, requires the `ENABLE_EDUCATION` workspace secret to be `"true"`,
//! and requires the `ai_lab` permission. It then reads `workspace_quiz_sets`
//! with the admin (service-role) client, embedding `course_module_quiz_sets`
//! to expose `linked_modules_count`, with `q` search, `created_at.desc`
//! ordering, and `page`/`pageSize` pagination (default 20, max 100).
//!
//! This handler reuses `workspace_permission_check::authorize_workspace_permission`
//! for membership + permission resolution, mirrors the education feature-flag
//! check via `workspace_secrets`, and reads `workspace_quiz_sets` with the
//! service-role key (RLS bypassed, scoped by `ws_id`), matching the legacy
//! status codes and JSON response shape.
//!
//! Behavior gaps vs legacy:
//!   * The legacy `normalizeWorkspaceId` failure path returns `400
//!     "Invalid workspace"`. `authorize_workspace_permission` resolves the
//!     workspace id internally; an unresolved/inaccessible workspace surfaces
//!     as `403`/`404`/`401` here rather than `400`. This matches the sibling
//!     education handlers (`workspaces_quiz_sets_quizzes.rs`).
//!   * Only GET is migrated; POST falls through to the live Next.js route.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    education_course_module_reads_query::{
        EducationReadQuery, education_read_query_from_url, education_read_range,
        total_count_from_content_range,
    },
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    workspace_permission_check::{
        WorkspacePermissionAuthorization, WorkspacePermissionAuthorizationError,
        authorize_workspace_permission,
    },
};

const QUIZ_SETS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const QUIZ_SETS_SEGMENT: &str = "quiz-sets";
const EDUCATION_PERMISSION: &str = "ai_lab";
const ENABLE_EDUCATION_SECRET: &str = "ENABLE_EDUCATION";
const WORKSPACE_SECRETS_TABLE: &str = "workspace_secrets";
const QUIZ_SETS_TABLE: &str = "workspace_quiz_sets";
const QUIZ_SETS_SELECT: &str = "id, name, created_at, course_module_quiz_sets(module_id)";

#[derive(Deserialize)]
struct WorkspaceSecretRow {
    value: Option<String>,
}

#[derive(Deserialize)]
struct QuizSetRow {
    id: Value,
    name: Value,
    #[serde(default)]
    created_at: Value,
    #[serde(default)]
    course_module_quiz_sets: Option<Vec<Value>>,
}

pub(crate) async fn handle_workspaces_wsid_quiz_sets_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = quiz_sets_ws_id(request.path)?;

    Some(match request.method {
        "GET" => quiz_sets_response(config, request, ws_id, outbound).await,
        _ => return None,
    })
}

async fn quiz_sets_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let authorization = match authorize_education_workspace(config, request, ws_id, outbound).await {
        Ok(authorization) => authorization,
        Err(response) => return response,
    };

    let query = education_read_query_from_url(request.url);

    match fetch_quiz_sets(&config.contact_data, outbound, &authorization.ws_id, &query).await {
        Ok(response) => quiz_sets_success_response(response, &query),
        Err(()) => read_error_response(),
    }
}

async fn authorize_education_workspace(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<WorkspacePermissionAuthorization, BackendResponse> {
    let authorization = authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        EDUCATION_PERMISSION,
        outbound,
    )
    .await
    .map_err(education_authorization_error_response)?;

    match education_workspace_enabled(&config.contact_data, outbound, &authorization.ws_id).await {
        Ok(true) => Ok(authorization),
        Ok(false) => Err(no_store_response(json_response(
            404,
            json!({ "message": "Education is not enabled for this workspace" }),
        ))),
        Err(()) => Err(no_store_response(json_response(
            500,
            json!({ "message": "Failed to verify education access" }),
        ))),
    }
}

fn education_authorization_error_response(
    error: WorkspacePermissionAuthorizationError,
) -> BackendResponse {
    match error {
        WorkspacePermissionAuthorizationError::Unauthorized => {
            no_store_response(json_response(401, json!({ "message": "Unauthorized" })))
        }
        WorkspacePermissionAuthorizationError::Forbidden => no_store_response(json_response(
            403,
            json!({ "message": "Insufficient permissions" }),
        )),
        WorkspacePermissionAuthorizationError::NotFound => no_store_response(json_response(
            403,
            json!({ "message": "You don't have access to this workspace" }),
        )),
        WorkspacePermissionAuthorizationError::Internal => no_store_response(json_response(
            500,
            json!({ "message": "Failed to verify workspace access" }),
        )),
    }
}

async fn education_workspace_enabled(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            WORKSPACE_SECRETS_TABLE,
            &[
                ("select", "value".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("name", format!("eq.{ENABLE_EDUCATION_SECRET}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url, None, None).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceSecretRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.value)
        .is_some_and(|value| value.trim().eq_ignore_ascii_case("true")))
}

async fn fetch_quiz_sets(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &EducationReadQuery,
) -> Result<OutboundResponse, ()> {
    let mut params = vec![
        ("select", QUIZ_SETS_SELECT.to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "created_at.desc".to_owned()),
    ];
    if let Some(q) = query.q.as_deref().filter(|q| !q.is_empty()) {
        // Legacy: `.ilike('name', '%q%')`.
        params.push(("name", format!("ilike.*{q}*")));
    }
    let url = contact_data.rest_url(QUIZ_SETS_TABLE, &params).ok_or(())?;

    send_service_role_request(
        contact_data,
        outbound,
        &url,
        Some(&education_read_range(query)),
        Some("count=exact"),
    )
    .await
}

async fn send_service_role_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    range: Option<&str>,
    prefer: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if let Some(range) = range {
        request = request
            .with_header("Range-Unit", "items")
            .with_header("Range", range);
    }
    if let Some(prefer) = prefer {
        request = request.with_header("Prefer", prefer);
    }

    let response = outbound.send(request).await.map_err(|_| ())?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response)
}

fn quiz_sets_success_response(
    response: OutboundResponse,
    query: &EducationReadQuery,
) -> BackendResponse {
    let count = total_count_from_content_range(&response).unwrap_or(0);
    let rows = match response.json::<Vec<QuizSetRow>>() {
        Ok(rows) => rows,
        Err(_) => return read_error_response(),
    };

    no_store_response(json_response(200, quiz_sets_body(rows, count, query)))
}

fn quiz_sets_body(rows: Vec<QuizSetRow>, count: usize, query: &EducationReadQuery) -> Value {
    let data: Vec<Value> = rows.into_iter().map(map_quiz_set_row).collect();

    json!({
        "data": data,
        "count": count,
        "page": query.page,
        "pageSize": query.page_size,
    })
}

fn map_quiz_set_row(row: QuizSetRow) -> Value {
    let linked_modules_count = row
        .course_module_quiz_sets
        .as_ref()
        .map_or(0, Vec::len);

    json!({
        "id": row.id,
        "name": row.name,
        "created_at": row.created_at,
        "linked_modules_count": linked_modules_count,
    })
}

fn read_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": "Error fetching workspace quiz sets" }),
    ))
}

fn quiz_sets_ws_id(path: &str) -> Option<&str> {
    let tail = path.strip_prefix(QUIZ_SETS_PATH_PREFIX)?;
    let (ws_id, rest) = tail.split_once('/')?;

    (!ws_id.is_empty() && rest == QUIZ_SETS_SEGMENT).then_some(ws_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    const WORKSPACE_ID: &str = "11111111-1111-4111-8111-111111111111";

    #[test]
    fn matches_exact_quiz_sets_path() {
        assert_eq!(
            quiz_sets_ws_id(&format!("/api/v1/workspaces/{WORKSPACE_ID}/quiz-sets")),
            Some(WORKSPACE_ID)
        );
        assert_eq!(quiz_sets_ws_id("/api/v1/workspaces/personal/quiz-sets"), Some("personal"));
    }

    #[test]
    fn rejects_non_matching_paths() {
        // Missing the trailing segment.
        assert_eq!(
            quiz_sets_ws_id(&format!("/api/v1/workspaces/{WORKSPACE_ID}")),
            None
        );
        // Child route (owned by a different handler).
        assert_eq!(
            quiz_sets_ws_id(&format!("/api/v1/workspaces/{WORKSPACE_ID}/quiz-sets/abc/quizzes")),
            None
        );
        // Trailing slash is not the bare collection path.
        assert_eq!(
            quiz_sets_ws_id(&format!("/api/v1/workspaces/{WORKSPACE_ID}/quiz-sets/")),
            None
        );
        // Empty workspace id.
        assert_eq!(quiz_sets_ws_id("/api/v1/workspaces//quiz-sets"), None);
        // Wrong prefix / unrelated routes must not match (return None so other
        // handlers and Next.js still run).
        assert_eq!(quiz_sets_ws_id("/api/workspaces/ws/quiz-sets"), None);
        assert_eq!(quiz_sets_ws_id("/api/v1/other"), None);
    }

    fn query() -> EducationReadQuery {
        EducationReadQuery {
            page: 2,
            page_size: 20,
            q: None,
        }
    }

    #[test]
    fn maps_linked_modules_count_from_embedded_rows() {
        let row = QuizSetRow {
            id: json!("set-1"),
            name: json!("Quiz One"),
            created_at: json!("2024-01-01T00:00:00Z"),
            course_module_quiz_sets: Some(vec![json!({"module_id": "m1"}), json!({"module_id": "m2"})]),
        };

        assert_eq!(
            map_quiz_set_row(row),
            json!({
                "id": "set-1",
                "name": "Quiz One",
                "created_at": "2024-01-01T00:00:00Z",
                "linked_modules_count": 2,
            })
        );
    }

    #[test]
    fn maps_missing_links_to_zero_count() {
        let row = QuizSetRow {
            id: json!("set-2"),
            name: json!("Quiz Two"),
            created_at: Value::Null,
            course_module_quiz_sets: None,
        };

        assert_eq!(
            map_quiz_set_row(row),
            json!({
                "id": "set-2",
                "name": "Quiz Two",
                "created_at": null,
                "linked_modules_count": 0,
            })
        );
    }

    #[test]
    fn body_includes_count_and_pagination_echo() {
        let rows = vec![QuizSetRow {
            id: json!("set-1"),
            name: json!("Quiz One"),
            created_at: json!("2024-01-01T00:00:00Z"),
            course_module_quiz_sets: Some(vec![json!({"module_id": "m1"})]),
        }];

        assert_eq!(
            quiz_sets_body(rows, 7, &query()),
            json!({
                "data": [{
                    "id": "set-1",
                    "name": "Quiz One",
                    "created_at": "2024-01-01T00:00:00Z",
                    "linked_modules_count": 1,
                }],
                "count": 7,
                "page": 2,
                "pageSize": 20,
            })
        );
    }
}
