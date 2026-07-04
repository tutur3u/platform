//! Port of the legacy Next.js route
//! `apps/web/src/app/api/v1/workspaces/[wsId]/inventory/sales/[saleId]/route.ts`.
//!
//! GET /api/v1/workspaces/:wsId/inventory/sales/:saleId
//!
//! Returns a single inventory sale detail by calling the private-schema
//! `get_inventory_sale` RPC (`p_ws_id`, `p_sale_id`) with the service-role key,
//! then applying `normalizeSaleDetail`-equivalent Rust logic before returning
//! `{ "data": <normalized> }`.
//!
//! Auth mirrors `authorizeInventoryWorkspace` + `canViewInventorySales`:
//!
//! - resolve session auth (Supabase access token from bearer/cookie),
//! - normalize workspace id (`personal` / `internal` aliases + handle lookup),
//! - verify workspace membership,
//! - require ANY of `view_inventory_sales` or `view_invoices` (mirrors
//!   `canViewInventorySales` in `apps/web/src/lib/inventory/permissions.ts`).
//!
//! We reuse the shared `authorize_workspace_permission` helper (one call per
//! candidate permission, granting access on the first match), exactly like the
//! sibling `workspaces_wsid_inventory_*` ports.
//!
//! Status codes:
//!
//! - missing/invalid session                      -> 401 `{ "message": "Unauthorized" }`
//! - unresolved workspace / non-member            -> 404 `{ "error": "Not found" }`
//! - member lacking view-sales permission         -> 403 `{ "message": "Forbidden" }`
//! - RPC returns null / empty                     -> 404 `{ "message": "Sale not found" }`
//! - upstream / configuration failure             -> 500
//!   `{ "message": "Failed to fetch inventory sale detail" }`
//!
//! Only GET is migrated. PUT and DELETE return `None` so the Cloudflare worker
//! falls through to the still-active Next.js route for those methods.
//!
//! KNOWN GAP: the legacy `authorizeInventoryWorkspace` accepted app-session
//! bearer tokens (target: `inventory`). The shared
//! `authorize_workspace_permission` helper currently resolves only Supabase
//! user bearer tokens (cookie / `Authorization: Bearer <access_token>`). This
//! means app-session tokens will receive a 401 from this handler and will fall
//! through to Next.js (which handles them correctly). Browser-session and
//! direct user-bearer auth behave identically to the legacy route.
//!
//! KNOWN GAP: `normalizeSaleDetail` in the legacy route accesses the nested
//! relation fields (`wallet`, `category`, `customer`, `creator`,
//! `platform_creator`, `linked_transaction`, `finance_invoice_products`) which
//! the supabase-js client can return as either an array or a single object. The
//! Rust implementation handles both forms via
//! `first_from_array_or_object_field`. If the RPC already returns pre-flattened
//! scalar fields (no nested arrays), those paths still work correctly since a
//! plain `Value::Object` fallback is used.

use serde::Serialize;
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_INFIX: &str = "/inventory/sales/";

const INVENTORY_SALE_RPC: &str = "get_inventory_sale";
const PRIVATE_SCHEMA: &str = "private";

const FORBIDDEN_MESSAGE: &str = "Forbidden";
const NOT_FOUND_MESSAGE: &str = "Not found";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const SALE_NOT_FOUND_MESSAGE: &str = "Sale not found";
const LOAD_FAILED_MESSAGE: &str = "Failed to fetch inventory sale detail";

// Mirrors `canViewInventorySales` in apps/web/src/lib/inventory/permissions.ts:
// access is granted when the caller holds ANY of these permissions. Workspace
// creators / admins are covered by `has_all_permissions` inside
// `authorize_workspace_permission`.
const VIEW_INVENTORY_SALES_PERMISSIONS: [&str; 2] = ["view_inventory_sales", "view_invoices"];

#[derive(Serialize)]
struct GetInventorySaleRequest<'a> {
    p_sale_id: &'a str,
    p_ws_id: &'a str,
}

pub(crate) async fn handle_workspaces_wsid_inventory_sales_saleid_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (raw_ws_id, sale_id) = sale_path_segments(request.path)?;

    Some(match request.method {
        "GET" => sale_detail_response(config, request, raw_ws_id, sale_id, outbound).await,
        // PUT and DELETE are not migrated; fall through to Next.js.
        _ => return None,
    })
}

async fn sale_detail_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    sale_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let ws_id =
        match authorize_view_inventory_sales(&config.contact_data, request, raw_ws_id, outbound)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(response) => return response,
        };

    match fetch_inventory_sale(&config.contact_data, outbound, &ws_id, sale_id).await {
        Ok(Some(normalized)) => {
            no_store_response(json_response(200, json!({ "data": normalized })))
        }
        Ok(None) => no_store_response(json_response(
            404,
            json!({ "message": SALE_NOT_FOUND_MESSAGE }),
        )),
        Err(()) => no_store_response(json_response(
            500,
            json!({ "message": LOAD_FAILED_MESSAGE }),
        )),
    }
}

/// Authorizes the caller for the workspace for viewing inventory sales.
/// Returns the resolved workspace id on success, or a ready-to-send error
/// response on failure.
///
/// Mirrors `authorizeInventoryWorkspace` + `canViewInventorySales`:
/// tries each permission in `VIEW_INVENTORY_SALES_PERMISSIONS` and grants
/// access on the first match. A `Forbidden` error from one candidate permission
/// does not deny access; we continue checking the remaining permissions.
async fn authorize_view_inventory_sales(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<String, BackendResponse> {
    for permission in VIEW_INVENTORY_SALES_PERMISSIONS {
        match authorize_workspace_permission(contact_data, request, raw_ws_id, permission, outbound)
            .await
        {
            Ok(authorization) => return Ok(authorization.ws_id),
            Err(WorkspacePermissionAuthorizationError::Forbidden) => {
                // This permission is not held; try the next one.
            }
            Err(error) => return Err(auth_error_response(error)),
        }
    }

    Err(no_store_response(json_response(
        403,
        json!({ "message": FORBIDDEN_MESSAGE }),
    )))
}

/// Calls the private-schema `get_inventory_sale` RPC and normalizes the result.
///
/// Mirrors `getInventorySale` from
/// `apps/web/src/lib/inventory/sales-rpc.ts` followed by `normalizeSaleDetail`
/// from the route handler.
async fn fetch_inventory_sale(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    sale_id: &str,
) -> Result<Option<Value>, ()> {
    let url = contact_data.rpc_url(INVENTORY_SALE_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let _body = serde_json::to_string(&GetInventorySaleRequest {
        p_sale_id: sale_id,
        p_ws_id: ws_id,
    })
    .map_err(|_| ())?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // The RPC returns the sale row directly (not wrapped in an array).
    let raw = response.json::<Value>().map_err(|_| ())?;

    if raw.is_null() {
        return Ok(None);
    }

    Ok(Some(normalize_sale_detail(&raw)))
}

/// Mirrors `normalizeSaleDetail` from the legacy route:
///
/// - Flattens array-or-object embedded relations (wallet, category, customer,
///   creator, platform_creator, linked_transaction, finance_invoice_products).
/// - Computes derived scalar fields (`wallet_name`, `category_name`,
///   `customer_name`, `creator_name`, `transaction_missing`).
/// - Maps `finance_invoice_products` into a `lines` array with a summary
///   (`items_count`, `total_quantity`, `owners`).
fn normalize_sale_detail(data: &Value) -> Value {
    let wallet = first_from_array_or_object_field(data, "wallet");
    let category = first_from_array_or_object_field(data, "category");
    let customer = first_from_array_or_object_field(data, "customer");
    let creator = first_from_array_or_object_field(data, "creator");
    let platform_creator = first_from_array_or_object_field(data, "platform_creator");
    let linked_transaction = first_from_array_or_object_field(data, "linked_transaction");

    let lines: Vec<Value> = match data.get("finance_invoice_products") {
        Some(Value::Array(arr)) => arr.clone(),
        _ => Vec::new(),
    };

    let wallet_name = wallet
        .as_ref()
        .and_then(|v| v.get("name"))
        .and_then(Value::as_str)
        .map(|s| Value::String(s.to_owned()))
        .unwrap_or(Value::Null);

    let category_name = category
        .as_ref()
        .and_then(|v| v.get("name"))
        .and_then(Value::as_str)
        .map(|s| Value::String(s.to_owned()))
        .unwrap_or(Value::Null);

    // `customer_name: customer?.full_name ?? customer?.display_name ?? null`
    let customer_name = customer
        .as_ref()
        .and_then(|v| {
            v.get("full_name")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .or_else(|| {
                    v.get("display_name")
                        .and_then(Value::as_str)
                        .filter(|s| !s.is_empty())
                })
        })
        .map(|s| Value::String(s.to_owned()))
        .unwrap_or(Value::Null);

    // `creator_name: creator?.full_name ?? creator?.display_name ?? platformCreator?.display_name ?? null`
    let creator_name = creator
        .as_ref()
        .and_then(|v| {
            v.get("full_name")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .or_else(|| {
                    v.get("display_name")
                        .and_then(Value::as_str)
                        .filter(|s| !s.is_empty())
                })
        })
        .or_else(|| {
            platform_creator
                .as_ref()
                .and_then(|v| v.get("display_name").and_then(Value::as_str))
                .filter(|s| !s.is_empty())
        })
        .map(|s| Value::String(s.to_owned()))
        .unwrap_or(Value::Null);

    // `transaction_missing: Boolean(transaction_id) && !linkedTransaction?.id`
    let transaction_id = data.get("transaction_id").cloned().unwrap_or(Value::Null);
    let transaction_id_present = !transaction_id.is_null()
        && transaction_id
            .as_str()
            .map(|s| !s.is_empty())
            .unwrap_or(true);
    let linked_transaction_id_missing = linked_transaction
        .as_ref()
        .and_then(|v| v.get("id"))
        .map(|id| id.is_null())
        .unwrap_or(true);
    let transaction_missing = transaction_id_present && linked_transaction_id_missing;

    // `customer_id: data.customer_id ?? null`
    let customer_id = data.get("customer_id").cloned().unwrap_or(Value::Null);

    // items_count and total_quantity
    let items_count = lines.len() as i64;
    let total_quantity: f64 = lines
        .iter()
        .map(|line| {
            line.get("amount")
                .and_then(|v| match v {
                    Value::Number(n) => n.as_f64(),
                    Value::String(s) => s.trim().parse::<f64>().ok(),
                    _ => None,
                })
                .unwrap_or(0.0)
        })
        .sum();

    // `owners: [...new Set(lines.map(line => line.owner_name ?? 'Unassigned'))]`
    let mut owners: Vec<String> = Vec::new();
    for line in &lines {
        let owner_name = line
            .get("owner_name")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .unwrap_or("Unassigned")
            .to_owned();
        if !owners.contains(&owner_name) {
            owners.push(owner_name);
        }
    }
    let owners_json: Vec<Value> = owners.into_iter().map(Value::String).collect();

    // Map lines: `lines.map(line => ({ ... }))`
    let lines_json: Vec<Value> = lines
        .iter()
        .map(|line| {
            let product_id = line
                .get("product_id")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned();
            let product_name = line
                .get("product_name")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned();
            let owner_id = line.get("owner_id").cloned().unwrap_or(Value::Null);
            let owner_name = line
                .get("owner_name")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned();
            let unit_id = line
                .get("unit_id")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned();
            let unit_name = line
                .get("product_unit")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned();
            let warehouse_id = line
                .get("warehouse_id")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned();
            let warehouse_name = line
                .get("warehouse")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned();
            let quantity = line
                .get("amount")
                .and_then(|v| match v {
                    Value::Number(n) => n.as_f64(),
                    Value::String(s) => s.trim().parse::<f64>().ok(),
                    _ => None,
                })
                .unwrap_or(0.0);
            let price = line
                .get("price")
                .and_then(|v| match v {
                    Value::Number(n) => n.as_f64(),
                    Value::String(s) => s.trim().parse::<f64>().ok(),
                    _ => None,
                })
                .unwrap_or(0.0);

            json!({
                "product_id": product_id,
                "product_name": product_name,
                "owner_id": owner_id,
                "owner_name": owner_name,
                "unit_id": unit_id,
                "unit_name": unit_name,
                "warehouse_id": warehouse_id,
                "warehouse_name": warehouse_name,
                "quantity": quantity,
                "price": price,
            })
        })
        .collect();

    let mut result = Map::new();
    result.insert(
        "id".to_owned(),
        data.get("id").cloned().unwrap_or(Value::Null),
    );
    result.insert(
        "notice".to_owned(),
        data.get("notice").cloned().unwrap_or(Value::Null),
    );
    result.insert(
        "note".to_owned(),
        data.get("note").cloned().unwrap_or(Value::Null),
    );
    result.insert(
        "paid_amount".to_owned(),
        data.get("paid_amount").cloned().unwrap_or(json!(0)),
    );
    result.insert(
        "created_at".to_owned(),
        data.get("created_at").cloned().unwrap_or(Value::Null),
    );
    result.insert(
        "completed_at".to_owned(),
        data.get("completed_at").cloned().unwrap_or(Value::Null),
    );
    result.insert(
        "wallet_id".to_owned(),
        data.get("wallet_id").cloned().unwrap_or(Value::Null),
    );
    result.insert("wallet_name".to_owned(), wallet_name);
    result.insert(
        "category_id".to_owned(),
        data.get("category_id").cloned().unwrap_or(Value::Null),
    );
    result.insert("category_name".to_owned(), category_name);
    result.insert("transaction_id".to_owned(), transaction_id);
    result.insert(
        "transaction_missing".to_owned(),
        Value::Bool(transaction_missing),
    );
    result.insert("customer_id".to_owned(), customer_id);
    result.insert("customer_name".to_owned(), customer_name);
    result.insert("creator_name".to_owned(), creator_name);
    result.insert("items_count".to_owned(), json!(items_count));
    result.insert("total_quantity".to_owned(), json!(total_quantity));
    result.insert("owners".to_owned(), Value::Array(owners_json));
    result.insert(
        "source".to_owned(),
        Value::String("finance_invoice".to_owned()),
    );
    result.insert("lines".to_owned(), Value::Array(lines_json));

    Value::Object(result)
}

/// Extracts the first element from a field that may be either a JSON array or a
/// JSON object (matching supabase-js embedded-relation behavior).
///
/// Mirrors the TypeScript pattern:
/// `Array.isArray(data.field) ? data.field[0] : data.field`
fn first_from_array_or_object_field<'a>(data: &'a Value, field: &str) -> Option<&'a Value> {
    match data.get(field)? {
        Value::Array(arr) => arr.first(),
        other if !other.is_null() => Some(other),
        _ => None,
    }
}

/// Extracts `(:wsId, :saleId)` from
/// `/api/v1/workspaces/:wsId/inventory/sales/:saleId`.
///
/// Returns `None` for any path that doesn't match exactly (wrong prefix, empty
/// segments, extra slashes), so unrelated routes fall through.
fn sale_path_segments(path: &str) -> Option<(&str, &str)> {
    let path = path.split('?').next().unwrap_or(path);
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let (ws_id, after_ws) = rest.split_once(PATH_INFIX)?;
    // saleId is the remaining segment - no further slashes allowed.
    let sale_id = after_ws;

    if ws_id.is_empty() || ws_id.contains('/') || sale_id.is_empty() || sale_id.contains('/') {
        return None;
    }

    Some((ws_id, sale_id))
}

fn auth_error_response(error: WorkspacePermissionAuthorizationError) -> BackendResponse {
    match error {
        WorkspacePermissionAuthorizationError::Unauthorized => no_store_response(json_response(
            401,
            json!({ "message": UNAUTHORIZED_MESSAGE }),
        )),
        WorkspacePermissionAuthorizationError::NotFound => {
            no_store_response(json_response(404, json!({ "error": NOT_FOUND_MESSAGE })))
        }
        WorkspacePermissionAuthorizationError::Forbidden => {
            no_store_response(json_response(403, json!({ "message": FORBIDDEN_MESSAGE })))
        }
        WorkspacePermissionAuthorizationError::Internal => no_store_response(json_response(
            500,
            json!({ "message": MEMBERSHIP_LOOKUP_FAILED_MESSAGE }),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const WS: &str = "11111111-1111-4111-8111-111111111111";
    const SALE: &str = "22222222-2222-4222-8222-222222222222";

    fn make_path(ws: &str, sale: &str) -> String {
        format!("/api/v1/workspaces/{ws}/inventory/sales/{sale}")
    }

    // --- path guard / segment extraction ------------------------------------

    #[test]
    fn path_matches_valid_route() {
        let path = make_path(WS, SALE);
        let result = sale_path_segments(&path);
        assert_eq!(result, Some((WS, SALE)));
    }

    #[test]
    fn path_with_query_string_still_matches() {
        let path = format!("{}?foo=bar", make_path(WS, SALE));
        let result = sale_path_segments(&path);
        assert_eq!(result, Some((WS, SALE)));
    }

    #[test]
    fn path_rejects_missing_sale_id() {
        // Trailing slash but empty sale id segment.
        let path = format!("/api/v1/workspaces/{WS}/inventory/sales/");
        assert_eq!(sale_path_segments(&path), None);
    }

    #[test]
    fn path_rejects_extra_slash_after_sale_id() {
        // Extra path segment after the sale id must be rejected.
        let path = format!("/api/v1/workspaces/{WS}/inventory/sales/{SALE}/extra");
        assert_eq!(sale_path_segments(&path), None);
    }

    #[test]
    fn path_rejects_wrong_prefix() {
        let path = format!("/api/workspaces/{WS}/inventory/sales/{SALE}");
        assert_eq!(sale_path_segments(&path), None);
    }

    #[test]
    fn path_rejects_wrong_infix() {
        let path = format!("/api/v1/workspaces/{WS}/inventory/batches/{SALE}");
        assert_eq!(sale_path_segments(&path), None);
    }

    #[test]
    fn path_rejects_empty_ws_id() {
        let path = format!("/api/v1/workspaces//inventory/sales/{SALE}");
        assert_eq!(sale_path_segments(&path), None);
    }

    #[test]
    fn path_rejects_short_path_without_panic() {
        assert_eq!(sale_path_segments("/api/v1"), None);
        assert_eq!(sale_path_segments(""), None);
    }

    // --- relation field extraction -------------------------------------------

    #[test]
    fn first_from_array_field_returns_first_element() {
        let data = json!({ "wallet": [{ "name": "Main" }, { "name": "Other" }] });
        let result = first_from_array_or_object_field(&data, "wallet");
        assert_eq!(result, Some(&json!({ "name": "Main" })));
    }

    #[test]
    fn first_from_object_field_returns_the_object() {
        let data = json!({ "wallet": { "name": "Main" } });
        let result = first_from_array_or_object_field(&data, "wallet");
        assert_eq!(result, Some(&json!({ "name": "Main" })));
    }

    #[test]
    fn first_from_null_field_returns_none() {
        let data = json!({ "wallet": null });
        assert_eq!(first_from_array_or_object_field(&data, "wallet"), None);
    }

    #[test]
    fn first_from_missing_field_returns_none() {
        let data = json!({});
        assert_eq!(first_from_array_or_object_field(&data, "wallet"), None);
    }

    // --- normalizeSaleDetail ------------------------------------------------

    #[test]
    fn normalize_sets_source_and_flattens_relations() {
        let data = json!({
            "id": "sale-1",
            "notice": "test notice",
            "note": null,
            "paid_amount": 100,
            "created_at": "2024-01-01T00:00:00Z",
            "completed_at": null,
            "wallet_id": "wallet-1",
            "wallet": [{ "name": "Main Wallet" }],
            "category_id": "cat-1",
            "category": { "name": "Electronics" },
            "transaction_id": null,
            "customer_id": "cust-1",
            "customer": [{ "full_name": "Alice", "display_name": "alice" }],
            "creator": { "full_name": null, "display_name": "bob" },
            "platform_creator": null,
            "linked_transaction": null,
            "finance_invoice_products": []
        });

        let result = normalize_sale_detail(&data);

        assert_eq!(result["id"], "sale-1");
        assert_eq!(result["wallet_name"], "Main Wallet");
        assert_eq!(result["category_name"], "Electronics");
        assert_eq!(result["customer_name"], "Alice");
        assert_eq!(result["creator_name"], "bob");
        assert_eq!(result["transaction_missing"], false);
        assert_eq!(result["source"], "finance_invoice");
        assert_eq!(result["items_count"], 0);
        assert_eq!(result["total_quantity"], 0.0);
        assert!(result["lines"].as_array().unwrap().is_empty());
    }

    #[test]
    fn normalize_computes_transaction_missing_flag() {
        let data = json!({
            "id": "sale-2",
            "transaction_id": "txn-1",
            "linked_transaction": [{ "id": null, "taken_at": null }],
            "finance_invoice_products": []
        });
        let result = normalize_sale_detail(&data);
        // transaction_id is set but linked_transaction[0].id is null => missing.
        assert_eq!(result["transaction_missing"], true);
    }

    #[test]
    fn normalize_computes_transaction_not_missing_when_linked() {
        let data = json!({
            "id": "sale-3",
            "transaction_id": "txn-1",
            "linked_transaction": { "id": "txn-1", "taken_at": "2024-01-01T00:00:00Z" },
            "finance_invoice_products": []
        });
        let result = normalize_sale_detail(&data);
        assert_eq!(result["transaction_missing"], false);
    }

    #[test]
    fn normalize_builds_lines_and_owners() {
        let data = json!({
            "id": "sale-4",
            "transaction_id": null,
            "finance_invoice_products": [
                {
                    "product_id": "p-1",
                    "product_name": "Widget",
                    "owner_id": "o-1",
                    "owner_name": "Alice",
                    "unit_id": "u-1",
                    "product_unit": "pcs",
                    "warehouse_id": "w-1",
                    "warehouse": "Main",
                    "amount": 3,
                    "price": 50
                },
                {
                    "product_id": "p-2",
                    "product_name": "Gadget",
                    "owner_id": null,
                    "owner_name": "",
                    "unit_id": "u-2",
                    "product_unit": "box",
                    "warehouse_id": "w-1",
                    "warehouse": "Main",
                    "amount": 2,
                    "price": 100
                }
            ]
        });

        let result = normalize_sale_detail(&data);
        assert_eq!(result["items_count"], 2);
        assert_eq!(result["total_quantity"], 5.0);

        let owners = result["owners"].as_array().unwrap();
        assert_eq!(owners.len(), 2);
        assert_eq!(owners[0], "Alice");
        assert_eq!(owners[1], "Unassigned");

        let lines = result["lines"].as_array().unwrap();
        assert_eq!(lines[0]["product_name"], "Widget");
        assert_eq!(lines[0]["unit_name"], "pcs");
        assert_eq!(lines[0]["warehouse_name"], "Main");
        assert_eq!(lines[0]["quantity"], 3.0);
        assert_eq!(lines[0]["price"], 50.0);
    }
}
