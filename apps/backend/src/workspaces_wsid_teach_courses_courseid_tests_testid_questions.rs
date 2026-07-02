//! Handler for `GET /api/v1/workspaces/:wsId/teach/courses/:courseId/tests/:testId/questions`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/teach/courses/[courseId]/tests/[testId]/questions/route.ts`
//! (GET only; POST is not migrated and returns `None` so the worker falls through
//! to the still-live Next.js route).
//!
//! ## Auth
//!
//! The legacy route uses `requireTeachWorkspaceAccess` with permission
//! `view_user_groups`. This handler reproduces that via
//! `workspace_permission_check::authorize_workspace_permission`.
//!
//! ## GET query params
//!
//! - `moduleId` (optional UUID): when supplied, filters `course_test_quizzes` by
//!   `module_id` and validates that the module exists in the test via a lookup in
//!   `course_test_modules`.
//!
//! ## GET response shape
//!
//! ```json
//! { "data": [...], "count": N }
//! ```
//!
//! Each quiz item contains:
//!
//! - `id`, `question`, `type`, `content`, `answer`, `created_at`
//! - `quiz_options`: embedded array with `id`, `value`, `is_correct`, `explanation`
//!
//! ## Behavior gaps
//!
//! - `POST` is intentionally not migrated; `None` is returned for non-GET methods.
//! - The legacy `attachPrivateWorkspaceQuizAnswers` helper queries the `private`
//!   Supabase schema (`private.workspace_quiz_answers`) and overlays each quiz's
//!   `answer` field with the private value. This port attempts the same via the
//!   `Accept-Profile: private` PostgREST header. On any failure (missing relation,
//!   network error, parse error) the main query's `answer` field is used as-is,
//!   matching the legacy fallback path when `isMissingPrivateQuizAnswerRelation`
//!   is `true`.

use serde::Deserialize;
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const PERMISSION: &str = "view_user_groups";
const PRIVATE_SCHEMA: &str = "private";

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_teach_courses_courseid_tests_testid_questions_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (raw_ws_id, raw_course_id, raw_test_id) = extract_path_params(request.path)?;

    Some(match request.method {
        "GET" => {
            questions_get_response(
                config,
                request,
                raw_ws_id,
                raw_course_id,
                raw_test_id,
                outbound,
            )
            .await
        }
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn questions_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    course_id: &str,
    test_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // 1. Authenticate and check workspace permission.
    let authorization = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        PERMISSION,
        outbound,
    )
    .await
    {
        Ok(auth) => auth,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return message_response(401, "Unauthorized");
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return message_response(403, "Unauthorized");
        }
        Err(WorkspacePermissionAuthorizationError::NotFound) => {
            return message_response(403, "You don't have access to this workspace");
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, "Error fetching test questions");
        }
    };

    let ws_id = &authorization.ws_id;

    // 2. Validate that the course exists in this workspace.
    match validate_course(&config.contact_data, outbound, ws_id, course_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(404, "Course not found"),
        Err(()) => return message_response(500, "Error validating course"),
    }

    // 3. Validate that the test exists and belongs to the course.
    match validate_course_test(&config.contact_data, outbound, course_id, test_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(404, "Test not found"),
        Err(()) => return message_response(500, "Error validating course test"),
    }

    // 4. Parse optional moduleId query param.
    let module_id = match parse_module_id(request.url) {
        Ok(mid) => mid,
        Err(msg) => return message_response(400, msg),
    };

    // 5. If moduleId supplied, validate it belongs to the test.
    if let Some(mid) = module_id.as_deref() {
        match validate_course_test_module(&config.contact_data, outbound, test_id, mid).await {
            Ok(true) => {}
            Ok(false) => return message_response(404, "Module not found for test"),
            Err(()) => return message_response(500, "Error validating course test module"),
        }
    }

    // 6. Fetch the quiz IDs linked to this test (optionally filtered by module).
    let quiz_ids = match fetch_test_quiz_ids(
        &config.contact_data,
        outbound,
        test_id,
        module_id.as_deref(),
    )
    .await
    {
        Ok(ids) => ids,
        Err(()) => {
            return message_response(500, "Error fetching course test quizzes connection");
        }
    };

    // 7. Early return when there are no linked quizzes.
    if quiz_ids.is_empty() {
        return no_store_response(json_response(200, json!({ "data": [], "count": 0 })));
    }

    // 8. Fetch full quiz details from workspace_quizzes.
    let (mut quizzes, count) =
        match fetch_workspace_quizzes(&config.contact_data, outbound, ws_id, &quiz_ids).await {
            Ok(result) => result,
            Err(()) => return message_response(500, "Error fetching workspace quizzes"),
        };

    // 9. Overlay private answers (best-effort; falls back to main query's answer on error).
    overlay_private_answers(&config.contact_data, outbound, &quiz_ids, &mut quizzes).await;

    no_store_response(json_response(
        200,
        json!({ "data": quizzes, "count": count }),
    ))
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

/// Checks that a `workspace_user_groups` row with `id = course_id` and
/// `ws_id = ws_id` exists, mirroring `validateTeachCourse`.
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

/// Checks that a `course_tests` row with `id = test_id` and
/// `course_id = course_id` exists, mirroring `validateCourseTest`.
async fn validate_course_test(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    course_id: &str,
    test_id: &str,
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

/// Checks that a `course_test_modules` row with `test_id = test_id` and
/// `module_id = module_id` exists, mirroring `validateCourseTestModule`.
async fn validate_course_test_module(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    test_id: &str,
    module_id: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            "course_test_modules",
            &[
                ("select", "module_id".to_owned()),
                ("test_id", format!("eq.{test_id}")),
                ("module_id", format!("eq.{module_id}")),
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

/// Fetches the list of quiz IDs linked to `test_id` in `course_test_quizzes`,
/// optionally filtered by `module_id`.
async fn fetch_test_quiz_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    test_id: &str,
    module_id: Option<&str>,
) -> Result<Vec<String>, ()> {
    let mut params: Vec<(&str, String)> = vec![
        ("select", "quiz_id".to_owned()),
        ("test_id", format!("eq.{test_id}")),
    ];

    if let Some(mid) = module_id {
        params.push(("module_id", format!("eq.{mid}")));
    }

    let url = contact_data
        .rest_url("course_test_quizzes", &params)
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

    let rows = response.json::<Vec<TestQuizRow>>().map_err(|_| ())?;

    Ok(rows.into_iter().filter_map(|r| r.quiz_id).collect())
}

/// Fetches full quiz details from `workspace_quizzes` with embedded
/// `quiz_options`, mirroring the legacy Supabase query with `{ count: 'exact' }`.
///
/// Returns `(quizzes, total_count)`.
async fn fetch_workspace_quizzes(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    quiz_ids: &[String],
) -> Result<(Vec<Map<String, Value>>, i64), ()> {
    // PostgREST `in` filter: `id=in.(uuid1,uuid2,...)`
    let ids_csv = quiz_ids.join(",");
    let in_filter = format!("in.({ids_csv})");

    let select =
        "id,question,type,content,answer,created_at,quiz_options(id,value,is_correct,explanation)";

    let url = contact_data
        .rest_url(
            "workspace_quizzes",
            &[
                ("select", select.to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("id", in_filter),
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
                .with_header("apikey", service_role_key)
                .with_header("Prefer", "count=exact"),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let count = content_range_total(response.header("content-range")).unwrap_or(0);
    let data = response.json::<Vec<Map<String, Value>>>().map_err(|_| ())?;

    Ok((data, count))
}

/// Attempts to fetch private quiz answers from `private.workspace_quiz_answers`
/// and overlay the `answer` field on each quiz in `quizzes`. On any failure
/// (missing relation, network error, parse error) the existing `answer` value
/// from the main query is left unchanged, matching the legacy fallback path.
async fn overlay_private_answers(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    quiz_ids: &[String],
    quizzes: &mut [Map<String, Value>],
) {
    let ids_csv = quiz_ids.join(",");
    let in_filter = format!("in.({ids_csv})");

    let url = match contact_data.rest_url(
        "workspace_quiz_answers",
        &[
            ("select", "quiz_id,answer".to_owned()),
            ("quiz_id", in_filter),
        ],
    ) {
        Some(u) => u,
        None => return,
    };

    let service_role_key = match contact_data.service_role_key() {
        Some(k) => k,
        None => return,
    };
    let bearer = format!("Bearer {service_role_key}");

    let response = match outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA),
        )
        .await
    {
        Ok(r) => r,
        Err(_) => return,
    };

    if !(200..300).contains(&response.status) {
        return;
    }

    let private_rows: Vec<PrivateAnswerRow> = match response.json() {
        Ok(rows) => rows,
        Err(_) => return,
    };

    // Build a lookup map from quiz_id -> answer.
    let mut answer_map: std::collections::HashMap<String, Value> = std::collections::HashMap::new();
    for row in private_rows {
        if let Some(qid) = row.quiz_id {
            answer_map.insert(qid, row.answer.unwrap_or(Value::Null));
        }
    }

    // Overlay answers: if a private answer exists for this quiz, use it.
    for quiz in quizzes.iter_mut() {
        if let Some(Value::String(id)) = quiz.get("id").cloned()
            && let Some(private_answer) = answer_map.get(&id)
        {
            quiz.insert("answer".to_owned(), private_answer.clone());
        }
    }
}

/// Parses the total row count from a PostgREST `Content-Range` header value
/// such as `0-49/256` -> `256`, or `*/0` -> `0`.
fn content_range_total(header: Option<&str>) -> Option<i64> {
    let total = header?.split('/').nth(1)?.trim();
    if total == "*" {
        return None;
    }
    total.parse::<i64>().ok()
}

// ---------------------------------------------------------------------------
// Path extraction
// ---------------------------------------------------------------------------

/// Extracts `(wsId, courseId, testId)` from
/// `/api/v1/workspaces/:wsId/teach/courses/:courseId/tests/:testId/questions`.
///
/// Returns `None` when the path shape does not match this route.
fn extract_path_params(path: &str) -> Option<(&str, &str, &str)> {
    let segments = path_segments(path);

    // Expected layout (10 segments):
    // api[0] v1[1] workspaces[2] :wsId[3] teach[4] courses[5] :courseId[6] tests[7] :testId[8] questions[9]
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
        || segments[9] != "questions"
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
// Query param parsing
// ---------------------------------------------------------------------------

/// Parses the optional `moduleId` query parameter from the request URL.
///
/// Returns `Ok(None)` when the param is absent, `Ok(Some(id))` when it is a
/// non-empty string (UUID format validated inline), or `Err(msg)` when the
/// value is present but not a valid UUID.
fn parse_module_id(url: Option<&str>) -> Result<Option<String>, &'static str> {
    let raw = match url.and_then(|raw| url::Url::parse(raw).ok()) {
        Some(parsed) => parsed
            .query_pairs()
            .find(|(k, _)| k == "moduleId")
            .map(|(_, v)| v.trim().to_owned()),
        None => None,
    };

    match raw {
        None => Ok(None),
        Some(s) if s.is_empty() => Ok(None),
        Some(s) => {
            if is_valid_uuid(&s) {
                Ok(Some(s))
            } else {
                Err("Invalid module id")
            }
        }
    }
}

/// Returns `true` when the string has the standard UUID layout
/// (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`, all hex).
fn is_valid_uuid(s: &str) -> bool {
    if s.len() != 36 {
        return false;
    }
    let b = s.as_bytes();
    if b[8] != b'-' || b[13] != b'-' || b[18] != b'-' || b[23] != b'-' {
        return false;
    }
    for (i, &c) in b.iter().enumerate() {
        if i == 8 || i == 13 || i == 18 || i == 23 {
            continue;
        }
        if !c.is_ascii_hexdigit() {
            return false;
        }
    }
    true
}

// ---------------------------------------------------------------------------
// Serde types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct TestQuizRow {
    quiz_id: Option<String>,
}

#[derive(Deserialize)]
struct PrivateAnswerRow {
    quiz_id: Option<String>,
    answer: Option<Value>,
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

    // -- path extraction --

    #[test]
    fn extract_valid_path() {
        let ws = "ws-abc-123";
        let course = "course-uuid-456";
        let test = "test-uuid-789";
        let path = format!("/api/v1/workspaces/{ws}/teach/courses/{course}/tests/{test}/questions");
        let result = extract_path_params(&path);
        assert_eq!(result, Some((ws, course, test)));
    }

    #[test]
    fn extract_no_leading_slash() {
        let path = "api/v1/workspaces/ws1/teach/courses/c1/tests/t1/questions";
        let result = extract_path_params(path);
        assert_eq!(result, Some(("ws1", "c1", "t1")));
    }

    #[test]
    fn extract_wrong_suffix_returns_none() {
        let path = "/api/v1/workspaces/ws1/teach/courses/c1/tests/t1/other";
        assert!(extract_path_params(path).is_none());
    }

    #[test]
    fn extract_too_few_segments_returns_none() {
        let path = "/api/v1/workspaces/ws1/teach/courses/c1/tests/t1";
        assert!(extract_path_params(path).is_none());
    }

    #[test]
    fn extract_extra_segment_returns_none() {
        let path = "/api/v1/workspaces/ws1/teach/courses/c1/tests/t1/questions/extra";
        assert!(extract_path_params(path).is_none());
    }

    #[test]
    fn extract_wrong_infix_returns_none() {
        let path = "/api/v1/workspaces/ws1/teach/courses/c1/exams/t1/questions";
        assert!(extract_path_params(path).is_none());
    }

    #[test]
    fn extract_empty_ws_id_returns_none() {
        let path = "/api/v1/workspaces//teach/courses/c1/tests/t1/questions";
        assert!(extract_path_params(path).is_none());
    }

    #[test]
    fn extract_no_v1_returns_none() {
        let path = "/api/workspaces/ws1/teach/courses/c1/tests/t1/questions";
        assert!(extract_path_params(path).is_none());
    }

    // -- UUID validation --

    #[test]
    fn valid_uuid_accepted() {
        assert!(is_valid_uuid("550e8400-e29b-41d4-a716-446655440000"));
    }

    #[test]
    fn invalid_uuid_short_rejected() {
        assert!(!is_valid_uuid("550e8400-e29b-41d4-a716"));
    }

    #[test]
    fn invalid_uuid_bad_chars_rejected() {
        assert!(!is_valid_uuid("550e8400-e29b-41d4-a716-44665544zzzz"));
    }

    #[test]
    fn invalid_uuid_missing_dashes_rejected() {
        assert!(!is_valid_uuid("550e8400e29b41d4a716446655440000xx"));
    }

    // -- moduleId query param parsing --

    #[test]
    fn parse_module_id_absent_returns_none() {
        let result = parse_module_id(Some("http://example.com/api?foo=bar"));
        assert_eq!(result, Ok(None));
    }

    #[test]
    fn parse_module_id_valid_uuid_returns_some() {
        let uuid = "550e8400-e29b-41d4-a716-446655440000";
        let url = format!("http://example.com/api?moduleId={uuid}");
        let result = parse_module_id(Some(&url));
        assert_eq!(result, Ok(Some(uuid.to_owned())));
    }

    #[test]
    fn parse_module_id_invalid_returns_err() {
        let result = parse_module_id(Some("http://example.com/api?moduleId=not-a-uuid"));
        assert!(result.is_err());
    }

    #[test]
    fn parse_module_id_empty_returns_none() {
        let result = parse_module_id(Some("http://example.com/api?moduleId="));
        assert_eq!(result, Ok(None));
    }

    #[test]
    fn parse_module_id_no_url_returns_none() {
        let result = parse_module_id(None);
        assert_eq!(result, Ok(None));
    }

    // -- content-range parsing --

    #[test]
    fn content_range_total_parses_total() {
        assert_eq!(content_range_total(Some("0-49/256")), Some(256));
        assert_eq!(content_range_total(Some("*/0")), Some(0));
        assert_eq!(content_range_total(Some("0-0/*")), None);
        assert_eq!(content_range_total(None), None);
    }
}
