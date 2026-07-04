use base64::Engine;
use base64::engine::general_purpose::URL_SAFE;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/time-tracking/stats/period";
const PERIOD_STATS_RPC: &str = "get_time_tracking_period_stats";
const MANAGE_TIME_TRACKING_REQUESTS_PERMISSION: &str = "manage_time_tracking_requests";

const ADMIN_PERMISSION: &str = "admin";
const APP_SESSION_BEARER_PREFIX: &str = "ttr_app_";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const SUPABASE_AUTH_COOKIE_BASE64_PREFIX: &str = "base64-";

// ---------------------------------------------------------------------------
// RPC request / response shapes
// ---------------------------------------------------------------------------

/// Body sent to the `get_time_tracking_period_stats` RPC. Optional filter
/// parameters are omitted (left undefined) when the legacy route would have
/// passed `undefined`, so PostgREST applies the SQL defaults.
#[derive(Serialize)]
struct PeriodStatsRpcRequest<'a> {
    p_ws_id: &'a str,
    p_user_id: &'a str,
    p_date_from: &'a str,
    p_date_to: &'a str,
    p_timezone: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_category_id: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_task_id: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_search_query: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_duration: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_time_of_day: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_project_context: Option<&'a str>,
}

struct PeriodStatsQuery {
    date_from: String,
    date_to: String,
    timezone: String,
    target_user_id: Option<String>,
    search_query: Option<String>,
    category_id: Option<String>,
    task_id: Option<String>,
    duration: Option<String>,
    time_of_day: Option<String>,
    project_context: Option<String>,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_time_tracking_stats_period_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = period_stats_ws_id(request.path)?;

    Some(match request.method {
        "GET" => period_stats_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn period_stats_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return error_response(500, "Internal server error");
    }

    // Authenticate. Mirrors the session resolution used by the workspace
    // permission check route: bearer access token or Supabase auth cookie.
    let Some(access_token) = request_access_token_ignoring_app_sessions(request) else {
        return error_response(401, "Unauthorized");
    };
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return error_response(401, "Unauthorized");
    };
    let Some(user_id) = user.id.filter(|id| !id.trim().is_empty()) else {
        return error_response(401, "Unauthorized");
    };

    // Normalize the workspace id (handles `personal`, `internal`, handles).
    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(Some(ws_id)) => ws_id,
            // Normalization that returns no workspace is treated as a lookup
            // failure in the legacy flow when membership cannot be established;
            // membership verification below resolves the precise status code.
            Ok(None) => return error_response(403, "Workspace access denied"),
            Err(()) => return error_response(500, "Failed to verify workspace access"),
        };

    // Verify the caller is a member of the workspace.
    match workspace_membership_type(
        contact_data,
        outbound,
        &resolved_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(Some(_)) => {}
        Ok(None) => return error_response(403, "Workspace access denied"),
        Err(()) => return error_response(500, "Failed to verify workspace access"),
    }

    // Parse and validate query parameters.
    let Some(query) = parse_query(request.url) else {
        return error_response(400, "Invalid query parameters");
    };

    // Determine which user's data to fetch.
    let mut query_user_id = user_id.clone();

    if let Some(target_user_id) = query
        .target_user_id
        .as_deref()
        .filter(|target| !target.is_empty() && *target != user_id)
    {
        // Targeting another user requires `manage_time_tracking_requests`.
        match effective_workspace_permissions_for_user(
            contact_data,
            outbound,
            &resolved_ws_id,
            &user_id,
            &access_token,
        )
        .await
        {
            Ok(Some(permissions)) => {
                let has_permission = permissions.has_all_permissions
                    || permissions
                        .permissions
                        .iter()
                        .any(|value| value == MANAGE_TIME_TRACKING_REQUESTS_PERMISSION);
                if !has_permission {
                    return error_response(
                        403,
                        "Insufficient permissions to view other users data",
                    );
                }
            }
            // No permission context means the caller lacks the permission.
            Ok(None) => {
                return error_response(403, "Insufficient permissions to view other users data");
            }
            Err(()) => return error_response(500, "Failed to resolve permissions"),
        }

        // Verify the target user is a member of the workspace.
        match workspace_membership_type(
            contact_data,
            outbound,
            &resolved_ws_id,
            target_user_id,
            &access_token,
        )
        .await
        {
            Ok(Some(_)) => {}
            Ok(None) => return error_response(404, "Target user not found in workspace"),
            Err(()) => return error_response(500, "Failed to verify target user access"),
        }

        query_user_id = target_user_id.to_owned();
    }

    let sanitized_search = sanitize_search_query(query.search_query.as_deref());

    match fetch_period_stats(
        contact_data,
        outbound,
        &resolved_ws_id,
        &query_user_id,
        &query,
        sanitized_search.as_deref(),
    )
    .await
    {
        Ok(stats) => no_store_response(json_response(200, normalize_stats(stats))),
        Err(()) => error_response(500, "Internal server error"),
    }
}

// ---------------------------------------------------------------------------
// RPC call
// ---------------------------------------------------------------------------

async fn fetch_period_stats(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    query: &PeriodStatsQuery,
    sanitized_search: Option<&str>,
) -> Result<Value, ()> {
    let rpc_url = contact_data.rpc_url(PERIOD_STATS_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let body = serde_json::to_string(&PeriodStatsRpcRequest {
        p_ws_id: ws_id,
        p_user_id: user_id,
        p_date_from: &query.date_from,
        p_date_to: &query.date_to,
        p_timezone: &query.timezone,
        p_category_id: filter_value(query.category_id.as_deref()),
        p_task_id: filter_value(query.task_id.as_deref()),
        p_search_query: sanitized_search.filter(|value| !value.is_empty()),
        p_duration: filter_value(query.duration.as_deref()),
        p_time_of_day: filter_value(query.time_of_day.as_deref()),
        p_project_context: filter_value(query.project_context.as_deref()),
    })
    .map_err(|_| ())?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // The RPC returns a JSON object (or null). Anything else falls back to an
    // empty object, matching the legacy `stats ?? {}` then schema parse.
    Ok(serde_json::from_str::<Value>(&response.body_text).unwrap_or(Value::Null))
}

/// Mirror the legacy `value && value !== 'all' ? value : undefined` gate: any
/// empty string or the literal `all` becomes `undefined` (omitted).
fn filter_value(value: Option<&str>) -> Option<&str> {
    value.filter(|value| !value.is_empty() && *value != "all")
}

// ---------------------------------------------------------------------------
// Response normalization (mirrors the legacy `normalizedStats`)
// ---------------------------------------------------------------------------

fn normalize_stats(stats: Value) -> Value {
    let object = match &stats {
        Value::Object(map) => Some(map),
        _ => None,
    };

    let get = |key: &str| object.and_then(|map| map.get(key));

    let total_duration = number_or(get("totalDuration"), json!(0));
    let breakdown = array_or_empty(get("breakdown"));
    let time_of_day_breakdown = match get("timeOfDayBreakdown") {
        Some(Value::Object(_)) => get("timeOfDayBreakdown")
            .cloned()
            .unwrap_or_else(|| json!({ "morning": 0, "afternoon": 0, "evening": 0, "night": 0 })),
        _ => json!({ "morning": 0, "afternoon": 0, "evening": 0, "night": 0 }),
    };
    let best_time_of_day = match get("bestTimeOfDay") {
        Some(Value::String(value)) => Value::String(value.clone()),
        _ => json!("none"),
    };
    let longest_session = match get("longestSession") {
        Some(Value::Object(map)) => Value::Object(map.clone()),
        _ => Value::Null,
    };
    let short_sessions = number_or(get("shortSessions"), json!(0));
    let medium_sessions = number_or(get("mediumSessions"), json!(0));
    let long_sessions = number_or(get("longSessions"), json!(0));
    let session_count = number_or(get("sessionCount"), json!(0));
    let daily_breakdown = array_or_empty(get("dailyBreakdown"));

    json!({
        "totalDuration": total_duration,
        "breakdown": breakdown,
        "timeOfDayBreakdown": time_of_day_breakdown,
        "bestTimeOfDay": best_time_of_day,
        "longestSession": longest_session,
        "shortSessions": short_sessions,
        "mediumSessions": medium_sessions,
        "longSessions": long_sessions,
        "sessionCount": session_count,
        "dailyBreakdown": daily_breakdown,
    })
}

fn number_or(value: Option<&Value>, fallback: Value) -> Value {
    match value {
        Some(Value::Number(number)) => Value::Number(number.clone()),
        _ => fallback,
    }
}

fn array_or_empty(value: Option<&Value>) -> Value {
    match value {
        Some(Value::Array(items)) => Value::Array(items.clone()),
        _ => Value::Array(Vec::new()),
    }
}

// ---------------------------------------------------------------------------
// Query parsing / validation
// ---------------------------------------------------------------------------

fn parse_query(request_url: Option<&str>) -> Option<PeriodStatsQuery> {
    let url = url::Url::parse(request_url?).ok()?;

    let mut date_from: Option<String> = None;
    let mut date_to: Option<String> = None;
    let mut timezone: Option<String> = None;
    let mut target_user_id: Option<String> = None;
    let mut search_query: Option<String> = None;
    let mut category_id: Option<String> = None;
    let mut task_id: Option<String> = None;
    let mut duration: Option<String> = None;
    let mut time_of_day: Option<String> = None;
    let mut project_context: Option<String> = None;

    for (key, value) in url.query_pairs() {
        let value = value.into_owned();
        match key.as_ref() {
            "dateFrom" if date_from.is_none() => date_from = Some(value),
            "dateTo" if date_to.is_none() => date_to = Some(value),
            "timezone" if timezone.is_none() => timezone = Some(value),
            "userId" if target_user_id.is_none() => target_user_id = Some(value),
            "searchQuery" if search_query.is_none() => search_query = Some(value),
            "categoryId" if category_id.is_none() => category_id = Some(value),
            "taskId" if task_id.is_none() => task_id = Some(value),
            "duration" if duration.is_none() => duration = Some(value),
            "timeOfDay" if time_of_day.is_none() => time_of_day = Some(value),
            "projectContext" if project_context.is_none() => project_context = Some(value),
            _ => {}
        }
    }

    // `dateFrom` and `dateTo` are required ISO-8601 datetimes with an offset.
    let date_from = date_from.map(|value| value.trim().to_owned())?;
    let date_to = date_to.map(|value| value.trim().to_owned())?;
    if !is_iso_datetime(&date_from) || !is_iso_datetime(&date_to) {
        return None;
    }

    // `dateFrom` must be before or equal to `dateTo` (instant comparison).
    let from_instant = iso_to_epoch_millis(&date_from)?;
    let to_instant = iso_to_epoch_millis(&date_to)?;
    if from_instant > to_instant {
        return None;
    }

    // Enum validation: only enumerated values pass; otherwise the whole query
    // is rejected with 400 (matching the zod enum schemas).
    if !valid_enum(duration.as_deref(), &["all", "short", "medium", "long"]) {
        return None;
    }
    if !valid_enum(
        time_of_day.as_deref(),
        &["all", "morning", "afternoon", "evening", "night"],
    ) {
        return None;
    }
    if !valid_enum(
        project_context.as_deref(),
        &[
            "all",
            "project-work",
            "meetings",
            "learning",
            "administrative",
            "general",
        ],
    ) {
        return None;
    }

    Some(PeriodStatsQuery {
        date_from,
        date_to,
        timezone: timezone.unwrap_or_else(|| "UTC".to_owned()),
        target_user_id,
        search_query,
        category_id,
        task_id,
        duration,
        time_of_day,
        project_context,
    })
}

/// Loose RFC 3339 / ISO-8601 datetime acceptance approximating zod's
/// `.datetime({ offset: true })`. Requires at least `YYYY-MM-DDTHH:MM:SS`,
/// then allows a trailing `Z`, numeric offset, fractional seconds, or colons.
/// Copied from the calendar habit events handler's validator.
fn is_iso_datetime(value: &str) -> bool {
    let value = value.trim();
    let bytes = value.as_bytes();
    // Minimum length: 2024-01-01T00:00:00 (19 chars).
    if bytes.len() < 19 {
        return false;
    }

    let is_digit = |index: usize| bytes.get(index).is_some_and(u8::is_ascii_digit);
    let is_char = |index: usize, character: u8| bytes.get(index) == Some(&character);

    is_digit(0)
        && is_digit(1)
        && is_digit(2)
        && is_digit(3)
        && is_char(4, b'-')
        && is_digit(5)
        && is_digit(6)
        && is_char(7, b'-')
        && is_digit(8)
        && is_digit(9)
        && (is_char(10, b'T') || is_char(10, b't'))
        && is_digit(11)
        && is_digit(12)
        && is_char(13, b':')
        && is_digit(14)
        && is_digit(15)
        && is_char(16, b':')
        && is_digit(17)
        && is_digit(18)
        && value[19..]
            .chars()
            .all(|character| matches!(character, '0'..='9' | '.' | '+' | '-' | ':' | 'Z' | 'z'))
}

/// Parse a (loosely validated) RFC 3339 datetime into epoch milliseconds for
/// ordering comparisons only. Mirrors `new Date(value)` instant semantics,
/// applying any timezone offset. Returns `None` when the value cannot be parsed
/// into a sensible instant; callers treat that as a validation failure.
fn iso_to_epoch_millis(value: &str) -> Option<i64> {
    let value = value.trim();
    let bytes = value.as_bytes();
    if bytes.len() < 19 {
        return None;
    }

    let parse = |range: std::ops::Range<usize>| value.get(range)?.parse::<i64>().ok();

    let year = parse(0..4)?;
    let month = parse(5..7)?;
    let day = parse(8..10)?;
    let hour = parse(11..13)?;
    let minute = parse(14..16)?;
    let second = parse(17..19)?;

    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    // Fractional seconds + timezone designator live after the seconds.
    let mut rest = &value[19..];
    let mut millis: i64 = 0;
    if let Some(stripped) = rest.strip_prefix('.') {
        let frac_len = stripped
            .char_indices()
            .find(|(_, character)| !character.is_ascii_digit())
            .map_or(stripped.len(), |(index, _)| index);
        let frac = &stripped[..frac_len];
        let mut frac_millis = String::from(&frac[..frac.len().min(3)]);
        while frac_millis.len() < 3 {
            frac_millis.push('0');
        }
        millis = frac_millis.parse::<i64>().unwrap_or(0);
        rest = &stripped[frac_len..];
    }

    // Timezone offset: `Z`, `+HH:MM`, `-HH:MM`, `+HHMM`, `-HHMM`, or absent
    // (treated as UTC, matching how the RPC and validation behave here).
    let mut offset_minutes: i64 = 0;
    let rest = rest.trim();
    if !(rest.is_empty() || rest.eq_ignore_ascii_case("z")) {
        let sign = match rest.as_bytes().first() {
            Some(b'+') => 1,
            Some(b'-') => -1,
            _ => return None,
        };
        let digits: String = rest[1..].chars().filter(|c| c.is_ascii_digit()).collect();
        let (off_hour, off_minute) = match digits.len() {
            4 => (
                digits[0..2].parse::<i64>().ok()?,
                digits[2..4].parse::<i64>().ok()?,
            ),
            2 => (digits[0..2].parse::<i64>().ok()?, 0),
            _ => return None,
        };
        offset_minutes = sign * (off_hour * 60 + off_minute);
    }

    let days = days_from_civil(year, month, day);
    let total_seconds = days * 86_400 + hour * 3_600 + minute * 60 + second - offset_minutes * 60;

    Some(total_seconds * 1_000 + millis)
}

/// Days since the Unix epoch (1970-01-01) for a proleptic Gregorian date.
/// Howard Hinnant's `days_from_civil` algorithm.
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let year_of_era = year - era * 400;
    let day_of_year = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

fn valid_enum(value: Option<&str>, allowed: &[&str]) -> bool {
    match value {
        None => true,
        Some(value) => allowed.contains(&value),
    }
}

/// Mirror `sanitizeSearchQuery`: trim, and strip PostgREST/`tsquery`-hostile
/// characters. The web helper collapses whitespace and removes characters that
/// would break an `ilike`/full-text search; we apply the same conservative
/// cleanup, then treat an empty result as "no search".
fn sanitize_search_query(value: Option<&str>) -> Option<String> {
    let raw = value?.trim();
    if raw.is_empty() {
        return None;
    }

    let cleaned: String = raw
        .chars()
        .map(|character| match character {
            '%' | '_' | '\\' | ',' | '(' | ')' | ':' | '*' | '\'' | '"' => ' ',
            other if other.is_control() => ' ',
            other => other,
        })
        .collect();

    let collapsed = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");

    if collapsed.is_empty() {
        None
    } else {
        Some(collapsed)
    }
}

// ---------------------------------------------------------------------------
// Path matching
// ---------------------------------------------------------------------------

fn period_stats_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn error_response(status: u16, error: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": error })))
}

// ===========================================================================
// Self-contained copies of the workspace auth/permission helpers.
//
// These mirror the PRIVATE helpers in `workspace_permission_check.rs`. They are
// copied (rather than imported) because the originals are module-private and we
// must not edit that file. See module notes.
// ===========================================================================

#[derive(Clone, Debug, Eq, PartialEq)]
struct EffectiveWorkspacePermissions {
    has_all_permissions: bool,
    permissions: Vec<String>,
}

#[derive(Deserialize)]
struct PermissionRow {
    permission: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceRow {
    creator_id: Option<String>,
}

#[derive(Clone, Debug, Default)]
struct SupabaseAuthCookieGroup {
    base: Option<String>,
    chunks: BTreeMap<usize, String>,
    duplicate: bool,
}

#[derive(Deserialize)]
struct SupabaseCookieSession {
    access_token: Option<String>,
}

enum DataAuth<'a> {
    AccessToken(&'a str),
    ServiceRole,
}

async fn effective_workspace_permissions_for_user(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    resolved_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Option<EffectiveWorkspacePermissions>, ()> {
    let Some(membership_type) = workspace_membership_type(
        contact_data,
        outbound,
        resolved_ws_id,
        user_id,
        access_token,
    )
    .await?
    else {
        return Ok(None);
    };
    let Some(workspace) = workspace_row(contact_data, outbound, resolved_ws_id).await? else {
        return Ok(None);
    };

    let role_permissions = if membership_type == "MEMBER" {
        workspace_role_permissions(contact_data, outbound, resolved_ws_id, user_id).await?
    } else {
        Vec::new()
    };
    let default_permissions =
        workspace_default_permissions(contact_data, outbound, resolved_ws_id, &membership_type)
            .await?;
    let is_creator =
        membership_type == "MEMBER" && workspace.creator_id.as_deref() == Some(user_id);

    if !is_creator && role_permissions.is_empty() && default_permissions.is_empty() {
        return Ok(None);
    }

    let mut permissions = Vec::new();
    extend_unique_permissions(&mut permissions, role_permissions);
    extend_unique_permissions(&mut permissions, default_permissions);

    Ok(Some(EffectiveWorkspacePermissions {
        has_all_permissions: is_creator
            || permissions.iter().any(|value| value == ADMIN_PERMISSION),
        permissions,
    }))
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(Some(resolved_ws_id));
        }

        let access_token_auth = DataAuth::AccessToken(access_token);
        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, &access_token_auth).await?
        {
            return Ok(Some(workspace_id));
        }

        let service_role_auth = DataAuth::ServiceRole;
        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, &service_role_auth).await?
        {
            return Ok(Some(workspace_id));
        }
    }

    Ok(Some(resolved_ws_id))
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id,workspace_members!inner(user_id,type)".to_owned(),
            ),
            ("personal", "eq.true".to_owned()),
            ("workspace_members.user_id", format!("eq.{user_id}")),
            ("workspace_members.type", "eq.MEMBER".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        &DataAuth::AccessToken(access_token),
    )
    .await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    auth: &DataAuth<'_>,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id".to_owned()),
            ("handle", format!("eq.{handle}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response =
        send_rest_request(contact_data, outbound, OutboundMethod::Get, &url, auth).await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}

async fn workspace_membership_type(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        &DataAuth::AccessToken(access_token),
    )
    .await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceMembershipRow>(&response)?
        .map(|row| row.membership_type.unwrap_or_else(|| "MEMBER".to_owned())))
}

async fn workspace_row(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Option<WorkspaceRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "creator_id".to_owned()),
            ("id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        &DataAuth::ServiceRole,
    )
    .await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    decode_first_row::<WorkspaceRow>(&response)
}

async fn workspace_role_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_role_members",
        &[
            (
                "select",
                "workspace_roles!inner(workspace_role_permissions(permission))".to_owned(),
            ),
            ("user_id", format!("eq.{user_id}")),
            ("workspace_roles.ws_id", format!("eq.{ws_id}")),
            (
                "workspace_roles.workspace_role_permissions.enabled",
                "eq.true".to_owned(),
            ),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        &DataAuth::ServiceRole,
    )
    .await?;

    if !is_success_status(response.status) {
        return Ok(Vec::new());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    let mut permissions = Vec::new();
    for row in rows {
        collect_role_permissions(&row, &mut permissions);
    }

    Ok(permissions)
}

async fn workspace_default_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    membership_type: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_default_permissions",
        &[
            ("select", "permission".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("member_type", format!("eq.{membership_type}")),
            ("enabled", "eq.true".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        &DataAuth::ServiceRole,
    )
    .await?;

    if !is_success_status(response.status) {
        return Ok(Vec::new());
    }

    Ok(response
        .json::<Vec<PermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
}

async fn send_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
    auth: &DataAuth<'_>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = match auth {
        DataAuth::AccessToken(access_token) => format!("Bearer {access_token}"),
        DataAuth::ServiceRole => format!("Bearer {service_role_key}"),
    };

    outbound
        .send(
            OutboundRequest::new(method, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

fn request_access_token_ignoring_app_sessions(request: BackendRequest<'_>) -> Option<String> {
    bearer_access_token(request.authorization).or_else(|| {
        request
            .cookie
            .and_then(supabase_access_token_from_cookie_header)
    })
}

fn bearer_access_token(authorization: Option<&str>) -> Option<String> {
    let authorization = authorization?.trim();
    let token = authorization
        .strip_prefix("Bearer ")
        .or_else(|| authorization.strip_prefix("bearer "))?
        .trim();

    if token.is_empty() || token.starts_with(APP_SESSION_BEARER_PREFIX) {
        return None;
    }

    Some(token.to_owned())
}

fn supabase_access_token_from_cookie_header(cookie_header: &str) -> Option<String> {
    let groups = supabase_auth_cookie_groups(cookie_header);

    groups
        .values()
        .filter_map(supabase_auth_cookie_value)
        .find_map(|value| access_token_from_supabase_cookie_value(&value))
}

fn supabase_auth_cookie_groups(cookie_header: &str) -> BTreeMap<String, SupabaseAuthCookieGroup> {
    let mut groups = BTreeMap::<String, SupabaseAuthCookieGroup>::new();

    for (name, value) in cookie_header
        .split(';')
        .filter_map(|cookie| cookie.trim().split_once('='))
    {
        let Some((storage_key, chunk_index)) = supabase_auth_cookie_name_parts(name.trim()) else {
            continue;
        };
        let group = groups.entry(storage_key).or_default();

        match chunk_index {
            Some(index) => {
                if group
                    .chunks
                    .insert(index, value.trim().to_owned())
                    .is_some()
                {
                    group.duplicate = true;
                }
            }
            None => {
                if group.base.is_some() {
                    group.duplicate = true;
                }
                group.base = Some(value.trim().to_owned());
            }
        }
    }

    groups
}

fn supabase_auth_cookie_name_parts(name: &str) -> Option<(String, Option<usize>)> {
    if !name.starts_with("sb-") {
        return None;
    }

    if name.ends_with("-auth-token") {
        return Some((name.to_owned(), None));
    }

    let (storage_key, suffix) = name.rsplit_once('.')?;

    if !storage_key.ends_with("-auth-token") {
        return None;
    }

    suffix
        .parse::<usize>()
        .ok()
        .map(|index| (storage_key.to_owned(), Some(index)))
}

fn supabase_auth_cookie_value(group: &SupabaseAuthCookieGroup) -> Option<String> {
    if group.duplicate {
        return None;
    }

    match (&group.base, group.chunks.is_empty()) {
        (Some(base), true) => return Some(base.clone()),
        (Some(_), false) | (None, true) => return None,
        (None, false) => {}
    }

    let mut value = String::new();
    for index in 0..group.chunks.len() {
        value.push_str(group.chunks.get(&index)?);
    }

    Some(value)
}

fn access_token_from_supabase_cookie_value(cookie_value: &str) -> Option<String> {
    let session =
        if let Some(base64_body) = cookie_value.strip_prefix(SUPABASE_AUTH_COOKIE_BASE64_PREFIX) {
            let mut padded = base64_body.to_owned();
            while padded.len() % 4 != 0 {
                padded.push('=');
            }
            let decoded = URL_SAFE.decode(padded.as_bytes()).ok()?;
            serde_json::from_slice::<SupabaseCookieSession>(&decoded).ok()?
        } else if cookie_value.starts_with('{') {
            serde_json::from_str::<SupabaseCookieSession>(cookie_value).ok()?
        } else {
            return None;
        };

    session
        .access_token
        .filter(|token| !token.trim().is_empty())
}

fn collect_role_permissions(value: &Value, permissions: &mut Vec<String>) {
    match value {
        Value::Array(items) => {
            for item in items {
                collect_role_permissions(item, permissions);
            }
        }
        Value::Object(map) => {
            if let Some(permission) = map.get("permission").and_then(Value::as_str) {
                permissions.push(permission.to_owned());
            }
            if let Some(role_permissions) = map.get("workspace_role_permissions") {
                collect_role_permissions(role_permissions, permissions);
            }
            if let Some(workspace_roles) = map.get("workspace_roles") {
                collect_role_permissions(workspace_roles, permissions);
            }
        }
        _ => {}
    }
}

fn extend_unique_permissions(permissions: &mut Vec<String>, values: Vec<String>) {
    for permission in values {
        if !permissions.iter().any(|value| value == &permission) {
            permissions.push(permission);
        }
    }
}

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn is_direct_workspace_lookup_identifier(identifier: &str) -> bool {
    let normalized = identifier.trim().to_lowercase();

    normalized == PERSONAL_WORKSPACE_SLUG
        || normalized == ROOT_WORKSPACE_ID
        || normalized == INTERNAL_WORKSPACE_SLUG
        || is_workspace_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

fn is_workspace_uuid_literal(value: &str) -> bool {
    value.trim().len() == 36
        && value
            .trim()
            .chars()
            .enumerate()
            .all(|(index, value)| match index {
                8 | 13 | 18 | 23 => value == '-',
                _ => value.is_ascii_hexdigit(),
            })
}

fn is_workspace_handle(value: &str) -> bool {
    let length = value.len();
    if length == 0 || length > 64 {
        return false;
    }

    value.chars().enumerate().all(|(index, character)| {
        let is_edge = index == 0 || index + 1 == length;
        character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || (!is_edge && matches!(character, '_' | '-'))
    })
}

fn decode_first_row<T: for<'de> Deserialize<'de>>(
    response: &OutboundResponse,
) -> Result<Option<T>, ()> {
    response
        .json::<Vec<T>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}
