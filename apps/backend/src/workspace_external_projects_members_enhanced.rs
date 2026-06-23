use std::collections::{BTreeSet, HashMap, HashSet};

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/external-projects/members/enhanced";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const STUDIO_UNAVAILABLE_MESSAGE: &str = "External project studio unavailable for this workspace";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const LOAD_ERROR_MESSAGE: &str = "Error loading CMS team members";

const HIDE_MEMBER_EMAIL_SECRET: &str = "HIDE_MEMBER_EMAIL";
const HIDE_MEMBER_NAME_SECRET: &str = "HIDE_MEMBER_NAME";
const EXTERNAL_PROJECT_ENABLED_SECRET: &str = "EXTERNAL_PROJECT_ENABLED";
const EXTERNAL_PROJECT_CANONICAL_ID_SECRET: &str = "EXTERNAL_PROJECT_CANONICAL_ID";

// ---------------------------------------------------------------------------
// Row types
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
struct WorkspaceSecretNameRow {
    name: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceBindingRow {
    canonical_project_id: Option<String>,
    is_enabled: Option<bool>,
}

#[derive(Deserialize)]
struct WorkspaceSecretValueRow {
    name: Option<String>,
    value: Option<String>,
}

#[derive(Deserialize)]
struct CanonicalProjectRow {
    is_active: Option<bool>,
}

#[derive(Deserialize)]
struct WorkspaceCreatorRow {
    creator_id: Option<String>,
}

#[derive(Deserialize)]
struct MemberRow {
    id: Option<String>,
    handle: Option<String>,
    email: Option<String>,
    display_name: Option<String>,
    avatar_url: Option<String>,
    pending: Option<bool>,
    created_at: Option<String>,
    #[serde(rename = "type")]
    member_type: Option<String>,
}

#[derive(Deserialize)]
struct RoleMembershipRow {
    user_id: Option<String>,
    workspace_roles: Option<RoleRow>,
}

#[derive(Deserialize)]
struct RoleRow {
    id: Option<String>,
    name: Option<String>,
    workspace_role_permissions: Option<Vec<RolePermissionRow>>,
}

#[derive(Deserialize)]
struct RolePermissionRow {
    permission: Option<String>,
    enabled: Option<bool>,
}

#[derive(Deserialize)]
struct DefaultPermissionRow {
    permission: Option<String>,
    enabled: Option<bool>,
}

#[derive(Deserialize)]
struct PrivateEmailRow {
    user_id: Option<String>,
    email: Option<String>,
}

#[derive(Deserialize)]
struct LinkedUserRow {
    platform_user_id: Option<String>,
    workspace_users: Option<WorkspaceProfileRow>,
}

#[derive(Clone, Deserialize)]
struct WorkspaceProfileRow {
    id: Option<String>,
    display_name: Option<String>,
    full_name: Option<String>,
    email: Option<String>,
}

#[derive(Deserialize)]
struct BoardShareRow {
    permission: Option<String>,
    shared_with_email: Option<String>,
    shared_with_user_id: Option<String>,
    created_at: Option<String>,
    users: Option<BoardShareUserRow>,
    workspace_boards: Option<BoardRow>,
}

#[derive(Deserialize)]
struct BoardShareUserRow {
    id: Option<String>,
    display_name: Option<String>,
    handle: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Deserialize)]
struct BoardRow {
    name: Option<String>,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspace_external_projects_members_enhanced_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = match_path(request.path)?;

    Some(match request.method {
        "GET" => members_enhanced_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

fn match_path(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

async fn members_enhanced_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // NOTE: App-session / app-coordination-token auth modes are NOT supported
    // here. Only the standard Supabase cookie/bearer session is handled.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, "error", UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, "error", UNAUTHORIZED_MESSAGE);
    };

    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id).await {
            Ok(ws_id) => ws_id,
            Err(()) => return message_response(500, "error", MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
        };

    // Membership verification (MEMBER) mirrors the read-mode access gate.
    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(403, "error", FORBIDDEN_MESSAGE),
        Err(()) => return message_response(500, "error", MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    // External-project binding must be enabled + active.
    match external_project_binding_enabled(contact_data, outbound, &resolved_ws_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(404, "error", STUDIO_UNAVAILABLE_MESSAGE),
        Err(()) => return message_response(500, "message", LOAD_ERROR_MESSAGE),
    }

    let status = status_from_url(request.url);

    match list_workspace_members(contact_data, outbound, &resolved_ws_id, status.as_deref()).await {
        Ok(members) => no_store_response(json_response(200, Value::Array(members))),
        Err(()) => message_response(500, "message", LOAD_ERROR_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// Workspace id normalization + membership
// ---------------------------------------------------------------------------

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
) -> Result<String, ()> {
    let resolved = resolve_workspace_id(raw_ws_id);

    if resolved == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if resolved.eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG) {
        return personal_workspace_id(contact_data, outbound, user_id).await;
    }

    if is_workspace_uuid_literal(&resolved) {
        return Ok(resolved);
    }

    let handle = resolved.trim().to_lowercase();
    if !is_workspace_handle(&handle) {
        return Ok(resolved);
    }

    if let Some(id) = workspace_id_by_handle(contact_data, outbound, &handle).await? {
        return Ok(id);
    }

    Ok(resolved)
}

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
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
    let response = service_role_get(contact_data, outbound, &url).await?;
    ensure_ok(&response)?;

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
    let response = service_role_get(contact_data, outbound, &url).await?;
    ensure_ok(&response)?;

    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        == Some("MEMBER"))
}

// ---------------------------------------------------------------------------
// Binding state (dual-read: bindings table, fallback to secrets)
// ---------------------------------------------------------------------------

async fn external_project_binding_enabled(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    let (canonical_id, enabled) = binding_state(contact_data, outbound, ws_id).await?;

    let Some(canonical_id) = canonical_id.filter(|_| enabled) else {
        return Ok(false);
    };

    canonical_project_active(contact_data, outbound, &canonical_id).await
}

async fn binding_state(
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
    ) {
        let response = service_role_get(contact_data, outbound, &url).await?;
        if (200..300).contains(&response.status) {
            if let Some(row) = response
                .json::<Vec<WorkspaceBindingRow>>()
                .ok()
                .and_then(|rows| rows.into_iter().next())
            {
                return Ok((row.canonical_project_id, row.is_enabled == Some(true)));
            }
        }
    }

    // Fallback to legacy secrets.
    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "name,value".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            (
                "name",
                format!(
                    "in.({EXTERNAL_PROJECT_ENABLED_SECRET},{EXTERNAL_PROJECT_CANONICAL_ID_SECRET})"
                ),
            ),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    ensure_ok(&response)?;

    let rows = response
        .json::<Vec<WorkspaceSecretValueRow>>()
        .map_err(|_| ())?;
    let canonical_id = rows
        .iter()
        .find(|row| row.name.as_deref() == Some(EXTERNAL_PROJECT_CANONICAL_ID_SECRET))
        .and_then(|row| row.value.clone());
    let enabled = rows.iter().any(|row| {
        row.name.as_deref() == Some(EXTERNAL_PROJECT_ENABLED_SECRET)
            && row.value.as_deref() == Some("true")
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
    let response = service_role_get(contact_data, outbound, &url).await?;
    ensure_ok(&response)?;

    Ok(response
        .json::<Vec<CanonicalProjectRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.is_active)
        == Some(true))
}

// ---------------------------------------------------------------------------
// Member aggregation (mirrors getWorkspaceMembers)
// ---------------------------------------------------------------------------

async fn list_workspace_members(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    status: Option<&str>,
) -> Result<Vec<Value>, ()> {
    let hidden = hidden_member_secrets(contact_data, outbound, ws_id).await?;
    let hide_email = hidden.contains(HIDE_MEMBER_EMAIL_SECRET);
    let hide_name = hidden.contains(HIDE_MEMBER_NAME_SECRET);

    let member_rows = fetch_members(contact_data, outbound, ws_id, status).await?;
    let creator_id = workspace_creator_id(contact_data, outbound, ws_id).await?;

    let member_user_ids: Vec<String> = dedup(
        member_rows
            .iter()
            .filter_map(|m| m.id.clone())
            .collect::<Vec<_>>(),
    );
    let active_user_ids: Vec<String> = dedup(
        member_rows
            .iter()
            .filter(|m| m.pending != Some(true))
            .filter_map(|m| m.id.clone())
            .collect::<Vec<_>>(),
    );

    let role_map = fetch_role_memberships(contact_data, outbound, ws_id, &active_user_ids).await?;
    let default_permissions = fetch_default_permissions(contact_data, outbound, ws_id).await?;
    let private_email_by_user =
        fetch_private_emails(contact_data, outbound, &member_user_ids).await?;
    let profile_by_user =
        fetch_linked_profiles(contact_data, outbound, ws_id, &member_user_ids).await?;

    // Build email lookup set, then profiles by email.
    let mut profile_lookup_emails: BTreeSet<String> = BTreeSet::new();
    for member in &member_rows {
        let resolved = member.email.clone().or_else(|| {
            member
                .id
                .as_ref()
                .and_then(|id| private_email_by_user.get(id).cloned())
                .flatten()
        });
        if let Some(email) = normalize_email(resolved.as_deref()) {
            profile_lookup_emails.insert(email);
        }
    }
    let profile_by_email =
        fetch_profiles_by_email(contact_data, outbound, ws_id, &profile_lookup_emails).await?;

    let mut members: Vec<Value> = Vec::with_capacity(member_rows.len());
    let mut member_emails: HashSet<String> = HashSet::new();
    let mut member_ids: HashSet<String> = HashSet::new();

    for member in &member_rows {
        let normalized_email = normalize_email(
            member
                .email
                .clone()
                .or_else(|| {
                    member
                        .id
                        .as_ref()
                        .and_then(|id| private_email_by_user.get(id).cloned())
                        .flatten()
                })
                .as_deref(),
        );

        let workspace_profile = member
            .id
            .as_ref()
            .and_then(|id| profile_by_user.get(id).cloned())
            .or_else(|| {
                normalized_email
                    .as_ref()
                    .and_then(|email| profile_by_email.get(email).cloned())
            });

        let workspace_profile_display_name = workspace_profile
            .as_ref()
            .and_then(|p| p.display_name.clone());
        let display_name = resolve_display_name(
            workspace_profile_display_name.as_deref(),
            workspace_profile
                .as_ref()
                .and_then(|p| p.full_name.as_deref()),
            member.display_name.as_deref(),
        );

        let is_creator = creator_id.is_some() && creator_id == member.id;
        let roles = member
            .id
            .as_ref()
            .and_then(|id| role_map.get(id).cloned())
            .unwrap_or_default();

        if let Some(email) = normalized_email.as_ref() {
            member_emails.insert(email.clone());
        }
        if let Some(id) = member.id.as_ref() {
            member_ids.insert(id.clone());
        }

        members.push(json!({
            "id": member.id,
            "handle": member.handle,
            "avatar_url": member.avatar_url,
            "created_at": member.created_at,
            "pending": member.pending,
            "workspace_member_type": member.member_type,
            "display_name": if hide_name { Value::Null } else { json!(display_name) },
            "email": if hide_email { Value::Null } else { json!(member.email) },
            "is_creator": is_creator,
            "roles": roles,
            "default_permissions": default_permissions,
            "workspace_user_id": workspace_profile.as_ref().and_then(|p| p.id.clone()),
            "workspace_profile_display_name": if hide_name {
                Value::Null
            } else {
                json!(workspace_profile_display_name)
            },
        }));
    }

    if status == Some("joined") {
        return Ok(members);
    }

    // Direct board-share guests.
    let board_shares = fetch_board_shares(contact_data, outbound, ws_id).await?;
    let mut guests: HashMap<String, Value> = HashMap::new();
    let mut guest_order: Vec<String> = Vec::new();
    let mut guest_board_names: HashMap<String, Vec<String>> = HashMap::new();
    let mut guest_highest: HashMap<String, String> = HashMap::new();

    for row in &board_shares {
        let email = normalize_email(row.shared_with_email.as_deref());
        let user_id = row
            .shared_with_user_id
            .clone()
            .or_else(|| row.users.as_ref().and_then(|u| u.id.clone()));

        let already_member = user_id.as_ref().is_some_and(|id| member_ids.contains(id))
            || email.as_ref().is_some_and(|e| member_emails.contains(e));
        if already_member {
            continue;
        }
        if status == Some("invited") && user_id.is_some() {
            continue;
        }

        let recipient_key = match (&user_id, &email) {
            (Some(id), _) => format!("user:{id}"),
            (None, Some(email)) => format!("email:{email}"),
            (None, None) => continue,
        };

        let board_name = row
            .workspace_boards
            .as_ref()
            .and_then(|b| b.name.clone())
            .unwrap_or_else(|| "Untitled board".to_owned());
        let names = guest_board_names.entry(recipient_key.clone()).or_default();
        if !names.contains(&board_name) {
            names.push(board_name);
        }

        let highest = guest_highest
            .entry(recipient_key.clone())
            .or_insert_with(|| "view".to_owned());
        if highest == "edit" || row.permission.as_deref() == Some("edit") {
            *highest = "edit".to_owned();
        }

        let display_default = row
            .users
            .as_ref()
            .and_then(|u| u.display_name.clone())
            .or_else(|| email.clone())
            .unwrap_or_else(|| "Board guest".to_owned());

        if !guests.contains_key(&recipient_key) {
            guest_order.push(recipient_key.clone());
        }

        let guest_id = user_id
            .clone()
            .unwrap_or_else(|| format!("board-guest:{}", email.clone().unwrap_or_default()));

        guests.insert(
            recipient_key.clone(),
            json!({
                "id": guest_id,
                "user_id": user_id,
                "handle": row.users.as_ref().and_then(|u| u.handle.clone()),
                "email": if hide_email { Value::Null } else { json!(email) },
                "display_name": if hide_name { Value::Null } else { json!(display_default) },
                "avatar_url": row.users.as_ref().and_then(|u| u.avatar_url.clone()),
                "pending": user_id.is_none(),
                "created_at": row.created_at,
                "workspace_member_type": "GUEST",
                "direct_board_guest": true,
                "guest_access_type": "task_board",
                "guest_highest_permission": guest_highest.get(&recipient_key),
                "is_creator": false,
                "roles": Vec::<Value>::new(),
                "default_permissions": Vec::<Value>::new(),
                "workspace_user_id": Value::Null,
                "workspace_profile_display_name": Value::Null,
            }),
        );
    }

    // Finalize guest board counts/names/permission (recompute after full pass).
    for key in &guest_order {
        if let Some(guest) = guests.get_mut(key) {
            let names = guest_board_names.get(key).cloned().unwrap_or_default();
            if let Some(obj) = guest.as_object_mut() {
                obj.insert("guest_board_count".to_owned(), json!(names.len()));
                obj.insert("guest_board_names".to_owned(), json!(names));
                obj.insert(
                    "guest_highest_permission".to_owned(),
                    json!(guest_highest.get(key)),
                );
            }
        }
    }

    for key in &guest_order {
        if let Some(guest) = guests.remove(key) {
            members.push(guest);
        }
    }

    Ok(members)
}

async fn hidden_member_secrets(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<HashSet<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "name".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            (
                "name",
                format!("in.({HIDE_MEMBER_EMAIL_SECRET},{HIDE_MEMBER_NAME_SECRET})"),
            ),
            ("value", "eq.true".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    ensure_ok(&response)?;

    Ok(response
        .json::<Vec<WorkspaceSecretNameRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.name)
        .collect())
}

async fn fetch_members(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    status: Option<&str>,
) -> Result<Vec<MemberRow>, ()> {
    let mut params = vec![
        (
            "select",
            "id,handle,email,display_name,avatar_url,pending,created_at,type".to_owned(),
        ),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "pending.asc,created_at.desc,id.asc".to_owned()),
    ];
    if let Some(status) = status {
        if status != "all" {
            let pending = status == "invited";
            params.push(("pending", format!("eq.{pending}")));
        }
    }

    let Some(url) = contact_data.rest_url("workspace_members_and_invites", &params) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    ensure_ok(&response)?;

    response.json::<Vec<MemberRow>>().map_err(|_| ())
}

async fn workspace_creator_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Option<String>, ()> {
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
    let response = service_role_get(contact_data, outbound, &url).await?;
    ensure_ok(&response)?;

    Ok(response
        .json::<Vec<WorkspaceCreatorRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.creator_id))
}

async fn fetch_role_memberships(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_ids: &[String],
) -> Result<HashMap<String, Vec<Value>>, ()> {
    let mut map: HashMap<String, Vec<Value>> = HashMap::new();
    if user_ids.is_empty() {
        return Ok(map);
    }

    for batch in user_ids.chunks(500) {
        let in_list = batch.join(",");
        let Some(url) = contact_data.rest_url(
            "workspace_role_members",
            &[
                (
                    "select",
                    "user_id,workspace_roles!inner(id,name,ws_id,workspace_role_permissions(permission,enabled))".to_owned(),
                ),
                ("workspace_roles.ws_id", format!("eq.{ws_id}")),
                ("user_id", format!("in.({in_list})")),
            ],
        ) else {
            return Err(());
        };
        let response = service_role_get(contact_data, outbound, &url).await?;
        ensure_ok(&response)?;

        let rows = response.json::<Vec<RoleMembershipRow>>().map_err(|_| ())?;
        for row in rows {
            let (Some(user_id), Some(role)) = (row.user_id, row.workspace_roles) else {
                continue;
            };
            let permissions: Vec<Value> = role
                .workspace_role_permissions
                .unwrap_or_default()
                .into_iter()
                .map(|p| json!({ "permission": p.permission, "enabled": p.enabled }))
                .collect();
            map.entry(user_id).or_default().push(json!({
                "id": role.id,
                "name": role.name,
                "permissions": permissions,
            }));
        }
    }

    Ok(map)
}

async fn fetch_default_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_default_permissions",
        &[
            ("select", "permission,enabled".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("member_type", "eq.MEMBER".to_owned()),
            ("enabled", "eq.true".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    ensure_ok(&response)?;

    Ok(response
        .json::<Vec<DefaultPermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .map(|p| json!({ "permission": p.permission, "enabled": p.enabled }))
        .collect())
}

async fn fetch_private_emails(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_ids: &[String],
) -> Result<HashMap<String, Option<String>>, ()> {
    let mut map: HashMap<String, Option<String>> = HashMap::new();
    if user_ids.is_empty() {
        return Ok(map);
    }

    let in_list = user_ids.join(",");
    let Some(url) = contact_data.rest_url(
        "user_private_details",
        &[
            ("select", "user_id,email".to_owned()),
            ("user_id", format!("in.({in_list})")),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    ensure_ok(&response)?;

    for row in response.json::<Vec<PrivateEmailRow>>().map_err(|_| ())? {
        if let Some(user_id) = row.user_id {
            map.insert(user_id, normalize_email(row.email.as_deref()));
        }
    }

    Ok(map)
}

async fn fetch_linked_profiles(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_ids: &[String],
) -> Result<HashMap<String, WorkspaceProfileRow>, ()> {
    let mut map: HashMap<String, WorkspaceProfileRow> = HashMap::new();
    if user_ids.is_empty() {
        return Ok(map);
    }

    let in_list = user_ids.join(",");
    let Some(url) = contact_data.rest_url(
        "workspace_user_linked_users",
        &[
            (
                "select",
                "platform_user_id,virtual_user_id,workspace_users!virtual_user_id(id,display_name,full_name,email)".to_owned(),
            ),
            ("ws_id", format!("eq.{ws_id}")),
            ("platform_user_id", format!("in.({in_list})")),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    ensure_ok(&response)?;

    for row in response.json::<Vec<LinkedUserRow>>().map_err(|_| ())? {
        if let (Some(platform_user_id), Some(profile)) = (row.platform_user_id, row.workspace_users)
        {
            map.insert(platform_user_id, profile);
        }
    }

    Ok(map)
}

async fn fetch_profiles_by_email(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    emails: &BTreeSet<String>,
) -> Result<HashMap<String, WorkspaceProfileRow>, ()> {
    let mut map: HashMap<String, WorkspaceProfileRow> = HashMap::new();
    if emails.is_empty() {
        return Ok(map);
    }

    // Build email variants (email + lowercase). Emails already lowercased by
    // normalize_email, so variants collapse, but keep parity with legacy.
    let mut variants: BTreeSet<String> = BTreeSet::new();
    for email in emails {
        variants.insert(email.clone());
        variants.insert(email.to_lowercase());
    }
    let in_list = variants
        .iter()
        .map(|email| format!("\"{}\"", email.replace('"', "\\\"")))
        .collect::<Vec<_>>()
        .join(",");

    let Some(url) = contact_data.rest_url(
        "workspace_users",
        &[
            ("select", "id,display_name,full_name,email".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("email", format!("in.({in_list})")),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    ensure_ok(&response)?;

    // Group by normalized email; only keep unambiguous (single) matches.
    let mut by_email: HashMap<String, Vec<WorkspaceProfileRow>> = HashMap::new();
    for profile in response
        .json::<Vec<WorkspaceProfileRow>>()
        .map_err(|_| ())?
    {
        if let Some(email) = normalize_email(profile.email.as_deref()) {
            by_email.entry(email).or_default().push(profile);
        }
    }
    for (email, profiles) in by_email {
        if profiles.len() == 1 {
            if let Some(profile) = profiles.into_iter().next() {
                map.insert(email, profile);
            }
        }
    }

    Ok(map)
}

async fn fetch_board_shares(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<BoardShareRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "task_board_shares",
        &[
            (
                "select",
                "id,shared_with_user_id,shared_with_email,permission,created_at,workspace_boards!inner(id,name,ws_id),users:shared_with_user_id(id,display_name,handle,avatar_url)".to_owned(),
            ),
            ("workspace_boards.ws_id", format!("eq.{ws_id}")),
            ("order", "created_at.desc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    ensure_ok(&response)?;

    response.json::<Vec<BoardShareRow>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

fn ensure_ok(response: &OutboundResponse) -> Result<(), ()> {
    if (200..300).contains(&response.status) {
        Ok(())
    } else {
        Err(())
    }
}

fn status_from_url(request_url: Option<&str>) -> Option<String> {
    let url = request_url.and_then(|url| url::Url::parse(url).ok())?;
    url.query_pairs()
        .find(|(key, _)| key == "status")
        .map(|(_, value)| value.into_owned())
}

fn normalize_email(email: Option<&str>) -> Option<String> {
    let email = email?.trim().to_lowercase();
    (!email.is_empty()).then_some(email)
}

fn normalize_name(name: Option<&str>) -> Option<String> {
    let name = name?.trim();
    (!name.is_empty()).then(|| name.to_owned())
}

fn resolve_display_name(
    workspace_display_name: Option<&str>,
    workspace_full_name: Option<&str>,
    user_display_name: Option<&str>,
) -> Option<String> {
    normalize_name(workspace_display_name)
        .or_else(|| normalize_name(workspace_full_name))
        .or_else(|| normalize_name(user_display_name))
}

fn dedup(values: Vec<String>) -> Vec<String> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut out: Vec<String> = Vec::new();
    for value in values {
        if seen.insert(value.clone()) {
            out.push(value);
        }
    }
    out
}

fn is_workspace_uuid_literal(value: &str) -> bool {
    let value = value.trim();
    value.len() == 36
        && value
            .chars()
            .enumerate()
            .all(|(index, character)| match index {
                8 | 13 | 18 | 23 => character == '-',
                _ => character.is_ascii_hexdigit(),
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

fn message_response(status: u16, key: &str, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ key: message })))
}
