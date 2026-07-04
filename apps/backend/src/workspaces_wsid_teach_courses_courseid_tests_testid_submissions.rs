//! Handler for `GET /api/v1/workspaces/:wsId/teach/courses/:courseId/tests/:testId/submissions`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/teach/courses/[courseId]/tests/[testId]/submissions/route.ts`.
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
//! {
//!   "data": [
//!     {
//!       "id": "...",
//!       "userId": "...",
//!       "userName": "...",
//!       "startedAt": "...",
//!       "submittedAt": "...",
//!       "score": null,
//!       "answeredCount": 0,
//!       "correctCount": 0,
//!       "maxScore": 0,
//!       "totalQuizzes": 0
//!     }
//!   ],
//!   "count": 1
//! }
//! ```
//!
//! ## Behavior gaps
//!
//! - `POST` and other mutating methods are intentionally not migrated; `None` is
//!   returned so the worker falls through to the still-live Next.js route.
//! - Answered and correct answer counts are fetched sequentially rather than in
//!   parallel (`Promise.all` in legacy), because `OutboundHttpClient` is a shared
//!   reference here; the behavior is identical, only latency may differ on large
//!   attempt sets.
//! - The `count()` aggregate returned by PostgREST may be a JSON number or
//!   string; both are handled via `parse_aggregate_count`, mirroring the legacy
//!   `parseAggregateCount` helper.

use std::collections::{HashMap, HashSet};

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

const SUBMISSIONS_PERMISSION: &str = "view_user_groups";
const UNAUTHORIZED_MSG: &str = "Unauthorized";

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_teach_courses_courseid_tests_testid_submissions_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (raw_ws_id, course_id, test_id) = extract_path_params(request.path)?;

    Some(match request.method {
        "GET" => {
            submissions_get_response(config, request, raw_ws_id, course_id, test_id, outbound).await
        }
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn submissions_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    course_id: &str,
    test_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // 1. Authenticate and check workspace permission.
    let authorization = match authorize_workspace_permission(
        contact_data,
        request,
        raw_ws_id,
        SUBMISSIONS_PERMISSION,
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
            return message_response(500, "Error fetching submissions");
        }
    };

    let ws_id = &authorization.ws_id;

    // 2. Validate that the course exists (mirrors validateTeachCourse).
    match validate_course(contact_data, outbound, ws_id, course_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(404, "Course not found"),
        Err(()) => return message_response(500, "Error fetching submissions"),
    }

    // 3. Verify the test belongs to this course.
    match validate_test(contact_data, outbound, test_id, course_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(404, "Test not found"),
        Err(()) => return message_response(500, "Error fetching submissions"),
    }

    // 4. Fetch all attempts for this test.
    let attempts = match fetch_attempts(contact_data, outbound, test_id).await {
        Ok(a) => a,
        Err(()) => return message_response(500, "Error fetching submissions"),
    };

    if attempts.is_empty() {
        return no_store_response(json_response(200, json!({ "data": [], "count": 0 })));
    }

    // 5. Fetch user display names.
    let user_ids: Vec<String> = {
        let mut seen = HashSet::new();
        attempts
            .iter()
            .filter_map(|a| a.user_id.as_deref())
            .filter(|id| seen.insert(*id))
            .map(|id| id.to_owned())
            .collect()
    };
    let user_map = if user_ids.is_empty() {
        HashMap::new()
    } else {
        fetch_user_names(contact_data, outbound, &user_ids)
            .await
            .unwrap_or_default()
    };

    // 6. Fetch test quizzes and compute totalQuizzes / maxScore.
    let (total_quizzes, max_score) = match fetch_quiz_stats(contact_data, outbound, test_id).await {
        Ok(stats) => stats,
        Err(msg) => return message_response(500, msg),
    };

    // 7. Fetch answered and correct answer counts per attempt.
    let attempt_ids: Vec<String> = attempts.iter().map(|a| a.id.clone()).collect();
    let (answered_map, correct_map) =
        match fetch_answer_counts(contact_data, outbound, &attempt_ids).await {
            Ok(pair) => pair,
            Err(()) => return message_response(500, "Error fetching submission answer counts"),
        };

    // 8. Assemble and return the response.
    let data: Vec<Value> = attempts
        .into_iter()
        .map(|a| {
            let user_name = a
                .user_id
                .as_deref()
                .and_then(|id| user_map.get(id))
                .cloned()
                .unwrap_or_else(|| "Unknown".to_owned());
            let answered = answered_map.get(&a.id).copied().unwrap_or(0u64);
            let correct = correct_map.get(&a.id).copied().unwrap_or(0u64);
            json!({
                "id": a.id,
                "userId": a.user_id,
                "userName": user_name,
                "startedAt": a.started_at,
                "submittedAt": a.submitted_at,
                "score": a.score,
                "answeredCount": answered,
                "correctCount": correct,
                "maxScore": max_score,
                "totalQuizzes": total_quizzes,
            })
        })
        .collect();

    let count = data.len();
    no_store_response(json_response(200, json!({ "data": data, "count": count })))
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

    let rows = response.json::<Value>().map_err(|_| ())?;
    Ok(rows.as_array().is_some_and(|arr| !arr.is_empty()))
}

/// Verifies that a `course_tests` row with `id = test_id` and
/// `course_id = course_id` exists.
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

    let rows = response.json::<Value>().map_err(|_| ())?;
    Ok(rows.as_array().is_some_and(|arr| !arr.is_empty()))
}

/// Fetches all attempt rows for `test_id` from `course_test_attempts`,
/// ordered by `submitted_at desc nulls last`.
async fn fetch_attempts(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    test_id: &str,
) -> Result<Vec<AttemptRow>, ()> {
    let url = contact_data
        .rest_url(
            "course_test_attempts",
            &[
                (
                    "select",
                    "id,user_id,started_at,submitted_at,score".to_owned(),
                ),
                ("test_id", format!("eq.{test_id}")),
                ("order", "submitted_at.desc.nullslast".to_owned()),
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

    response.json::<Vec<AttemptRow>>().map_err(|_| ())
}

/// Fetches display names for the given user IDs from the `users` table.
///
/// Returns a map of `user_id -> display_name`. On upstream error returns an
/// empty map so callers fall back to "Unknown".
async fn fetch_user_names(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_ids: &[String],
) -> Result<HashMap<String, String>, ()> {
    let ids_csv = user_ids.join(",");
    let url = contact_data
        .rest_url(
            "users",
            &[
                ("select", "id,display_name".to_owned()),
                ("id", format!("in.({ids_csv})")),
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
        return Ok(HashMap::new());
    }

    let rows = response.json::<Vec<UserRow>>().unwrap_or_default();
    Ok(rows
        .into_iter()
        .map(|u| (u.id, u.display_name.unwrap_or_else(|| "Unknown".to_owned())))
        .collect())
}

/// Fetches quiz IDs for `test_id` from `course_test_quizzes`, then sums their
/// scores from `workspace_quizzes`.
///
/// Returns `(total_quizzes, max_score)`.
///
/// On error returns the appropriate client-facing error message.
async fn fetch_quiz_stats(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    test_id: &str,
) -> Result<(usize, f64), &'static str> {
    // Fetch quiz IDs linked to this test.
    let url = contact_data
        .rest_url(
            "course_test_quizzes",
            &[
                ("select", "quiz_id".to_owned()),
                ("test_id", format!("eq.{test_id}")),
            ],
        )
        .ok_or("Error fetching submission quizzes")?;

    let service_role_key = contact_data
        .service_role_key()
        .ok_or("Error fetching submission quizzes")?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| "Error fetching submission quizzes")?;

    if !(200..300).contains(&response.status) {
        return Err("Error fetching submission quizzes");
    }

    let test_quiz_rows = response
        .json::<Vec<TestQuizRow>>()
        .map_err(|_| "Error fetching submission quizzes")?;

    let quiz_ids: Vec<String> = test_quiz_rows.into_iter().map(|r| r.quiz_id).collect();
    let total_quizzes = quiz_ids.len();

    if quiz_ids.is_empty() {
        return Ok((0, 0.0));
    }

    // Fetch scores for those quizzes.
    let ids_csv = quiz_ids.join(",");
    let url2 = contact_data
        .rest_url(
            "workspace_quizzes",
            &[
                ("select", "score".to_owned()),
                ("id", format!("in.({ids_csv})")),
            ],
        )
        .ok_or("Error fetching submission quiz scores")?;

    let bearer2 = format!("Bearer {service_role_key}");

    let response2 = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url2)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer2)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| "Error fetching submission quiz scores")?;

    if !(200..300).contains(&response2.status) {
        return Err("Error fetching submission quiz scores");
    }

    let quiz_score_rows = response2
        .json::<Vec<QuizScoreRow>>()
        .map_err(|_| "Error fetching submission quiz scores")?;

    let max_score: f64 = quiz_score_rows
        .into_iter()
        .map(|q| q.score.unwrap_or(0.0))
        .sum();

    Ok((total_quizzes, max_score))
}

/// Fetches answered and correct answer counts per attempt from
/// `course_test_attempt_answers`, mirroring the legacy `Promise.all` pair.
///
/// Returns `(answered_map, correct_map)` where each maps `attempt_id -> count`.
async fn fetch_answer_counts(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    attempt_ids: &[String],
) -> Result<(HashMap<String, u64>, HashMap<String, u64>), ()> {
    if attempt_ids.is_empty() {
        return Ok((HashMap::new(), HashMap::new()));
    }

    let ids_csv = attempt_ids.join(",");
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    // All answers (answered count).
    let url_answered = contact_data
        .rest_url(
            "course_test_attempt_answers",
            &[
                ("select", "attempt_id,count()".to_owned()),
                ("attempt_id", format!("in.({ids_csv})")),
            ],
        )
        .ok_or(())?;

    let answered_response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url_answered)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&answered_response.status) {
        return Err(());
    }

    let answered_rows = answered_response
        .json::<Vec<CountAggregateRow>>()
        .map_err(|_| ())?;

    // Correct answers only.
    let bearer2 = format!("Bearer {service_role_key}");
    let url_correct = contact_data
        .rest_url(
            "course_test_attempt_answers",
            &[
                ("select", "attempt_id,count()".to_owned()),
                ("attempt_id", format!("in.({ids_csv})")),
                ("is_correct", "eq.true".to_owned()),
            ],
        )
        .ok_or(())?;

    let correct_response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url_correct)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer2)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&correct_response.status) {
        return Err(());
    }

    let correct_rows = correct_response
        .json::<Vec<CountAggregateRow>>()
        .map_err(|_| ())?;

    // Build maps.
    let answered_map: HashMap<String, u64> = answered_rows
        .into_iter()
        .map(|row| (row.attempt_id, parse_aggregate_count(row.count)))
        .collect();

    let correct_map: HashMap<String, u64> = correct_rows
        .into_iter()
        .map(|row| (row.attempt_id, parse_aggregate_count(row.count)))
        .collect();

    Ok((answered_map, correct_map))
}

// ---------------------------------------------------------------------------
// Serde types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct AttemptRow {
    id: String,
    user_id: Option<String>,
    started_at: Value,
    submitted_at: Value,
    score: Value,
}

#[derive(Deserialize)]
struct UserRow {
    id: String,
    display_name: Option<String>,
}

#[derive(Deserialize)]
struct TestQuizRow {
    quiz_id: String,
}

#[derive(Deserialize)]
struct QuizScoreRow {
    score: Option<f64>,
}

#[derive(Deserialize)]
struct CountAggregateRow {
    attempt_id: String,
    count: Option<Value>,
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/// Mirrors the legacy `parseAggregateCount` helper.
///
/// PostgREST may return the `count()` aggregate as a JSON number or string.
/// Returns `0` for `null`, non-finite, or unparseable values.
fn parse_aggregate_count(value: Option<Value>) -> u64 {
    match value {
        Some(Value::Number(n)) => n
            .as_u64()
            .or_else(|| n.as_f64().map(|f| f as u64))
            .unwrap_or(0),
        Some(Value::String(s)) => s.trim().parse::<f64>().ok().map(|f| f as u64).unwrap_or(0),
        _ => 0,
    }
}

// ---------------------------------------------------------------------------
// Path extraction
// ---------------------------------------------------------------------------

/// Extracts `(wsId, courseId, testId)` from
/// `/api/v1/workspaces/:wsId/teach/courses/:courseId/tests/:testId/submissions`.
///
/// Returns `None` when the path shape does not match this route.
fn extract_path_params(path: &str) -> Option<(&str, &str, &str)> {
    let segments = path_segments(path);

    // Expected layout:
    //
    // - api / v1 / workspaces / :wsId / teach / courses / :courseId / tests / :testId / submissions
    // - [0]   [1]      [2]       [3]     [4]     [5]        [6]        [7]     [8]          [9]
    if segments.len() != 10 {
        return None;
    }

    let ws_id = segments.get(3)?;
    let course_id = segments.get(6)?;
    let test_id = segments.get(8)?;

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
    {
        return None;
    }

    Some((ws_id, course_id, test_id))
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
        let ws_id = "ws-abc-123";
        let course_id = "course-uuid-456";
        let test_id = "test-uuid-789";
        let path = format!(
            "/api/v1/workspaces/{ws_id}/teach/courses/{course_id}/tests/{test_id}/submissions"
        );
        let result = extract_path_params(&path);
        assert_eq!(result, Some((ws_id, course_id, test_id)));
    }

    #[test]
    fn extract_no_trailing_slash() {
        let path = "/api/v1/workspaces/ws1/teach/courses/c1/tests/t1/submissions";
        let (ws, course, test) = extract_path_params(path).expect("should match");
        assert_eq!(ws, "ws1");
        assert_eq!(course, "c1");
        assert_eq!(test, "t1");
    }

    #[test]
    fn extract_wrong_suffix_returns_none() {
        let path = "/api/v1/workspaces/ws1/teach/courses/c1/tests/t1/other";
        assert!(extract_path_params(path).is_none());
    }

    #[test]
    fn extract_missing_segment_returns_none() {
        let path = "/api/v1/workspaces/ws1/teach/courses/c1/tests/submissions";
        assert!(extract_path_params(path).is_none());
    }

    #[test]
    fn extract_wrong_prefix_returns_none() {
        let path = "/api/workspaces/ws1/teach/courses/c1/tests/t1/submissions";
        assert!(extract_path_params(path).is_none());
    }

    #[test]
    fn extract_extra_segment_returns_none() {
        let path = "/api/v1/workspaces/ws1/teach/courses/c1/tests/t1/submissions/extra";
        assert!(extract_path_params(path).is_none());
    }

    #[test]
    fn parse_aggregate_count_json_number() {
        assert_eq!(parse_aggregate_count(Some(json!(42))), 42u64);
    }

    #[test]
    fn parse_aggregate_count_json_string() {
        assert_eq!(parse_aggregate_count(Some(json!("7"))), 7u64);
    }

    #[test]
    fn parse_aggregate_count_none() {
        assert_eq!(parse_aggregate_count(None), 0u64);
    }

    #[test]
    fn parse_aggregate_count_invalid_string() {
        assert_eq!(parse_aggregate_count(Some(json!("abc"))), 0u64);
    }

    #[test]
    fn parse_aggregate_count_zero() {
        assert_eq!(parse_aggregate_count(Some(json!(0))), 0u64);
    }

    #[test]
    fn parse_aggregate_count_null_json() {
        assert_eq!(parse_aggregate_count(Some(Value::Null)), 0u64);
    }
}
