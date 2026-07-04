use crate::*;

pub(super) async fn dispatch_chunk_23(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl outbound::OutboundHttpClient,
) -> Option<BackendResponse> {
    if let Some(response) =
        infrastructure_cron_whitelist_domain_domain::handle_infrastructure_cron_whitelist_domain_domain_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_cron_jobs::handle_workspaces_wsid_cron_jobs_route(config, request, outbound)
            .await
    {
        return Some(response);
    }

    None
}
