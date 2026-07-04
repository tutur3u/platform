use crate::*;

pub(super) async fn dispatch_chunk_10(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl outbound::OutboundHttpClient,
) -> Option<BackendResponse> {
    if let Some(response) =
        admin_ai_credits_features::handle_admin_ai_credits_features_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    if let Some(response) =
        notifications_account_preferences::handle_notifications_account_preferences_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        users_task_settings::handle_users_task_settings_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_forms_formid_responses::handle_workspaces_forms_formid_responses_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_group_tags::handle_workspaces_group_tags_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_integrations_sepay_endpoints::handle_workspaces_integrations_sepay_endpoints_route(config, request, outbound).await {
        return Some(response);
    }

    if let Some(response) = workspaces_inventory_owners::handle_workspaces_inventory_owners_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_mind_boards_boardid::handle_workspaces_mind_boards_boardid_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_product_categories::handle_workspaces_product_categories_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_product_warehouses::handle_workspaces_product_warehouses_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_topic_announcements_templates::handle_workspaces_topic_announcements_templates_route(config, request, outbound).await {
        return Some(response);
    }

    None
}
