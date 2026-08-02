use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission_allowing_app_sessions,
    },
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/user-profile-links/users";

const MANAGE_PERMISSION: &str = "manage_user_profile_links";
const VIEW_PRIVATE_INFO_PERMISSION: &str = "view_users_private_info";
const GET_WORKSPACE_USERS_RPC: &str = "get_workspace_users";

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

    let authorization = match authorize_workspace_permission_allowing_app_sessions(
        config,
        request,
        raw_ws_id,
        MANAGE_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return message_response(403, "Insufficient permissions to manage profile links");
        }
        Err(
            WorkspacePermissionAuthorizationError::Unauthorized
            | WorkspacePermissionAuthorizationError::NotFound,
        ) => return not_found_response(),
        Err(WorkspacePermissionAuthorizationError::Internal) => return not_found_response(),
    };

    let can_view_private_info = authorize_workspace_permission_allowing_app_sessions(
        config,
        request,
        raw_ws_id,
        VIEW_PRIVATE_INFO_PERMISSION,
        outbound,
    )
    .await
    .is_ok();

    let query = UsersQuery::from_url(request.url);

    match fetch_workspace_users(contact_data, outbound, &authorization.ws_id, &query).await {
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
