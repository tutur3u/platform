//! Handler for `GET /api/v1/workspaces/:wsId/workforce/users`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/workforce/users/route.ts`
//! (GET only; POST returns `None` so the worker falls through to Next.js).
//!
//! Auth: session-only (`workspace_permission_check`), requires `view_workforce`
//! OR `manage_workforce`. Status codes:
//!
//! - 401 `{ "error": "Unauthorized" }` — missing/invalid session
//! - 404 `{ "error": "Not found" }` — unresolved workspace
//! - 403 `{ "error": "Forbidden" }` — member lacks both permissions
//! - 400 `{ "error": "Invalid query parameters" }` — bad query params
//! - 500 `{ "error": "..." }` — upstream or config failure
//!
//! Query params (mirroring Zod schema): `q` (max 255, default `""`),
//! `page` (int ≥ 1, default 1), `pageSize` (int in \[1,255\], default 20),
//! `status` (one of `active|on_leave|terminated|rehired|all`, default `"all"`).
//!
//! Reads `workspace_users` with embedded `workforce_contracts` using the
//! service-role key and `Prefer: count=exact`. The `status` filter is applied
//! in-memory after fetch (legacy behavior); the returned `count` reflects the
//! DB total before status filtering. Each user is enriched with
//! `current_contract` and `contracts_count`.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/workforce/users";

const VIEW_WORKFORCE: &str = "view_workforce";
const MANAGE_WORKFORCE: &str = "manage_workforce";

const SELECT_FIELDS: &str = "*,workforce_contracts(id,contract_type,employment_status,job_title,department,start_date,end_date,created_at)";
const ORDER: &str = "full_name.asc.nullslast";

const DEFAULT_PAGE: u32 = 1;
const DEFAULT_PAGE_SIZE: u32 = 20;
const MAX_PAGE_SIZE: u32 = 255;
const MAX_SEARCH_LENGTH: usize = 255;

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_workforce_users_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = workforce_users_ws_id(request.path)?;

    Some(match request.method {
        "GET" => workforce_users_get(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn workforce_users_get(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let ws_id =
        match authorize_view_or_manage(&config.contact_data, request, raw_ws_id, outbound).await {
            Ok(id) => id,
            Err(resp) => return resp,
        };

    let query = match WorkforceQuery::from_url(request.url) {
        Ok(q) => q,
        Err(()) => {
            return no_store_response(json_response(
                400,
                json!({ "error": "Invalid query parameters" }),
            ));
        }
    };

    match fetch_workforce_users(&config.contact_data, outbound, &ws_id, &query).await {
        Ok((db_count, rows)) => {
            let enriched = enrich_and_filter(rows, &query.status);
            no_store_response(json_response(
                200,
                json!({
                    "data": enriched,
                    "count": db_count,
                    "page": query.page,
                    "pageSize": query.page_size,
                }),
            ))
        }
        Err(()) => no_store_response(json_response(
            500,
            json!({ "error": "Failed to fetch workforce users" }),
        )),
    }
}

// ---------------------------------------------------------------------------
// Auth: view_workforce OR manage_workforce
// ---------------------------------------------------------------------------

async fn authorize_view_or_manage(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<String, BackendResponse> {
    match authorize_workspace_permission(contact_data, request, raw_ws_id, VIEW_WORKFORCE, outbound)
        .await
    {
        Ok(auth) => Ok(auth.ws_id),
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            match authorize_workspace_permission(
                contact_data,
                request,
                raw_ws_id,
                MANAGE_WORKFORCE,
                outbound,
            )
            .await
            {
                Ok(auth) => Ok(auth.ws_id),
                Err(err) => Err(map_auth_error(err)),
            }
        }
        Err(err) => Err(map_auth_error(err)),
    }
}

fn map_auth_error(err: WorkspacePermissionAuthorizationError) -> BackendResponse {
    let (status, message) = match err {
        WorkspacePermissionAuthorizationError::Unauthorized => (401, "Unauthorized"),
        WorkspacePermissionAuthorizationError::NotFound => (404, "Not found"),
        WorkspacePermissionAuthorizationError::Forbidden => (403, "Forbidden"),
        WorkspacePermissionAuthorizationError::Internal => (500, "Internal server error"),
    };
    no_store_response(json_response(status, json!({ "error": message })))
}

// ---------------------------------------------------------------------------
// Query param parsing
// ---------------------------------------------------------------------------

struct WorkforceQuery {
    q: String,
    page: u32,
    page_size: u32,
    status: String,
}

impl WorkforceQuery {
    fn from_url(request_url: Option<&str>) -> Result<Self, ()> {
        let mut q_raw: Option<String> = None;
        let mut page_raw: Option<String> = None;
        let mut page_size_raw: Option<String> = None;
        let mut status_raw: Option<String> = None;

        if let Some(url) = request_url.and_then(|u| url::Url::parse(u).ok()) {
            for (key, value) in url.query_pairs() {
                match key.as_ref() {
                    "q" if q_raw.is_none() => q_raw = Some(value.into_owned()),
                    "page" if page_raw.is_none() => page_raw = Some(value.into_owned()),
                    "pageSize" if page_size_raw.is_none() => {
                        page_size_raw = Some(value.into_owned())
                    }
                    "status" if status_raw.is_none() => status_raw = Some(value.into_owned()),
                    _ => {}
                }
            }
        }

        let q = q_raw.unwrap_or_default();
        if q.len() > MAX_SEARCH_LENGTH {
            return Err(());
        }

        let page = parse_int_ge1(page_raw.as_deref())?.unwrap_or(DEFAULT_PAGE);
        let page_size = parse_int_range(page_size_raw.as_deref(), 1, MAX_PAGE_SIZE)?
            .unwrap_or(DEFAULT_PAGE_SIZE);

        let status = status_raw.unwrap_or_else(|| "all".to_owned());
        match status.as_str() {
            "active" | "on_leave" | "terminated" | "rehired" | "all" => {}
            _ => return Err(()),
        }

        Ok(Self {
            q,
            page,
            page_size,
            status,
        })
    }
}

/// Parses an optional int >= 1. `None` input -> Ok(None). Invalid -> Err.
fn parse_int_ge1(s: Option<&str>) -> Result<Option<u32>, ()> {
    let Some(s) = s else { return Ok(None) };
    let n: i64 = s.parse().map_err(|_| ())?;
    if n < 1 {
        return Err(());
    }
    Ok(Some(n as u32))
}

/// Parses an optional int in [min, max]. `None` -> Ok(None). Out of range -> Err.
fn parse_int_range(s: Option<&str>, min: u32, max: u32) -> Result<Option<u32>, ()> {
    let Some(s) = s else { return Ok(None) };
    let n: i64 = s.parse().map_err(|_| ())?;
    if n < min as i64 || n > max as i64 {
        return Err(());
    }
    Ok(Some(n as u32))
}

// ---------------------------------------------------------------------------
// Supabase fetch
// ---------------------------------------------------------------------------

async fn fetch_workforce_users(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &WorkforceQuery,
) -> Result<(i64, Vec<Value>), ()> {
    if !contact_data.configured() {
        return Err(());
    }

    let mut params: Vec<(&str, String)> = vec![
        ("select", SELECT_FIELDS.to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", ORDER.to_owned()),
    ];
    if !query.q.is_empty() {
        params.push((
            "or",
            format!("(full_name.ilike.%{}%,email.ilike.%{}%)", query.q, query.q),
        ));
    }

    let url = contact_data
        .rest_url("workspace_users", &params)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let start = (query.page - 1) * query.page_size;
    let end = start + query.page_size - 1;
    let range = format!("{start}-{end}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key)
                .with_header("Prefer", "count=exact")
                .with_header("Range-Unit", "items")
                .with_header("Range", &range),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let count = content_range_total(response.header("content-range")).unwrap_or(0);
    let data = response.json::<Vec<Value>>().map_err(|_| ())?;
    Ok((count, data))
}

fn content_range_total(header: Option<&str>) -> Option<i64> {
    let total = header?.split('/').nth(1)?.trim();
    if total == "*" {
        return None;
    }
    total.parse::<i64>().ok()
}

// ---------------------------------------------------------------------------
// In-memory filter and enrichment
// ---------------------------------------------------------------------------

fn enrich_and_filter(rows: Vec<Value>, status: &str) -> Vec<Value> {
    rows.into_iter()
        .filter(|user| {
            if status == "all" {
                return true;
            }
            let contracts = contracts_of(user);
            contracts.iter().any(|c| {
                c.get("employment_status")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    == status
                    && contract_is_active(c)
            })
        })
        .map(|mut user| {
            let contracts = contracts_of(&user);
            let contracts_count = contracts.len() as i64;
            let current_contract = contracts
                .iter()
                .find(|c| contract_is_active(c))
                .cloned()
                .or_else(|| contracts.into_iter().next())
                .unwrap_or(Value::Null);

            if let Value::Object(ref mut map) = user {
                map.insert("current_contract".to_owned(), current_contract);
                map.insert(
                    "contracts_count".to_owned(),
                    Value::Number(contracts_count.into()),
                );
            }
            user
        })
        .collect()
}

fn contracts_of(user: &Value) -> Vec<Value> {
    user.get("workforce_contracts")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

/// A contract is "active" if it has no `end_date` or its `end_date` is today
/// or in the future (lexicographic ISO-8601 comparison).
fn contract_is_active(c: &Value) -> bool {
    match c.get("end_date").and_then(Value::as_str) {
        None => true,
        Some("") => true,
        Some(d) => d >= today_utc_date().as_str(),
    }
}

/// Returns today's UTC date as `"YYYY-MM-DD"` without external crate deps.
fn today_utc_date() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    days_to_date_string(secs / 86400)
}

/// Converts a count of days since Unix epoch to `"YYYY-MM-DD"` (UTC).
///
/// Uses the Gregorian calendar algorithm from Howard Hinnant
/// (<https://howardhinnant.github.io/date_algorithms.html>).
fn days_to_date_string(days_since_epoch: u64) -> String {
    let z = days_since_epoch as i64 + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}")
}

// ---------------------------------------------------------------------------
// Path extraction
// ---------------------------------------------------------------------------

fn workforce_users_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ws_id_matches_canonical_path() {
        assert_eq!(
            workforce_users_ws_id(
                "/api/v1/workspaces/11111111-1111-4111-8111-111111111111/workforce/users"
            ),
            Some("11111111-1111-4111-8111-111111111111")
        );
        assert_eq!(
            workforce_users_ws_id("/api/v1/workspaces/personal/workforce/users"),
            Some("personal")
        );
    }

    #[test]
    fn ws_id_rejects_non_matching_paths() {
        assert_eq!(
            workforce_users_ws_id("/api/v1/workspaces/ws-1/workforce/users/extra"),
            None
        );
        assert_eq!(
            workforce_users_ws_id("/api/workspaces/ws-1/workforce/users"),
            None
        );
        assert_eq!(
            workforce_users_ws_id("/api/v1/workspaces//workforce/users"),
            None
        );
        assert_eq!(
            workforce_users_ws_id("/api/v1/workspaces/a/b/workforce/users"),
            None
        );
    }

    #[test]
    fn content_range_parses_total() {
        assert_eq!(content_range_total(Some("0-19/42")), Some(42));
        assert_eq!(content_range_total(Some("*/0")), Some(0));
        assert_eq!(content_range_total(Some("0-19/*")), None);
        assert_eq!(content_range_total(None), None);
    }

    #[test]
    fn days_to_date_epoch_zero() {
        assert_eq!(days_to_date_string(0), "1970-01-01");
    }

    #[test]
    fn days_to_date_known_date() {
        // 2024-01-15 = 19737 days since epoch
        assert_eq!(days_to_date_string(1_705_276_800 / 86400), "2024-01-15");
    }

    #[test]
    fn query_defaults_when_no_params() {
        let q = WorkforceQuery::from_url(Some("https://example.com/api/path")).unwrap();
        assert_eq!(q.q, "");
        assert_eq!(q.page, DEFAULT_PAGE);
        assert_eq!(q.page_size, DEFAULT_PAGE_SIZE);
        assert_eq!(q.status, "all");
    }

    #[test]
    fn query_parses_valid_params() {
        let q = WorkforceQuery::from_url(Some(
            "https://example.com/path?q=alice&page=2&pageSize=10&status=active",
        ))
        .unwrap();
        assert_eq!(q.q, "alice");
        assert_eq!(q.page, 2);
        assert_eq!(q.page_size, 10);
        assert_eq!(q.status, "active");
    }

    #[test]
    fn query_rejects_invalid_params() {
        assert!(WorkforceQuery::from_url(Some("https://x.com/?status=unknown")).is_err());
        assert!(WorkforceQuery::from_url(Some("https://x.com/?page=0")).is_err());
        assert!(
            WorkforceQuery::from_url(Some(&format!(
                "https://x.com/?pageSize={}",
                MAX_PAGE_SIZE + 1
            )))
            .is_err()
        );
    }

    fn make_user(contracts: Vec<Value>) -> Value {
        json!({ "id": "u1", "full_name": "Alice", "workforce_contracts": contracts })
    }

    #[test]
    fn enrich_adds_current_contract_and_count() {
        let c = json!({ "id": "c1", "employment_status": "active", "end_date": null });
        let users = enrich_and_filter(vec![make_user(vec![c.clone()])], "all");
        assert_eq!(users.len(), 1);
        assert_eq!(users[0]["contracts_count"], json!(1));
        assert_eq!(users[0]["current_contract"]["id"], json!("c1"));
    }

    #[test]
    fn status_filter_excludes_non_matching() {
        let c = json!({ "id": "c1", "employment_status": "terminated", "end_date": null });
        let users = enrich_and_filter(vec![make_user(vec![c])], "active");
        assert_eq!(users.len(), 0);
    }

    #[test]
    fn status_all_keeps_everything() {
        let c = json!({ "id": "c1", "employment_status": "terminated", "end_date": null });
        let users = enrich_and_filter(vec![make_user(vec![c])], "all");
        assert_eq!(users.len(), 1);
    }

    #[test]
    fn current_contract_falls_back_to_first_when_all_expired() {
        let c1 = json!({ "id": "c1", "end_date": "1970-01-01", "employment_status": "active" });
        let c2 = json!({ "id": "c2", "end_date": "1970-01-02", "employment_status": "active" });
        let users = enrich_and_filter(vec![make_user(vec![c1, c2])], "all");
        assert_eq!(users[0]["current_contract"]["id"], json!("c1"));
    }

    #[test]
    fn empty_contracts_yields_null_current_and_zero_count() {
        let users = enrich_and_filter(vec![make_user(vec![])], "all");
        assert_eq!(users[0]["current_contract"], Value::Null);
        assert_eq!(users[0]["contracts_count"], json!(0));
    }
}
