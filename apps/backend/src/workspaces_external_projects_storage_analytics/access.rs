use super::*;

pub(super) async fn read_binding_state(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<(Option<String>, bool), ()> {
    // Prefer the first-class bindings table.
    if let Some(url) = contact_data.rest_url(
        "workspace_external_project_bindings",
        &[
            ("select", "canonical_project_id,is_enabled".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) && let Ok(response) = service_role_get(contact_data, outbound, &url).await
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
                format!(
                    "in.({EXTERNAL_PROJECT_ENABLED_SECRET},{EXTERNAL_PROJECT_CANONICAL_ID_SECRET})"
                ),
            ),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<SecretRow>>().map_err(|_| ())?;
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

pub(super) async fn canonical_project_row(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    canonical_id: &str,
) -> Result<Option<CanonicalProjectRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "canonical_external_projects",
        &[
            ("select", "adapter,is_active".to_owned()),
            ("id", format!("eq.{canonical_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    decode_first_row::<CanonicalProjectRow>(&response)
}

// ---------------------------------------------------------------------------
// Permission resolution (mirrors getPermissions composition used by access.ts).
// ---------------------------------------------------------------------------

pub(super) struct EffectivePermissions {
    has_all_permissions: bool,
    permissions: Vec<String>,
}

pub(super) fn permission_set_allows(permissions: &EffectivePermissions, wanted: &[&str]) -> bool {
    permissions.has_all_permissions
        || wanted
            .iter()
            .any(|wanted| permissions.permissions.iter().any(|value| value == wanted))
}

pub(super) async fn effective_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<EffectivePermissions, ()> {
    let Some(membership_type) =
        workspace_membership_type(contact_data, outbound, ws_id, user_id, access_token).await?
    else {
        // No membership -> getPermissions returns null (no permissions).
        return Ok(EffectivePermissions {
            has_all_permissions: false,
            permissions: Vec::new(),
        });
    };

    let creator_id = workspace_creator_id(contact_data, outbound, ws_id).await?;
    let is_creator = membership_type == "MEMBER" && creator_id.as_deref() == Some(user_id);

    let role_permissions = if membership_type == "MEMBER" {
        role_permissions(contact_data, outbound, ws_id, user_id).await?
    } else {
        Vec::new()
    };
    let default_permissions =
        default_permissions(contact_data, outbound, ws_id, &membership_type).await?;

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
    let response = caller_get(contact_data, outbound, &url, access_token).await?;
    if !is_success(response.status) {
        return Ok(None);
    }
    Ok(decode_first_row::<WorkspaceMembershipRow>(&response)?
        .map(|row| row.membership_type.unwrap_or_else(|| "MEMBER".to_owned())))
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
    if !is_success(response.status) {
        return Ok(None);
    }
    Ok(decode_first_row::<WorkspaceCreatorRow>(&response)?.and_then(|row| row.creator_id))
}

async fn role_permissions(
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
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Ok(Vec::new());
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
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Ok(Vec::new());
    }
    Ok(response
        .json::<Vec<RolePermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
}

fn extend_unique(permissions: &mut Vec<String>, values: Vec<String>) {
    for permission in values {
        if !permissions.iter().any(|value| value == &permission) {
            permissions.push(permission);
        }
    }
}

// ---------------------------------------------------------------------------
// Workspace identifier normalization (normalizeWorkspaceId).
// ---------------------------------------------------------------------------

pub(super) async fn normalize_workspace_id(
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
    let response = caller_get(contact_data, outbound, &url, access_token).await?;
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
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Ok(None);
    }
    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
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
