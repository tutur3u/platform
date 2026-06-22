use crate::{
    BackendConfig, BackendRequest, BackendResponse,
    infrastructure_paginated_list::{
        CallerTokenPaginatedListSpec, handle_caller_token_paginated_list_route,
    },
    outbound::OutboundHttpClient,
};

pub(crate) const INFRASTRUCTURE_WORKSPACE_USERS_PATH: &str = "/api/v1/infrastructure/users";

const WORKSPACE_USERS_SPEC: CallerTokenPaginatedListSpec = CallerTokenPaginatedListSpec {
    error_message: "Error fetching workspace users",
    missing_ws_id_message: "Missing ws_id parameter",
    path: INFRASTRUCTURE_WORKSPACE_USERS_PATH,
    select: "*",
    table: "workspace_users",
    workspace_filter_column: "ws_id",
};

pub(crate) async fn handle_workspace_users_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    handle_caller_token_paginated_list_route(
        &config.contact_data,
        request,
        outbound,
        WORKSPACE_USERS_SPEC,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workspace_users_spec_preserves_legacy_route_contract() {
        assert_eq!(
            WORKSPACE_USERS_SPEC.error_message,
            "Error fetching workspace users"
        );
        assert_eq!(
            WORKSPACE_USERS_SPEC.missing_ws_id_message,
            "Missing ws_id parameter"
        );
        assert_eq!(WORKSPACE_USERS_SPEC.table, "workspace_users");
        assert_eq!(WORKSPACE_USERS_SPEC.select, "*");
        assert_eq!(WORKSPACE_USERS_SPEC.workspace_filter_column, "ws_id");
        assert_eq!(WORKSPACE_USERS_SPEC.path, "/api/v1/infrastructure/users");
    }
}
