use crate::*;

pub(super) async fn dispatch_chunk_08(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl outbound::OutboundHttpClient,
) -> Option<BackendResponse> {
    if let Some(response) = workspaces_inventory_bundles::handle_workspaces_inventory_bundles_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) = admin_external_project_bindings_workspaceid::handle_admin_external_project_bindings_workspaceid_route(config, request, outbound).await {
        return Some(response);
    }

    if let Some(response) = workspaces_inventory_storefronts_storefrontid_listings::handle_workspaces_inventory_storefronts_storefrontid_listings_route(config, request, outbound).await {
        return Some(response);
    }

    if let Some(response) = workspaces_group_tags_tagid_user_groups::handle_workspaces_group_tags_tagid_user_groups_route(config, request, outbound).await {
        return Some(response);
    }

    if let Some(response) =
        workspaces_roles_roleid_members::handle_workspaces_roles_roleid_members_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_forms::handle_workspaces_forms_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_chat_channels_channelid_participants::handle_workspaces_chat_channels_channelid_participants_route(config, request, outbound).await {
        return Some(response);
    }

    if let Some(response) =
        workspaces_mind_boards_boardid_graph::handle_workspaces_mind_boards_boardid_graph_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_habit_trackers_trackerid::handle_workspaces_habit_trackers_trackerid_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        infrastructure_app_coordination::handle_infrastructure_app_coordination_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_external_projects_collections::handle_workspaces_external_projects_collections_route(config, request, outbound).await {
        return Some(response);
    }

    if let Some(response) =
        users_sessions::handle_users_sessions_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_forms_formid_analytics::handle_workspaces_forms_formid_analytics_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    None
}
