use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    path_segments, supabase_auth,
};

// Mirrors the legacy GET route in
// apps/web/src/app/api/v1/workspaces/[wsId]/product-categories/route.ts
//
// The legacy route:
//   1. Parses the inventory list query (`q`, `page`, `pageSize`, `response`).
//      Invalid params -> 400 `{ message: 'Invalid query parameters' }`.
//   2. Resolves permissions via `getPermissions`. Null -> 404 `{ error: 'Not found' }`.
//   3. Requires `view_inventory`. Missing -> 403
//      `{ message: 'Insufficient permissions to view inventory' }`.
//   4. Reads `product_categories` filtered by `ws_id`, optional `ilike(name, %q%)`,
//      optional pagination range, optional exact count.
//   5. On query error -> 500 `{ message: 'Error fetching product categories' }`.
//   6. Paginated response -> `{ count, data }`; otherwise the raw `data` array.
//
// NOTE: only GET is migrated. POST (and any future mutation method) returns
// `None` so the Cloudflare worker falls through to the still-active Next.js
// route. We therefore never emit `method_not_allowed` here.

const ADMIN_PERMISSION: &str = "admin";
const FETCH_ERROR_MESSAGE: &str = "Error fetching product categories";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient permissions to view inventory";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";
// The inventory app session is the only non-Supabase principal the legacy
// inventory routes accept, matching `workspaces_inventory_access`.
const INVENTORY_APP_SESSION_TARGETS: [&str; 1] = ["inventory"];
const LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const NOT_FOUND_MESSAGE: &str = "Not found";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const VIEW_INVENTORY_PERMISSION: &str = "view_inventory";

// Zod schema bounds from apps/web/src/lib/inventory/api-list-query.ts:
//   q: max(MAX_SEARCH_LENGTH=500), default ''
//   page: coerce int, min 1, default 1
//   pageSize: coerce int, min 1, max(MAX_MEDIUM_TEXT_LENGTH=1000), default 10
const MAX_SEARCH_LENGTH: usize = 500;
const MAX_PAGE_SIZE: i64 = 1000;
const DEFAULT_PAGE: i64 = 1;
const DEFAULT_PAGE_SIZE: i64 = 10;

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

#[derive(Serialize)]
struct PaginatedResponse {
    count: u64,
    data: Vec<Value>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct InventoryUser {
    access_token: Option<String>,
    id: String,
}

enum DataAuth<'a> {
    AccessToken(&'a str),
    ServiceRole,
}

struct EffectivePermissions {
    has_all_permissions: bool,
    permissions: Vec<String>,
}

struct ListQuery {
    q: String,
    page: i64,
    page_size: i64,
    paginate: bool,
}

pub(crate) async fn handle_workspaces_product_categories_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = product_categories_ws_id(request.path)?;

    Some(match request.method {
        "GET" => product_categories_response(config, request, raw_ws_id, outbound).await,
        // Every other method (POST and any future mutation) is still served by
        // the Next.js route; fall through instead of returning 405.
        _ => return None,
    })
}

async fn product_categories_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !config.contact_data.configured() {
        return message_response(500, LOOKUP_FAILED_MESSAGE);
    }

    // Parse + validate query params first, matching the legacy ordering where
    // an invalid query short-circuits before the permission check.
    let query = match parse_list_query(request.url) {
        Ok(query) => query,
        Err(()) => return message_response(400, INVALID_QUERY_MESSAGE),
    };

    let Some(user) = authenticated_user(config, request, outbound).await else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    let resolved_ws_id =
        match normalize_workspace_id(&config.contact_data, outbound, raw_ws_id, &user).await {
            Ok(Some(ws_id)) => ws_id,
            // `normalizeWorkspaceId` throwing maps to `getPermissions` returning
            // null -> 404 `{ error: 'Not found' }`.
            Ok(None) | Err(()) => return error_response(404, NOT_FOUND_MESSAGE),
        };

    // `getPermissions` -> null surfaces as 404 `{ error: 'Not found' }`.
    let permissions =
        match effective_permissions(&config.contact_data, outbound, &resolved_ws_id, &user).await {
            Ok(Some(permissions)) => permissions,
            Ok(None) | Err(()) => return error_response(404, NOT_FOUND_MESSAGE),
        };

    // containsPermission('view_inventory') == isCreator || isAdmin || permissions.includes(..)
    let can_view = permissions.has_all_permissions
        || permissions
            .permissions
            .iter()
            .any(|value| value == VIEW_INVENTORY_PERMISSION);
    if !can_view {
        return message_response(403, INSUFFICIENT_PERMISSIONS_MESSAGE);
    }

    match fetch_product_categories(&config.contact_data, outbound, &resolved_ws_id, &query).await {
        Ok((data, count)) => {
            if query.paginate {
                no_store_response(json_response(
                    200,
                    PaginatedResponse {
                        count: count.unwrap_or(0),
                        data,
                    },
                ))
            } else {
                no_store_response(json_response(200, Value::Array(data)))
            }
        }
        Err(()) => message_response(500, FETCH_ERROR_MESSAGE),
    }
}

async fn fetch_product_categories(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &ListQuery,
) -> Result<(Vec<Value>, Option<u64>), ()> {
    // The legacy route runs under the caller's RLS session via `createClient()`.
    // `product_categories` is workspace-scoped, so we read with the service-role
    // key and an explicit `ws_id` filter, matching the other migrated inventory
    // handlers. See notes: this assumes RLS would not further restrict rows for a
    // workspace member that already passed the `view_inventory` permission gate.
    let mut params: Vec<(&str, String)> =
        vec![("select", "*".to_owned()), ("ws_id", format!("eq.{ws_id}"))];

    if !query.q.is_empty() {
        params.push(("name", format!("ilike.*{}*", escape_ilike(&query.q))));
    }

    if query.paginate {
        let (start, end) = list_range(query.page, query.page_size);
        params.push(("offset", start.to_string()));
        // PostgREST `limit` is exclusive of the upper bound used by `.range`,
        // which is inclusive: range(start, end) returns `end - start + 1` rows.
        params.push(("limit", (end - start + 1).to_string()));
    }

    let Some(url) = contact_data.rest_url("product_categories", &params) else {
        return Err(());
    };

    // Request an exact count via `Prefer: count=exact` only when paginating,
    // matching `count: shouldPaginate ? 'exact' : undefined`.
    let response =
        send_product_categories_request(contact_data, outbound, &url, query.paginate).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let data = response.json::<Vec<Value>>().map_err(|_| ())?;
    let count = if query.paginate {
        parse_content_range_total(response.header("Content-Range"))
    } else {
        None
    };

    Ok((data, count))
}

async fn send_product_categories_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    want_count: bool,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if want_count {
        request = request.with_header("Prefer", "count=exact");
    }

    outbound.send(request).await.map_err(|_| ())
}

// --- Permission resolution (copied from `workspaces_inventory_access`) --------

async fn authenticated_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<InventoryUser> {
    if contact::request_has_app_session_token(request) {
        let identity =
            contact::resolve_app_session_identity(config, request, &INVENTORY_APP_SESSION_TARGETS)
                .ok()?;

        return non_empty_user_id(identity.id).map(|id| InventoryUser {
            access_token: None,
            id,
        });
    }

    let access_token = supabase_auth::request_access_token(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;
    let id = non_empty_user_id(user.id?)?;

    Some(InventoryUser {
        access_token: Some(access_token),
        id,
    })
}

fn non_empty_user_id(user_id: String) -> Option<String> {
    (!user_id.trim().is_empty()).then_some(user_id)
}

async fn effective_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user: &InventoryUser,
) -> Result<Option<EffectivePermissions>, ()> {
    // `getPermissions` resolves membership independently with requiredType ANY.
    let Some(membership_type) =
        workspace_membership_type(contact_data, outbound, ws_id, user).await?
    else {
        return Ok(None);
    };
    let Some(workspace) = workspace_row(contact_data, outbound, ws_id).await? else {
        return Ok(None);
    };

    let role_permissions = if membership_type == "MEMBER" {
        workspace_role_permissions(contact_data, outbound, ws_id, &user.id).await?
    } else {
        Vec::new()
    };
    let default_permissions =
        workspace_default_permissions(contact_data, outbound, ws_id, &membership_type).await?;
    let is_creator =
        membership_type == "MEMBER" && workspace.creator_id.as_deref() == Some(user.id.as_str());

    if !is_creator && role_permissions.is_empty() && default_permissions.is_empty() {
        return Ok(None);
    }

    let mut permissions = Vec::new();
    extend_unique_permissions(&mut permissions, role_permissions);
    extend_unique_permissions(&mut permissions, default_permissions);

    Ok(Some(EffectivePermissions {
        has_all_permissions: is_creator
            || permissions.iter().any(|value| value == ADMIN_PERMISSION),
        permissions,
    }))
}

async fn workspace_membership_type(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user: &InventoryUser,
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
    let response =
        send_rest_request(contact_data, outbound, OutboundMethod::Get, &url, &auth).await?;

    if !is_success_status(response.status) {
        return Err(());
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
    let response =
        send_service_role_rest_request(contact_data, outbound, OutboundMethod::Get, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
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
    let response =
        send_service_role_rest_request(contact_data, outbound, OutboundMethod::Get, &url).await?;

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
    let response =
        send_service_role_rest_request(contact_data, outbound, OutboundMethod::Get, &url).await?;

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

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user: &InventoryUser,
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
    user: &InventoryUser,
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
    let response =
        send_rest_request(contact_data, outbound, OutboundMethod::Get, &url, &auth).await?;

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

async fn send_service_role_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
) -> Result<OutboundResponse, ()> {
    send_rest_request(contact_data, outbound, method, url, &DataAuth::ServiceRole).await
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

// --- Query parsing -----------------------------------------------------------

fn parse_list_query(request_url: Option<&str>) -> Result<ListQuery, ()> {
    let mut q: Option<String> = None;
    let mut page_raw: Option<String> = None;
    let mut page_size_raw: Option<String> = None;
    let mut response_raw: Option<String> = None;

    if let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) {
        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "q" if q.is_none() => q = Some(value.into_owned()),
                "page" if page_raw.is_none() => page_raw = Some(value.into_owned()),
                "pageSize" if page_size_raw.is_none() => page_size_raw = Some(value.into_owned()),
                "response" if response_raw.is_none() => response_raw = Some(value.into_owned()),
                _ => {}
            }
        }
    }

    // q: string, max 500, default ''.
    let q = q.unwrap_or_default();
    if q.chars().count() > MAX_SEARCH_LENGTH {
        return Err(());
    }

    // page: coerce number, int, min 1, default 1.
    let page = match page_raw {
        Some(value) => coerce_int_min(&value, DEFAULT_PAGE, 1)?,
        None => DEFAULT_PAGE,
    };

    // pageSize: coerce number, int, min 1, max 1000, default 10.
    let page_size = match page_size_raw {
        Some(value) => {
            let parsed = coerce_int_min(&value, DEFAULT_PAGE_SIZE, 1)?;
            if parsed > MAX_PAGE_SIZE {
                return Err(());
            }
            parsed
        }
        None => DEFAULT_PAGE_SIZE,
    };

    // response: enum(['paginated']) optional. Any non-empty value other than
    // 'paginated' fails the enum. `shouldReturnPaginatedInventoryList` only
    // treats exactly 'paginated' as paginated.
    let paginate = match response_raw.as_deref() {
        Some("paginated") => true,
        // An empty value is coerced away by the route's `searchParams.forEach`
        // capturing it as '' which fails the enum; treat empty as invalid only
        // when the key is present with a non-enum value.
        Some(other) if !other.is_empty() => return Err(()),
        Some(_) => return Err(()),
        None => false,
    };

    Ok(ListQuery {
        q,
        page,
        page_size,
        paginate,
    })
}

// Mirrors zod `coerce.number().int().min(min)`: `Number(value)` then reject
// NaN / non-integers / below-min. `z.coerce.number()` uses JS `Number()`, which
// accepts leading/trailing whitespace and rejects empty-after-trim as NaN.
fn coerce_int_min(value: &str, _default: i64, min: i64) -> Result<i64, ()> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(());
    }

    // JS Number() accepts floats; .int() then requires an integer value.
    let parsed: f64 = trimmed.parse::<f64>().map_err(|_| ())?;
    if !parsed.is_finite() || parsed.fract() != 0.0 {
        return Err(());
    }

    let parsed = parsed as i64;
    if parsed < min {
        return Err(());
    }

    Ok(parsed)
}

fn list_range(page: i64, page_size: i64) -> (i64, i64) {
    let start = (page - 1) * page_size;
    let end = start + page_size - 1;
    (start, end)
}

// PostgREST returns `Content-Range: <start>-<end>/<total>` (or `*/<total>`).
fn parse_content_range_total(header: Option<&str>) -> Option<u64> {
    let header = header?;
    let total = header.rsplit('/').next()?.trim();
    if total == "*" {
        return None;
    }
    total.parse::<u64>().ok()
}

fn escape_ilike(value: &str) -> String {
    // Preserve user input verbatim inside the `*<q>*` PostgREST pattern, matching
    // the legacy `%${q}%` interpolation (which performs no escaping either).
    value.to_owned()
}

// --- Path + workspace identifier helpers (copied from inventory access) -------

fn product_categories_ws_id(path: &str) -> Option<&str> {
    let segments = path_segments(path);

    match segments.as_slice() {
        ["api", "v1", "workspaces", ws_id, "product-categories"] if !ws_id.is_empty() => {
            Some(ws_id)
        }
        _ => None,
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

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
