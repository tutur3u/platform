use super::*;

pub(super) struct AuthenticatedFinanceUser {
    access_token: Option<String>,
    pub(super) id: String,
}

pub(super) async fn authenticated_finance_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<AuthenticatedFinanceUser> {
    if contact::request_has_app_session_token(request) {
        if let Ok(identity) =
            contact::resolve_app_session_identity(config, request, &FINANCE_APP_SESSION_TARGETS)
            && let Some(id) = non_empty_user_id(identity.id)
        {
            return Some(AuthenticatedFinanceUser {
                access_token: None,
                id,
            });
        }

        if let Ok(identity) = contact::resolve_cli_app_session_identity(config, request)
            && let Some(id) = non_empty_user_id(identity.id)
        {
            return Some(AuthenticatedFinanceUser {
                access_token: None,
                id,
            });
        }
    }

    let access_token = supabase_auth::request_access_token_allowing_app_sessions(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;
    let id = non_empty_user_id(user.id?)?;

    Some(AuthenticatedFinanceUser {
        access_token: Some(access_token),
        id,
    })
}

pub(super) async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user: &AuthenticatedFinanceUser,
) -> Result<Option<String>, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user).await;
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(Some(resolved_ws_id));
        }

        if let Some(access_token) = user.access_token.as_deref()
            && let Some(workspace_id) = workspace_id_by_handle(
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
    user: &AuthenticatedFinanceUser,
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
    let response = send_rest_request(contact_data, outbound, &url, &auth).await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
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
    let response = send_rest_request(contact_data, outbound, &url, auth).await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}
