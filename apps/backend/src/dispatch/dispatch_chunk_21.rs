use crate::*;

pub(super) async fn dispatch_chunk_21(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl outbound::OutboundHttpClient,
) -> Option<BackendResponse> {
    if let Some(response) =
        workspaces_wsid_wallets_walletid_interest_project::handle_workspaces_wsid_wallets_walletid_interest_project_route(config, request, outbound).await
    {
        return Some(response);
    }

    if let Some(response) =
        workspaces_wsid_wallets_walletid_interest_rates::handle_workspaces_wsid_wallets_walletid_interest_rates_route(config, request, outbound).await
    {
        return Some(response);
    }

    None
}
