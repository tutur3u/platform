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
    assert_bounded_view_request(&outbound, 1);
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
    assert_bounded_view_request(&outbound, 2);
}

#[tokio::test]
async fn verified_unmarked_legacy_rpc_allows_bounded_ordinary_list() {
    for code in ["PGRST205", "42P01"] {
        let outbound = ViewClient::with_json(vec![
            (404, json!({ "code": code })),
            (
                200,
                json!({ "warehouses": [{ "id":"ordinary", "name":"Main", "ws_id":"workspace" }] }),
            ),
            (200, json!([{ "id": "ordinary" }])),
            (200, json!({ "warehouses": [] })),
        ]);
        let params = QueryParams {
            q: "Main".to_owned(),
            page: 2,
            page_size: 1,
        };
        let (rows, count) = fetch_warehouses(&config(), &outbound, "workspace", &params, true)
            .await
            .unwrap();
        assert_eq!(rows[0]["id"], "ordinary");
        assert_eq!(count, 4);
        crate::workspaces_product_warehouses::list_test_support::assert_legacy_request(&outbound);
    }
}

#[tokio::test]
async fn partial_ready_and_malformed_baselines_never_expose_aliases() {
    for baseline in [
        json!({ "warehouses": [], "inventoryMergeSchema": "partial" }),
        json!({ "warehouses": [], "inventoryMergeSchema": "ready" }),
        json!({ "warehouses": [], "inventoryMergeSchema": null }),
        json!({ "warehouses": [{}] }),
        json!({ "warehouses": [{ "id":"alias", "name":"Main", "ws_id":"other" }] }),
        json!({}),
    ] {
        let outbound =
            ViewClient::with_json(vec![(404, json!({ "code": "PGRST205" })), (200, baseline)]);
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
        assert_bounded_view_request(&outbound, 2);
    }
}

#[tokio::test]
async fn actual_view_errors_never_trigger_legacy_fallback() {
    let outbound = ViewClient::with_json(vec![(500, json!({ "code": "42501" }))]);
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
    assert_bounded_view_request(&outbound, 1);
}

#[tokio::test]
async fn migration_during_legacy_read_discards_potential_alias_rows() {
    let outbound = ViewClient::with_json(vec![
        (404, json!({ "code": "PGRST205" })),
        (200, json!({ "warehouses": [] })),
        (200, json!([{ "id": "now-merged-source" }])),
        (
            200,
            json!({ "warehouses": [], "inventoryMergeSchema": "ready" }),
        ),
    ]);
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
    assert_bounded_view_request(&outbound, 4);
}
