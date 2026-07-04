use crate::*;

pub(super) async fn dispatch_chunk_17(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl outbound::OutboundHttpClient,
) -> Option<BackendResponse> {
    if let Some(response) =
        workspaces_wsid_user_groups_groupid_attendance::handle_workspaces_wsid_user_groups_groupid_attendance_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_user_groups_groupid_group_checks::handle_workspaces_wsid_user_groups_groupid_group_checks_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_user_groups_groupid_indicators::handle_workspaces_wsid_user_groups_groupid_indicators_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_user_groups_groupid_linked_products::handle_workspaces_wsid_user_groups_groupid_linked_products_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_user_groups_groupid_members::handle_workspaces_wsid_user_groups_groupid_members_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_user_groups_groupid_members_userid_feedbacks::handle_workspaces_wsid_user_groups_groupid_members_userid_feedbacks_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_user_groups_groupid_module_groups::handle_workspaces_wsid_user_groups_groupid_module_groups_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_user_groups_groupid_modules::handle_workspaces_wsid_user_groups_groupid_modules_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_user_groups_groupid_posts::handle_workspaces_wsid_user_groups_groupid_posts_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_user_groups_sessions::handle_workspaces_wsid_user_groups_sessions_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_user_groups_sessions_sessionid_reconcile::handle_workspaces_wsid_user_groups_sessions_sessionid_reconcile_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_user_profile_links::handle_workspaces_wsid_user_profile_links_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_wsid_users_userid::handle_workspaces_wsid_users_userid_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_users_userid_linked_promotions::handle_workspaces_wsid_users_userid_linked_promotions_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_users_userid_referrals::handle_workspaces_wsid_users_userid_referrals_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_users_approvals::handle_workspaces_wsid_users_approvals_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_users_database::handle_workspaces_wsid_users_database_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_users_feedbacks::handle_workspaces_wsid_users_feedbacks_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) = workspaces_wsid_users_fields::handle_workspaces_wsid_users_fields_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_users_groups_featured_counts::handle_workspaces_wsid_users_groups_featured_counts_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_users_groups_possible_excluded::handle_workspaces_wsid_users_groups_possible_excluded_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_wallets_walletid_roles::handle_workspaces_wsid_wallets_walletid_roles_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_workforce_users::handle_workspaces_wsid_workforce_users_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_workforce_users_userid::handle_workspaces_wsid_workforce_users_userid_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid::handle_workspaces_wsid_route(config, request, outbound).await
    {
        return Some(response);
    }

    None
}
