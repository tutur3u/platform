use crate::*;

pub(super) async fn dispatch_chunk_05(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl outbound::OutboundHttpClient,
) -> Option<BackendResponse> {
    if let Some(response) =
        users_me_identity_link::handle_users_me_identity_link_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_tulearn_home::handle_workspaces_tulearn_home_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspace_user_group_member_count::handle_workspace_user_group_member_count_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_wallets_infinite::handle_workspaces_wallets_infinite_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_tags_stats::handle_workspaces_tags_stats_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_transactions_transactionid_tags::handle_workspaces_transactions_transactionid_tags_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_transactions_export::handle_workspaces_transactions_export_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wallets_walletid_credit_summary::handle_workspaces_wallets_walletid_credit_summary_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wallets_checkpoints_history::handle_workspaces_wallets_checkpoints_history_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        devboxes_agents_poll::handle_devboxes_agents_poll_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        exchange_rates::handle_exchange_rates_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_chat_realtime::handle_workspaces_chat_realtime_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) = storage_list::handle_storage_list_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_external_projects_storage_analytics::handle_workspaces_external_projects_storage_analytics_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_user_groups_module_modules::handle_workspaces_user_groups_module_modules_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_finance_charts_categories::handle_workspaces_finance_charts_categories_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_finance_overview::handle_workspaces_finance_overview_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_transactions_infinite::handle_workspaces_transactions_infinite_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_finance_invoices_analytics::handle_workspaces_finance_invoices_analytics_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_users_userid_user_groups::handle_workspaces_users_userid_user_groups_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_tasks_taskid_history::handle_workspaces_tasks_taskid_history_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_habits_habitid_stats::handle_workspaces_habits_habitid_stats_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_api_keys_keyid_usage_logs::handle_workspaces_api_keys_keyid_usage_logs_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        calendar_auth_provider_calendars::handle_calendar_auth_provider_calendars_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_inventory_overview::handle_workspaces_inventory_overview_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_deleted::handle_workspaces_deleted_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_education_attempts::handle_workspaces_education_attempts_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_meetings_meetingid_recordings::handle_workspaces_meetings_meetingid_recordings_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_boards_data::handle_workspaces_boards_data_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_task_boards_boardid_viewable_members::handle_workspaces_task_boards_boardid_viewable_members_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        users_me_tasks_taskid::handle_users_me_tasks_taskid_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_education_attempts_attemptid::handle_workspaces_education_attempts_attemptid_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_calendar_schedulable_tasks::handle_workspaces_calendar_schedulable_tasks_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        link_shortener_linkid_analytics::handle_link_shortener_linkid_analytics_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) = calendar_auth_list_calendars::handle_calendar_auth_list_calendars_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_finance_invoices_pending::handle_workspaces_finance_invoices_pending_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_users_reports_groups::handle_workspaces_users_reports_groups_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_inventory_audit_logs::handle_workspaces_inventory_audit_logs_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_habits_habitid_schedule_history::handle_workspaces_habits_habitid_schedule_history_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_users_groups::handle_workspaces_users_groups_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    None
}
