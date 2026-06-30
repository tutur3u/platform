//! Handler for `GET /api/v1/workspaces/:wsId/cron/jobs/:jobId`.
//!
//! Ports the GET handler from the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/cron/jobs/[jobId]/route.ts`.
//!
//! # Auth model
//!
//! The legacy route creates a user-scoped Supabase client (`createClient()`)
//! and relies entirely on RLS for row-level access. This handler forwards the
//! caller's access token as `Authorization: Bearer <token>` so that RLS
//! applies in exactly the same way. No explicit permission check is performed
//! beyond RLS — if the row does not belong to the caller's workspace the
//! PostgREST `.single()` equivalent returns a non-2xx response and the handler
//! falls through to the 500 error path (matching the legacy behaviour).
//!
//! # Response shape
//!
//! On success: `200` with the raw `workspace_cron_jobs` row as a JSON object,
//! equivalent to `NextResponse.json(data)`.
//!
//! On error: `500` with `{ "message": "Error fetching workspace cron job" }`,
//! equivalent to the legacy error branch.
//!
//! # Behaviour gaps
//!
//! - PUT and DELETE are intentionally not migrated; `None` is returned for
//!   those methods so the request falls through to the still-live Next.js
//!   route.

use serde_json::{Value, json};

use crate::{
    BackendConfig, BackendRequest, BackendResponse, contact, json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const ERROR_FETCHING_MESSAGE: &str = "Error fetching workspace cron job";
// PostgREST single-object representation, mirroring supabase-js `.single()`.
const PGRST_OBJECT_ACCEPT: &str = "application/vnd.pgrst.object+json";

pub(crate) async fn handle_workspaces_wsid_cron_jobs_jobid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (ws_id, job_id) = extract_ws_id_and_job_id(request.path)?;

    Some(match request.method {
        "GET" => cron_job_response(config, request, ws_id, job_id, outbound).await,
        // PUT/DELETE remain on the still-active Next.js route; fall through.
        _ => return None,
    })
}

async fn cron_job_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    job_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // The legacy route relies on RLS via the user-scoped Supabase client, so
    // we forward the caller's access token. Without a valid token the query
    // would return nothing or error, mirroring the legacy failure path.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response();
    };

    match fetch_cron_job(&config.contact_data, outbound, ws_id, job_id, &access_token).await {
        Ok(data) => no_store_response(json_response(200, data)),
        Err(()) => error_response(),
    }
}

async fn fetch_cron_job(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    job_id: &str,
    access_token: &str,
) -> Result<Value, ()> {
    // Filter by both `id` and `ws_id` to match the legacy `.eq('id', jobId)
    // .eq('ws_id', wsId).single()` query. The `Accept` header triggers the
    // PostgREST single-object response mode (errors on 0 or >1 rows).
    let Some(url) = contact_data.rest_url(
        "workspace_cron_jobs",
        &[
            ("select", "*".to_owned()),
            ("id", format!("eq.{job_id}")),
            ("ws_id", format!("eq.{ws_id}")),
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

    // PostgREST with `pgrst.object+json` returns the single row as a JSON
    // object (not an array), mirroring `supabase-js .single()`.
    response.json::<Value>().map_err(|_| ())
}

fn error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": ERROR_FETCHING_MESSAGE }),
    ))
}

/// Extracts `(ws_id, job_id)` from a path matching
/// `/api/v1/workspaces/:wsId/cron/jobs/:jobId`.
///
/// Returns `None` if the path does not match.
fn extract_ws_id_and_job_id(path: &str) -> Option<(&str, &str)> {
    let segments: Vec<&str> = path
        .trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect();

    // Expected: ["api", "v1", "workspaces", wsId, "cron", "jobs", jobId]
    (segments.len() == 7
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && !segments[3].is_empty()
        && segments[4] == "cron"
        && segments[5] == "jobs"
        && !segments[6].is_empty())
    .then(|| (segments[3], segments[6]))
}

#[cfg(test)]
mod tests {
    use super::extract_ws_id_and_job_id;

    #[test]
    fn test_extract_valid_path() {
        let result = extract_ws_id_and_job_id("/api/v1/workspaces/ws-abc/cron/jobs/job-123");
        assert_eq!(result, Some(("ws-abc", "job-123")));
    }

    #[test]
    fn test_extract_valid_path_no_leading_slash() {
        let result = extract_ws_id_and_job_id("api/v1/workspaces/ws-abc/cron/jobs/job-123");
        assert_eq!(result, Some(("ws-abc", "job-123")));
    }

    #[test]
    fn test_extract_valid_path_trailing_slash() {
        let result = extract_ws_id_and_job_id("/api/v1/workspaces/ws-abc/cron/jobs/job-123/");
        // The trailing slash is filtered out via trim_matches('/') + filter
        assert_eq!(result, Some(("ws-abc", "job-123")));
    }

    #[test]
    fn test_extract_rejects_list_path() {
        // Path without jobId should not match.
        let result = extract_ws_id_and_job_id("/api/v1/workspaces/ws-abc/cron/jobs");
        assert_eq!(result, None);
    }

    #[test]
    fn test_extract_rejects_extra_segment() {
        let result = extract_ws_id_and_job_id("/api/v1/workspaces/ws-abc/cron/jobs/job-123/extra");
        assert_eq!(result, None);
    }

    #[test]
    fn test_extract_rejects_wrong_prefix() {
        let result = extract_ws_id_and_job_id("/api/v2/workspaces/ws-abc/cron/jobs/job-123");
        assert_eq!(result, None);
    }

    #[test]
    fn test_extract_rejects_empty_ws_id() {
        // Double slash would produce an empty segment that is filtered out,
        // changing the segment count — should not match.
        let result = extract_ws_id_and_job_id("/api/v1/workspaces//cron/jobs/job-123");
        assert_eq!(result, None);
    }

    #[test]
    fn test_extract_rejects_wrong_static_segments() {
        let result = extract_ws_id_and_job_id("/api/v1/workspaces/ws-abc/scheduled/jobs/job-123");
        assert_eq!(result, None);
    }

    #[test]
    fn test_extract_uuid_ids() {
        let ws_id = "550e8400-e29b-41d4-a716-446655440000";
        let job_id = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
        let path = format!("/api/v1/workspaces/{ws_id}/cron/jobs/{job_id}");
        let result = extract_ws_id_and_job_id(&path);
        assert_eq!(result, Some((ws_id, job_id)));
    }
}
