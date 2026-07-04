use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    workspace_permission_check::{
        WorkspacePermissionAuthorization, WorkspacePermissionAuthorizationError,
        authorize_workspace_permission,
    },
};

const ATTEMPTS_PERMISSION: &str = "view_user_groups_reports";
const ENABLE_EDUCATION_SECRET: &str = "ENABLE_EDUCATION";
const WORKSPACE_SECRETS_TABLE: &str = "workspace_secrets";

const ATTEMPT_DETAIL_PATH_PREFIX: &str = "/api/v1/workspaces/";
const EDUCATION_ATTEMPTS_SEGMENT: &str = "/education/attempts/";

#[derive(Deserialize)]
struct WorkspaceSecretRow {
    value: Option<String>,
}

// ---------------------------------------------------------------------------
// Route entry
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_education_attempts_attemptid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (ws_id, attempt_id) = attempt_detail_path_segments(request.path)?;

    Some(match request.method {
        "GET" => attempt_detail_response(config, request, ws_id, attempt_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn attempt_detail_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    attempt_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let authorization =
        match authorize_education_workspace(config, request, raw_ws_id, outbound).await {
            Ok(authorization) => authorization,
            Err(response) => return response,
        };
    let ws_id = &authorization.ws_id;

    // 1. Fetch the attempt joined to its quiz set, scoped to this workspace.
    let attempt = match fetch_attempt(&config.contact_data, outbound, ws_id, attempt_id).await {
        Ok(Some(attempt)) => attempt,
        Ok(None) => return message_response(404, "Attempt not found"),
        Err(()) => return message_response(500, "Failed to fetch attempt details"),
    };

    let attempt_user_id = attempt.get("user_id").and_then(Value::as_str);

    // 2. Fetch the attempt answers.
    let answers = match fetch_attempt_answers(&config.contact_data, outbound, attempt_id).await {
        Ok(answers) => answers,
        Err(()) => return message_response(500, "Failed to fetch attempt answers"),
    };

    let quiz_ids = unique_string_field(&answers, "quiz_id");
    let selected_option_ids = unique_string_field(&answers, "selected_option_id");

    // 3. Parallel-ish fetches (sequential here): quizzes, selected options,
    //    all options for the involved quizzes, and learner metadata.
    let quizzes = if quiz_ids.is_empty() {
        Vec::new()
    } else {
        match fetch_quizzes(&config.contact_data, outbound, &quiz_ids).await {
            Ok(rows) => rows,
            Err(()) => return message_response(500, "Failed to fetch quiz metadata"),
        }
    };

    let selected_options = if selected_option_ids.is_empty() {
        Vec::new()
    } else {
        match fetch_options_by_ids(&config.contact_data, outbound, &selected_option_ids).await {
            Ok(rows) => rows,
            Err(()) => return message_response(500, "Failed to fetch quiz metadata"),
        }
    };

    let all_options = if quiz_ids.is_empty() {
        Vec::new()
    } else {
        match fetch_options_by_quiz_ids(&config.contact_data, outbound, &quiz_ids).await {
            Ok(rows) => rows,
            Err(()) => return message_response(500, "Failed to fetch quiz metadata"),
        }
    };

    let learner = match attempt_user_id {
        Some(user_id) => match fetch_learner(&config.contact_data, outbound, user_id).await {
            Ok(row) => row,
            Err(()) => return message_response(500, "Failed to fetch learner metadata"),
        },
        None => None,
    };

    // 4. Assemble the answer rows.
    let answer_rows: Vec<Value> = answers
        .iter()
        .map(|answer| build_answer_row(answer, &quizzes, &selected_options, &all_options))
        .collect();

    let set_name = joined_set_name(&attempt);

    let learner_payload = learner.map_or(Value::Null, |learner| {
        json!({
            "user_id": learner.user_id,
            "full_name": learner.full_name,
            "email": learner.email,
        })
    });

    no_store_response(json_response(
        200,
        json!({
            "attempt": {
                "id": attempt.get("id").cloned().unwrap_or(Value::Null),
                "attempt_number": attempt.get("attempt_number").cloned().unwrap_or(Value::Null),
                "started_at": attempt.get("started_at").cloned().unwrap_or(Value::Null),
                "submitted_at": attempt.get("submitted_at").cloned().unwrap_or(Value::Null),
                "completed_at": attempt.get("completed_at").cloned().unwrap_or(Value::Null),
                "duration_seconds": attempt.get("duration_seconds").cloned().unwrap_or(Value::Null),
                "total_score": attempt.get("total_score").cloned().unwrap_or(Value::Null),
                "set_id": attempt.get("set_id").cloned().unwrap_or(Value::Null),
                "set_name": set_name,
                "user_id": attempt.get("user_id").cloned().unwrap_or(Value::Null),
            },
            "learner": learner_payload,
            "answers": answer_rows,
        }),
    ))
}

// ---------------------------------------------------------------------------
// Authorization (permission + education feature flag)
// ---------------------------------------------------------------------------

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
        ATTEMPTS_PERMISSION,
        outbound,
    )
    .await
    .map_err(authorization_error_response)?;

    match education_workspace_enabled(&config.contact_data, outbound, &authorization.ws_id).await {
        Ok(true) => Ok(authorization),
        Ok(false) => Err(message_response(
            404,
            "Education is not enabled for this workspace",
        )),
        Err(()) => Err(message_response(500, "Failed to verify education access")),
    }
}

fn authorization_error_response(error: WorkspacePermissionAuthorizationError) -> BackendResponse {
    match error {
        WorkspacePermissionAuthorizationError::Unauthorized => {
            message_response(401, "Unauthorized")
        }
        WorkspacePermissionAuthorizationError::Forbidden => {
            message_response(403, "Insufficient permissions")
        }
        WorkspacePermissionAuthorizationError::NotFound => {
            message_response(403, "You don't have access to this workspace")
        }
        WorkspacePermissionAuthorizationError::Internal => {
            message_response(500, "Failed to verify workspace access")
        }
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
    let response = send_service_role_request(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
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

// ---------------------------------------------------------------------------
// Supabase reads
// ---------------------------------------------------------------------------

async fn fetch_attempt(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    attempt_id: &str,
) -> Result<Option<Value>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_quiz_attempts",
            &[
                (
                    "select",
                    "id,attempt_number,started_at,submitted_at,completed_at,duration_seconds,total_score,set_id,user_id,workspace_quiz_sets!inner(id,name,ws_id)"
                        .to_owned(),
                ),
                ("id", format!("eq.{attempt_id}")),
                ("workspace_quiz_sets.ws_id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<Value>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn fetch_attempt_answers(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    attempt_id: &str,
) -> Result<Vec<Value>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_quiz_attempt_answers",
            &[
                (
                    "select",
                    "id,quiz_id,selected_option_id,is_correct,score_awarded".to_owned(),
                ),
                ("attempt_id", format!("eq.{attempt_id}")),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

#[derive(Deserialize)]
struct QuizRow {
    id: Option<String>,
    question: Option<Value>,
}

async fn fetch_quizzes(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    quiz_ids: &[String],
) -> Result<Vec<QuizRow>, ()> {
    let in_list = format!("in.({})", quiz_ids.join(","));
    let url = contact_data
        .rest_url(
            "workspace_quizzes",
            &[("select", "id,question".to_owned()), ("id", in_list)],
        )
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<QuizRow>>().map_err(|_| ())
}

#[derive(Deserialize)]
struct OptionRow {
    id: Option<String>,
    quiz_id: Option<String>,
    value: Option<Value>,
    is_correct: Option<Value>,
    explanation: Option<Value>,
}

async fn fetch_options_by_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    option_ids: &[String],
) -> Result<Vec<OptionRow>, ()> {
    let in_list = format!("in.({})", option_ids.join(","));
    fetch_options(contact_data, outbound, "id", in_list).await
}

async fn fetch_options_by_quiz_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    quiz_ids: &[String],
) -> Result<Vec<OptionRow>, ()> {
    let in_list = format!("in.({})", quiz_ids.join(","));
    fetch_options(contact_data, outbound, "quiz_id", in_list).await
}

async fn fetch_options(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    filter_column: &str,
    in_list: String,
) -> Result<Vec<OptionRow>, ()> {
    let url = contact_data
        .rest_url(
            "quiz_options",
            &[
                (
                    "select",
                    "id,quiz_id,value,is_correct,explanation".to_owned(),
                ),
                (filter_column, in_list),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<OptionRow>>().map_err(|_| ())
}

#[derive(Deserialize)]
struct LearnerRow {
    user_id: Option<String>,
    full_name: Option<String>,
    email: Option<String>,
}

async fn fetch_learner(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Option<LearnerRow>, ()> {
    let url = contact_data
        .rest_url(
            "user_private_details",
            &[
                ("select", "user_id,full_name,email".to_owned()),
                ("user_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<LearnerRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn send_service_role_request(
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

// ---------------------------------------------------------------------------
// Payload assembly
// ---------------------------------------------------------------------------

fn build_answer_row(
    answer: &Value,
    quizzes: &[QuizRow],
    selected_options: &[OptionRow],
    all_options: &[OptionRow],
) -> Value {
    let quiz_id = answer.get("quiz_id").and_then(Value::as_str);
    let selected_option_id = answer.get("selected_option_id").and_then(Value::as_str);

    let quiz = quiz_id.and_then(|id| quizzes.iter().find(|quiz| quiz.id.as_deref() == Some(id)));

    let selected_option = selected_option_id.and_then(|id| {
        selected_options
            .iter()
            .find(|option| option.id.as_deref() == Some(id))
    });

    let options: Vec<Value> = match quiz_id {
        Some(id) => all_options
            .iter()
            .filter(|option| option.quiz_id.as_deref() == Some(id))
            .map(|option| {
                json!({
                    "id": option.id,
                    "value": option.value.clone().unwrap_or(Value::Null),
                    "is_correct": option.is_correct.clone().unwrap_or(Value::Null),
                    "explanation": option.explanation.clone().unwrap_or(Value::Null),
                })
            })
            .collect(),
        None => Vec::new(),
    };

    json!({
        "id": answer.get("id").cloned().unwrap_or(Value::Null),
        "quiz_id": answer.get("quiz_id").cloned().unwrap_or(Value::Null),
        "question": quiz
            .and_then(|quiz| quiz.question.clone())
            .unwrap_or(Value::Null),
        "selected_option_id": answer.get("selected_option_id").cloned().unwrap_or(Value::Null),
        "selected_option_value": selected_option
            .and_then(|option| option.value.clone())
            .unwrap_or(Value::Null),
        "selected_option_is_correct": selected_option
            .and_then(|option| option.is_correct.clone())
            .unwrap_or(Value::Null),
        "is_correct": answer.get("is_correct").cloned().unwrap_or(Value::Null),
        "score_awarded": answer.get("score_awarded").cloned().unwrap_or(Value::Null),
        "options": options,
    })
}

fn joined_set_name(attempt: &Value) -> Value {
    let joined = attempt.get("workspace_quiz_sets");
    let set = match joined {
        Some(Value::Array(items)) => items.first(),
        other => other,
    };

    set.and_then(|set| set.get("name"))
        .cloned()
        .unwrap_or(Value::Null)
}

fn unique_string_field(rows: &[Value], field: &str) -> Vec<String> {
    let mut seen: Vec<String> = Vec::new();
    for row in rows {
        if let Some(value) = row.get(field).and_then(Value::as_str) {
            let owned = value.to_owned();
            if !seen.contains(&owned) {
                seen.push(owned);
            }
        }
    }
    seen
}

// ---------------------------------------------------------------------------
// Path matching
// ---------------------------------------------------------------------------

/// Matches `/api/v1/workspaces/{wsId}/education/attempts/{attemptId}` and
/// returns `(wsId, attemptId)`. Returns `None` for any other shape (including
/// the collection route `/education/attempts` which has no trailing segment).
fn attempt_detail_path_segments(path: &str) -> Option<(&str, &str)> {
    let remainder = path.strip_prefix(ATTEMPT_DETAIL_PATH_PREFIX)?;
    let (ws_id, after_ws) = remainder.split_once(EDUCATION_ATTEMPTS_SEGMENT)?;

    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }

    let attempt_id = after_ws;
    if attempt_id.is_empty() || attempt_id.contains('/') {
        return None;
    }

    Some((ws_id, attempt_id))
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
