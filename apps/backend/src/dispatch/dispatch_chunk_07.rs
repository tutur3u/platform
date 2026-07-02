use super::handle_discord_cron_proxy;
use crate::*;

pub(super) async fn dispatch_chunk_07(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl outbound::OutboundHttpClient,
) -> Option<BackendResponse> {
    if let Some(response) =
        workspaces_inventory_storefronts::handle_workspaces_inventory_storefronts_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_users_userid::handle_workspaces_users_userid_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_mail_mailboxes_mailboxid_messages::handle_workspaces_mail_mailboxes_mailboxid_messages_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_ai_prompts_promptid::handle_workspaces_ai_prompts_promptid_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_finance_budgets::handle_workspaces_finance_budgets_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_habit_trackers_trackerid_entries::handle_workspaces_habit_trackers_trackerid_entries_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_cron_jobs_jobid::handle_workspaces_cron_jobs_jobid_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_inventory_polar_settings::handle_workspaces_inventory_polar_settings_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        admin_external_projects::handle_admin_external_projects_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_inventory_costing::handle_workspaces_inventory_costing_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_inventory_polar_product_sync::handle_workspaces_inventory_polar_product_sync_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) = handle_discord_cron_proxy(config, request, outbound).await {
        return Some(response);
    }

    None
}
