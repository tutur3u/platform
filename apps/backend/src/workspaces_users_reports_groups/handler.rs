use super::*;

pub(super) async fn reports_groups_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return internal_server_error_response();
    }

    // `getPermissions` returns `null` for missing/invalid sessions -> 404.
    let Some(access_token) = request_access_token_ignoring_app_sessions(request) else {
        return not_found_response();
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return not_found_response();
    };

    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(Some(ws_id)) => ws_id,
            // No resolvable workspace / lookup failure -> getPermissions null -> 404.
            Ok(None) | Err(()) => return not_found_response(),
        };

    let permissions = match effective_workspace_permissions(
        contact_data,
        outbound,
        &resolved_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        // No membership / no effective permissions -> getPermissions null -> 404.
        Ok(Some(permissions)) => permissions,
        Ok(None) => return not_found_response(),
        Err(()) => return internal_server_error_response(),
    };

    if !permissions.contains(VIEW_USER_GROUPS_REPORTS_PERMISSION) {
        return unauthorized_response();
    }

    // Validate `q` and `selectedGroupId` query parameters.
    let (q, selected_group_id) = match parse_search_params(request.url) {
        Ok(parsed) => parsed,
        Err(response) => return response,
    };

    let has_manage_users = permissions.contains(MANAGE_USERS_PERMISSION);
    let accessible_group_ids: Option<Vec<String>> = if has_manage_users {
        None
    } else {
        match user_group_memberships(contact_data, outbound, &resolved_ws_id, &user_id).await {
            Ok(ids) => Some(ids),
            Err(()) => return internal_server_error_response(),
        }
    };

    // Restricted caller with no accessible groups -> empty payload.
    if accessible_group_ids
        .as_ref()
        .is_some_and(|ids| ids.is_empty())
    {
        return no_store_response(json_response(
            200,
            json!({
                "groups": [],
                "selectedGroup": Value::Null,
                "selectedGroupManagers": [],
                "groupStatusSummary": [],
            }),
        ));
    }

    let groups = match fetch_report_groups(
        contact_data,
        outbound,
        &resolved_ws_id,
        q.as_deref(),
        accessible_group_ids.as_deref(),
    )
    .await
    {
        Ok(groups) => groups,
        Err(()) => return error_fetching_response(),
    };

    let mut selected_group = selected_group_id
        .as_deref()
        .and_then(|id| groups.iter().find(|group| group.id.as_deref() == Some(id)))
        .map(report_group_to_value);

    if let Some(selected_id) = selected_group_id.as_deref()
        && selected_group.is_none()
    {
        match fetch_selected_report_group(
            contact_data,
            outbound,
            &resolved_ws_id,
            selected_id,
            accessible_group_ids.as_deref(),
        )
        .await
        {
            Ok(group) => selected_group = group.as_ref().map(report_group_to_value),
            Err(()) => return error_fetching_response(),
        }
    }

    let selected_group_managers = match (selected_group_id.as_deref(), selected_group.is_some()) {
        (Some(selected_id), true) => {
            match fetch_group_managers(contact_data, outbound, selected_id, &resolved_ws_id).await {
                Ok(managers) => managers,
                Err(()) => return error_fetching_response(),
            }
        }
        _ => Vec::new(),
    };

    let group_status_summary = match fetch_group_status_summary(
        contact_data,
        outbound,
        &resolved_ws_id,
        accessible_group_ids.as_deref(),
    )
    .await
    {
        Ok(summary) => summary,
        Err(()) => return error_fetching_response(),
    };

    let groups_json: Vec<Value> = groups.iter().map(report_group_to_value).collect();

    no_store_response(json_response(
        200,
        json!({
            "groups": groups_json,
            "selectedGroup": selected_group.unwrap_or(Value::Null),
            "selectedGroupManagers": selected_group_managers,
            "groupStatusSummary": group_status_summary,
        }),
    ))
}
