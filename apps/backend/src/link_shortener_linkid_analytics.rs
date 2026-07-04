use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/link-shortener/";
const PATH_SUFFIX: &str = "/analytics";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const LINK_NOT_FOUND_MESSAGE: &str = "Link not found";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace membership";

const SECONDS_PER_DAY: i64 = 86_400;
const ANALYTICS_WINDOW_DAYS: i64 = 30;

#[derive(Deserialize)]
struct ShortenedLinkRow {
    id: Option<String>,
    ws_id: Option<String>,
    slug: Option<String>,
    link: Option<String>,
    created_at: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMemberRow {
    user_id: Option<String>,
}

#[derive(Deserialize)]
struct LinkAnalyticsSummaryRow {
    total_clicks: Option<serde_json::Value>,
    unique_visitors: Option<serde_json::Value>,
    unique_referrers: Option<serde_json::Value>,
    unique_countries: Option<serde_json::Value>,
    first_click_at: Option<serde_json::Value>,
    last_click_at: Option<serde_json::Value>,
    top_referrer_domain: Option<serde_json::Value>,
    top_country: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct ClickRow {
    clicked_at: Option<String>,
}

#[derive(Deserialize)]
struct ReferrerRow {
    referrer_domain: Option<String>,
}

#[derive(Deserialize)]
struct CountryRow {
    country: Option<String>,
}

#[derive(Serialize)]
struct ClicksByDayEntry {
    date: String,
    clicks: u64,
}

#[derive(Serialize)]
struct ReferrerEntry {
    domain: String,
    count: u64,
}

#[derive(Serialize)]
struct CountryEntry {
    country: String,
    count: u64,
}

pub(crate) async fn handle_link_shortener_linkid_analytics_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let link_id = link_id_from_path(request.path)?;

    Some(match request.method {
        "GET" => analytics_response(config, request, link_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn analytics_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    link_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Authenticate the caller via Supabase access token (bearer or cookie).
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    // Verify the link exists (service-role read, mirrors createAdminClient).
    let link = match fetch_shortened_link(contact_data, outbound, link_id).await {
        Ok(Some(link)) => link,
        // Treat both "not found" and lookup failure as 404 to match the legacy
        // route, which returns "Link not found" whenever linkError is truthy or
        // the row is missing.
        Ok(None) | Err(()) => return message_response(404, LINK_NOT_FOUND_MESSAGE),
    };

    let Some(ws_id) = link.ws_id.as_deref().filter(|value| !value.is_empty()) else {
        return message_response(404, LINK_NOT_FOUND_MESSAGE);
    };

    // Verify the caller is a member of the link's workspace.
    match verify_workspace_member(contact_data, outbound, ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(403, FORBIDDEN_MESSAGE),
        Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    let link_payload = json!({
        "id": link.id,
        "slug": link.slug,
        "original_url": link.link,
        "created_at": link.created_at,
    });

    // Analytics summary from the link_analytics_summary view. If no row exists
    // (or the read fails), return the zero-stats shape exactly like the legacy
    // route does on summaryError.
    let summary = match fetch_summary(contact_data, outbound, link_id).await {
        Ok(Some(summary)) => summary,
        Ok(None) | Err(()) => {
            return no_store_response(json_response(
                200,
                json!({
                    "link": link_payload,
                    "analytics": {
                        "total_clicks": 0,
                        "unique_visitors": 0,
                        "unique_referrers": 0,
                        "unique_countries": 0,
                        "first_click_at": serde_json::Value::Null,
                        "last_click_at": serde_json::Value::Null,
                        "top_referrer_domain": serde_json::Value::Null,
                        "top_country": serde_json::Value::Null,
                    },
                    "clicksByDay": [],
                    "topReferrers": [],
                    "topCountries": [],
                }),
            ));
        }
    };

    // clicksByDay for the last 30 days. Aggregation/sort failures fall back to
    // empty arrays, matching the legacy `|| {}` / `data?.` handling.
    let clicks_by_day = fetch_clicks_by_day(contact_data, outbound, link_id).await;
    let top_referrers = fetch_top_referrers(contact_data, outbound, link_id).await;
    let top_countries = fetch_top_countries(contact_data, outbound, link_id).await;

    let analytics = json!({
        "total_clicks": numeric_or_zero(summary.total_clicks.as_ref()),
        "unique_visitors": numeric_or_zero(summary.unique_visitors.as_ref()),
        "unique_referrers": numeric_or_zero(summary.unique_referrers.as_ref()),
        "unique_countries": numeric_or_zero(summary.unique_countries.as_ref()),
        "first_click_at": value_or_null(summary.first_click_at),
        "last_click_at": value_or_null(summary.last_click_at),
        "top_referrer_domain": value_or_null(summary.top_referrer_domain),
        "top_country": value_or_null(summary.top_country),
    });

    no_store_response(json_response(
        200,
        json!({
            "link": link_payload,
            "analytics": analytics,
            "clicksByDay": clicks_by_day,
            "topReferrers": top_referrers,
            "topCountries": top_countries,
        }),
    ))
}

async fn fetch_shortened_link(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    link_id: &str,
) -> Result<Option<ShortenedLinkRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "shortened_links",
        &[
            (
                "select",
                "id,ws_id,slug,link,creator_id,created_at".to_owned(),
            ),
            ("id", format!("eq.{link_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<ShortenedLinkRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn verify_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "user_id".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceMemberRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.user_id)
        .is_some())
}

async fn fetch_summary(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    link_id: &str,
) -> Result<Option<LinkAnalyticsSummaryRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "link_analytics_summary",
        &[
            ("select", "*".to_owned()),
            ("link_id", format!("eq.{link_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<LinkAnalyticsSummaryRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn fetch_clicks_by_day(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    link_id: &str,
) -> Vec<ClicksByDayEntry> {
    let thirty_days_ago = thirty_days_ago_iso();
    let Some(url) = contact_data.rest_url(
        "link_analytics",
        &[
            ("select", "clicked_at".to_owned()),
            ("link_id", format!("eq.{link_id}")),
            ("clicked_at", format!("gte.{thirty_days_ago}")),
            ("order", "clicked_at.asc".to_owned()),
        ],
    ) else {
        return Vec::new();
    };
    let Ok(response) = send_service_role_get(contact_data, outbound, &url).await else {
        return Vec::new();
    };
    if !(200..300).contains(&response.status) {
        return Vec::new();
    }
    let Ok(rows) = response.json::<Vec<ClickRow>>() else {
        return Vec::new();
    };

    // BTreeMap keyed by YYYY-MM-DD keeps the ascending-by-date ordering the
    // legacy code produced (it inserted in ascending clicked_at order).
    let mut counts: BTreeMap<String, u64> = BTreeMap::new();
    for row in rows {
        let Some(clicked_at) = row.clicked_at else {
            continue;
        };
        let Some(date) = date_part_from_iso(&clicked_at) else {
            continue;
        };
        *counts.entry(date).or_insert(0) += 1;
    }

    counts
        .into_iter()
        .map(|(date, clicks)| ClicksByDayEntry { date, clicks })
        .collect()
}

async fn fetch_top_referrers(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    link_id: &str,
) -> Vec<ReferrerEntry> {
    let Some(url) = contact_data.rest_url(
        "link_analytics",
        &[
            ("select", "referrer_domain".to_owned()),
            ("link_id", format!("eq.{link_id}")),
            ("referrer_domain", "not.is.null".to_owned()),
            ("referrer_domain", "neq.".to_owned()),
        ],
    ) else {
        return Vec::new();
    };
    let Ok(response) = send_service_role_get(contact_data, outbound, &url).await else {
        return Vec::new();
    };
    if !(200..300).contains(&response.status) {
        return Vec::new();
    }
    let Ok(rows) = response.json::<Vec<ReferrerRow>>() else {
        return Vec::new();
    };

    let counts = aggregate_counts(
        rows.into_iter()
            .filter_map(|row| row.referrer_domain.filter(|domain| !domain.is_empty())),
    );

    top_n(counts, |domain, count| ReferrerEntry { domain, count })
}

async fn fetch_top_countries(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    link_id: &str,
) -> Vec<CountryEntry> {
    let Some(url) = contact_data.rest_url(
        "link_analytics",
        &[
            ("select", "country".to_owned()),
            ("link_id", format!("eq.{link_id}")),
            ("country", "not.is.null".to_owned()),
            ("country", "neq.".to_owned()),
        ],
    ) else {
        return Vec::new();
    };
    let Ok(response) = send_service_role_get(contact_data, outbound, &url).await else {
        return Vec::new();
    };
    if !(200..300).contains(&response.status) {
        return Vec::new();
    }
    let Ok(rows) = response.json::<Vec<CountryRow>>() else {
        return Vec::new();
    };

    let counts = aggregate_counts(
        rows.into_iter()
            .filter_map(|row| row.country.filter(|value| !value.is_empty())),
    );

    top_n(counts, |country, count| CountryEntry { country, count })
}

fn aggregate_counts(values: impl Iterator<Item = String>) -> BTreeMap<String, u64> {
    let mut counts: BTreeMap<String, u64> = BTreeMap::new();
    for value in values {
        *counts.entry(value).or_insert(0) += 1;
    }
    counts
}

fn top_n<T>(counts: BTreeMap<String, u64>, make: impl Fn(String, u64) -> T) -> Vec<T> {
    let mut entries: Vec<(String, u64)> = counts.into_iter().collect();
    // Sort by count descending; ties keep their (key-ascending) relative order
    // from the BTreeMap via a stable sort.
    entries.sort_by_key(|entry| std::cmp::Reverse(entry.1));
    entries
        .into_iter()
        .take(10)
        .map(|(key, count)| make(key, count))
        .collect()
}

async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

fn link_id_from_path(path: &str) -> Option<&str> {
    let link_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;

    (!link_id.is_empty() && !link_id.contains('/')).then_some(link_id)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

fn value_or_null(value: Option<serde_json::Value>) -> serde_json::Value {
    match value {
        Some(serde_json::Value::Null) | None => serde_json::Value::Null,
        Some(value) => value,
    }
}

/// Mirrors `summary.total_clicks || 0` etc.: a missing/null/falsy numeric
/// becomes 0; otherwise the numeric value is preserved.
fn numeric_or_zero(value: Option<&serde_json::Value>) -> u64 {
    match value {
        Some(serde_json::Value::Number(number)) => number
            .as_u64()
            .or_else(|| {
                number
                    .as_f64()
                    .filter(|float| *float > 0.0)
                    .map(|float| float as u64)
            })
            .unwrap_or(0),
        Some(serde_json::Value::String(text)) => text.parse::<u64>().unwrap_or(0),
        _ => 0,
    }
}

/// Extracts the YYYY-MM-DD prefix from an ISO-8601/Postgres timestamp.
fn date_part_from_iso(timestamp: &str) -> Option<String> {
    let trimmed = timestamp.trim();
    let date = trimmed.split(['T', ' ']).next()?;
    if date.len() == 10 && date.as_bytes().get(4) == Some(&b'-') {
        Some(date.to_owned())
    } else {
        None
    }
}

fn thirty_days_ago_iso() -> String {
    let now_seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| i64::try_from(duration.as_secs()).unwrap_or(i64::MAX))
        .unwrap_or(0);
    let target = now_seconds - ANALYTICS_WINDOW_DAYS * SECONDS_PER_DAY;
    iso_millis_from_unix_seconds(target)
}

fn iso_millis_from_unix_seconds(unix_seconds: i64) -> String {
    let days = unix_seconds.div_euclid(SECONDS_PER_DAY);
    let seconds_of_day = unix_seconds.rem_euclid(SECONDS_PER_DAY);
    let (year, month, day) = civil_from_unix_epoch_days(days);
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.000Z")
}

fn civil_from_unix_epoch_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    let year = y + if month <= 2 { 1 } else { 0 };

    (year, month, day)
}
