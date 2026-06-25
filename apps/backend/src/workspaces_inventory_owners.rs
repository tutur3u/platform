//! Handler for `GET /api/v1/workspaces/:wsId/inventory/owners`.
//!
//! Mirrors the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/inventory/owners/route.ts`.
//!
//! Only the GET method is migrated. The legacy route also defines POST (create
//! an inventory owner) which is NOT migrated yet, so this handler returns `None`
//! for every non-GET method to let the Cloudflare worker fall through to the
//! still-active Next.js route.
//!
//! Behavior parity with the legacy GET handler:
//!   1. `authorizeInventoryWorkspace` -> resolve/normalize wsId + verify the
//!      caller is a workspace member. Implemented here via the shared
//!      `authorize_workspace_permission` helper (it normalizes the wsId,
//!      verifies membership, and computes effective permissions in one pass).
//!   2. `canViewInventoryCatalog(permissions)` -> caller must hold ANY of the
//!      inventory-catalog permissions; workspace creators/admins are covered by
//!      `has_all_permissions` inside `authorize_workspace_permission`.
//!   3. Read `private.inventory_owners` via service-role REST (matching
//!      `sbAdmin.schema('private').from('inventory_owners')`), filtered by
//!      `ws_id`, ordered by `archived` then `name`.
//!   4. Respond `{ data: [...] }` (200), `{ message: 'Forbidden' }` (403), or
//!      `{ message: 'Failed to fetch inventory owners' }` (500).

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const WORKSPACES_INVENTORY_OWNERS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_INVENTORY_OWNERS_PATH_SUFFIX: &str = "/inventory/owners";
const OWNERS_TABLE: &str = "inventory_owners";
const PRIVATE_SCHEMA: &str = "private";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const NOT_FOUND_MESSAGE: &str = "Not found";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const LOAD_FAILED_MESSAGE: &str = "Failed to fetch inventory owners";

// Mirrors `canViewInventoryCatalog` in
// apps/web/src/lib/inventory/permissions.ts: access is granted when the caller
// holds ANY of these permissions.
const VIEW_INVENTORY_CATALOG_PERMISSIONS: [&str; 6] = [
    "view_inventory_catalog",
    "manage_inventory_catalog",
    "view_inventory",
    "create_inventory",
    "update_inventory",
    "delete_inventory",
];

pub(crate) async fn handle_workspaces_inventory_owners_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_inventory_owners_ws_id(request.path)?;

    // Only GET is migrated. Every other method (e.g. POST) must fall through to
    // the still-active Next.js route, so return `None` for them.
    Some(match request.method {
        "GET" => list_owners_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn list_owners_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let ws_id =
        match authorize_inventory_catalog(&config.contact_data, request, raw_ws_id, outbound).await
        {
            Ok(ws_id) => ws_id,
            Err(response) => return response,
        };

    match fetch_owners(&config.contact_data, outbound, &ws_id).await {
        Ok(rows) => no_store_response(json_response(200, json!({ "data": rows }))),
        Err(()) => no_store_response(json_response(
            500,
            json!({ "message": LOAD_FAILED_MESSAGE }),
        )),
    }
}

/// Authorizes the caller for the workspace, succeeding if they hold ANY of the
/// inventory-catalog permissions. Returns the resolved workspace id on success,
/// or a ready-to-send error response.
///
/// `authorize_workspace_permission` also performs the wsId normalization +
/// membership verification that the legacy `authorizeInventoryWorkspace` does;
/// a non-member surfaces as `Forbidden` from the very first permission check,
/// matching the legacy 403.
async fn authorize_inventory_catalog(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<String, BackendResponse> {
    for permission in VIEW_INVENTORY_CATALOG_PERMISSIONS {
        match authorize_workspace_permission(contact_data, request, raw_ws_id, permission, outbound)
            .await
        {
            Ok(authorization) => return Ok(authorization.ws_id),
            // A single missing permission does not deny access; the legacy
            // `canViewInventoryCatalog` grants access when ANY permission is
            // present, so keep checking the remaining permissions.
            Err(WorkspacePermissionAuthorizationError::Forbidden) => {}
            Err(error) => return Err(auth_error_response(error)),
        }
    }

    Err(no_store_response(json_response(
        403,
        json!({ "message": FORBIDDEN_MESSAGE }),
    )))
}

/// Reads `private.inventory_owners` via service-role REST (matching
/// `sbAdmin.schema('private').from('inventory_owners').select('*')`), filtered
/// by `ws_id` and ordered by `archived` then `name` (PostgREST defaults to asc,
/// matching Supabase `.order()` defaults). Rows are returned as raw JSON to
/// preserve the `select('*')` shape exactly.
async fn fetch_owners(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<Value>, ()> {
    let query: Vec<(&str, String)> = vec![
        ("select", "*".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "archived,name".to_owned()),
    ];

    let url = contact_data.rest_url(OWNERS_TABLE, &query).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
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

fn workspaces_inventory_owners_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_INVENTORY_OWNERS_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_INVENTORY_OWNERS_PATH_SUFFIX)?;

    // A non-empty ws_id with no remaining slashes guarantees this is exactly the
    // `/inventory/owners` collection route (and not e.g. `/inventory/owners/:id`).
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}
