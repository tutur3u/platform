use super::*;

#[test]
fn path_guard_extracts_ws_id() {
    assert_eq!(
        inventory_products_ws_id("/api/v1/workspaces/ws-123/inventory/products"),
        Some("ws-123")
    );
    assert_eq!(
        inventory_products_ws_id("/api/v1/workspaces/personal/inventory/products"),
        Some("personal")
    );
    assert_eq!(
        inventory_products_ws_id(
            "/api/v1/workspaces/00000000-0000-0000-0000-000000000000/inventory/products"
        ),
        Some("00000000-0000-0000-0000-000000000000")
    );
}

#[test]
fn path_guard_rejects_non_matching() {
    // Empty ws_id.
    assert_eq!(
        inventory_products_ws_id("/api/v1/workspaces//inventory/products"),
        None
    );
    // Missing v1.
    assert_eq!(
        inventory_products_ws_id("/api/workspaces/ws-1/inventory/products"),
        None
    );
    // Different suffix.
    assert_eq!(
        inventory_products_ws_id("/api/v1/workspaces/ws-1/inventory/categories"),
        None
    );
    // Nested id after the collection route.
    assert_eq!(
        inventory_products_ws_id("/api/v1/workspaces/ws-1/inventory/products/abc"),
        None
    );
}

#[test]
fn query_defaults_are_applied() {
    let q = parse_products_query(Some("https://x.test/")).expect("defaults");
    assert_eq!(q.q, "");
    assert_eq!(q.page, DEFAULT_PAGE);
    assert_eq!(q.page_size, DEFAULT_PAGE_SIZE);
    assert_eq!(q.sort_by, DEFAULT_SORT_BY);
    assert_eq!(q.sort_order, DEFAULT_SORT_ORDER);
    assert_eq!(q.status, DEFAULT_STATUS);
    assert!(q.category_id.is_none());
    assert!(q.manufacturer_id.is_none());
}

#[test]
fn query_parses_valid_params() {
    let q = parse_products_query(Some(
        "https://x.test/?q=widget&page=2&pageSize=25&sortBy=name&sortOrder=asc&status=archived",
    ))
    .expect("valid");
    assert_eq!(q.q, "widget");
    assert_eq!(q.page, 2);
    assert_eq!(q.page_size, 25);
    assert_eq!(q.sort_by, "name");
    assert_eq!(q.sort_order, "asc");
    assert_eq!(q.status, "archived");
}

#[test]
fn query_rejects_invalid_params() {
    // Invalid sortBy.
    assert!(parse_products_query(Some("https://x.test/?sortBy=invalid")).is_err());
    // Invalid sortOrder.
    assert!(parse_products_query(Some("https://x.test/?sortOrder=random")).is_err());
    // Invalid status.
    assert!(parse_products_query(Some("https://x.test/?status=unknown")).is_err());
    // Non-integer page.
    assert!(parse_products_query(Some("https://x.test/?page=abc")).is_err());
    // pageSize above max.
    assert!(parse_products_query(Some("https://x.test/?pageSize=1001")).is_err());
    // page below min.
    assert!(parse_products_query(Some("https://x.test/?page=0")).is_err());
}

#[test]
fn is_uuid_accepts_valid_uuids() {
    assert!(is_uuid("00000000-0000-0000-0000-000000000000"));
    assert!(is_uuid("550e8400-e29b-41d4-a716-446655440000"));
}

#[test]
fn is_uuid_rejects_invalid() {
    assert!(!is_uuid("not-a-uuid"));
    assert!(!is_uuid(""));
    assert!(!is_uuid("550e8400-e29b-41d4-a716-44665544000"));
}

#[test]
fn select_primary_inventory_picks_lexicographic_minimum() {
    let inv_a: Value = json!({
        "warehouse_id": "b",
        "unit_id": "x",
        "created_at": "2024-01-01"
    });
    let inv_b: Value = json!({
        "warehouse_id": "a",
        "unit_id": "z",
        "created_at": "2025-01-01"
    });
    let inventories = vec![inv_a, inv_b];
    let primary = select_primary_inventory(&inventories).expect("primary");
    assert_eq!(
        primary.get("warehouse_id").and_then(Value::as_str),
        Some("a")
    );
}

#[test]
fn select_primary_inventory_empty_returns_none() {
    assert!(select_primary_inventory(&[]).is_none());
}
