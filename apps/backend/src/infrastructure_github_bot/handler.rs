use super::*;

pub(super) async fn github_bot_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return store_error_response(LOAD_FAILED_MESSAGE);
    }

    // --- authorizeGitHubBotAdmin: authenticate -----------------------------
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

    // --- authorizeGitHubBotAdmin: ROOT manage_workspace_secrets ------------
    //
    // `getPermissions({ request, wsId: ROOT_WORKSPACE_ID })`. A resolution
    // failure yields null permissions -> treated as "no permission" -> 403,
    // matching the legacy `!permissions || withoutPermission(...)` branch.
    let root_permissions =
        match effective_workspace_permissions(contact_data, outbound, ROOT_WORKSPACE_ID, &user_id)
            .await
        {
            Ok(permissions) => permissions,
            Err(()) => WorkspaceAccess::none(),
        };

    if !root_permissions.contains(MANAGE_WORKSPACE_SECRETS) {
        return message_response(403, FORBIDDEN_MESSAGE);
    }

    // --- listGitHubBotState ------------------------------------------------
    match list_github_bot_state(contact_data, outbound).await {
        Ok(state) => no_store_response(json_response(200, state)),
        Err(()) => store_error_response(LOAD_FAILED_MESSAGE),
    }
}
