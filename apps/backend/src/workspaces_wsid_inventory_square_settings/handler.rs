use super::*;

// ---------------------------------------------------------------------------
// GET response
// ---------------------------------------------------------------------------

pub(super) async fn get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !config.contact_data.configured() {
        return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE);
    }

    let Some(user) = authenticated_inventory_user(config, request, outbound).await else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };

    let resolved_ws_id =
        match normalize_workspace_id(&config.contact_data, outbound, raw_ws_id, &user).await {
            Ok(Some(ws_id)) => ws_id,
            Ok(None) => return error_response(404, NOT_FOUND_MESSAGE),
            Err(()) => return error_response(404, NOT_FOUND_MESSAGE),
        };

    match member_membership_check(&config.contact_data, outbound, &resolved_ws_id, &user).await {
        Ok(MembershipCheck::Member) => {}
        Ok(MembershipCheck::NotMember) => return message_response(403, FORBIDDEN_MESSAGE),
        Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    let permissions =
        match effective_permissions(&config.contact_data, outbound, &resolved_ws_id, &user).await {
            Ok(Some(permissions)) => permissions,
            Ok(None) => return error_response(404, NOT_FOUND_MESSAGE),
            Err(()) => return error_response(404, NOT_FOUND_MESSAGE),
        };

    let can_manage = permissions.has_all_permissions
        || permissions
            .permissions
            .iter()
            .any(|p| MANAGE_INVENTORY_SETUP_PERMISSIONS.contains(&p.as_str()));
    if !can_manage {
        return message_response(403, FORBIDDEN_MESSAGE);
    }

    match load_square_settings(&config.contact_data, outbound, &resolved_ws_id).await {
        Ok(settings) => no_store_response(json_response(200, settings)),
        Err(()) => message_response(500, FAILED_TO_LOAD_MESSAGE),
    }
}
