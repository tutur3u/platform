//! Port of the legacy `GET /api/v1/users/me/configs/:configId` route
//! (`apps/web/src/app/api/v1/users/me/configs/[configId]/route.ts`).
//!
//! The legacy route is a `withSessionAuth` GET with `allowAppSessionAuth: true`,
//! so it accepts either a Supabase session (Bearer access token or auth cookie)
//! or a satellite app-session token. (`withSessionAuth`'s default app-session
//! audience for `/api/v1/users/me/configs/*` is the satellite app set; this
//! handler reuses `contact::current_user_app_session_targets()`, matching the
//! other ported `users/me/*` handlers.)
//!
//! Behavior reproduced exactly:
//!   * Resolve the authenticated user (id + email).
//!   * If `configId === "SHOW_VERSION_BADGE"` and the user's email is not an
//!     exact `@tuturuuu.com` address, short-circuit to `{ "value": null }`.
//!   * Otherwise read `user_configs.value` filtered by `user_id` and `id`
//!     (`maybeSingle`) and return `{ "value": data?.value ?? null }`.
//!
//! Data access mirrors the legacy clients: a Supabase session forwards the
//! caller's access token (RLS active); an app-session has no access token, so we
//! fall back to the service-role key (the read is still scoped by `user_id`).
//!
//! Status codes / shapes matched exactly:
//!   * missing/invalid session            -> `401 { "error": "Unauthorized" }`
//!   * supabase read error / worker misconfig
//!     -> `500 { "message": "Error fetching user config" }`
//!   * success                            -> `200 { "value": <value-or-null> }`
//!
//! Cache: the legacy `withSessionAuth` `cache: { maxAge: 60, swr: 30 }` option
//! sets `Cache-Control: private, max-age=60, stale-while-revalidate=30` on 2xx
//! GET responses only (including the version-badge `{ "value": null }`
//! short-circuit, which is a 200). Error responses carry no cache header.
//!
//! GET only: PUT/DELETE return `None` so the still-live Next.js route handles
//! them.
//!
//! NOTE (behavior gap): the legacy `withSessionAuth` wrapper also performs IP
//! block checks, rate limiting, AI temp-auth, user-suspension checks, and
//! adaptive step-up challenges before invoking the handler. Those cross-cutting
//! protections are not reproduced here; this handler covers the authenticated
//! read path only.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    json_response_with_cache_control,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const CONFIGS_PATH_PREFIX: &str = "/api/v1/users/me/configs/";
const USER_CONFIGS_TABLE: &str = "user_configs";
const SHOW_VERSION_BADGE_CONFIG_ID: &str = "SHOW_VERSION_BADGE";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FETCH_ERROR_MESSAGE: &str = "Error fetching user config";

/// Mirrors the legacy `cache: { maxAge: 60, swr: 30 }` option:
/// `private, max-age=60, stale-while-revalidate=30` for successful GETs.
const CONFIGS_CACHE_CONTROL: &str = "private, max-age=60, stale-while-revalidate=30";

/// Authorization used for the supabase read. A Supabase session uses the
/// caller's access token (RLS active, mirroring the legacy session client); an
/// app-session has no access token, so we fall back to the service-role key
/// (the read remains user-scoped via the `user_id` filter).
enum DataAuth {
    AccessToken(String),
    ServiceRole,
}

#[derive(Deserialize)]
struct ConfigRow {
    value: Option<Value>,
}

pub(crate) async fn handle_users_me_configs_configid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let config_id = configs_config_id(request.path)?;

    Some(match request.method {
        "GET" => config_response(config, request, config_id, outbound).await,
        // PUT/DELETE remain served by the live Next.js route.
        _ => return None,
    })
}

async fn config_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    config_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // `withSessionAuth` rejects requests without a valid session / app-session.
    let (user_id, email, data_auth) =
        match resolve_authenticated_user(config, request, outbound).await {
            Some(resolved) => resolved,
            None => return error_message(401, UNAUTHORIZED_MESSAGE),
        };

    // Version-badge gate: limited to exact `@tuturuuu.com` accounts. Non-eligible
    // callers always see `{ value: null }` (a 200, so the cache header applies).
    if config_id == SHOW_VERSION_BADGE_CONFIG_ID
        && !is_exact_tuturuuu_dot_com_email(email.as_deref())
    {
        return success_response(Value::Null);
    }

    match fetch_config_value(
        &config.contact_data,
        outbound,
        &data_auth,
        &user_id,
        config_id,
    )
    .await
    {
        Ok(value) => success_response(value),
        Err(()) => fetch_error_response(),
    }
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

async fn resolve_authenticated_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<(String, Option<String>, DataAuth)> {
    // Legacy `allowAppSessionAuth: true` -> default satellite app-session set.
    if contact::request_has_app_session_token(request) {
        let identity = contact::resolve_app_session_identity(
            config,
            request,
            contact::current_user_app_session_targets(),
        )
        .ok()?;
        if identity.id.trim().is_empty() {
            return None;
        }
        return Some((identity.id, identity.email, DataAuth::ServiceRole));
    }

    let access_token = supabase_auth::request_access_token(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;
    let user_id = user.id.as_ref().filter(|id| !id.trim().is_empty())?.clone();

    Some((user_id, user.email, DataAuth::AccessToken(access_token)))
}

// ---------------------------------------------------------------------------
// Supabase read
// ---------------------------------------------------------------------------

async fn fetch_config_value(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    data_auth: &DataAuth,
    user_id: &str,
    config_id: &str,
) -> Result<Value, ()> {
    let url = contact_data
        .rest_url(
            USER_CONFIGS_TABLE,
            &[
                ("select", "value".to_owned()),
                ("user_id", format!("eq.{user_id}")),
                ("id", format!("eq.{config_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = match data_auth {
        DataAuth::AccessToken(token) => format!("Bearer {token}"),
        DataAuth::ServiceRole => format!("Bearer {service_role_key}"),
    };

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

    // `maybeSingle` returns 0 or 1 row; PostgREST serializes the filtered select
    // as an array. Mirror the legacy `data?.value ?? null` fallback.
    Ok(response
        .json::<Vec<ConfigRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.value)
        .unwrap_or(Value::Null))
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

fn configs_config_id(path: &str) -> Option<&str> {
    let config_id = path.strip_prefix(CONFIGS_PATH_PREFIX)?;

    (!config_id.is_empty() && !config_id.contains('/')).then_some(config_id)
}

/// Port of `isExactTuturuuuDotComEmail` (`/^[^\s@]+@tuturuuu\.com$/i` over the
/// trimmed email): a non-empty local part with no whitespace/`@`, and a domain
/// that is exactly `tuturuuu.com` (case-insensitive).
fn is_exact_tuturuuu_dot_com_email(email: Option<&str>) -> bool {
    let Some(email) = email else {
        return false;
    };
    let Some((local, domain)) = email.trim().split_once('@') else {
        return false;
    };

    !local.is_empty()
        && !local.chars().any(|c| c.is_whitespace())
        && domain.eq_ignore_ascii_case("tuturuuu.com")
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/// Legacy `NextResponse.json({ value })` on a 2xx GET, which the
/// `withSessionAuth` wrapper decorates with the private cache header.
fn success_response(value: Value) -> BackendResponse {
    json_response_with_cache_control(200, json!({ "value": value }), CONFIGS_CACHE_CONTROL)
}

/// Unauthorized response carries no cache header (the cache option only applies
/// to 2xx GETs); shape matches the legacy `{ error: 'Unauthorized' }`.
fn error_message(status: u16, message: &str) -> BackendResponse {
    json_response(status, json!({ "error": message }))
}

/// Legacy `{ message: 'Error fetching user config' }` 500 (note the `message`
/// key, distinct from the `error` key used for unauthorized).
fn fetch_error_response() -> BackendResponse {
    json_response(500, json!({ "message": FETCH_ERROR_MESSAGE }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_id_extracted_from_exact_prefix() {
        assert_eq!(
            configs_config_id("/api/v1/users/me/configs/SHOW_VERSION_BADGE"),
            Some("SHOW_VERSION_BADGE")
        );
        assert_eq!(
            configs_config_id("/api/v1/users/me/configs/some-id"),
            Some("some-id")
        );
    }

    #[test]
    fn config_id_rejects_non_matching_or_nested_paths() {
        // Collection path (no id) must not match.
        assert_eq!(configs_config_id("/api/v1/users/me/configs"), None);
        assert_eq!(configs_config_id("/api/v1/users/me/configs/"), None);
        // Nested segments must not match a single-segment id.
        assert_eq!(configs_config_id("/api/v1/users/me/configs/a/b"), None);
        // Wrong prefix / missing v1 must not match.
        assert_eq!(configs_config_id("/api/users/me/configs/x"), None);
        assert_eq!(configs_config_id("/api/v1/users/me/config/x"), None);
    }

    #[test]
    fn exact_tuturuuu_email_matches_only_root_domain() {
        assert!(is_exact_tuturuuu_dot_com_email(Some("member@tuturuuu.com")));
        assert!(is_exact_tuturuuu_dot_com_email(Some("MEMBER@TUTURUUU.COM")));
        // Trimmed before matching.
        assert!(is_exact_tuturuuu_dot_com_email(Some(
            "  member@tuturuuu.com  "
        )));

        assert!(!is_exact_tuturuuu_dot_com_email(Some(
            "member@xwf.tuturuuu.com"
        )));
        assert!(!is_exact_tuturuuu_dot_com_email(Some(
            "member@sub.tuturuuu.com"
        )));
        assert!(!is_exact_tuturuuu_dot_com_email(Some("member@example.com")));
        assert!(!is_exact_tuturuuu_dot_com_email(Some("nope")));
        assert!(!is_exact_tuturuuu_dot_com_email(Some("a b@tuturuuu.com")));
        assert!(!is_exact_tuturuuu_dot_com_email(Some("")));
        assert!(!is_exact_tuturuuu_dot_com_email(None));
    }

    #[test]
    fn success_response_wraps_value_with_cache_header() {
        let response = success_response(json!("true"));
        assert_eq!(response.status, 200);
        assert_eq!(response.cache_control, Some(CONFIGS_CACHE_CONTROL));
        assert_eq!(response.body, json!({ "value": "true" }));

        let null_response = success_response(Value::Null);
        assert_eq!(null_response.status, 200);
        assert_eq!(null_response.cache_control, Some(CONFIGS_CACHE_CONTROL));
        assert_eq!(null_response.body, json!({ "value": null }));
    }

    #[test]
    fn error_responses_have_expected_shapes_and_no_cache() {
        let unauthorized = error_message(401, UNAUTHORIZED_MESSAGE);
        assert_eq!(unauthorized.status, 401);
        assert_eq!(unauthorized.body, json!({ "error": UNAUTHORIZED_MESSAGE }));
        assert_eq!(unauthorized.cache_control, None);

        let fetch_error = fetch_error_response();
        assert_eq!(fetch_error.status, 500);
        assert_eq!(fetch_error.body, json!({ "message": FETCH_ERROR_MESSAGE }));
        assert_eq!(fetch_error.cache_control, None);
    }
}
