use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_MIDDLE: &str = "/external-projects/members/roles/";
const PATH_SUFFIX: &str = "/members";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const STUDIO_UNAVAILABLE_MESSAGE: &str = "External project studio unavailable for this workspace";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const ROLE_NOT_FOUND_MESSAGE: &str = "Access level not found";
const LOAD_ERROR_MESSAGE: &str = "Error loading access level people";

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
struct RoleIdRow {
    #[allow(dead_code)]
    id: Option<String>,
}

// `workspace_role_members` joined with the `users` relation (aliased `users`)
// and the nested `user_private_details` for the email.
#[derive(Deserialize)]
struct RoleMemberRow {
    user_id: Option<String>,
    users: Option<RoleMemberUser>,
}

#[derive(Deserialize)]
struct RoleMemberUser {
    id: Option<String>,
    display_name: Option<String>,
    full_name: Option<String>,
    avatar_url: Option<String>,
    user_private_details: Option<UserPrivateDetails>,
}

// PostgREST may serialize an embedded to-one relation as an object or, in some
// shapes, as an array. Support both, mirroring `normalizeRoleMemberUser`.
#[derive(Deserialize)]
#[serde(untagged)]
enum UserPrivateDetails {
    One(PrivateDetailsRow),
    Many(Vec<PrivateDetailsRow>),
}

#[derive(Deserialize)]
struct PrivateDetailsRow {
    email: Option<String>,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_external_projects_members_roles_roleid_members_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, role_id) = match_path(request.path)?;

    // Only GET is migrated. Every other method returns None so the Cloudflare
    // worker falls through to the still-active Next.js route (e.g. POST).
    Some(match request.method {
        "GET" => role_members_response(config, request, raw_ws_id, role_id, outbound).await,
        _ => return None,
    })
}

/// Match `/api/v1/workspaces/{wsId}/external-projects/members/roles/{roleId}/members`
/// and extract `(wsId, roleId)`. Returns None when the shape does not match.
fn match_path(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let (ws_id, after_ws) = rest.split_once(PATH_MIDDLE)?;
    let role_id = after_ws.strip_suffix(PATH_SUFFIX)?;

    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }
    if role_id.is_empty() || role_id.contains('/') {
        return None;
    }

    Some((ws_id, role_id))
}

async fn role_members_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    role_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // NOTE: App-session / app-coordination-token auth modes are NOT supported
    // here. Only the standard Supabase cookie/bearer session is handled. The
    // legacy `view` capability authorizes any workspace MEMBER, so we only
    // verify authentication + MEMBER membership + an enabled binding, mirroring
    // workspace_external_projects_members_enhanced.rs.
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
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id).await {
            Ok(ws_id) => ws_id,
            Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
        };

    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(403, FORBIDDEN_MESSAGE),
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    match external_project_binding_enabled(contact_data, outbound, &resolved_ws_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(404, STUDIO_UNAVAILABLE_MESSAGE),
        Err(()) => return message_response(500, LOAD_ERROR_MESSAGE),
    }

    // requireExternalProjectRoleInWorkspace: role must exist in this workspace.
    match role_exists_in_workspace(contact_data, outbound, &resolved_ws_id, role_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(404, ROLE_NOT_FOUND_MESSAGE),
        Err(()) => return message_response(404, ROLE_NOT_FOUND_MESSAGE),
    }

    match fetch_role_members(contact_data, outbound, role_id).await {
        Ok(members) => {
            let count = members.len();
            no_store_response(json_response(
                200,
                json!({ "count": count, "data": members }),
            ))
        }
        Err(()) => message_response(500, LOAD_ERROR_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// Role membership listing (mirrors listExternalProjectRoleMembers)
// ---------------------------------------------------------------------------

async fn role_exists_in_workspace(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    role_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_roles",
        &[
            ("select", "id".to_owned()),
            ("id", format!("eq.{role_id}")),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    ensure_ok(&response)?;

    Ok(response
        .json::<Vec<RoleIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .is_some())
}

async fn fetch_role_members(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    role_id: &str,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_role_members",
        &[
            (
                "select",
                "user_id,users:user_id(id,display_name,full_name,avatar_url,user_private_details(email))"
                    .to_owned(),
            ),
            ("role_id", format!("eq.{role_id}")),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    ensure_ok(&response)?;

    let rows = response.json::<Vec<RoleMemberRow>>().map_err(|_| ())?;

    // normalizeRoleMembers: fall back to user_id when the joined user is absent,
    // then filter out members without an id.
    let mut members: Vec<Value> = Vec::with_capacity(rows.len());
    for row in rows {
        let fallback_id = row.user_id.clone();
        let user = row.users;

        let id = user
            .as_ref()
            .and_then(|u| u.id.clone())
            .or(fallback_id)
            .filter(|id| !id.is_empty());

        let Some(id) = id else {
            continue;
        };

        let email = user
            .as_ref()
            .and_then(|u| private_email(&u.user_private_details));

        members.push(json!({
            "avatar_url": user.as_ref().and_then(|u| u.avatar_url.clone()),
            "display_name": user.as_ref().and_then(|u| u.display_name.clone()),
            "email": email,
            "full_name": user.as_ref().and_then(|u| u.full_name.clone()),
            "id": id,
        }));
    }

    Ok(members)
}

fn private_email(details: &Option<UserPrivateDetails>) -> Option<String> {
    match details {
        Some(UserPrivateDetails::One(row)) => row.email.clone(),
        Some(UserPrivateDetails::Many(rows)) => rows.first().and_then(|row| row.email.clone()),
        None => None,
    }
}

// ---------------------------------------------------------------------------
// Workspace id normalization + membership (mirrors read-mode access gate)
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

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
