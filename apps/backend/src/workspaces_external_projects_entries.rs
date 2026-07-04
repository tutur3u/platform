//! Port of the legacy `GET /api/v1/workspaces/:wsId/external-projects/entries`
//! route (list entries only).
//!
//! Legacy source:
//! `apps/web/src/app/api/v1/workspaces/[wsId]/external-projects/entries/route.ts`
//!
//! The legacy GET handler composes:
//!   - `requireWorkspaceExternalProjectAccess({ mode: 'read', ... })` (access.ts)
//!   - `listWorkspaceExternalProjectEntries(workspaceId, { collectionId, includeDrafts: true }, admin)`
//!     (store.ts) which selects `*` from `workspace_external_project_entries`
//!     for the resolved workspace, filtered by `ws_id` (and `collection_id` when
//!     a `collectionId` query param is present), ordered by `sort_order` ascending
//!     then `created_at` ascending. Because `includeDrafts` is `true`, no
//!     `status` filter is applied (drafts/scheduled/published/archived all
//!     returned).
//!
//! and returns the raw array of entry rows (`NextResponse.json(entries)`,
//! status 200). On a store failure it returns
//! `{ error: 'Failed to list workspace external project entries' }` (500).
//!
//! Only the **GET** method is migrated here. The legacy route also defines a
//! POST (create entry) method that is NOT ported yet; for every other method
//! this handler returns `None` so the Cloudflare worker falls through to the
//! still-active Next.js route (rather than 405-ing a valid mutation).
//!
//! Auth note: this port mirrors the *Supabase user session* branch only (cookie
//! or bearer), matching the sibling `workspaces_external_projects_collections`,
//! `workspaces_external_projects`, and `workspace_external_projects_summary`
//! handlers. The legacy access helper also supports app-coordination tokens and
//! app-session (`cms`) tokens; those flows must continue to be served by the
//! legacy Next.js route until ported.
//!
//! Self-containment note: this module is intentionally standalone. The shared
//! access/normalization helpers it needs are private `fn`s in sibling modules
//! (notably `workspaces_external_projects_collections` and
//! `workspace_habits_access`), so (per the one-file constraint) the relevant
//! logic is copied here as file-local `fn`s instead of editing those modules.
//! The public crate helpers (`supabase_auth::*`,
//! `contact::ContactDataConfig::{configured, rest_url, service_role_key}`,
//! `json_response`) are reused directly.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const ADMIN_PERMISSION: &str = "admin";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const ENABLED_SECRET: &str = "EXTERNAL_PROJECT_ENABLED";
const CANONICAL_ID_SECRET: &str = "EXTERNAL_PROJECT_CANONICAL_ID";

const UNAVAILABLE_MESSAGE: &str = "External project studio unavailable for this workspace";
const FAILED_MESSAGE: &str = "Failed to list workspace external project entries";

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/external-projects/entries";

// ---------------------------------------------------------------------------
// Row models (only the columns we read directly).
// ---------------------------------------------------------------------------

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

#[derive(Deserialize)]
struct BindingRow {
    canonical_project_id: Option<String>,
    is_enabled: Option<bool>,
}

#[derive(Deserialize)]
struct SecretRow {
    name: Option<String>,
    value: Option<String>,
}

#[derive(Deserialize)]
struct CanonicalActiveRow {
    is_active: Option<bool>,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_external_projects_entries_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = entries_ws_id(request.path)?;

    Some(match request.method {
        "GET" => list_entries_response(config, request, raw_ws_id, outbound).await,
        // Every other method (e.g. the still-active legacy POST) must fall
        // through to the Next.js route, so return None instead of 405.
        _ => return None,
    })
}

async fn list_entries_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return error_response(500, FAILED_MESSAGE);
    }

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, "Unauthorized");
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, "Unauthorized");
    };

    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(()) => return error_response(401, "Unauthorized"),
        };

    // Resolve binding (dual-read: bindings table then secrets fallback).
    let (canonical_id, enabled) =
        match read_binding_state(contact_data, outbound, &resolved_ws_id).await {
            Ok(state) => state,
            Err(()) => return error_response(500, FAILED_MESSAGE),
        };

    let canonical_active = match canonical_id.as_deref() {
        Some(id) => match canonical_project_active(contact_data, outbound, id).await {
            Ok(active) => active,
            Err(()) => return error_response(500, FAILED_MESSAGE),
        },
        None => false,
    };

    let binding_enabled = enabled && canonical_id.is_some() && canonical_active;

    // Mirror legacy access ordering: binding must be enabled with an active
    // canonical project (404) before permission errors surface.
    if !binding_enabled {
        return error_response(404, UNAVAILABLE_MESSAGE);
    }

    // Permission: read mode allowed when workspace grants manage/publish external
    // projects, OR root workspace grants manage_external_projects /
    // manage_workspace_roles.
    let workspace_permissions = match effective_permissions(
        contact_data,
        outbound,
        &resolved_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(permissions) => permissions,
        Err(()) => return error_response(500, FAILED_MESSAGE),
    };

    let workspace_allowed = permission_set_allows(
        &workspace_permissions,
        &["manage_external_projects", "publish_external_projects"],
    );

    let allowed = if workspace_allowed {
        true
    } else {
        let root_permissions = match effective_permissions(
            contact_data,
            outbound,
            ROOT_WORKSPACE_ID,
            &user_id,
            &access_token,
        )
        .await
        {
            Ok(permissions) => permissions,
            Err(()) => return error_response(500, FAILED_MESSAGE),
        };
        permission_set_allows(
            &root_permissions,
            &["manage_external_projects", "manage_workspace_roles"],
        )
    };

    if !allowed {
        return error_response(403, "Forbidden");
    }

    // listWorkspaceExternalProjectEntries: select('*') filtered by ws_id (and
    // collection_id when ?collectionId= is present), ordered by sort_order then
    // created_at ascending. includeDrafts: true => no status filter. Returns the
    // raw array verbatim.
    let collection_id = optional_query_value(request.url, "collectionId");
    let entries = match list_entries(
        contact_data,
        outbound,
        &resolved_ws_id,
        collection_id.as_deref(),
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return error_response(500, FAILED_MESSAGE),
    };

    json_response(200, Value::Array(entries))
}

// ---------------------------------------------------------------------------
// Entries query
// ---------------------------------------------------------------------------

async fn list_entries(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    collection_id: Option<&str>,
) -> Result<Vec<Value>, ()> {
    let mut params = vec![
        ("select", "*".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        // PostgREST applies repeated `order` keys in sequence: sort_order asc,
        // then created_at asc — matching the Supabase query builder chaining.
        ("order", "sort_order.asc".to_owned()),
        ("order", "created_at.asc".to_owned()),
    ];
    if let Some(collection_id) = collection_id {
        params.push(("collection_id", format!("eq.{collection_id}")));
    }

    let Some(url) = contact_data.rest_url("workspace_external_project_entries", &params) else {
        return Err(());
    };
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response.json::<Vec<Value>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Binding resolution (dual-read: bindings table then secrets fallback)
// ---------------------------------------------------------------------------

async fn read_binding_state(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<(Option<String>, bool), ()> {
    if let Some(url) = contact_data.rest_url(
        "workspace_external_project_bindings",
        &[
            ("select", "canonical_project_id,is_enabled".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) && let Ok(response) = send_service_role_request(contact_data, outbound, &url).await
        && is_success(response.status)
        && let Ok(Some(row)) = decode_first_row::<BindingRow>(&response)
    {
        return Ok((row.canonical_project_id, row.is_enabled == Some(true)));
    }
    // Any binding-table failure falls through to the secrets dual-read.

    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "name,value".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            (
                "name",
                format!("in.({ENABLED_SECRET},{CANONICAL_ID_SECRET})"),
            ),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<SecretRow>>().map_err(|_| ())?;
    let canonical_id = rows
        .iter()
        .find(|row| row.name.as_deref() == Some(CANONICAL_ID_SECRET))
        .and_then(|row| row.value.clone());
    let enabled = rows.iter().any(|row| {
        row.name.as_deref() == Some(ENABLED_SECRET) && row.value.as_deref() == Some("true")
    });

    Ok((canonical_id, enabled))
}

async fn canonical_project_active(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    canonical_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "canonical_external_projects",
        &[
            ("select", "is_active".to_owned()),
            ("id", format!("eq.{canonical_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    Ok(
        decode_first_row::<CanonicalActiveRow>(&response)?.and_then(|row| row.is_active)
            == Some(true),
    )
}

// ---------------------------------------------------------------------------
// Permissions (mirrors getPermissions composition used by access.ts)
// ---------------------------------------------------------------------------

struct EffectivePermissions {
    has_all_permissions: bool,
    permissions: Vec<String>,
}

fn permission_set_allows(permissions: &EffectivePermissions, wanted: &[&str]) -> bool {
    permissions.has_all_permissions
        || wanted
            .iter()
            .any(|wanted| permissions.permissions.iter().any(|value| value == wanted))
}

async fn effective_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<EffectivePermissions, ()> {
    let membership_type =
        workspace_membership_type(contact_data, outbound, ws_id, user_id, access_token)
            .await?
            .unwrap_or_default();

    if membership_type.is_empty() {
        return Ok(EffectivePermissions {
            has_all_permissions: false,
            permissions: Vec::new(),
        });
    }

    let workspace = workspace_row(contact_data, outbound, ws_id).await?;
    let is_creator = membership_type == "MEMBER"
        && workspace.as_ref().and_then(|row| row.creator_id.as_deref()) == Some(user_id);

    let role_permissions = if membership_type == "MEMBER" {
        workspace_role_permissions(contact_data, outbound, ws_id, user_id).await?
    } else {
        Vec::new()
    };
    let default_permissions =
        workspace_default_permissions(contact_data, outbound, ws_id, &membership_type).await?;

    let mut permissions = Vec::new();
    extend_unique(&mut permissions, role_permissions);
    extend_unique(&mut permissions, default_permissions);

    Ok(EffectivePermissions {
        has_all_permissions: is_creator
            || permissions.iter().any(|value| value == ADMIN_PERMISSION),
        permissions,
    })
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
    let response = send_caller_request(contact_data, outbound, &url, access_token).await?;
    if !is_success(response.status) {
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
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
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
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Ok(Vec::new());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    let mut permissions = Vec::new();
    for row in &rows {
        collect_role_permissions(row, &mut permissions);
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
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Ok(Vec::new());
    }
    Ok(response
        .json::<Vec<PermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
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

fn extend_unique(permissions: &mut Vec<String>, values: Vec<String>) {
    for permission in values {
        if !permissions.iter().any(|value| value == &permission) {
            permissions.push(permission);
        }
    }
}

// ---------------------------------------------------------------------------
// Workspace id normalization
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
        if !is_workspace_handle_candidate(&handle) {
            return Ok(resolved_ws_id);
        }

        if let Some(workspace_id) = workspace_id_by_handle(contact_data, outbound, &handle).await? {
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
    let response = send_caller_request(contact_data, outbound, &url, access_token).await?;
    if !is_success(response.status) {
        return Err(());
    }
    decode_first_row::<WorkspaceIdRow>(&response)?
        .and_then(|row| row.id)
        .ok_or(())
}

async fn workspace_id_by_handle(
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
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Ok(None);
    }
    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async fn send_caller_request(
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

async fn send_service_role_request(
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

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

fn entries_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    // ws_id must be a single path segment so we only match the exact
    // `/external-projects/entries` shape (not deeper subpaths).
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn optional_query_value(request_url: Option<&str>, key: &str) -> Option<String> {
    let url = request_url.and_then(|url| url::Url::parse(url).ok())?;
    url.query_pairs()
        .find_map(|(name, value)| (name == key).then(|| value.into_owned()))
        .filter(|value| !value.is_empty())
}

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
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

fn is_workspace_handle_candidate(value: &str) -> bool {
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

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    json_response(status, json!({ "error": message }))
}
