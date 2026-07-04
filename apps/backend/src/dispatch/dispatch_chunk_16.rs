use crate::*;

pub(super) async fn dispatch_chunk_16(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl outbound::OutboundHttpClient,
) -> Option<BackendResponse> {
    if let Some(response) =
        workspaces_wsid_teach_courses_courseid_posts::handle_workspaces_wsid_teach_courses_courseid_posts_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_teach_courses_courseid_reports::handle_workspaces_wsid_teach_courses_courseid_reports_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_teach_courses_courseid_tests::handle_workspaces_wsid_teach_courses_courseid_tests_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_teach_courses_courseid_tests_testid_questions::handle_workspaces_wsid_teach_courses_courseid_tests_testid_questions_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_teach_courses_courseid_tests_testid_submissions::handle_workspaces_wsid_teach_courses_courseid_tests_testid_submissions_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_teach_courses_courseid_tests_testid_submissions_attemptid::handle_workspaces_wsid_teach_courses_courseid_tests_testid_submissions_attemptid_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_templates_templateid::handle_workspaces_wsid_templates_templateid_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_templates_templateid_background_url::handle_workspaces_wsid_templates_templateid_background_url_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_templates_templateid_shares::handle_workspaces_wsid_templates_templateid_shares_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_time_tracking_break_types::handle_workspaces_wsid_time_tracking_break_types_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_time_tracking_breaks::handle_workspaces_wsid_time_tracking_breaks_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_time_tracking_categories::handle_workspaces_wsid_time_tracking_categories_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_time_tracking_goals::handle_workspaces_wsid_time_tracking_goals_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_time_tracking_requests::handle_workspaces_wsid_time_tracking_requests_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_time_tracking_requests_id_comments::handle_workspaces_wsid_time_tracking_requests_id_comments_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_time_tracking_sessions::handle_workspaces_wsid_time_tracking_sessions_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_time_tracking_sessions_sessionid::handle_workspaces_wsid_time_tracking_sessions_sessionid_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_topic_announcements_contacts::handle_workspaces_wsid_topic_announcements_contacts_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_tulearn_assignments::handle_workspaces_wsid_tulearn_assignments_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_tulearn_courses_courseid_modules_moduleid::handle_workspaces_wsid_tulearn_courses_courseid_modules_moduleid_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_tulearn_courses_courseid_tests_testid_attempt::handle_workspaces_wsid_tulearn_courses_courseid_tests_testid_attempt_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_tulearn_parent_links::handle_workspaces_wsid_tulearn_parent_links_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_tulearn_practice::handle_workspaces_wsid_tulearn_practice_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_tutoring_sessions::handle_workspaces_wsid_tutoring_sessions_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_user_groups_groupid::handle_workspaces_wsid_user_groups_groupid_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    None
}
