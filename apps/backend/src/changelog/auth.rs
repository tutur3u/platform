use super::*;

pub(super) async fn request_changelog_write_access(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Result<ChangelogWriteAccess, ChangelogAuthError> {
    if !contact_data.configured() {
        return Err(ChangelogAuthError::Internal);
    }

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return Err(ChangelogAuthError::Unauthorized);
    };
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return Err(ChangelogAuthError::Unauthorized);
    };
    let Some(user_id) = user.id.filter(|id| !id.trim().is_empty()) else {
        return Err(ChangelogAuthError::Unauthorized);
    };

    match has_manage_changelog_permission(contact_data, &user_id, outbound).await {
        Ok(true) => Ok(ChangelogWriteAccess {
            access_token,
            user_id,
        }),
        Ok(false) => Err(ChangelogAuthError::Forbidden),
        Err(()) => Err(ChangelogAuthError::Internal),
    }
}

pub(super) async fn request_has_changelog_admin_access(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> bool {
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return false;
    };
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return false;
    };
    let Some(user_id) = user.id.filter(|id| !id.trim().is_empty()) else {
        return false;
    };

    has_manage_changelog_permission(contact_data, &user_id, outbound)
        .await
        .unwrap_or(false)
}

pub(super) async fn has_manage_changelog_permission(
    contact_data: &contact::ContactDataConfig,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<bool, ()> {
    let Some(rpc_url) = contact_data.rpc_url(HAS_WORKSPACE_PERMISSION_RPC) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let Ok(body) = serde_json::to_string(&HasWorkspacePermissionRequest {
        p_permission: MANAGE_CHANGELOG_PERMISSION,
        p_user_id: user_id,
        p_ws_id: ROOT_WORKSPACE_ID,
    }) else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<bool>().map_err(|_| ())
}

pub(super) fn changelog_auth_error_response(error: ChangelogAuthError) -> BackendResponse {
    match error {
        ChangelogAuthError::Unauthorized => changelog_message_response(401, "Unauthorized"),
        ChangelogAuthError::Forbidden => changelog_message_response(403, "Forbidden"),
        ChangelogAuthError::Internal => no_store_response(json_response(
            500,
            json!({
                "error": WORKSPACE_MEMBERSHIP_LOOKUP_FAILED_MESSAGE,
            }),
        )),
    }
}
