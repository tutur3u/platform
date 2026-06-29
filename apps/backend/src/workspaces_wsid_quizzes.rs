//! Handler for `GET /api/v1/workspaces/:wsId/quizzes`.
//!
//! Ports the GET path of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/quizzes/route.ts`. Only GET is
//! migrated here; the legacy route also exposes POST, which still runs through
//! Next.js (this handler returns `None` for non-GET methods so the dispatch
//! chain falls through).
//!
//! Auth model: the legacy route uses `requireTeachWorkspaceAccess` with the
//! `update_user_groups` permission and `allowAppSessionAuth: { targetApp:
//! 'teach' }`. This is reproduced with
//! `workspace_permission_check::authorize_workspace_permission`, which
//! normalizes the workspace id, verifies membership, and checks the permission.
//! Status mapping mirrors the legacy helper:
//!   * missing/invalid session (`getPermissions` returns null) -> `401 Unauthorized`
//!   * caller lacking `update_user_groups`                      -> `403 Insufficient permissions`
//!   * caller not a workspace member / unresolved workspace     -> `403 You don't have access to this workspace`
//!   * configuration / upstream failure                         -> `500 Failed to verify workspace access`
//!
//! Reads (`workspace_quizzes`, `course_module_quizzes`) use the service-role
//! key, matching the legacy admin (sbAdmin) client. Private answers are read
//! from the `private.workspace_quiz_answers` table (PostgREST `Accept-Profile:
//! private`) and merged onto each quiz, mirroring
//! `attachPrivateWorkspaceQuizAnswers`, including the missing-relation fallback
//! (`42P01` / `PGRST106` / `PGRST205` or a body mentioning
//! `workspace_quiz_answers`) that keeps the inline `workspace_quizzes.answer`.
//!
//! GAP: when the private-answers read fails with a non-missing-relation error,
//! the legacy helper throws (Next.js then surfaces a generic 500). This handler
//! returns `500` with `{ "message": "Error fetching workspace quizzes" }` in
//! that case rather than reproducing Next.js's framework-level error body.

use std::collections::HashMap;

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
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const QUIZZES_PATH_PREFIX: &str = "/api/v1/workspaces/";
const QUIZZES_PATH_SUFFIX: &str = "/quizzes";
const QUIZZES_PERMISSION: &str = "update_user_groups";
const WORKSPACE_QUIZZES_TABLE: &str = "workspace_quizzes";
const COURSE_MODULE_QUIZZES_TABLE: &str = "course_module_quizzes";
const PRIVATE_QUIZ_ANSWERS_TABLE: &str = "workspace_quiz_answers";
const PRIVATE_SCHEMA: &str = "private";
const WORKSPACE_QUIZZES_SELECT: &str =
    "id, question, type, content, answer, created_at, quiz_options(id, value, is_correct, explanation)";

#[derive(Deserialize)]
struct CourseModuleQuizRow {
    quiz_id: Option<String>,
}

#[derive(Deserialize)]
struct PrivateQuizAnswerRow {
    quiz_id: Option<String>,
    #[serde(default)]
    answer: Value,
}

#[derive(Deserialize)]
struct PostgrestError {
    code: Option<String>,
    message: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_quizzes_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = quizzes_ws_id(request.path)?;

    Some(match request.method {
        "GET" => quizzes_response(config, request, raw_ws_id, outbound).await,
        // The legacy route still serves POST through Next.js; fall through.
        _ => return None,
    })
}

async fn quizzes_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Mirror legacy `requireTeachWorkspaceAccess({ permission:
    // 'update_user_groups' })`: normalize the workspace id, verify membership,
    // and require the permission. Returns the normalized workspace id.
    let authorization = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        QUIZZES_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return message_response(401, "Unauthorized");
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return message_response(403, "Insufficient permissions");
        }
        Err(WorkspacePermissionAuthorizationError::NotFound) => {
            return message_response(403, "You don't have access to this workspace");
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, "Failed to verify workspace access");
        }
    };

    let query = education_read_query_from_url(request.url);
    let module_id = module_id_query_value(request.url);
    let contact_data = &config.contact_data;

    // Optional moduleId filter: resolve the quiz ids linked to the module first.
    let module_quiz_ids = match module_id.as_deref() {
        Some(module_id) => {
            match fetch_course_module_quiz_ids(contact_data, outbound, module_id).await {
                Ok(ids) => {
                    // Legacy short-circuits with an empty page when the module
                    // has no linked quizzes.
                    if ids.is_empty() {
                        return empty_page_response(&query);
                    }
                    Some(ids)
                }
                Err(()) => return module_quizzes_error_response(),
            }
        }
        None => None,
    };

    let read = match fetch_workspace_quizzes(
        contact_data,
        outbound,
        &authorization.ws_id,
        &query,
        module_quiz_ids.as_deref(),
    )
    .await
    {
        Ok(read) => read,
        Err(()) => return quizzes_error_response(),
    };

    let mut quizzes = match read.response.json::<Vec<Value>>() {
        Ok(rows) => rows,
        Err(_) => return quizzes_error_response(),
    };
    let count = total_count_from_content_range(&read.response).unwrap_or(0);

    // Mirror `attachPrivateWorkspaceQuizAnswers`: overlay private answers, with
    // a fallback to the inline `workspace_quizzes.answer` when the private
    // relation is unavailable.
    match attach_private_answers(contact_data, outbound, &mut quizzes).await {
        Ok(()) => {}
        Err(()) => return quizzes_error_response(),
    }

    no_store_response(json_response(
        200,
        json!({
            "data": quizzes,
            "count": count,
            "page": query.page,
            "pageSize": query.page_size,
        }),
    ))
}

struct WorkspaceQuizzesRead {
    response: OutboundResponse,
}

async fn fetch_course_module_quiz_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    module_id: &str,
) -> Result<Vec<String>, ()> {
    let url = contact_data
        .rest_url(
            COURSE_MODULE_QUIZZES_TABLE,
            &[
                ("select", "quiz_id".to_owned()),
                ("module_id", format!("eq.{module_id}")),
            ],
        )
        .ok_or(())?;

    let response = send_service_role_get(contact_data, outbound, &url, None, None, false).await?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<CourseModuleQuizRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.quiz_id)
        .collect())
}

async fn fetch_workspace_quizzes(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &EducationReadQuery,
    module_quiz_ids: Option<&[String]>,
) -> Result<WorkspaceQuizzesRead, ()> {
    let mut params = vec![
        ("select", WORKSPACE_QUIZZES_SELECT.to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "created_at.desc".to_owned()),
    ];
    if let Some(ids) = module_quiz_ids {
        // Legacy `.in('id', quizIds)` -> PostgREST `id=in.(id1,id2,...)`.
        params.push(("id", format!("in.({})", ids.join(","))));
    }
    if let Some(q) = query.q.as_deref().filter(|q| !q.is_empty()) {
        // Legacy `.ilike('question', '%q%')`.
        params.push(("question", format!("ilike.*{q}*")));
    }

    let url = contact_data
        .rest_url(WORKSPACE_QUIZZES_TABLE, &params)
        .ok_or(())?;

    let response = send_service_role_get(
        contact_data,
        outbound,
        &url,
        Some(&education_read_range(query)),
        Some("count=exact"),
        false,
    )
    .await?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(WorkspaceQuizzesRead { response })
}

async fn attach_private_answers(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    quizzes: &mut [Value],
) -> Result<(), ()> {
    if quizzes.is_empty() {
        return Ok(());
    }

    let quiz_ids: Vec<String> = quizzes
        .iter()
        .filter_map(|quiz| quiz.get("id").and_then(Value::as_str))
        .map(str::to_owned)
        .collect();
    if quiz_ids.is_empty() {
        apply_answers(quizzes, None);
        return Ok(());
    }

    let url = contact_data
        .rest_url(
            PRIVATE_QUIZ_ANSWERS_TABLE,
            &[
                ("select", "quiz_id, answer".to_owned()),
                ("quiz_id", format!("in.({})", quiz_ids.join(","))),
            ],
        )
        .ok_or(())?;

    let response = send_service_role_get(contact_data, outbound, &url, None, None, true).await?;

    if !is_success(response.status) {
        // Mirror `isMissingPrivateQuizAnswerRelation`: a missing private
        // relation falls back to the inline answer; any other error throws.
        if is_missing_private_relation(&response) {
            apply_answers(quizzes, None);
            return Ok(());
        }
        return Err(());
    }

    let rows = response
        .json::<Vec<PrivateQuizAnswerRow>>()
        .map_err(|_| ())?;
    let answer_by_quiz_id: HashMap<String, Value> = rows
        .into_iter()
        .filter_map(|row| row.quiz_id.map(|quiz_id| (quiz_id, row.answer)))
        .collect();

    apply_answers(quizzes, Some(&answer_by_quiz_id));
    Ok(())
}

/// Overlays each quiz's `answer` field. With a lookup map present, a matching
/// quiz id uses the private answer (which may itself be JSON `null`); otherwise
/// the existing inline answer is preserved (`quiz.answer ?? null`).
fn apply_answers(quizzes: &mut [Value], answer_by_quiz_id: Option<&HashMap<String, Value>>) {
    for quiz in quizzes.iter_mut() {
        let merged = merged_answer(quiz, answer_by_quiz_id);
        if let Value::Object(map) = quiz {
            map.insert("answer".to_owned(), merged);
        }
    }
}

fn merged_answer(quiz: &Value, answer_by_quiz_id: Option<&HashMap<String, Value>>) -> Value {
    let inline = quiz.get("answer").cloned().unwrap_or(Value::Null);
    let Some(map) = answer_by_quiz_id else {
        return inline;
    };
    let Some(id) = quiz.get("id").and_then(Value::as_str) else {
        return inline;
    };

    match map.get(id) {
        Some(answer) => answer.clone(),
        None => inline,
    }
}

fn is_missing_private_relation(response: &OutboundResponse) -> bool {
    if response.body_text.to_ascii_lowercase().contains("workspace_quiz_answers") {
        return true;
    }

    match response.json::<PostgrestError>() {
        Ok(error) => {
            let missing_code = error
                .code
                .as_deref()
                .is_some_and(|code| matches!(code, "42P01" | "PGRST106" | "PGRST205"));
            let missing_message = error
                .message
                .as_deref()
                .is_some_and(|message| {
                    message.to_ascii_lowercase().contains("workspace_quiz_answers")
                });
            missing_code || missing_message
        }
        Err(_) => false,
    }
}

async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    range: Option<&str>,
    prefer: Option<&str>,
    private_schema: bool,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if private_schema {
        request = request.with_header("Accept-Profile", PRIVATE_SCHEMA);
    }
    if let Some(range) = range {
        request = request
            .with_header("Range-Unit", "items")
            .with_header("Range", range);
    }
    if let Some(prefer) = prefer {
        request = request.with_header("Prefer", prefer);
    }

    outbound.send(request).await.map_err(|_| ())
}

fn empty_page_response(query: &EducationReadQuery) -> BackendResponse {
    no_store_response(json_response(
        200,
        json!({
            "data": [],
            "count": 0,
            "page": query.page,
            "pageSize": query.page_size,
        }),
    ))
}

fn module_quizzes_error_response() -> BackendResponse {
    message_response(500, "Error fetching course module quizzes")
}

fn quizzes_error_response() -> BackendResponse {
    message_response(500, "Error fetching workspace quizzes")
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

fn quizzes_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(QUIZZES_PATH_PREFIX)?
        .strip_suffix(QUIZZES_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

/// Mirrors legacy `searchParams.get('moduleId')?.trim()` with the truthiness
/// guard: the first `moduleId` value, trimmed; empty (or absent) -> `None`.
fn module_id_query_value(request_url: Option<&str>) -> Option<String> {
    let parsed = url::Url::parse(request_url?).ok()?;
    parsed.query_pairs().find_map(|(key, value)| {
        if key != "moduleId" {
            return None;
        }
        let trimmed = value.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_owned())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ws_id_extracted_from_quizzes_path() {
        assert_eq!(
            quizzes_ws_id("/api/v1/workspaces/ws-123/quizzes"),
            Some("ws-123")
        );
    }

    #[test]
    fn ws_id_rejects_other_paths() {
        assert_eq!(quizzes_ws_id("/api/v1/workspaces/ws-123/quiz-sets"), None);
        assert_eq!(
            quizzes_ws_id("/api/v1/workspaces/ws-123/quizzes/extra"),
            None
        );
        assert_eq!(quizzes_ws_id("/api/v1/workspaces//quizzes"), None);
        assert_eq!(quizzes_ws_id("/api/workspaces/ws-123/quizzes"), None);
    }

    #[test]
    fn module_id_trimmed_and_empty_treated_as_absent() {
        assert_eq!(
            module_id_query_value(Some(
                "https://x.localhost/api/v1/workspaces/ws/quizzes?moduleId=%20m1%20"
            )),
            Some("m1".to_owned())
        );
        assert_eq!(
            module_id_query_value(Some(
                "https://x.localhost/api/v1/workspaces/ws/quizzes?moduleId=%20%20"
            )),
            None
        );
        assert_eq!(
            module_id_query_value(Some(
                "https://x.localhost/api/v1/workspaces/ws/quizzes"
            )),
            None
        );
    }

    #[test]
    fn module_id_takes_first_value() {
        assert_eq!(
            module_id_query_value(Some(
                "https://x.localhost/api/v1/workspaces/ws/quizzes?moduleId=a&moduleId=b"
            )),
            Some("a".to_owned())
        );
    }

    #[test]
    fn merged_answer_prefers_private_value_when_present() {
        let quiz = json!({ "id": "q1", "answer": "inline" });
        let mut map = HashMap::new();
        map.insert("q1".to_owned(), json!("private"));
        assert_eq!(merged_answer(&quiz, Some(&map)), json!("private"));
    }

    #[test]
    fn merged_answer_uses_null_private_value_when_row_present() {
        let quiz = json!({ "id": "q1", "answer": "inline" });
        let mut map = HashMap::new();
        map.insert("q1".to_owned(), Value::Null);
        assert_eq!(merged_answer(&quiz, Some(&map)), Value::Null);
    }

    #[test]
    fn merged_answer_falls_back_to_inline_when_no_private_row() {
        let quiz = json!({ "id": "q1", "answer": "inline" });
        let map: HashMap<String, Value> = HashMap::new();
        assert_eq!(merged_answer(&quiz, Some(&map)), json!("inline"));
    }

    #[test]
    fn merged_answer_falls_back_to_inline_without_lookup() {
        let quiz = json!({ "id": "q1", "answer": "inline" });
        assert_eq!(merged_answer(&quiz, None), json!("inline"));
    }

    #[test]
    fn merged_answer_defaults_missing_inline_to_null() {
        let quiz = json!({ "id": "q1" });
        assert_eq!(merged_answer(&quiz, None), Value::Null);
    }

    #[test]
    fn apply_answers_overwrites_answer_field() {
        let mut quizzes = vec![json!({ "id": "q1", "answer": "inline" })];
        let mut map = HashMap::new();
        map.insert("q1".to_owned(), json!({ "correct": 2 }));
        apply_answers(&mut quizzes, Some(&map));
        assert_eq!(quizzes[0]["answer"], json!({ "correct": 2 }));
    }
}
