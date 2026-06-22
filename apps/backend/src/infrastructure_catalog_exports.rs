use crate::{
    BackendConfig, BackendRequest, BackendResponse,
    infrastructure_paginated_list::{
        CallerTokenPaginatedListSpec, handle_caller_token_paginated_list_route,
    },
    outbound::OutboundHttpClient,
};

const CLASSES_PATH: &str = "/api/v1/infrastructure/classes";
const PRODUCT_CATEGORIES_PATH: &str = "/api/v1/infrastructure/product-categories";
const SCORE_NAMES_PATH: &str = "/api/v1/infrastructure/score-names";
const MISSING_WS_ID_MESSAGE: &str = "Missing ws_id parameter";

const CATALOG_EXPORT_SPECS: [CallerTokenPaginatedListSpec; 3] = [
    CallerTokenPaginatedListSpec {
        error_message: "Error fetching workspace user groups",
        missing_ws_id_message: MISSING_WS_ID_MESSAGE,
        path: CLASSES_PATH,
        table: "workspace_user_groups",
        workspace_filter_column: "ws_id",
    },
    CallerTokenPaginatedListSpec {
        error_message: "Error fetching product_categories",
        missing_ws_id_message: MISSING_WS_ID_MESSAGE,
        path: PRODUCT_CATEGORIES_PATH,
        table: "product_categories",
        workspace_filter_column: "ws_id",
    },
    CallerTokenPaginatedListSpec {
        error_message: "Error fetching user_group_metrics",
        missing_ws_id_message: MISSING_WS_ID_MESSAGE,
        path: SCORE_NAMES_PATH,
        table: "user_group_metrics",
        workspace_filter_column: "ws_id",
    },
];

pub(crate) async fn handle_catalog_export_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    for spec in CATALOG_EXPORT_SPECS {
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
    fn catalog_export_specs_preserve_legacy_route_contracts() {
        assert_eq!(CATALOG_EXPORT_SPECS[0].path, CLASSES_PATH);
        assert_eq!(CATALOG_EXPORT_SPECS[0].table, "workspace_user_groups");
        assert_eq!(
            CATALOG_EXPORT_SPECS[0].error_message,
            "Error fetching workspace user groups"
        );

        assert_eq!(CATALOG_EXPORT_SPECS[1].path, PRODUCT_CATEGORIES_PATH);
        assert_eq!(CATALOG_EXPORT_SPECS[1].table, "product_categories");
        assert_eq!(
            CATALOG_EXPORT_SPECS[1].error_message,
            "Error fetching product_categories"
        );

        assert_eq!(CATALOG_EXPORT_SPECS[2].path, SCORE_NAMES_PATH);
        assert_eq!(CATALOG_EXPORT_SPECS[2].table, "user_group_metrics");
        assert_eq!(
            CATALOG_EXPORT_SPECS[2].error_message,
            "Error fetching user_group_metrics"
        );

        for spec in CATALOG_EXPORT_SPECS {
            assert_eq!(spec.missing_ws_id_message, MISSING_WS_ID_MESSAGE);
            assert_eq!(spec.workspace_filter_column, "ws_id");
        }
    }
}
