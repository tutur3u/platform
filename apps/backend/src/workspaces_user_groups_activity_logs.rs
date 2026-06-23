//! Handler for `/api/v1/workspaces/:wsId/user-groups/activity-logs`.
//!
//! Mirrors the legacy Next.js route
//! `apps/web/src/app/api/v1/workspaces/[wsId]/user-groups/activity-logs/route.ts`.
//!
//! Behaviour (GET only):
//!   1. Parse query params with the legacy Zod contract. Invalid params ->
//!      `400 { "message": "Invalid user group activity query parameters" }`.
//!   2. `getPermissions({ wsId, request })` -> null -> `404 { "error": "Not found" }`.
//!   3. Missing `manage_workspace_audit_logs` permission ->
//!      `403 { "message": "Unauthorized" }`.
//!   4. Call the `private.list_user_group_activity_logs` RPC (service role,
//!      `Content-Profile: private`), map rows to events, and return
//!      `{ "count": <number>, "data": [ ...events ] }`.
//!   5. Any RPC / mapping failure ->
//!      `500 { "message": "Error fetching user group activity logs" }`.
//!
//! The permission gate reuses `workspace_permission_check::authorize_workspace_permission`,
//! which performs the same `getPermissions` -> normalize -> effective permission
//! resolution that the legacy `getPermissions` helper performs. Its error variants
//! map to the legacy status codes (NotFound -> 404, Forbidden -> 403,
//! Unauthorized -> 404 here because the legacy route treats a missing session as a
//! null permission set -> 404).

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

const MANAGE_WORKSPACE_AUDIT_LOGS_PERMISSION: &str = "manage_workspace_audit_logs";
const LIST_ACTIVITY_LOGS_RPC: &str = "list_user_group_activity_logs";
const PRIVATE_SCHEMA: &str = "private";
const INVALID_PARAMS_MESSAGE: &str = "Invalid user group activity query parameters";
const ERROR_FETCHING_MESSAGE: &str = "Error fetching user group activity logs";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";

const ACTION_FILTERS: &[&str] = &[
    "all",
    "created",
    "updated",
    "deleted",
    "archived",
    "reactivated",
    "reordered",
    "uploaded",
    "removed",
    "restored",
    "role_updated",
];

const RESOURCE_TYPE_FILTERS: &[&str] = &[
    "all",
    "group",
    "membership",
    "tag",
    "default_included_group",
    "post",
    "post_log",
    "post_check",
    "attendance",
    "linked_product",
    "metric",
    "metric_category",
    "metric_category_link",
    "student_metric_value",
    "monthly_report",
    "monthly_report_log",
    "feedback",
    "course_module",
    "course_module_group",
    "course_module_group_order",
    "course_module_order",
    "resource",
];

const SUMMARY_HIDDEN_FIELDS: &[&str] = &["created_at", "deleted_at", "id", "updated_at", "ws_id"];

/// Resource type label map mirroring `RESOURCE_LABELS` in the legacy normalizer.
fn resource_label(resource_type: &str) -> &'static str {
    match resource_type {
        "attendance" => "attendance",
        "course_module" => "course module",
        "course_module_group" => "course module group",
        "course_module_group_order" => "course module group order",
        "course_module_order" => "course module order",
        "default_included_group" => "default included group",
        "feedback" => "feedback",
        "group" => "group",
        "linked_product" => "linked product",
        "membership" => "membership",
        "metric" => "metric",
        "metric_category" => "metric category",
        "metric_category_link" => "metric category link",
        "monthly_report" => "monthly report",
        "monthly_report_log" => "monthly report log",
        "post" => "post",
        "post_check" => "post check",
        "post_log" => "post log",
        "resource" => "resource",
        "student_metric_value" => "student metric value",
        "tag" => "tag",
        _ => "resource",
    }
}

struct ParsedParams {
    start: String,
    end: String,
    group_id: Option<String>,
    resource_type: String,
    action: String,
    affected_user_query: Option<String>,
    actor_query: Option<String>,
    query: Option<String>,
    offset: i64,
    limit: i64,
}

pub(crate) async fn handle_workspaces_user_groups_activity_logs_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = activity_logs_ws_id(request.path)?;

    Some(match request.method {
        "GET" => activity_logs_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn activity_logs_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Step 1: parse query params (matches the legacy Zod schema). This runs
    // before the permission check, exactly like the legacy route.
    let Some(params) = parse_params(request.url) else {
        return message_response(400, INVALID_PARAMS_MESSAGE);
    };

    // Step 2 + 3: resolve workspace + require `manage_workspace_audit_logs`.
    let authorization = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        MANAGE_WORKSPACE_AUDIT_LOGS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        // getPermissions(...) == null -> 404 { error: "Not found" }.
        Err(WorkspacePermissionAuthorizationError::NotFound)
        | Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return not_found_response();
        }
        // permission present but lacks the audit-log permission -> 403 Unauthorized.
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return message_response(403, UNAUTHORIZED_MESSAGE);
        }
        // Lookup failure -> 500 (legacy try/catch around listUserGroupActivityEventsForRange,
        // but normalize/membership failures here surface as a fetch error).
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, ERROR_FETCHING_MESSAGE);
        }
    };

    // Step 4: call the RPC and map rows.
    match list_activity_events(
        &config.contact_data,
        outbound,
        &authorization.ws_id,
        &params,
    )
    .await
    {
        Ok(body) => no_store_response(json_response(200, body)),
        Err(()) => message_response(500, ERROR_FETCHING_MESSAGE),
    }
}

async fn list_activity_events(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    params: &ParsedParams,
) -> Result<Value, ()> {
    let rpc_url = contact_data.rpc_url(LIST_ACTIVITY_LOGS_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    // Build the RPC argument object. `undefined` legacy args are simply omitted
    // (PostgREST treats absent keys as SQL DEFAULT, matching the JS `|| undefined`).
    let mut args = Map::new();
    args.insert("p_ws_id".to_owned(), Value::String(ws_id.to_owned()));
    args.insert("p_start".to_owned(), Value::String(params.start.clone()));
    args.insert("p_end".to_owned(), Value::String(params.end.clone()));
    if let Some(group_id) = non_empty(params.group_id.as_deref()) {
        args.insert("p_group_id".to_owned(), Value::String(group_id.to_owned()));
    }
    args.insert(
        "p_resource_type".to_owned(),
        Value::String(params.resource_type.clone()),
    );
    args.insert("p_action".to_owned(), Value::String(params.action.clone()));
    if let Some(value) = trimmed_non_empty(params.affected_user_query.as_deref()) {
        args.insert("p_affected_user_query".to_owned(), Value::String(value));
    }
    if let Some(value) = trimmed_non_empty(params.actor_query.as_deref()) {
        args.insert("p_actor_query".to_owned(), Value::String(value));
    }
    if let Some(value) = trimmed_non_empty(params.query.as_deref()) {
        args.insert("p_query".to_owned(), Value::String(value));
    }
    args.insert("p_limit".to_owned(), Value::from(params.limit));
    args.insert("p_offset".to_owned(), Value::from(params.offset));

    let body = serde_json::to_string(&Value::Object(args)).map_err(|_| ())?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;

    let count = rows
        .first()
        .and_then(|row| row.get("total_count"))
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
        .unwrap_or(0.0);
    let count = json!(count_to_json_number(count));

    let events: Vec<Value> = rows.iter().filter_map(map_row_to_event).collect();

    Ok(json!({
        "count": count,
        "data": events,
    }))
}

/// Mirrors `toCount`: returns the numeric value when finite, else 0.
/// Renders whole numbers as integers (serde_json preserves the original type).
fn count_to_json_number(value: f64) -> Value {
    if value.fract() == 0.0 && value.abs() < (i64::MAX as f64) {
        Value::from(value as i64)
    } else {
        Value::from(value)
    }
}

/// Maps a single raw RPC row into the legacy `UserGroupActivityEvent` JSON shape.
/// Returns `None` only if the required `audit_record_id` is missing/non-numeric,
/// which should not occur for valid RPC output (legacy assumes it is present).
fn map_row_to_event(row: &Value) -> Option<Value> {
    let action = str_field(row, "action").unwrap_or_default();
    let resource_type = str_field(row, "resource_type").unwrap_or_default();

    let group = json!({
        "id": opt_str_value(row, "group_id"),
        "name": opt_str_value(row, "group_name"),
    });
    let group_id = opt_str(row, "group_id");
    let group_name = opt_str(row, "group_name");

    let affected_user_id = opt_str(row, "affected_user_id");
    let affected_user_name = opt_str(row, "affected_user_name");
    let affected_user_email = opt_str(row, "affected_user_email");
    let affected_user = if affected_user_id.is_some()
        || affected_user_name.is_some()
        || affected_user_email.is_some()
    {
        json!({
            "id": opt_str_value(row, "affected_user_id"),
            "name": opt_str_value(row, "affected_user_name"),
            "email": opt_str_value(row, "affected_user_email"),
        })
    } else {
        Value::Null
    };

    let before_record = row.get("before").cloned().unwrap_or(Value::Null);
    let after_record = row.get("after").cloned().unwrap_or(Value::Null);
    let explicit_fields = row
        .get("changed_fields")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect::<Vec<_>>()
        });

    let field_data = build_field_changes(&before_record, &after_record, explicit_fields.as_deref());

    let summary = build_summary(
        &action,
        &resource_type,
        affected_user_name.as_deref(),
        affected_user_email.as_deref(),
        &after_record,
        &field_data.changed_fields,
        group_id.as_deref(),
        group_name.as_deref(),
        opt_str(row, "resource_label").as_deref(),
    );

    Some(json!({
        "auditRecordId": row.get("audit_record_id").cloned().unwrap_or(Value::Null),
        "tableName": opt_str_value(row, "table_name"),
        "action": row.get("action").cloned().unwrap_or(Value::Null),
        "resourceType": row.get("resource_type").cloned().unwrap_or(Value::Null),
        "resourceId": opt_str_value(row, "resource_id"),
        "resourceLabel": opt_str_value(row, "resource_label"),
        "summary": summary,
        "changedFields": field_data.changed_fields,
        "fieldChanges": field_data.field_changes,
        "before": field_data.before,
        "after": field_data.after,
        "group": group,
        "affectedUser": affected_user,
        "actor": json!({
            "authUid": opt_str_value(row, "actor_auth_uid"),
            "workspaceUserId": opt_str_value(row, "actor_workspace_user_id"),
            "id": opt_str_value(row, "actor_id"),
            "name": opt_str_value(row, "actor_name"),
            "email": opt_str_value(row, "actor_email"),
        }),
        "occurredAt": opt_str_value(row, "occurred_at"),
    }))
}

struct FieldChangeData {
    changed_fields: Vec<String>,
    field_changes: Vec<Value>,
    before: Map<String, Value>,
    after: Map<String, Value>,
}

/// Mirrors `buildUserGroupActivityFieldChanges`.
fn build_field_changes(
    before: &Value,
    after: &Value,
    explicit_fields: Option<&[String]>,
) -> FieldChangeData {
    let before_map = as_record(before);
    let after_map = as_record(after);

    let changed_fields = changed_fields(&before_map, &after_map, explicit_fields);

    let mut before_out = Map::new();
    let mut after_out = Map::new();
    let mut field_changes = Vec::with_capacity(changed_fields.len());

    for field in &changed_fields {
        let before_value = normalize_field_value(before_map.get(field).unwrap_or(&Value::Null));
        let after_value = normalize_field_value(after_map.get(field).unwrap_or(&Value::Null));

        before_out.insert(field.clone(), string_or_null(&before_value));
        after_out.insert(field.clone(), string_or_null(&after_value));

        field_changes.push(json!({
            "field": field,
            "label": humanize_field(field),
            "before": string_or_null(&before_value),
            "after": string_or_null(&after_value),
        }));
    }

    FieldChangeData {
        changed_fields,
        field_changes,
        before: before_out,
        after: after_out,
    }
}

/// Mirrors `getChangedFields`.
fn changed_fields(
    before: &Map<String, Value>,
    after: &Map<String, Value>,
    explicit_fields: Option<&[String]>,
) -> Vec<String> {
    if let Some(fields) = explicit_fields {
        if !fields.is_empty() {
            let mut sorted = fields.to_vec();
            sorted.sort();
            return sorted;
        }
    }

    let mut keys: Vec<String> = Vec::new();
    for key in before.keys().chain(after.keys()) {
        if !keys.iter().any(|existing| existing == key) {
            keys.push(key.clone());
        }
    }

    let mut filtered: Vec<String> = keys
        .into_iter()
        .filter(|field| {
            !values_equal(
                before.get(field).unwrap_or(&Value::Null),
                after.get(field).unwrap_or(&Value::Null),
            )
        })
        .collect();
    filtered.sort();
    filtered
}

/// Mirrors `isEqualValue`: compares values by their JSON serialization, treating
/// `null`/absent equivalently.
fn values_equal(left: &Value, right: &Value) -> bool {
    let left = if left.is_null() { &Value::Null } else { left };
    let right = if right.is_null() { &Value::Null } else { right };
    serde_json::to_string(left).ok() == serde_json::to_string(right).ok()
}

/// Mirrors `humanizeAuditField`.
fn humanize_field(field: &str) -> String {
    field
        .split('_')
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Mirrors `normalizeAuditFieldValue`. Returns `None` for null/undefined.
fn normalize_field_value(value: &Value) -> Option<String> {
    match value {
        Value::Null => None,
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        Value::Array(items) => Some(
            items
                .iter()
                .map(|entry| normalize_field_value(entry).unwrap_or_default())
                .collect::<Vec<_>>()
                .join(", "),
        ),
        Value::Object(_) => serde_json::to_string(value).ok(),
    }
}

fn string_or_null(value: &Option<String>) -> Value {
    match value {
        Some(s) => Value::String(s.clone()),
        None => Value::Null,
    }
}

/// Mirrors `summarizeFieldList` for the user-group normalizer (default `details`).
fn summarize_field_list(fields: &[String]) -> String {
    let visible: Vec<&String> = fields
        .iter()
        .filter(|field| !SUMMARY_HIDDEN_FIELDS.contains(&field.as_str()))
        .collect();

    match visible.len() {
        0 => "details".to_owned(),
        1 => humanize_field(visible[0]),
        2 => format!(
            "{} and {}",
            humanize_field(visible[0]),
            humanize_field(visible[1])
        ),
        n => format!("{} +{} more fields", humanize_field(visible[0]), n - 1),
    }
}

fn normalize_name(value: Option<&str>) -> Option<String> {
    let trimmed = value?.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_owned())
}

fn build_resource_phrase(resource_type: &str, resource_label_value: Option<&str>) -> String {
    let type_label = resource_label(resource_type);
    match normalize_name(resource_label_value) {
        Some(label) => format!("{type_label} {label}"),
        None => type_label.to_owned(),
    }
}

fn build_group_suffix(group_name: Option<&str>) -> String {
    match normalize_name(group_name) {
        Some(name) => format!(" in {name}"),
        None => String::new(),
    }
}

fn role_label(after: &Value) -> Option<String> {
    let value = after.get("role").and_then(Value::as_str)?;
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_owned())
}

/// Mirrors `buildUserGroupActivitySummary`.
#[allow(clippy::too_many_arguments)]
fn build_summary(
    action: &str,
    resource_type: &str,
    affected_user_name: Option<&str>,
    affected_user_email: Option<&str>,
    after: &Value,
    changed_fields: &[String],
    _group_id: Option<&str>,
    group_name: Option<&str>,
    resource_label_value: Option<&str>,
) -> String {
    let group_name_norm = normalize_name(group_name);
    let group_suffix = build_group_suffix(group_name);
    let affected_user_label = normalize_name(affected_user_name)
        .or_else(|| normalize_name(affected_user_email))
        .unwrap_or_else(|| "Unknown user".to_owned());
    let resource_phrase = build_resource_phrase(resource_type, resource_label_value);

    if resource_type == "membership" {
        if action == "created" {
            let role = role_label(after);
            let role_suffix = role.map(|role| format!(" as {role}")).unwrap_or_default();
            let to_group = group_name_norm
                .as_deref()
                .map(|name| format!(" to {name}"))
                .unwrap_or_default();
            return format!("Added {affected_user_label}{to_group}{role_suffix}");
        }

        if action == "deleted" || action == "removed" {
            let from_group = group_name_norm
                .as_deref()
                .map(|name| format!(" from {name}"))
                .unwrap_or_default();
            return format!("Removed {affected_user_label}{from_group}");
        }

        if action == "role_updated" {
            return format!("Updated role for {affected_user_label}{group_suffix}");
        }

        return format!(
            "Updated {} for {affected_user_label}{group_suffix}",
            summarize_field_list(changed_fields)
        );
    }

    if resource_type == "group" {
        let label = group_name_norm
            .or_else(|| normalize_name(resource_label_value))
            .unwrap_or_else(|| "group".to_owned());

        return match action {
            "created" => format!("Created group {label}"),
            "deleted" | "removed" => format!("Deleted group {label}"),
            "archived" => format!("Archived group {label}"),
            "reactivated" | "restored" => format!("Reactivated group {label}"),
            _ => format!(
                "Updated {} for group {label}",
                summarize_field_list(changed_fields)
            ),
        };
    }

    match action {
        "created" => format!("Created {resource_phrase}{group_suffix}"),
        "deleted" | "removed" => format!("Deleted {resource_phrase}{group_suffix}"),
        "uploaded" => format!("Uploaded {resource_phrase}{group_suffix}"),
        "reordered" => format!("Reordered {resource_phrase}{group_suffix}"),
        "archived" => format!("Archived {resource_phrase}{group_suffix}"),
        "reactivated" | "restored" => format!("Reactivated {resource_phrase}{group_suffix}"),
        _ => format!(
            "Updated {} for {resource_phrase}{group_suffix}",
            summarize_field_list(changed_fields)
        ),
    }
}

fn as_record(value: &Value) -> Map<String, Value> {
    value.as_object().cloned().unwrap_or_default()
}

fn str_field(row: &Value, key: &str) -> Option<String> {
    row.get(key).and_then(Value::as_str).map(str::to_owned)
}

/// Returns the string when present, non-null, and a string; otherwise `None`.
fn opt_str(row: &Value, key: &str) -> Option<String> {
    row.get(key).and_then(Value::as_str).map(str::to_owned)
}

/// Returns a JSON value preserving `null` for absent/null string fields
/// (legacy returns the raw nullable column value).
fn opt_str_value(row: &Value, key: &str) -> Value {
    match row.get(key) {
        Some(value) if value.is_string() => value.clone(),
        _ => Value::Null,
    }
}

fn non_empty(value: Option<&str>) -> Option<&str> {
    value.filter(|v| !v.is_empty())
}

fn trimmed_non_empty(value: Option<&str>) -> Option<String> {
    let trimmed = value?.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_owned())
}

/// Parses query params matching the legacy Zod `SearchParamsSchema`.
/// Returns `None` on any validation failure (-> 400).
fn parse_params(request_url: Option<&str>) -> Option<ParsedParams> {
    let url = url::Url::parse(request_url?).ok()?;

    let mut start: Option<String> = None;
    let mut end: Option<String> = None;
    let mut group_id: Option<String> = None;
    let mut resource_type: Option<String> = None;
    let mut action: Option<String> = None;
    let mut affected_user_query: Option<String> = None;
    let mut actor_query: Option<String> = None;
    let mut query: Option<String> = None;
    let mut offset_raw: Option<String> = None;
    let mut limit_raw: Option<String> = None;

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "start" => start = Some(value.into_owned()),
            "end" => end = Some(value.into_owned()),
            "groupId" => group_id = Some(value.into_owned()),
            "resourceType" => resource_type = Some(value.into_owned()),
            "action" => action = Some(value.into_owned()),
            "affectedUserQuery" => affected_user_query = Some(value.into_owned()),
            "actorQuery" => actor_query = Some(value.into_owned()),
            "query" => query = Some(value.into_owned()),
            "offset" => offset_raw = Some(value.into_owned()),
            "limit" => limit_raw = Some(value.into_owned()),
            _ => {}
        }
    }

    // `z.string().datetime()` requires ISO-8601 date-time strings; both required.
    let start = start.filter(|value| is_iso_datetime(value))?;
    let end = end.filter(|value| is_iso_datetime(value))?;

    // `z.coerce.number().int().min(0).default(0)`
    let offset = match offset_raw {
        None => 0,
        Some(raw) => coerce_int(&raw).filter(|value| *value >= 0)?,
    };
    // `z.coerce.number().int().min(1).max(1000).default(100)`
    let limit = match limit_raw {
        None => 100,
        Some(raw) => coerce_int(&raw).filter(|value| (1..=1000).contains(value))?,
    };

    // `.catch('all')`: invalid enum values fall back to `all`.
    let resource_type = resource_type
        .filter(|value| RESOURCE_TYPE_FILTERS.contains(&value.as_str()))
        .unwrap_or_else(|| "all".to_owned());
    let action = action
        .filter(|value| ACTION_FILTERS.contains(&value.as_str()))
        .unwrap_or_else(|| "all".to_owned());

    Some(ParsedParams {
        start,
        end,
        group_id,
        resource_type,
        action,
        affected_user_query,
        actor_query,
        query,
        offset,
        limit,
    })
}

/// Mirrors Zod's `z.coerce.number().int()`: coerces the string to a finite
/// number and requires it to be an integer. Empty string coerces to 0 in Zod
/// (`Number('') === 0`), so we mirror that.
fn coerce_int(raw: &str) -> Option<i64> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Some(0);
    }
    let parsed: f64 = trimmed.parse().ok()?;
    if !parsed.is_finite() || parsed.fract() != 0.0 {
        return None;
    }
    if parsed.abs() >= (i64::MAX as f64) {
        return None;
    }
    Some(parsed as i64)
}

/// Best-effort ISO-8601 date-time validation matching `z.string().datetime()`
/// closely enough for routing: requires a `YYYY-MM-DDTHH:MM:SS` prefix with an
/// optional fractional seconds part and a `Z`/offset suffix.
fn is_iso_datetime(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() < 20 {
        return false;
    }

    // YYYY-MM-DDTHH:MM:SS
    let digit_positions = [0, 1, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17, 18];
    for &pos in &digit_positions {
        if !bytes[pos].is_ascii_digit() {
            return false;
        }
    }
    if bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    if bytes[10] != b'T' {
        return false;
    }
    if bytes[13] != b':' || bytes[16] != b':' {
        return false;
    }

    let rest = &value[19..];
    // Optional fractional seconds: `.` followed by 1+ digits.
    let rest = if let Some(stripped) = rest.strip_prefix('.') {
        let digit_count = stripped.chars().take_while(char::is_ascii_digit).count();
        if digit_count == 0 {
            return false;
        }
        &stripped[digit_count..]
    } else {
        rest
    };

    // Timezone: `Z`, `+HH:MM`, or `-HH:MM`.
    if rest == "Z" {
        return true;
    }
    if (rest.starts_with('+') || rest.starts_with('-')) && rest.len() == 6 {
        let tz = rest.as_bytes();
        return tz[1].is_ascii_digit()
            && tz[2].is_ascii_digit()
            && tz[3] == b':'
            && tz[4].is_ascii_digit()
            && tz[5].is_ascii_digit();
    }

    false
}

fn activity_logs_ws_id(path: &str) -> Option<&str> {
    let segments = path_segments(path);

    if segments.len() == 6
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && !segments[3].is_empty()
        && segments[4] == "user-groups"
        && segments[5] == "activity-logs"
    {
        Some(segments[3])
    } else {
        None
    }
}

fn path_segments(path: &str) -> Vec<&str> {
    path.trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect()
}

fn not_found_response() -> BackendResponse {
    no_store_response(json_response(404, json!({ "error": "Not found" })))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
