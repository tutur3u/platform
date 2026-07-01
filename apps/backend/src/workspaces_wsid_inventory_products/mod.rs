//! Handler for `GET /api/v1/workspaces/:wsId/inventory/products`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/inventory/products/route.ts`.
//!
//! The legacy GET handler:
//!
//!   1. `authorizeInventoryWorkspace(req, id, { appSessionTargets: ['inventory',
//!      'finance'] })` — resolves the session (Supabase bearer/cookie or inventory/
//!      finance app-session token), normalizes the workspace id, verifies workspace
//!      membership, and loads the caller's effective permissions.
//!      Unauthenticated → 401; workspace not found / null permissions → 404;
//!      not a member → 403; membership-lookup failure → 500.
//!   2. Permission gates:
//!      - `canViewInventory = canViewInventoryCatalog || canCreateInventorySales`.
//!        Failing → 403 `{ message: 'Unauthorized' }`.
//!      - `canViewStockQuantity = canViewInventoryStock || canCreateInventorySales`.
//!        Controls which stock-related fields are returned.
//!   3. Parses `SearchParamsSchema` (`q`, `page`, `pageSize`, `categoryId`,
//!      `manufacturerId`, `sortBy`, `sortOrder`, `status`). Invalid → 400.
//!   4. Calls `private.get_inventory_catalog_products` RPC with service-role key.
//!   5. Fetches `avatar_url` from `workspace_products` for the returned product ids.
//!   6. Maps each RPC row to the documented response shape, gating stock fields on
//!      `canViewStockQuantity`.
//!   7. Returns `{ data, count }` with no-store cache headers.
//!
//! Only GET is migrated. POST returns `None` so the Cloudflare worker falls
//! through to the still-active Next.js route.
//!
//! BEHAVIOR GAPS:
//!
//!   - App-session tokens (`ttr_app_*`) for the `finance` target are accepted here
//!     (we include `"finance"` in `APP_SESSION_TARGETS`). Inventory app-session
//!     tokens are also accepted. Standard Supabase bearer/cookie sessions work as
//!     in every other inventory handler.
//!   - The `canViewInventory` gate returns 403 `{ message: "Unauthorized" }` to
//!     match the legacy route's exact response body (not the usual `"Forbidden"`).
//!   - RLS is not active on the RPC call (service-role key used), matching
//!     `createAdminClient()` in the legacy handler. An explicit `p_ws_id` filter
//!     scopes the result.
//!   - The legacy `normalizeUuid` helper rejects `categoryId`/`manufacturerId`
//!     that do not match the UUID pattern and returns `{ count: 0, data: [] }`.
//!     This port applies the same guard: non-UUID → empty response, not 400.

pub(super) use serde::Deserialize;
pub(super) use serde_json::{Value, json};

pub(super) use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

pub(super) const PATH_PREFIX: &str = "/api/v1/workspaces/";
pub(super) const PATH_SUFFIX: &str = "/inventory/products";
pub(super) const APP_SESSION_TARGETS: [&str; 2] = ["inventory", "finance"];
pub(super) const RPC_NAME: &str = "get_inventory_catalog_products";
pub(super) const PRIVATE_SCHEMA: &str = "private";
pub(super) const ADMIN_PERMISSION: &str = "admin";
pub(super) const INTERNAL_WORKSPACE_SLUG: &str = "internal";
pub(super) const PERSONAL_WORKSPACE_SLUG: &str = "personal";
pub(super) const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

pub(super) const FORBIDDEN_MESSAGE: &str = "Forbidden";
pub(super) const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
pub(super) const NOT_FOUND_MESSAGE: &str = "Not found";
pub(super) const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
pub(super) const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";
pub(super) const LOAD_FAILED_MESSAGE: &str = "Failed to fetch inventory products";

// Mirrors MAX_SEARCH_LENGTH / MAX_MEDIUM_TEXT_LENGTH from @tuturuuu/utils/constants.
pub(super) const MAX_SEARCH_LENGTH: usize = 500;
pub(super) const MAX_PAGE_SIZE: i64 = 1000;
pub(super) const DEFAULT_PAGE: i64 = 1;
pub(super) const DEFAULT_PAGE_SIZE: i64 = 10;
pub(super) const DEFAULT_SORT_BY: &str = "created_at";
pub(super) const DEFAULT_SORT_ORDER: &str = "desc";
pub(super) const DEFAULT_STATUS: &str = "active";

// Union of canViewInventoryCatalog + canCreateInventorySales permission ids
// (apps/web/src/lib/inventory/permissions.ts). The access gate grants access
// when the caller holds ANY of these. admin / has_all_permissions is handled
// separately.
pub(super) const VIEW_INVENTORY_PERMISSIONS: [&str; 8] = [
    "view_inventory_catalog",
    "manage_inventory_catalog",
    "view_inventory",
    "create_inventory",
    "update_inventory",
    "delete_inventory",
    "create_inventory_sales",
    "create_invoices",
];

// Union of canViewInventoryStock + canCreateInventorySales permission ids.
// When the caller holds ANY of these, stock-related fields are included.
pub(super) const VIEW_STOCK_PERMISSIONS: [&str; 6] = [
    "view_inventory_stock",
    "view_stock_quantity",
    "adjust_inventory_stock",
    "update_stock_quantity",
    "create_inventory_sales",
    "create_invoices",
];

// ---------------------------------------------------------------------------
// Submodules
// ---------------------------------------------------------------------------

mod types;
use types::*;
mod handler;
use handler::*;
mod db;
use db::*;
mod mapping;
use mapping::*;
mod query;
use query::*;

#[cfg(test)]
mod tests;

// ---------------------------------------------------------------------------
// Public handler entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_inventory_products_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = inventory_products_ws_id(request.path)?;

    Some(match request.method {
        "GET" => inventory_products_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// Path guard
// ---------------------------------------------------------------------------

fn inventory_products_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}
