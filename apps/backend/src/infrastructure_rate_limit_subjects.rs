//! Handler for `GET /api/v1/infrastructure/rate-limit-subjects`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/infrastructure/rate-limit-subjects/route.ts`.
//!
//! The legacy route authorizes the caller with
//! `authorizeAbuseIntelligenceRequest` (default `view_infrastructure`
//! permission against the root workspace), validates the `kind`/`limit`/`q`
//! query parameters with Zod, and then runs
//! `searchRateLimitSubjectCandidates` against the admin (service-role) client,
//! responding with `{ results }`.
//!
//! Auth mirrors the sibling `infrastructure_rate_limits_live_usage` /
//! `infrastructure_abuse_intelligence` handlers, reusing
//! `authorize_workspace_permission` against `ROOT_WORKSPACE_ID`:
//!   * missing session token / unauthorized   -> `401 { "message": "Unauthorized" }`
//!   * authenticated caller lacking permission -> `403 { "message": "Forbidden" }`
//!   * config / auth internal failure          -> `500 { "message": "Failed to search rate-limit subjects" }`
//!
//! BEHAVIOR GAPS vs legacy:
//!   * The 400 invalid-query response includes `{ "message": "Invalid query
//!     parameters", "errors": [] }`. The legacy route embeds the full Zod
//!     `issues` array in `errors`; reproducing the exact Zod issue objects is
//!     out of scope, so `errors` is emitted as an empty array. The status code
//!     and message match exactly.
//!   * Legacy Supabase query helpers swallow read errors via `data ?? []` (and
//!     `loadUserMap`'s try/catch). This handler mirrors that: a non-2xx read or
//!     parse failure resolves to empty rows rather than a 500. The 500 path is
//!     reserved for config/auth-internal failures (the legacy "thrown
//!     exception" branch).
//!   * IPv4 detection for the typed-IP fallback accepts octets with redundant
//!     leading zeros (e.g. `099`) that the legacy regex would reject. This only
//!     affects whether a typed search term is surfaced as a synthetic IP row.

use std::collections::HashMap;

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    infrastructure_root_auth::ROOT_WORKSPACE_ID,
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

pub(crate) const RATE_LIMIT_SUBJECTS_PATH: &str = "/api/v1/infrastructure/rate-limit-subjects";

const VIEW_INFRASTRUCTURE_PERMISSION: &str = "view_infrastructure";
const MAX_SEARCH_LENGTH: usize = 500;
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const ERROR_MESSAGE: &str = "Failed to search rate-limit subjects";
const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum SubjectsAuthError {
    Forbidden,
    Internal,
    Unauthorized,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum SubjectKind {
    Ip,
    User,
    Workspace,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct SearchQuery {
    kind: SubjectKind,
    limit: i64,
    /// Trimmed, non-empty search term (mirrors `clean(parsed.q)`).
    q: Option<String>,
}

pub(crate) async fn handle_infrastructure_rate_limit_subjects_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != RATE_LIMIT_SUBJECTS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => rate_limit_subjects_response(config, request, outbound).await,
        // Legacy only owns GET; fall through to the live Next.js route for the rest.
        _ => return None,
    })
}

async fn rate_limit_subjects_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if let Err(error) = authorize_subjects(config, request, outbound).await {
        return match error {
            SubjectsAuthError::Unauthorized => message_response(401, UNAUTHORIZED_MESSAGE),
            SubjectsAuthError::Forbidden => message_response(403, FORBIDDEN_MESSAGE),
            SubjectsAuthError::Internal => error_response(),
        };
    }

    let query = match parse_search_query(request.url) {
        Ok(query) => query,
        Err(()) => {
            return no_store_response(json_response(
                400,
                json!({ "errors": [], "message": INVALID_QUERY_MESSAGE }),
            ));
        }
    };

    let results = search_subject_candidates(&config.contact_data, outbound, &query).await;

    no_store_response(json_response(200, json!({ "results": results })))
}

async fn authorize_subjects(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Result<(), SubjectsAuthError> {
    if supabase_auth::request_access_token(request).is_none() {
        return Err(SubjectsAuthError::Unauthorized);
    }

    match authorize_workspace_permission(
        &config.contact_data,
        request,
        ROOT_WORKSPACE_ID,
        VIEW_INFRASTRUCTURE_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(_) => Ok(()),
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            Err(SubjectsAuthError::Unauthorized)
        }
        Err(
            WorkspacePermissionAuthorizationError::Forbidden
            | WorkspacePermissionAuthorizationError::NotFound,
        ) => Err(SubjectsAuthError::Forbidden),
        Err(WorkspacePermissionAuthorizationError::Internal) => Err(SubjectsAuthError::Internal),
    }
}

/// Mirrors the Zod `QuerySchema`:
///   * `kind`  enum [ip, user, workspace] default `workspace`
///   * `limit` coerced positive int, max 25, default 8
///   * `q`     trimmed string, max `MAX_SEARCH_LENGTH`, optional
fn parse_search_query(request_url: Option<&str>) -> Result<SearchQuery, ()> {
    let kind = match query_value(request_url, "kind") {
        None => SubjectKind::Workspace,
        Some(value) => match value.as_str() {
            "ip" => SubjectKind::Ip,
            "user" => SubjectKind::User,
            "workspace" => SubjectKind::Workspace,
            _ => return Err(()),
        },
    };

    let limit = match query_value(request_url, "limit") {
        None => 8,
        Some(value) => {
            let parsed = js_number(&value).ok_or(())?;
            // int() + positive() + max(25): no clamping, out-of-range fails.
            if parsed.fract() != 0.0 || parsed <= 0.0 || parsed > 25.0 {
                return Err(());
            }
            parsed as i64
        }
    };

    let q = match query_value(request_url, "q") {
        None => None,
        Some(value) => {
            let trimmed = value.trim();
            if trimmed.encode_utf16().count() > MAX_SEARCH_LENGTH {
                return Err(());
            }
            // `clean(parsed.q)`: empty becomes no filter.
            (!trimmed.is_empty()).then(|| trimmed.to_owned())
        }
    };

    Ok(SearchQuery { kind, limit, q })
}

/// Parses a query value the way `z.coerce.number()` (i.e. JS `Number(value)`)
/// would for the common integer cases. Rejects NaN/Infinity.
fn js_number(value: &str) -> Option<f64> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    let parsed = trimmed.parse::<f64>().ok()?;
    parsed.is_finite().then_some(parsed)
}

fn query_value(request_url: Option<&str>, expected_key: &str) -> Option<String> {
    let url = request_url.and_then(|request_url| url::Url::parse(request_url).ok())?;
    url.query_pairs()
        .find_map(|(key, value)| (key == expected_key).then(|| value.into_owned()))
}

async fn search_subject_candidates(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    query: &SearchQuery,
) -> Vec<Value> {
    match query.kind {
        SubjectKind::Workspace => search_workspaces(contact_data, outbound, query).await,
        SubjectKind::User => search_users(contact_data, outbound, query).await,
        SubjectKind::Ip => search_ips(contact_data, outbound, query).await,
    }
}

async fn search_workspaces(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    query: &SearchQuery,
) -> Vec<Value> {
    let mut params = vec![
        ("select", "id,name,handle,personal".to_owned()),
        ("order", "name.asc".to_owned()),
        ("limit", query.limit.to_string()),
    ];
    if let Some(q) = query.q.as_deref() {
        if is_uuid(q) {
            params.push(("id", format!("eq.{q}")));
        } else {
            params.push(("name", format!("ilike.%{q}%")));
        }
    }

    fetch_rows(contact_data, outbound, "workspaces", &params)
        .await
        .iter()
        .map(workspace_result)
        .collect()
}

async fn search_users(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    query: &SearchQuery,
) -> Vec<Value> {
    let mut params = vec![
        ("select", "id,display_name,handle".to_owned()),
        ("order", "display_name.asc".to_owned()),
        ("limit", query.limit.to_string()),
    ];
    if let Some(q) = query.q.as_deref() {
        if is_uuid(q) {
            params.push(("id", format!("eq.{q}")));
        } else {
            params.push(("display_name", format!("ilike.%{q}%")));
        }
    }

    let rows = fetch_rows(contact_data, outbound, "users", &params).await;
    let ids: Vec<String> = rows
        .iter()
        .filter_map(|row| str_field(row, "id").map(str::to_owned))
        .collect();

    load_user_summaries(contact_data, outbound, &ids)
        .await
        .iter()
        .map(user_result)
        .collect()
}

async fn search_ips(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    query: &SearchQuery,
) -> Vec<Value> {
    let mut params = vec![
        ("select", "ip_address,status,blocked_at,reason".to_owned()),
        ("order", "blocked_at.desc".to_owned()),
        ("limit", query.limit.to_string()),
    ];
    if let Some(q) = query.q.as_deref() {
        params.push(("ip_address", format!("ilike.%{q}%")));
    }

    let rows = fetch_rows(contact_data, outbound, "blocked_ips", &params).await;
    build_ip_results(&rows, query.q.as_deref(), query.limit)
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct UserSummary {
    display_name: Option<String>,
    email: Option<String>,
    handle: Option<String>,
    id: String,
}

/// Mirrors `loadUserMap`: re-reads `users` and `user_private_details` by id and
/// merges them, preserving the `users` read order (the order legacy iterates
/// the resulting Map values).
async fn load_user_summaries(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ids: &[String],
) -> Vec<UserSummary> {
    if ids.is_empty() {
        return Vec::new();
    }

    let in_filter = format!("in.({})", ids.join(","));

    let users_rows = fetch_rows(
        contact_data,
        outbound,
        "users",
        &[
            ("select", "id,display_name,handle,avatar_url".to_owned()),
            ("id", in_filter.clone()),
        ],
    )
    .await;
    let private_rows = fetch_rows(
        contact_data,
        outbound,
        "user_private_details",
        &[
            ("select", "user_id,email,full_name".to_owned()),
            ("user_id", in_filter),
        ],
    )
    .await;

    // user_id -> (email, full_name) raw values.
    let mut private_by_id: HashMap<String, (Option<String>, Option<String>)> = HashMap::new();
    for row in &private_rows {
        if let Some(user_id) = str_field(row, "user_id") {
            private_by_id.insert(
                user_id.to_owned(),
                (
                    owned_string_field(row, "email"),
                    owned_string_field(row, "full_name"),
                ),
            );
        }
    }

    users_rows
        .iter()
        .map(|row| {
            let id = str_field(row, "id").unwrap_or_default().to_owned();
            let private = private_by_id.get(&id);
            let display_name = clean(str_field(row, "display_name"))
                .map(str::to_owned)
                .or_else(|| {
                    private
                        .and_then(|(_, full_name)| full_name.as_deref())
                        .and_then(|full_name| clean(Some(full_name)))
                        .map(str::to_owned)
                });
            UserSummary {
                display_name,
                email: private.and_then(|(email, _)| email.clone()),
                handle: owned_string_field(row, "handle"),
                id,
            }
        })
        .collect()
}

fn workspace_result(row: &Value) -> Value {
    let id = str_field(row, "id").unwrap_or_default();
    let handle = str_field(row, "handle").filter(|value| !value.is_empty());
    let detail = match handle {
        Some(handle) => format!("@{handle} · {id}"),
        None => id.to_owned(),
    };
    let label = str_field(row, "name")
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| format!("Workspace {}", short_id(id)));

    json!({
        "detail": detail,
        "kind": "workspace",
        "label": label,
        "subjectKey": format!("workspace:{id}"),
        "subjectType": "workspace",
        "value": id,
    })
}

fn user_result(user: &UserSummary) -> Value {
    let handle_at = user
        .handle
        .as_deref()
        .filter(|value| !value.is_empty())
        .map(|handle| format!("@{handle}"));

    let mut detail_parts: Vec<String> = Vec::new();
    if let Some(email) = user.email.as_deref().filter(|value| !value.is_empty()) {
        detail_parts.push(email.to_owned());
    }
    if let Some(handle_at) = handle_at.clone() {
        detail_parts.push(handle_at);
    }
    detail_parts.push(user.id.clone());

    let label = user
        .display_name
        .as_deref()
        .and_then(|value| clean(Some(value)))
        .map(str::to_owned)
        .or_else(|| {
            user.email
                .as_deref()
                .and_then(|value| clean(Some(value)))
                .map(str::to_owned)
        })
        .or_else(|| handle_at.clone())
        .unwrap_or_else(|| format!("User {}", short_id(&user.id)));

    json!({
        "detail": detail_parts.join(" · "),
        "kind": "user",
        "label": label,
        "subjectKey": format!("user:{}", user.id),
        "subjectType": "user",
        "value": user.id,
    })
}

fn build_ip_results(rows: &[Value], q: Option<&str>, limit: i64) -> Vec<Value> {
    let mut results: Vec<Value> = rows
        .iter()
        .map(|row| {
            let ip = str_field(row, "ip_address").unwrap_or_default();
            let detail = str_field(row, "status")
                .filter(|value| !value.is_empty())
                .map(|status| format!("Blocked IP · {status}"))
                .unwrap_or_else(|| "IP address".to_owned());
            json!({
                "detail": detail,
                "kind": "ip",
                "label": format!("IP {ip}"),
                "subjectKey": format!("ip:{ip}"),
                "subjectType": "ip",
                "value": ip,
            })
        })
        .collect();

    if let Some(q) = q.filter(|q| is_ipv4(q)) {
        let already_present = results
            .iter()
            .any(|row| row.get("value").and_then(Value::as_str) == Some(q));
        if !already_present {
            results.insert(
                0,
                json!({
                    "detail": "Typed IP address",
                    "kind": "ip",
                    "label": format!("IP {q}"),
                    "subjectKey": format!("ip:{q}"),
                    "subjectType": "ip",
                    "value": q,
                }),
            );
        }
    }

    if limit >= 0 {
        results.truncate(limit as usize);
    }
    results
}

async fn fetch_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    params: &[(&str, String)],
) -> Vec<Value> {
    let Some(url) = contact_data.rest_url(table, params) else {
        return Vec::new();
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Vec::new();
    };
    let bearer = format!("Bearer {service_role_key}");

    // Legacy reads with the admin (service-role) client and treats any read
    // failure as `data ?? []`.
    match outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
    {
        Ok(response) if (200..300).contains(&response.status) => {
            response.json::<Vec<Value>>().unwrap_or_default()
        }
        _ => Vec::new(),
    }
}

fn str_field<'a>(value: &'a Value, field: &str) -> Option<&'a str> {
    value.get(field).and_then(Value::as_str)
}

fn owned_string_field(value: &Value, field: &str) -> Option<String> {
    value.get(field).and_then(Value::as_str).map(str::to_owned)
}

/// Mirrors `clean`: trim, then map empty to `None`.
fn clean(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

/// Mirrors `shortId`: values longer than 12 chars are truncated to 8 + ellipsis.
fn short_id(value: &str) -> String {
    if value.chars().count() > 12 {
        let prefix: String = value.chars().take(8).collect();
        format!("{prefix}…")
    } else {
        value.to_owned()
    }
}

fn is_uuid(value: &str) -> bool {
    if value.len() != 36 {
        return false;
    }
    value.chars().enumerate().all(|(index, ch)| match index {
        8 | 13 | 18 | 23 => ch == '-',
        _ => ch.is_ascii_hexdigit(),
    })
}

fn is_ipv4(value: &str) -> bool {
    let octets: Vec<&str> = value.split('.').collect();
    if octets.len() != 4 {
        return false;
    }
    octets.iter().all(|octet| {
        !octet.is_empty()
            && octet.len() <= 3
            && octet.bytes().all(|byte| byte.is_ascii_digit())
            && octet.parse::<u32>().map(|n| n <= 255).unwrap_or(false)
    })
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response() -> BackendResponse {
    message_response(500, ERROR_MESSAGE)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url_with(query: &str) -> String {
        format!("https://backend.test{RATE_LIMIT_SUBJECTS_PATH}?{query}")
    }

    #[test]
    fn parse_query_defaults_to_workspace_limit_eight() {
        let query = parse_search_query(Some(&url_with(""))).unwrap();
        assert_eq!(query.kind, SubjectKind::Workspace);
        assert_eq!(query.limit, 8);
        assert_eq!(query.q, None);
    }

    #[test]
    fn parse_query_reads_each_field() {
        let query = parse_search_query(Some(&url_with("kind=user&limit=12&q=%20alice%20"))).unwrap();
        assert_eq!(query.kind, SubjectKind::User);
        assert_eq!(query.limit, 12);
        assert_eq!(query.q.as_deref(), Some("alice"));
    }

    #[test]
    fn parse_query_kind_ip() {
        let query = parse_search_query(Some(&url_with("kind=ip"))).unwrap();
        assert_eq!(query.kind, SubjectKind::Ip);
    }

    #[test]
    fn parse_query_rejects_unknown_kind() {
        assert!(parse_search_query(Some(&url_with("kind=session"))).is_err());
        assert!(parse_search_query(Some(&url_with("kind="))).is_err());
    }

    #[test]
    fn parse_query_rejects_invalid_limits() {
        assert!(parse_search_query(Some(&url_with("limit=0"))).is_err());
        assert!(parse_search_query(Some(&url_with("limit=-3"))).is_err());
        assert!(parse_search_query(Some(&url_with("limit=26"))).is_err());
        assert!(parse_search_query(Some(&url_with("limit=2.5"))).is_err());
        assert!(parse_search_query(Some(&url_with("limit=abc"))).is_err());
        assert!(parse_search_query(Some(&url_with("limit="))).is_err());
    }

    #[test]
    fn parse_query_accepts_boundary_limit() {
        assert_eq!(parse_search_query(Some(&url_with("limit=25"))).unwrap().limit, 25);
        assert_eq!(parse_search_query(Some(&url_with("limit=1"))).unwrap().limit, 1);
    }

    #[test]
    fn parse_query_blank_q_becomes_none() {
        assert_eq!(parse_search_query(Some(&url_with("q=%20%20"))).unwrap().q, None);
    }

    #[test]
    fn parse_query_rejects_overlong_q() {
        let long = "a".repeat(MAX_SEARCH_LENGTH + 1);
        assert!(parse_search_query(Some(&url_with(&format!("q={long}")))).is_err());
        let max = "a".repeat(MAX_SEARCH_LENGTH);
        assert_eq!(
            parse_search_query(Some(&url_with(&format!("q={max}"))))
                .unwrap()
                .q
                .as_deref(),
            Some(max.as_str())
        );
    }

    #[test]
    fn short_id_truncates_long_values() {
        assert_eq!(short_id("short"), "short");
        assert_eq!(short_id("0123456789abc"), "01234567…");
    }

    #[test]
    fn clean_trims_and_drops_empty() {
        assert_eq!(clean(Some("  x  ")), Some("x"));
        assert_eq!(clean(Some("   ")), None);
        assert_eq!(clean(None), None);
    }

    #[test]
    fn uuid_detection() {
        assert!(is_uuid("123e4567-e89b-12d3-a456-426614174000"));
        assert!(!is_uuid("not-a-uuid"));
        assert!(!is_uuid("123e4567e89b12d3a456426614174000"));
    }

    #[test]
    fn ipv4_detection() {
        assert!(is_ipv4("192.168.0.1"));
        assert!(is_ipv4("255.255.255.255"));
        assert!(!is_ipv4("256.0.0.1"));
        assert!(!is_ipv4("1.2.3"));
        assert!(!is_ipv4("hostname"));
    }

    #[test]
    fn workspace_result_uses_name_and_handle() {
        let row = json!({ "id": "ws-1", "name": "Acme", "handle": "acme" });
        let result = workspace_result(&row);
        assert_eq!(result["label"], "Acme");
        assert_eq!(result["detail"], "@acme · ws-1");
        assert_eq!(result["subjectKey"], "workspace:ws-1");
        assert_eq!(result["subjectType"], "workspace");
        assert_eq!(result["value"], "ws-1");
        assert_eq!(result["kind"], "workspace");
    }

    #[test]
    fn workspace_result_falls_back_without_name_or_handle() {
        let row = json!({ "id": "0123456789abcdef", "name": "", "handle": null });
        let result = workspace_result(&row);
        assert_eq!(result["label"], "Workspace 01234567…");
        assert_eq!(result["detail"], "0123456789abcdef");
    }

    #[test]
    fn user_result_prefers_display_name_then_email_then_handle() {
        let display = UserSummary {
            display_name: Some("Alice".to_owned()),
            email: Some("alice@example.com".to_owned()),
            handle: Some("alice".to_owned()),
            id: "user-1".to_owned(),
        };
        let result = user_result(&display);
        assert_eq!(result["label"], "Alice");
        assert_eq!(result["detail"], "alice@example.com · @alice · user-1");
        assert_eq!(result["subjectKey"], "user:user-1");

        let email_only = UserSummary {
            display_name: None,
            email: Some("bob@example.com".to_owned()),
            handle: None,
            id: "user-2".to_owned(),
        };
        assert_eq!(user_result(&email_only)["label"], "bob@example.com");

        let handle_only = UserSummary {
            display_name: None,
            email: None,
            handle: Some("carol".to_owned()),
            id: "user-3".to_owned(),
        };
        assert_eq!(user_result(&handle_only)["label"], "@carol");

        let bare = UserSummary {
            display_name: None,
            email: None,
            handle: None,
            id: "0123456789abcdef".to_owned(),
        };
        assert_eq!(user_result(&bare)["label"], "User 01234567…");
        assert_eq!(user_result(&bare)["detail"], "0123456789abcdef");
    }

    #[test]
    fn ip_results_map_rows_and_truncate() {
        let rows = vec![
            json!({ "ip_address": "10.0.0.1", "status": "active" }),
            json!({ "ip_address": "10.0.0.2", "status": null }),
        ];
        let results = build_ip_results(&rows, None, 1);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0]["detail"], "Blocked IP · active");
        assert_eq!(results[0]["label"], "IP 10.0.0.1");
        assert_eq!(results[0]["subjectKey"], "ip:10.0.0.1");
    }

    #[test]
    fn ip_results_status_fallback() {
        let rows = vec![json!({ "ip_address": "10.0.0.2", "status": null })];
        let results = build_ip_results(&rows, None, 8);
        assert_eq!(results[0]["detail"], "IP address");
    }

    #[test]
    fn ip_results_unshift_typed_ip_when_absent() {
        let rows = vec![json!({ "ip_address": "10.0.0.1", "status": "active" })];
        let results = build_ip_results(&rows, Some("8.8.8.8"), 8);
        assert_eq!(results.len(), 2);
        assert_eq!(results[0]["value"], "8.8.8.8");
        assert_eq!(results[0]["detail"], "Typed IP address");
        assert_eq!(results[1]["value"], "10.0.0.1");
    }

    #[test]
    fn ip_results_do_not_duplicate_typed_ip() {
        let rows = vec![json!({ "ip_address": "8.8.8.8", "status": "active" })];
        let results = build_ip_results(&rows, Some("8.8.8.8"), 8);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0]["value"], "8.8.8.8");
    }

    #[test]
    fn ip_results_ignore_non_ip_query_for_unshift() {
        let rows = vec![json!({ "ip_address": "10.0.0.1", "status": "active" })];
        let results = build_ip_results(&rows, Some("not-an-ip"), 8);
        assert_eq!(results.len(), 1);
    }
}
