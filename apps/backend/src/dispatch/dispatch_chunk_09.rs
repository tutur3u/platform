use crate::*;

pub(super) async fn dispatch_chunk_09(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl outbound::OutboundHttpClient,
) -> Option<BackendResponse> {
    if let Some(response) =
        workspaces_users_avatar::handle_workspaces_users_avatar_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_chat_channels::handle_workspaces_chat_channels_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_finance_recurring_transactions::handle_workspaces_finance_recurring_transactions_route(config, request, outbound).await {
        return Some(response);
    }

    if let Some(response) = infrastructure_external_apps::handle_infrastructure_external_apps_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_chat_friend_requests::handle_workspaces_chat_friend_requests_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_datasets::handle_workspaces_datasets_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_chat_channels_channelid_messages::handle_workspaces_chat_channels_channelid_messages_route(config, request, outbound).await {
        return Some(response);
    }

    if let Some(response) =
        workspaces_datasets_datasetid_cells::handle_workspaces_datasets_datasetid_cells_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_datasets_datasetid_columns::handle_workspaces_datasets_datasetid_columns_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_external_projects_entries::handle_workspaces_external_projects_entries_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) = mira_soul::handle_mira_soul_route(config, request, outbound).await {
        return Some(response);
    }

    if let Some(response) = workspaces_product_suppliers::handle_workspaces_product_suppliers_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        infrastructure_github_bot::handle_infrastructure_github_bot_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_ai_model_favorites::handle_workspaces_ai_model_favorites_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    None
}
