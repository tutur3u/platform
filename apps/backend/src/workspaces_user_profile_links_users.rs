use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/user-profile-links/users";

const MANAGE_PERMISSION: &str = "manage_user_profile_links";
const VIEW_PRIVATE_INFO_PERMISSION: &str = "view_users_private_info";
const ADMIN_PERMISSION: &str = "admin";

const GET_WORKSPACE_USERS_RPC: &str = "get_workspace_users";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const DEFAULT_LIMIT: i64 = 20;
const MIN_LIMIT: i64 = 1;
const MAX_LIMIT: i64 = 50;

// Mirror of `normalizeAvatarImageSrc` constants in
// `packages/utils/src/avatar-url.ts`.
const SUPABASE_PUBLIC_AVATAR_PATH: &str = "/storage/v1/object/public/avatars/";
const SUPABASE_MALFORMED_PUBLIC_AVATAR_PATH: &str = "/storage/v1/object/v1/public/avatars/";

#[derive(Deserialize)]
struct WorkspaceUserSearchRow {
    id: Option<String>,
    display_name: Option<String>,
    full_name: Option<String>,
    avatar_url: Option<String>,
    email: Option<String>,
    phone: Option<String>,
    birthday: Option<String>,
    gender: Option<String>,
    archived: Option<bool>,
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

#[derive(Deserialize)]
struct PermissionRow {
    permission: Option<String>,
}

struct EffectivePermissions {
    has_all_permissions: bool,
    permissions: Vec<String>,
}

pub(crate) async fn handle_workspaces_user_profile_links_users_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = route_ws_id(request.path)?;

    Some(match request.method {
        "GET" => users_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn users_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Legacy `getPermissions` returns null when the caller has no access to the
    // workspace, which the route maps to a 404 `{ error: 'Not found' }`.
    let permissions = match resolve_permissions(contact_data, request, raw_ws_id, outbound).await {
        Ok(Some(permissions)) => permissions,
        Ok(None) => return not_found_response(),
        Err(()) => {
            // `getPermissions` failures surface as "no access" in the legacy
            // route (it only ever returns the permission object or null), so
            // keep the same 404 shape to avoid leaking workspace existence.
            return not_found_response();
        }
    };

    if !permissions.contains(MANAGE_PERMISSION) {
        return message_response(403, "Insufficient permissions to manage profile links");
    }

    let can_view_private_info = permissions.contains(VIEW_PRIVATE_INFO_PERMISSION);

    let query = UsersQuery::from_url(request.url);

    // `resolve_permissions` returns the normalized workspace id so the RPC call
    // matches the legacy `getPermissions` -> `get_workspace_users` flow.
    match fetch_workspace_users(contact_data, outbound, &permissions.ws_id, &query).await {
        Ok(rows) => {
            let data: Vec<Value> = rows
                .into_iter()
                .map(|row| sanitize_user(row, can_view_private_info))
                .collect();
            no_store_response(json_response(200, json!({ "data": data })))
        }
        Err(()) => message_response(500, "Error searching users"),
    }
}

struct UsersQuery {
    search: String,
    limit: i64,
}

impl UsersQuery {
    fn from_url(request_url: Option<&str>) -> Self {
        let mut search = String::new();
        let mut limit = DEFAULT_LIMIT;

        if let Some(parsed) = request_url.and_then(|raw| url::Url::parse(raw).ok()) {
            for (key, value) in parsed.query_pairs() {
                match key.as_ref() {
                    // Legacy: `searchParams.get('q')?.trim() ?? ''`.
                    "q" => search = value.trim().to_owned(),
                    // Legacy `parseLimit`: NaN -> 20, else clamp to [1, 50].
                    "limit" => limit = parse_limit(value.as_ref()),
                    _ => {}
                }
            }
        }

        Self { search, limit }
    }
}

fn parse_limit(value: &str) -> i64 {
    // Mirror `Number.parseInt(value ?? '', 10)`: parse leading integer prefix
    // (JS parseInt stops at the first non-numeric char) and treat failures as 20.
    match parse_int_prefix(value) {
        Some(parsed) => parsed.clamp(MIN_LIMIT, MAX_LIMIT),
        None => DEFAULT_LIMIT,
    }
}

/// Approximates JavaScript `Number.parseInt(value, 10)` for the leading-integer
/// case used by the legacy route. Returns `None` when no digits lead the string.
fn parse_int_prefix(value: &str) -> Option<i64> {
    let trimmed = value.trim_start();

    // Optional leading sign.
    let rest = trimmed.strip_prefix(['+', '-']).unwrap_or(trimmed);

    let mut end = 0usize;
    let mut started = false;
    for (index, character) in rest.char_indices() {
        if character.is_ascii_digit() {
            started = true;
            end = index + character.len_utf8();
        } else {
            break;
        }
    }

    if !started {
        return None;
    }

    let sign = if trimmed.starts_with('-') { "-" } else { "" };
    let digits = &rest[..end];
    format!("{sign}{digits}").parse::<i64>().ok()
}

async fn fetch_workspace_users(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &UsersQuery,
) -> Result<Vec<WorkspaceUserSearchRow>, ()> {
    let Some(base_url) = contact_data.rpc_url(GET_WORKSPACE_USERS_RPC) else {
        return Err(());
    };
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    // Mirror the legacy `.order('full_name', ascending, nullsFirst: false)`
    // then `.order('display_name', ...)`. PostgREST applies `order` from the
    // query string to the RPC result set.
    let order = "full_name.asc.nullslast,display_name.asc.nullslast";
    let request_url = format!("{base_url}?order={order}");

    // Legacy RPC named arguments.
    let body = json!({
        "_ws_id": ws_id,
        "excluded_groups": [],
        "include_archived": true,
        "included_groups": [],
        "link_status": "all",
        "search_query": query.search,
    })
    .to_string();

    // Legacy `.range(0, limit - 1)` -> PostgREST Range header `0-(limit-1)`.
    let range_header = format!("0-{}", query.limit - 1);

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &request_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Range-Unit", "items")
                .with_header("Range", &range_header)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    // PostgREST returns 200 or 206 (Partial Content) when a Range is applied.
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response
        .json::<Vec<WorkspaceUserSearchRow>>()
        .map_err(|_| ())
}

fn sanitize_user(row: WorkspaceUserSearchRow, can_view_private_info: bool) -> Value {
    json!({
        "id": row.id,
        "display_name": row.display_name,
        "full_name": row.full_name,
        "avatar_url": normalize_avatar_image_src(row.avatar_url.as_deref()),
        "email": private_field(row.email, can_view_private_info),
        "phone": private_field(row.phone, can_view_private_info),
        "birthday": private_field(row.birthday, can_view_private_info),
        "gender": private_field(row.gender, can_view_private_info),
        "archived": row.archived,
        "private_fields_hidden": !can_view_private_info,
    })
}

fn private_field(value: Option<String>, can_view_private_info: bool) -> Option<String> {
    if can_view_private_info { value } else { None }
}

// ---------------------------------------------------------------------------
// Avatar normalization (port of `normalizeAvatarImageSrc`).
// ---------------------------------------------------------------------------

/// Port of `normalizeAvatarImageSrc`. Returns `null`/`None` when the source is
/// empty, protocol-relative, or a bare UUID; otherwise returns the (possibly
/// rewritten) image source. The legacy route applies `?? null` so a `None`
/// result serializes to JSON `null`.
fn normalize_avatar_image_src(value: Option<&str>) -> Option<String> {
    let src = value?.trim();

    if src.is_empty() || src.starts_with("//") || is_uuid_v1_to_v5(src) {
        return None;
    }

    let lower = src.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        return Some(normalize_supabase_public_avatar_url(src));
    }

    if src.starts_with('/')
        || src.starts_with("blob:")
        || lower.starts_with("data:image/")
        || src.starts_with("avatars/")
    {
        return Some(src.to_owned());
    }

    None
}

fn normalize_supabase_public_avatar_url(src: &str) -> String {
    let Ok(mut url) = url::Url::parse(src) else {
        return src.to_owned();
    };

    let host_is_supabase = url
        .host_str()
        .map(|host| host.ends_with(".supabase.co"))
        .unwrap_or(false);

    let Some(object_path) = supabase_public_avatar_object_path(url.path()) else {
        return src.to_owned();
    };

    if !host_is_supabase {
        return src.to_owned();
    }

    url.set_path(&format!("{SUPABASE_PUBLIC_AVATAR_PATH}{object_path}"));
    url.to_string()
}

fn supabase_public_avatar_object_path(pathname: &str) -> Option<String> {
    if let Some(rest) = pathname.strip_prefix(SUPABASE_PUBLIC_AVATAR_PATH) {
        return Some(rest.to_owned());
    }
    if let Some(rest) = pathname.strip_prefix(SUPABASE_MALFORMED_PUBLIC_AVATAR_PATH) {
        return Some(rest.to_owned());
    }
    None
}

/// Matches `/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`.
fn is_uuid_v1_to_v5(value: &str) -> bool {
    if value.len() != 36 {
        return false;
    }

    value.chars().enumerate().all(|(index, character)| {
        let lower = character.to_ascii_lowercase();
        match index {
            8 | 13 | 18 | 23 => character == '-',
            14 => matches!(lower, '1'..='5'),
            19 => matches!(lower, '8' | '9' | 'a' | 'b'),
            _ => lower.is_ascii_hexdigit(),
        }
    })
}

// ---------------------------------------------------------------------------
// Permission resolution (mirror of `getPermissions`).
// ---------------------------------------------------------------------------

struct ResolvedPermissions {
    ws_id: String,
    has_all_permissions: bool,
    permissions: Vec<String>,
}

impl ResolvedPermissions {
    fn contains(&self, permission: &str) -> bool {
        self.has_all_permissions || self.permissions.iter().any(|value| value == permission)
    }
}

async fn resolve_permissions(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<ResolvedPermissions>, ()> {
    if !contact_data.configured() {
        return Err(());
    }

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return Ok(None);
    };
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return Ok(None);
    };
    let Some(user_id) = user.id.filter(|id| !id.trim().is_empty()) else {
        return Ok(None);
    };

    let Some(resolved_ws_id) =
        normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token).await?
    else {
        return Ok(None);
    };

    let Some(effective) = effective_workspace_permissions(
        contact_data,
        outbound,
        &resolved_ws_id,
        &user_id,
        &access_token,
    )
    .await?
    else {
        return Ok(None);
    };

    Ok(Some(ResolvedPermissions {
        ws_id: resolved_ws_id,
        has_all_permissions: effective.has_all_permissions,
        permissions: effective.permissions,
    }))
}

async fn effective_workspace_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    resolved_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Option<EffectivePermissions>, ()> {
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

    Ok(Some(EffectivePermissions {
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

        if let Some(workspace_id) = workspace_id_by_handle(
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

enum DataAuth<'a> {
    AccessToken(&'a str),
    ServiceRole,
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

fn route_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn not_found_response() -> BackendResponse {
    no_store_response(json_response(404, json!({ "error": "Not found" })))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
