use crate::*;

pub(super) async fn dispatch_chunk_20(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl outbound::OutboundHttpClient,
) -> Option<BackendResponse> {
    if let Some(response) =
        workspaces_wsid_calendar_schedule::handle_workspaces_wsid_calendar_schedule_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_consolidate_users::handle_workspaces_wsid_consolidate_users_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_crawlers::handle_workspaces_wsid_crawlers_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_documents::handle_workspaces_wsid_documents_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_documents_documentid::handle_workspaces_wsid_documents_documentid_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_wsid_encryption::handle_workspaces_wsid_encryption_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_external_projects_storage::handle_workspaces_wsid_external_projects_storage_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_wsid_flashcards::handle_workspaces_wsid_flashcards_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_integrations_sepay_oauth_callback::handle_workspaces_wsid_integrations_sepay_oauth_callback_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_inventory_square_settings::handle_workspaces_wsid_inventory_square_settings_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_inventory_square_devices::handle_workspaces_wsid_inventory_square_devices_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_inventory_square_locations::handle_workspaces_wsid_inventory_square_locations_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_logo::handle_workspaces_wsid_logo_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_wsid_meet_plans::handle_workspaces_wsid_meet_plans_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_storage_share::handle_workspaces_wsid_storage_share_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_user_groups_groupid_storage::handle_workspaces_wsid_user_groups_groupid_storage_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_whiteboards_boardid_image_url::handle_workspaces_wsid_whiteboards_boardid_image_url_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_wsid_invite_links::handle_workspaces_wsid_invite_links_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_invite_links_linkid::handle_workspaces_wsid_invite_links_linkid_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_wallets::handle_workspaces_wsid_wallets_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_wallets_walletid_interest::handle_workspaces_wsid_wallets_walletid_interest_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_wallets_walletid_interest_calculate::handle_workspaces_wsid_wallets_walletid_interest_calculate_route(config, request, outbound).await
    {
        return Some(response);
    }

    None
}
