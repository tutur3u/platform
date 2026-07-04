use crate::*;

pub(super) async fn dispatch_chunk_14(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl outbound::OutboundHttpClient,
) -> Option<BackendResponse> {
    if let Some(response) =
        workspaces_wsid_datasets_datasetid_rows::handle_workspaces_wsid_datasets_datasetid_rows_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_external_apps_cron::handle_workspaces_wsid_external_apps_cron_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_external_apps_cron_executions::handle_workspaces_wsid_external_apps_cron_executions_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_external_apps_cron_jobs_jobkey_executions::handle_workspaces_wsid_external_apps_cron_jobs_jobkey_executions_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_external_projects_assets_assetid::handle_workspaces_wsid_external_projects_assets_assetid_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_external_projects_field_definitions::handle_workspaces_wsid_external_projects_field_definitions_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_finance_invoices::handle_workspaces_wsid_finance_invoices_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_wsid_forms_formid::handle_workspaces_wsid_forms_formid_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_group_tags_tagid::handle_workspaces_wsid_group_tags_tagid_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_habits_habitid_schedule::handle_workspaces_wsid_habits_habitid_schedule_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_inventory_costing_profileid::handle_workspaces_wsid_inventory_costing_profileid_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_inventory_products::handle_workspaces_wsid_inventory_products_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_inventory_sales_saleid::handle_workspaces_wsid_inventory_sales_saleid_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_inventory_storefronts_storefrontid::handle_workspaces_wsid_inventory_storefronts_storefrontid_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_meetings::handle_workspaces_wsid_meetings_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_meetings_meetingid_stream::handle_workspaces_wsid_meetings_meetingid_stream_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_mind_boards_boardid::handle_workspaces_wsid_mind_boards_boardid_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_notes::handle_workspaces_wsid_notes_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_products_productid::handle_workspaces_wsid_products_productid_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_products_productid_inventory::handle_workspaces_wsid_products_productid_inventory_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_roles_roleid_wallets::handle_workspaces_wsid_roles_roleid_wallets_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_settings_calendar_sync::handle_workspaces_wsid_settings_calendar_sync_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_wsid_task_boards::handle_workspaces_wsid_task_boards_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_task_boards_boardid::handle_workspaces_wsid_task_boards_boardid_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_task_boards_boardid_lists::handle_workspaces_wsid_task_boards_boardid_lists_route(config, request, outbound).await
    {
        return Some(response);
    }

    None
}
