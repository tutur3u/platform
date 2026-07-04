use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    education_course_module_reads_query::{
        EducationReadQuery, EducationReadRoute, education_read_query_from_url,
        education_read_range, education_read_route, total_count_from_content_range,
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
const WORKSPACE_SECRETS_TABLE: &str = "workspace_secrets";

#[derive(Deserialize)]
struct WorkspaceSecretRow {
    value: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceQuizSetRow {
    id: Option<String>,
}

pub(crate) async fn handle_education_course_module_reads_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let route = education_read_route(request.path)?;

    Some(match request.method {
        "GET" => education_read_response(config, request, route, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn education_read_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    route: EducationReadRoute<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let ws_id = match route {
        EducationReadRoute::CourseModules { ws_id }
        | EducationReadRoute::QuizSetLinkedModules { ws_id, .. } => ws_id,
    };
    let authorization = match authorize_education_workspace(config, request, ws_id, outbound).await
    {
        Ok(authorization) => authorization,
        Err(response) => return response,
    };
    let query = education_read_query_from_url(request.url);

    match route {
        EducationReadRoute::CourseModules { .. } => {
            course_modules_response(&config.contact_data, outbound, &authorization.ws_id, &query)
                .await
        }
        EducationReadRoute::QuizSetLinkedModules { set_id, .. } => {
            linked_modules_response(
                &config.contact_data,
                outbound,
                &authorization.ws_id,
                set_id,
                &query,
            )
            .await
        }
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
    let response =
        send_service_role_request(contact_data, outbound, &url, None, None, None).await?;

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

async fn course_modules_response(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &EducationReadQuery,
) -> BackendResponse {
    match fetch_course_modules(contact_data, outbound, ws_id, query).await {
        Ok(response) => {
            paginated_rows_response(response, query, "Error fetching workspace course modules")
        }
        Err(()) => read_error_response("Error fetching workspace course modules"),
    }
}

async fn linked_modules_response(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    set_id: &str,
    query: &EducationReadQuery,
) -> BackendResponse {
    match quiz_set_belongs_to_workspace(contact_data, outbound, ws_id, set_id).await {
        Ok(true) => {}
        Ok(false) => {
            return no_store_response(json_response(
                404,
                json!({ "message": "Quiz set not found" }),
            ));
        }
        Err(()) => return read_error_response("Error fetching quiz set linked modules"),
    }

    match fetch_linked_modules(contact_data, outbound, set_id, query).await {
        Ok(response) => {
            paginated_rows_response(response, query, "Error fetching quiz set linked modules")
        }
        Err(()) => read_error_response("Error fetching quiz set linked modules"),
    }
}

async fn fetch_course_modules(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &EducationReadQuery,
) -> Result<OutboundResponse, ()> {
    let mut params = vec![
        (
            "select",
            "id,name,is_public,is_published,workspace_user_groups!inner(ws_id)".to_owned(),
        ),
        ("workspace_user_groups.ws_id", format!("eq.{ws_id}")),
        ("order", "created_at.desc".to_owned()),
    ];
    if let Some(q) = query.q.as_deref().filter(|q| !q.is_empty()) {
        params.push(("name", format!("ilike.*{q}*")));
    }
    let url = contact_data
        .rest_url("workspace_course_modules", &params)
        .ok_or(())?;

    send_service_role_request(
        contact_data,
        outbound,
        &url,
        Some(&education_read_range(query)),
        Some("count=exact"),
        None,
    )
    .await
}

async fn quiz_set_belongs_to_workspace(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    set_id: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            "workspace_quiz_sets",
            &[
                ("select", "id".to_owned()),
                ("id", format!("eq.{set_id}")),
                ("ws_id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response =
        send_service_role_request(contact_data, outbound, &url, None, None, None).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceQuizSetRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id)
        .is_some())
}

async fn fetch_linked_modules(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    set_id: &str,
    query: &EducationReadQuery,
) -> Result<OutboundResponse, ()> {
    let mut params = vec![
        (
            "select",
            "id:module_id,...workspace_course_modules(group_id,name,is_public,is_published)"
                .to_owned(),
        ),
        ("set_id", format!("eq.{set_id}")),
        ("order", "created_at.desc".to_owned()),
    ];
    if let Some(q) = query.q.as_deref().filter(|q| !q.is_empty()) {
        params.push(("workspace_course_modules.name", format!("ilike.*{q}*")));
    }
    let url = contact_data
        .rest_url("course_module_quiz_sets", &params)
        .ok_or(())?;

    send_service_role_request(
        contact_data,
        outbound,
        &url,
        Some(&education_read_range(query)),
        Some("count=exact"),
        None,
    )
    .await
}

async fn send_service_role_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    range: Option<&str>,
    prefer: Option<&str>,
    accept: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", accept.unwrap_or(APPLICATION_JSON))
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
    error_message: &'static str,
) -> BackendResponse {
    let count = total_count_from_content_range(&response).unwrap_or(0);
    let rows = match response.json::<Vec<Value>>() {
        Ok(rows) => rows
            .into_iter()
            .map(strip_workspace_embed)
            .collect::<Vec<_>>(),
        Err(_) => return read_error_response(error_message),
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

fn strip_workspace_embed(row: Value) -> Value {
    let Value::Object(mut row) = row else {
        return row;
    };

    row.remove("workspace_user_groups");
    Value::Object(row)
}

fn read_error_response(message: &'static str) -> BackendResponse {
    no_store_response(json_response(500, json!({ "message": message })))
}
