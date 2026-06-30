//! Handler for `GET /api/v1/infrastructure/rate-limits`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/infrastructure/rate-limits/route.ts`.
//!
//! Auth mirrors `authorizeAbuseIntelligenceRequest` (default permission
//! `view_infrastructure` on the root workspace). Status codes:
//!
//! - missing/invalid session token              -> `401 { "message": "Unauthorized" }`
//! - authenticated but lacking the permission   -> `403 { "message": "Forbidden" }`
//! - config / upstream failure                  -> `500 { "message": "..." }`
//!
//! On success the handler reads `abuse_trust_overrides` with the service-role
//! (admin) client (RLS bypassed, matching legacy `createAdminClient`), enriches
//! each row with a resolved `subject` object (workspace name / user display
//! name), applies the optional `q` substring filter, builds a summary, and
//! returns:
//!
//! ```json
//! { "edgeCachedSubjectKeys": [], "rules": [...], "summary": {...}, "writeBaseLimits": {...} }
//! ```
//!
//! BEHAVIOR GAPS vs legacy (intentional, low-risk):
//!
//! - `edgeCachedSubjectKeys` is always `[]`. The legacy value comes from
//!   `readEdgeTrustState` (Redis), which is not accessible in the Rust worker.
//! - `limit` coercion uses strict Rust integer parsing instead of JS
//!   `parseInt` (prefix-stops). Exotic inputs like `"5abc"` return the
//!   fallback (200) rather than 5. Normal integer inputs behave identically.
//! - The `q` length check counts Unicode scalar values rather than UTF-16
//!   code units (only differs for astral-plane characters past the limit).

use std::collections::{HashMap, HashSet};

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    infrastructure_root_auth::ROOT_WORKSPACE_ID,
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const RATE_LIMITS_PATH: &str = "/api/v1/infrastructure/rate-limits";
const VIEW_INFRASTRUCTURE_PERMISSION: &str = "view_infrastructure";
const LOAD_ERROR_MESSAGE: &str = "Failed to load rate-limit rules";
const DEFAULT_LIMIT: i64 = 200;
const MAX_LIMIT: i64 = 500;
const MAX_SEARCH_LENGTH: usize = 500;

/// Subject types accepted by the legacy `subjectType` query param.
const ABUSE_REPUTATION_SUBJECT_TYPES: [&str; 7] = [
    "user",
    "session",
    "api_key",
    "ip",
    "cidr",
    "user_location",
    "workspace",
];

/// Fixed base write limits exposed by the admin UI. Matches the legacy
/// `WRITE_BASE_LIMITS` constant (hardcoded in the route file).
fn write_base_limits() -> Value {
    json!({
        "anonymous":    { "minute": 5,  "hour": 50,  "day": 100  },
        "userIp":       { "minute": 20, "hour": 200, "day": 800  },
        "userBackstop": { "minute": 40, "hour": 400, "day": 1500 },
    })
}

pub(crate) async fn handle_infrastructure_rate_limits_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != RATE_LIMITS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => rate_limits_response(config, request, outbound).await,
        _ => return None,
    })
}

async fn rate_limits_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    match authorize_workspace_permission(
        &config.contact_data,
        request,
        ROOT_WORKSPACE_ID,
        VIEW_INFRASTRUCTURE_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(_) => {}
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return message_response(401, "Unauthorized");
        }
        Err(
            WorkspacePermissionAuthorizationError::Forbidden
            | WorkspacePermissionAuthorizationError::NotFound,
        ) => {
            return message_response(403, "Forbidden");
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, LOAD_ERROR_MESSAGE);
        }
    }

    let query = parse_query(request.url);

    let contact_data = &config.contact_data;
    let Some(service_role_key) = contact_data.service_role_key() else {
        return message_response(500, LOAD_ERROR_MESSAGE);
    };

    let rows = match fetch_rules(contact_data, outbound, service_role_key, &query).await {
        Some(rows) => rows,
        None => return message_response(500, LOAD_ERROR_MESSAGE),
    };

    let enriched = enrich_rules(contact_data, outbound, service_role_key, rows).await;
    let rules = filter_rules(enriched, query.q.as_deref());
    let summary = build_summary(&rules);

    no_store_response(json_response(
        200,
        json!({
            "edgeCachedSubjectKeys": [],
            "rules": rules,
            "summary": summary,
            "writeBaseLimits": write_base_limits(),
        }),
    ))
}

// ---------------------------------------------------------------------------
// Query parsing
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Eq, PartialEq)]
struct RateLimitsQuery {
    limit: i64,
    include_revoked: bool,
    subject_type: Option<String>,
    q: Option<String>,
}

fn parse_query(request_url: Option<&str>) -> RateLimitsQuery {
    let url = request_url.and_then(|u| url::Url::parse(u).ok());
    let qv = |key: &str| {
        url.as_ref().and_then(|url| {
            url.query_pairs()
                .find_map(|(k, v)| (k == key).then(|| v.into_owned()))
        })
    };

    let limit = parse_limit(qv("limit").as_deref());
    let include_revoked = qv("includeRevoked").as_deref() == Some("true");
    let subject_type =
        qv("subjectType").filter(|s| ABUSE_REPUTATION_SUBJECT_TYPES.contains(&s.as_str()));
    let q = qv("q")
        .map(|v| v.trim().to_owned())
        .filter(|v| !v.is_empty() && v.chars().count() <= MAX_SEARCH_LENGTH);

    RateLimitsQuery {
        limit,
        include_revoked,
        subject_type,
        q,
    }
}

/// Mirrors `parsePositiveInt(raw, 200, 500)` from the legacy route.
/// Returns `DEFAULT_LIMIT` for absent, non-integer, or out-of-range inputs.
fn parse_limit(raw: Option<&str>) -> i64 {
    let Some(raw) = raw else {
        return DEFAULT_LIMIT;
    };
    match raw.trim().parse::<i64>() {
        Ok(n) if n >= 1 => n.min(MAX_LIMIT),
        _ => DEFAULT_LIMIT,
    }
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

async fn fetch_rules(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    service_role_key: &str,
    query: &RateLimitsQuery,
) -> Option<Vec<Value>> {
    let mut params = vec![
        ("select", "*".to_owned()),
        ("order", "created_at.desc".to_owned()),
        ("limit", query.limit.to_string()),
    ];
    if !query.include_revoked {
        params.push(("revoked_at", "is.null".to_owned()));
    }
    if let Some(ref st) = query.subject_type {
        params.push(("subject_type", format!("eq.{st}")));
    }

    let url = contact_data.rest_url("abuse_trust_overrides", &params)?;
    let response = service_role_get(outbound, &url, service_role_key)
        .await
        .ok()?;
    if !(200..300).contains(&response.status) {
        return None;
    }
    response.json::<Vec<Value>>().ok()
}

async fn service_role_get(
    outbound: &impl OutboundHttpClient,
    url: &str,
    service_role_key: &str,
) -> Result<crate::outbound::OutboundResponse, ()> {
    let bearer = format!("Bearer {service_role_key}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

async fn fetch_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    service_role_key: &str,
    table: &str,
    params: &[(&str, String)],
) -> Vec<Value> {
    let Some(url) = contact_data.rest_url(table, params) else {
        return Vec::new();
    };
    match service_role_get(outbound, &url, service_role_key).await {
        Ok(resp) if (200..300).contains(&resp.status) => {
            resp.json::<Vec<Value>>().unwrap_or_default()
        }
        _ => Vec::new(),
    }
}

// ---------------------------------------------------------------------------
// Subject enrichment (ports enrichRateLimitRules / resolveRateLimitSubjects)
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
struct ParsedSubject {
    id: Option<String>,
    ip: Option<String>,
    kind: String,
    subject_key: String,
    user_id: Option<String>,
    workspace_id: Option<String>,
}

/// Parses a `subject_key` / `subject_type` pair into structured fields.
/// Mirrors `parseRateLimitSubjectKey` from `subject-resolution.ts`.
fn parse_subject_key(key: &str, subject_type: Option<&str>) -> ParsedSubject {
    let key = key.trim();

    if let Some(rest) = key.strip_prefix("workspace:") {
        let id = non_empty(rest.to_lowercase());
        let workspace_id = id.as_deref().filter(|v| is_uuid(v)).map(str::to_owned);
        return ParsedSubject {
            id,
            ip: None,
            kind: "workspace".to_owned(),
            subject_key: key.to_owned(),
            user_id: None,
            workspace_id,
        };
    }

    for prefix in &["user-location:", "user-ip:"] {
        if let Some(rest) = key.strip_prefix(prefix) {
            let (user_part, ip_part) = split_first(rest, ':');
            let user_part = user_part.to_lowercase();
            let user_id = is_uuid(&user_part).then(|| user_part.clone());
            return ParsedSubject {
                id: non_empty(user_part),
                ip: non_empty(ip_part.to_owned()),
                kind: "user_location".to_owned(),
                subject_key: key.to_owned(),
                user_id,
                workspace_id: None,
            };
        }
    }

    if let Some(rest) = key.strip_prefix("user:") {
        let id_str = rest.to_lowercase();
        let user_id = is_uuid(&id_str).then(|| id_str.clone());
        return ParsedSubject {
            id: non_empty(id_str),
            ip: None,
            kind: "user".to_owned(),
            subject_key: key.to_owned(),
            user_id,
            workspace_id: None,
        };
    }

    if let Some(rest) = key.strip_prefix("anonymous-role-ip:") {
        let (_, ip_part) = split_first(rest, ':');
        return ParsedSubject {
            id: non_empty(ip_part.to_owned()),
            ip: non_empty(ip_part.to_owned()),
            kind: "ip".to_owned(),
            subject_key: key.to_owned(),
            user_id: None,
            workspace_id: None,
        };
    }

    if let Some(rest) = key.strip_prefix("ip:") {
        let ip = non_empty(rest.to_owned());
        return ParsedSubject {
            id: ip.clone(),
            ip,
            kind: "ip".to_owned(),
            subject_key: key.to_owned(),
            user_id: None,
            workspace_id: None,
        };
    }

    if let Some(rest) = key.strip_prefix("cidr:") {
        return ParsedSubject {
            id: non_empty(rest.to_owned()),
            ip: None,
            kind: "cidr".to_owned(),
            subject_key: key.to_owned(),
            user_id: None,
            workspace_id: None,
        };
    }

    if let Some(rest) = key.strip_prefix("session:") {
        return ParsedSubject {
            id: non_empty(rest.to_owned()),
            ip: None,
            kind: "session".to_owned(),
            subject_key: key.to_owned(),
            user_id: None,
            workspace_id: None,
        };
    }

    if let Some(rest) = key.strip_prefix("api-key:") {
        return ParsedSubject {
            id: non_empty(rest.to_owned()),
            ip: None,
            kind: "api_key".to_owned(),
            subject_key: key.to_owned(),
            user_id: None,
            workspace_id: None,
        };
    }

    // Type-prefix fallback (user_location -> "user-location:", etc.)
    let type_prefix = subject_type.map(|t| {
        if t == "user_location" {
            "user-location"
        } else {
            t
        }
    });
    if let Some(pfx) = type_prefix
        && let Some(rest) = key.strip_prefix(&format!("{pfx}:"))
    {
        return ParsedSubject {
            id: non_empty(rest.to_owned()),
            ip: None,
            kind: subject_type.unwrap_or("unknown").to_owned(),
            subject_key: key.to_owned(),
            user_id: None,
            workspace_id: None,
        };
    }

    ParsedSubject {
        id: None,
        ip: None,
        kind: "unknown".to_owned(),
        subject_key: key.to_owned(),
        user_id: None,
        workspace_id: None,
    }
}

fn build_subject_resolution(
    parsed: &ParsedSubject,
    workspaces: &HashMap<String, Value>,
    users: &HashMap<String, Value>,
    user_emails: &HashMap<String, String>,
) -> Value {
    // Workspace resolution.
    if let Some(ws_id) = &parsed.workspace_id
        && let Some(ws) = workspaces.get(ws_id)
    {
        let handle = ws
            .get("handle")
            .and_then(Value::as_str)
            .filter(|v| !v.is_empty());
        let name = ws
            .get("name")
            .and_then(Value::as_str)
            .filter(|v| !v.is_empty());
        let label = name
            .map(str::to_owned)
            .unwrap_or_else(|| format!("Workspace {}", short_id(ws_id)));
        let detail = handle
            .map(|h| format!("@{h} · {ws_id}"))
            .unwrap_or_else(|| ws_id.clone());
        return json!({
            "confidence": "verified",
            "detail": detail,
            "id": parsed.id,
            "ip": Value::Null,
            "kind": parsed.kind,
            "label": label,
            "subjectKey": parsed.subject_key,
            "technicalKey": parsed.subject_key,
            "userId": Value::Null,
            "verified": true,
            "workspaceId": ws_id,
        });
    }

    // User resolution.
    if let Some(user_id) = &parsed.user_id
        && let Some(user) = users.get(user_id)
    {
        let display_name = user
            .get("displayName")
            .and_then(Value::as_str)
            .filter(|v| !v.is_empty());
        let email = user_emails
            .get(user_id)
            .map(String::as_str)
            .filter(|v| !v.is_empty());
        let handle = user
            .get("handle")
            .and_then(Value::as_str)
            .filter(|v| !v.is_empty());
        let base_label = display_name
            .map(str::to_owned)
            .or_else(|| email.map(str::to_owned))
            .or_else(|| handle.map(|h| format!("@{h}")))
            .unwrap_or_else(|| format!("User {}", short_id(user_id)));
        let label = if let Some(ip) = &parsed.ip {
            format!("{base_label} from {ip}")
        } else {
            base_label
        };
        let mut detail_parts: Vec<String> = Vec::new();
        if let Some(e) = email {
            detail_parts.push(e.to_owned());
        }
        if let Some(h) = handle {
            detail_parts.push(format!("@{h}"));
        }
        detail_parts.push(user_id.clone());
        let detail = detail_parts.join(" · ");
        return json!({
            "confidence": "verified",
            "detail": detail,
            "id": parsed.id,
            "ip": parsed.ip,
            "kind": parsed.kind,
            "label": label,
            "subjectKey": parsed.subject_key,
            "technicalKey": parsed.subject_key,
            "userId": user_id,
            "verified": true,
            "workspaceId": Value::Null,
        });
    }

    // Unresolved fallbacks by kind.
    let (label, detail, confidence) = match parsed.kind.as_str() {
        "ip" => {
            let ip = parsed.ip.as_deref().unwrap_or("");
            (format!("IP {ip}"), "Network address".to_owned(), "parsed")
        }
        "cidr" => {
            let id = parsed.id.as_deref().unwrap_or("");
            (format!("CIDR {id}"), "Network range".to_owned(), "parsed")
        }
        "session" => {
            let id = parsed.id.as_deref().unwrap_or("");
            (format!("Session {}", short_id(id)), id.to_owned(), "parsed")
        }
        "api_key" => {
            let id = parsed.id.as_deref().unwrap_or("");
            (format!("API key {}", short_id(id)), id.to_owned(), "parsed")
        }
        "workspace" => {
            let ws_id = parsed
                .workspace_id
                .as_deref()
                .unwrap_or(parsed.id.as_deref().unwrap_or(""));
            (
                format!("Workspace {}", short_id(ws_id)),
                ws_id.to_owned(),
                "parsed",
            )
        }
        "user" | "user_location" => {
            let uid = parsed
                .user_id
                .as_deref()
                .unwrap_or(parsed.id.as_deref().unwrap_or(""));
            let label = if let Some(ip) = &parsed.ip {
                format!("User {} from {ip}", short_id(uid))
            } else {
                format!("User {}", short_id(uid))
            };
            (label, uid.to_owned(), "parsed")
        }
        _ => (
            "Unknown subject".to_owned(),
            parsed.subject_key.clone(),
            "unknown",
        ),
    };

    json!({
        "confidence": confidence,
        "detail": detail,
        "id": parsed.id,
        "ip": parsed.ip,
        "kind": parsed.kind,
        "label": label,
        "subjectKey": parsed.subject_key,
        "technicalKey": parsed.subject_key,
        "userId": parsed.user_id,
        "verified": false,
        "workspaceId": parsed.workspace_id,
    })
}

async fn enrich_rules(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    service_role_key: &str,
    rules: Vec<Value>,
) -> Vec<Value> {
    let parsed: Vec<ParsedSubject> = rules
        .iter()
        .map(|r| {
            let key = r.get("subject_key").and_then(Value::as_str).unwrap_or("");
            let st = r.get("subject_type").and_then(Value::as_str);
            parse_subject_key(key, st)
        })
        .collect();

    // Collect unique workspace/user IDs for batch loading.
    let mut ws_ids: Vec<String> = Vec::new();
    let mut user_ids: Vec<String> = Vec::new();
    {
        let mut seen_ws: HashSet<String> = HashSet::new();
        let mut seen_user: HashSet<String> = HashSet::new();
        for p in &parsed {
            if let Some(ws) = &p.workspace_id
                && seen_ws.insert(ws.clone())
            {
                ws_ids.push(ws.clone());
            }
            if let Some(uid) = &p.user_id
                && seen_user.insert(uid.clone())
            {
                user_ids.push(uid.clone());
            }
        }
    }

    let workspaces = load_workspace_map(contact_data, outbound, service_role_key, &ws_ids).await;
    let (users, user_emails) =
        load_user_map(contact_data, outbound, service_role_key, &user_ids).await;

    rules
        .into_iter()
        .zip(parsed.iter())
        .map(|(mut rule, parsed)| {
            let subject = build_subject_resolution(parsed, &workspaces, &users, &user_emails);
            if let Some(obj) = rule.as_object_mut() {
                obj.insert("subject".to_owned(), subject);
            }
            rule
        })
        .collect()
}

async fn load_workspace_map(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    service_role_key: &str,
    ids: &[String],
) -> HashMap<String, Value> {
    if ids.is_empty() {
        return HashMap::new();
    }
    let params = [
        ("select", "id,name,handle,avatar_url,personal".to_owned()),
        ("id", format!("in.({})", ids.join(","))),
    ];
    fetch_rows(
        contact_data,
        outbound,
        service_role_key,
        "workspaces",
        &params,
    )
    .await
    .into_iter()
    .filter_map(|row| {
        let id = row.get("id")?.as_str()?.to_owned();
        Some((id, row))
    })
    .collect()
}

/// Returns (display-fields map, email map) keyed by user_id.
async fn load_user_map(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    service_role_key: &str,
    ids: &[String],
) -> (HashMap<String, Value>, HashMap<String, String>) {
    if ids.is_empty() {
        return (HashMap::new(), HashMap::new());
    }
    let filter = format!("in.({})", ids.join(","));
    let user_params = [
        ("select", "id,display_name,handle,avatar_url".to_owned()),
        ("id", filter.clone()),
    ];
    let private_params = [
        ("select", "user_id,email,full_name".to_owned()),
        ("user_id", filter),
    ];
    let user_rows = fetch_rows(
        contact_data,
        outbound,
        service_role_key,
        "users",
        &user_params,
    )
    .await;
    let private_rows = fetch_rows(
        contact_data,
        outbound,
        service_role_key,
        "user_private_details",
        &private_params,
    )
    .await;

    let mut email_by_id: HashMap<String, String> = HashMap::new();
    let mut full_name_by_id: HashMap<String, String> = HashMap::new();
    for row in &private_rows {
        if let Some(uid) = row.get("user_id").and_then(Value::as_str) {
            if let Some(email) = row.get("email").and_then(Value::as_str)
                && !email.is_empty()
            {
                email_by_id.insert(uid.to_owned(), email.to_owned());
            }
            if let Some(name) = row.get("full_name").and_then(Value::as_str)
                && !name.is_empty()
            {
                full_name_by_id.insert(uid.to_owned(), name.to_owned());
            }
        }
    }

    let users: HashMap<String, Value> = user_rows
        .into_iter()
        .filter_map(|row| {
            let id = row.get("id")?.as_str()?.to_owned();
            let display_name = row
                .get("display_name")
                .and_then(Value::as_str)
                .filter(|v| !v.is_empty())
                .map(str::to_owned)
                .or_else(|| full_name_by_id.get(&id).cloned());
            let handle = row
                .get("handle")
                .and_then(Value::as_str)
                .filter(|v| !v.is_empty())
                .map(str::to_owned);
            let summary = json!({
                "displayName": display_name.map(Value::String).unwrap_or(Value::Null),
                "handle": handle.map(Value::String).unwrap_or(Value::Null),
                "id": id.clone(),
            });
            Some((id, summary))
        })
        .collect();

    (users, email_by_id)
}

// ---------------------------------------------------------------------------
// Search filter
// ---------------------------------------------------------------------------

fn filter_rules(rules: Vec<Value>, q: Option<&str>) -> Vec<Value> {
    let Some(q) = q else {
        return rules;
    };
    let needle = q.to_lowercase();

    rules
        .into_iter()
        .filter(|rule| {
            let fields: &[Option<&str>] = &[
                rule.get("subject_key").and_then(Value::as_str),
                rule.get("reason").and_then(Value::as_str),
                rule.pointer("/subject/label").and_then(Value::as_str),
                rule.pointer("/subject/detail").and_then(Value::as_str),
                rule.pointer("/subject/ip").and_then(Value::as_str),
                rule.pointer("/subject/userId").and_then(Value::as_str),
                rule.pointer("/subject/workspaceId").and_then(Value::as_str),
            ];
            fields
                .iter()
                .filter_map(|f| f.filter(|v| !v.is_empty()))
                .any(|v| v.to_lowercase().contains(&needle))
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

fn build_summary(rules: &[Value]) -> Value {
    let mut by_mode: serde_json::Map<String, Value> = serde_json::Map::new();
    let mut by_subject_type: serde_json::Map<String, Value> = serde_json::Map::new();

    for rule in rules {
        if let Some(mode) = rule.get("limit_mode").and_then(Value::as_str) {
            let entry = by_mode.entry(mode.to_owned()).or_insert(json!(0));
            if let Some(n) = entry.as_i64() {
                *entry = json!(n + 1);
            }
        }
        if let Some(st) = rule.get("subject_type").and_then(Value::as_str) {
            let entry = by_subject_type.entry(st.to_owned()).or_insert(json!(0));
            if let Some(n) = entry.as_i64() {
                *entry = json!(n + 1);
            }
        }
    }

    let blocked_count = by_mode.get("blocked").and_then(Value::as_i64).unwrap_or(0);
    let unlimited_count = by_mode
        .get("unlimited")
        .and_then(Value::as_i64)
        .unwrap_or(0);

    json!({
        "blockedCount": blocked_count,
        "byMode": by_mode,
        "bySubjectType": by_subject_type,
        "total": rules.len(),
        "unlimitedCount": unlimited_count,
    })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn split_first(s: &str, sep: char) -> (&str, &str) {
    match s.find(sep) {
        Some(pos) => (&s[..pos], &s[pos + sep.len_utf8()..]),
        None => (s, ""),
    }
}

fn non_empty(s: String) -> Option<String> {
    if s.is_empty() { None } else { Some(s) }
}

fn is_uuid(value: &str) -> bool {
    if value.len() != 36 {
        return false;
    }
    value.chars().enumerate().all(|(i, c)| match i {
        8 | 13 | 18 | 23 => c == '-',
        _ => c.is_ascii_hexdigit(),
    })
}

fn short_id(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    if chars.len() > 12 {
        format!("{}…", chars[..8].iter().collect::<String>())
    } else {
        value.to_owned()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_exact_match() {
        assert_eq!(RATE_LIMITS_PATH, "/api/v1/infrastructure/rate-limits");
    }

    #[test]
    fn parse_limit_defaults_and_clamps() {
        assert_eq!(parse_limit(None), 200);
        assert_eq!(parse_limit(Some("1")), 1);
        assert_eq!(parse_limit(Some("500")), 500);
        assert_eq!(parse_limit(Some("501")), 500);
        assert_eq!(parse_limit(Some("0")), 200);
        assert_eq!(parse_limit(Some("-1")), 200);
        assert_eq!(parse_limit(Some("abc")), 200);
        assert_eq!(parse_limit(Some("")), 200);
        assert_eq!(parse_limit(Some("50")), 50);
    }

    #[test]
    fn parse_query_defaults_when_no_url() {
        let q = parse_query(None);
        assert_eq!(q.limit, 200);
        assert!(!q.include_revoked);
        assert_eq!(q.subject_type, None);
        assert_eq!(q.q, None);
    }

    #[test]
    fn parse_query_reads_all_params() {
        let q = parse_query(Some(
            "https://backend.test/api/v1/infrastructure/rate-limits\
             ?limit=50&includeRevoked=true&subjectType=ip&q=test",
        ));
        assert_eq!(q.limit, 50);
        assert!(q.include_revoked);
        assert_eq!(q.subject_type.as_deref(), Some("ip"));
        assert_eq!(q.q.as_deref(), Some("test"));
    }

    #[test]
    fn parse_query_rejects_unknown_subject_type() {
        let q = parse_query(Some(
            "https://backend.test/api/v1/infrastructure/rate-limits?subjectType=nope",
        ));
        assert_eq!(q.subject_type, None);
    }

    #[test]
    fn parse_query_trims_q_and_drops_empty() {
        let q = parse_query(Some(
            "https://backend.test/api/v1/infrastructure/rate-limits?q=%20%20",
        ));
        assert_eq!(q.q, None);
    }

    #[test]
    fn parse_subject_key_workspace() {
        let p = parse_subject_key("workspace:123e4567-e89b-12d3-a456-426614174000", None);
        assert_eq!(p.kind, "workspace");
        assert_eq!(
            p.workspace_id.as_deref(),
            Some("123e4567-e89b-12d3-a456-426614174000")
        );
        assert_eq!(p.user_id, None);
        assert_eq!(p.ip, None);
    }

    #[test]
    fn parse_subject_key_user() {
        let p = parse_subject_key("user:123e4567-e89b-12d3-a456-426614174001", None);
        assert_eq!(p.kind, "user");
        assert_eq!(
            p.user_id.as_deref(),
            Some("123e4567-e89b-12d3-a456-426614174001")
        );
        assert_eq!(p.workspace_id, None);
    }

    #[test]
    fn parse_subject_key_ip() {
        let p = parse_subject_key("ip:1.2.3.4", None);
        assert_eq!(p.kind, "ip");
        assert_eq!(p.ip.as_deref(), Some("1.2.3.4"));
    }

    #[test]
    fn parse_subject_key_user_location() {
        let p = parse_subject_key(
            "user-location:123e4567-e89b-12d3-a456-426614174002:10.0.0.1",
            None,
        );
        assert_eq!(p.kind, "user_location");
        assert_eq!(
            p.user_id.as_deref(),
            Some("123e4567-e89b-12d3-a456-426614174002")
        );
        assert_eq!(p.ip.as_deref(), Some("10.0.0.1"));
    }

    #[test]
    fn parse_subject_key_session_and_cidr() {
        let s = parse_subject_key("session:abc123", None);
        assert_eq!(s.kind, "session");
        assert_eq!(s.id.as_deref(), Some("abc123"));

        let c = parse_subject_key("cidr:10.0.0.0/8", None);
        assert_eq!(c.kind, "cidr");
        assert_eq!(c.id.as_deref(), Some("10.0.0.0/8"));
    }

    #[test]
    fn parse_subject_key_unknown() {
        let p = parse_subject_key("something-weird", None);
        assert_eq!(p.kind, "unknown");
    }

    #[test]
    fn is_uuid_validates_correctly() {
        assert!(is_uuid("123e4567-e89b-12d3-a456-426614174000"));
        assert!(!is_uuid("not-a-uuid"));
        assert!(!is_uuid(""));
    }

    #[test]
    fn short_id_truncates_at_twelve() {
        assert_eq!(short_id("short"), "short");
        assert_eq!(short_id("0123456789abc"), "01234567…");
    }

    #[test]
    fn build_summary_counts_by_mode_and_subject_type() {
        let rules = vec![
            json!({ "limit_mode": "blocked", "subject_type": "ip" }),
            json!({ "limit_mode": "blocked", "subject_type": "ip" }),
            json!({ "limit_mode": "unlimited", "subject_type": "workspace" }),
            json!({ "limit_mode": "inherit_multiplier", "subject_type": "user" }),
        ];
        let summary = build_summary(&rules);
        assert_eq!(summary["total"], 4);
        assert_eq!(summary["blockedCount"], 2);
        assert_eq!(summary["unlimitedCount"], 1);
        assert_eq!(summary["byMode"]["blocked"], 2);
        assert_eq!(summary["bySubjectType"]["ip"], 2);
        assert_eq!(summary["bySubjectType"]["workspace"], 1);
    }

    #[test]
    fn filter_rules_no_q_returns_all() {
        let rules = vec![json!({ "subject_key": "ip:1.2.3.4" })];
        assert_eq!(filter_rules(rules.clone(), None).len(), 1);
    }

    #[test]
    fn filter_rules_matches_case_insensitively() {
        let rules = vec![
            json!({
                "subject_key": "ip:1.2.3.4",
                "reason": "Suspicious traffic",
                "subject": { "label": "IP 1.2.3.4", "detail": "Network address",
                             "ip": "1.2.3.4", "userId": null, "workspaceId": null }
            }),
            json!({
                "subject_key": "workspace:ws-1",
                "reason": "Trusted partner",
                "subject": { "label": "Acme Corp", "detail": "@acme · ws-1",
                             "ip": null, "userId": null, "workspaceId": "ws-1" }
            }),
        ];
        let matched = filter_rules(rules, Some("acme"));
        assert_eq!(matched.len(), 1);
        assert_eq!(matched[0]["subject_key"], "workspace:ws-1");
    }

    #[test]
    fn write_base_limits_has_correct_shape() {
        let limits = write_base_limits();
        assert_eq!(limits["anonymous"]["minute"], 5);
        assert_eq!(limits["userIp"]["hour"], 200);
        assert_eq!(limits["userBackstop"]["day"], 1500);
    }
}
