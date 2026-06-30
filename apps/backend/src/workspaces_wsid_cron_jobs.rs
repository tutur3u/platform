//! Handler for `GET /api/v1/workspaces/:wsId/cron/jobs`.
//!
//! Ports the GET handler from the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/cron/jobs/route.ts`.
//!
//! # Methods migrated
//!
//! | Method | Status |
//! |--------|--------|
//! | GET    | Migrated — RLS read of `workspace_cron_jobs`. |
//! | POST   | Falls through to Next.js (returns `None`). |
//!
//! # POST gap — why it is not migrated
//!
//! The legacy POST handler calls `assertValidManagedCronSchedule` and
//! `getNextManagedCronRunAt` from `@/lib/managed-cron/validation`, both of
//! which rely on the `cron-parser` npm library to validate a cron expression
//! and to compute the ISO-8601 timestamp for the next scheduled run.  No cron-
//! parsing crate is available in `Cargo.toml` and no new dependencies may be
//! added to this worker.  Because `next_run_at` is a required field written to
//! `workspace_cron_jobs` on every insert, computing an incorrect value (or
//! omitting the validation step) would silently corrupt scheduler state.  The
//! POST method therefore returns `None` so the request falls through to the
//! still-live Next.js route which can fulfil it correctly.
//!
//! # Auth model (GET)
//!
//! The legacy GET uses `createClient()` — the user-scoped Supabase client
//! whose RLS policies govern row visibility.  This handler forwards the
//! caller's `Authorization: Bearer <token>` header so that the same RLS
//! policies apply.  No additional permission check is performed beyond RLS —
//! if the workspace does not belong to the caller, PostgREST returns an empty
//! array, matching the legacy behaviour.
//!
//! # Response shape (GET)
//!
//! Success: `200` with the raw JSON array of `workspace_cron_jobs` rows
//! (`NextResponse.json(data)`).
//!
//! Error: `500` with `{ "message": "Error fetching workspace cron jobs" }`.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/cron/jobs";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FETCH_ERROR_MESSAGE: &str = "Error fetching workspace cron jobs";

pub(crate) async fn handle_workspaces_wsid_cron_jobs_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = extract_ws_id(request.path)?;

    Some(match request.method {
        "GET" => fetch_cron_jobs_response(config, request, ws_id, outbound).await,
        // POST is NOT migrated: computing `next_run_at` requires a cron
        // expression parser that is not available in the worker dependencies.
        // Return None so the request falls through to Next.js.
        _ => return None,
    })
}

async fn fetch_cron_jobs_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // The legacy route uses the user-scoped Supabase client so RLS governs
    // visibility.  Forward the caller's access token to preserve that behaviour.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    match fetch_cron_jobs(&config.contact_data, outbound, ws_id, &access_token).await {
        Ok(rows) => no_store_response(json_response(200, rows)),
        Err(()) => message_response(500, FETCH_ERROR_MESSAGE),
    }
}

async fn fetch_cron_jobs(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    access_token: &str,
) -> Result<Value, ()> {
    // Mirror the legacy `.select('*').eq('ws_id', wsId).order('created_at',
    // { ascending: false })` query.
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

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

/// Extracts the workspace ID from a path matching
/// `/api/v1/workspaces/:wsId/cron/jobs`.
///
/// Returns `None` if the path does not match (wrong prefix/suffix or the
/// extracted `wsId` segment is empty or contains a `/`).
fn extract_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;

    // Guard against an empty wsId or one that sneaks in extra path segments
    // (e.g. `/api/v1/workspaces//cron/jobs` or a path with a sub-resource).
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

#[cfg(test)]
mod tests {
    use super::extract_ws_id;

    #[test]
    fn test_extract_valid_path() {
        let result = extract_ws_id("/api/v1/workspaces/ws-abc/cron/jobs");
        assert_eq!(result, Some("ws-abc"));
    }

    #[test]
    fn test_extract_valid_uuid() {
        let ws_id = "550e8400-e29b-41d4-a716-446655440000";
        let path = format!("/api/v1/workspaces/{ws_id}/cron/jobs");
        assert_eq!(extract_ws_id(&path), Some(ws_id));
    }

    #[test]
    fn test_extract_rejects_no_leading_slash() {
        // strip_prefix requires the leading slash.
        let result = extract_ws_id("api/v1/workspaces/ws-abc/cron/jobs");
        assert_eq!(result, None);
    }

    #[test]
    fn test_extract_rejects_trailing_slash() {
        // The trailing slash prevents strip_suffix from matching PATH_SUFFIX.
        let result = extract_ws_id("/api/v1/workspaces/ws-abc/cron/jobs/");
        assert_eq!(result, None);
    }

    #[test]
    fn test_extract_rejects_sub_resource_path() {
        // A jobId appended after the list path must not match.
        let result = extract_ws_id("/api/v1/workspaces/ws-abc/cron/jobs/job-123");
        assert_eq!(result, None);
    }

    #[test]
    fn test_extract_rejects_empty_ws_id() {
        let result = extract_ws_id("/api/v1/workspaces//cron/jobs");
        assert_eq!(result, None);
    }

    #[test]
    fn test_extract_rejects_wrong_suffix() {
        let result = extract_ws_id("/api/v1/workspaces/ws-abc/cron/schedules");
        assert_eq!(result, None);
    }

    #[test]
    fn test_extract_rejects_wrong_prefix() {
        let result = extract_ws_id("/api/v2/workspaces/ws-abc/cron/jobs");
        assert_eq!(result, None);
    }
}
