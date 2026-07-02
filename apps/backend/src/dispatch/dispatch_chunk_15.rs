use crate::*;

pub(super) async fn dispatch_chunk_15(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl outbound::OutboundHttpClient,
) -> Option<BackendResponse> {
    if let Some(response) =
        workspaces_wsid_task_boards_boardid_public_link::handle_workspaces_wsid_task_boards_boardid_public_link_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_task_boards_boardid_shares::handle_workspaces_wsid_task_boards_boardid_shares_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_task_plans_planid_items::handle_workspaces_wsid_task_plans_planid_items_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_task_plans_planid_shares::handle_workspaces_wsid_task_plans_planid_shares_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_task_plans_planid_workspaces::handle_workspaces_wsid_task_plans_planid_workspaces_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_task_progress_entries::handle_workspaces_wsid_task_progress_entries_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_task_progress_leaderboards::handle_workspaces_wsid_task_progress_leaderboards_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_task_progress_leaderboards_leaderboardid::handle_workspaces_wsid_task_progress_leaderboards_leaderboardid_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_task_progress_leaderboards_leaderboardid_members::handle_workspaces_wsid_task_progress_leaderboards_leaderboardid_members_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_task_progress_leaderboards_leaderboardid_teams::handle_workspaces_wsid_task_progress_leaderboards_leaderboardid_teams_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_task_progress_metrics::handle_workspaces_wsid_task_progress_metrics_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_task_projects_projectid_tasks::handle_workspaces_wsid_task_projects_projectid_tasks_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_task_projects_projectid_updates::handle_workspaces_wsid_task_projects_projectid_updates_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_task_projects_projectid_updates_updateid_comments::handle_workspaces_wsid_task_projects_projectid_updates_updateid_comments_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_task_templates_templatekey::handle_workspaces_wsid_task_templates_templatekey_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_tasks_taskid_description::handle_workspaces_wsid_tasks_taskid_description_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_tasks_taskid_schedule::handle_workspaces_wsid_tasks_taskid_schedule_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_tasks_taskid_share_links::handle_workspaces_wsid_tasks_taskid_share_links_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_tasks_taskid_shares::handle_workspaces_wsid_tasks_taskid_shares_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_teach_courses_courseid_attendance::handle_workspaces_wsid_teach_courses_courseid_attendance_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_teach_courses_courseid_indicators::handle_workspaces_wsid_teach_courses_courseid_indicators_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_teach_courses_courseid_members::handle_workspaces_wsid_teach_courses_courseid_members_route(config, request, outbound).await
    {
        return Some(response);
    }

    None
}
