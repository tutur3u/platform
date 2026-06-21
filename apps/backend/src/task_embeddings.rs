use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const ADMIN_TASK_EMBEDDINGS_STATS_PATH: &str = "/api/admin/tasks/embeddings/stats";
const TASKS_TABLE: &str = "tasks";
const ADMIN_UNAUTHORIZED_MESSAGE: &str = "Unauthorized - Tuturuuu admin access required";
const TASK_STATISTICS_ERROR_MESSAGE: &str = "Failed to fetch task statistics";

pub(crate) async fn handle_task_embeddings_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != ADMIN_TASK_EMBEDDINGS_STATS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => task_embedding_stats_response(&config.contact_data, request, outbound).await,
        method => method_not_allowed(method, "GET"),
    })
}

async fn task_embedding_stats_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !contact_data.configured() {
        return task_embedding_internal_error_response("Supabase contact data is not configured");
    }

    if !request_has_tuturuuu_admin_session(contact_data, request, outbound).await {
        return no_store_response(json_response(
            401,
            json!({
                "message": ADMIN_UNAUTHORIZED_MESSAGE,
            }),
        ));
    }

    let total_tasks = match task_count(contact_data, outbound, false).await {
        Ok(count) => count,
        Err(message) => return task_embedding_statistics_error_response(&message),
    };
    let tasks_without_embeddings = match task_count(contact_data, outbound, true).await {
        Ok(count) => count,
        Err(message) => return task_embedding_statistics_error_response(&message),
    };
    let tasks_with_embeddings = total_tasks.saturating_sub(tasks_without_embeddings);
    let percentage_complete = if total_tasks == 0 {
        0.0
    } else {
        ((tasks_with_embeddings as f64 / total_tasks as f64) * 10_000.0).round() / 100.0
    };

    no_store_response(json_response(
        200,
        json!({
            "total": total_tasks,
            "withEmbeddings": tasks_with_embeddings,
            "withoutEmbeddings": tasks_without_embeddings,
            "percentageComplete": percentage_complete,
        }),
    ))
}

async fn request_has_tuturuuu_admin_session(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> bool {
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return false;
    };
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return false;
    };

    supabase_auth::is_valid_tuturuuu_email(user.email.as_deref())
}

async fn task_count(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    without_embeddings: bool,
) -> Result<usize, String> {
    let mut params = vec![("select", "id".to_owned())];

    if without_embeddings {
        params.push(("embedding", "is.null".to_owned()));
    }

    let Some(url) = contact_data.rest_url(TASKS_TABLE, &params) else {
        return Err("Failed to build Supabase task statistics request".to_owned());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err("Supabase service role key is not configured".to_owned());
    };
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Range-Unit", "items")
                .with_header("Range", "0-0")
                .with_header("Prefer", "count=exact"),
        )
        .await
        .map_err(|error| error.to_string())?;

    if !(200..300).contains(&response.status) {
        return Err(postgrest_error_message(&response)
            .unwrap_or_else(|| format!("Supabase returned status {}", response.status)));
    }

    total_count_from_content_range(&response)
        .ok_or_else(|| "Supabase response did not include an exact count".to_owned())
}

fn total_count_from_content_range(response: &OutboundResponse) -> Option<usize> {
    let header = response.header("content-range")?;
    let (_, total) = header.rsplit_once('/')?;

    total.parse::<usize>().ok()
}

fn postgrest_error_message(response: &OutboundResponse) -> Option<String> {
    response
        .json::<Value>()
        .ok()
        .and_then(|body| {
            body.get("message")
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .filter(|message| !message.trim().is_empty())
}

fn task_embedding_statistics_error_response(error: &str) -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "message": TASK_STATISTICS_ERROR_MESSAGE,
            "error": error,
        }),
    ))
}

fn task_embedding_internal_error_response(error: &str) -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "message": "Internal server error",
            "error": error,
        }),
    ))
}
