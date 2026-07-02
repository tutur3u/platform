use crate::*;

pub(super) async fn dispatch_chunk_13(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl outbound::OutboundHttpClient,
) -> Option<BackendResponse> {
    if let Some(response) =
        billing_wsid_invoice::handle_billing_wsid_invoice_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) = admin_ai_credits_allocations::handle_admin_ai_credits_allocations_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        admin_ai_credits_balances::handle_admin_ai_credits_balances_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        admin_ai_credits_models::handle_admin_ai_credits_models_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        hive_access_requests_me::handle_hive_access_requests_me_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) = hive_servers::handle_hive_servers_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        hive_servers_serverid::handle_hive_servers_serverid_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        infrastructure_rate_limit_appeals_appealid::handle_infrastructure_rate_limit_appeals_appealid_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) = infrastructure_rate_limits::handle_infrastructure_rate_limits_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        infrastructure_rate_limits_workspace_secrets::handle_infrastructure_rate_limits_workspace_secrets_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        shared_forms_sharecode::handle_shared_forms_sharecode_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        shared_tasks_sharecode::handle_shared_tasks_sharecode_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        users_me_task_boards::handle_users_me_task_boards_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        users_me_tasks_taskid_overrides::handle_users_me_tasks_taskid_overrides_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        users_me_tasks_taskid_schedule::handle_users_me_tasks_taskid_schedule_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        users_me_workspaces_wsid_configs_configid::handle_users_me_workspaces_wsid_configs_configid_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_calendar_hours::handle_workspaces_wsid_calendar_hours_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_calendar_settings::handle_workspaces_wsid_calendar_settings_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_calendar_default_source::handle_workspaces_wsid_calendar_default_source_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_calendar_sync_preferences::handle_workspaces_wsid_calendar_sync_preferences_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_calendars::handle_workspaces_wsid_calendars_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_chat_conversations::handle_workspaces_wsid_chat_conversations_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_chat_conversations_conversationid_ai_settings::handle_workspaces_wsid_chat_conversations_conversationid_ai_settings_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_chat_conversations_conversationid_messages::handle_workspaces_wsid_chat_conversations_conversationid_messages_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_cron_jobs_jobid::handle_workspaces_wsid_cron_jobs_jobid_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    None
}
