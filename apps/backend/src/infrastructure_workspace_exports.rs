use crate::{
    BackendConfig, BackendRequest, BackendResponse,
    infrastructure_paginated_list::{
        CallerTokenPaginatedListSpec, handle_caller_token_paginated_list_route,
    },
    outbound::OutboundHttpClient,
};

const BILLS_PATH: &str = "/api/v1/infrastructure/bills";
const ROLES_PATH: &str = "/api/v1/infrastructure/roles";
const TRANSACTION_CATEGORIES_PATH: &str = "/api/v1/infrastructure/transaction-categories";
const MISSING_WS_ID_MESSAGE: &str = "Missing ws_id parameter";

const WORKSPACE_EXPORT_SPECS: [CallerTokenPaginatedListSpec; 3] = [
    CallerTokenPaginatedListSpec {
        error_message: "Error fetching finance invoices",
        missing_ws_id_message: MISSING_WS_ID_MESSAGE,
        path: BILLS_PATH,
        table: "finance_invoices",
        workspace_filter_column: "ws_id",
    },
    CallerTokenPaginatedListSpec {
        error_message: "Error fetching workspace_user_groups",
        missing_ws_id_message: MISSING_WS_ID_MESSAGE,
        path: ROLES_PATH,
        table: "workspace_user_groups",
        workspace_filter_column: "ws_id",
    },
    CallerTokenPaginatedListSpec {
        error_message: "Error fetching transaction_categories",
        missing_ws_id_message: MISSING_WS_ID_MESSAGE,
        path: TRANSACTION_CATEGORIES_PATH,
        table: "transaction_categories",
        workspace_filter_column: "ws_id",
    },
];

pub(crate) async fn handle_workspace_export_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    for spec in WORKSPACE_EXPORT_SPECS {
        if let Some(response) =
            handle_caller_token_paginated_list_route(&config.contact_data, request, outbound, spec)
                .await
        {
            return Some(response);
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workspace_export_specs_preserve_legacy_route_contracts() {
        assert_eq!(WORKSPACE_EXPORT_SPECS[0].path, BILLS_PATH);
        assert_eq!(WORKSPACE_EXPORT_SPECS[0].table, "finance_invoices");
        assert_eq!(
            WORKSPACE_EXPORT_SPECS[0].error_message,
            "Error fetching finance invoices"
        );

        assert_eq!(WORKSPACE_EXPORT_SPECS[1].path, ROLES_PATH);
        assert_eq!(WORKSPACE_EXPORT_SPECS[1].table, "workspace_user_groups");
        assert_eq!(
            WORKSPACE_EXPORT_SPECS[1].error_message,
            "Error fetching workspace_user_groups"
        );

        assert_eq!(WORKSPACE_EXPORT_SPECS[2].path, TRANSACTION_CATEGORIES_PATH);
        assert_eq!(WORKSPACE_EXPORT_SPECS[2].table, "transaction_categories");
        assert_eq!(
            WORKSPACE_EXPORT_SPECS[2].error_message,
            "Error fetching transaction_categories"
        );

        for spec in WORKSPACE_EXPORT_SPECS {
            assert_eq!(spec.missing_ws_id_message, MISSING_WS_ID_MESSAGE);
            assert_eq!(spec.workspace_filter_column, "ws_id");
        }
    }
}
