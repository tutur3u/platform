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
//! `supabase_auth::is_exact_tuturuuu_dot_com_email`.
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
//! ## POST
//!
//! The legacy `POST` admits a managed-cron admin (same `@tuturuuu.com` gate),
//! validates `{ description?, domain, enabled? }` against `createDomainSchema`
//! (Zod), then calls `addManagedCronWhitelistedDomain` → the
//! `upsert_managed_cron_whitelisted_domain` RPC (private schema, service role)
//! with `{ p_actor_id, p_description, p_domain, p_enabled }`. The `p_domain`
//! value is run through `normalizeManagedCronDomain`, reproduced here faithfully
//! (scheme stripping, trailing-dot trim, IP / private-host / label validation).
//! The legacy status mapping is preserved:
//!
//! - non-admin → `403 { message: "You are not allowed to perform this action" }`
//! - malformed JSON body (`request.json()` throws, not a ZodError) →
//!   `500 { message: "Failed to create managed cron whitelist domain" }`
//! - Zod validation failure → `400 { message: "Invalid whitelist domain payload" }`
//! - `normalizeManagedCronDomain` throws (also not a ZodError) or RPC failure →
//!   `500 { message: "Failed to create managed cron whitelist domain" }`
//! - success → `201 { data: <upserted row> }`

use std::net::IpAddr;

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
const UPSERT_DOMAIN_RPC: &str = "upsert_managed_cron_whitelisted_domain";
const DEFAULT_PAGE: i64 = 1;
const DEFAULT_PAGE_SIZE: i64 = 10;
const MAX_DOMAIN_LEN: usize = 253;

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
        "POST" => post_domain_response(config, request, outbound).await,
        _ => return None,
    })
}

/// Hook for the body-buffering gate in `lib.rs`.
///
/// Returns `true` for `POST` requests to this route so the worker buffers the
/// request body before calling the handler.
pub(crate) fn should_buffer_request_body(method: &str, path: &str) -> bool {
    method == "POST" && path == INFRASTRUCTURE_CRON_WHITELIST_DOMAINS_PATH
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
    supabase_auth::is_exact_tuturuuu_dot_com_email(user.email.as_deref())
}

/// Like [`is_managed_cron_admin`] but returns the admin's user id (needed as the
/// `p_actor_id` of the upsert RPC). `None` ⇒ caller is not a managed-cron admin
/// and should receive a `403`.
async fn managed_cron_admin_user_id(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<String> {
    let access_token = supabase_auth::request_access_token(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await?;
    if !supabase_auth::is_exact_tuturuuu_dot_com_email(user.email.as_deref()) {
        return None;
    }
    user.id.filter(|id| !id.trim().is_empty())
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

async fn post_domain_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return forbidden_response();
    }

    let Some(actor_id) = managed_cron_admin_user_id(contact_data, request, outbound).await else {
        return forbidden_response();
    };

    // `createDomainSchema.parse(await request.json())`: a `request.json()` throw
    // (malformed body) is NOT a ZodError, so it maps to 500; a schema failure
    // maps to 400.
    let payload = match parse_create_domain(request.body_text) {
        Ok(payload) => payload,
        Err(CreateDomainError::MalformedJson) => return create_failed_response(),
        Err(CreateDomainError::Invalid) => {
            return no_store_response(json_response(
                400,
                json!({ "message": "Invalid whitelist domain payload" }),
            ));
        }
    };

    // `normalizeManagedCronDomain` throws on invalid input; that throw is also
    // not a ZodError, so the legacy route returns 500.
    let Some(normalized_domain) = normalize_managed_cron_domain(&payload.domain) else {
        return create_failed_response();
    };

    match upsert_domain(
        contact_data,
        outbound,
        &actor_id,
        payload.description.as_deref(),
        &normalized_domain,
        payload.enabled,
    )
    .await
    {
        Ok(data) => no_store_response(json_response(201, json!({ "data": data }))),
        Err(()) => create_failed_response(),
    }
}

fn create_failed_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": "Failed to create managed cron whitelist domain" }),
    ))
}

/// Calls the `upsert_managed_cron_whitelisted_domain` RPC in the `private`
/// schema with the service-role key (mirrors `createAdminClient` +
/// `client.schema('private').rpc`). `description` of `None` is sent as JSON
/// `null` (matching `payload.description ?? null`).
async fn upsert_domain(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    actor_id: &str,
    description: Option<&str>,
    normalized_domain: &str,
    enabled: bool,
) -> Result<Value, ()> {
    let rpc_url = contact_data.rpc_url(UPSERT_DOMAIN_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let body = json!({
        "p_actor_id": actor_id,
        "p_description": description,
        "p_domain": normalized_domain,
        "p_enabled": enabled,
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

    // The RPC returns the upserted row; pass it through verbatim as `data`.
    response.json::<Value>().map_err(|_| ())
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
// POST body validation — mirrors createDomainSchema (Zod)
// ---------------------------------------------------------------------------

struct CreateDomain {
    /// `payload.description ?? null`: `None` ⇒ send JSON `null`.
    description: Option<String>,
    /// Trimmed domain (1..=253 chars), pre-normalization.
    domain: String,
    /// `payload.enabled ?? true`.
    enabled: bool,
}

#[derive(Debug)]
enum CreateDomainError {
    /// `request.json()` threw — not a ZodError → 500.
    MalformedJson,
    /// Schema validation failed (ZodError) → 400.
    Invalid,
}

/// Reproduces `createDomainSchema.parse(await request.json())`:
///
/// - `description`: `z.string().trim().nullable().optional()` — string (trimmed),
///   `null`, or absent. Any other type is a ZodError.
/// - `domain`: `z.string().trim().min(1).max(253)` — required, trimmed, 1..=253.
/// - `enabled`: `z.boolean().optional()` — bool or absent.
///
/// A non-object JSON value (number, string, array, …) is also a ZodError.
fn parse_create_domain(body_text: Option<&str>) -> Result<CreateDomain, CreateDomainError> {
    let raw = body_text.unwrap_or_default();
    let value: Value = serde_json::from_str(raw).map_err(|_| CreateDomainError::MalformedJson)?;

    let object = value.as_object().ok_or(CreateDomainError::Invalid)?;

    let description = match object.get("description") {
        None | Some(Value::Null) => None,
        Some(Value::String(s)) => Some(s.trim().to_owned()),
        Some(_) => return Err(CreateDomainError::Invalid),
    };

    let domain = match object.get("domain") {
        Some(Value::String(s)) => s.trim().to_owned(),
        _ => return Err(CreateDomainError::Invalid),
    };
    let domain_len = domain.chars().count();
    if !(1..=MAX_DOMAIN_LEN).contains(&domain_len) {
        return Err(CreateDomainError::Invalid);
    }

    let enabled = match object.get("enabled") {
        None => true,
        Some(Value::Bool(b)) => *b,
        Some(_) => return Err(CreateDomainError::Invalid),
    };

    Ok(CreateDomain {
        description,
        domain,
        enabled,
    })
}

// ---------------------------------------------------------------------------
// Domain normalization — faithful port of normalizeManagedCronDomain
// ---------------------------------------------------------------------------

/// Port of `normalizeManagedCronDomain(input)`. Returns `None` for every case
/// where the legacy function throws (the caller maps `None` to a 500, matching
/// the legacy non-ZodError catch branch).
fn normalize_managed_cron_domain(input: &str) -> Option<String> {
    let trimmed = input.trim().to_lowercase();
    if trimmed.is_empty() {
        return None; // "Domain is required"
    }

    // `if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(trimmed)) domain = new URL(...).hostname`
    let mut domain = if has_scheme(&trimmed) {
        url::Url::parse(&trimmed).ok()?.host_str()?.to_lowercase()
    } else {
        trimmed
    };

    // `domain.replace(/\.$/u, '')` — strip a single trailing dot.
    if let Some(stripped) = domain.strip_suffix('.') {
        domain = stripped.to_owned();
    }

    if domain.is_empty()
        || domain.contains('*')
        || domain.contains('/')
        || domain.len() > MAX_DOMAIN_LEN
    {
        return None;
    }

    if is_ip_address(&domain) || is_blocked_hostname(&domain) {
        return None;
    }

    let labels: Vec<&str> = domain.split('.').collect();
    if labels.len() < 2 || labels.iter().any(|label| !is_valid_domain_label(label)) {
        return None;
    }

    Some(domain)
}

/// Mirrors `/^[a-z][a-z0-9+.-]*:\/\//i` against the already-lowercased input:
/// a scheme (`[a-z][a-z0-9+.-]*`) immediately followed by `://`.
fn has_scheme(lowercased: &str) -> bool {
    let Some(index) = lowercased.find("://") else {
        return false;
    };
    let scheme = &lowercased[..index];
    let mut bytes = scheme.bytes();
    let Some(first) = bytes.next() else {
        return false;
    };
    if !first.is_ascii_lowercase() {
        return false;
    }
    bytes.all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'+' | b'.' | b'-'))
}

/// Mirrors `net.isIP(domain) !== 0` (IPv4 or IPv6).
fn is_ip_address(domain: &str) -> bool {
    domain.parse::<IpAddr>().is_ok()
}

/// Faithful port of the legacy `isBlockedHostname(hostname)`.
fn is_blocked_hostname(hostname: &str) -> bool {
    let normalized = hostname.to_lowercase();

    if normalized == "localhost"
        || normalized == "0.0.0.0"
        || normalized.ends_with(".localhost")
        || normalized.ends_with(".local")
    {
        return true;
    }

    if normalized == "::1" || normalized.starts_with("fc") || normalized.starts_with("fd") {
        return true;
    }

    // `normalized.split('.').map(part => Number.parseInt(part, 10))`; a part with
    // no leading digits parses to NaN, which fails `Number.isInteger` ⇒ not blocked.
    let parts: Vec<Option<i64>> = normalized.split('.').map(parse_int_prefix).collect();
    if parts.len() != 4 || parts.iter().any(Option::is_none) {
        return false;
    }

    let first = parts[0].unwrap_or(0);
    let second = parts[1].unwrap_or(0);
    first == 10
        || first == 127
        || (first == 172 && (16..=31).contains(&second))
        || (first == 169 && second == 254)
        || (first == 192 && second == 168)
}

/// Mirrors `Number.parseInt(value, 10)`: optional sign, then leading ASCII
/// digits; trailing non-digits are ignored. `None` ⇒ `NaN` (no leading digit).
fn parse_int_prefix(value: &str) -> Option<i64> {
    let bytes = value.as_bytes();
    let mut index = 0;
    let mut sign: i64 = 1;
    if let Some(&b) = bytes.first()
        && (b == b'+' || b == b'-')
    {
        if b == b'-' {
            sign = -1;
        }
        index = 1;
    }
    let start = index;
    while index < bytes.len() && bytes[index].is_ascii_digit() {
        index += 1;
    }
    if index == start {
        return None;
    }
    value[start..index].parse::<i64>().ok().map(|n| sign * n)
}

/// Mirrors `DOMAIN_LABEL_PATTERN = /^(?!-)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u`:
/// 1..=63 chars, `[a-z0-9]` endpoints, `[a-z0-9-]` interior, no leading/trailing
/// hyphen. (The domain is lowercased before label checks.)
fn is_valid_domain_label(label: &str) -> bool {
    let bytes = label.as_bytes();
    let len = bytes.len();
    if len == 0 || len > 63 {
        return false;
    }

    let is_alnum = |b: u8| b.is_ascii_lowercase() || b.is_ascii_digit();
    if !is_alnum(bytes[0]) {
        return false;
    }
    if len == 1 {
        return true;
    }
    if !is_alnum(bytes[len - 1]) {
        return false;
    }
    bytes[1..len - 1].iter().all(|&b| is_alnum(b) || b == b'-')
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

    #[test]
    fn should_buffer_only_post_on_route() {
        assert!(should_buffer_request_body(
            "POST",
            INFRASTRUCTURE_CRON_WHITELIST_DOMAINS_PATH
        ));
        assert!(!should_buffer_request_body(
            "GET",
            INFRASTRUCTURE_CRON_WHITELIST_DOMAINS_PATH
        ));
        assert!(!should_buffer_request_body("POST", "/api/v1/other"));
    }

    // ---- parse_create_domain ----------------------------------------------

    #[test]
    fn parse_create_domain_minimal_valid() {
        let parsed = parse_create_domain(Some(r#"{"domain":"example.com"}"#)).unwrap();
        assert_eq!(parsed.domain, "example.com");
        assert!(parsed.description.is_none());
        assert!(parsed.enabled, "enabled defaults to true");
    }

    #[test]
    fn parse_create_domain_full_valid() {
        let parsed = parse_create_domain(Some(
            r#"{"domain":"  example.com  ","description":"  hi  ","enabled":false}"#,
        ))
        .unwrap();
        assert_eq!(parsed.domain, "example.com", "domain is trimmed");
        assert_eq!(
            parsed.description.as_deref(),
            Some("hi"),
            "description trimmed"
        );
        assert!(!parsed.enabled);
    }

    #[test]
    fn parse_create_domain_null_description_is_none() {
        let parsed =
            parse_create_domain(Some(r#"{"domain":"example.com","description":null}"#)).unwrap();
        assert!(parsed.description.is_none());
    }

    #[test]
    fn parse_create_domain_malformed_json_is_500() {
        assert!(matches!(
            parse_create_domain(Some("not json")),
            Err(CreateDomainError::MalformedJson)
        ));
        assert!(matches!(
            parse_create_domain(None),
            Err(CreateDomainError::MalformedJson)
        ));
    }

    #[test]
    fn parse_create_domain_validation_failures_are_400() {
        // missing domain
        assert!(matches!(
            parse_create_domain(Some(r#"{"enabled":true}"#)),
            Err(CreateDomainError::Invalid)
        ));
        // empty domain after trim
        assert!(matches!(
            parse_create_domain(Some(r#"{"domain":"   "}"#)),
            Err(CreateDomainError::Invalid)
        ));
        // wrong domain type
        assert!(matches!(
            parse_create_domain(Some(r#"{"domain":123}"#)),
            Err(CreateDomainError::Invalid)
        ));
        // wrong enabled type
        assert!(matches!(
            parse_create_domain(Some(r#"{"domain":"a.com","enabled":"yes"}"#)),
            Err(CreateDomainError::Invalid)
        ));
        // wrong description type
        assert!(matches!(
            parse_create_domain(Some(r#"{"domain":"a.com","description":5}"#)),
            Err(CreateDomainError::Invalid)
        ));
        // non-object JSON
        assert!(matches!(
            parse_create_domain(Some(r#""just-a-string""#)),
            Err(CreateDomainError::Invalid)
        ));
    }

    #[test]
    fn parse_create_domain_rejects_too_long_domain() {
        let long = format!("{}.com", "a".repeat(260));
        let body = format!(r#"{{"domain":"{long}"}}"#);
        assert!(matches!(
            parse_create_domain(Some(&body)),
            Err(CreateDomainError::Invalid)
        ));
    }

    // ---- normalize_managed_cron_domain ------------------------------------

    #[test]
    fn normalize_trims_lowercases_and_strips_scheme() {
        assert_eq!(
            normalize_managed_cron_domain("HTTPS://Hooks.Example.COM/path"),
            Some("hooks.example.com".to_owned())
        );
    }

    #[test]
    fn normalize_strips_trailing_dot() {
        assert_eq!(
            normalize_managed_cron_domain("example.com."),
            Some("example.com".to_owned())
        );
    }

    #[test]
    fn normalize_plain_domain() {
        assert_eq!(
            normalize_managed_cron_domain("sub.example.co.uk"),
            Some("sub.example.co.uk".to_owned())
        );
    }

    #[test]
    fn normalize_rejects_empty() {
        assert_eq!(normalize_managed_cron_domain("   "), None);
    }

    #[test]
    fn normalize_rejects_wildcard_and_slash() {
        assert_eq!(normalize_managed_cron_domain("*.example.com"), None);
    }

    #[test]
    fn normalize_rejects_single_label() {
        assert_eq!(normalize_managed_cron_domain("localhost"), None);
        assert_eq!(normalize_managed_cron_domain("example"), None);
    }

    #[test]
    fn normalize_rejects_ip_and_private_hosts() {
        assert_eq!(normalize_managed_cron_domain("192.168.1.1"), None);
        assert_eq!(normalize_managed_cron_domain("10.0.0.1"), None);
        assert_eq!(normalize_managed_cron_domain("127.0.0.1"), None);
        assert_eq!(normalize_managed_cron_domain("::1"), None);
    }

    #[test]
    fn normalize_rejects_dotlocal_and_dotlocalhost() {
        assert_eq!(normalize_managed_cron_domain("foo.local"), None);
        assert_eq!(normalize_managed_cron_domain("foo.localhost"), None);
    }

    #[test]
    fn normalize_rejects_hyphen_edges() {
        assert_eq!(normalize_managed_cron_domain("-bad.example.com"), None);
        assert_eq!(normalize_managed_cron_domain("bad-.example.com"), None);
    }

    #[test]
    fn has_scheme_matches_legacy_regex() {
        assert!(has_scheme("https://example.com"));
        assert!(has_scheme("h+t.t-p://example.com"));
        assert!(!has_scheme("example.com"));
        assert!(!has_scheme("1https://example.com")); // must start with a letter
        assert!(!has_scheme("ht!tp://example.com")); // '!' not allowed in scheme
    }

    #[test]
    fn parse_int_prefix_mirrors_parse_int() {
        assert_eq!(parse_int_prefix("10"), Some(10));
        assert_eq!(parse_int_prefix("10abc"), Some(10));
        assert_eq!(parse_int_prefix("-5"), Some(-5));
        assert_eq!(parse_int_prefix("abc"), None);
        assert_eq!(parse_int_prefix(""), None);
    }

    #[test]
    fn is_valid_domain_label_cases() {
        assert!(is_valid_domain_label("a"));
        assert!(is_valid_domain_label("example"));
        assert!(is_valid_domain_label("a1-b2"));
        assert!(!is_valid_domain_label(""));
        assert!(!is_valid_domain_label("-lead"));
        assert!(!is_valid_domain_label("trail-"));
        assert!(!is_valid_domain_label(&"a".repeat(64)));
    }
}
