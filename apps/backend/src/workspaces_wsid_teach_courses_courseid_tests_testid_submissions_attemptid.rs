//! Handler for `GET /api/v1/workspaces/:wsId/teach/courses/:courseId/tests/:testId/submissions/:attemptId`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/teach/courses/[courseId]/tests/[testId]/submissions/[attemptId]/route.ts`.
//!
//! ## Auth
//!
//! The legacy GET uses `requireTeachWorkspaceAccess` with permission
//! `view_user_groups`. This handler reproduces that via
//! `workspace_permission_check::authorize_workspace_permission`.
//!
//! ## GET response shape
//!
//! ```json
//! {
//!   "attempt": { /* all columns from course_test_attempts */ },
//!   "student": { "id": "...", "display_name": "...", "email": "...", "avatar_url": "..." },
//!   "quizzes": [
//!     { "id": "...", "question": "...", "type": "...", "content": ..., "score": ...,
//!       "quiz_options": [{ "id": "...", "value": "...", "is_correct": ..., "explanation": ... }] }
//!   ],
//!   "answers": [
//!     { "quiz_id": "...", "selected_option_id": "...", "answer": ...,
//!       "is_correct": ..., "score_awarded": ..., "feedback": ... }
//!   ]
//! }
//! ```
//!
//! ## Behavior gaps
//!
//! - `PATCH` is intentionally not migrated; `None` is returned so the worker
//!   falls through to the still-live Next.js route.
//! - The legacy `validateTeachCourse` helper uses the admin Supabase client.
//!   This handler replicates the check via a direct PostgREST call with the
//!   service-role key.
//! - Quizzes are ordered by `created_at desc` to match the legacy
//!   `.order('created_at', { ascending: false })`.

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

const SUBMISSION_PERMISSION: &str = "view_user_groups";
const COURSE_NOT_FOUND_MSG: &str = "Course not found";
const TEST_NOT_FOUND_MSG: &str = "Test not found";
const ATTEMPT_NOT_FOUND_MSG: &str = "Attempt not found";
const FETCH_ERROR_MSG: &str = "Failed to load submission details";
const UNAUTHORIZED_MSG: &str = "Unauthorized";

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_teach_courses_courseid_tests_testid_submissions_attemptid_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (raw_ws_id, course_id, test_id, attempt_id) = extract_path_params(request.path)?;

    Some(match request.method {
        "GET" => {
            submission_get_response(
                config, request, raw_ws_id, course_id, test_id, attempt_id, outbound,
            )
            .await
        }
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn submission_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    course_id: &str,
    test_id: &str,
    attempt_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // 1. Authenticate and check workspace permission.
    let authorization = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        SUBMISSION_PERMISSION,
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
            return message_response(500, FETCH_ERROR_MSG);
        }
    };

    let ws_id = &authorization.ws_id;

    // 2. Validate course exists (mirrors validateTeachCourse).
    match validate_course(&config.contact_data, outbound, ws_id, course_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(404, COURSE_NOT_FOUND_MSG),
        Err(()) => return message_response(500, FETCH_ERROR_MSG),
    }

    // 3. Verify test belongs to course.
    match validate_test(&config.contact_data, outbound, test_id, course_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(404, TEST_NOT_FOUND_MSG),
        Err(()) => return message_response(500, FETCH_ERROR_MSG),
    }

    // 4. Fetch attempt details.
    let attempt = match fetch_attempt(&config.contact_data, outbound, attempt_id, test_id).await {
        Ok(Some(row)) => row,
        Ok(None) => return message_response(404, ATTEMPT_NOT_FOUND_MSG),
        Err(()) => return message_response(500, FETCH_ERROR_MSG),
    };

    // 5. Fetch student user profile.
    let user_id = attempt
        .get("user_id")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned();
    let student = match fetch_student(&config.contact_data, outbound, &user_id).await {
        Ok(row) => row,
        Err(()) => return message_response(500, FETCH_ERROR_MSG),
    };

    // 6. Fetch quiz IDs linked to this test.
    let quiz_ids = match fetch_test_quiz_ids(&config.contact_data, outbound, test_id).await {
        Ok(ids) => ids,
        Err(()) => return message_response(500, FETCH_ERROR_MSG),
    };

    // 7. Fetch quizzes (if any).
    let quizzes: Vec<Value> = if quiz_ids.is_empty() {
        Vec::new()
    } else {
        match fetch_quizzes(&config.contact_data, outbound, &quiz_ids).await {
            Ok(rows) => rows,
            Err(()) => return message_response(500, FETCH_ERROR_MSG),
        }
    };

    // 8. Fetch student answers.
    let answers = match fetch_answers(&config.contact_data, outbound, attempt_id).await {
        Ok(rows) => rows,
        Err(()) => return message_response(500, FETCH_ERROR_MSG),
    };

    no_store_response(json_response(
        200,
        json!({
            "attempt": attempt,
            "student": student,
            "quizzes": quizzes,
            "answers": answers,
        }),
    ))
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

/// Verifies a course (workspace_user_group) exists in this workspace.
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

    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Value>().map_err(|_| ())?;
    Ok(rows.as_array().is_some_and(|arr| !arr.is_empty()))
}

/// Verifies a test row exists and belongs to the given course.
async fn validate_test(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    test_id: &str,
    course_id: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            "course_tests",
            &[
                ("select", "id".to_owned()),
                ("id", format!("eq.{test_id}")),
                ("course_id", format!("eq.{course_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Value>().map_err(|_| ())?;
    Ok(rows.as_array().is_some_and(|arr| !arr.is_empty()))
}

/// Fetches the attempt row (all columns) for the given attempt and test.
async fn fetch_attempt(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    attempt_id: &str,
    test_id: &str,
) -> Result<Option<Value>, ()> {
    let url = contact_data
        .rest_url(
            "course_test_attempts",
            &[
                ("select", "*".to_owned()),
                ("id", format!("eq.{attempt_id}")),
                ("test_id", format!("eq.{test_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<Value>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

/// Fetches basic user profile for the student.
async fn fetch_student(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Value, ()> {
    if user_id.is_empty() {
        return Ok(Value::Null);
    }

    let url = contact_data
        .rest_url(
            "users",
            &[
                ("select", "id,display_name,email,avatar_url".to_owned()),
                ("id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<Value>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .unwrap_or(Value::Null))
}

/// Fetches the quiz IDs linked to a test via `course_test_quizzes`.
async fn fetch_test_quiz_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    test_id: &str,
) -> Result<Vec<String>, ()> {
    let url = contact_data
        .rest_url(
            "course_test_quizzes",
            &[
                ("select", "quiz_id".to_owned()),
                ("test_id", format!("eq.{test_id}")),
            ],
        )
        .ok_or(())?;

    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    #[derive(Deserialize)]
    struct QuizIdRow {
        quiz_id: Option<String>,
    }

    Ok(response
        .json::<Vec<QuizIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.quiz_id)
        .collect())
}

/// Fetches quiz details for the given quiz IDs, ordered by `created_at desc`.
async fn fetch_quizzes(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    quiz_ids: &[String],
) -> Result<Vec<Value>, ()> {
    let in_filter = format!("in.({})", quiz_ids.join(","));
    let url = contact_data
        .rest_url(
            "workspace_quizzes",
            &[
                (
                    "select",
                    "id,question,type,content,score,quiz_options(id,value,is_correct,explanation)"
                        .to_owned(),
                ),
                ("id", in_filter),
                ("order", "created_at.desc".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

/// Fetches all answers for the given attempt.
async fn fetch_answers(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    attempt_id: &str,
) -> Result<Vec<Value>, ()> {
    let url = contact_data
        .rest_url(
            "course_test_attempt_answers",
            &[
                (
                    "select",
                    "quiz_id,selected_option_id,answer,is_correct,score_awarded,feedback"
                        .to_owned(),
                ),
                ("attempt_id", format!("eq.{attempt_id}")),
            ],
        )
        .ok_or(())?;

    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// REST helper
// ---------------------------------------------------------------------------

async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<crate::outbound::OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Path extraction
// ---------------------------------------------------------------------------

/// Extracts `(wsId, courseId, testId, attemptId)` from
/// `/api/v1/workspaces/:wsId/teach/courses/:courseId/tests/:testId/submissions/:attemptId`.
///
/// Returns `None` when the path shape does not match this route.
fn extract_path_params(path: &str) -> Option<(&str, &str, &str, &str)> {
    let segments = path_segments(path);

    // Expected segments (0-indexed):
    //   0:api  1:v1  2:workspaces  3::wsId  4:teach  5:courses
    //   6::courseId  7:tests  8::testId  9:submissions  10::attemptId
    if segments.len() != 11 {
        return None;
    }

    let ws_id = segments.get(3)?;
    let course_id = segments.get(6)?;
    let test_id = segments.get(8)?;
    let attempt_id = segments.get(10)?;

    if segments[0] != "api"
        || segments[1] != "v1"
        || segments[2] != "workspaces"
        || ws_id.is_empty()
        || segments[4] != "teach"
        || segments[5] != "courses"
        || course_id.is_empty()
        || segments[7] != "tests"
        || test_id.is_empty()
        || segments[9] != "submissions"
        || attempt_id.is_empty()
    {
        return None;
    }

    Some((ws_id, course_id, test_id, attempt_id))
}

fn path_segments(path: &str) -> Vec<&str> {
    path.trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect()
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
        let path = "/api/v1/workspaces/ws-abc/teach/courses/course-uuid/tests/test-uuid/submissions/attempt-uuid";
        let result = extract_path_params(path);
        assert_eq!(
            result,
            Some(("ws-abc", "course-uuid", "test-uuid", "attempt-uuid"))
        );
    }

    #[test]
    fn extract_no_trailing_slash() {
        let path = "/api/v1/workspaces/ws1/teach/courses/c1/tests/t1/submissions/a1";
        let (ws, course, test, attempt) = extract_path_params(path).expect("should match");
        assert_eq!(ws, "ws1");
        assert_eq!(course, "c1");
        assert_eq!(test, "t1");
        assert_eq!(attempt, "a1");
    }

    #[test]
    fn extract_wrong_segment_count_returns_none() {
        let path = "/api/v1/workspaces/ws1/teach/courses/c1/tests/t1/submissions";
        assert!(extract_path_params(path).is_none());
    }

    #[test]
    fn extract_wrong_static_segment_returns_none() {
        let path = "/api/v1/workspaces/ws1/teach/courses/c1/TESTS/t1/submissions/a1";
        assert!(extract_path_params(path).is_none());
    }

    #[test]
    fn extract_wrong_prefix_returns_none() {
        let path = "/api/workspaces/ws1/teach/courses/c1/tests/t1/submissions/a1";
        assert!(extract_path_params(path).is_none());
    }

    #[test]
    fn extract_extra_segment_returns_none() {
        let path = "/api/v1/workspaces/ws1/teach/courses/c1/tests/t1/submissions/a1/extra";
        assert!(extract_path_params(path).is_none());
    }

    #[test]
    fn path_segments_strips_leading_trailing_slashes() {
        let segments = path_segments("/a/b/c/");
        assert_eq!(segments, vec!["a", "b", "c"]);
    }

    #[test]
    fn path_segments_filters_empty() {
        let segments = path_segments("//a//b");
        assert_eq!(segments, vec!["a", "b"]);
    }
}
