use crate::*;

pub(super) async fn dispatch_chunk_11(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl outbound::OutboundHttpClient,
) -> Option<BackendResponse> {
    if let Some(response) =
        infrastructure_entity_creation_limits::handle_infrastructure_entity_creation_limits_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        infrastructure_rate_limit_appeals::handle_infrastructure_rate_limit_appeals_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        infrastructure_rate_limit_subjects::handle_infrastructure_rate_limit_subjects_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_api_keys_roles::handle_workspaces_wsid_api_keys_roles_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_external_apps_members::handle_workspaces_wsid_external_apps_members_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_settings_members::handle_workspaces_wsid_settings_members_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_settings_email_audit::handle_workspaces_wsid_settings_email_audit_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_task_progress_stats::handle_workspaces_wsid_task_progress_stats_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) = hive_members::handle_hive_members_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_members::handle_workspaces_wsid_members_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_users::handle_workspaces_wsid_users_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) = integrations_discord_members::handle_integrations_discord_members_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        users_me_board_list_overrides::handle_users_me_board_list_overrides_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_api_keys::handle_workspaces_wsid_api_keys_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_courses::handle_workspaces_wsid_courses_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_habits::handle_workspaces_wsid_habits_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_labels::handle_workspaces_wsid_labels_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_product_units::handle_workspaces_wsid_product_units_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_wsid_promotions::handle_workspaces_wsid_promotions_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_quiz_sets::handle_workspaces_wsid_quiz_sets_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_quizzes::handle_workspaces_wsid_quizzes_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_roles::handle_workspaces_wsid_roles_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_settings::handle_workspaces_wsid_settings_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_wsid_task_cycles::handle_workspaces_wsid_task_cycles_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_wsid_task_drafts::handle_workspaces_wsid_task_drafts_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    None
}
