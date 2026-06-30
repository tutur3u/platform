//! Port of `GET /api/v1/infrastructure/cron/whitelist/domains`.
//!
//! Legacy source:
//! `apps/web/src/app/api/v1/infrastructure/cron/whitelist/domains/route.ts`.
//!
//! ## Auth
//!
//! The legacy route calls `getManagedCronAdminUser(request)` which:
//!
//! - Resolves the session user from bearer token or cookie.
//! - Returns `null` (-> 403) if the user's email is not an exact
//!   `@tuturuuu.com` address (via `isExactTuturuuuDotComEmail`).
//!
//! This port reproduces the check with `supabase_auth::request_access_token`,
//! `supabase_auth::fetch_supabase_auth_user`, and
//! `supabase_auth::is_valid_tuturuuu_email`.
//!
//! ## Data
//!
//! The legacy GET calls `listManagedCronWhitelistedDomains` which invokes
//! `client.schema('private').rpc('list_managed_cron_whitelisted_domains', ...)`
//! via a Supabase admin client. Parameters sent to the RPC:
//!
//! - `p_limit`: pageSize (positive int, default 10).
//! - `p_offset`: (page − 1) × p_limit.
//! - `p_search`: `null` or `%<q.toLowerCase().trim()>%`.
//!
//! The RPC returns `{ count?: number, data?: ManagedCronWhitelistedDomain[] }`.
//! This port calls the same RPC via a service-role POST to
//! `/rest/v1/rpc/list_managed_cron_whitelisted_domains` with
//! `Content-Profile: private`.
//!
//! ## Response Shape
//!
//! ```json
//! { "count": <number>, "data": [ ... ] }
//! ```
//!
//! ## Cache
//!
//! The legacy route does not set an explicit `Cache-Control` header; Next.js
//! API routes default to `no-store`, so this port adds `no-store`.
//!
//! ## Behavior Gaps
//!
//! - POST is not ported here; non-GET methods return `None` so the worker
//!   falls through to the still-live Next.js route.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

pub(crate) const INFRASTRUCTURE_CRON_WHITELIST_DOMAINS_PATH: &str =
    "/api/v1/infrastructure/cron/whitelist/domains";

const PRIVATE_SCHEMA: &str = "private";
const LIST_DOMAINS_RPC: &str = "list_managed_cron_whitelisted_domains";
const DEFAULT_PAGE: i64 = 1;
const DEFAULT_PAGE_SIZE: i64 = 10;

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_infrastructure_cron_whitelist_domains_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    if request.path != INFRASTRUCTURE_CRON_WHITELIST_DOMAINS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => get_domains_response(config, request, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn get_domains_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return forbidden_response();
    }

    if !is_managed_cron_admin(contact_data, request, outbound).await {
        return forbidden_response();
    }

    let query = ListQuery::from_url(request.url);

    match fetch_domains(contact_data, outbound, &query).await {
        Ok(data) => no_store_response(json_response(200, data)),
        Err(()) => no_store_response(json_response(
            500,
            json!({ "message": "Failed to list managed cron whitelist domains" }),
        )),
    }
}

// ---------------------------------------------------------------------------
// Auth helper — mirrors getManagedCronAdminUser
// ---------------------------------------------------------------------------

async fn is_managed_cron_admin(
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

// ---------------------------------------------------------------------------
// Data fetch — calls list_managed_cron_whitelisted_domains RPC (private schema)
// ---------------------------------------------------------------------------

async fn fetch_domains(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    query: &ListQuery,
) -> Result<Value, ()> {
    let rpc_url = contact_data.rpc_url(LIST_DOMAINS_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let limit = query.page_size;
    let offset = (query.page - 1) * limit;
    let search = query.q.as_deref().map(|q| {
        let normalized = q.trim().to_lowercase();
        format!("%{normalized}%")
    });

    let body = json!({
        "p_limit": limit,
        "p_offset": offset,
        "p_search": search,
    });
    let body_str = body.to_string();

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_body(&body_str),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let payload = response.json::<Value>().map_err(|_| ())?;

    let count = payload["count"].as_i64().unwrap_or(0);
    let data = match payload.get("data").and_then(Value::as_array) {
        Some(arr) => Value::Array(arr.clone()),
        None => json!([]),
    };

    Ok(json!({
        "count": count,
        "data": data,
    }))
}

// ---------------------------------------------------------------------------
// Shared response builders
// ---------------------------------------------------------------------------

fn forbidden_response() -> BackendResponse {
    no_store_response(json_response(
        403,
        json!({ "message": "You are not allowed to perform this action" }),
    ))
}

// ---------------------------------------------------------------------------
// Query-string parsing — mirrors parsePositiveInteger / normalizeDomainSearch
// ---------------------------------------------------------------------------

struct ListQuery {
    page: i64,
    page_size: i64,
    q: Option<String>,
}

impl ListQuery {
    fn from_url(request_url: Option<&str>) -> Self {
        let mut query = Self {
            page: DEFAULT_PAGE,
            page_size: DEFAULT_PAGE_SIZE,
            q: None,
        };
        let Some(url) = request_url.and_then(|u| url::Url::parse(u).ok()) else {
            return query;
        };

        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "page" => {
                    if let Some(n) = parse_positive_integer(&value) {
                        query.page = n;
                    }
                }
                "pageSize" => {
                    if let Some(n) = parse_positive_integer(&value) {
                        query.page_size = n;
                    }
                }
                "q" => {
                    let trimmed = value.trim().to_owned();
                    if !trimmed.is_empty() {
                        query.q = Some(trimmed);
                    }
                }
                _ => {}
            }
        }

        query
    }
}

/// Mirrors `parsePositiveInteger(value, fallback)` from the legacy module:
/// `parseInt(value, 10)` and accepts only values `> 0`.
fn parse_positive_integer(value: &str) -> Option<i64> {
    value.parse::<i64>().ok().filter(|&n| n > 0)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_constant_matches_route() {
        assert_eq!(
            INFRASTRUCTURE_CRON_WHITELIST_DOMAINS_PATH,
            "/api/v1/infrastructure/cron/whitelist/domains"
        );
    }

    #[test]
    fn parse_positive_integer_valid_cases() {
        assert_eq!(parse_positive_integer("1"), Some(1));
        assert_eq!(parse_positive_integer("10"), Some(10));
        assert_eq!(parse_positive_integer("999"), Some(999));
    }

    #[test]
    fn parse_positive_integer_rejects_invalid() {
        assert_eq!(parse_positive_integer("0"), None);
        assert_eq!(parse_positive_integer("-1"), None);
        assert_eq!(parse_positive_integer("abc"), None);
        assert_eq!(parse_positive_integer(""), None);
        assert_eq!(parse_positive_integer("1.5"), None);
    }

    #[test]
    fn list_query_defaults_when_no_url() {
        let q = ListQuery::from_url(None);
        assert_eq!(q.page, DEFAULT_PAGE);
        assert_eq!(q.page_size, DEFAULT_PAGE_SIZE);
        assert!(q.q.is_none());
    }

    #[test]
    fn list_query_parses_valid_params() {
        let q = ListQuery::from_url(Some(
            "https://example.com/api/v1/infrastructure/cron/whitelist/domains?page=3&pageSize=25&q=example.com",
        ));
        assert_eq!(q.page, 3);
        assert_eq!(q.page_size, 25);
        assert_eq!(q.q.as_deref(), Some("example.com"));
    }

    #[test]
    fn list_query_invalid_page_uses_default() {
        let q = ListQuery::from_url(Some("https://example.com/api?page=bad&pageSize=0"));
        assert_eq!(q.page, DEFAULT_PAGE);
        assert_eq!(q.page_size, DEFAULT_PAGE_SIZE);
    }

    #[test]
    fn list_query_empty_q_becomes_none() {
        let q = ListQuery::from_url(Some("https://example.com/api?q=   "));
        assert!(q.q.is_none());
    }

    #[test]
    fn forbidden_response_has_status_403() {
        let resp = forbidden_response();
        assert_eq!(resp.status, 403);
    }

    #[test]
    fn list_query_default_page_is_one() {
        assert_eq!(DEFAULT_PAGE, 1);
    }

    #[test]
    fn list_query_default_page_size_is_ten() {
        assert_eq!(DEFAULT_PAGE_SIZE, 10);
    }
}
