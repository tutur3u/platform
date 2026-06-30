//! Handler for `GET /api/v1/workspaces/:wsId/products/:productId/inventory`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/products/[productId]/inventory/route.ts`.
//!
//! Behavior parity with the legacy GET handler:
//!
//!   1. `authorizeInventoryWorkspace` -> resolve/normalize wsId + verify the
//!      caller is a workspace member, then compute effective permissions.
//!      Implemented here via the shared `authorize_workspace_permission` helper,
//!      which normalizes the wsId, verifies membership, and computes effective
//!      permissions in one pass.
//!   2. Check `view_stock_quantity` permission -> 403 `{ message: 'Unauthorized' }`
//!      if absent.
//!   3. Verify the product exists in `workspace_products` (public schema) with
//!      `id = productId` AND `ws_id = resolvedWsId`. Not found or error ->
//!      404 `{ message: 'Product not found' }`.
//!   4. Fetch `private.inventory_products` (service-role REST) filtered by
//!      `product_id = productId`. Error -> 500 `{ message: 'Error fetching inventory' }`.
//!   5. Return 200 `{ data: <inventory rows> }`.
//!
//! Only GET is migrated. The legacy route also defines POST, PATCH, and DELETE,
//! which are NOT migrated; this handler returns `None` for every non-GET method
//! so the Cloudflare worker falls through to the still-active Next.js route.
//!
//! Behavior gaps versus the legacy route:
//!
//!   - The legacy route accepts the `inventory` app-session token (via
//!     `resolveSessionAuthContext` with `allowAppSessionAuth`). The shared
//!     `authorize_workspace_permission` helper only honors Supabase access tokens
//!     (bearer or auth cookie) and ignores app-session tokens, so inventory
//!     app-session callers are not served here and fall through to Next.js.
//!   - The legacy route returns 403 `{ message: 'Forbidden' }` for an
//!     authenticated non-member and 404 when `getPermissions` yields no permission
//!     context. The shared helper collapses both into 404 (a non-member has no
//!     permission context). Matches `workspaces_inventory_owners`.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    path_segments,
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const PRIVATE_SCHEMA: &str = "private";
const VIEW_STOCK_QUANTITY_PERMISSION: &str = "view_stock_quantity";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const NOT_FOUND_MESSAGE: &str = "Product not found";
const FETCH_INVENTORY_ERROR_MESSAGE: &str = "Error fetching inventory";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";

pub(crate) async fn handle_workspaces_wsid_products_productid_inventory_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (raw_ws_id, product_id) = extract_path_params(request.path)?;

    Some(match request.method {
        "GET" => inventory_get_response(config, request, raw_ws_id, product_id, outbound).await,
        _ => return None,
    })
}

async fn inventory_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    product_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Authenticate + authorize with the `view_stock_quantity` permission.
    let ws_id = match authorize_workspace_permission(
        contact_data,
        request,
        raw_ws_id,
        VIEW_STOCK_QUANTITY_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization.ws_id,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return message_response(401, UNAUTHORIZED_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            // Legacy returns 403 `{ message: 'Unauthorized' }` for missing permission.
            return message_response(403, UNAUTHORIZED_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::NotFound) => {
            return message_response(403, UNAUTHORIZED_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE);
        }
    };

    // Verify that the product exists in `workspace_products` (public schema).
    match check_product_exists(contact_data, outbound, &ws_id, product_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(404, NOT_FOUND_MESSAGE),
        Err(()) => return message_response(404, NOT_FOUND_MESSAGE),
    }

    // Fetch the inventory from `private.inventory_products`.
    match fetch_inventory(contact_data, outbound, product_id).await {
        Ok(rows) => no_store_response(json_response(200, json!({ "data": rows }))),
        Err(()) => message_response(500, FETCH_INVENTORY_ERROR_MESSAGE),
    }
}

/// Verifies that a product with the given id exists in `workspace_products`
/// belonging to `ws_id`. Returns `Ok(true)` if found, `Ok(false)` if not
/// found (or the upstream returns a non-success status), `Err(())` on fetch
/// failure. Mirrors `sbAdmin.from('workspace_products').select('id').eq('id',
/// productId).eq('ws_id', wsId).maybeSingle()`.
async fn check_product_exists(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    product_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_products",
        &[
            ("select", "id".to_owned()),
            ("id", format!("eq.{product_id}")),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_public_service_role_get(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    Ok(!rows.is_empty())
}

/// Fetches all rows from `private.inventory_products` for the given
/// `product_id`. Mirrors `sbAdmin.schema('private').from('inventory_products')
/// .select('*').eq('product_id', productId)`.
async fn fetch_inventory(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    product_id: &str,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "inventory_products",
        &[
            ("select", "*".to_owned()),
            ("product_id", format!("eq.{product_id}")),
        ],
    ) else {
        return Err(());
    };

    let response = send_private_service_role_get(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

async fn send_public_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

async fn send_private_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

// --- Path helpers ------------------------------------------------------------

/// Extracts `(ws_id, product_id)` from a path matching
/// `/api/v1/workspaces/:wsId/products/:productId/inventory`.
fn extract_path_params(path: &str) -> Option<(&str, &str)> {
    let segments = path_segments(path);
    match segments.as_slice() {
        [
            "api",
            "v1",
            "workspaces",
            ws_id,
            "products",
            product_id,
            "inventory",
        ] if !ws_id.is_empty() && !product_id.is_empty() => Some((ws_id, product_id)),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_matches_exact_route() {
        assert_eq!(
            extract_path_params("/api/v1/workspaces/ws-abc/products/prod-123/inventory"),
            Some(("ws-abc", "prod-123"))
        );
        assert_eq!(
            extract_path_params(
                "/api/v1/workspaces/00000000-0000-0000-0000-000000000000/products/11111111-1111-1111-1111-111111111111/inventory"
            ),
            Some((
                "00000000-0000-0000-0000-000000000000",
                "11111111-1111-1111-1111-111111111111"
            ))
        );
    }

    #[test]
    fn path_guard_rejects_non_matching_paths() {
        // Wrong leaf.
        assert_eq!(
            extract_path_params("/api/v1/workspaces/ws/products/p/stock"),
            None
        );
        // Extra trailing segment.
        assert_eq!(
            extract_path_params("/api/v1/workspaces/ws/products/p/inventory/extra"),
            None
        );
        // Missing product id segment.
        assert_eq!(
            extract_path_params("/api/v1/workspaces/ws/products/inventory"),
            None
        );
        // Missing v1.
        assert_eq!(
            extract_path_params("/api/workspaces/ws/products/p/inventory"),
            None
        );
        // Short path must not panic.
        assert_eq!(extract_path_params("/api/v1"), None);
        assert_eq!(extract_path_params("/"), None);
        // Empty ws_id.
        assert_eq!(
            extract_path_params("/api/v1/workspaces//products/p/inventory"),
            None
        );
        // Empty product_id.
        assert_eq!(
            extract_path_params("/api/v1/workspaces/ws/products//inventory"),
            None
        );
    }

    #[test]
    fn path_guard_rejects_collection_route() {
        // The products list route should not match.
        assert_eq!(extract_path_params("/api/v1/workspaces/ws/products"), None);
    }
}
