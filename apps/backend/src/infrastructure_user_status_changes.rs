use crate::{
    BackendConfig, BackendRequest, BackendResponse,
    infrastructure_paginated_list::{
        CallerTokenPaginatedListSpec, handle_caller_token_paginated_list_route,
    },
    outbound::OutboundHttpClient,
};

pub(crate) const INFRASTRUCTURE_USER_STATUS_CHANGES_PATH: &str =
    "/api/v1/infrastructure/user-status-changes";

const USER_STATUS_CHANGES_SPEC: CallerTokenPaginatedListSpec = CallerTokenPaginatedListSpec {
    error_message: "Error fetching workspace_user_status_changes",
    missing_ws_id_message: "Missing ws_id parameter",
    path: INFRASTRUCTURE_USER_STATUS_CHANGES_PATH,
    select: "*",
    table: "workspace_user_status_changes",
    workspace_filter_column: "ws_id",
};

pub(crate) async fn handle_user_status_changes_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    handle_caller_token_paginated_list_route(
        &config.contact_data,
        request,
        outbound,
        USER_STATUS_CHANGES_SPEC,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn user_status_changes_spec_preserves_legacy_route_contract() {
        assert_eq!(
            USER_STATUS_CHANGES_SPEC.error_message,
            "Error fetching workspace_user_status_changes"
        );
        assert_eq!(
            USER_STATUS_CHANGES_SPEC.missing_ws_id_message,
            "Missing ws_id parameter"
        );
        assert_eq!(
            USER_STATUS_CHANGES_SPEC.table,
            "workspace_user_status_changes"
        );
        assert_eq!(USER_STATUS_CHANGES_SPEC.select, "*");
        assert_eq!(USER_STATUS_CHANGES_SPEC.workspace_filter_column, "ws_id");
        assert_eq!(
            USER_STATUS_CHANGES_SPEC.path,
            "/api/v1/infrastructure/user-status-changes"
        );
    }
}
