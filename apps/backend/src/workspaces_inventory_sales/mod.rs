use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const FORBIDDEN_MESSAGE: &str = "Forbidden";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const INVENTORY_APP_SESSION_TARGETS: [&str; 1] = ["inventory"];
const INVENTORY_REALTIME_SECRET: &str = "ENABLE_INVENTORY_REALTIME_BROADCAST";
const INVENTORY_SALES_RPC: &str = "get_inventory_sales";
const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const FETCH_FAILED_MESSAGE: &str = "Failed to fetch inventory sales";
const NOT_FOUND_MESSAGE: &str = "Not found";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const PRIVATE_SCHEMA: &str = "private";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const WORKSPACES_INVENTORY_SALES_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_INVENTORY_SALES_PATH_SUFFIX: &str = "/inventory/sales";

const DEFAULT_LIMIT: i64 = 50;
const DEFAULT_OFFSET: i64 = 0;
const MIN_LIMIT: i64 = 1;
const MAX_LIMIT: i64 = 100;
const MIN_OFFSET: i64 = 0;

// Mirrors `canViewInventorySales` in apps/web/src/lib/inventory/permissions.ts:
// access is granted when the caller holds ANY of these permissions. Workspace
// creators / admins are covered by the `has_all_permissions` shortcut.
const VIEW_INVENTORY_SALES_PERMISSIONS: [&str; 2] = ["view_inventory_sales", "view_invoices"];

// `CHECKOUT_HISTORY_SELECT` (subset used by `mapCheckoutSaleSummary`) from
// apps/web/src/lib/inventory/commerce/checkouts.ts.
const CHECKOUT_HISTORY_SELECT: &str = "id,public_token,customer_name,customer_email,note,currency,total_amount,completed_at,created_at,polar_order_id";
const CHECKOUT_LINE_SELECT: &str = "id,checkout_session_id,quantity";

#[derive(Serialize)]
struct WorkspaceInventorySalesResponse {
    count: i64,
    data: Vec<Value>,
    realtime_enabled: bool,
}

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceCreatorRow {
    creator_id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceDefaultPermissionRow {
    permission: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceSecretRow {
    value: Option<String>,
}

// Row returned by the `get_inventory_sales` RPC: `{ sale, total_count }`.
#[derive(Deserialize)]
struct InventorySalesRpcRow {
    sale: Option<Value>,
    total_count: Option<Value>,
}

#[derive(Deserialize)]
struct CheckoutSessionRow {
    id: Option<String>,
    public_token: Option<String>,
    customer_name: Option<String>,
    customer_email: Option<String>,
    note: Option<String>,
    currency: Option<String>,
    total_amount: Option<Value>,
    completed_at: Option<String>,
    created_at: Option<String>,
    polar_order_id: Option<String>,
}

#[derive(Deserialize)]
struct CheckoutLineRow {
    checkout_session_id: Option<String>,
    quantity: Option<Value>,
}

struct AuthenticatedUser {
    access_token: Option<String>,
    id: String,
}

enum DataAuth<'a> {
    AccessToken(&'a str),
    ServiceRole,
}

struct ParsedQuery {
    limit: i64,
    offset: i64,
}

struct SalesPage {
    count: i64,
    data: Vec<Value>,
}

mod http;
mod parse;
mod sales;
mod values;
mod workspace;

use http::*;
use parse::*;
use sales::*;
use values::*;
use workspace::*;

pub(crate) async fn handle_workspaces_inventory_sales_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_inventory_sales_ws_id(request.path)?;

    Some(match request.method {
        "GET" => sales_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn sales_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    let Some(user) = authenticated_user(config, request, outbound).await else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    // `normalizeWorkspaceId` throwing maps to 404 `{ error: "Not found" }`.
    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user).await {
            Ok(Some(ws_id)) => ws_id,
            Ok(None) | Err(()) => return error_response(404, NOT_FOUND_MESSAGE),
        };

    // `verifyWorkspaceMembershipType` (default requiredType = MEMBER).
    let membership_type =
        match workspace_membership_type(contact_data, outbound, &resolved_ws_id, &user).await {
            Ok(membership_type) => membership_type,
            Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
        };
    match membership_type.as_deref() {
        Some("MEMBER") => {}
        _ => return message_response(403, FORBIDDEN_MESSAGE),
    }

    // Mirror `canViewInventorySales` against the resolved permission set. A
    // failure to resolve permissions maps to the legacy `getPermissions` ->
    // null -> 404 `{ error: "Not found" }` path.
    let can_view = match can_view_inventory_sales(
        contact_data,
        outbound,
        &resolved_ws_id,
        &user,
        membership_type.as_deref(),
    )
    .await
    {
        Ok(can_view) => can_view,
        Err(()) => return error_response(404, NOT_FOUND_MESSAGE),
    };
    if !can_view {
        return message_response(403, FORBIDDEN_MESSAGE);
    }

    // Zod `SearchParamsSchema.safeParse` failure -> 400.
    let ParsedQuery { limit, offset } = match parse_query(request.url) {
        Some(parsed) => parsed,
        None => {
            return no_store_response(json_response(
                400,
                json!({ "message": INVALID_QUERY_MESSAGE, "errors": [] }),
            ));
        }
    };

    let window_limit = limit + offset;

    let finance_sales =
        fetch_finance_sales(contact_data, outbound, &resolved_ws_id, window_limit).await;
    let checkout_sales =
        fetch_checkout_sales(contact_data, outbound, &resolved_ws_id, window_limit).await;

    let (finance_sales, checkout_sales) = match (finance_sales, checkout_sales) {
        (Ok(finance_sales), Ok(checkout_sales)) => (finance_sales, checkout_sales),
        _ => return message_response(500, FETCH_FAILED_MESSAGE),
    };

    let realtime_enabled = inventory_realtime_enabled(contact_data, outbound, &resolved_ws_id)
        .await
        .unwrap_or(false);

    let count = finance_sales.count + checkout_sales.count;

    let mut data: Vec<Value> = Vec::new();
    data.extend(finance_sales.data.into_iter().map(normalize_finance_sale));
    data.extend(checkout_sales.data);

    // Sort by `completed_at ?? created_at` descending (most recent first).
    // `sort_by` is stable; the legacy `Array.prototype.sort` is also stable.
    data.sort_by_key(|sale| std::cmp::Reverse(sale_timestamp(sale)));

    // `.slice(offset, offset + limit)`.
    let start = offset.max(0) as usize;
    let end = start.saturating_add(limit.max(0) as usize);
    let data = if start >= data.len() {
        Vec::new()
    } else {
        data[start..end.min(data.len())].to_vec()
    };

    no_store_response(json_response(
        200,
        WorkspaceInventorySalesResponse {
            count,
            data,
            realtime_enabled,
        },
    ))
}
