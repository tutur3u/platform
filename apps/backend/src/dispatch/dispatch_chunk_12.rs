use crate::*;

pub(super) async fn dispatch_chunk_12(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl outbound::OutboundHttpClient,
) -> Option<BackendResponse> {
    if let Some(response) =
        workspaces_wsid_task_initiatives::handle_workspaces_wsid_task_initiatives_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_wsid_task_plans::handle_workspaces_wsid_task_plans_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_task_projects::handle_workspaces_wsid_task_projects_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_task_templates::handle_workspaces_wsid_task_templates_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_topic_announcements::handle_workspaces_wsid_topic_announcements_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_wsid_user_groups::handle_workspaces_wsid_user_groups_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_users_2::handle_workspaces_wsid_users_2_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        users_me_configs_configid::handle_users_me_configs_configid_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_api_keys_keyid::handle_workspaces_wsid_api_keys_keyid_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_calendar_categories::handle_workspaces_wsid_calendar_categories_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_habits_habitid::handle_workspaces_wsid_habits_habitid_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_inventory_batches::handle_workspaces_wsid_inventory_batches_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_inventory_categories::handle_workspaces_wsid_inventory_categories_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_inventory_manufacturers::handle_workspaces_wsid_inventory_manufacturers_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_inventory_suppliers::handle_workspaces_wsid_inventory_suppliers_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_inventory_warehouses::handle_workspaces_wsid_inventory_warehouses_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_promotions_referral_settings::handle_workspaces_wsid_promotions_referral_settings_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_wsid_roles_roleid::handle_workspaces_wsid_roles_roleid_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_roles_default::handle_workspaces_wsid_roles_default_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_settings_configid::handle_workspaces_wsid_settings_configid_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_settings_configs::handle_workspaces_wsid_settings_configs_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_task_drafts_draftid::handle_workspaces_wsid_task_drafts_draftid_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_task_plans_planid::handle_workspaces_wsid_task_plans_planid_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_task_progress_goals::handle_workspaces_wsid_task_progress_goals_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_task_projects_projectid::handle_workspaces_wsid_task_projects_projectid_route(config, request, outbound).await
    {
        return Some(response);
    }

    None
}
