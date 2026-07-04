//! Handler for `GET /api/v1/workspaces/:wsId/promotions`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/promotions/route.ts`.
//!
//! Legacy GET behavior:
//!   1. Parses the inventory list query (`q`, `page`, `pageSize`, `response`) via
//!      `parseInventoryApiListQuery`. Invalid params short-circuit with
//!      `400 { "message": "Invalid query parameters" }` *before* auth runs.
//!   2. Authenticates via `getFinanceRouteContext` + `resolveFinanceRouteAuthContext`
//!      with `targetApp: ['finance', 'platform', 'inventory']`. This accepts a
//!      finance/platform/inventory app-session token, a CLI access token, or a
//!      regular Supabase session, then calls `getPermissions(wsId, user)`.
//!      `getPermissions` returning null (caller is not a workspace member / has no
//!      permission context) yields `401 { "message": "Unauthorized" }`. Unlike the
//!      sibling product-categories route, GET on promotions performs *no* specific
//!      permission gate -- any member may read.
//!   3. Reads `private.workspace_promotions` filtered by `ws_id`, with optional
//!      `promo_type != 'REFERRAL'` (`inventoryOnly=true`), optional
//!      `ilike(name, %q%)`, optional pagination range + exact count, ordered by
//!      `code` ascending.
//!   4. On query error -> `500 { "message": "Error fetching promotions" }`.
//!   5. Paginated response -> `{ count, data }`; otherwise the raw `data` array
//!      (both fall back to `0` / `[]`).
//!
//! NOTES / behavior gaps:
//!   * Only GET is migrated. POST (and any future mutation) returns `None` so the
//!     worker falls through to the still-active Next.js route; we never emit 405.
//!   * The legacy route reads under the caller's RLS session via the admin client
//!     against the `private` schema. `workspace_promotions` is workspace-scoped,
//!     so we read with the service-role key (private schema profile headers) and
//!     an explicit `ws_id` filter, matching the migrated
//!     `workspaces_promotions_count` sibling. This assumes RLS would not further
//!     restrict rows for a member that already passed the membership gate.
//!   * The PostgREST `select` is sent without whitespace (PostgREST rejects spaces
//!     in column lists); the returned column set is identical to the legacy one.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    path_segments, supabase_auth,
};

const FETCH_ERROR_MESSAGE: &str = "Error fetching promotions";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";
// `resolveFinanceRouteAuthContext({ targetApp: ['finance', 'platform', 'inventory'] })`.
const PROMOTIONS_APP_SESSION_TARGETS: [&str; 3] = ["finance", "platform", "inventory"];
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const PRIVATE_SCHEMA: &str = "private";
const PROMOTIONS_SELECT: &str = "id,name,description,code,value,use_ratio,promo_type,max_uses,current_uses,ws_id,polar_discount_id,created_at";
const REFERRAL_PROMO_TYPE: &str = "REFERRAL";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";

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
struct PromotionsUser {
    access_token: Option<String>,
    id: String,
}

enum DataAuth<'a> {
    AccessToken(&'a str),
    ServiceRole,
}

struct ListQuery {
    q: String,
    page: i64,
    page_size: i64,
    paginate: bool,
    inventory_only: bool,
}

pub(crate) async fn handle_workspaces_wsid_promotions_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = promotions_ws_id(request.path)?;

    Some(match request.method {
        "GET" => promotions_response(config, request, raw_ws_id, outbound).await,
        // Every other method (POST and any future mutation) is still served by
        // the Next.js route; fall through instead of returning 405.
        _ => return None,
    })
}

async fn promotions_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Parse + validate query params first, matching the legacy ordering where an
    // invalid query short-circuits before the auth/permission resolution.
    let query = match parse_list_query(request.url) {
        Ok(query) => query,
        Err(()) => return message_response(400, INVALID_QUERY_MESSAGE),
    };

    if !config.contact_data.configured() {
        return message_response(500, FETCH_ERROR_MESSAGE);
    }

    // getFinanceRouteContext: app-session / CLI / Supabase session, then a
    // membership-only `getPermissions` check. All auth failures map to 401.
    let Some(user) = authenticated_user(config, request, outbound).await else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    let resolved_ws_id =
        match normalize_workspace_id(&config.contact_data, outbound, raw_ws_id, &user).await {
            Ok(Some(ws_id)) => ws_id,
            // `normalizeWorkspaceId` throwing / no workspace surfaces as
            // `getPermissions` returning null -> 401 Unauthorized.
            Ok(None) | Err(()) => return message_response(401, UNAUTHORIZED_MESSAGE),
        };

    // `getPermissions` returning null (no membership / permission context) -> 401.
    match has_permission_context(&config.contact_data, outbound, &resolved_ws_id, &user).await {
        Ok(true) => {}
        Ok(false) | Err(()) => return message_response(401, UNAUTHORIZED_MESSAGE),
    }

    match fetch_promotions(&config.contact_data, outbound, &resolved_ws_id, &query).await {
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

async fn fetch_promotions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &ListQuery,
) -> Result<(Vec<Value>, Option<u64>), ()> {
    let mut params: Vec<(&str, String)> = vec![
        ("select", PROMOTIONS_SELECT.to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "code.asc".to_owned()),
    ];

    if query.inventory_only {
        params.push(("promo_type", format!("neq.{REFERRAL_PROMO_TYPE}")));
    }

    if !query.q.is_empty() {
        params.push(("name", format!("ilike.*{}*", escape_ilike(&query.q))));
    }

    if query.paginate {
        let (start, end) = list_range(query.page, query.page_size);
        params.push(("offset", start.to_string()));
        // PostgREST `limit` corresponds to `range(start, end)` which is inclusive:
        // it returns `end - start + 1` rows.
        params.push(("limit", (end - start + 1).to_string()));
    }

    let Some(url) = contact_data.rest_url("workspace_promotions", &params) else {
        return Err(());
    };

    // `workspace_promotions` lives in the `private` schema. Request an exact count
    // via `Prefer: count=exact` only when paginating (legacy
    // `count: shouldPaginate ? 'exact' : undefined`).
    let response = send_private_request(contact_data, outbound, &url, query.paginate).await?;

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

async fn send_private_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    want_count: bool,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Accept-Profile", PRIVATE_SCHEMA)
        .with_header("Content-Profile", PRIVATE_SCHEMA)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if want_count {
        request = request.with_header("Prefer", "count=exact");
    }

    outbound.send(request).await.map_err(|_| ())
}

// --- Authentication -----------------------------------------------------------

async fn authenticated_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<PromotionsUser> {
    if contact::request_has_app_session_token(request) {
        if let Ok(identity) =
            contact::resolve_app_session_identity(config, request, &PROMOTIONS_APP_SESSION_TARGETS)
            && let Some(id) = non_empty_user_id(identity.id)
        {
            return Some(PromotionsUser {
                access_token: None,
                id,
            });
        }

        if let Ok(identity) = contact::resolve_cli_app_session_identity(config, request)
            && let Some(id) = non_empty_user_id(identity.id)
        {
            return Some(PromotionsUser {
                access_token: None,
                id,
            });
        }
    }

    let access_token = supabase_auth::request_access_token_allowing_app_sessions(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;
    let id = non_empty_user_id(user.id?)?;

    Some(PromotionsUser {
        access_token: Some(access_token),
        id,
    })
}

fn non_empty_user_id(user_id: String) -> Option<String> {
    (!user_id.trim().is_empty()).then_some(user_id)
}

// --- Membership resolution (getPermissions != null) ---------------------------

/// Mirrors `getPermissions(wsId, user)` returning a non-null result: the caller
/// is a member (or has a default/role permission context). The exact permission
/// set is irrelevant for GET, which gates only on membership.
async fn has_permission_context(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user: &PromotionsUser,
) -> Result<bool, ()> {
    let Some(membership_type) =
        workspace_membership_type(contact_data, outbound, ws_id, user).await?
    else {
        return Ok(false);
    };
    let Some(workspace) = workspace_row(contact_data, outbound, ws_id).await? else {
        return Ok(false);
    };

    let role_permissions_present = if membership_type == "MEMBER" {
        workspace_has_role_permissions(contact_data, outbound, ws_id, &user.id).await?
    } else {
        false
    };
    let default_permissions_present =
        workspace_has_default_permissions(contact_data, outbound, ws_id, &membership_type).await?;
    let is_creator =
        membership_type == "MEMBER" && workspace.creator_id.as_deref() == Some(user.id.as_str());

    Ok(is_creator || role_permissions_present || default_permissions_present)
}

async fn workspace_membership_type(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user: &PromotionsUser,
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
    let response = send_rest_request(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    decode_first_row::<WorkspaceRow>(&response)
}

async fn workspace_has_role_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
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
        return Ok(false);
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    Ok(rows.iter().any(role_value_has_permission))
}

async fn workspace_has_default_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    membership_type: &str,
) -> Result<bool, ()> {
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
        return Ok(false);
    }

    Ok(response
        .json::<Vec<PermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .any(|row| row.permission.is_some()))
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user: &PromotionsUser,
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
    user: &PromotionsUser,
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
    let response = send_rest_request(contact_data, outbound, &url, auth).await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
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

fn role_value_has_permission(value: &Value) -> bool {
    match value {
        Value::Array(items) => items.iter().any(role_value_has_permission),
        Value::Object(map) => {
            map.get("permission").and_then(Value::as_str).is_some()
                || map
                    .get("workspace_role_permissions")
                    .is_some_and(role_value_has_permission)
                || map
                    .get("workspace_roles")
                    .is_some_and(role_value_has_permission)
        }
        _ => false,
    }
}

// --- Query parsing -----------------------------------------------------------

fn parse_list_query(request_url: Option<&str>) -> Result<ListQuery, ()> {
    let mut q: Option<String> = None;
    let mut page_raw: Option<String> = None;
    let mut page_size_raw: Option<String> = None;
    let mut response_raw: Option<String> = None;
    let mut inventory_only_raw: Option<String> = None;

    if let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) {
        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "q" if q.is_none() => q = Some(value.into_owned()),
                "page" if page_raw.is_none() => page_raw = Some(value.into_owned()),
                "pageSize" if page_size_raw.is_none() => page_size_raw = Some(value.into_owned()),
                "response" if response_raw.is_none() => response_raw = Some(value.into_owned()),
                // `searchParams.get('inventoryOnly') === 'true'`. `URLSearchParams.get`
                // returns the first occurrence.
                "inventoryOnly" if inventory_only_raw.is_none() => {
                    inventory_only_raw = Some(value.into_owned());
                }
                _ => {}
            }
        }
    }

    // `searchParams.get('inventoryOnly') === 'true'`.
    let inventory_only = inventory_only_raw.as_deref() == Some("true");

    // q: string, max 500, default ''.
    let q = q.unwrap_or_default();
    if q.chars().count() > MAX_SEARCH_LENGTH {
        return Err(());
    }

    // page: coerce number, int, min 1, default 1.
    let page = match page_raw {
        Some(value) => coerce_int_min(&value, 1)?,
        None => DEFAULT_PAGE,
    };

    // pageSize: coerce number, int, min 1, max 1000, default 10.
    let page_size = match page_size_raw {
        Some(value) => {
            let parsed = coerce_int_min(&value, 1)?;
            if parsed > MAX_PAGE_SIZE {
                return Err(());
            }
            parsed
        }
        None => DEFAULT_PAGE_SIZE,
    };

    // response: enum(['paginated']) optional. Any present non-'paginated' value
    // fails the enum.
    let paginate = match response_raw.as_deref() {
        Some("paginated") => true,
        Some(_) => return Err(()),
        None => false,
    };

    Ok(ListQuery {
        q,
        page,
        page_size,
        paginate,
        inventory_only,
    })
}

// Mirrors zod `coerce.number().int().min(min)`: `Number(value)` then reject
// NaN / non-integers / below-min. `z.coerce.number()` uses JS `Number()`, which
// accepts leading/trailing whitespace and rejects empty-after-trim as NaN.
fn coerce_int_min(value: &str, min: i64) -> Result<i64, ()> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(());
    }

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
    let total = header?.rsplit('/').next()?.trim();
    if total == "*" {
        return None;
    }
    total.parse::<u64>().ok()
}

fn escape_ilike(value: &str) -> String {
    // Preserve user input verbatim inside the `*<q>*` pattern, matching the legacy
    // `%${q}%` interpolation (which performs no escaping either).
    value.to_owned()
}

// --- Path + workspace identifier helpers --------------------------------------

fn promotions_ws_id(path: &str) -> Option<&str> {
    let segments = path_segments(path);

    match segments.as_slice() {
        ["api", "v1", "workspaces", ws_id, "promotions"] if !ws_id.is_empty() => Some(ws_id),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn promotions_ws_id_matches_exact_mount_path() {
        assert_eq!(
            promotions_ws_id("/api/v1/workspaces/ws-1/promotions"),
            Some("ws-1")
        );
        assert_eq!(
            promotions_ws_id("/api/v1/workspaces/ws-1/promotions/"),
            Some("ws-1")
        );
    }

    #[test]
    fn promotions_ws_id_rejects_other_paths() {
        // Sibling count route and unrelated paths must not match.
        assert_eq!(
            promotions_ws_id("/api/v1/workspaces/ws-1/promotions/count"),
            None
        );
        assert_eq!(promotions_ws_id("/api/workspaces/ws-1/promotions"), None);
        assert_eq!(promotions_ws_id("/api/v1/workspaces/ws-1/products"), None);
        assert_eq!(promotions_ws_id("/api/v1/workspaces//promotions"), None);
        assert_eq!(promotions_ws_id("/api/v1/workspaces"), None);
        assert_eq!(promotions_ws_id("/"), None);
    }

    #[test]
    fn parse_list_query_defaults() {
        let query =
            parse_list_query(Some("https://x.test/api/v1/workspaces/w/promotions")).unwrap();
        assert_eq!(query.q, "");
        assert_eq!(query.page, DEFAULT_PAGE);
        assert_eq!(query.page_size, DEFAULT_PAGE_SIZE);
        assert!(!query.paginate);
        assert!(!query.inventory_only);
    }

    #[test]
    fn parse_list_query_reads_all_params() {
        let query = parse_list_query(Some(
            "https://x.test/p?q=sale&page=2&pageSize=25&response=paginated&inventoryOnly=true",
        ))
        .unwrap();
        assert_eq!(query.q, "sale");
        assert_eq!(query.page, 2);
        assert_eq!(query.page_size, 25);
        assert!(query.paginate);
        assert!(query.inventory_only);
    }

    #[test]
    fn parse_list_query_inventory_only_requires_exact_true() {
        let query = parse_list_query(Some("https://x.test/p?inventoryOnly=1")).unwrap();
        assert!(!query.inventory_only);
        let query = parse_list_query(Some("https://x.test/p?inventoryOnly=TRUE")).unwrap();
        assert!(!query.inventory_only);
    }

    #[test]
    fn parse_list_query_rejects_invalid_values() {
        // Non-numeric page.
        assert!(parse_list_query(Some("https://x.test/p?page=abc")).is_err());
        // Below min.
        assert!(parse_list_query(Some("https://x.test/p?page=0")).is_err());
        // Non-integer.
        assert!(parse_list_query(Some("https://x.test/p?pageSize=1.5")).is_err());
        // Above max.
        assert!(parse_list_query(Some("https://x.test/p?pageSize=1001")).is_err());
        // Bad response enum.
        assert!(parse_list_query(Some("https://x.test/p?response=all")).is_err());
        // q over length.
        let long_q = "x".repeat(MAX_SEARCH_LENGTH + 1);
        assert!(parse_list_query(Some(&format!("https://x.test/p?q={long_q}"))).is_err());
    }

    #[test]
    fn list_range_matches_legacy_offsets() {
        assert_eq!(list_range(1, 10), (0, 9));
        assert_eq!(list_range(2, 10), (10, 19));
        assert_eq!(list_range(3, 25), (50, 74));
    }

    #[test]
    fn parse_content_range_total_extracts_total() {
        assert_eq!(parse_content_range_total(Some("0-9/42")), Some(42));
        assert_eq!(parse_content_range_total(Some("*/7")), Some(7));
        assert_eq!(parse_content_range_total(Some("0-9/*")), None);
        assert_eq!(parse_content_range_total(None), None);
    }

    #[test]
    fn role_value_has_permission_walks_nested_shapes() {
        let value = json!([{
            "workspace_roles": {
                "workspace_role_permissions": [{ "permission": "view_inventory" }]
            }
        }]);
        assert!(role_value_has_permission(&value));
        assert!(!role_value_has_permission(&json!([])));
        assert!(!role_value_has_permission(
            &json!([{ "workspace_roles": {} }])
        ));
    }
}
