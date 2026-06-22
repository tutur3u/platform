use crate::{
    BackendConfig, BackendRequest, BackendResponse,
    infrastructure_paginated_list::{
        CallerTokenPaginatedListSpec, handle_caller_token_paginated_list_route,
    },
    outbound::OutboundHttpClient,
};

const BILL_COUPONS_PATH: &str = "/api/v1/infrastructure/bill-coupons";
const BILL_PACKAGES_PATH: &str = "/api/v1/infrastructure/bill-packages";
const CLASS_PACKAGES_PATH: &str = "/api/v1/infrastructure/class-packages";
const CLASS_SCORES_PATH: &str = "/api/v1/infrastructure/class-scores";
const PACKAGE_STOCK_CHANGES_PATH: &str = "/api/v1/infrastructure/package-stock-changes";
const STUDENT_FEEDBACKS_PATH: &str = "/api/v1/infrastructure/student-feedbacks";
const MISSING_WS_ID_MESSAGE: &str = "Missing ws_id parameter";

const RELATED_EXPORT_SPECS: [CallerTokenPaginatedListSpec; 6] = [
    CallerTokenPaginatedListSpec {
        error_message: "Error fetching finance_invoice_promotions",
        missing_ws_id_message: MISSING_WS_ID_MESSAGE,
        path: BILL_COUPONS_PATH,
        select: "*, finance_invoices!inner(ws_id)",
        table: "finance_invoice_promotions",
        workspace_filter_column: "finance_invoices.ws_id",
    },
    CallerTokenPaginatedListSpec {
        error_message: "Error fetching finance_invoice_products",
        missing_ws_id_message: MISSING_WS_ID_MESSAGE,
        path: BILL_PACKAGES_PATH,
        select: "*, finance_invoices!inner(ws_id)",
        table: "finance_invoice_products",
        workspace_filter_column: "finance_invoices.ws_id",
    },
    CallerTokenPaginatedListSpec {
        error_message: "Error fetching user_group_linked_products",
        missing_ws_id_message: MISSING_WS_ID_MESSAGE,
        path: CLASS_PACKAGES_PATH,
        select: "*, workspace_user_groups!inner(ws_id)",
        table: "user_group_linked_products",
        workspace_filter_column: "workspace_user_groups.ws_id",
    },
    CallerTokenPaginatedListSpec {
        error_message: "Error fetching user_indicators",
        missing_ws_id_message: MISSING_WS_ID_MESSAGE,
        path: CLASS_SCORES_PATH,
        select: "*, workspace_users!user_indicators_user_id_fkey!inner(ws_id)",
        table: "user_indicators",
        workspace_filter_column: "workspace_users.ws_id",
    },
    CallerTokenPaginatedListSpec {
        error_message: "Error fetching product_stock_changes",
        missing_ws_id_message: MISSING_WS_ID_MESSAGE,
        path: PACKAGE_STOCK_CHANGES_PATH,
        select: "*, workspace_products!product_id!inner(ws_id)",
        table: "product_stock_changes",
        workspace_filter_column: "workspace_products.ws_id",
    },
    CallerTokenPaginatedListSpec {
        error_message: "Error fetching user_feedbacks",
        missing_ws_id_message: MISSING_WS_ID_MESSAGE,
        path: STUDENT_FEEDBACKS_PATH,
        select: "*, workspace_users!user_feedbacks_user_id_fkey!inner(ws_id)",
        table: "user_feedbacks",
        workspace_filter_column: "workspace_users.ws_id",
    },
];

pub(crate) async fn handle_related_export_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    for spec in RELATED_EXPORT_SPECS {
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
    fn related_export_specs_preserve_legacy_route_contracts() {
        let expected = [
            (
                BILL_COUPONS_PATH,
                "finance_invoice_promotions",
                "*, finance_invoices!inner(ws_id)",
                "finance_invoices.ws_id",
                "Error fetching finance_invoice_promotions",
            ),
            (
                BILL_PACKAGES_PATH,
                "finance_invoice_products",
                "*, finance_invoices!inner(ws_id)",
                "finance_invoices.ws_id",
                "Error fetching finance_invoice_products",
            ),
            (
                CLASS_PACKAGES_PATH,
                "user_group_linked_products",
                "*, workspace_user_groups!inner(ws_id)",
                "workspace_user_groups.ws_id",
                "Error fetching user_group_linked_products",
            ),
            (
                CLASS_SCORES_PATH,
                "user_indicators",
                "*, workspace_users!user_indicators_user_id_fkey!inner(ws_id)",
                "workspace_users.ws_id",
                "Error fetching user_indicators",
            ),
            (
                PACKAGE_STOCK_CHANGES_PATH,
                "product_stock_changes",
                "*, workspace_products!product_id!inner(ws_id)",
                "workspace_products.ws_id",
                "Error fetching product_stock_changes",
            ),
            (
                STUDENT_FEEDBACKS_PATH,
                "user_feedbacks",
                "*, workspace_users!user_feedbacks_user_id_fkey!inner(ws_id)",
                "workspace_users.ws_id",
                "Error fetching user_feedbacks",
            ),
        ];

        for (index, (path, table, select, workspace_filter_column, error_message)) in
            expected.iter().enumerate()
        {
            let spec = RELATED_EXPORT_SPECS[index];
            assert_eq!(spec.path, *path);
            assert_eq!(spec.table, *table);
            assert_eq!(spec.select, *select);
            assert_eq!(spec.workspace_filter_column, *workspace_filter_column);
            assert_eq!(spec.error_message, *error_message);
            assert_eq!(spec.missing_ws_id_message, MISSING_WS_ID_MESSAGE);
        }
    }
}
