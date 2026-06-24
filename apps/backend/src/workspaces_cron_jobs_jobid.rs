use serde_json::{Value, json};

use crate::{
    BackendConfig, BackendRequest, BackendResponse, contact, json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const ERROR_FETCHING_MESSAGE: &str = "Error fetching workspace cron job";
// PostgREST single-object representation, mirroring supabase-js `.single()`.
const PGRST_OBJECT_ACCEPT: &str = "application/vnd.pgrst.object+json";

pub(crate) async fn handle_workspaces_cron_jobs_jobid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let job_id = workspaces_cron_jobs_jobid_job_id(request.path)?;

    Some(match request.method {
        "GET" => cron_job_response(config, request, job_id, outbound).await,
        // PUT/DELETE remain on the still-active Next.js route; fall through.
        _ => return None,
    })
}

async fn cron_job_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    job_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // The legacy route relies on RLS via the user-scoped Supabase client, so we
    // forward the caller's access token. Without it RLS cannot resolve the row,
    // which mirrors the legacy "Error fetching" failure path.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response();
    };

    match fetch_cron_job(&config.contact_data, outbound, job_id, &access_token).await {
        Ok(data) => no_store_response(json_response(200, data)),
        Err(()) => error_response(),
    }
}

async fn fetch_cron_job(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    job_id: &str,
    access_token: &str,
) -> Result<Value, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_cron_jobs",
        &[
            ("select", "*".to_owned()),
            ("id", format!("eq.{job_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", PGRST_OBJECT_ACCEPT)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // `.single()` returns the object directly; pgrst.object+json yields a single
    // JSON object (not an array). Errors on zero/multiple rows via non-2xx above.
    response.json::<Value>().map_err(|_| ())
}

fn error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": ERROR_FETCHING_MESSAGE }),
    ))
}

fn workspaces_cron_jobs_jobid_job_id(path: &str) -> Option<&str> {
    let segments: Vec<&str> = path
        .trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();

    // /api/v1/workspaces/:wsId/cron/jobs/:jobId
    (segments.len() == 8
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && !segments[3].is_empty()
        && segments[4] == "cron"
        && segments[5] == "jobs"
        && !segments[6].is_empty()
        && !segments[7].is_empty())
    .then(|| segments[7])
}
