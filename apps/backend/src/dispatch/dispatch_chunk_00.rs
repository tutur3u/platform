use crate::*;

pub(super) async fn dispatch_chunk_00(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl outbound::OutboundHttpClient,
) -> Option<BackendResponse> {
    if let Some(response) =
        mobile_version::handle_mobile_version_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) = auth_me::handle_auth_me_route(config, request, outbound).await {
        return Some(response);
    }

    if let Some(response) = auth_mfa::handle_auth_mfa_route(config, request, outbound).await {
        return Some(response);
    }

    if let Some(response) =
        user_identities::handle_user_identities_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) = user_profile::handle_user_profile_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        current_user_default_workspace::handle_current_user_default_workspace_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        current_user_calendar_settings::handle_current_user_calendar_settings_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) = contact::handle_contact_route(config, request, outbound).await {
        return Some(response);
    }

    if let Some(response) = devbox_cache::handle_devbox_cache_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        onboarding_progress::handle_onboarding_progress_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) = aurora::handle_aurora_route(config, request, outbound).await {
        return Some(response);
    }

    if let Some(response) = ai_whitelist::handle_ai_whitelist_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) = ai_models::handle_ai_models_route(config, request, outbound).await {
        return Some(response);
    }

    if let Some(response) = changelog::handle_changelog_route(config, request, outbound).await {
        return Some(response);
    }

    if let Some(response) =
        task_embeddings::handle_task_embeddings_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspace_limits::handle_workspace_limits_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) = workspace_post_permissions::handle_workspace_post_permissions_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) = workspace_education_access::handle_workspace_education_access_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        education_course_module_reads::handle_education_course_module_reads_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspace_habits_access::handle_workspace_habits_access_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspace_mobile_module_flags::handle_workspace_mobile_module_flags_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        finance_budget_status::handle_finance_budget_status_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        finance_chart_balance::handle_finance_chart_balance_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        finance_debt_summary::handle_finance_debt_summary_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        finance_filter_users::handle_finance_filter_users_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        finance_recurring_transactions::handle_finance_recurring_transactions_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) = finance_subscription_context::handle_finance_subscription_context_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) = workspace_permission_check::handle_workspace_permission_check_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspace_mentions::handle_workspace_mentions_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) = hive_access::handle_hive_access_route(config, request, outbound).await {
        return Some(response);
    }

    if let Some(response) =
        hive_ai_models::handle_hive_ai_models_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        hive_workspaces::handle_hive_workspaces_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        hive_ai_credits::handle_hive_ai_credits_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        cms_workspaces::handle_cms_workspaces_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        ai_chats_list::handle_ai_chats_list_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        hive_access_requests::handle_hive_access_requests_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) = workspace_inventory_realtime::handle_workspace_inventory_realtime_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspace_inventory_costing_analytics::handle_workspace_inventory_costing_analytics_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_list::handle_workspaces_list_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspace_external_projects_summary::handle_workspace_external_projects_summary_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    None
}
