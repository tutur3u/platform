use crate::*;

pub(super) async fn dispatch_chunk_18(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl outbound::OutboundHttpClient,
) -> Option<BackendResponse> {
    if let Some(response) = wsid_calendar_auto_schedule::handle_wsid_calendar_auto_schedule_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        email_unsubscribe::handle_email_unsubscribe_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) = invite_code::handle_invite_code_route(config, request, outbound).await {
        return Some(response);
    }

    if let Some(response) =
        payment_orders_orderid_invoice::handle_payment_orders_orderid_invoice_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        payment_seats::handle_payment_seats_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        calendar_connections::handle_calendar_connections_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        documents_documentid::handle_documents_documentid_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) = hive_servers_serverid_crdt::handle_hive_servers_serverid_crdt_route(
        config, request, outbound,
    )
    .await
    {
        return Some(response);
    }

    if let Some(response) =
        hive_servers_serverid_research_sessions::handle_hive_servers_serverid_research_sessions_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        hive_servers_serverid_research_sessions_sessionid::handle_hive_servers_serverid_research_sessions_sessionid_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        hive_servers_serverid_workflows::handle_hive_servers_serverid_workflows_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        hive_servers_serverid_workflows_workflowid::handle_hive_servers_serverid_workflows_workflowid_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        hive_servers_serverid_workflows_workflowid_runs_runid::handle_hive_servers_serverid_workflows_workflowid_runs_runid_route(config, request, outbound).await
    {
        return Some(response);
    }

    None
}
