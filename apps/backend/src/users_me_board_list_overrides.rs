//! Port of the legacy `GET /api/v1/users/me/board-list-overrides` route
//! (`apps/web/src/app/api/v1/users/me/board-list-overrides/route.ts`).
//!
//! The legacy route is a `withSessionAuth` GET (no `allowAppSessionAuth`), so it
//! accepts only a Supabase session (Bearer access token or auth cookie). It
//! reads `user_board_list_overrides` filtered by the authenticated user's id
//! using the request-scoped Supabase client (RLS active), then returns
//! `{ data: data ?? [] }` as JSON. This handler forwards the caller's access
//! token for the read so RLS still applies, matching the legacy session client.
//!
//! Status codes / shapes matched exactly:
//!   * missing/invalid session            -> `401 { "error": "Unauthorized" }`
//!   * supabase read error                -> `500 { "error": "Failed to fetch overrides" }`
//!   * worker misconfiguration (analogous -> `500 { "error": "Internal server error" }`
//!     to the legacy `catch`)
//!   * success                            -> `200 { "data": [...] }`
//!
//! Cache behavior: the legacy `withSessionAuth` `cache: { maxAge: 10, swr: 20 }`
//! option sets `Cache-Control: private, max-age=10, stale-while-revalidate=20`
//! on 2xx GET responses only. Error responses carry no cache header (and no
//! no-store), matching `NextResponse.json` defaults.
//!
//! GET only: PUT/DELETE return `None` so the still-live Next.js route handles
//! them.
//!
//! Static path: dispatched by exact `("GET", "/api/v1/users/me/board-list-overrides")`
//! equality.
//!
//! NOTE (behavior gap): the legacy `withSessionAuth` wrapper also performs IP
//! block checks, rate limiting, AI temp-auth, user-suspension checks, and
//! adaptive step-up challenges before invoking the handler. Those cross-cutting
//! protections are not reproduced here; this handler covers the authenticated
//! read path only.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    json_response_with_cache_control,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const BOARD_LIST_OVERRIDES_PATH: &str = "/api/v1/users/me/board-list-overrides";
const OVERRIDES_TABLE: &str = "user_board_list_overrides";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FETCH_FAILED_MESSAGE: &str = "Failed to fetch overrides";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

/// Mirrors the legacy `withSessionAuth` `cache: { maxAge: 10, swr: 20 }` option:
/// `private, max-age=10, stale-while-revalidate=20` for successful GETs.
const OVERRIDES_CACHE_CONTROL: &str = "private, max-age=10, stale-while-revalidate=20";

pub(crate) async fn handle_users_me_board_list_overrides_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != BOARD_LIST_OVERRIDES_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => overrides_response(config, request, outbound).await,
        // PUT/DELETE remain served by the live Next.js route.
        _ => return None,
    })
}

async fn overrides_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // `withSessionAuth` rejects requests without a valid Supabase session.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_message(401, UNAUTHORIZED_MESSAGE);
    };

    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_message(401, UNAUTHORIZED_MESSAGE);
    };

    match fetch_overrides(&config.contact_data, outbound, &access_token, &user_id).await {
        Ok(rows) => success_response(rows),
        // Misconfigured worker (missing service-role key / unbuildable URL) maps
        // to the legacy outer `catch` -> "Internal server error".
        Err(FetchError::Config) => error_message(500, INTERNAL_SERVER_ERROR_MESSAGE),
        // An upstream read failure mirrors the supabase `{ error }` branch.
        Err(FetchError::Upstream) => error_message(500, FETCH_FAILED_MESSAGE),
    }
}

enum FetchError {
    /// Worker is not configured to talk to Supabase (analogous to a thrown
    /// exception caught by the legacy `catch`).
    Config,
    /// Supabase returned an error / the read could not be completed (analogous
    /// to the legacy `{ data, error }` error branch).
    Upstream,
}

async fn fetch_overrides(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
    user_id: &str,
) -> Result<Vec<Value>, FetchError> {
    // The legacy route reads with the request-scoped (RLS-active) client, so we
    // forward the caller's access token and scope the read by `user_id`.
    let url = contact_data
        .rest_url(
            OVERRIDES_TABLE,
            &[
                ("select", "*".to_owned()),
                ("user_id", format!("eq.{user_id}")),
            ],
        )
        .ok_or(FetchError::Config)?;
    let service_role_key = contact_data.service_role_key().ok_or(FetchError::Config)?;
    let authorization = format!("Bearer {access_token}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| FetchError::Upstream)?;

    if !(200..300).contains(&response.status) {
        return Err(FetchError::Upstream);
    }

    response
        .json::<Vec<Value>>()
        .map_err(|_| FetchError::Upstream)
}

/// Legacy `NextResponse.json({ data: data ?? [] })` on a 2xx GET, which the
/// `withSessionAuth` wrapper decorates with the private cache header.
fn success_response(rows: Vec<Value>) -> BackendResponse {
    json_response_with_cache_control(
        200,
        json!({ "data": Value::Array(rows) }),
        OVERRIDES_CACHE_CONTROL,
    )
}

/// Error / unauthorized responses carry no cache header (matching the legacy
/// `NextResponse.json` defaults — the cache option only applies to 2xx GETs).
fn error_message(status: u16, message: &str) -> BackendResponse {
    json_response(status, json!({ "error": message }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request_with(method: &'static str, path: &'static str) -> BackendRequest<'static> {
        BackendRequest {
            authorization: None,
            body_text: None,
            cookie: None,
            method,
            origin: None,
            path,
            referer: None,
            request_id: None,
            url: None,
        }
    }

    /// The handler must only own the exact legacy mount path.
    #[test]
    fn path_guard_matches_exact_path_only() {
        assert_eq!(request_with("GET", BOARD_LIST_OVERRIDES_PATH).path, BOARD_LIST_OVERRIDES_PATH);
        assert_ne!(
            "/api/v1/users/me/board-list-overrides/extra",
            BOARD_LIST_OVERRIDES_PATH
        );
        assert_ne!("/api/users/me/board-list-overrides", BOARD_LIST_OVERRIDES_PATH);
    }

    #[test]
    fn success_response_wraps_rows_in_data_with_cache_header() {
        let rows = vec![json!({ "id": "a", "scope_type": "board" })];
        let response = success_response(rows.clone());

        assert_eq!(response.status, 200);
        assert_eq!(response.cache_control, Some(OVERRIDES_CACHE_CONTROL));
        assert_eq!(response.body, json!({ "data": rows }));
    }

    #[test]
    fn success_response_with_no_rows_returns_empty_array() {
        let response = success_response(Vec::new());

        assert_eq!(response.status, 200);
        assert_eq!(response.body, json!({ "data": [] }));
    }

    #[test]
    fn error_message_sets_status_body_and_no_cache() {
        let unauthorized = error_message(401, UNAUTHORIZED_MESSAGE);
        assert_eq!(unauthorized.status, 401);
        assert_eq!(unauthorized.body, json!({ "error": UNAUTHORIZED_MESSAGE }));
        assert_eq!(unauthorized.cache_control, None);

        let fetch_failed = error_message(500, FETCH_FAILED_MESSAGE);
        assert_eq!(fetch_failed.status, 500);
        assert_eq!(fetch_failed.body, json!({ "error": FETCH_FAILED_MESSAGE }));
        assert_eq!(fetch_failed.cache_control, None);

        let internal = error_message(500, INTERNAL_SERVER_ERROR_MESSAGE);
        assert_eq!(internal.body, json!({ "error": INTERNAL_SERVER_ERROR_MESSAGE }));
    }
}
