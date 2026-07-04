use crate::*;

pub(super) async fn dispatch_chunk_02(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl outbound::OutboundHttpClient,
) -> Option<BackendResponse> {
    if let Some(response) =
        admin_ai_credits_overview::handle_admin_ai_credits_overview_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) = auth_mfa_mobile_challenges::handle_auth_mfa_mobile_challenges_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        infrastructure_rate_limits_live_usage::handle_infrastructure_rate_limits_live_usage_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        storage_analytics::handle_storage_analytics_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_forms_export::handle_workspaces_forms_export_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_forms_share_link::handle_workspaces_forms_share_link_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_invitations::handle_workspaces_invitations_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_invite_status::handle_workspaces_invite_status_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_settings_permissions_setup_status::handle_workspaces_settings_permissions_setup_status_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_storage_analytics::handle_workspaces_storage_analytics_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_storage_export_assetpath::handle_workspaces_storage_export_assetpath_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_transactions_category_breakdown::handle_workspaces_transactions_category_breakdown_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_transactions_spending_trends::handle_workspaces_transactions_spending_trends_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_user_groups_activity_logs::handle_workspaces_user_groups_activity_logs_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_user_groups_linked_products::handle_workspaces_user_groups_linked_products_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_user_groups_members_vitals::handle_workspaces_user_groups_members_vitals_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_users_attendance::handle_workspaces_users_attendance_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_users_audit_logs::handle_workspaces_users_audit_logs_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        admin_ai_credits_entity_detail::handle_admin_ai_credits_entity_detail_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        hive_servers_research_sessions_export::handle_hive_servers_research_sessions_export_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        infrastructure_ai_agents_external_threads_messages::handle_infrastructure_ai_agents_external_threads_messages_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        mobile_deployment_bundle::handle_mobile_deployment_bundle_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_chat_conversations_shared_content::handle_workspaces_chat_conversations_shared_content_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_external_projects_delivery::handle_workspaces_external_projects_delivery_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_external_projects_sync_snapshot::handle_workspaces_external_projects_sync_snapshot_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_finance_charts_daily::handle_workspaces_finance_charts_daily_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_finance_wallets_expense_count::handle_workspaces_finance_wallets_expense_count_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_finance_wallets_expense_sum::handle_workspaces_finance_wallets_expense_sum_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_finance_wallets_income_count::handle_workspaces_finance_wallets_income_count_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_finance_wallets_income_sum::handle_workspaces_finance_wallets_income_sum_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_posts_bootstrap::handle_workspaces_posts_bootstrap_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_posts_status::handle_workspaces_posts_status_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_promotions_count::handle_workspaces_promotions_count_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_task_plans_digest::handle_workspaces_task_plans_digest_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_teach_users::handle_workspaces_teach_users_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        time_tracking_export::handle_time_tracking_export_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_users_reports_groups_bulk_export::handle_workspaces_users_reports_groups_bulk_export_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_users_count::handle_workspaces_users_count_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_user_groups_count::handle_workspaces_user_groups_count_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_finance_charts_monthly::handle_workspaces_finance_charts_monthly_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    None
}
