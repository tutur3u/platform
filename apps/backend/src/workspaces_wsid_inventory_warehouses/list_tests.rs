use super::*;
use crate::workspaces_product_warehouses::list_test_support::{
    ViewClient, assert_bounded_view_request, config,
};

#[tokio::test]
async fn active_view_count_and_pagination_use_one_bounded_request() {
    let outbound = ViewClient::new(200);
    let params = QueryParams {
        q: "Main".to_owned(),
        page: 2,
        page_size: 1,
    };
    let (rows, count) = fetch_warehouses(&config(), &outbound, "workspace", &params, true)
        .await
        .unwrap();
    assert_eq!(count, 4);
    assert_eq!(rows.len(), 1);
    assert_bounded_view_request(&outbound);
}

#[tokio::test]
async fn missing_view_fails_closed_without_fallback_to_alias_sources() {
    let outbound = ViewClient::new(404);
    let params = QueryParams {
        q: String::new(),
        page: 2,
        page_size: 1,
    };
    assert!(
        fetch_warehouses(&config(), &outbound, "workspace", &params, true)
            .await
            .is_err()
    );
    assert_bounded_view_request(&outbound);
}
