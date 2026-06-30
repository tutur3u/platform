//! Handler for `GET /api/payment/orders/:orderId/invoice`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/payment/orders/[orderId]/invoice/route.ts`.
//!
//! Auth model: the legacy route uses `createClient()` (Supabase RLS with the
//! caller's session cookie) to fetch the order from `workspace_orders`, then
//! checks `has_workspace_permission` for `manage_subscription` using the
//! caller's user ID, and finally calls `polar.orders.invoice({ id:
//! order.polar_order_id })`.
//!
//! Behavior gaps vs. legacy:
//!
//! - **Polar API unavailable.** `POLAR_ACCESS_TOKEN` is not part of
//!   `BackendConfig`, so the Polar `orders.invoice()` call cannot be made
//!   from the Rust worker. After auth and permission checks pass this handler
//!   returns `503 Service Unavailable` instead of the Polar invoice payload.
//!   The POST handler is intentionally not ported; `None` is returned for all
//!   non-GET methods so Next.js continues to handle them.
//! - **401 on missing session.** An anonymous caller receives `401` here,
//!   whereas the legacy route would silently produce `404` (RLS denies the
//!   order fetch and returns an empty result set).
//!
//! Status codes (GET):
//!
//! - no access token present                         -> `401 Unauthorized`
//! - Supabase not configured or upstream error       -> `500 Internal Server Error`
//! - order not found or not visible to caller (RLS)  -> `404 Not Found`
//! - permission RPC fails                            -> `500 Internal Server Error`
//! - caller lacks `manage_subscription` permission   -> `403 Forbidden`
//! - Polar API not available (design gap, see above) -> `503 Service Unavailable`

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const ORDER_INVOICE_PATH_PREFIX: &str = "/api/payment/orders/";
const ORDER_INVOICE_PATH_SUFFIX: &str = "/invoice";
const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";
const MANAGE_SUBSCRIPTION_PERMISSION: &str = "manage_subscription";

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct WorkspaceOrderRow {
    ws_id: String,
    polar_order_id: Option<String>,
}

#[derive(Serialize)]
struct HasWorkspacePermissionRequest<'a> {
    p_permission: &'a str,
    p_user_id: &'a str,
    p_ws_id: &'a str,
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_payment_orders_orderid_invoice_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let order_id = extract_order_id(request.path)?;

    Some(match request.method {
        "GET" => invoice_get_response(config, request, order_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn invoice_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    order_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return error_response(500, "Internal server error");
    }

    // Require a caller access token; mirrors createClient() session in the
    // legacy route.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, "Unauthorized");
    };

    // Resolve caller's user ID for the permission RPC check.
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return error_response(401, "Unauthorized");
    };
    let Some(ref user_id) = user.id else {
        return error_response(401, "Unauthorized");
    };

    // Fetch the order with the caller's token so RLS controls visibility
    // (mirrors `supabase.from('workspace_orders').select('*').eq('id', orderId)` in legacy).
    let order = match fetch_order(contact_data, outbound, order_id, &access_token).await {
        Ok(Some(order)) => order,
        Ok(None) => return error_response(404, "Order not found"),
        Err(()) => return error_response(500, "Internal server error"),
    };

    // Check manage_subscription permission for the order's workspace.
    let has_permission =
        match check_manage_subscription(contact_data, outbound, &order.ws_id, user_id).await {
            Ok(allowed) => allowed,
            Err(()) => {
                return error_response(500, "Error checking manage subscription permission");
            }
        };

    if !has_permission {
        return error_response(403, "Unauthorized: You are not authorized to get invoice");
    }

    // Gap: POLAR_ACCESS_TOKEN is not available in BackendConfig.  The legacy
    // `polar.orders.invoice({ id: order.polar_order_id })` call cannot be
    // completed from the Rust worker.
    let _polar_order_id = order.polar_order_id;
    no_store_response(json_response(
        503,
        json!({
            "error": "Failed to fetch invoice",
            "details": "Polar API integration is not available in this context"
        }),
    ))
}

// ---------------------------------------------------------------------------
// Supabase data helpers
// ---------------------------------------------------------------------------

async fn fetch_order(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    order_id: &str,
    access_token: &str,
) -> Result<Option<WorkspaceOrderRow>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_orders",
            &[
                ("select", "*".to_owned()),
                ("id", format!("eq.{order_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceOrderRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn check_manage_subscription(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let rpc_url = contact_data
        .rpc_url(HAS_WORKSPACE_PERMISSION_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&HasWorkspacePermissionRequest {
        p_permission: MANAGE_SUBSCRIPTION_PERMISSION,
        p_user_id: user_id,
        p_ws_id: ws_id,
    })
    .map_err(|_| ())?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<bool>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/// Extract the order-id segment from paths like
/// `/api/payment/orders/<orderId>/invoice`.
fn extract_order_id(path: &str) -> Option<&str> {
    let order_id = path
        .strip_prefix(ORDER_INVOICE_PATH_PREFIX)?
        .strip_suffix(ORDER_INVOICE_PATH_SUFFIX)?;

    (!order_id.is_empty() && !order_id.contains('/')).then_some(order_id)
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_order_id_valid() {
        assert_eq!(
            extract_order_id("/api/payment/orders/abc-123/invoice"),
            Some("abc-123")
        );
    }

    #[test]
    fn test_extract_order_id_uuid() {
        assert_eq!(
            extract_order_id("/api/payment/orders/00000000-0000-0000-0000-000000000001/invoice"),
            Some("00000000-0000-0000-0000-000000000001")
        );
    }

    #[test]
    fn test_extract_order_id_wrong_prefix() {
        assert!(extract_order_id("/api/v1/payment/orders/abc/invoice").is_none());
        assert!(extract_order_id("/api/payment/orders/abc/other").is_none());
        assert!(extract_order_id("/api/payment/orders//invoice").is_none());
    }

    #[test]
    fn test_extract_order_id_extra_segment() {
        // Must not match paths with extra slash-separated segments.
        assert!(extract_order_id("/api/payment/orders/a/b/invoice").is_none());
    }

    #[test]
    fn test_extract_order_id_no_suffix() {
        assert!(extract_order_id("/api/payment/orders/abc-123").is_none());
    }

    #[test]
    fn test_extract_order_id_unrelated_path() {
        assert!(extract_order_id("/api/billing/abc-123/invoice").is_none());
        assert!(extract_order_id("/api/payment/orders").is_none());
    }
}
