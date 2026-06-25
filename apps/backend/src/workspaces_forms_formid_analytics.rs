//! Handler for `GET /api/v1/workspaces/:wsId/forms/:formId/analytics`.
//!
//! Ports the GET method of
//! `apps/web/src/app/api/v1/workspaces/[wsId]/forms/[formId]/analytics/route.ts`.
//!
//! The legacy route file ALSO defines a `DELETE` method (clears form sessions). That
//! mutation is NOT migrated here: every non-GET method returns `None` so the Cloudflare
//! worker falls through to the still-active Next.js route.
//!
//! Behavior mirrored from the legacy GET handler:
//! - 401 `{ "error": "Unauthorized" }` when there is no authenticated Supabase user.
//! - 403 `{ "error": "Forbidden" }` when the caller is not a workspace MEMBER, or lacks
//!   BOTH `manage_forms` AND `view_form_analytics` permissions.
//! - 404 `{ "error": "Form not found" }` when the form does not exist or belongs to a
//!   different workspace than the resolved `wsId`.
//! - 500 `{ "error": "<message>" }` for internal failures. The legacy catch-all surfaces
//!   `error.message`, so the well-known validation messages `Invalid workspace ID` /
//!   `Invalid form ID` are reproduced (plus a generic `Internal server error` fallback).
//! - 200 `{ "analytics": { ... } }` where `analytics` is the normalized
//!   `get_form_analytics_overview` RPC payload (the exact `parseFormAnalytics` projection:
//!   every numeric field coerced via `toNumber`, label/value lists filtered to string
//!   labels, and the dropoff/activity arrays filtered to well-shaped entries).
//!
//! Auth/membership/permission/normalization logic mirrors `workspaces_forms_export.rs`
//! (the closest analog in the same forms domain). Those helpers are PRIVATE to that
//! module, so equivalents are copied here file-local rather than editing the other module.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PRIVATE_SCHEMA: &str = "private";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const FORM_NOT_FOUND_MESSAGE: &str = "Form not found";
const INVALID_WORKSPACE_ID_MESSAGE: &str = "Invalid workspace ID";
const INVALID_FORM_ID_MESSAGE: &str = "Invalid form ID";
const INTERNAL_ERROR_MESSAGE: &str = "Internal server error";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";
const MANAGE_FORMS_PERMISSION: &str = "manage_forms";
const VIEW_FORM_ANALYTICS_PERMISSION: &str = "view_form_analytics";
const FORM_ANALYTICS_OVERVIEW_RPC: &str = "get_form_analytics_overview";

const WORKSPACE_FORMS_ANALYTICS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACE_FORMS_ANALYTICS_PATH_SUFFIX: &str = "/analytics";
const WORKSPACE_FORMS_ANALYTICS_INFIX: &str = "/forms/";

pub(crate) async fn handle_workspaces_forms_formid_analytics_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, raw_form_id) = workspace_forms_analytics_segments(request.path)?;

    // Only GET is migrated. Every other method (e.g. the still-active DELETE) returns
    // None so the worker falls through to the Next.js route.
    match request.method {
        "GET" => Some(
            workspace_forms_analytics_response(config, request, raw_ws_id, raw_form_id, outbound)
                .await,
        ),
        _ => None,
    }
}

async fn workspace_forms_analytics_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    raw_form_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Auth: resolve the Supabase user from the bearer/cookie access token.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };

    // Resolve the workspace id (slug/handle/personal/internal) into a canonical UUID.
    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(Some(ws_id)) if is_workspace_uuid_literal(&ws_id) => ws_id,
            Ok(_) => return error_response(500, INVALID_WORKSPACE_ID_MESSAGE),
            Err(()) => return error_response(500, INTERNAL_ERROR_MESSAGE),
        };

    // Authorization: workspace membership AND (manage_forms OR view_form_analytics).
    let is_member =
        match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &user_id).await {
            Ok(value) => value,
            Err(()) => return error_response(500, INTERNAL_ERROR_MESSAGE),
        };
    if !is_member {
        return error_response(403, FORBIDDEN_MESSAGE);
    }

    let can_manage_forms = has_workspace_permission(
        contact_data,
        outbound,
        &resolved_ws_id,
        &user_id,
        MANAGE_FORMS_PERMISSION,
    )
    .await
    .unwrap_or(false);
    let can_view_analytics = has_workspace_permission(
        contact_data,
        outbound,
        &resolved_ws_id,
        &user_id,
        VIEW_FORM_ANALYTICS_PERMISSION,
    )
    .await
    .unwrap_or(false);
    if !can_manage_forms && !can_view_analytics {
        return error_response(403, FORBIDDEN_MESSAGE);
    }

    // Validate the form id shape (canonical UUID) before reading. The legacy
    // `parseFormIdParam` throws `Invalid form ID`, surfaced as 500 by the catch-all.
    if !is_workspace_uuid_literal(raw_form_id) {
        return error_response(500, INVALID_FORM_ID_MESSAGE);
    }

    // Fetch the form (only `ws_id` is needed) from the `private` schema. The legacy code
    // loads the full definition; here only existence + ownership are required to gate the
    // analytics read, which matches the legacy 404 conditions.
    let form_ws_id = match fetch_form_ws_id(contact_data, outbound, raw_form_id).await {
        Ok(Some(ws_id)) => ws_id,
        Ok(None) => return error_response(404, FORM_NOT_FOUND_MESSAGE),
        Err(()) => return error_response(500, INTERNAL_ERROR_MESSAGE),
    };
    if form_ws_id.as_deref() != Some(resolved_ws_id.as_str()) {
        return error_response(404, FORM_NOT_FOUND_MESSAGE);
    }

    // Read the analytics overview RPC (private schema, service role).
    let raw_analytics =
        match fetch_form_analytics_overview(contact_data, outbound, raw_form_id).await {
            Ok(value) => value,
            Err(()) => return error_response(500, INTERNAL_ERROR_MESSAGE),
        };

    let analytics = parse_form_analytics(&raw_analytics);
    no_store_response(json_response(200, json!({ "analytics": analytics })))
}

// ---------------------------------------------------------------------------
// Form lookup (private schema) — only ws_id is needed.
// ---------------------------------------------------------------------------

/// Returns `Ok(Some(ws_id_option))` when the form row exists (the inner `Option` is the
/// row's `ws_id`, which may be null), `Ok(None)` when no form row matches, or `Err(())`
/// on transport/parse failure.
async fn fetch_form_ws_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    form_id: &str,
) -> Result<Option<Option<String>>, ()> {
    let rows = private_get(
        contact_data,
        outbound,
        "forms",
        &[
            ("select", "ws_id".to_owned()),
            ("id", format!("eq.{form_id}")),
            ("limit", "1".to_owned()),
        ],
    )
    .await?;

    Ok(rows
        .into_iter()
        .next()
        .map(|form| form.get("ws_id").and_then(Value::as_str).map(str::to_owned)))
}

async fn fetch_form_analytics_overview(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    form_id: &str,
) -> Result<Value, ()> {
    let Some(rpc_url) = contact_data.rpc_url(FORM_ANALYTICS_OVERVIEW_RPC) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let Ok(body) = serde_json::to_string(&json!({ "p_form_id": form_id })) else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
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

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // The RPC returns the analytics object (or null). `parse_form_analytics` tolerates
    // both, so a missing/null body is normalized to the empty analytics shape.
    Ok(response.json::<Value>().unwrap_or(Value::Null))
}

// ---------------------------------------------------------------------------
// Analytics normalization (mirrors `parseFormAnalytics` in features/forms/server.ts).
// ---------------------------------------------------------------------------

fn parse_form_analytics(value: &Value) -> Value {
    let object = value.as_object();

    let get = |key: &str| object.and_then(|map| map.get(key));

    json!({
        "totalViews": to_number(get("totalViews")),
        "totalStarts": to_number(get("totalStarts")),
        "totalSubmissions": to_number(get("totalSubmissions")),
        "totalAbandons": to_number(get("totalAbandons")),
        "startRate": to_number(get("startRate")),
        "completionRate": to_number(get("completionRate")),
        "completionFromStartsRate": to_number(get("completionFromStartsRate")),
        "avgCompletionSeconds": to_number(get("avgCompletionSeconds")),
        "uniqueReferrers": to_number(get("uniqueReferrers")),
        "uniqueCountries": to_number(get("uniqueCountries")),
        "responderModeBreakdown": parse_label_value_list(get("responderModeBreakdown")),
        "topReferrers": parse_label_value_list(get("topReferrers")),
        "devices": parse_label_value_list(get("devices")),
        "browsers": parse_label_value_list(get("browsers")),
        "operatingSystems": parse_label_value_list(get("operatingSystems")),
        "countries": parse_label_value_list(get("countries")),
        "cities": parse_label_value_list(get("cities")),
        "dropoffBySection": parse_dropoff_by_section(get("dropoffBySection")),
        "dropoffByQuestion": parse_dropoff_by_question(get("dropoffByQuestion")),
        "activity": parse_activity(get("activity")),
    })
}

/// Mirrors `toNumber`: numbers pass through, numeric strings coerce (`Number(value) || 0`),
/// everything else becomes 0. Emitted as a JSON number.
fn to_number(value: Option<&Value>) -> Value {
    let number = match value {
        Some(Value::Number(number)) => number.as_f64().unwrap_or(0.0),
        Some(Value::String(text)) => parse_js_number(text),
        _ => 0.0,
    };
    json_number(number)
}

/// Reproduces JavaScript `Number(value) || 0` for string inputs: parse the trimmed string;
/// `NaN` / non-finite / `0` all fall back through `|| 0` to `0`. Empty/whitespace strings
/// parse to 0 in JS (`Number("") === 0`).
fn parse_js_number(text: &str) -> f64 {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return 0.0;
    }
    match trimmed.parse::<f64>() {
        Ok(parsed) if parsed.is_finite() => parsed,
        _ => 0.0,
    }
}

/// Emits an integer JSON number when the value is integral (the analytics RPC returns
/// integer counts and integer-percent rates), otherwise a float.
fn json_number(value: f64) -> Value {
    if value.is_finite() && value.fract() == 0.0 && value.abs() < 9.007_199_254_740_992e15 {
        json!(value as i64)
    } else {
        serde_json::Number::from_f64(value)
            .map(Value::Number)
            .unwrap_or_else(|| json!(0))
    }
}

/// Mirrors `parseLabelValueList`: keep only object entries whose `label` is a string,
/// mapping each to `{ label, value: toNumber(value) }`.
fn parse_label_value_list(value: Option<&Value>) -> Value {
    let Some(Value::Array(items)) = value else {
        return Value::Array(Vec::new());
    };

    let mapped: Vec<Value> = items
        .iter()
        .filter_map(|item| {
            let object = item.as_object()?;
            let label = object.get("label").and_then(Value::as_str)?;
            Some(json!({
                "label": label,
                "value": to_number(object.get("value")),
            }))
        })
        .collect();

    Value::Array(mapped)
}

/// Mirrors the `dropoffBySection` flatMap: keep entries with string `sectionId` and `title`.
fn parse_dropoff_by_section(value: Option<&Value>) -> Value {
    let Some(Value::Array(items)) = value else {
        return Value::Array(Vec::new());
    };

    let mapped: Vec<Value> = items
        .iter()
        .filter_map(|item| {
            let object = item.as_object()?;
            let section_id = object.get("sectionId").and_then(Value::as_str)?;
            let title = object.get("title").and_then(Value::as_str)?;
            Some(json!({
                "sectionId": section_id,
                "title": title,
                "count": to_number(object.get("count")),
            }))
        })
        .collect();

    Value::Array(mapped)
}

/// Mirrors the `dropoffByQuestion` flatMap: keep entries with string `questionId` and `title`.
fn parse_dropoff_by_question(value: Option<&Value>) -> Value {
    let Some(Value::Array(items)) = value else {
        return Value::Array(Vec::new());
    };

    let mapped: Vec<Value> = items
        .iter()
        .filter_map(|item| {
            let object = item.as_object()?;
            let question_id = object.get("questionId").and_then(Value::as_str)?;
            let title = object.get("title").and_then(Value::as_str)?;
            Some(json!({
                "questionId": question_id,
                "title": title,
                "count": to_number(object.get("count")),
            }))
        })
        .collect();

    Value::Array(mapped)
}

/// Mirrors the `activity` flatMap: keep entries with a string `date`.
fn parse_activity(value: Option<&Value>) -> Value {
    let Some(Value::Array(items)) = value else {
        return Value::Array(Vec::new());
    };

    let mapped: Vec<Value> = items
        .iter()
        .filter_map(|item| {
            let object = item.as_object()?;
            let date = object.get("date").and_then(Value::as_str)?;
            Some(json!({
                "date": date,
                "views": to_number(object.get("views")),
                "starts": to_number(object.get("starts")),
                "submissions": to_number(object.get("submissions")),
            }))
        })
        .collect();

    Value::Array(mapped)
}

// ---------------------------------------------------------------------------
// Workspace id normalization / membership / permission.
// Copied file-local from workspaces_forms_export.rs (whose equivalents are private).
// ---------------------------------------------------------------------------

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let trimmed = raw_ws_id.trim();

    if trimmed.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
    }

    if trimmed.eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG) {
        return personal_workspace_id(contact_data, outbound, user_id, access_token)
            .await
            .map(Some);
    }

    if is_workspace_uuid_literal(trimmed) {
        return Ok(Some(trimmed.to_owned()));
    }

    // Slug/handle lookup. Try caller-scoped first, then service-role fallback.
    let handle = trimmed.to_lowercase();
    if !is_workspace_handle(&handle) {
        return Ok(Some(trimmed.to_owned()));
    }

    if let Some(workspace_id) =
        workspace_id_by_handle(contact_data, outbound, &handle, Some(access_token)).await?
    {
        return Ok(Some(workspace_id));
    }
    if let Some(workspace_id) =
        workspace_id_by_handle(contact_data, outbound, &handle, None).await?
    {
        return Ok(Some(workspace_id));
    }

    Ok(Some(trimmed.to_owned()))
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
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
    let response = send_rest_get(contact_data, outbound, &url, Some(access_token), None).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    first_id(&response).ok_or(())
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    access_token: Option<&str>,
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
    let response = send_rest_get(contact_data, outbound, &url, access_token, None).await?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(first_id(&response))
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
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_get(contact_data, outbound, &url, None, None).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    Ok(rows
        .first()
        .and_then(|row| row.get("type"))
        .and_then(Value::as_str)
        == Some("MEMBER"))
}

async fn has_workspace_permission(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    permission: &str,
) -> Result<bool, ()> {
    let Some(rpc_url) = contact_data.rpc_url(HAS_WORKSPACE_PERMISSION_RPC) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let Ok(body) = serde_json::to_string(&json!({
        "p_user_id": user_id,
        "p_ws_id": ws_id,
        "p_permission": permission,
    })) else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");
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

    Ok(response.json::<bool>().unwrap_or(false))
}

async fn private_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    params: &[(&str, String)],
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(table, params) else {
        return Err(());
    };
    let response = send_rest_get(contact_data, outbound, &url, None, Some(PRIVATE_SCHEMA)).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

async fn send_rest_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: Option<&str>,
    schema: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = match access_token {
        Some(token) => format!("Bearer {token}"),
        None => format!("Bearer {service_role_key}"),
    };

    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);
    if let Some(schema) = schema {
        request = request.with_header("Accept-Profile", schema);
    }

    outbound.send(request).await.map_err(|_| ())
}

fn first_id(response: &OutboundResponse) -> Option<String> {
    response
        .json::<Vec<Value>>()
        .ok()?
        .into_iter()
        .next()
        .and_then(|row| row.get("id").and_then(Value::as_str).map(str::to_owned))
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ---------------------------------------------------------------------------
// Path matching + UUID/handle validation.
// ---------------------------------------------------------------------------

/// Matches `/api/v1/workspaces/{wsId}/forms/{formId}/analytics` and returns
/// `(raw_ws_id, raw_form_id)`. Returns None when the path shape does not match.
fn workspace_forms_analytics_segments(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(WORKSPACE_FORMS_ANALYTICS_PATH_PREFIX)?;
    let rest = rest.strip_suffix(WORKSPACE_FORMS_ANALYTICS_PATH_SUFFIX)?;
    let (ws_id, form_id) = rest.split_once(WORKSPACE_FORMS_ANALYTICS_INFIX)?;

    if ws_id.is_empty() || ws_id.contains('/') || form_id.is_empty() || form_id.contains('/') {
        return None;
    }

    Some((ws_id, form_id))
}

fn is_workspace_uuid_literal(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.len() == 36
        && trimmed.chars().enumerate().all(|(index, c)| match index {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
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
