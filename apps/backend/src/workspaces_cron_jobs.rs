use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const WORKSPACES_CRON_JOBS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_CRON_JOBS_PATH_SUFFIX: &str = "/cron/jobs";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FETCH_ERROR_MESSAGE: &str = "Error fetching workspace cron jobs";

/// Handles `GET /api/v1/workspaces/:wsId/cron/jobs`.
///
/// Only the GET method is migrated. Every other method (the legacy route also
/// defines POST) returns `None` so the Cloudflare worker falls through to the
/// still-active Next.js route for those un-migrated methods.
pub(crate) async fn handle_workspaces_cron_jobs_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = workspaces_cron_jobs_ws_id(request.path)?;

    Some(match request.method {
        "GET" => fetch_workspace_cron_jobs_response(config, request, ws_id, outbound).await,
        // Do NOT 405 the un-migrated methods (e.g. POST): return None so the
        // request falls through to the legacy Next.js route.
        _ => return None,
    })
}

async fn fetch_workspace_cron_jobs_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // The legacy route relies on Supabase RLS via the caller's session. Read
    // with the caller's access token so RLS applies exactly as before.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    match fetch_workspace_cron_jobs(&config.contact_data, outbound, ws_id, &access_token).await {
        Ok(rows) => no_store_response(json_response(200, rows)),
        Err(()) => message_response(500, FETCH_ERROR_MESSAGE),
    }
}

async fn fetch_workspace_cron_jobs(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    access_token: &str,
) -> Result<Value, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_cron_jobs",
        &[
            ("select", "*".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("order", "created_at.desc".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // PostgREST returns a JSON array of rows; pass it through unchanged to match
    // the legacy `NextResponse.json(data)` shape.
    response.json::<Value>().map_err(|_| ())
}

fn workspaces_cron_jobs_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_CRON_JOBS_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_CRON_JOBS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
