//! Handler for `GET /api/v1/workspaces/:wsId/api-keys`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/api-keys/route.ts` (GET only; the
//! legacy `POST` create path is intentionally left to the still-live Next.js
//! route and this handler returns `None` for every non-GET method).
//!
//! The legacy GET is wrapped in `withSessionAuth`, normalizes the workspace id,
//! parses the `page` / `pageSize` / `q` query params, runs
//! `assertWorkspaceApiKeysAccess` (workspace membership + the `manage_api_keys`
//! permission), then reads `workspace_api_keys` with the *admin* (service-role)
//! client filtered by `ws_id`, ordered by `created_at` descending, optionally
//! `ilike`-filtered on `name`, and (when paginated) range-limited with an exact
//! count. It then back-fills each key's `last_used_at` from the most recent
//! `workspace_api_key_usage_logs` row for that key.
//!
//! Response shape (matching legacy):
//!   * "paginated" request (any of `page` / `pageSize` / `q` present)
//!     -> `200 { "data": [...], "count": <number> }`
//!   * otherwise -> `200 [...]` (bare array)
//!
//! This mirrors the already-migrated `workspaces_wsid_api_keys_roles` handler,
//! which ports the same `assertWorkspaceApiKeysAccess` helper and workspace-id
//! normalization. The membership and permission checks use the service-role
//! client; the `workspace_api_keys` and `workspace_api_key_usage_logs` reads use
//! the service-role (admin) client, matching the legacy `createAdminClient()`
//! reads (RLS bypassed, scoped by the `ws_id` filter).
//!
//! Status codes (matching legacy / the shared helper):
//!   * missing/invalid Supabase session   -> `401 { "error": "Unauthorized" }`
//!   * workspace-id resolution failure     -> `500 { "message": "Internal server error" }`
//!   * membership lookup failure           -> `500 { "error": "Failed to verify workspace membership" }`
//!   * non-member caller                   -> `403 { "message": "You don't have access to this workspace" }`
//!   * permission RPC failure              -> `500 { "message": "Error checking permission" }`
//!   * caller lacking `manage_api_keys`    -> `403 { "message": "You do not have permission to manage API keys" }`
//!   * `workspace_api_keys` read failure   -> `500 { "message": "Error fetching workspace API configs" }`
//!   * success                             -> `200` (see shape above)
//!
//! NOTE (behavior gaps):
//!   * The legacy `ApiKeyListQuerySchema` validation (`page`/`pageSize`/`q` are
//!     all optional strings) can never fail because URL search params are always
//!     strings, so the legacy `400 { message: "Invalid query parameters" }`
//!     branch is unreachable and is not reproduced here.
//!   * Like the roles template, `withSessionAuth` also accepts Tuturuuu
//!     app-session and CLI bearer tokens; this handler only resolves Supabase
//!     access tokens (bearer or auth cookie) and returns `401` otherwise.
//!   * Usage-log read failures are swallowed (each key's `last_used_at` falls
//!     back to `null`), mirroring the legacy code which ignores that error.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// Path shape: /api/v1/workspaces/{wsId}/api-keys
const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/api-keys";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "You don't have access to this workspace";
const NO_PERMISSION_MESSAGE: &str = "You do not have permission to manage API keys";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace membership";
const PERMISSION_CHECK_ERROR_MESSAGE: &str = "Error checking permission";
const FETCH_KEYS_ERROR_MESSAGE: &str = "Error fetching workspace API configs";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const MANAGE_API_KEYS_PERMISSION: &str = "manage_api_keys";
const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";

// SAFE_COLUMNS from the legacy route (spaces removed for the PostgREST select).
const SAFE_COLUMNS: &str = "id,ws_id,name,description,key_prefix,role_id,last_used_at,expires_at,created_at,updated_at,created_by";

#[derive(serde::Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(serde::Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(serde::Deserialize)]
struct UsageLogRow {
    api_key_id: Option<String>,
    created_at: Option<String>,
}

/// Parsed query state mirroring the legacy `wantsPaginatedResponse` / schema.
struct ApiKeysQuery {
    wants_paginated: bool,
    page: String,
    page_size: String,
    /// `q` value when present and non-empty (legacy `if (q)` is falsy for "").
    search: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_api_keys_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = api_keys_ws_id(request.path)?;

    Some(match request.method {
        "GET" => api_keys_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn api_keys_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Parse the query state before the request value is consumed below.
    let query = parse_api_keys_query(request.url);

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

    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(()) => return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
        };

    // assertWorkspaceApiKeysAccess: membership + manage_api_keys permission.
    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(403, FORBIDDEN_MESSAGE),
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    match has_manage_api_keys_permission(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(403, NO_PERMISSION_MESSAGE),
        Err(()) => return message_response(500, PERMISSION_CHECK_ERROR_MESSAGE),
    }

    let (mut rows, count) =
        match fetch_api_keys(contact_data, outbound, &resolved_ws_id, &query).await {
            Ok(result) => result,
            Err(()) => return message_response(500, FETCH_KEYS_ERROR_MESSAGE),
        };

    if !rows.is_empty() {
        backfill_last_used_at(contact_data, outbound, &mut rows).await;
    }

    if query.wants_paginated {
        no_store_response(json_response(
            200,
            json!({ "data": rows, "count": count.unwrap_or(0) }),
        ))
    } else {
        no_store_response(json_response(200, Value::Array(rows)))
    }
}

async fn fetch_api_keys(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &ApiKeysQuery,
) -> Result<(Vec<Value>, Option<i64>), ()> {
    let mut params = vec![
        ("select", SAFE_COLUMNS.to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "created_at.desc".to_owned()),
    ];
    if let Some(search) = &query.search {
        // supabase-js `.ilike('name', '%q%')` forwards the `%`-delimited pattern.
        params.push(("name", format!("ilike.%{search}%")));
    }

    let Some(url) = contact_data.rest_url("workspace_api_keys", &params) else {
        return Err(());
    };
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    // `count: 'exact'` always requests the exact count; the legacy route only
    // surfaces it for the paginated response, and `.range()` only runs then.
    let mut outbound_request = OutboundRequest::new(OutboundMethod::Get, &url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key)
        .with_header("Prefer", "count=exact");

    let range = query
        .wants_paginated
        .then(|| paginated_range(&query.page, &query.page_size));
    if let Some(range) = range.as_deref() {
        outbound_request = outbound_request
            .with_header("Range-Unit", "items")
            .with_header("Range", range);
    }

    let response = outbound.send(outbound_request).await.map_err(|_| ())?;

    // PostgREST returns 206 Partial Content for satisfied Range reads.
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let count = total_count_from_content_range(&response);
    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;

    Ok((rows, count))
}

/// Reads the most recent usage-log timestamp per key and overwrites
/// `last_used_at` on each row. Errors are swallowed (legacy ignores them), so
/// keys without a usage log get `last_used_at = null`.
async fn backfill_last_used_at(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    rows: &mut [Value],
) {
    let key_ids: Vec<String> = rows
        .iter()
        .filter_map(|row| row.get("id").and_then(Value::as_str).map(str::to_owned))
        .collect();

    let last_used = fetch_last_used_map(contact_data, outbound, &key_ids).await;

    for row in rows.iter_mut() {
        if let Some(object) = row.as_object_mut() {
            let id = object.get("id").and_then(Value::as_str).map(str::to_owned);
            let value = id
                .and_then(|id| last_used.get(&id).cloned())
                .map_or(Value::Null, Value::String);
            object.insert("last_used_at".to_owned(), value);
        }
    }
}

async fn fetch_last_used_map(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    key_ids: &[String],
) -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    if key_ids.is_empty() {
        return map;
    }

    let in_list = format!("in.({})", key_ids.join(","));
    let Some(url) = contact_data.rest_url(
        "workspace_api_key_usage_logs",
        &[
            ("select", "api_key_id,created_at".to_owned()),
            ("api_key_id", in_list),
            ("order", "created_at.desc".to_owned()),
        ],
    ) else {
        return map;
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return map;
    };
    let authorization = format!("Bearer {service_role_key}");

    let Ok(response) = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
    else {
        return map;
    };

    if !(200..300).contains(&response.status) {
        return map;
    }

    let Ok(logs) = response.json::<Vec<UsageLogRow>>() else {
        return map;
    };

    // Rows are ordered created_at.desc; keep the first (most recent) per key.
    for log in logs {
        if let (Some(api_key_id), Some(created_at)) = (log.api_key_id, log.created_at) {
            map.entry(api_key_id).or_insert(created_at);
        }
    }

    map
}

async fn has_manage_api_keys_permission(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let rpc_url = contact_data
        .rpc_url(HAS_WORKSPACE_PERMISSION_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&json!({
        "p_user_id": user_id,
        "p_ws_id": ws_id,
        "p_permission": MANAGE_API_KEYS_PERMISSION,
    }))
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

    Ok(response.json::<bool>().unwrap_or(false))
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
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // verifyWorkspaceMembershipType defaults to requiredType "MEMBER" and
    // requires an exact match (not OWNER/ADMIN), mirrored here.
    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        == Some("MEMBER"))
}

// --- Workspace id normalization (mirrors workspaces_wsid_api_keys_roles). ---

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
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
            return Ok(resolved_ws_id);
        }

        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, access_token).await?
        {
            return Ok(workspace_id);
        }
        if let Some(workspace_id) =
            workspace_id_by_handle_service_role(contact_data, outbound, &handle).await?
        {
            return Ok(workspace_id);
        }
    }

    Ok(resolved_ws_id)
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
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id)
        .ok_or(())
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    access_token: &str,
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
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn workspace_id_by_handle_service_role(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
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
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn send_caller_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");

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

async fn send_service_role_rest_request(
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

// --- Pure helpers (query parsing, range, count, response shaping, path). ---

/// Parses `page` / `pageSize` / `q` from the request URL, mirroring the legacy
/// `wantsPaginatedResponse` presence check and `ApiKeyListQuerySchema` defaults.
fn parse_api_keys_query(request_url: Option<&str>) -> ApiKeysQuery {
    let mut wants_paginated = false;
    let mut page: Option<String> = None;
    let mut page_size: Option<String> = None;
    let mut q: Option<String> = None;

    if let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) {
        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "page" => {
                    wants_paginated = true;
                    // Object.fromEntries keeps the last occurrence.
                    page = Some(value.into_owned());
                }
                "pageSize" => {
                    wants_paginated = true;
                    page_size = Some(value.into_owned());
                }
                "q" => {
                    wants_paginated = true;
                    q = Some(value.into_owned());
                }
                _ => {}
            }
        }
    }

    ApiKeysQuery {
        wants_paginated,
        // Schema defaults: page '1', pageSize '10'.
        page: page.unwrap_or_else(|| "1".to_owned()),
        page_size: page_size.unwrap_or_else(|| "10".to_owned()),
        // Legacy `if (q)` skips the ilike filter for an empty string.
        search: q.filter(|value| !value.is_empty()),
    }
}

/// Mirrors the legacy `range(start, end)` math:
///   parsedPage = max(1, parseInt(page) || 1)
///   parsedSize = max(1, parseInt(pageSize) || 10)
///   start = (parsedPage - 1) * parsedSize; end = start + parsedSize - 1
fn paginated_range(page: &str, page_size: &str) -> String {
    let parsed_page = clamp_min_one(js_parse_int(page), 1);
    let parsed_size = clamp_min_one(js_parse_int(page_size), 10);
    let start = (parsed_page - 1) * parsed_size;
    let end = start + parsed_size - 1;
    format!("{start}-{end}")
}

/// Reproduces `Math.max(1, Number.parseInt(value, 10) || fallback)`.
fn clamp_min_one(parsed: Option<i64>, fallback: i64) -> i64 {
    // `|| fallback`: NaN (None) and 0 are falsy in JS.
    let value = match parsed {
        Some(0) | None => fallback,
        Some(value) => value,
    };
    value.max(1)
}

/// Reproduces `Number.parseInt(value, 10)` for a leading optional-sign integer.
fn js_parse_int(value: &str) -> Option<i64> {
    let trimmed = value.trim_start();
    let mut chars = trimmed.char_indices().peekable();
    let mut sign = 1_i64;

    if let Some((_, first)) = chars.peek().copied() {
        match first {
            '-' => {
                sign = -1;
                chars.next();
            }
            '+' => {
                chars.next();
            }
            _ => {}
        }
    }

    let mut digits = String::new();
    while let Some((_, character)) = chars.peek().copied() {
        if !character.is_ascii_digit() {
            break;
        }
        digits.push(character);
        chars.next();
    }

    if digits.is_empty() {
        return None;
    }

    digits.parse::<i64>().ok().map(|value| sign * value)
}

/// Parses the PostgREST `Content-Range: <range>/<total>` total count.
fn total_count_from_content_range(response: &OutboundResponse) -> Option<i64> {
    let header = response.header("content-range")?;
    let (_, total) = header.rsplit_once('/')?;
    total.parse::<i64>().ok()
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

fn api_keys_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn api_keys_ws_id_extracts_workspace_segment() {
        assert_eq!(
            api_keys_ws_id("/api/v1/workspaces/ws-123/api-keys"),
            Some("ws-123")
        );
    }

    #[test]
    fn api_keys_ws_id_rejects_other_paths() {
        // The sibling `/roles` and `/{keyId}/usage-logs` routes must not match.
        assert_eq!(
            api_keys_ws_id("/api/v1/workspaces/ws-123/api-keys/roles"),
            None
        );
        assert_eq!(
            api_keys_ws_id("/api/v1/workspaces/ws-123/api-keys/keyid/usage-logs"),
            None
        );
        assert_eq!(api_keys_ws_id("/api/workspaces/ws-123/api-keys"), None);
        assert_eq!(api_keys_ws_id("/api/v1/workspaces//api-keys"), None);
    }

    #[test]
    fn api_keys_ws_id_rejects_nested_workspace_segment() {
        assert_eq!(api_keys_ws_id("/api/v1/workspaces/ws/extra/api-keys"), None);
    }

    #[test]
    fn parse_query_defaults_to_non_paginated() {
        let query = parse_api_keys_query(Some("https://x.dev/api/v1/workspaces/ws/api-keys"));
        assert!(!query.wants_paginated);
        assert_eq!(query.page, "1");
        assert_eq!(query.page_size, "10");
        assert_eq!(query.search, None);
    }

    #[test]
    fn parse_query_marks_paginated_when_any_param_present() {
        let page_only =
            parse_api_keys_query(Some("https://x.dev/api/v1/workspaces/ws/api-keys?page=2"));
        assert!(page_only.wants_paginated);
        assert_eq!(page_only.page, "2");

        let size_only = parse_api_keys_query(Some(
            "https://x.dev/api/v1/workspaces/ws/api-keys?pageSize=25",
        ));
        assert!(size_only.wants_paginated);
        assert_eq!(size_only.page_size, "25");

        let q_only =
            parse_api_keys_query(Some("https://x.dev/api/v1/workspaces/ws/api-keys?q=prod"));
        assert!(q_only.wants_paginated);
        assert_eq!(q_only.search.as_deref(), Some("prod"));
    }

    #[test]
    fn parse_query_empty_q_is_present_but_not_searched() {
        let query = parse_api_keys_query(Some("https://x.dev/api/v1/workspaces/ws/api-keys?q="));
        assert!(query.wants_paginated);
        assert_eq!(query.search, None);
    }

    #[test]
    fn paginated_range_uses_legacy_offset_math() {
        // page 1, size 10 -> 0-9
        assert_eq!(paginated_range("1", "10"), "0-9");
        // page 3, size 25 -> 50-74
        assert_eq!(paginated_range("3", "25"), "50-74");
    }

    #[test]
    fn paginated_range_clamps_invalid_and_zero_values() {
        // parseInt fails -> page 1 (fallback), size 10 (fallback) -> 0-9
        assert_eq!(paginated_range("abc", "xyz"), "0-9");
        // zero is falsy -> fallbacks
        assert_eq!(paginated_range("0", "0"), "0-9");
        // negatives clamp to a minimum of 1
        assert_eq!(paginated_range("-5", "-2"), "0-0");
    }

    #[test]
    fn js_parse_int_matches_prefix_semantics() {
        assert_eq!(js_parse_int("12abc"), Some(12));
        assert_eq!(js_parse_int("  -7"), Some(-7));
        assert_eq!(js_parse_int("abc"), None);
        assert_eq!(js_parse_int(""), None);
    }

    #[test]
    fn message_and_error_response_shapes_match_legacy() {
        let message = message_response(403, FORBIDDEN_MESSAGE);
        assert_eq!(message.status, 403);
        assert_eq!(message.body, json!({ "message": FORBIDDEN_MESSAGE }));

        let error = error_response(401, UNAUTHORIZED_MESSAGE);
        assert_eq!(error.status, 401);
        assert_eq!(error.body, json!({ "error": UNAUTHORIZED_MESSAGE }));
    }
}
