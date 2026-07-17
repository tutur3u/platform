//! Port of the legacy `GET /api/v1/users/me/tasks/:taskId/overrides` route
//! (`apps/web/src/app/api/v1/users/me/tasks/[taskId]/overrides/route.ts`).
//!
//! The legacy route is a `withSessionAuth` GET (no `allowAppSessionAuth`), so it
//! accepts only a Supabase session (Bearer access token or auth cookie). It reads
//! `task_user_overrides` filtered by both `task_id` (from the URL) and `user_id`
//! (the authenticated caller) using the request-scoped Supabase client (RLS
//! active), then returns `{ data: data ?? null }` where `data` is the single
//! matching row or `null` when no override exists.
//!
//! Status codes / shapes matched exactly:
//!
//!   * missing/invalid session  -> `401 { "error": "Unauthorized" }`
//!   * invalid UUID taskId      -> `400 { "error": "Invalid task ID" }`
//!   * supabase read error      -> `500 { "error": "Failed to fetch override" }`
//!   * worker misconfiguration  -> `500 { "error": "Internal server error" }`
//!   * success                  -> `200 { "data": <row-or-null> }`
//!
//! Cache behavior: the legacy `withSessionAuth` `cache: { maxAge: 5, swr: 10 }`
//! option sets `Cache-Control: private, max-age=5, stale-while-revalidate=10`
//! on 2xx GET responses only. Error responses carry no cache header, matching
//! `NextResponse.json` defaults.
//!
//! GET only: PUT/DELETE return `None` so the still-live Next.js route handles
//! them.
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

const TASK_OVERRIDES_PATH_PREFIX: &str = "/api/v1/users/me/tasks/";
const TASK_OVERRIDES_PATH_SUFFIX: &str = "/overrides";
const TASK_OVERRIDES_TABLE: &str = "task_user_overrides";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INVALID_TASK_ID_MESSAGE: &str = "Invalid task ID";
const FETCH_FAILED_MESSAGE: &str = "Failed to fetch override";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

/// Mirrors the legacy `withSessionAuth` `cache: { maxAge: 5, swr: 10 }` option:
/// `private, max-age=5, stale-while-revalidate=10` for successful GETs.
const TASK_OVERRIDES_CACHE_CONTROL: &str = "private, max-age=5, stale-while-revalidate=10";

pub(crate) async fn handle_users_me_tasks_taskid_overrides_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let task_id = extract_task_id(request.path)?;

    Some(match request.method {
        "GET" => overrides_response(config, request, task_id, outbound).await,
        // PUT/DELETE remain served by the live Next.js route.
        _ => return None,
    })
}

async fn overrides_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    task_id: &str,
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

    // The legacy route validates the taskId as a UUID before reading.
    if !is_valid_uuid(task_id) {
        return error_message(400, INVALID_TASK_ID_MESSAGE);
    }

    match fetch_task_override(
        &config.contact_data,
        outbound,
        &access_token,
        task_id,
        &user_id,
    )
    .await
    {
        Ok(row) => success_response(row),
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
    /// Supabase returned an error or the read could not be completed (analogous
    /// to the legacy `{ data, error }` error branch).
    Upstream,
}

async fn fetch_task_override(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
    task_id: &str,
    user_id: &str,
) -> Result<Value, FetchError> {
    // The legacy route reads with the request-scoped (RLS-active) client, so we
    // forward the caller's access token and scope the read by both `task_id` and
    // `user_id`.
    let url = contact_data
        .rest_url(
            TASK_OVERRIDES_TABLE,
            &[
                ("select", "*".to_owned()),
                ("task_id", format!("eq.{task_id}")),
                ("user_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
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

    // `.maybeSingle()` returns 0 or 1 rows. Mirror the legacy `data ?? null`
    // fallback: take the first element or produce `null`.
    Ok(response
        .json::<Vec<Value>>()
        .map_err(|_| FetchError::Upstream)?
        .into_iter()
        .next()
        .unwrap_or(Value::Null))
}

/// Validates that `s` is a canonical UUID string
/// (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx, 36 bytes, hex digits and dashes only).
/// Mirrors the `validate(taskId)` call from the `uuid` npm package used in the
/// legacy route.
fn is_valid_uuid(s: &str) -> bool {
    let bytes = s.as_bytes();
    if bytes.len() != 36 {
        return false;
    }
    const DASH_POSITIONS: [usize; 4] = [8, 13, 18, 23];
    for (i, &b) in bytes.iter().enumerate() {
        if DASH_POSITIONS.contains(&i) {
            if b != b'-' {
                return false;
            }
        } else if !b.is_ascii_hexdigit() {
            return false;
        }
    }
    true
}

/// Extracts the `taskId` segment from the path
/// `/api/v1/users/me/tasks/:taskId/overrides`.
///
/// Returns `None` for any path that does not match the pattern exactly (wrong
/// prefix, wrong suffix, empty segment, or nested sub-paths).
fn extract_task_id(path: &str) -> Option<&str> {
    let after_prefix = path.strip_prefix(TASK_OVERRIDES_PATH_PREFIX)?;
    let task_id = after_prefix.strip_suffix(TASK_OVERRIDES_PATH_SUFFIX)?;
    (!task_id.is_empty() && !task_id.contains('/')).then_some(task_id)
}

/// Legacy `NextResponse.json({ data })` on a 2xx GET, which the
/// `withSessionAuth` wrapper decorates with the private cache header.
fn success_response(data: Value) -> BackendResponse {
    json_response_with_cache_control(200, json!({ "data": data }), TASK_OVERRIDES_CACHE_CONTROL)
}

/// Error responses carry no cache header (matching `NextResponse.json` defaults
/// — the cache option only applies to 2xx GETs).
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
            if_none_match: None,
            method,
            origin: None,
            path,
            referer: None,
            request_id: None,
            url: None,
        }
    }

    // ---------------------------------------------------------------------------
    // Path extraction
    // ---------------------------------------------------------------------------

    #[test]
    fn extract_task_id_matches_valid_uuid_segment() {
        assert_eq!(
            extract_task_id(
                "/api/v1/users/me/tasks/550e8400-e29b-41d4-a716-446655440000/overrides"
            ),
            Some("550e8400-e29b-41d4-a716-446655440000")
        );
    }

    #[test]
    fn extract_task_id_rejects_non_matching_paths() {
        // Missing suffix.
        assert_eq!(extract_task_id("/api/v1/users/me/tasks/some-id"), None);
        // Wrong prefix.
        assert_eq!(
            extract_task_id("/api/users/me/tasks/some-id/overrides"),
            None
        );
        // Empty segment.
        assert_eq!(extract_task_id("/api/v1/users/me/tasks//overrides"), None);
        // Nested path after task id.
        assert_eq!(
            extract_task_id("/api/v1/users/me/tasks/a/b/overrides"),
            None
        );
        // Extra segment after overrides.
        assert_eq!(
            extract_task_id("/api/v1/users/me/tasks/some-id/overrides/extra"),
            None
        );
    }

    // ---------------------------------------------------------------------------
    // UUID validation
    // ---------------------------------------------------------------------------

    #[test]
    fn is_valid_uuid_accepts_canonical_lower_and_upper_hex() {
        assert!(is_valid_uuid("550e8400-e29b-41d4-a716-446655440000"));
        assert!(is_valid_uuid("550E8400-E29B-41D4-A716-446655440000"));
        assert!(is_valid_uuid("00000000-0000-0000-0000-000000000000"));
        assert!(is_valid_uuid("ffffffff-ffff-ffff-ffff-ffffffffffff"));
    }

    #[test]
    fn is_valid_uuid_rejects_malformed_strings() {
        // Too short / too long.
        assert!(!is_valid_uuid("550e8400-e29b-41d4-a716-44665544000"));
        assert!(!is_valid_uuid("550e8400-e29b-41d4-a716-4466554400000"));
        // Missing dash.
        assert!(!is_valid_uuid("550e8400e29b-41d4-a716-446655440000"));
        // Non-hex character.
        assert!(!is_valid_uuid("550e8400-e29b-41d4-a716-44665544000g"));
        // Empty string.
        assert!(!is_valid_uuid(""));
        // Arbitrary slug (not a UUID).
        assert!(!is_valid_uuid("not-a-valid-uuid-at-all-nope-nope"));
    }

    // ---------------------------------------------------------------------------
    // Response shape helpers
    // ---------------------------------------------------------------------------

    #[test]
    fn success_response_wraps_row_in_data_with_cache_header() {
        let row = json!({ "task_id": "abc", "user_id": "def", "self_managed": true });
        let response = success_response(row.clone());

        assert_eq!(response.status, 200);
        assert_eq!(response.cache_control, Some(TASK_OVERRIDES_CACHE_CONTROL));
        assert_eq!(response.body, json!({ "data": row }));
    }

    #[test]
    fn success_response_with_null_data_is_valid() {
        let response = success_response(Value::Null);

        assert_eq!(response.status, 200);
        assert_eq!(response.body, json!({ "data": null }));
        assert_eq!(response.cache_control, Some(TASK_OVERRIDES_CACHE_CONTROL));
    }

    #[test]
    fn error_message_sets_status_and_body_with_no_cache() {
        let unauthorized = error_message(401, UNAUTHORIZED_MESSAGE);
        assert_eq!(unauthorized.status, 401);
        assert_eq!(unauthorized.body, json!({ "error": UNAUTHORIZED_MESSAGE }));
        assert_eq!(unauthorized.cache_control, None);

        let bad_request = error_message(400, INVALID_TASK_ID_MESSAGE);
        assert_eq!(bad_request.status, 400);
        assert_eq!(
            bad_request.body,
            json!({ "error": INVALID_TASK_ID_MESSAGE })
        );
        assert_eq!(bad_request.cache_control, None);

        let fetch_failed = error_message(500, FETCH_FAILED_MESSAGE);
        assert_eq!(fetch_failed.status, 500);
        assert_eq!(fetch_failed.body, json!({ "error": FETCH_FAILED_MESSAGE }));
        assert_eq!(fetch_failed.cache_control, None);

        let internal = error_message(500, INTERNAL_SERVER_ERROR_MESSAGE);
        assert_eq!(
            internal.body,
            json!({ "error": INTERNAL_SERVER_ERROR_MESSAGE })
        );
    }

    // ---------------------------------------------------------------------------
    // Handler path guard
    // ---------------------------------------------------------------------------

    #[test]
    fn handler_returns_none_for_non_matching_path() {
        // Just verify extract_task_id (the path guard) rejects wrong paths.
        assert!(extract_task_id(request_with("GET", "/api/v1/users/me/tasks").path).is_none());
        assert!(
            extract_task_id(request_with("GET", "/api/v1/users/me/board-list-overrides").path)
                .is_none()
        );
    }
}
