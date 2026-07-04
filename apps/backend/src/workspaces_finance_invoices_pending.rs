//! Handler for `GET /api/v1/workspaces/:wsId/finance/invoices/pending`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/finance/invoices/pending/route.ts`.
//!
//! Auth + permissions: the legacy route resolves the finance route auth context
//! and requires the `view_invoices` workspace permission. This handler reuses
//! `finance_auth::authorize_finance_permission` for authentication,
//! workspace-id normalization, and the permission check, matching the legacy
//! status codes:
//!   * missing/invalid session or unresolved workspace -> `401 Unauthorized`
//!   * authenticated caller lacking `view_invoices`     -> `403 Unauthorized`
//!   * invalid query parameters                         -> `400` with
//!     `{ "message": "Invalid query parameters" }`
//!   * Postgres statement timeout (SQLSTATE 57014)      -> `504` with
//!     `{ "message": "Timed out loading pending invoices. Please try again." }`
//!   * any other upstream / config failure             -> `500` with
//!     `{ "message": "Internal server error" }`
//!
//! Data: the legacy route calls Postgres RPCs via the admin (service-role)
//! client (RLS bypassed; scoped purely by `p_ws_id`). This handler issues the
//! same RPC POSTs through the outbound client using the service-role key.
//!
//! Response branches (matching legacy JSON exactly):
//!   1. `countOnly=true`  -> bare JSON number from the count RPC (`count || 0`),
//!      RPC name chosen by `groupByUser`.
//!   2. `currentMonthOnly=true` -> bare JSON number: fetch up to 10000 rows
//!      (offset 0) via the data RPC, then count rows whose `months_owed`
//!      contains the current `YYYY-MM` (UTC).
//!   3. default -> `{ data: <sanitized rows>, count: <total count || 0> }`.
//!      `data` rows have `user_avatar_url` normalized via the ported
//!      `normalize_avatar_image_src` helper (the only copied helper; see notes).
//!
//! NOTE on copied helpers: `normalize_avatar_image_src` is a file-local port of
//! `@tuturuuu/utils/avatar-url`'s `normalizeAvatarImageSrc`
//! (`sanitizePendingInvoiceAvatarRows`). It is reproduced here rather than
//! shared, per the single-file constraint.

use serde::Serialize;
use serde_json::{Value, json};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorization, FinanceAuthorizationError, authorize_finance_permission},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const PENDING_PATH_PREFIX: &str = "/api/v1/workspaces/";
const PENDING_PATH_SUFFIX: &str = "/finance/invoices/pending";
const VIEW_INVOICES_PERMISSION: &str = "view_invoices";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";
const INTERNAL_ERROR_MESSAGE: &str = "Internal server error";
const TIMEOUT_MESSAGE: &str = "Timed out loading pending invoices. Please try again.";

// Mirrors `MAX_MEDIUM_TEXT_LENGTH` from `@tuturuuu/utils/constants`.
const MAX_PAGE_SIZE: i64 = 1000;
// Legacy `currentMonthOnly` branch fetches up to 10000 rows.
const CURRENT_MONTH_LIMIT: i64 = 10_000;
// Postgres `query_canceled` SQLSTATE used by statement_timeout.
const PG_QUERY_CANCELED_CODE: &str = "57014";

const GET_PENDING_INVOICES_RPC: &str = "get_pending_invoices";
const GET_PENDING_INVOICES_GROUPED_RPC: &str = "get_pending_invoices_grouped_by_user";
const GET_PENDING_INVOICES_COUNT_RPC: &str = "get_pending_invoices_count";
const GET_PENDING_INVOICES_GROUPED_COUNT_RPC: &str = "get_pending_invoices_grouped_by_user_count";

// ---------------------------------------------------------------------------
// Query parsing (mirrors PendingInvoicesParamsSchema zod schema)
// ---------------------------------------------------------------------------

struct PendingQuery {
    page: i64,
    page_size: i64,
    q: String,
    user_ids: Vec<String>,
    group_by_user: bool,
    count_only: bool,
    current_month_only: bool,
}

// ---------------------------------------------------------------------------
// RPC request bodies
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct CountRpcRequest<'a> {
    p_ws_id: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_query: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_user_ids: Option<&'a [String]>,
}

#[derive(Serialize)]
struct DataRpcRequest<'a> {
    p_ws_id: &'a str,
    p_limit: i64,
    p_offset: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_query: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_user_ids: Option<&'a [String]>,
}

/// Upstream failure carrying enough detail to map Postgres timeouts to 504.
enum RpcError {
    /// Postgres statement timeout (SQLSTATE 57014) -> legacy returns 504.
    Timeout,
    /// Any other failure (config missing, transport, non-2xx, parse) -> 500.
    Internal,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_finance_invoices_pending_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = pending_ws_id(request.path)?;

    Some(match request.method {
        "GET" => pending_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn pending_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Legacy resolves access + checks `view_invoices` before parsing query.
    let authorization = match authorize_finance_permission(
        config,
        request,
        raw_ws_id,
        VIEW_INVOICES_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(FinanceAuthorizationError::Unauthorized | FinanceAuthorizationError::NotFound) => {
            return message_response(401, UNAUTHORIZED_MESSAGE);
        }
        Err(FinanceAuthorizationError::Forbidden) => {
            return message_response(403, UNAUTHORIZED_MESSAGE);
        }
        Err(FinanceAuthorizationError::Internal) => {
            return message_response(500, INTERNAL_ERROR_MESSAGE);
        }
    };

    let query = match pending_query_from_url(request.url) {
        Some(query) => query,
        None => return message_response(400, INVALID_QUERY_MESSAGE),
    };

    let user_ids = optional_slice(&query.user_ids);
    let q = optional_query(&query.q);

    // ----- Branch 1: countOnly -----------------------------------------
    if query.count_only {
        let rpc_name = count_rpc_name(query.group_by_user);
        return match fetch_count(
            &config.contact_data,
            outbound,
            &authorization,
            rpc_name,
            q,
            user_ids,
        )
        .await
        {
            Ok(count) => no_store_response(json_response(200, count)),
            Err(error) => error_response(error),
        };
    }

    // ----- Fetch invoice rows ------------------------------------------
    let data_rpc = data_rpc_name(query.group_by_user);
    let offset = if query.current_month_only {
        0
    } else {
        (query.page - 1) * query.page_size
    };
    let limit = if query.current_month_only {
        CURRENT_MONTH_LIMIT
    } else {
        query.page_size
    };

    let rows = match fetch_rows(
        &config.contact_data,
        outbound,
        &authorization,
        data_rpc,
        limit,
        offset,
        q,
        user_ids,
    )
    .await
    {
        Ok(rows) => rows,
        Err(error) => return error_response(error),
    };

    // ----- Branch 2: currentMonthOnly ----------------------------------
    if query.current_month_only {
        let current_month = current_month_utc();
        let count = rows
            .iter()
            .filter(|row| row_owes_current_month(row, &current_month))
            .count();
        return no_store_response(json_response(200, count));
    }

    // ----- Branch 3: default (data + total count) ----------------------
    let count_rpc = count_rpc_name(query.group_by_user);
    let total_count = match fetch_count(
        &config.contact_data,
        outbound,
        &authorization,
        count_rpc,
        q,
        user_ids,
    )
    .await
    {
        Ok(count) => count,
        Err(error) => return error_response(error),
    };

    let sanitized: Vec<Value> = rows.into_iter().map(sanitize_invoice_row).collect();

    no_store_response(json_response(
        200,
        json!({
            "data": sanitized,
            "count": total_count,
        }),
    ))
}

// ---------------------------------------------------------------------------
// RPC fetch helpers (admin / service-role)
// ---------------------------------------------------------------------------

async fn fetch_count(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    rpc_name: &str,
    q: Option<&str>,
    user_ids: Option<&[String]>,
) -> Result<i64, RpcError> {
    let body = serde_json::to_string(&CountRpcRequest {
        p_ws_id: &authorization.ws_id,
        p_query: q,
        p_user_ids: user_ids,
    })
    .map_err(|_| RpcError::Internal)?;

    let value = post_rpc(contact_data, outbound, rpc_name, &body).await?;

    // Legacy: `count || 0`. The RPC returns a scalar number (or null).
    Ok(js_number_or_zero(&value))
}

#[allow(clippy::too_many_arguments)]
async fn fetch_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    rpc_name: &str,
    limit: i64,
    offset: i64,
    q: Option<&str>,
    user_ids: Option<&[String]>,
) -> Result<Vec<Value>, RpcError> {
    let body = serde_json::to_string(&DataRpcRequest {
        p_ws_id: &authorization.ws_id,
        p_limit: limit,
        p_offset: offset,
        p_query: q,
        p_user_ids: user_ids,
    })
    .map_err(|_| RpcError::Internal)?;

    let value = post_rpc(contact_data, outbound, rpc_name, &body).await?;

    // Legacy uses `data || []`; the set-returning RPC serializes as a JSON array
    // (or null). Anything else is treated as empty, mirroring `|| []`.
    Ok(match value {
        Value::Array(rows) => rows,
        _ => Vec::new(),
    })
}

/// Issues an RPC POST with the service-role key and returns the parsed JSON
/// `Value`. A non-2xx response is inspected for the Postgres `57014`
/// (query_canceled) SQLSTATE so the caller can surface a 504 like the legacy
/// route does.
async fn post_rpc(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    function: &str,
    body: &str,
) -> Result<Value, RpcError> {
    let rpc_url = contact_data.rpc_url(function).ok_or(RpcError::Internal)?;
    let service_role_key = contact_data.service_role_key().ok_or(RpcError::Internal)?;
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(body),
        )
        .await
        .map_err(|_| RpcError::Internal)?;

    if !(200..300).contains(&response.status) {
        // PostgREST surfaces Postgres errors as a JSON object carrying a `code`
        // field. A `57014` code means the statement timed out -> 504.
        if response_is_timeout(&response.body_text) {
            return Err(RpcError::Timeout);
        }
        return Err(RpcError::Internal);
    }

    response.json::<Value>().map_err(|_| RpcError::Internal)
}

/// Detects the Postgres `57014` (query_canceled) SQLSTATE in a PostgREST error
/// body. PostgREST emits `{ "code": "57014", "message": "...", ... }`.
fn response_is_timeout(body_text: &str) -> bool {
    serde_json::from_str::<Value>(body_text)
        .ok()
        .as_ref()
        .and_then(|value| value.get("code"))
        .and_then(Value::as_str)
        == Some(PG_QUERY_CANCELED_CODE)
}

// ---------------------------------------------------------------------------
// Current-month filtering (mirrors the currentMonthOnly branch)
// ---------------------------------------------------------------------------

/// `${year}-${pad2(month)}` for the current UTC date (legacy uses local time via
/// `new Date()`, but the Worker runtime operates in UTC; we mirror that).
fn current_month_utc() -> String {
    let days = now_unix_millis().div_euclid(24 * 60 * 60 * 1000);
    let (year, month, _day) = civil_from_days(days);
    format!("{year:04}-{month:02}")
}

/// Mirrors the legacy `months_owed` handling:
///   * array -> use entries as strings;
///   * comma-delimited string -> split + trim;
///   * otherwise -> empty.
///     Returns true when `current_month` is present.
fn row_owes_current_month(row: &Value, current_month: &str) -> bool {
    match row.get("months_owed") {
        Some(Value::Array(items)) => items.iter().any(|item| {
            item.as_str()
                .map(|text| text == current_month)
                .unwrap_or(false)
        }),
        Some(Value::String(text)) => text
            .split(',')
            .map(str::trim)
            .any(|month| month == current_month),
        _ => false,
    }
}

// ---------------------------------------------------------------------------
// Row sanitization (mirrors sanitizePendingInvoiceAvatarRows)
// ---------------------------------------------------------------------------

fn sanitize_invoice_row(row: Value) -> Value {
    let Value::Object(mut object) = row else {
        // Legacy spreads `...row`; non-objects are not expected from the RPC,
        // but pass them through unchanged to avoid dropping data.
        return row;
    };

    let normalized = object
        .get("user_avatar_url")
        .and_then(Value::as_str)
        .and_then(normalize_avatar_image_src);

    object.insert(
        "user_avatar_url".to_owned(),
        normalized.map_or(Value::Null, Value::String),
    );

    Value::Object(object)
}

/// File-local port of `@tuturuuu/utils/avatar-url` `normalizeAvatarImageSrc`.
/// Returns `Some(normalized_src)` or `None` (mapped to JSON null by the caller).
fn normalize_avatar_image_src(value: &str) -> Option<String> {
    let src = value.trim();

    if src.is_empty() || src.starts_with("//") || is_uuid_v1_to_v5(src) {
        return None;
    }

    if has_http_scheme(src) {
        return Some(normalize_supabase_public_avatar_url(src));
    }

    if src.starts_with('/')
        || src.starts_with("blob:")
        || is_data_image(src)
        || src.starts_with("avatars/")
    {
        return Some(src.to_owned());
    }

    None
}

/// Mirrors `normalizeSupabasePublicAvatarUrl`: rewrites a malformed Supabase
/// public-avatar path to the canonical one, leaving everything else untouched.
fn normalize_supabase_public_avatar_url(src: &str) -> String {
    const PUBLIC: &str = "/storage/v1/object/public/avatars/";
    const MALFORMED: &str = "/storage/v1/object/v1/public/avatars/";

    let Ok(mut url) = url::Url::parse(src) else {
        return src.to_owned();
    };

    let host_ok = url
        .host_str()
        .map(|host| host.ends_with(".supabase.co"))
        .unwrap_or(false);
    if !host_ok {
        return src.to_owned();
    }

    let path = url.path();
    let object_path = if let Some(rest) = path.strip_prefix(PUBLIC) {
        rest.to_owned()
    } else if let Some(rest) = path.strip_prefix(MALFORMED) {
        rest.to_owned()
    } else {
        return src.to_owned();
    };

    url.set_path(&format!("{PUBLIC}{object_path}"));
    url.to_string()
}

/// `^https?://` (case-insensitive), matching the legacy `/^https?:\/\//iu` test.
fn has_http_scheme(src: &str) -> bool {
    let lower = src.to_ascii_lowercase();
    lower.starts_with("http://") || lower.starts_with("https://")
}

/// `^data:image/` (case-insensitive), matching `/^data:image\//iu`.
fn is_data_image(src: &str) -> bool {
    let lower = src.to_ascii_lowercase();
    lower.starts_with("data:image/")
}

/// Matches the legacy `UUID_PATTERN`:
/// `^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`
/// (case-insensitive).
fn is_uuid_v1_to_v5(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 36 {
        return false;
    }
    for (index, byte) in bytes.iter().enumerate() {
        match index {
            8 | 13 | 18 | 23 => {
                if *byte != b'-' {
                    return false;
                }
            }
            14 => {
                // version nibble: 1-5
                if !matches!(byte, b'1'..=b'5') {
                    return false;
                }
            }
            19 => {
                // variant nibble: 8, 9, a, b (case-insensitive)
                let lower = byte.to_ascii_lowercase();
                if !matches!(lower, b'8' | b'9' | b'a' | b'b') {
                    return false;
                }
            }
            _ => {
                if !byte.is_ascii_hexdigit() {
                    return false;
                }
            }
        }
    }
    true
}

// ---------------------------------------------------------------------------
// Query parsing helpers
// ---------------------------------------------------------------------------

fn optional_slice(values: &[String]) -> Option<&[String]> {
    // Legacy: `userIds.length > 0 ? userIds : undefined`.
    (!values.is_empty()).then_some(values)
}

fn optional_query(q: &str) -> Option<&str> {
    // Legacy: `q || undefined` (empty string -> undefined).
    (!q.is_empty()).then_some(q)
}

fn count_rpc_name(group_by_user: bool) -> &'static str {
    if group_by_user {
        GET_PENDING_INVOICES_GROUPED_COUNT_RPC
    } else {
        GET_PENDING_INVOICES_COUNT_RPC
    }
}

fn data_rpc_name(group_by_user: bool) -> &'static str {
    if group_by_user {
        GET_PENDING_INVOICES_GROUPED_RPC
    } else {
        GET_PENDING_INVOICES_RPC
    }
}

/// Parses + validates the query string, mirroring `PendingInvoicesParamsSchema`.
/// Returns `None` when validation fails (legacy zod `safeParse` -> 400).
fn pending_query_from_url(request_url: Option<&str>) -> Option<PendingQuery> {
    let mut page_raw: Option<String> = None;
    let mut page_size_raw: Option<String> = None;
    let mut q: Option<String> = None;
    let mut user_ids: Vec<String> = Vec::new();
    let mut group_by_user_raw: Option<String> = None;
    let mut count_only_raw: Option<String> = None;
    let mut current_month_only_raw: Option<String> = None;

    if let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) {
        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "page" if page_raw.is_none() => page_raw = Some(value.into_owned()),
                "pageSize" if page_size_raw.is_none() => {
                    page_size_raw = Some(value.into_owned());
                }
                "q" if q.is_none() => q = Some(value.into_owned()),
                // Legacy collapses repeated/single values to an array of all of
                // them; empty single values become `[]` but repeated values are
                // kept verbatim. We accumulate each occurrence here.
                "userIds" => user_ids.push(value.into_owned()),
                "groupByUser" if group_by_user_raw.is_none() => {
                    group_by_user_raw = Some(value.into_owned());
                }
                "countOnly" if count_only_raw.is_none() => {
                    count_only_raw = Some(value.into_owned());
                }
                "currentMonthOnly" if current_month_only_raw.is_none() => {
                    current_month_only_raw = Some(value.into_owned());
                }
                _ => {}
            }
        }
    }

    // page: coerce(number).int().min(1).default(1).
    let page = parse_coerced_int(page_raw.as_deref(), 1, Some(1), None)?;
    // pageSize: coerce(number).int().min(1).max(MAX_MEDIUM_TEXT_LENGTH).default(10).
    let page_size = parse_coerced_int(page_size_raw.as_deref(), 10, Some(1), Some(MAX_PAGE_SIZE))?;

    // q: string().default('').
    let q = q.unwrap_or_default();

    // userIds: union(string, array(string)) transformed to array. A lone empty
    // single value yields `[]` (legacy `val ? [val] : []`). Multiple occurrences
    // are kept as-is.
    let user_ids = normalize_user_ids(user_ids);

    // groupByUser / countOnly / currentMonthOnly: enum('true','false')
    // .default('false') -> bool.
    let group_by_user = parse_bool_enum(group_by_user_raw.as_deref())?;
    let count_only = parse_bool_enum(count_only_raw.as_deref())?;
    let current_month_only = parse_bool_enum(current_month_only_raw.as_deref())?;

    Some(PendingQuery {
        page,
        page_size,
        q,
        user_ids,
        group_by_user,
        count_only,
        current_month_only,
    })
}

/// Reproduces the `userIds` zod transform:
///   * 0 occurrences  -> `[]` (schema default)
///   * 1 occurrence   -> `val ? [val] : []` (empty string collapses to `[]`)
///   * N occurrences  -> the array verbatim (`getAll` semantics)
fn normalize_user_ids(values: Vec<String>) -> Vec<String> {
    match values.len() {
        0 => Vec::new(),
        1 => {
            if values[0].is_empty() {
                Vec::new()
            } else {
                values
            }
        }
        _ => values,
    }
}

/// Mirrors `z.coerce.number().int().min(min)[.max(max)].default(default_value)`
/// against a single query value. `None`/absent -> default. Returns `None` (i.e.
/// validation failure -> 400) when coercion fails, the value is non-integer, or
/// it falls outside the bounds.
fn parse_coerced_int(
    raw: Option<&str>,
    default_value: i64,
    min: Option<i64>,
    max: Option<i64>,
) -> Option<i64> {
    let Some(raw) = raw else {
        return Some(default_value);
    };

    // `z.coerce.number()` uses JS `Number(value)`: empty/whitespace -> 0.
    let number = parse_js_number(raw)?;
    // `.int()` rejects non-integers.
    if number.fract() != 0.0 {
        return None;
    }
    let value = number as i64;
    if let Some(min) = min
        && value < min
    {
        return None;
    }
    if let Some(max) = max
        && value > max
    {
        return None;
    }
    Some(value)
}

/// Mirrors `z.enum(['true','false']).default('false').transform(v => v==='true')`.
/// Absent -> `false`. Present must be exactly `"true"` or `"false"`; anything
/// else fails validation (legacy zod enum -> 400).
fn parse_bool_enum(raw: Option<&str>) -> Option<bool> {
    match raw {
        None => Some(false),
        Some("true") => Some(true),
        Some("false") => Some(false),
        Some(_) => None,
    }
}

/// JS `Number(value)` for the integer query params: trims whitespace, empty ->
/// 0, rejects non-numeric (`NaN`) and non-finite.
fn parse_js_number(raw: &str) -> Option<f64> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Some(0.0);
    }
    let parsed = trimmed.parse::<f64>().ok()?;
    parsed.is_finite().then_some(parsed)
}

/// Coerces a scalar JSON value to an `i64`, mirroring legacy `count || 0`.
fn js_number_or_zero(value: &Value) -> i64 {
    match value {
        Value::Number(number) => number
            .as_i64()
            .or_else(|| number.as_f64().map(|float| float as i64))
            .unwrap_or(0),
        Value::String(text) => text.trim().parse::<i64>().unwrap_or(0),
        _ => 0,
    }
}

// ---------------------------------------------------------------------------
// Civil-date arithmetic (UTC "now" -> YYYY-MM)
// ---------------------------------------------------------------------------

fn now_unix_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

/// Howard Hinnant's civil_from_days, returning `(year, month, day)`.
fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    (if month <= 2 { year + 1 } else { year }, month, day)
}

// ---------------------------------------------------------------------------
// Path + response helpers
// ---------------------------------------------------------------------------

fn pending_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(PENDING_PATH_PREFIX)?
        .strip_suffix(PENDING_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn error_response(error: RpcError) -> BackendResponse {
    match error {
        RpcError::Timeout => message_response(504, TIMEOUT_MESSAGE),
        RpcError::Internal => message_response(500, INTERNAL_ERROR_MESSAGE),
    }
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
