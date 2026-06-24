use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    education_course_module_reads_query::{
        EducationReadQuery, education_read_query_from_url, education_read_range,
        total_count_from_content_range,
    },
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    workspace_permission_check::{
        WorkspacePermissionAuthorization, WorkspacePermissionAuthorizationError,
        authorize_workspace_permission,
    },
};

const EDUCATION_PERMISSION: &str = "ai_lab";
const ENABLE_EDUCATION_SECRET: &str = "ENABLE_EDUCATION";
const QUIZ_SETS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const QUIZ_SETS_MIDDLE: &str = "/quiz-sets/";
const QUIZZES_SUFFIX: &str = "/quizzes";
const QUIZ_SET_QUIZZES_TABLE: &str = "quiz_set_quizzes";
const WORKSPACE_SECRETS_TABLE: &str = "workspace_secrets";

#[derive(serde::Deserialize)]
struct WorkspaceSecretRow {
    value: Option<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct QuizSetQuizzesRoute<'a> {
    set_id: &'a str,
    ws_id: &'a str,
}

pub(crate) async fn handle_workspaces_quiz_sets_quizzes_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let route = quiz_set_quizzes_route(request.path)?;

    Some(match request.method {
        "GET" => quiz_set_quizzes_response(config, request, route, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn quiz_set_quizzes_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    route: QuizSetQuizzesRoute<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Mirrors the legacy `z.guid()` validation on `setId` (400 on invalid).
    if !is_uuid_literal(route.set_id) {
        return no_store_response(json_response(
            400,
            json!({ "message": "Invalid route params" }),
        ));
    }

    let _authorization =
        match authorize_education_workspace(config, request, route.ws_id, outbound).await {
            Ok(authorization) => authorization,
            Err(response) => return response,
        };

    let query = education_read_query_from_url(request.url);

    match fetch_quiz_set_quizzes(&config.contact_data, outbound, route.set_id, &query).await {
        Ok(response) => paginated_rows_response(response, &query),
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

async fn fetch_quiz_set_quizzes(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    set_id: &str,
    query: &EducationReadQuery,
) -> Result<OutboundResponse, ()> {
    // Legacy: `.select('...workspace_quizzes(*, quiz_options(*))')` spreads the
    // related quiz columns onto the top-level row, plus their options.
    let mut params = vec![
        (
            "select",
            "...workspace_quizzes(*, quiz_options(*))".to_owned(),
        ),
        ("set_id", format!("eq.{set_id}")),
        ("order", "created_at.desc".to_owned()),
    ];
    if let Some(q) = query.q.as_deref().filter(|q| !q.is_empty()) {
        // Legacy filters the spread `question` column with `ilike('%q%')`.
        params.push(("question", format!("ilike.*{q}*")));
    }
    let url = contact_data
        .rest_url(QUIZ_SET_QUIZZES_TABLE, &params)
        .ok_or(())?;

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

fn paginated_rows_response(
    response: OutboundResponse,
    query: &EducationReadQuery,
) -> BackendResponse {
    let count = total_count_from_content_range(&response).unwrap_or(0);
    let rows = match response.json::<Vec<Value>>() {
        Ok(rows) => rows,
        Err(_) => return read_error_response(),
    };

    no_store_response(json_response(
        200,
        json!({
            "data": rows,
            "count": count,
            "page": query.page,
            "pageSize": query.page_size,
        }),
    ))
}

fn read_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": "Error fetching quiz set quizzes" }),
    ))
}

fn quiz_set_quizzes_route(path: &str) -> Option<QuizSetQuizzesRoute<'_>> {
    let tail = path.strip_prefix(QUIZ_SETS_PATH_PREFIX)?;
    let (ws_id, rest) = tail.split_once('/')?;
    if ws_id.is_empty() {
        return None;
    }
    let rest = rest.strip_prefix(QUIZ_SETS_MIDDLE.trim_start_matches('/'))?;
    let (set_id, suffix) = rest.split_once('/')?;

    (suffix == QUIZZES_SUFFIX.trim_start_matches('/') && !set_id.is_empty())
        .then_some(QuizSetQuizzesRoute { set_id, ws_id })
}

fn is_uuid_literal(value: &str) -> bool {
    value.len() == 36
        && value
            .chars()
            .enumerate()
            .all(|(index, character)| match index {
                8 | 13 | 18 | 23 => character == '-',
                _ => character.is_ascii_hexdigit(),
            })
}
