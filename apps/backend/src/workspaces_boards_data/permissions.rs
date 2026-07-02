use super::*;

// ---------- Member permissions (mirrors getPermissions -> manage_projects) ----------

/// Returns:
///   Ok(None)        => getPermissions would return null (no perms / ws not found) -> 404.
///   Ok(Some(true))  => has `manage_projects`.
///   Ok(Some(false)) => has a permission set but lacks `manage_projects`.
///   Err(())         => unexpected query failure -> 500.
pub(super) async fn load_manage_projects_permission(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Option<bool>, ()> {
    // Workspace creator lookup. Legacy treats missing workspace as null -> 404.
    let creator_id = match fetch_workspace_creator(contact_data, outbound, ws_id).await? {
        Some(creator_id) => creator_id,
        None => return Ok(None),
    };
    let is_creator = creator_id == user_id;

    // Role-membership permissions (MEMBER path).
    let role_permissions = fetch_role_permissions(contact_data, outbound, ws_id, user_id).await?;

    // Default workspace permissions for MEMBER member_type.
    let default_permissions =
        fetch_default_permissions(contact_data, outbound, ws_id, "MEMBER").await?;

    let has_permissions =
        is_creator || !role_permissions.is_empty() || !default_permissions.is_empty();

    if !has_permissions {
        // getPermissions returns null.
        return Ok(None);
    }

    // Build the effective permission set (creator => all permissions, so always
    // contains manage_projects).
    if is_creator {
        return Ok(Some(true));
    }

    let mut permissions: BTreeSet<String> = BTreeSet::new();
    permissions.extend(role_permissions);
    permissions.extend(default_permissions);

    let is_admin = permissions.contains(ADMIN_PERMISSION);
    let contains = is_admin || permissions.contains(MANAGE_PROJECTS_PERMISSION);

    Ok(Some(contains))
}

async fn fetch_workspace_creator(
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
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceCreatorRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.creator_id))
}

async fn fetch_role_permissions(
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
        return Err(());
    }

    let rows = response.json::<Vec<RoleMemberRow>>().map_err(|_| ())?;
    let mut permissions = Vec::new();
    for row in rows {
        let Some(join) = row.workspace_roles else {
            continue;
        };
        let nodes = match join {
            RoleJoin::One(node) => vec![node],
            RoleJoin::Many(nodes) => nodes,
        };
        for node in nodes {
            for perm in node.workspace_role_permissions {
                if let Some(permission) = perm.permission {
                    permissions.push(permission);
                }
            }
        }
    }
    Ok(permissions)
}

async fn fetch_default_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    member_type: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_default_permissions",
        &[
            ("select", "permission".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
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
        .json::<Vec<DefaultPermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
}
