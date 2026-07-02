//! Handler for `GET /api/v1/workspaces/:wsId/crawlers`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/crawlers/route.ts`.
//!
//! The legacy GET handler exposes two code paths:
//!
//! - An `API_KEY` header path that validates a workspace API key, requires the
//!   workspace ID to be the root workspace, and reads `crawled_urls` with the
//!   admin (service-role) client, returning `{ data, count }`.
//! - A session path that creates a Supabase client from the caller's session
//!   and reads `crawled_urls` with RLS active, returning the row array.
//!
//! ## Behavior gaps
//!
//! `BackendRequest` does not surface the raw `API_KEY` header, so the
//! API-key path cannot be reproduced here. Only the session path is ported.
//! When the caller provides a valid session token, this handler forwards it to
//! Supabase (RLS active) and returns the resulting row array. When no session
//! token is present the handler returns an empty JSON array `[]`, matching the
//! empty-data fallback of the legacy session path under an anonymous session.
//!
//! POST is not handled here (returns `None`) so the still-live Next.js route
//! continues to serve write operations.

use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse,
    infrastructure_root_auth::send_caller_token_get, json_response, no_store_response,
    outbound::OutboundHttpClient, supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/crawlers";
const CRAWLED_URLS_TABLE: &str = "crawled_urls";
const ERROR_MESSAGE: &str = "Error fetching workspace crawlers";

pub(crate) async fn handle_workspaces_wsid_crawlers_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let _ws_id = crawlers_ws_id(request.path)?;

    Some(match request.method {
        "GET" => crawlers_get_response(config, request, outbound).await,
        _ => return None,
    })
}

async fn crawlers_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return error_response();
    }

    // The session path in the legacy route reads crawled_urls with the
    // caller's JWT (RLS active). If no token is available we return an empty
    // array, matching the legacy empty-data fallback for anonymous sessions.
    let access_token = match supabase_auth::request_access_token(request) {
        Some(token) => token,
        None => {
            return no_store_response(json_response(200, json!([])));
        }
    };

    let url = match contact_data.rest_url(CRAWLED_URLS_TABLE, &[("select", "*".to_owned())]) {
        Some(u) => u,
        None => return error_response(),
    };

    let response = match send_caller_token_get(
        contact_data,
        outbound,
        &url,
        &access_token,
        APPLICATION_JSON,
    )
    .await
    {
        Ok(r) => r,
        Err(()) => return error_response(),
    };

    if !(200..300).contains(&response.status) {
        return error_response();
    }

    let rows = match response.json::<serde_json::Value>() {
        Ok(v) => v,
        Err(_) => return error_response(),
    };

    no_store_response(json_response(200, rows))
}

/// Extracts the `wsId` segment from a path of the form
/// `/api/v1/workspaces/<wsId>/crawlers`.
///
/// Returns `None` when:
///
/// - the prefix or suffix does not match, or
/// - the extracted `wsId` segment is empty or contains a `/`.
fn crawlers_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn error_response() -> BackendResponse {
    no_store_response(json_response(500, json!({ "message": ERROR_MESSAGE })))
}

#[cfg(test)]
mod tests {
    use super::crawlers_ws_id;

    #[test]
    fn extracts_valid_ws_id() {
        assert_eq!(
            crawlers_ws_id("/api/v1/workspaces/abc-123/crawlers"),
            Some("abc-123")
        );
    }

    #[test]
    fn extracts_uuid_ws_id() {
        assert_eq!(
            crawlers_ws_id("/api/v1/workspaces/00000000-0000-0000-0000-000000000000/crawlers"),
            Some("00000000-0000-0000-0000-000000000000")
        );
    }

    #[test]
    fn rejects_missing_prefix() {
        assert!(crawlers_ws_id("/api/v1/workspaces/abc/crawlers/extra").is_none());
    }

    #[test]
    fn rejects_empty_ws_id() {
        assert!(crawlers_ws_id("/api/v1/workspaces//crawlers").is_none());
    }

    #[test]
    fn rejects_extra_segment() {
        assert!(crawlers_ws_id("/api/v1/workspaces/abc/crawlers/other").is_none());
    }

    #[test]
    fn rejects_wrong_suffix() {
        assert!(crawlers_ws_id("/api/v1/workspaces/abc/finance").is_none());
    }

    #[test]
    fn rejects_ws_id_with_slash() {
        assert!(crawlers_ws_id("/api/v1/workspaces/a/b/crawlers").is_none());
    }
}
