use crate::*;

pub(super) async fn dispatch_chunk_04(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl outbound::OutboundHttpClient,
) -> Option<BackendResponse> {
    if let Some(response) =
        workspaces_users_attendance_export::handle_workspaces_users_attendance_export_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        calendar_auth_microsoft::handle_calendar_auth_microsoft_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        storage_download_path::handle_storage_download_path_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_inventory_sales::handle_workspaces_inventory_sales_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_storage_list::handle_workspaces_storage_list_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_tasks_snapshot::handle_workspaces_tasks_snapshot_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_transactions_stats::handle_workspaces_transactions_stats_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_templates::handle_workspaces_templates_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_time_tracker_stats::handle_workspaces_time_tracker_stats_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) = nova::handle_nova_route(config, request, outbound).await {
        return Some(response);
    }

    if let Some(response) = task_board_status_templates::handle_task_board_status_templates_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) = crawlers::handle_crawler_route(config, request, outbound).await {
        return Some(response);
    }

    if let Some(response) = holidays::handle_holidays_route(config, request, outbound).await {
        return Some(response);
    }

    if let Some(response) =
        topic_announcements::handle_topic_announcement_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) = timezones::handle_timezones_route(config, request, outbound).await {
        return Some(response);
    }

    if let Some(response) = infrastructure_user_status_changes::handle_user_status_changes_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        infrastructure_workspace_users::handle_workspace_users_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        infrastructure_catalog_exports::handle_catalog_export_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        infrastructure_content_exports::handle_content_export_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        infrastructure_workspace_exports::handle_workspace_export_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        infrastructure_finance_exports::handle_finance_export_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        infrastructure_post_email_queue::handle_post_email_queue_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        infrastructure_inventory_exports::handle_inventory_export_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        infrastructure_related_exports::handle_related_export_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        infrastructure_migration_exports::handle_infrastructure_migration_export_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) = infrastructure_abuse_intelligence::handle_abuse_intelligence_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        infrastructure_abuse_events::handle_abuse_events_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        infrastructure_blocked_ips::handle_blocked_ips_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        infrastructure_suspensions::handle_suspensions_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        email_blacklist::handle_email_blacklist_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        inventory_orders::handle_inventory_orders_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) = inventory::handle_inventory_route(config, request, outbound).await {
        return Some(response);
    }

    if let Some(response) =
        workspace_external_projects_members::handle_workspace_external_projects_members_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspace_mail_bootstrap::handle_workspace_mail_bootstrap_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        admin_external_project_audits::handle_admin_external_project_audits_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        admin_external_project_bindings::handle_admin_external_project_bindings_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        devboxes_run_logs::handle_devboxes_run_logs_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        tulearn_bootstrap::handle_tulearn_bootstrap_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspace_users_me::handle_workspace_users_me_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_tulearn_marks::handle_workspaces_tulearn_marks_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    None
}
