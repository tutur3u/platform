//! Handler for `/api/v1/workspaces/:wsId/topic-announcements/templates`.
//!
//! Migrates ONLY the GET method of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/topic-announcements/templates/route.ts`.
//! The legacy route also defines POST (and the broader topic-announcements
//! surface defines other mutations); those are intentionally left to the
//! still-active Next.js route by returning `None` for every non-GET method so
//! the Cloudflare worker falls through.
//!
//! The legacy GET resolves access via `resolveTopicAnnouncementsAccess(request,
//! wsId, { requireManage: true })`, which:
//!   1. normalizes the workspace id (slug / `personal` / `internal` handling),
//!   2. requires `getPermissions(...)` to be non-null (else 404 "Not found"),
//!   3. requires the `ENABLE_TOPIC_ANNOUNCEMENTS` workspace secret to equal
//!      "true" (else 404 "Not found"),
//!   4. requires the workspace to exist and be non-personal (else 404),
//!   5. requires the `manage_users` permission (else 403 "Insufficient
//!      permissions"),
//!   6. requires an authenticated session user (else 401 "Unauthorized").
//!
//! It then reads `topic_announcement_templates` (PRIVATE schema) filtered by
//! `ws_id`, ordered by `name` ascending, attaches `workspace_user_groups`
//! (PUBLIC schema) data for any `group_id`, and maps each row.
//!
//! IMPORTANT (self-contained): this module copies file-local equivalents of the
//! permission/normalize/secret helpers that live as private fns in
//! `cms_workspaces.rs` / `workspace_habits_access.rs` rather than editing those
//! modules. See the integrator notes returned with this task.

use serde::Deserialize;
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/topic-announcements/templates";

const PRIVATE_SCHEMA: &str = "private";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";

const TOPIC_ANNOUNCEMENTS_SECRET: &str = "ENABLE_TOPIC_ANNOUNCEMENTS";
const MANAGE_USERS_PERMISSION: &str = "manage_users";

const NOT_FOUND_MESSAGE: &str = "Not found";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient permissions";
const INTERNAL_ERROR_MESSAGE: &str = "Internal Server Error";

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspacePersonalRow {
    personal: Option<bool>,
}

#[derive(Deserialize)]
struct WorkspaceCreatorRow {
    creator_id: Option<String>,
}

#[derive(Deserialize)]
struct MembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
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

#[derive(Deserialize)]
struct WorkspaceSecretRow {
    value: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceGroupRow {
    id: Option<String>,
    name: Option<String>,
}

/// Effective permissions a user has in a workspace, mirroring `getPermissions`.
/// A creator (or an `admin` permission) grants every check.
struct WorkspaceAccess {
    all: bool,
    permissions: Vec<String>,
}

impl WorkspaceAccess {
    #[allow(dead_code)]
    fn none() -> Self {
        Self {
            all: false,
            permissions: Vec::new(),
        }
    }

    fn all() -> Self {
        Self {
            all: true,
            permissions: Vec::new(),
        }
    }

    fn from_permissions(permissions: Vec<String>) -> Self {
        let all = permissions.iter().any(|permission| permission == "admin");
        Self { all, permissions }
    }

    fn contains(&self, permission: &str) -> bool {
        self.all || self.permissions.iter().any(|value| value == permission)
    }
}

pub(crate) async fn handle_workspaces_topic_announcements_templates_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = topic_announcements_templates_ws_id(request.path)?;

    Some(match request.method {
        "GET" => templates_get_response(config, request, raw_ws_id, outbound).await,
        // Every non-GET method (POST and any future verb) is still served by the
        // active Next.js route, so fall through instead of 405-ing it.
        _ => return None,
    })
}

async fn templates_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // --- Authenticate the caller (Supabase access token) -------------------
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

    // --- Resolve access (mirrors resolveTopicAnnouncementsAccess) ----------
    let normalized_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            // normalizeWorkspaceId throws for an unauthenticated `personal` lookup
            // or a missing personal workspace; a hard failure here surfaces as 500.
            Err(()) => return message_response(500, INTERNAL_ERROR_MESSAGE),
        };

    // getPermissions(...) === null -> 404 "Not found".
    let access =
        match workspace_permissions(contact_data, outbound, &normalized_ws_id, &user_id).await {
            Ok(Some(access)) => access,
            Ok(None) => return message_response(404, NOT_FOUND_MESSAGE),
            Err(()) => return message_response(500, INTERNAL_ERROR_MESSAGE),
        };

    // ENABLE_TOPIC_ANNOUNCEMENTS secret must equal "true" -> else 404.
    match topic_announcements_enabled(contact_data, outbound, &normalized_ws_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(404, NOT_FOUND_MESSAGE),
        Err(()) => return message_response(500, INTERNAL_ERROR_MESSAGE),
    }

    // Workspace must exist and be non-personal -> else 404.
    match workspace_is_non_personal(contact_data, outbound, &normalized_ws_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(404, NOT_FOUND_MESSAGE),
        Err(()) => return message_response(500, INTERNAL_ERROR_MESSAGE),
    }

    // requireManage -> manage_users permission, else 403.
    if !access.contains(MANAGE_USERS_PERMISSION) {
        return message_response(403, INSUFFICIENT_PERMISSIONS_MESSAGE);
    }

    // --- Read templates + attach groups + map ------------------------------
    let templates = match fetch_templates(contact_data, outbound, &normalized_ws_id).await {
        Ok(templates) => templates,
        Err(()) => return message_response(500, INTERNAL_ERROR_MESSAGE),
    };

    let group_ids = distinct_group_ids(&templates);
    let groups = match fetch_groups(contact_data, outbound, &group_ids).await {
        Ok(groups) => groups,
        Err(()) => return message_response(500, INTERNAL_ERROR_MESSAGE),
    };

    let data: Vec<Value> = templates
        .into_iter()
        .map(|row| map_template_row(row, &groups))
        .collect();

    no_store_response(json_response(200, json!({ "data": data })))
}

// ---------------------------------------------------------------------------
// Data reads
// ---------------------------------------------------------------------------

/// Reads every column of `topic_announcement_templates` (PRIVATE schema) for the
/// workspace, ordered by `name` ascending. Each row is kept as a JSON object so
/// unknown/added columns survive untouched (legacy `select('*')` + spread).
async fn fetch_templates(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<Map<String, Value>>, ()> {
    let Some(url) = contact_data.rest_url(
        "topic_announcement_templates",
        &[
            ("select", "*".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("order", "name.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, true).await?;
    if !is_success(response.status) {
        return Err(());
    }

    let rows: Vec<Value> = response.json().map_err(|_| ())?;
    Ok(rows
        .into_iter()
        .filter_map(|value| match value {
            Value::Object(map) => Some(map),
            _ => None,
        })
        .collect())
}

fn distinct_group_ids(templates: &[Map<String, Value>]) -> Vec<String> {
    let mut ids: Vec<String> = Vec::new();
    for row in templates {
        if let Some(Value::String(group_id)) = row.get("group_id")
            && !group_id.is_empty()
            && !ids.iter().any(|existing| existing == group_id)
        {
            ids.push(group_id.clone());
        }
    }
    ids
}

/// Resolves `{ id, name }` for the supplied group ids from `workspace_user_groups`
/// (PUBLIC schema). Mirrors `attachTopicAnnouncementGroups`.
async fn fetch_groups(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    group_ids: &[String],
) -> Result<Vec<(String, String)>, ()> {
    if group_ids.is_empty() {
        return Ok(Vec::new());
    }

    let in_list = format!("({})", group_ids.join(","));
    let Some(url) = contact_data.rest_url(
        "workspace_user_groups",
        &[
            ("select", "id,name".to_owned()),
            ("id", format!("in.{in_list}")),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceGroupRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|group| match (group.id, group.name) {
            (Some(id), Some(name)) => Some((id, name)),
            _ => None,
        })
        .collect())
}

/// Reshapes a template row to match `mapTopicAnnouncementTemplateRow`:
/// drops the raw `group` key, defaults `default_contact_ids` to `[]`, and
/// resolves `group` to `{ id, name }` from the attached group set or `null`.
fn map_template_row(mut row: Map<String, Value>, groups: &[(String, String)]) -> Value {
    // The legacy mapper destructures `group` out of the row before spreading the
    // rest; the raw select never includes it, but drop defensively to match.
    row.remove("group");

    let default_contact_ids = match row.remove("default_contact_ids") {
        Some(Value::Array(items)) => Value::Array(items),
        // `default_contact_ids ?? []`
        _ => Value::Array(Vec::new()),
    };

    let group = match row.get("group_id") {
        Some(Value::String(group_id)) if !group_id.is_empty() => groups
            .iter()
            .find(|(id, _)| id == group_id)
            .map(|(id, name)| json!({ "id": id, "name": name }))
            .unwrap_or(Value::Null),
        _ => Value::Null,
    };

    row.insert("default_contact_ids".to_owned(), default_contact_ids);
    row.insert("group".to_owned(), group);

    Value::Object(row)
}

// ---------------------------------------------------------------------------
// Access resolution helpers (file-local copies of cms_workspaces.rs /
// workspace_habits_access.rs private fns to keep this module self-contained).
// ---------------------------------------------------------------------------

async fn topic_announcements_enabled(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "value".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("name", format!("eq.{TOPIC_ANNOUNCEMENTS_SECRET}")),
            ("order", "created_at.desc".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceSecretRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.value)
        .as_deref()
        == Some("true"))
}

async fn workspace_is_non_personal(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "personal".to_owned()),
            ("id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success(response.status) {
        return Err(());
    }

    // Missing workspace or `personal === true` -> 404 in the legacy route.
    Ok(response
        .json::<Vec<WorkspacePersonalRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .map(|row| row.personal != Some(true))
        .unwrap_or(false))
}

/// Mirrors `getPermissions`. Returns `Ok(None)` when the user has no workspace
/// access (legacy `null`), which downstream maps to 404.
async fn workspace_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
    user_id: &str,
) -> Result<Option<WorkspaceAccess>, ()> {
    let Some(membership_type) =
        workspace_membership_type(contact_data, outbound, workspace_id, user_id).await?
    else {
        return Ok(None);
    };

    let Some(creator_id) = workspace_creator_id(contact_data, outbound, workspace_id).await? else {
        // Workspace not found -> getPermissions returns null.
        return Ok(None);
    };
    let is_creator = membership_type == "MEMBER" && creator_id == user_id;

    if is_creator {
        return Ok(Some(WorkspaceAccess::all()));
    }

    let mut permissions = Vec::new();
    if membership_type == "MEMBER" {
        permissions.extend(role_permissions(contact_data, outbound, workspace_id, user_id).await?);
    }
    permissions
        .extend(default_permissions(contact_data, outbound, workspace_id, &membership_type).await?);

    Ok(Some(WorkspaceAccess::from_permissions(permissions)))
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
    let response = service_role_get(contact_data, outbound, &url, false).await?;
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
    let response = service_role_get(contact_data, outbound, &url, false).await?;
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
    let response = service_role_get(contact_data, outbound, &url, false).await?;
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
    let response = service_role_get(contact_data, outbound, &url, false).await?;
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
// Workspace id normalization (mirrors normalizeWorkspaceId)
// ---------------------------------------------------------------------------

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
    let response = caller_rest_get(contact_data, outbound, &url, access_token).await?;
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
    let response = caller_rest_get(contact_data, outbound, &url, access_token).await?;
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
    let response = service_role_get(contact_data, outbound, &url, false).await?;
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

// ---------------------------------------------------------------------------
// Outbound helpers
// ---------------------------------------------------------------------------

async fn caller_rest_get(
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
    private_schema: bool,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if private_schema {
        request = request.with_header("Accept-Profile", PRIVATE_SCHEMA);
    }

    outbound.send(request).await.map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Path + identifier helpers
// ---------------------------------------------------------------------------

fn topic_announcements_templates_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
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

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
