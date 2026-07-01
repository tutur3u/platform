use super::*;

// ---------------------------------------------------------------------------
// GET implementation
// ---------------------------------------------------------------------------

pub(super) async fn inventory_products_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !config.contact_data.configured() {
        return msg_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE);
    }

    // --- authorizeInventoryWorkspace -----------------------------------------
    let Some(user) = authenticated_user(config, request, outbound).await else {
        return err_response(401, UNAUTHORIZED_MESSAGE);
    };

    let resolved_ws_id =
        match normalize_workspace_id(&config.contact_data, outbound, raw_ws_id, &user).await {
            Ok(Some(ws_id)) => ws_id,
            Ok(None) | Err(()) => return err_response(404, NOT_FOUND_MESSAGE),
        };

    match member_check(&config.contact_data, outbound, &resolved_ws_id, &user).await {
        Ok(MembershipCheck::Member) => {}
        Ok(MembershipCheck::NotMember) => return msg_response(403, FORBIDDEN_MESSAGE),
        Err(()) => return msg_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    let permissions =
        match effective_permissions(&config.contact_data, outbound, &resolved_ws_id, &user).await {
            Ok(Some(p)) => p,
            Ok(None) | Err(()) => return err_response(404, NOT_FOUND_MESSAGE),
        };

    // --- Parse query parameters ----------------------------------------------
    let query = match parse_products_query(request.url) {
        Ok(q) => q,
        Err(()) => return msg_response(400, INVALID_QUERY_MESSAGE),
    };

    // --- Permission gates ----------------------------------------------------
    let can_view_inventory = permissions.has_all_permissions
        || permissions
            .permissions
            .iter()
            .any(|p| VIEW_INVENTORY_PERMISSIONS.contains(&p.as_str()));

    if !can_view_inventory {
        // Legacy returns `{ message: "Unauthorized" }` (not "Forbidden") here.
        return msg_response(403, UNAUTHORIZED_MESSAGE);
    }

    let can_view_stock = permissions.has_all_permissions
        || permissions
            .permissions
            .iter()
            .any(|p| VIEW_STOCK_PERMISSIONS.contains(&p.as_str()));

    // --- Fetch data via RPC --------------------------------------------------
    let offset = (query.page - 1) * query.page_size;
    let rows = match fetch_rpc_products(
        &config.contact_data,
        outbound,
        &resolved_ws_id,
        &query,
        can_view_stock,
        query.page_size,
        offset,
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return msg_response(500, LOAD_FAILED_MESSAGE),
    };

    let count = rows.first().and_then(|r| r.total_count).unwrap_or(0);
    let products: Vec<Value> = rows
        .into_iter()
        .filter_map(|r| r.product)
        .filter(|p| !p.is_null())
        .collect();

    // --- Fetch avatar_url for each product id --------------------------------
    let product_ids: Vec<&str> = products
        .iter()
        .filter_map(|p| p.get("id").and_then(Value::as_str))
        .collect();

    let avatar_map = fetch_avatar_urls(
        &config.contact_data,
        outbound,
        &resolved_ws_id,
        &product_ids,
    )
    .await;

    // --- Map products to response shape --------------------------------------
    let data: Vec<Value> = products
        .iter()
        .map(|item| map_product(item, can_view_stock, &avatar_map))
        .collect();

    no_store_response(json_response(200, json!({ "data": data, "count": count })))
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

pub(super) fn msg_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

pub(super) fn err_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
