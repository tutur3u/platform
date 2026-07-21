//! Handler for `GET /api/v1/admin/ai-credits/balances`.
//!
//! Ports the infrastructure satellite route at
//! `apps/infrastructure/src/app/api/v1/admin/ai-credits/balances/route.ts`.
//!
//! Only the GET method is migrated here. POST (admin bonus-credits grant) is
//! left entirely to the infrastructure satellite route; this handler returns
//! `None` for every non-GET request so the worker falls through.
//!
//! Auth: the caller must hold a valid Supabase session and be a `MEMBER` of
//! the root workspace — identical to the other `admin/ai-credits/*` handlers
//! in this crate.
//!
//! Behavior gaps vs. the legacy route:
//!
//! - Enrichment round-trips (workspace names, user details, member counts) are
//!   issued sequentially rather than in parallel; the final response shape is
//!   identical.
//! - The pagination total is extracted from the PostgREST `Content-Range`
//!   response header (`Prefer: count=exact`) rather than the Supabase JS
//!   client `count` field; both values originate from the same DB aggregate.
//! - Member counts may be under-counted if any workspace exceeds PostgREST's
//!   default `max_rows` limit; the legacy route has the same limitation.

use std::collections::HashMap;

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    infrastructure_root_auth::ROOT_WORKSPACE_ID,
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const PATH: &str = "/api/v1/admin/ai-credits/balances";
const BALANCES_TABLE: &str = "workspace_ai_credit_balances";

const UNAUTHORIZED_MSG: &str = "Unauthorized";
const MEMBERSHIP_FAILED_MSG: &str = "Failed to verify workspace access";
const ROOT_ADMIN_REQUIRED_MSG: &str = "Root workspace admin required";
const BALANCES_FAILED_MSG: &str = "Failed to fetch balances";

const DEFAULT_PAGE: i64 = 1;
const DEFAULT_LIMIT: i64 = 50;
const MAX_LIMIT: i64 = 100;

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

enum MembershipOutcome {
    Member,
    Forbidden,
    LookupFailed,
}

pub(crate) async fn handle_admin_ai_credits_balances_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != PATH {
        return None;
    }

    Some(match request.method {
        "GET" => get_balances(config, request, outbound).await,
        _ => return None,
    })
}

async fn get_balances(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return err_json(401, UNAUTHORIZED_MSG);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return err_json(401, UNAUTHORIZED_MSG);
    };

    match check_root_membership(contact_data, outbound, &access_token, &user_id).await {
        MembershipOutcome::Member => {}
        MembershipOutcome::LookupFailed => return err_json(500, MEMBERSHIP_FAILED_MSG),
        MembershipOutcome::Forbidden => return err_json(403, ROOT_ADMIN_REQUIRED_MSG),
    }

    let parsed_url = request.url.and_then(|u| url::Url::parse(u).ok());
    let page = clamp_min(query_i64(parsed_url.as_ref(), "page", DEFAULT_PAGE), 1);
    let limit = MAX_LIMIT.min(clamp_min(
        query_i64(parsed_url.as_ref(), "limit", DEFAULT_LIMIT),
        1,
    ));
    let search = query_opt(parsed_url.as_ref(), "search");
    let scope = query_opt(parsed_url.as_ref(), "scope");

    let period_start = current_month_start_iso();
    let offset = (page - 1) * limit;

    let mut params: Vec<(&str, String)> = vec![
        ("select", "*".to_owned()),
        ("period_start", format!("eq.{period_start}")),
        ("order", "total_used.desc".to_owned()),
        ("offset", offset.to_string()),
        ("limit", limit.to_string()),
    ];

    if let Some(ref s) = search {
        params.push(("or", format!("(ws_id.eq.{s},user_id.eq.{s})")));
    }
    match scope.as_deref() {
        Some("user") => params.push(("user_id", "not.is.null".to_owned())),
        Some("workspace") => params.push(("ws_id", "not.is.null".to_owned())),
        _ => {}
    }

    let Some(bal_url) = contact_data.rest_url(BALANCES_TABLE, &params) else {
        return err_json(500, BALANCES_FAILED_MSG);
    };
    let Some(svc) = contact_data.service_role_key() else {
        return err_json(500, BALANCES_FAILED_MSG);
    };
    let bearer = format!("Bearer {svc}");

    let bal_resp = match outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &bal_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", svc)
                .with_header("Prefer", "count=exact"),
        )
        .await
    {
        Ok(r) => r,
        Err(_) => return err_json(500, BALANCES_FAILED_MSG),
    };

    if !(200..300).contains(&bal_resp.status) {
        return err_json(500, BALANCES_FAILED_MSG);
    }

    let rows: Vec<Value> = match bal_resp.json::<Vec<Value>>() {
        Ok(r) => r,
        Err(_) => return err_json(500, BALANCES_FAILED_MSG),
    };

    // PostgREST returns "Content-Range: from-to/total" or "*/0" with Prefer: count=exact.
    let total = bal_resp
        .header("content-range")
        .and_then(|h| h.rsplit('/').next())
        .and_then(|s| s.trim().parse::<i64>().ok())
        .unwrap_or(0);

    // Collect unique ws_ids / user_ids for enrichment.
    let mut ws_ids: Vec<String> = rows
        .iter()
        .filter_map(|r| r.get("ws_id")?.as_str())
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .collect();
    ws_ids.sort_unstable();
    ws_ids.dedup();

    let mut user_ids: Vec<String> = rows
        .iter()
        .filter_map(|r| r.get("user_id")?.as_str())
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .collect();
    user_ids.sort_unstable();
    user_ids.dedup();

    let ws_map = if ws_ids.is_empty() {
        HashMap::new()
    } else {
        id_map(
            fetch_rows_by_ids(
                contact_data,
                outbound,
                svc,
                "workspaces",
                "id,name",
                &ws_ids,
            )
            .await,
        )
    };

    let user_map = if user_ids.is_empty() {
        HashMap::new()
    } else {
        id_map(
            fetch_rows_by_ids(
                contact_data,
                outbound,
                svc,
                "users",
                "id,display_name,avatar_url",
                &user_ids,
            )
            .await,
        )
    };

    let member_counts = if ws_ids.is_empty() {
        HashMap::new()
    } else {
        fetch_member_counts(contact_data, outbound, svc, &ws_ids).await
    };

    let enriched: Vec<Value> = rows
        .into_iter()
        .map(|row| enrich_row(row, &ws_map, &user_map, &member_counts))
        .collect();

    no_store_response(json_response(
        200,
        json!({
            "data": enriched,
            "pagination": { "page": page, "limit": limit, "total": total },
        }),
    ))
}

// ---------------------------------------------------------------------------
// Enrichment helpers
// ---------------------------------------------------------------------------

fn enrich_row(
    row: Value,
    ws_map: &HashMap<String, Value>,
    user_map: &HashMap<String, Value>,
    member_counts: &HashMap<String, i64>,
) -> Value {
    let mut obj = match row {
        Value::Object(m) => m,
        other => return other,
    };

    let ws_id = obj
        .get("ws_id")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_owned);
    let user_id = obj
        .get("user_id")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_owned);

    let scope_str = if user_id.is_some() {
        "user"
    } else {
        "workspace"
    };

    let workspace_val = ws_id.as_deref().map(|id| {
        let name = ws_map
            .get(id)
            .and_then(|w| w.get("name"))
            .cloned()
            .unwrap_or(Value::Null);
        let count = member_counts.get(id).copied().unwrap_or(0);
        json!({ "id": id, "name": name, "member_count": count })
    });

    let user_val = user_id.as_deref().map(|id| {
        let display_name = user_map
            .get(id)
            .and_then(|u| u.get("display_name"))
            .cloned()
            .unwrap_or(Value::Null);
        let avatar_url = user_map
            .get(id)
            .and_then(|u| u.get("avatar_url"))
            .cloned()
            .unwrap_or(Value::Null);
        json!({ "id": id, "display_name": display_name, "avatar_url": avatar_url })
    });

    obj.insert("scope".to_owned(), Value::String(scope_str.to_owned()));
    obj.insert("workspace".to_owned(), workspace_val.unwrap_or(Value::Null));
    obj.insert("user".to_owned(), user_val.unwrap_or(Value::Null));
    Value::Object(obj)
}

/// Converts a flat `Vec<Value>` (each row must have an `"id"` string field)
/// into a `HashMap` keyed by that `id`.
fn id_map(rows: Vec<Value>) -> HashMap<String, Value> {
    rows.into_iter()
        .filter_map(|v| {
            let id = v.get("id")?.as_str()?.to_owned();
            Some((id, v))
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Supabase REST fetchers
// ---------------------------------------------------------------------------

/// Fetches rows from `table` matching `id IN (ids)` with the given `select`
/// columns, using service-role credentials. Returns an empty `Vec` on any
/// error so callers degrade gracefully.
async fn fetch_rows_by_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    svc: &str,
    table: &str,
    select: &str,
    ids: &[String],
) -> Vec<Value> {
    let in_list = ids.join(",");
    let Some(url) = contact_data.rest_url(
        table,
        &[
            ("select", select.to_owned()),
            ("id", format!("in.({in_list})")),
        ],
    ) else {
        return Vec::new();
    };

    let bearer = format!("Bearer {svc}");
    let resp = match outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", svc),
        )
        .await
    {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };

    if !(200..300).contains(&resp.status) {
        return Vec::new();
    }

    resp.json::<Vec<Value>>().unwrap_or_default()
}

/// Fetches the member count per workspace from `workspace_members` for the
/// given `ws_ids`. Returns a map of `ws_id -> count`.
async fn fetch_member_counts(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    svc: &str,
    ws_ids: &[String],
) -> HashMap<String, i64> {
    let in_list = ws_ids.join(",");
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "ws_id".to_owned()),
            ("ws_id", format!("in.({in_list})")),
        ],
    ) else {
        return HashMap::new();
    };

    let bearer = format!("Bearer {svc}");
    let resp = match outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", svc),
        )
        .await
    {
        Ok(r) => r,
        Err(_) => return HashMap::new(),
    };

    if !(200..300).contains(&resp.status) {
        return HashMap::new();
    }

    #[derive(Deserialize)]
    struct MemberRow {
        ws_id: String,
    }

    let mut counts: HashMap<String, i64> = HashMap::new();
    for row in resp.json::<Vec<MemberRow>>().unwrap_or_default() {
        *counts.entry(row.ws_id).or_insert(0) += 1;
    }
    counts
}

// ---------------------------------------------------------------------------
// Root-workspace auth (mirrors the other admin/ai-credits handlers)
// ---------------------------------------------------------------------------

async fn check_root_membership(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
    user_id: &str,
) -> MembershipOutcome {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ROOT_WORKSPACE_ID}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return MembershipOutcome::LookupFailed;
    };

    let Some(svc) = contact_data.service_role_key() else {
        return MembershipOutcome::LookupFailed;
    };
    let auth_header = format!("Bearer {access_token}");

    let resp = match outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &auth_header)
                .with_header("apikey", svc),
        )
        .await
    {
        Ok(r) => r,
        Err(_) => return MembershipOutcome::LookupFailed,
    };

    if !(200..300).contains(&resp.status) {
        return MembershipOutcome::LookupFailed;
    }

    let rows = match resp.json::<Vec<WorkspaceMembershipRow>>() {
        Ok(r) => r,
        Err(_) => return MembershipOutcome::LookupFailed,
    };

    if rows.first().and_then(|r| r.membership_type.as_deref()) == Some("MEMBER") {
        MembershipOutcome::Member
    } else {
        MembershipOutcome::Forbidden
    }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

fn query_opt(url: Option<&url::Url>, key: &str) -> Option<String> {
    url?.query_pairs()
        .find_map(|(name, value)| (name == key).then(|| value.into_owned()))
        .filter(|v| !v.is_empty())
}

fn query_i64(url: Option<&url::Url>, key: &str, default: i64) -> i64 {
    query_opt(url, key)
        .and_then(|v| v.trim().parse::<i64>().ok())
        .unwrap_or(default)
}

fn clamp_min(value: i64, min: i64) -> i64 {
    if value < min { min } else { value }
}

/// Returns `"YYYY-MM-01T00:00:00.000Z"` — the first instant of the current
/// UTC month — matching the legacy `periodStart` computation in the route.
fn current_month_start_iso() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let (year, month) = epoch_secs_to_year_month(secs);
    format!("{year:04}-{month:02}-01T00:00:00.000Z")
}

/// Converts a Unix timestamp (seconds since 1970-01-01 00:00:00 UTC) to a
/// `(year, month)` pair using Howard Hinnant's civil_from_days algorithm.
fn epoch_secs_to_year_month(secs: u64) -> (u32, u32) {
    let z = (secs / 86_400) as i64 + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y as u32, m as u32)
}

fn err_json(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ---------------------------------------------------------------------------
// Unit tests (pure / sync helpers only)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_constant_matches_route() {
        assert_eq!(PATH, "/api/v1/admin/ai-credits/balances");
    }

    #[test]
    fn epoch_secs_unix_epoch() {
        // 1970-01-01 00:00:00 UTC
        let (y, m) = epoch_secs_to_year_month(0);
        assert_eq!((y, m), (1970, 1));
    }

    #[test]
    fn epoch_secs_y2k() {
        // 2000-01-01 00:00:00 UTC = 946_684_800
        let (y, m) = epoch_secs_to_year_month(946_684_800);
        assert_eq!((y, m), (2000, 1));
    }

    #[test]
    fn epoch_secs_june_2026() {
        // 2026-06-01 00:00:00 UTC
        // Days since epoch: 56 years * 365 + 14 leap days + 151 (Jan–May) = 20605
        // secs = 20605 * 86400 = 1_780_272_000
        let (y, m) = epoch_secs_to_year_month(1_780_272_000);
        assert_eq!((y, m), (2026, 6));
    }

    #[test]
    fn current_month_start_iso_format() {
        let s = current_month_start_iso();
        // Must end with "-01T00:00:00.000Z" and be 24 chars (YYYY-MM-01T00:00:00.000Z)
        assert!(s.ends_with("-01T00:00:00.000Z"), "unexpected suffix: {s}");
        assert_eq!(s.len(), 24, "unexpected length: {s}");
    }

    #[test]
    fn clamp_min_below_min() {
        assert_eq!(clamp_min(0, 1), 1);
        assert_eq!(clamp_min(-5, 1), 1);
    }

    #[test]
    fn clamp_min_above_min() {
        assert_eq!(clamp_min(10, 1), 10);
    }

    #[test]
    fn query_i64_returns_default_on_none() {
        assert_eq!(query_i64(None, "page", DEFAULT_PAGE), DEFAULT_PAGE);
    }

    #[test]
    fn query_opt_returns_none_on_missing_url() {
        assert_eq!(query_opt(None, "search"), None);
    }

    #[test]
    fn id_map_builds_correct_lookup() {
        let rows = vec![
            json!({ "id": "abc", "name": "Alpha" }),
            json!({ "id": "def", "name": "Beta" }),
        ];
        let map = id_map(rows);
        assert_eq!(map.len(), 2);
        assert_eq!(map["abc"]["name"], "Alpha");
        assert_eq!(map["def"]["name"], "Beta");
    }

    #[test]
    fn enrich_row_user_scope() {
        let row = json!({
            "ws_id": null,
            "user_id": "u1",
            "total_used": 42
        });
        let mut user_map = HashMap::new();
        user_map.insert(
            "u1".to_owned(),
            json!({ "id": "u1", "display_name": "Alice", "avatar_url": null }),
        );
        let enriched = enrich_row(row, &HashMap::new(), &user_map, &HashMap::new());
        assert_eq!(enriched["scope"], "user");
        assert_eq!(enriched["user"]["display_name"], "Alice");
        assert_eq!(enriched["workspace"], Value::Null);
    }

    #[test]
    fn enrich_row_workspace_scope() {
        let row = json!({
            "ws_id": "w1",
            "user_id": null,
            "total_used": 10
        });
        let mut ws_map = HashMap::new();
        ws_map.insert("w1".to_owned(), json!({ "id": "w1", "name": "Acme" }));
        let mut counts = HashMap::new();
        counts.insert("w1".to_owned(), 5_i64);

        let enriched = enrich_row(row, &ws_map, &HashMap::new(), &counts);
        assert_eq!(enriched["scope"], "workspace");
        assert_eq!(enriched["workspace"]["name"], "Acme");
        assert_eq!(enriched["workspace"]["member_count"], 5);
        assert_eq!(enriched["user"], Value::Null);
    }
}
