use crate::*;

pub(super) async fn dispatch_chunk_22(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl outbound::OutboundHttpClient,
) -> Option<BackendResponse> {
    if let Some(response) =
        workspaces_wsid_whiteboards_boardid::handle_workspaces_wsid_whiteboards_boardid_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    if let Some(response) =
        infrastructure_cron_whitelist_domains::handle_infrastructure_cron_whitelist_domains_route(
            config, request, outbound,
        )
        .await
    {
        return Some(response);
    }

    None
}
