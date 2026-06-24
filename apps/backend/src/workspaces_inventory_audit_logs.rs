//! Port of the legacy Next.js route
//! `apps/web/src/app/api/v1/workspaces/[wsId]/inventory/audit-logs/route.ts`.
//!
//! GET /api/v1/workspaces/:wsId/inventory/audit-logs
//!
//! Returns inventory audit-log rows for the workspace, newest first, with
//! computed summaries, normalized field changes, and resolved actor display
//! names. Read from `private.inventory_audit_logs` (admin/service-role REST,
//! mirroring the legacy `sbAdmin.schema('private')`), plus `workspace_users`
//! (public schema) for actor display names.
//!
//! Auth mirrors `authorizeInventoryWorkspace` + `canViewInventoryAuditLogs`:
//! the caller must hold ANY of `admin`, `view_inventory_audit_logs`, or
//! `manage_workspace_audit_logs`. We reuse the shared
//! `authorize_workspace_permission` helper (which resolves the workspace id,
//! verifies membership, and checks effective permissions exactly like
//! `getPermissions`).
//!
//! NOTE on copied helpers: this module copies the small JS-equivalent helpers
//! `normalize_audit_value`, `format_amount`, and `build_summary` as file-local
//! fns. They have no other home in the backend crate, so nothing in another
//! module was edited.
//!
//! KNOWN BEHAVIORAL DIFFERENCE vs. legacy (documented in notes): the legacy
//! `authorizeInventoryWorkspace` accepted app-session bearer tokens
//! (`allowAppSessionAuth: ['inventory']`). The shared
//! `authorize_workspace_permission` helper ignores app-session tokens (same
//! tradeoff already accepted by the ported `workspaces_inventory_analytics`
//! route). Browser cookie / Supabase user bearer auth behaves identically.

use serde::Deserialize;
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const WORKSPACES_INVENTORY_AUDIT_LOGS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_INVENTORY_AUDIT_LOGS_PATH_SUFFIX: &str = "/inventory/audit-logs";
const AUDIT_LOGS_TABLE: &str = "inventory_audit_logs";
const WORKSPACE_USERS_TABLE: &str = "workspace_users";
const PRIVATE_SCHEMA: &str = "private";

const FORBIDDEN_MESSAGE: &str = "Forbidden";
const NOT_FOUND_MESSAGE: &str = "Not found";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";
const LOAD_FAILED_MESSAGE: &str = "Failed to fetch inventory audit logs";

// Mirrors `canViewInventoryAuditLogs` in apps/web/src/lib/inventory/permissions.ts:
// access is granted when the caller holds ANY of these permissions. (The `admin`
// permission is also handled inside `authorize_workspace_permission` via
// `has_all_permissions`, but we list it explicitly to match the legacy set.)
const VIEW_INVENTORY_AUDIT_LOGS_PERMISSIONS: [&str; 3] = [
    "admin",
    "view_inventory_audit_logs",
    "manage_workspace_audit_logs",
];

const DEFAULT_LIMIT: i64 = 100;
const MIN_LIMIT: i64 = 1;
const MAX_LIMIT: i64 = 500;
const DEFAULT_OFFSET: i64 = 0;
const MIN_OFFSET: i64 = 0;

#[derive(Deserialize)]
struct AuditLogRow {
    id: Option<Value>,
    #[serde(default)]
    event_kind: Option<String>,
    #[serde(default)]
    entity_kind: Option<String>,
    #[serde(default)]
    entity_id: Option<Value>,
    #[serde(default)]
    entity_label: Option<String>,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    changed_fields: Option<Value>,
    #[serde(default)]
    before: Option<Value>,
    #[serde(default)]
    after: Option<Value>,
    #[serde(default)]
    actor_auth_uid: Option<Value>,
    #[serde(default)]
    actor_workspace_user_id: Option<String>,
    #[serde(default)]
    occurred_at: Option<Value>,
    #[serde(default)]
    source: Option<Value>,
}

#[derive(Deserialize)]
struct WorkspaceUserRow {
    id: Option<String>,
    #[serde(default)]
    full_name: Option<String>,
    #[serde(default)]
    display_name: Option<String>,
}

pub(crate) async fn handle_workspaces_inventory_audit_logs_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_inventory_audit_logs_ws_id(request.path)?;

    Some(match request.method {
        "GET" => audit_logs_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn audit_logs_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let ws_id = match authorize_audit_logs(&config.contact_data, request, raw_ws_id, outbound).await
    {
        Ok(ws_id) => ws_id,
        Err(response) => return response,
    };

    let params = match SearchParams::parse(request.url) {
        Ok(params) => params,
        Err(()) => {
            return no_store_response(json_response(
                400,
                // The legacy route returns `errors: parsed.error.issues`; we
                // emit an empty issues array since we do not replicate Zod's
                // issue objects, while keeping the message + 400 status.
                json!({ "message": INVALID_QUERY_MESSAGE, "errors": [] }),
            ));
        }
    };

    match build_audit_logs(&config.contact_data, outbound, &ws_id, &params).await {
        Ok(payload) => no_store_response(json_response(200, payload)),
        Err(()) => no_store_response(json_response(
            500,
            json!({ "message": LOAD_FAILED_MESSAGE }),
        )),
    }
}

/// Authorizes the caller for the workspace, succeeding if they hold ANY of the
/// inventory-audit-log permissions. Returns the resolved workspace id on
/// success, or a ready-to-send error response.
async fn authorize_audit_logs(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<String, BackendResponse> {
    for permission in VIEW_INVENTORY_AUDIT_LOGS_PERMISSIONS {
        match authorize_workspace_permission(contact_data, request, raw_ws_id, permission, outbound)
            .await
        {
            Ok(authorization) => return Ok(authorization.ws_id),
            // A single missing permission does not deny access; the legacy
            // `canViewInventoryAuditLogs` grants access when ANY permission is
            // present, so keep checking the remaining permissions.
            Err(WorkspacePermissionAuthorizationError::Forbidden) => {}
            Err(error) => return Err(auth_error_response(error)),
        }
    }

    Err(no_store_response(json_response(
        403,
        json!({ "message": FORBIDDEN_MESSAGE }),
    )))
}

/// Loads audit-log rows (newest first, paginated), resolves actor display
/// names, and shapes the JSON exactly like the legacy route.
async fn build_audit_logs(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    params: &SearchParams,
) -> Result<Value, ()> {
    let (rows, count) = fetch_audit_log_rows(contact_data, outbound, ws_id, params).await?;

    // Collect distinct, non-empty actor workspace-user ids (legacy uses a Set +
    // .filter(Boolean)).
    let mut actor_ids: Vec<String> = Vec::new();
    for row in &rows {
        if let Some(actor_id) = row
            .actor_workspace_user_id
            .as_deref()
            .map(str::trim)
            .filter(|id| !id.is_empty())
        {
            if !actor_ids.iter().any(|existing| existing == actor_id) {
                actor_ids.push(actor_id.to_owned());
            }
        }
    }

    // actor id -> display name (full_name ?? display_name ?? id). On error the
    // legacy route logs and continues with an empty map (no failure).
    let actor_names = if actor_ids.is_empty() {
        Vec::new()
    } else {
        fetch_actor_names(contact_data, outbound, &actor_ids)
            .await
            .unwrap_or_default()
    };

    let data: Vec<Value> = rows
        .iter()
        .map(|row| shape_row(row, &actor_names))
        .collect();

    Ok(json!({
        "data": data,
        "count": count,
    }))
}

/// Reads the audit-log page from `private.inventory_audit_logs` via service-role
/// REST (matching `sbAdmin.schema('private')`). Returns the rows plus the exact
/// total count parsed from the PostgREST `Content-Range` header
/// (`count: 'exact'`).
async fn fetch_audit_log_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    params: &SearchParams,
) -> Result<(Vec<AuditLogRow>, i64), ()> {
    let mut query: Vec<(&str, String)> = vec![
        ("select", "*".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "occurred_at.desc".to_owned()),
        ("offset", params.offset.to_string()),
        ("limit", params.limit.to_string()),
    ];

    if let Some(value) = &params.entity_kind {
        query.push(("entity_kind", format!("eq.{value}")));
    }
    if let Some(value) = &params.event_kind {
        query.push(("event_kind", format!("eq.{value}")));
    }
    if let Some(value) = &params.source {
        query.push(("source", format!("eq.{value}")));
    }
    if let Some(value) = &params.date_from {
        query.push(("occurred_at", format!("gte.{value}")));
    }
    if let Some(value) = &params.date_to {
        query.push(("occurred_at", format!("lte.{value}")));
    }

    let url = contact_data.rest_url(AUDIT_LOGS_TABLE, &query).ok_or(())?;
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

    if !is_success(response.status) {
        return Err(());
    }

    let count = response
        .header("content-range")
        .and_then(parse_content_range_count)
        .unwrap_or(0);

    let rows = response.json::<Vec<AuditLogRow>>().map_err(|_| ())?;

    Ok((rows, count))
}

/// Resolves actor display names from the public `workspace_users` table via
/// service-role REST (legacy uses `sbAdmin.from('workspace_users')`).
async fn fetch_actor_names(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    actor_ids: &[String],
) -> Result<Vec<(String, String)>, ()> {
    let in_list = format!("({})", actor_ids.join(","));
    let url = contact_data
        .rest_url(
            WORKSPACE_USERS_TABLE,
            &[
                ("select", "id,full_name,display_name".to_owned()),
                ("id", format!("in.{in_list}")),
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
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !is_success(response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<WorkspaceUserRow>>().map_err(|_| ())?;
    let mut names: Vec<(String, String)> = Vec::new();
    for actor in rows {
        let Some(id) = actor.id else { continue };
        let display = actor
            .full_name
            .filter(|value| !value.is_empty())
            .or_else(|| actor.display_name.filter(|value| !value.is_empty()))
            .unwrap_or_else(|| id.clone());
        names.push((id, display));
    }

    Ok(names)
}

/// Maps one audit-log row into the legacy response object.
fn shape_row(row: &AuditLogRow, actor_names: &[(String, String)]) -> Value {
    let before = object_or_empty(&row.before);
    let after = object_or_empty(&row.after);
    let changed_fields = string_array(&row.changed_fields);

    let field_changes: Vec<Value> = changed_fields
        .iter()
        .map(|field| {
            json!({
                "field": field,
                "label": field.replace('_', " "),
                "before": normalize_audit_value(before.get(field)),
                "after": normalize_audit_value(after.get(field)),
            })
        })
        .collect();

    let actor_workspace_user_id = row.actor_workspace_user_id.clone();
    let display_name = match &actor_workspace_user_id {
        Some(actor_id) if !actor_id.trim().is_empty() => actor_names
            .iter()
            .find(|(id, _)| id == actor_id)
            .map(|(_, name)| Value::String(name.clone()))
            .unwrap_or(Value::Null),
        _ => Value::Null,
    };

    // Compute the summary before moving `before`/`after` into the JSON value.
    let summary = build_summary(row, &after);

    json!({
        "auditRecordId": value_or_null(&row.id),
        "eventKind": string_or_null(&row.event_kind),
        "entityKind": string_or_null(&row.entity_kind),
        "entityId": value_or_null(&row.entity_id),
        "entityLabel": string_or_null(&row.entity_label),
        "summary": summary,
        "changedFields": changed_fields,
        "fieldChanges": field_changes,
        "before": Value::Object(before),
        "after": Value::Object(after),
        "actor": {
            "authUid": value_or_null(&row.actor_auth_uid),
            "workspaceUserId": match &actor_workspace_user_id {
                Some(value) => Value::String(value.clone()),
                None => Value::Null,
            },
            "displayName": display_name,
        },
        "occurredAt": value_or_null(&row.occurred_at),
        "source": value_or_null(&row.source),
    })
}

// ---------------------------------------------------------------------------
// Summary / value helpers (ported from the legacy route's local functions).
// ---------------------------------------------------------------------------

/// Port of `normalizeAuditValue`: null -> null, string -> string, other ->
/// JSON.stringify(value).
fn normalize_audit_value(value: Option<&Value>) -> Value {
    match value {
        None | Some(Value::Null) => Value::Null,
        Some(Value::String(string)) => Value::String(string.clone()),
        Some(other) => Value::String(other.to_string()),
    }
}

/// Port of `formatAmount`: `Number(value ?? 0)`, returning `null` for non-finite
/// values, otherwise `Intl.NumberFormat('en-US')` (i.e. thousands separators).
fn format_amount(value: Option<&Value>) -> Option<String> {
    let amount = match value {
        None | Some(Value::Null) => 0.0,
        Some(Value::Number(number)) => number.as_f64().unwrap_or(f64::NAN),
        Some(Value::String(string)) => {
            let trimmed = string.trim();
            if trimmed.is_empty() {
                0.0
            } else {
                trimmed.parse::<f64>().unwrap_or(f64::NAN)
            }
        }
        // JS `Number(true)`/`Number([])` edge cases are not produced by this
        // payload; treat anything else as NaN -> null (matches the guard).
        Some(_) => f64::NAN,
    };

    if !amount.is_finite() {
        return None;
    }

    Some(format_us_number(amount))
}

/// Port of `buildSummary`. `after` is the already-extracted `after` object.
fn build_summary(row: &AuditLogRow, after: &Map<String, Value>) -> Value {
    let entity_kind = row.entity_kind.as_deref().unwrap_or("");
    let event_kind = row.event_kind.as_deref().unwrap_or("");

    let trimmed = row.summary.as_deref().map(str::trim).unwrap_or("");
    let is_sale_created = entity_kind == "sale" && event_kind == "sale_created";

    if !trimmed.is_empty() && !is_sale_created {
        return Value::String(trimmed.to_owned());
    }

    if is_sale_created {
        let products_len = after
            .get("products")
            .and_then(Value::as_array)
            .map(|products| products.len())
            .unwrap_or(0);
        let paid_amount = format_amount(after.get("paid_amount"));

        let mut segments: Vec<String> = vec!["Created sale".to_owned()];
        if products_len > 0 {
            segments.push(format!(
                "{products_len} line{}",
                if products_len == 1 { "" } else { "s" }
            ));
        }
        if let Some(paid_amount) = paid_amount {
            segments.push(paid_amount);
        }

        return Value::String(segments.join(" \u{2022} "));
    }

    let entity_label = row.entity_label.as_deref().map(str::trim).unwrap_or("");
    if !entity_label.is_empty() {
        return Value::String(format!("{} {}", event_kind.replace('_', " "), entity_label));
    }

    Value::String(format!(
        "{} {}",
        event_kind.replace('_', " "),
        entity_kind.replace('_', " ")
    ))
}

/// Formats a finite f64 with `en-US` grouping (commas every three integer
/// digits), matching `Intl.NumberFormat('en-US').format(...)` for the integer
/// and fractional values this payload produces.
fn format_us_number(value: f64) -> String {
    let negative = value.is_sign_negative() && value != 0.0;
    let magnitude = value.abs();
    let integer_part = magnitude.trunc() as i128;
    let fractional = magnitude - magnitude.trunc();

    let mut integer_string = integer_part.to_string();
    // Insert thousands separators.
    let mut grouped = String::new();
    let digits: Vec<char> = integer_string.chars().collect();
    let len = digits.len();
    for (index, digit) in digits.iter().enumerate() {
        if index > 0 && (len - index) % 3 == 0 {
            grouped.push(',');
        }
        grouped.push(*digit);
    }
    integer_string = grouped;

    let mut result = String::new();
    if negative {
        result.push('-');
    }
    result.push_str(&integer_string);

    // Intl default max fraction digits is 3; round half-up to 3, then trim
    // trailing zeros (Intl drops insignificant trailing fraction digits).
    if fractional > 0.0 {
        let rounded = (fractional * 1000.0).round() as i64;
        if rounded > 0 {
            let mut frac = format!("{rounded:03}");
            while frac.ends_with('0') {
                frac.pop();
            }
            if !frac.is_empty() {
                result.push('.');
                result.push_str(&frac);
            }
        }
    }

    result
}

// ---------------------------------------------------------------------------
// Value coercion helpers.
// ---------------------------------------------------------------------------

fn object_or_empty(value: &Option<Value>) -> Map<String, Value> {
    match value {
        Some(Value::Object(map)) => map.clone(),
        _ => Map::new(),
    }
}

fn string_array(value: &Option<Value>) -> Vec<String> {
    match value {
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|item| item.as_str().map(str::to_owned))
            .collect(),
        _ => Vec::new(),
    }
}

fn value_or_null(value: &Option<Value>) -> Value {
    value.clone().unwrap_or(Value::Null)
}

fn string_or_null(value: &Option<String>) -> Value {
    match value {
        Some(string) => Value::String(string.clone()),
        None => Value::Null,
    }
}

// ---------------------------------------------------------------------------
// Query parameter parsing (mirrors the Zod SearchParamsSchema).
// ---------------------------------------------------------------------------

struct SearchParams {
    date_from: Option<String>,
    date_to: Option<String>,
    entity_kind: Option<String>,
    event_kind: Option<String>,
    limit: i64,
    offset: i64,
    source: Option<String>,
}

impl SearchParams {
    /// Parses + validates the query string like the Zod schema. Returns `Err(())`
    /// when `limit`/`offset` are present but invalid (non-integer, NaN, or out
    /// of range), which the legacy route surfaces as HTTP 400.
    fn parse(request_url: Option<&str>) -> Result<Self, ()> {
        let mut date_from = None;
        let mut date_to = None;
        let mut entity_kind = None;
        let mut event_kind = None;
        let mut source = None;
        let mut limit_raw: Option<String> = None;
        let mut offset_raw: Option<String> = None;

        if let Some(url) = request_url.and_then(|url| url::Url::parse(url).ok()) {
            // Mirror `Object.fromEntries(searchParams.entries())`: the last
            // occurrence of a repeated key wins.
            for (key, value) in url.query_pairs() {
                let value = value.into_owned();
                match key.as_ref() {
                    "dateFrom" => date_from = Some(value),
                    "dateTo" => date_to = Some(value),
                    "entityKind" => entity_kind = Some(value),
                    "eventKind" => event_kind = Some(value),
                    "source" => source = Some(value),
                    "limit" => limit_raw = Some(value),
                    "offset" => offset_raw = Some(value),
                    _ => {}
                }
            }
        }

        let limit = parse_bounded_int(limit_raw.as_deref(), DEFAULT_LIMIT, MIN_LIMIT, MAX_LIMIT)?;
        let offset =
            parse_bounded_int(offset_raw.as_deref(), DEFAULT_OFFSET, MIN_OFFSET, i64::MAX)?;

        Ok(Self {
            date_from: non_empty(date_from),
            date_to: non_empty(date_to),
            entity_kind: non_empty(entity_kind),
            event_kind: non_empty(event_kind),
            limit,
            offset,
            source: non_empty(source),
        })
    }
}

/// Mirrors `z.coerce.number().int().min(min).max(max).default(default)`:
/// - missing -> default
/// - present: coerced like JS `Number(value)`; must be a finite integer within
///   `[min, max]`, otherwise the schema fails (Err).
fn parse_bounded_int(raw: Option<&str>, default: i64, min: i64, max: i64) -> Result<i64, ()> {
    let Some(raw) = raw else {
        return Ok(default);
    };

    // JS `Number('')` is 0; `Number('  ')` is 0; otherwise parse as a float and
    // require it to be a whole, finite number (Zod `.int()`).
    let trimmed = raw.trim();
    let number: f64 = if trimmed.is_empty() {
        0.0
    } else {
        trimmed.parse::<f64>().map_err(|_| ())?
    };

    if !number.is_finite() || number.fract() != 0.0 {
        return Err(());
    }

    let value = number as i64;
    if value < min || value > max {
        return Err(());
    }

    Ok(value)
}

fn non_empty(value: Option<String>) -> Option<String> {
    value.filter(|string| !string.is_empty())
}

// ---------------------------------------------------------------------------
// Misc helpers.
// ---------------------------------------------------------------------------

fn parse_content_range_count(content_range: &str) -> Option<i64> {
    let total = content_range.rsplit('/').next()?.trim();
    if total.is_empty() || total == "*" {
        return None;
    }
    total.parse::<i64>().ok()
}

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

fn auth_error_response(error: WorkspacePermissionAuthorizationError) -> BackendResponse {
    match error {
        WorkspacePermissionAuthorizationError::Unauthorized => no_store_response(json_response(
            401,
            json!({ "message": UNAUTHORIZED_MESSAGE }),
        )),
        WorkspacePermissionAuthorizationError::NotFound => {
            no_store_response(json_response(404, json!({ "error": NOT_FOUND_MESSAGE })))
        }
        WorkspacePermissionAuthorizationError::Forbidden => {
            no_store_response(json_response(403, json!({ "message": FORBIDDEN_MESSAGE })))
        }
        WorkspacePermissionAuthorizationError::Internal => no_store_response(json_response(
            500,
            json!({ "message": MEMBERSHIP_LOOKUP_FAILED_MESSAGE }),
        )),
    }
}

fn workspaces_inventory_audit_logs_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_INVENTORY_AUDIT_LOGS_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_INVENTORY_AUDIT_LOGS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}
