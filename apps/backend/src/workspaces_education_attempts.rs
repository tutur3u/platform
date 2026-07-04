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

const ATTEMPTS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const ATTEMPTS_PATH_SUFFIX: &str = "/education/attempts";

const DEFAULT_PAGE_SIZE: i64 = 20;
const MAX_PAGE_SIZE: i64 = 100;

#[derive(Deserialize)]
struct WorkspaceSecretRow {
    value: Option<String>,
}

#[derive(Clone, Debug, Default)]
struct AttemptsQuery {
    page: i64,
    page_size: i64,
    set_id: Option<String>,
    learner_id: Option<String>,
    status: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
    sort_by: Option<String>,
    sort_direction: Option<String>,
}

pub(crate) async fn handle_workspaces_education_attempts_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = attempts_ws_id(request.path)?;

    Some(match request.method {
        "GET" => attempts_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn attempts_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let authorization =
        match authorize_education_workspace(config, request, raw_ws_id, outbound).await {
            Ok(authorization) => authorization,
            Err(response) => return response,
        };
    let ws_id = &authorization.ws_id;
    let query = attempts_query_from_url(request.url);

    // Fetch the page of attempts (with exact count) joined to their quiz set.
    let attempts_resp = match fetch_attempts(&config.contact_data, outbound, ws_id, &query).await {
        Ok(response) => response,
        Err(()) => return message_response(500, "Failed to fetch attempts"),
    };
    let count = total_count_from_content_range(&attempts_resp).unwrap_or(0);
    let attempts = match attempts_resp.json::<Vec<Value>>() {
        Ok(rows) => rows,
        Err(_) => return message_response(500, "Failed to fetch attempts"),
    };

    let learner_ids = unique_string_field(&attempts, "user_id");
    let set_ids = unique_string_field(&attempts, "set_id");

    // Learner metadata (only when there are learners on this page).
    let learners = if learner_ids.is_empty() {
        Vec::new()
    } else {
        match fetch_learners(&config.contact_data, outbound, &learner_ids).await {
            Ok(rows) => rows,
            Err(()) => return message_response(500, "Failed to fetch learner metadata"),
        }
    };

    // All quiz sets for the workspace (filter options).
    let sets = match fetch_quiz_sets(&config.contact_data, outbound, ws_id).await {
        Ok(rows) => rows,
        Err(()) => return message_response(500, "Failed to fetch quiz sets"),
    };

    let payload: Vec<Value> = attempts
        .iter()
        .map(|attempt| build_attempt_payload(attempt, &learners))
        .collect();

    let learners_filter: Vec<Value> = learners
        .iter()
        .map(|learner| {
            json!({
                "user_id": learner.user_id,
                "full_name": learner.full_name,
                "email": learner.email,
            })
        })
        .collect();

    let sets_filter: Vec<Value> = sets
        .iter()
        .map(|quiz_set| {
            json!({
                "id": quiz_set.id,
                "name": quiz_set.name,
            })
        })
        .collect();

    no_store_response(json_response(
        200,
        json!({
            "page": query.page,
            "pageSize": query.page_size,
            "count": count,
            "attempts": payload,
            "filters": {
                "learners": learners_filter,
                "sets": sets_filter,
                "selected": {
                    "setId": query.set_id,
                    "learnerId": query.learner_id,
                    "status": query.status.clone().unwrap_or_else(|| "all".to_owned()),
                    "dateFrom": query.date_from,
                    "dateTo": query.date_to,
                    "sortBy": query.sort_by.clone().unwrap_or_else(|| "newest".to_owned()),
                    "sortDirection": query
                        .sort_direction
                        .clone()
                        .unwrap_or_else(|| "desc".to_owned()),
                },
            },
            "includedSetIds": set_ids,
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
    let response = send_service_role_request(contact_data, outbound, &url, None, None).await?;

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

async fn fetch_attempts(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &AttemptsQuery,
) -> Result<OutboundResponse, ()> {
    let mut params = vec![
        (
            "select",
            "id,attempt_number,started_at,submitted_at,completed_at,duration_seconds,total_score,set_id,user_id,workspace_quiz_sets!inner(id,name,ws_id)"
                .to_owned(),
        ),
        ("workspace_quiz_sets.ws_id", format!("eq.{ws_id}")),
    ];

    if let Some(set_id) = query.set_id.as_deref().filter(|value| !value.is_empty()) {
        params.push(("set_id", format!("eq.{set_id}")));
    }
    if let Some(learner_id) = query
        .learner_id
        .as_deref()
        .filter(|value| !value.is_empty())
    {
        params.push(("user_id", format!("eq.{learner_id}")));
    }
    match query.status.as_deref() {
        Some("completed") => params.push(("completed_at", "not.is.null".to_owned())),
        Some("incomplete") => params.push(("completed_at", "is.null".to_owned())),
        _ => {}
    }
    if let Some(date_from) = query.date_from.as_deref().filter(|value| !value.is_empty()) {
        params.push(("submitted_at", format!("gte.{date_from}")));
    }
    if let Some(date_to) = query.date_to.as_deref().filter(|value| !value.is_empty()) {
        params.push(("submitted_at", format!("lte.{date_to}")));
    }

    let ascending = query.sort_direction.as_deref() == Some("asc");
    let direction = if ascending { "asc" } else { "desc" };
    let order_column = match query.sort_by.as_deref() {
        Some("score") => "total_score",
        Some("duration") => "duration_seconds",
        _ => "submitted_at",
    };
    params.push(("order", format!("{order_column}.{direction}")));

    let url = contact_data
        .rest_url("workspace_quiz_attempts", &params)
        .ok_or(())?;

    send_service_role_request(
        contact_data,
        outbound,
        &url,
        Some(&attempts_range(query)),
        Some("count=exact"),
    )
    .await
}

#[derive(Deserialize)]
struct LearnerRow {
    user_id: Option<String>,
    full_name: Option<String>,
    email: Option<String>,
}

async fn fetch_learners(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    learner_ids: &[String],
) -> Result<Vec<LearnerRow>, ()> {
    let in_list = format!("in.({})", learner_ids.join(","));
    let url = contact_data
        .rest_url(
            "user_private_details",
            &[
                ("select", "user_id,full_name,email".to_owned()),
                ("user_id", in_list),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url, None, None).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<LearnerRow>>().map_err(|_| ())
}

#[derive(Deserialize)]
struct QuizSetRow {
    id: Option<String>,
    name: Option<String>,
}

async fn fetch_quiz_sets(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<QuizSetRow>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_quiz_sets",
            &[
                ("select", "id,name".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("order", "name.asc".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url, None, None).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<QuizSetRow>>().map_err(|_| ())
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

    outbound.send(request).await.map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Payload assembly
// ---------------------------------------------------------------------------

fn build_attempt_payload(attempt: &Value, learners: &[LearnerRow]) -> Value {
    let user_id = attempt.get("user_id").cloned().unwrap_or(Value::Null);
    let user_id_str = user_id.as_str();
    let learner = user_id_str.and_then(|id| {
        learners
            .iter()
            .find(|learner| learner.user_id.as_deref() == Some(id))
    });

    let set_name = joined_set_name(attempt);

    json!({
        "id": attempt.get("id").cloned().unwrap_or(Value::Null),
        "attempt_number": attempt.get("attempt_number").cloned().unwrap_or(Value::Null),
        "started_at": attempt.get("started_at").cloned().unwrap_or(Value::Null),
        "submitted_at": attempt.get("submitted_at").cloned().unwrap_or(Value::Null),
        "completed_at": attempt.get("completed_at").cloned().unwrap_or(Value::Null),
        "duration_seconds": attempt.get("duration_seconds").cloned().unwrap_or(Value::Null),
        "total_score": attempt.get("total_score").cloned().unwrap_or(Value::Null),
        "set_id": attempt.get("set_id").cloned().unwrap_or(Value::Null),
        "set_name": set_name,
        "user_id": user_id,
        "learner_name": learner
            .and_then(|learner| learner.full_name.clone())
            .map_or(Value::Null, Value::String),
        "learner_email": learner
            .and_then(|learner| learner.email.clone())
            .map_or(Value::Null, Value::String),
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
// Query parsing + helpers
// ---------------------------------------------------------------------------

fn attempts_query_from_url(request_url: Option<&str>) -> AttemptsQuery {
    let mut query = AttemptsQuery {
        page: 1,
        page_size: DEFAULT_PAGE_SIZE,
        ..AttemptsQuery::default()
    };

    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return query;
    };

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "page" => query.page = page_value(&value),
            "pageSize" => query.page_size = page_size_value(&value),
            "setId" if query.set_id.is_none() => query.set_id = trimmed_owned(&value),
            "learnerId" if query.learner_id.is_none() => query.learner_id = trimmed_owned(&value),
            "status" if query.status.is_none() => query.status = trimmed_owned(&value),
            "dateFrom" if query.date_from.is_none() => query.date_from = trimmed_owned(&value),
            "dateTo" if query.date_to.is_none() => query.date_to = trimmed_owned(&value),
            "sortBy" if query.sort_by.is_none() => query.sort_by = trimmed_owned(&value),
            "sortDirection" if query.sort_direction.is_none() => {
                query.sort_direction = trimmed_owned(&value)
            }
            _ => {}
        }
    }

    query
}

fn trimmed_owned(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_owned())
    }
}

fn attempts_range(query: &AttemptsQuery) -> String {
    let from = (query.page - 1) * query.page_size;
    format!("{from}-{}", from + query.page_size - 1)
}

fn total_count_from_content_range(response: &OutboundResponse) -> Option<usize> {
    let header = response.header("content-range")?;
    let (_, total) = header.rsplit_once('/')?;
    total.parse::<usize>().ok()
}

fn page_value(value: &str) -> i64 {
    let value = parse_js_parse_int_prefix(value).unwrap_or(1);
    if value == 0 { 1 } else { value.max(1) }
}

fn page_size_value(value: &str) -> i64 {
    let value = parse_js_parse_int_prefix(value).unwrap_or(DEFAULT_PAGE_SIZE);
    let value = if value == 0 { DEFAULT_PAGE_SIZE } else { value };
    value.clamp(1, MAX_PAGE_SIZE)
}

fn parse_js_parse_int_prefix(value: &str) -> Option<i64> {
    let trimmed = value.trim_start();
    let mut chars = trimmed.char_indices().peekable();
    let mut sign = 1_i64;

    if let Some((_, first)) = chars.peek().copied() {
        match first {
            '-' => {
                sign = -1;
                chars.next();
            }
            '+' => {
                chars.next();
            }
            _ => {}
        }
    }

    let mut digits = String::new();
    while let Some((_, character)) = chars.peek().copied() {
        if !character.is_ascii_digit() {
            break;
        }
        digits.push(character);
        chars.next();
    }

    if digits.is_empty() {
        return None;
    }

    digits.parse::<i64>().ok().map(|value| sign * value)
}

fn attempts_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(ATTEMPTS_PATH_PREFIX)?
        .strip_suffix(ATTEMPTS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
