use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const FORBIDDEN_MESSAGE: &str = "Forbidden";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const INVENTORY_APP_SESSION_TARGETS: [&str; 1] = ["inventory"];
const INVENTORY_REALTIME_SECRET: &str = "ENABLE_INVENTORY_REALTIME_BROADCAST";
const INVENTORY_SALES_RPC: &str = "get_inventory_sales";
const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const FETCH_FAILED_MESSAGE: &str = "Failed to fetch inventory sales";
const NOT_FOUND_MESSAGE: &str = "Not found";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const PRIVATE_SCHEMA: &str = "private";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const WORKSPACES_INVENTORY_SALES_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_INVENTORY_SALES_PATH_SUFFIX: &str = "/inventory/sales";

const DEFAULT_LIMIT: i64 = 50;
const DEFAULT_OFFSET: i64 = 0;
const MIN_LIMIT: i64 = 1;
const MAX_LIMIT: i64 = 100;
const MIN_OFFSET: i64 = 0;

// Mirrors `canViewInventorySales` in apps/web/src/lib/inventory/permissions.ts:
// access is granted when the caller holds ANY of these permissions. Workspace
// creators / admins are covered by the `has_all_permissions` shortcut.
const VIEW_INVENTORY_SALES_PERMISSIONS: [&str; 2] = ["view_inventory_sales", "view_invoices"];

// `CHECKOUT_HISTORY_SELECT` (subset used by `mapCheckoutSaleSummary`) from
// apps/web/src/lib/inventory/commerce/checkouts.ts.
const CHECKOUT_HISTORY_SELECT: &str = "id,public_token,customer_name,customer_email,note,currency,total_amount,completed_at,created_at,polar_order_id";
const CHECKOUT_LINE_SELECT: &str = "id,checkout_session_id,quantity";

#[derive(Serialize)]
struct WorkspaceInventorySalesResponse {
    count: i64,
    data: Vec<Value>,
    realtime_enabled: bool,
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
struct WorkspaceCreatorRow {
    creator_id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceDefaultPermissionRow {
    permission: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceSecretRow {
    value: Option<String>,
}

// Row returned by the `get_inventory_sales` RPC: `{ sale, total_count }`.
#[derive(Deserialize)]
struct InventorySalesRpcRow {
    sale: Option<Value>,
    total_count: Option<Value>,
}

#[derive(Deserialize)]
struct CheckoutSessionRow {
    id: Option<String>,
    public_token: Option<String>,
    customer_name: Option<String>,
    customer_email: Option<String>,
    note: Option<String>,
    currency: Option<String>,
    total_amount: Option<Value>,
    completed_at: Option<String>,
    created_at: Option<String>,
    polar_order_id: Option<String>,
}

#[derive(Deserialize)]
struct CheckoutLineRow {
    checkout_session_id: Option<String>,
    quantity: Option<Value>,
}

struct AuthenticatedUser {
    access_token: Option<String>,
    id: String,
}

enum DataAuth<'a> {
    AccessToken(&'a str),
    ServiceRole,
}

struct ParsedQuery {
    limit: i64,
    offset: i64,
}

pub(crate) async fn handle_workspaces_inventory_sales_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_inventory_sales_ws_id(request.path)?;

    Some(match request.method {
        "GET" => sales_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn sales_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    let Some(user) = authenticated_user(config, request, outbound).await else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    // `normalizeWorkspaceId` throwing maps to 404 `{ error: "Not found" }`.
    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user).await {
            Ok(Some(ws_id)) => ws_id,
            Ok(None) | Err(()) => return error_response(404, NOT_FOUND_MESSAGE),
        };

    // `verifyWorkspaceMembershipType` (default requiredType = MEMBER).
    let membership_type =
        match workspace_membership_type(contact_data, outbound, &resolved_ws_id, &user).await {
            Ok(membership_type) => membership_type,
            Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
        };
    match membership_type.as_deref() {
        Some("MEMBER") => {}
        _ => return message_response(403, FORBIDDEN_MESSAGE),
    }

    // Mirror `canViewInventorySales` against the resolved permission set. A
    // failure to resolve permissions maps to the legacy `getPermissions` ->
    // null -> 404 `{ error: "Not found" }` path.
    let can_view = match can_view_inventory_sales(
        contact_data,
        outbound,
        &resolved_ws_id,
        &user,
        membership_type.as_deref(),
    )
    .await
    {
        Ok(can_view) => can_view,
        Err(()) => return error_response(404, NOT_FOUND_MESSAGE),
    };
    if !can_view {
        return message_response(403, FORBIDDEN_MESSAGE);
    }

    // Zod `SearchParamsSchema.safeParse` failure -> 400.
    let ParsedQuery { limit, offset } = match parse_query(request.url) {
        Some(parsed) => parsed,
        None => {
            return no_store_response(json_response(
                400,
                json!({ "message": INVALID_QUERY_MESSAGE, "errors": [] }),
            ));
        }
    };

    let window_limit = limit + offset;

    let finance_sales =
        fetch_finance_sales(contact_data, outbound, &resolved_ws_id, window_limit).await;
    let checkout_sales =
        fetch_checkout_sales(contact_data, outbound, &resolved_ws_id, window_limit).await;

    let (finance_sales, checkout_sales) = match (finance_sales, checkout_sales) {
        (Ok(finance_sales), Ok(checkout_sales)) => (finance_sales, checkout_sales),
        _ => return message_response(500, FETCH_FAILED_MESSAGE),
    };

    let realtime_enabled = inventory_realtime_enabled(contact_data, outbound, &resolved_ws_id)
        .await
        .unwrap_or(false);

    let count = finance_sales.count + checkout_sales.count;

    let mut data: Vec<Value> = Vec::new();
    data.extend(finance_sales.data.into_iter().map(normalize_finance_sale));
    data.extend(checkout_sales.data);

    // Sort by `completed_at ?? created_at` descending (most recent first).
    // `sort_by` is stable; the legacy `Array.prototype.sort` is also stable.
    data.sort_by_key(|sale| std::cmp::Reverse(sale_timestamp(sale)));

    // `.slice(offset, offset + limit)`.
    let start = offset.max(0) as usize;
    let end = start.saturating_add(limit.max(0) as usize);
    let data = if start >= data.len() {
        Vec::new()
    } else {
        data[start..end.min(data.len())].to_vec()
    };

    no_store_response(json_response(
        200,
        WorkspaceInventorySalesResponse {
            count,
            data,
            realtime_enabled,
        },
    ))
}

struct SalesPage {
    count: i64,
    data: Vec<Value>,
}

/// Mirrors `getInventorySales({ limit: windowLimit, offset: 0, wsId })`: the
/// private-schema `get_inventory_sales` RPC returning rows shaped
/// `{ sale, total_count }`. The count is read from the first row's `total_count`;
/// the sale objects are collected (truthy filter) in order.
async fn fetch_finance_sales(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    window_limit: i64,
) -> Result<SalesPage, ()> {
    let url = contact_data.rpc_url(INVENTORY_SALES_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&json!({
        "p_limit": window_limit,
        "p_offset": 0,
        "p_ws_id": ws_id,
    }))
    .map_err(|_| ())?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let rows = response
        .json::<Vec<InventorySalesRpcRow>>()
        .map_err(|_| ())?;
    let count = rows
        .first()
        .and_then(|row| row.total_count.as_ref())
        .map(value_as_count)
        .unwrap_or(0);
    let data = rows
        .into_iter()
        .filter_map(|row| row.sale)
        .filter(|sale| !sale.is_null())
        .collect();

    Ok(SalesPage { count, data })
}

/// Mirrors `listCompletedCheckoutSales({ limit: windowLimit, offset: 0, wsId })`:
/// reads completed `private.inventory_checkout_sessions` rows (with exact count)
/// and their lines, then maps each session into the `InventorySaleSummary` shape
/// via `mapCheckoutSaleSummary`.
async fn fetch_checkout_sales(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    window_limit: i64,
) -> Result<SalesPage, ()> {
    // `normalizeLimitOffset(windowLimit, 0)` -> limit clamped to [1, 100],
    // offset clamped to >= 0; `.range(offset, offset + limit - 1)`. supabase-js
    // `.range()` translates to `offset`/`limit` query params for PostgREST.
    let limit = window_limit.clamp(1, 100);

    let url = contact_data
        .rest_url(
            "inventory_checkout_sessions",
            &[
                ("select", CHECKOUT_HISTORY_SELECT.to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("status", "eq.completed".to_owned()),
                ("order", "completed_at.desc,created_at.desc".to_owned()),
                ("offset", "0".to_owned()),
                ("limit", limit.to_string()),
            ],
        )
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Prefer", "count=exact"),
        )
        .await
        .map_err(|_| ())?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let content_range_count = response
        .header("content-range")
        .and_then(parse_content_range);
    let rows = response.json::<Vec<CheckoutSessionRow>>().map_err(|_| ())?;
    let count = content_range_count.unwrap_or(rows.len() as i64);

    let session_ids: Vec<String> = rows.iter().filter_map(|row| row.id.clone()).collect();
    let lines = fetch_checkout_lines(contact_data, outbound, &session_ids).await?;

    let data = rows
        .into_iter()
        .map(|row| map_checkout_sale_summary(&row, &lines))
        .collect();

    Ok(SalesPage { count, data })
}

async fn fetch_checkout_lines(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    session_ids: &[String],
) -> Result<Vec<CheckoutLineRow>, ()> {
    if session_ids.is_empty() {
        return Ok(Vec::new());
    }

    let url = contact_data
        .rest_url(
            "inventory_checkout_lines",
            &[
                ("select", CHECKOUT_LINE_SELECT.to_owned()),
                (
                    "checkout_session_id",
                    format!("in.({})", session_ids.join(",")),
                ),
            ],
        )
        .ok_or(())?;

    let response = send_private_rest_get(contact_data, outbound, &url).await?;
    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<CheckoutLineRow>>().map_err(|_| ())
}

/// Mirrors `mapCheckoutSaleSummary`: builds the `InventorySaleSummary` JSON for a
/// completed checkout session, deriving `items_count` / `total_quantity` from its
/// lines.
fn map_checkout_sale_summary(row: &CheckoutSessionRow, lines: &[CheckoutLineRow]) -> Value {
    let session_lines: Vec<&CheckoutLineRow> = lines
        .iter()
        .filter(|line| line.checkout_session_id.as_deref() == row.id.as_deref())
        .collect();

    let items_count = session_lines.len() as i64;
    let total_quantity: f64 = session_lines
        .iter()
        .map(|line| line.quantity.as_ref().map(value_as_number).unwrap_or(0.0))
        .sum();

    // `customer_name: row.customer_name || row.customer_email || row.public_token`
    // (JS truthiness: empty strings fall through).
    let customer_name = first_truthy_string([
        row.customer_name.as_deref(),
        row.customer_email.as_deref(),
        row.public_token.as_deref(),
    ]);

    let mut sale = Map::new();
    sale.insert("category_name".to_owned(), Value::Null);
    sale.insert("completed_at".to_owned(), string_or_null(&row.completed_at));
    sale.insert("created_at".to_owned(), string_or_null(&row.created_at));
    sale.insert("creator_name".to_owned(), Value::Null);
    sale.insert("currency".to_owned(), string_or_null(&row.currency));
    sale.insert("customer_name".to_owned(), customer_name);
    sale.insert("id".to_owned(), string_or_null(&row.id));
    sale.insert("items_count".to_owned(), json!(items_count));
    sale.insert("note".to_owned(), string_or_null(&row.note));
    sale.insert("notice".to_owned(), string_or_null(&row.public_token));
    sale.insert("owners".to_owned(), Value::Array(Vec::new()));
    sale.insert("paid_amount".to_owned(), value_or_null(&row.total_amount));
    sale.insert(
        "polar_order_id".to_owned(),
        string_or_null(&row.polar_order_id),
    );
    sale.insert("public_token".to_owned(), string_or_null(&row.public_token));
    sale.insert(
        "source".to_owned(),
        Value::String("checkout_session".to_owned()),
    );
    sale.insert("total_quantity".to_owned(), number_value(total_quantity));
    sale.insert("wallet_name".to_owned(), Value::Null);

    Value::Object(sale)
}

/// Mirrors `normalizeFinanceSale`: forces `source: 'finance_invoice'`, defaults
/// `currency` to null and `owners` to `[]` when missing.
fn normalize_finance_sale(sale: Value) -> Value {
    let mut object = match sale {
        Value::Object(map) => map,
        other => return other,
    };

    if !object
        .get("currency")
        .map(|v| !v.is_null())
        .unwrap_or(false)
    {
        object.insert("currency".to_owned(), Value::Null);
    }
    if !object.get("owners").map(|v| v.is_array()).unwrap_or(false) {
        object.insert("owners".to_owned(), Value::Array(Vec::new()));
    }
    object.insert(
        "source".to_owned(),
        Value::String("finance_invoice".to_owned()),
    );

    Value::Object(object)
}

/// Mirrors `saleTimestamp`: `Date(completed_at ?? created_at).getTime()`, with
/// 0 for missing/invalid timestamps. RFC3339 timestamps sort correctly as
/// epoch-millis; an unparseable timestamp resolves to 0.
fn sale_timestamp(sale: &Value) -> i64 {
    let timestamp = sale
        .get("completed_at")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .or_else(|| sale.get("created_at").and_then(Value::as_str))
        .filter(|value| !value.is_empty());

    timestamp.map(parse_timestamp_millis).unwrap_or(0)
}

/// Parses an ISO-8601/RFC3339 timestamp into epoch milliseconds, mirroring
/// JS `new Date(value).getTime()`. Returns 0 for anything unparseable
/// (`Number.isNaN(getTime())`). Dependency-free; supports the
/// `YYYY-MM-DD[ T]HH:MM:SS[.fraction][Z|+HH:MM|+HHMM]` shapes Postgres
/// `timestamptz` columns emit through PostgREST.
fn parse_timestamp_millis(value: &str) -> i64 {
    parse_iso8601_millis(value).unwrap_or(0)
}

fn parse_iso8601_millis(value: &str) -> Option<i64> {
    let value = value.trim();
    let bytes = value.as_bytes();
    // ASCII-only guard keeps the byte-index slicing below panic-free.
    if value.len() < 19 || !value.is_ascii() {
        return None;
    }

    // Date portion: YYYY-MM-DD
    let year = parse_uint(&value[0..4])?;
    if bytes[4] != b'-' {
        return None;
    }
    let month = parse_uint(&value[5..7])?;
    if bytes[7] != b'-' {
        return None;
    }
    let day = parse_uint(&value[8..10])?;

    // Separator (space or 'T').
    if bytes[10] != b'T' && bytes[10] != b't' && bytes[10] != b' ' {
        return None;
    }

    // Time portion: HH:MM:SS
    let hour = parse_uint(&value[11..13])?;
    if bytes[13] != b':' {
        return None;
    }
    let minute = parse_uint(&value[14..16])?;
    if bytes[16] != b':' {
        return None;
    }
    let second = parse_uint(&value[17..19])?;

    // Optional fractional seconds + timezone offset.
    let mut rest = &value[19..];
    let mut millis_fraction: i64 = 0;
    if let Some(stripped) = rest.strip_prefix('.') {
        let digits: String = stripped
            .chars()
            .take_while(|c| c.is_ascii_digit())
            .collect();
        if !digits.is_empty() {
            // Use the first three fractional digits as milliseconds.
            let mut frac = String::new();
            for index in 0..3 {
                frac.push(digits.as_bytes().get(index).copied().unwrap_or(b'0') as char);
            }
            millis_fraction = parse_uint(&frac)? as i64;
        }
        rest = &stripped[digits.len()..];
    }

    // Timezone offset in minutes (default 0 / UTC when absent or 'Z').
    let offset_minutes = parse_offset_minutes(rest)?;

    let days = days_from_civil(year as i64, month as i64, day as i64)?;
    let mut total_seconds =
        days * 86_400 + (hour as i64) * 3_600 + (minute as i64) * 60 + (second as i64);
    total_seconds -= offset_minutes * 60;

    Some(total_seconds * 1_000 + millis_fraction)
}

fn parse_uint(value: &str) -> Option<u64> {
    if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    value.parse::<u64>().ok()
}

fn parse_offset_minutes(value: &str) -> Option<i64> {
    let value = value.trim();
    if value.is_empty() || value.eq_ignore_ascii_case("z") {
        return Some(0);
    }

    let (sign, rest) = match value.as_bytes()[0] {
        b'+' => (1i64, &value[1..]),
        b'-' => (-1i64, &value[1..]),
        _ => return None,
    };

    let digits: String = rest.chars().filter(|c| c.is_ascii_digit()).collect();
    let (hours, minutes) = match digits.len() {
        // +HH:MM / +HHMM
        4 => (parse_uint(&digits[0..2])?, parse_uint(&digits[2..4])?),
        // +HH
        2 => (parse_uint(&digits[0..2])?, 0),
        _ => return None,
    };

    Some(sign * ((hours as i64) * 60 + minutes as i64))
}

/// Days since the Unix epoch for a civil (proleptic Gregorian) date. Based on
/// Howard Hinnant's `days_from_civil` algorithm.
fn days_from_civil(year: i64, month: i64, day: i64) -> Option<i64> {
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let year_of_era = year - era * 400;
    let day_of_year = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    Some(era * 146_097 + day_of_era - 719_468)
}

async fn authenticated_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<AuthenticatedUser> {
    if contact::request_has_app_session_token(request) {
        let identity =
            contact::resolve_app_session_identity(config, request, &INVENTORY_APP_SESSION_TARGETS)
                .ok()?;

        return non_empty_user_id(identity.id).map(|id| AuthenticatedUser {
            access_token: None,
            id,
        });
    }

    let access_token = supabase_auth::request_access_token(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;
    let id = non_empty_user_id(user.id?)?;

    Some(AuthenticatedUser {
        access_token: Some(access_token),
        id,
    })
}

fn non_empty_user_id(user_id: String) -> Option<String> {
    (!user_id.trim().is_empty()).then_some(user_id)
}

async fn can_view_inventory_sales(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user: &AuthenticatedUser,
    membership_type: Option<&str>,
) -> Result<bool, ()> {
    let membership_type = membership_type.unwrap_or("MEMBER");
    let Some(creator) = workspace_creator(contact_data, outbound, ws_id).await? else {
        // Workspace not found -> getPermissions returns null -> Not found.
        return Err(());
    };

    let role_permissions = if membership_type == "MEMBER" {
        workspace_role_permissions(contact_data, outbound, ws_id, &user.id).await?
    } else {
        Vec::new()
    };
    let default_permissions =
        workspace_default_permissions(contact_data, outbound, ws_id, membership_type).await?;
    let is_creator = membership_type == "MEMBER" && creator.as_deref() == Some(&user.id);

    let mut permissions = Vec::new();
    extend_unique_permissions(&mut permissions, role_permissions);
    extend_unique_permissions(&mut permissions, default_permissions);

    Ok(is_creator
        || permissions.iter().any(|value| value == "admin")
        || permissions
            .iter()
            .any(|permission| VIEW_INVENTORY_SALES_PERMISSIONS.contains(&permission.as_str())))
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user: &AuthenticatedUser,
) -> Result<Option<String>, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user).await;
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(Some(resolved_ws_id));
        }

        if let Some(access_token) = user.access_token.as_deref()
            && let Some(workspace_id) = workspace_id_by_handle(
                contact_data,
                outbound,
                &handle,
                &DataAuth::AccessToken(access_token),
            )
            .await?
        {
            return Ok(Some(workspace_id));
        }

        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, &DataAuth::ServiceRole).await?
        {
            return Ok(Some(workspace_id));
        }
    }

    Ok(Some(resolved_ws_id))
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user: &AuthenticatedUser,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id,workspace_members!inner(user_id,type)".to_owned(),
            ),
            ("personal", "eq.true".to_owned()),
            ("workspace_members.user_id", format!("eq.{}", user.id)),
            ("workspace_members.type", "eq.MEMBER".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let auth = user
        .access_token
        .as_deref()
        .map_or(DataAuth::ServiceRole, DataAuth::AccessToken);
    let response = send_rest_request(contact_data, outbound, &url, &auth).await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    decode_first_row::<WorkspaceIdRow>(&response).map(|row| row.and_then(|row| row.id))
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
    let response = send_rest_request(contact_data, outbound, &url, auth).await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    decode_first_row::<WorkspaceIdRow>(&response).map(|row| row.and_then(|row| row.id))
}

async fn workspace_membership_type(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user: &AuthenticatedUser,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{}", user.id)),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let auth = user
        .access_token
        .as_deref()
        .map_or(DataAuth::ServiceRole, DataAuth::AccessToken);
    let response = send_rest_request(contact_data, outbound, &url, &auth).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    decode_first_row::<WorkspaceMembershipRow>(&response)
        .map(|row| row.map(|row| row.membership_type.unwrap_or_else(|| "MEMBER".to_owned())))
}

async fn workspace_creator(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Option<Option<String>>, ()> {
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
    let response = send_rest_request(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    decode_first_row::<WorkspaceCreatorRow>(&response).map(|row| row.map(|row| row.creator_id))
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
    let response = send_rest_request(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;

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
    let response = send_rest_request(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;

    if !is_success_status(response.status) {
        return Ok(Vec::new());
    }

    Ok(response
        .json::<Vec<WorkspaceDefaultPermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
}

async fn inventory_realtime_enabled(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "value".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("name", format!("eq.{INVENTORY_REALTIME_SECRET}")),
            ("order", "created_at.desc".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(decode_first_row::<WorkspaceSecretRow>(&response)?
        .and_then(|row| row.value)
        .as_deref()
        == Some("true"))
}

async fn send_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
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
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

async fn send_private_rest_get(
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
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
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

/// Mirrors zod `SearchParamsSchema.safeParse(Object.fromEntries(searchParams))`:
/// `limit` coerces to an int in `[1, 100]` (default 50) and `offset` coerces to
/// an int `>= 0` (default 0). Returns `None` when validation fails (-> 400).
/// `Object.fromEntries` keeps the LAST value for duplicate keys.
fn parse_query(request_url: Option<&str>) -> Option<ParsedQuery> {
    let mut limit_raw: Option<String> = None;
    let mut offset_raw: Option<String> = None;

    if let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) {
        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "limit" => limit_raw = Some(value.into_owned()),
                "offset" => offset_raw = Some(value.into_owned()),
                _ => {}
            }
        }
    }

    let limit = match coerce_int(limit_raw.as_deref(), DEFAULT_LIMIT)? {
        value if (MIN_LIMIT..=MAX_LIMIT).contains(&value) => value,
        _ => return None,
    };
    let offset = match coerce_int(offset_raw.as_deref(), DEFAULT_OFFSET)? {
        value if value >= MIN_OFFSET => value,
        _ => return None,
    };

    Some(ParsedQuery { limit, offset })
}

/// Mirrors zod `z.coerce.number().int()`: an absent value yields the default,
/// otherwise the value is coerced like JS `Number(value)` and must be a finite
/// integer. Returns `None` (validation failure) for `NaN` or non-integer input.
fn coerce_int(value: Option<&str>, default_value: i64) -> Option<i64> {
    let Some(value) = value else {
        return Some(default_value);
    };

    // `Number("")` is 0 in JS; trimmed-only whitespace also coerces to 0.
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Some(0);
    }

    let parsed = trimmed.parse::<f64>().ok()?;
    if !parsed.is_finite() || parsed.fract() != 0.0 {
        return None;
    }

    Some(parsed as i64)
}

fn workspaces_inventory_sales_ws_id(path: &str) -> Option<&str> {
    let path = path.split('?').next().unwrap_or(path);
    let ws_id = path
        .strip_prefix(WORKSPACES_INVENTORY_SALES_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_INVENTORY_SALES_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
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

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn decode_first_row<T: for<'de> Deserialize<'de>>(
    response: &OutboundResponse,
) -> Result<Option<T>, ()> {
    response
        .json::<Vec<T>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

/// Parses the total count from a PostgREST `Content-Range` header value such as
/// `0-24/100` or `*/100`. Returns the value after the final `/`.
fn parse_content_range(content_range: &str) -> Option<i64> {
    let total = content_range.rsplit('/').next()?.trim();
    if total.is_empty() || total == "*" {
        return None;
    }
    total.parse::<i64>().ok()
}

/// Coerces a JSON value to an integer count, mirroring JS `Number(value ?? 0)`.
fn value_as_count(value: &Value) -> i64 {
    match value {
        Value::Number(number) => number
            .as_i64()
            .or_else(|| number.as_f64().map(|float| float as i64))
            .unwrap_or(0),
        Value::String(text) => text
            .trim()
            .parse::<f64>()
            .map(|float| float as i64)
            .unwrap_or(0),
        _ => 0,
    }
}

/// Mirrors JS `Number(value)` for numeric line quantities (numbers or numeric
/// strings); anything else resolves to 0.
fn value_as_number(value: &Value) -> f64 {
    match value {
        Value::Number(number) => number.as_f64().unwrap_or(0.0),
        Value::String(text) => text.trim().parse::<f64>().unwrap_or(0.0),
        _ => 0.0,
    }
}

fn string_or_null(value: &Option<String>) -> Value {
    match value {
        Some(text) => Value::String(text.clone()),
        None => Value::Null,
    }
}

fn value_or_null(value: &Option<Value>) -> Value {
    value.clone().unwrap_or(Value::Null)
}

fn first_truthy_string<const N: usize>(candidates: [Option<&str>; N]) -> Value {
    for candidate in candidates {
        if let Some(text) = candidate
            && !text.is_empty()
        {
            return Value::String(text.to_owned());
        }
    }
    Value::Null
}

/// Builds a JSON number from an f64 quantity sum, emitting an integer when the
/// value is whole (matching JS number serialization for `reduce` of integers).
fn number_value(value: f64) -> Value {
    if value.fract() == 0.0 && value.abs() < (i64::MAX as f64) {
        json!(value as i64)
    } else {
        serde_json::Number::from_f64(value)
            .map(Value::Number)
            .unwrap_or(Value::Null)
    }
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
