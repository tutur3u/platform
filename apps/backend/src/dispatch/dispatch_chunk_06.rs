use crate::*;

pub(super) async fn dispatch_chunk_06(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl outbound::OutboundHttpClient,
) -> Option<BackendResponse> {
    if let Some(response) = mira_tasks::handle_mira_tasks_route(config, request, outbound).await {
        return Some(response);
    }

    if let Some(response) = workspaces_tutoring_export::handle_workspaces_tutoring_export_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_tasks_taskid_schedule_history::handle_workspaces_tasks_taskid_schedule_history_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_tasks_history::handle_workspaces_tasks_history_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_transactions_periods::handle_workspaces_transactions_periods_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) = course::handle_course_route(config, request, outbound).await {
        return Some(response);
    }

    if let Some(response) =
        users_me_tasks::handle_users_me_tasks_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_ai_credits::handle_workspaces_ai_credits_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_chat_conversations_conversationid_ai_observability::handle_workspaces_chat_conversations_conversationid_ai_observability_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_infrastructure_realtime_analytics_summary::handle_workspaces_infrastructure_realtime_analytics_summary_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_time_tracking_stats_period::handle_workspaces_time_tracking_stats_period_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_tutoring_queue::handle_workspaces_tutoring_queue_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_users_reports_groups_groupid_dashboard::handle_workspaces_users_reports_groups_groupid_dashboard_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_tasks_taskid_relationships::handle_workspaces_tasks_taskid_relationships_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_finance_debts::handle_workspaces_finance_debts_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wallets::handle_workspaces_wallets_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_tags::handle_workspaces_tags_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_transactions::handle_workspaces_transactions_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_transactions_categories::handle_workspaces_transactions_categories_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wallets_walletid_checkpoints::handle_workspaces_wallets_walletid_checkpoints_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wallets_checkpoints::handle_workspaces_wallets_checkpoints_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_finance_debts_debtid::handle_workspaces_finance_debts_debtid_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_tags_tagid::handle_workspaces_tags_tagid_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_transactions_categories_categoryid::handle_workspaces_transactions_categories_categoryid_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_wallets_walletid::handle_workspaces_wallets_walletid_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_members::handle_workspaces_members_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_external_projects_members_roles_roleid_members::handle_workspaces_external_projects_members_roles_roleid_members_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_tasks::handle_workspaces_tasks_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_external_projects_members_roles::handle_workspaces_external_projects_members_roles_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_mail_mailboxes_mailboxid_members::handle_workspaces_mail_mailboxes_mailboxid_members_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_cron_jobs::handle_workspaces_cron_jobs_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_courses_courseid_modules::handle_workspaces_courses_courseid_modules_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_transactions_transactionid::handle_workspaces_transactions_transactionid_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_inventory_option_templates::handle_workspaces_inventory_option_templates_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_mind_boards::handle_workspaces_mind_boards_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_tasks_taskid::handle_workspaces_tasks_taskid_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_secrets::handle_workspaces_secrets_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_external_projects_members_roles_default::handle_workspaces_external_projects_members_roles_default_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_external_projects_members_roles_roleid::handle_workspaces_external_projects_members_roles_roleid_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_habit_trackers::handle_workspaces_habit_trackers_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    None
}
