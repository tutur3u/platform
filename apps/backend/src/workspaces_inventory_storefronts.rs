//! Handler for `/api/v1/workspaces/:wsId/inventory/storefronts`.
//!
//! Ported from the legacy Next.js route
//! `apps/web/src/app/api/v1/workspaces/[wsId]/inventory/storefronts/route.ts`.
//!
//! Only the **GET** method is migrated here. The legacy route also defines a
//! `POST` (create storefront) that is intentionally NOT migrated yet — for any
//! method other than `GET` this handler returns `None` so the Cloudflare worker
//! falls through to the still-active Next.js route instead of 405ing a valid
//! mutation.
//!
//! GET semantics (mirrors `authorizeInventoryWorkspace` + `listStorefronts`):
//!   1. Resolve the caller's Supabase auth user from the bearer/cookie token.
//!   2. Normalize the `:wsId` segment (handles `personal`, `internal`, handles,
//!      and UUID literals) exactly like the habits-access reference handler.
//!   3. Verify the caller is a `MEMBER` of the workspace.
//!   4. Validate the `listQuerySchema` query params (`page`, `pageSize`, `q`,
//!      `status`).
//!   5. Call the `private.list_inventory_storefronts` RPC with the service role
//!      and return the `mapRpcList`-shaped `{ count, data }` payload verbatim.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const FORBIDDEN_MESSAGE: &str = "Forbidden";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const NOT_FOUND_MESSAGE: &str = "Not found";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const PRIVATE_SCHEMA: &str = "private";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";
const LIST_STOREFRONTS_RPC: &str = "list_inventory_storefronts";

const WORKSPACES_INVENTORY_STOREFRONTS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_INVENTORY_STOREFRONTS_PATH_SUFFIX: &str = "/inventory/storefronts";

// Mirrors the legacy storefront status enum + the `'all'` sentinel.
const STOREFRONT_STATUSES: &[&str] = &["draft", "published", "paused", "archived"];

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

/// One row returned by `private.list_inventory_storefronts`.
#[derive(Deserialize)]
struct StorefrontListRow {
    total_count: Option<i64>,
    storefront: Option<Value>,
}

#[derive(Serialize)]
struct StorefrontListResponse {
    count: i64,
    data: Vec<Value>,
}

/// Validated `listQuerySchema(StorefrontStatusSchema)` shape.
struct ListQuery {
    page: Option<i64>,
    page_size: Option<i64>,
    q: Option<String>,
    status: Option<String>,
}

pub(crate) async fn handle_workspaces_inventory_storefronts_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_inventory_storefronts_ws_id(request.path)?;

    Some(match request.method {
        "GET" => storefronts_list_response(config, request, raw_ws_id, outbound).await,
        // Every other method (e.g. POST) is still served by the Next.js route.
        _ => return None,
    })
}

async fn storefronts_list_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // 1. Authenticate the caller.
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

    // 2. Resolve the workspace id (handles personal/internal/handle/uuid).
    // Legacy throws -> 404 Not found when normalization fails.
    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(()) => return error_field_response(404, NOT_FOUND_MESSAGE),
        };

    // 3. Verify workspace membership.
    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(403, FORBIDDEN_MESSAGE),
        Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    // 4. Validate query params.
    let query = match parse_list_query(request.url) {
        Ok(query) => query,
        Err(issues) => {
            return no_store(json_response(
                400,
                json!({ "message": INVALID_QUERY_MESSAGE, "errors": issues }),
            ));
        }
    };

    // 5. Call the RPC and shape the response like `mapRpcList`.
    match list_storefronts(contact_data, outbound, &resolved_ws_id, &query).await {
        Ok(response) => no_store(json_response(200, response)),
        Err(()) => message_response(500, "Failed to list inventory storefronts"),
    }
}

/// Calls `private.list_inventory_storefronts` and maps the RPC rows to the
/// `{ count, data }` shape produced by the legacy `mapRpcList(data, 'storefront')`.
async fn list_storefronts(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &ListQuery,
) -> Result<StorefrontListResponse, ()> {
    // normalizePagination: limit = clamp(pageSize ?? 25, 1, 100);
    // offset = (max(1, page ?? 1) - 1) * limit.
    let limit = query.page_size.unwrap_or(25).clamp(1, 100);
    let page = query.page.unwrap_or(1).max(1);
    let offset = (page - 1) * limit;

    // normalizeSearch: trimmed non-empty string or null.
    let search = query
        .q
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    // status: drop 'all' (and unset) -> null.
    let status = query
        .status
        .as_deref()
        .filter(|value| *value != "all" && !value.is_empty());

    let body = json!({
        "p_limit": limit,
        "p_offset": offset,
        "p_search": search,
        "p_status": status,
        "p_ws_id": ws_id,
    })
    .to_string();

    let rpc_url = contact_data.rpc_url(LIST_STOREFRONTS_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
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

    let rows = response.json::<Vec<StorefrontListRow>>().map_err(|_| ())?;

    // mapRpcList: count = rows[0]?.total_count ?? 0; data = rows.map(storefront).filter(Boolean).
    let count = rows.first().and_then(|row| row.total_count).unwrap_or(0);
    let data = rows
        .into_iter()
        .filter_map(|row| row.storefront)
        .filter(|value| !value.is_null())
        .collect();

    Ok(StorefrontListResponse { count, data })
}

/// Parses + validates `listQuerySchema(StorefrontStatusSchema)`.
/// Returns the issue list (a simplified version of Zod's `error.issues`) on failure.
fn parse_list_query(request_url: Option<&str>) -> Result<ListQuery, Vec<Value>> {
    let url = request_url.and_then(|url| url::Url::parse(url).ok());
    let mut issues = Vec::new();

    let page = parse_positive_int_param(url.as_ref(), "page", 1, None, &mut issues);
    let page_size = parse_positive_int_param(url.as_ref(), "pageSize", 1, Some(100), &mut issues);

    let q = query_value(url.as_ref(), "q").and_then(|value| {
        let trimmed = value.trim().to_owned();
        if trimmed.is_empty() {
            None
        } else if trimmed.chars().count() > 120 {
            issues.push(string_too_big_issue("q", 120));
            None
        } else {
            Some(trimmed)
        }
    });

    let status = query_value(url.as_ref(), "status").and_then(|value| {
        if value.is_empty() {
            None
        } else if value == "all" || STOREFRONT_STATUSES.contains(&value.as_str()) {
            Some(value)
        } else {
            issues.push(invalid_enum_issue("status"));
            None
        }
    });

    if issues.is_empty() {
        Ok(ListQuery {
            page,
            page_size,
            q,
            status,
        })
    } else {
        Err(issues)
    }
}

/// Coerced positive integer (matches `z.coerce.number().int().min(1)` and an
/// optional `.max(...)`). Empty/absent => None. Invalid => records an issue.
fn parse_positive_int_param(
    url: Option<&url::Url>,
    key: &str,
    min: i64,
    max: Option<i64>,
    issues: &mut Vec<Value>,
) -> Option<i64> {
    let raw = query_value(url, key)?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    // z.coerce.number() parses through Number(); reject non-numeric / non-integer.
    let Ok(parsed) = trimmed.parse::<f64>() else {
        issues.push(invalid_type_issue(key));
        return None;
    };
    if parsed.fract() != 0.0 {
        issues.push(not_integer_issue(key));
        return None;
    }
    let value = parsed as i64;
    if value < min {
        issues.push(too_small_issue(key, min));
        return None;
    }
    if let Some(max) = max
        && value > max
    {
        issues.push(too_big_issue(key, max));
        return None;
    }
    Some(value)
}

fn invalid_type_issue(path: &str) -> Value {
    json!({ "code": "invalid_type", "path": [path], "message": "Expected number" })
}

fn not_integer_issue(path: &str) -> Value {
    json!({ "code": "invalid_type", "path": [path], "message": "Expected integer" })
}

fn too_small_issue(path: &str, minimum: i64) -> Value {
    json!({
        "code": "too_small",
        "minimum": minimum,
        "type": "number",
        "inclusive": true,
        "path": [path],
        "message": format!("Number must be greater than or equal to {minimum}"),
    })
}

fn too_big_issue(path: &str, maximum: i64) -> Value {
    json!({
        "code": "too_big",
        "maximum": maximum,
        "type": "number",
        "inclusive": true,
        "path": [path],
        "message": format!("Number must be less than or equal to {maximum}"),
    })
}

fn string_too_big_issue(path: &str, maximum: i64) -> Value {
    json!({
        "code": "too_big",
        "maximum": maximum,
        "type": "string",
        "inclusive": true,
        "path": [path],
        "message": format!("String must contain at most {maximum} character(s)"),
    })
}

fn invalid_enum_issue(path: &str) -> Value {
    json!({
        "code": "invalid_union",
        "path": [path],
        "message": "Invalid input",
    })
}

fn query_value(url: Option<&url::Url>, key: &str) -> Option<String> {
    url?.query_pairs()
        .find_map(|(name, value)| (name == key).then(|| value.into_owned()))
}

// --- Workspace resolution + membership (copied from the habits-access reference
// handler `workspace_habits_access.rs`, which holds these as private fns) ------

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

    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        == Some("MEMBER"))
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

fn workspaces_inventory_storefronts_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_INVENTORY_STOREFRONTS_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_INVENTORY_STOREFRONTS_PATH_SUFFIX)?;

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

fn no_store(response: BackendResponse) -> BackendResponse {
    crate::no_store_response(response)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store(json_response(status, json!({ "message": message })))
}

fn error_field_response(status: u16, message: &str) -> BackendResponse {
    no_store(json_response(status, json!({ "error": message })))
}
