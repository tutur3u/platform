//! Handler for `GET /api/workspaces/:wsId/users`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/workspaces/[wsId]/users/route.ts` (GET only; the legacy
//! `POST` insert path is intentionally left to the still-live Next.js route by
//! returning `None` for every non-`GET` method).
//!
//! Legacy behavior (GET):
//!   * builds a session-scoped Supabase client with `createClient()` (RLS
//!     active, NO explicit permission or membership check);
//!   * runs `from('workspace_users').select('*').eq('ws_id', wsId)`;
//!   * on a query error responds `500` with
//!     `{ "message": "Error fetching workspace users" }`;
//!   * otherwise responds `200` with the raw row array (all columns).
//!
//! There is no workspace-id normalization in the legacy route (the raw `wsId`
//! path segment is used verbatim as the `ws_id` filter), so this handler does
//! not normalize `personal`/handle slugs either.
//!
//! Auth fidelity / gaps:
//!   * The legacy SSR client forwards the caller's Supabase session, so RLS on
//!     `workspace_users` (which gates rows to workspace members) determines the
//!     result set. This handler reproduces that by forwarding the caller's
//!     access token as the PostgREST `Authorization` bearer (RLS stays active).
//!   * GAP: the legacy unauthenticated path runs as the Supabase ANON role.
//!     This worker only has the service-role key available (using it would
//!     bypass RLS and leak every workspace's users), and it does not have the
//!     anon key, so the anon role cannot be reproduced. When no caller session
//!     is present this handler returns an empty array `[]` — the realistic
//!     outcome of anon RLS against this membership-gated table — instead of
//!     issuing an unauthenticated read.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/workspaces/";
const PATH_SUFFIX: &str = "/users";
const USERS_TABLE: &str = "workspace_users";
const ERROR_MESSAGE: &str = "Error fetching workspace users";

pub(crate) async fn handle_workspaces_wsid_users_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = users_ws_id(request.path)?;

    Some(match request.method {
        "GET" => users_response(config, request, raw_ws_id, outbound).await,
        // Every non-GET method (POST/PUT/PATCH/DELETE) falls through to the
        // still-live Next.js route — do NOT emit a 405 here.
        _ => return None,
    })
}

async fn users_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        return error_response();
    }

    // The legacy SSR client forwards the caller's Supabase session. Without a
    // caller token we cannot reproduce the anon RLS path (no anon key, and the
    // service role would bypass RLS), so return the realistic empty result.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return no_store_response(json_response(200, Value::Array(Vec::new())));
    };

    match fetch_workspace_users(contact_data, outbound, raw_ws_id, &access_token).await {
        Ok(rows) => no_store_response(json_response(200, rows)),
        Err(()) => error_response(),
    }
}

async fn fetch_workspace_users(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    access_token: &str,
) -> Result<Value, ()> {
    let url = contact_data
        .rest_url(
            USERS_TABLE,
            &[("select", "*".to_owned()), ("ws_id", format!("eq.{ws_id}"))],
        )
        .ok_or(())?;
    // RLS stays active: forward the caller's access token as the bearer while
    // using the service-role key only as the PostgREST `apikey` gate (mirrors
    // the established caller-token read pattern in workspaces_users_count).
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

    // Return the raw row array verbatim to preserve the exact legacy shape
    // (`select('*')` returns every column).
    response.json::<Value>().map_err(|_| ())
}

fn error_response() -> BackendResponse {
    no_store_response(json_response(500, json!({ "message": ERROR_MESSAGE })))
}

fn users_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_ws_id_from_exact_path() {
        assert_eq!(users_ws_id("/api/workspaces/ws-123/users"), Some("ws-123"));
    }

    #[test]
    fn extracts_uuid_ws_id() {
        assert_eq!(
            users_ws_id("/api/workspaces/11111111-1111-4111-8111-111111111111/users"),
            Some("11111111-1111-4111-8111-111111111111")
        );
    }

    #[test]
    fn rejects_missing_prefix() {
        assert_eq!(users_ws_id("/api/v1/workspaces/ws-123/users"), None);
        assert_eq!(users_ws_id("/workspaces/ws-123/users"), None);
    }

    #[test]
    fn rejects_missing_suffix() {
        assert_eq!(users_ws_id("/api/workspaces/ws-123/users/count"), None);
        assert_eq!(users_ws_id("/api/workspaces/ws-123/members"), None);
        assert_eq!(users_ws_id("/api/workspaces/ws-123"), None);
    }

    #[test]
    fn rejects_empty_ws_id() {
        assert_eq!(users_ws_id("/api/workspaces//users"), None);
    }

    #[test]
    fn rejects_nested_ws_id_segments() {
        // Guards against matching deeper paths like
        // `/api/workspaces/ws/sub/users` whose ws_id would contain a slash.
        assert_eq!(users_ws_id("/api/workspaces/ws/sub/users"), None);
    }

    #[test]
    fn error_response_matches_legacy_shape() {
        let response = error_response();
        assert_eq!(response.status, 500);
        assert_eq!(response.body, json!({ "message": ERROR_MESSAGE }));
    }
}
