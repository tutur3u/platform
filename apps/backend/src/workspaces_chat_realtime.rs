//! Handler for `GET /api/v1/workspaces/:wsId/chat/realtime`.
//!
//! Legacy source:
//! `apps/web/src/app/api/v1/workspaces/[wsId]/chat/realtime/route.ts`.
//!
//! The legacy route authenticates the caller (session auth, app sessions
//! allowed), resolves the workspace via `normalizeWorkspaceId`, then checks
//! the `view_chat` permission through `resolveChatRouteContext`. On failure it
//! returns:
//!   - `401 { "message": "Unauthorized" }` when permissions cannot be resolved
//!     (not a workspace member / workspace missing).
//!   - `403 { "message": "Insufficient chat permissions" }` when the caller is
//!     a member but lacks `view_chat`.
//!
//! On success it opens a Server-Sent Events (SSE) stream that proxies a signed
//! subscription to the internal `chat-realtime` service
//! (`getChatRealtimeSubscribeUrl`). When that upstream cannot be reached or the
//! subscribe URL cannot be built, it emits a single
//! `realtime_unavailable` SSE error event with the realtime SSE headers
//! (`createRealtimeUnavailableResponse`).
//!
//! PORTING NOTE: the Cloudflare-Workers backend produces a *buffered*
//! `BackendResponse` (no live streaming), cannot reach the internal
//! `chat-realtime:7817` service, and has no HMAC/JWT token-signing helper for
//! `signChatRealtimeToken`. From the Worker, the upstream subscription is
//! therefore always unreachable, which in the legacy route maps exactly to the
//! `createRealtimeUnavailableResponse()` fallback: a `200` SSE response carrying
//! a single `realtime_unavailable` error event and the realtime SSE headers.
//! This handler reproduces the auth + permission gating faithfully and then
//! returns that exact fallback response. INTEGRATOR MUST VERIFY: if/when the
//! Worker gains the ability to sign realtime tokens and stream from the
//! internal service, the success branch here must be replaced with a real SSE
//! proxy; until then this matches the legacy "upstream unavailable" contract.
//!
//! COPIED HELPERS (self-contained, no edits to other files):
//!   - workspace-id normalization mirrors `workspace_habits_access.rs`.
//!   - the `getPermissions` composition (membership type, creator, role and
//!     default permissions) mirrors `admin_external_project_bindings.rs`; those
//!     are PRIVATE there, so equivalent file-local fns are copied here.

use serde::Deserialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const WORKSPACE_CHAT_REALTIME_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACE_CHAT_REALTIME_PATH_SUFFIX: &str = "/chat/realtime";

const ADMIN_PERMISSION: &str = "admin";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const VIEW_CHAT_PERMISSION: &str = "view_chat";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INSUFFICIENT_CHAT_PERMISSIONS_MESSAGE: &str = "Insufficient chat permissions";

// `text/event-stream` SSE response headers, mirroring `realtimeHeaders` in the
// legacy route.
const SSE_CONTENT_TYPE: &str = "text/event-stream; charset=utf-8";
const SSE_CACHE_CONTROL: &str = "no-store, no-transform";
// Single SSE event emitted by `createRealtimeUnavailableResponse`.
const REALTIME_UNAVAILABLE_EVENT: &str =
    "event: message\ndata: {\"type\":\"error\",\"error\":\"realtime_unavailable\"}\n\n";

pub(crate) async fn handle_workspaces_chat_realtime_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_chat_realtime_ws_id(request.path)?;

    Some(match request.method {
        "GET" => chat_realtime_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn chat_realtime_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Session auth with app sessions allowed (legacy `allowAppSessionAuth: true`).
    let Some(access_token) = supabase_auth::request_access_token_allowing_app_sessions(request)
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    // `normalizeWorkspaceId`. On resolution failure the legacy `getPermissions`
    // call returns null -> 401 Unauthorized.
    let resolved_ws_id = match normalize_workspace_id(
        &config.contact_data,
        outbound,
        raw_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(ws_id) => ws_id,
        Err(()) => return message_response(401, UNAUTHORIZED_MESSAGE),
    };

    // `getPermissions` composition.
    let access = match effective_workspace_permissions(
        &config.contact_data,
        outbound,
        &resolved_ws_id,
        &user_id,
    )
    .await
    {
        Ok(access) => access,
        // A lookup failure leaves `permissions` null in the legacy path -> 401.
        Err(()) => return message_response(401, UNAUTHORIZED_MESSAGE),
    };

    if !access.has_access {
        // `getPermissions` returned null (non-member / workspace missing).
        return message_response(401, UNAUTHORIZED_MESSAGE);
    }

    if !access.contains(VIEW_CHAT_PERMISSION) {
        return message_response(403, INSUFFICIENT_CHAT_PERMISSIONS_MESSAGE);
    }

    // The Worker cannot sign a realtime subscription token nor reach the
    // internal `chat-realtime` service, so the upstream is always unavailable
    // here -> the legacy `createRealtimeUnavailableResponse()` fallback.
    realtime_unavailable_response()
}

// ---------------------------------------------------------------------------
// SSE response (mirrors `createRealtimeUnavailableResponse`)
// ---------------------------------------------------------------------------

fn realtime_unavailable_response() -> BackendResponse {
    let mut response = BackendResponse {
        allow: None,
        body: serde_json::Value::Null,
        body_empty: false,
        body_text: Some(REALTIME_UNAVAILABLE_EVENT.to_owned()),
        cache_control: Some(SSE_CACHE_CONTROL),
        content_type: Some(SSE_CONTENT_TYPE),
        headers: Vec::new(),
        status: 200,
    };
    response
        .headers
        .push(("Connection", "keep-alive".to_owned()));
    response
        .headers
        .push(("X-Accel-Buffering", "no".to_owned()));
    response
}

// ---------------------------------------------------------------------------
// Workspace-id normalization (mirrors `workspace_habits_access.rs`)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

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
    let response = caller_get(contact_data, outbound, &url, access_token).await?;

    if !is_success(response.status) {
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
    let response = caller_get(contact_data, outbound, &url, access_token).await?;

    if !is_success(response.status) {
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
    let response = service_role_get(contact_data, outbound, &url).await?;

    if !is_success(response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
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

// ---------------------------------------------------------------------------
// Permissions (mirrors `getPermissions`; copied from
// `admin_external_project_bindings.rs` private helpers)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct MembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceCreatorRow {
    creator_id: Option<String>,
}

#[derive(Deserialize)]
struct PermissionRow {
    permission: Option<String>,
}

#[derive(Deserialize)]
struct RoleMemberRow {
    #[serde(default)]
    workspace_roles: Vec<RoleRow>,
}

#[derive(Deserialize)]
struct RoleRow {
    #[serde(default)]
    workspace_role_permissions: Vec<PermissionRow>,
}

struct WorkspaceAccess {
    /// True when `getPermissions` resolves a non-null result (member of an
    /// existing workspace). False maps to the legacy null -> 401.
    has_access: bool,
    all: bool,
    permissions: Vec<String>,
}

impl WorkspaceAccess {
    fn none() -> Self {
        Self {
            has_access: false,
            all: false,
            permissions: Vec::new(),
        }
    }

    fn all() -> Self {
        Self {
            has_access: true,
            all: true,
            permissions: Vec::new(),
        }
    }

    fn from_permissions(permissions: Vec<String>) -> Self {
        let all = permissions
            .iter()
            .any(|permission| permission == ADMIN_PERMISSION);
        Self {
            has_access: true,
            all,
            permissions,
        }
    }

    fn contains(&self, permission: &str) -> bool {
        self.all || self.permissions.iter().any(|value| value == permission)
    }
}

/// Resolve the effective permission ids a user has in a workspace, mirroring
/// `getPermissions`. Returns "no access" when the user is not a member or the
/// workspace is missing. A creator (MEMBER whose id is the workspace creator)
/// gets every permission; an `admin` permission grants all checks.
async fn effective_workspace_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
    user_id: &str,
) -> Result<WorkspaceAccess, ()> {
    let Some(membership_type) =
        workspace_membership_type(contact_data, outbound, workspace_id, user_id).await?
    else {
        return Ok(WorkspaceAccess::none());
    };

    let Some(creator_id) = workspace_creator_id(contact_data, outbound, workspace_id).await? else {
        // Workspace not found -> getPermissions returns null.
        return Ok(WorkspaceAccess::none());
    };
    let is_creator = membership_type == "MEMBER" && creator_id == user_id;
    if is_creator {
        return Ok(WorkspaceAccess::all());
    }

    let mut permissions = Vec::new();
    if membership_type == "MEMBER" {
        permissions.extend(role_permissions(contact_data, outbound, workspace_id, user_id).await?);
    }
    permissions
        .extend(default_permissions(contact_data, outbound, workspace_id, &membership_type).await?);

    Ok(WorkspaceAccess::from_permissions(permissions))
}

async fn workspace_membership_type(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
    user_id: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{workspace_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    Ok(response
        .json::<Vec<MembershipRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.membership_type))
}

async fn workspace_creator_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "creator_id".to_owned()),
            ("id", format!("eq.{workspace_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    Ok(response
        .json::<Vec<WorkspaceCreatorRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.creator_id))
}

async fn role_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
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
            ("workspace_roles.ws_id", format!("eq.{workspace_id}")),
            (
                "workspace_roles.workspace_role_permissions.enabled",
                "eq.true".to_owned(),
            ),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    Ok(response
        .json::<Vec<RoleMemberRow>>()
        .map_err(|_| ())?
        .into_iter()
        .flat_map(|member| member.workspace_roles)
        .flat_map(|role| role.workspace_role_permissions)
        .filter_map(|permission| permission.permission)
        .collect())
}

async fn default_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
    member_type: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_default_permissions",
        &[
            ("select", "permission".to_owned()),
            ("ws_id", format!("eq.{workspace_id}")),
            ("member_type", format!("eq.{member_type}")),
            ("enabled", "eq.true".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    Ok(response
        .json::<Vec<PermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async fn caller_get(
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

async fn service_role_get(
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

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

// ---------------------------------------------------------------------------
// Path matching
// ---------------------------------------------------------------------------

fn workspaces_chat_realtime_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACE_CHAT_REALTIME_PATH_PREFIX)?
        .strip_suffix(WORKSPACE_CHAT_REALTIME_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
