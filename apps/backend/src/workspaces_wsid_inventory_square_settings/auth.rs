use super::*;

// ---------------------------------------------------------------------------
// Auth helpers (verbatim pattern from workspaces_inventory_polar_settings.rs)
// ---------------------------------------------------------------------------

pub(super) async fn authenticated_inventory_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<InventorySquareUser> {
    if contact::request_has_app_session_token(request) {
        let identity =
            contact::resolve_app_session_identity(config, request, &INVENTORY_APP_SESSION_TARGETS)
                .ok()?;

        return non_empty_user_id(identity.id).map(|id| InventorySquareUser {
            access_token: None,
            id,
        });
    }

    let access_token = supabase_auth::request_access_token(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;
    let id = non_empty_user_id(user.id?)?;

    Some(InventorySquareUser {
        access_token: Some(access_token),
        id,
    })
}

pub(super) fn non_empty_user_id(user_id: String) -> Option<String> {
    (!user_id.trim().is_empty()).then_some(user_id)
}

pub(super) async fn member_membership_check(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user: &InventorySquareUser,
) -> Result<MembershipCheck, ()> {
    let Some(membership_type) =
        workspace_membership_type(contact_data, outbound, ws_id, user).await?
    else {
        return Ok(MembershipCheck::NotMember);
    };

    if membership_type == "MEMBER" {
        Ok(MembershipCheck::Member)
    } else {
        Ok(MembershipCheck::NotMember)
    }
}

pub(super) async fn effective_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user: &InventorySquareUser,
) -> Result<Option<EffectivePermissions>, ()> {
    let Some(membership_type) =
        workspace_membership_type(contact_data, outbound, ws_id, user).await?
    else {
        return Ok(None);
    };
    let Some(workspace) = workspace_row(contact_data, outbound, ws_id).await? else {
        return Ok(None);
    };

    let role_permissions = if membership_type == "MEMBER" {
        workspace_role_permissions(contact_data, outbound, ws_id, &user.id).await?
    } else {
        Vec::new()
    };
    let default_permissions =
        workspace_default_permissions(contact_data, outbound, ws_id, &membership_type).await?;
    let is_creator =
        membership_type == "MEMBER" && workspace.creator_id.as_deref() == Some(user.id.as_str());

    if !is_creator && role_permissions.is_empty() && default_permissions.is_empty() {
        return Ok(None);
    }

    let mut permissions = Vec::new();
    extend_unique(&mut permissions, role_permissions);
    extend_unique(&mut permissions, default_permissions);

    Ok(Some(EffectivePermissions {
        has_all_permissions: is_creator || permissions.iter().any(|p| p == ADMIN_PERMISSION),
        permissions,
    }))
}

pub(super) async fn workspace_membership_type(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user: &InventorySquareUser,
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
    let response =
        send_rest_request(contact_data, outbound, OutboundMethod::Get, &url, &auth).await?;

    if !is_success(response.status) {
        return Err(());
    }

    Ok(decode_first_row::<WorkspaceMembershipRow>(&response)?
        .map(|row| row.membership_type.unwrap_or_else(|| "MEMBER".to_owned())))
}

pub(super) async fn workspace_row(
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
    let response =
        send_service_role_rest_request(contact_data, outbound, OutboundMethod::Get, &url).await?;

    if !is_success(response.status) {
        return Err(());
    }

    decode_first_row::<WorkspaceRow>(&response)
}

pub(super) async fn workspace_role_permissions(
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
    let response =
        send_service_role_rest_request(contact_data, outbound, OutboundMethod::Get, &url).await?;

    if !is_success(response.status) {
        return Ok(Vec::new());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    let mut permissions = Vec::new();
    for row in rows {
        collect_role_permissions(&row, &mut permissions);
    }

    Ok(permissions)
}

pub(super) async fn workspace_default_permissions(
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
    let response =
        send_service_role_rest_request(contact_data, outbound, OutboundMethod::Get, &url).await?;

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

pub(super) async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user: &InventorySquareUser,
) -> Result<Option<String>, ()> {
    let resolved = resolve_workspace_id(raw_ws_id);

    if resolved == ROOT_WORKSPACE_ID {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user).await;
    }

    if !is_workspace_uuid_literal(&resolved) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(Some(resolved));
        }

        if let Some(access_token) = user.access_token.as_deref()
            && let Some(ws_id) = workspace_id_by_handle(
                contact_data,
                outbound,
                &handle,
                &DataAuth::AccessToken(access_token),
            )
            .await?
        {
            return Ok(Some(ws_id));
        }

        if let Some(ws_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, &DataAuth::ServiceRole).await?
        {
            return Ok(Some(ws_id));
        }
    }

    Ok(Some(resolved))
}

pub(super) async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user: &InventorySquareUser,
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
    let response =
        send_rest_request(contact_data, outbound, OutboundMethod::Get, &url, &auth).await?;

    if !is_success(response.status) {
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}

pub(super) async fn workspace_id_by_handle(
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

    if !is_success(response.status) {
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}
