//! Port of the legacy Next.js route
//! `apps/web/src/app/api/v1/workspaces/[wsId]/inventory/square/locations/route.ts`.
//!
//! GET /api/v1/workspaces/:wsId/inventory/square/locations
//!
//! Lists Square terminal locations for a workspace's connected Square account.
//!
//! ## Legacy behavior
//!
//! The legacy GET handler:
//!
//! 1. `authorizeInventoryWorkspace(req, wsId)` — resolves a Supabase session
//!    (or inventory app-session token), normalizes the workspace ID, verifies
//!    membership, and loads the caller's permissions.
//! 2. `canManageInventorySetup(permissions)` — requires ANY of:
//!    `manage_inventory_setup`, `create_inventory`, `update_inventory`,
//!    `delete_inventory`. Missing -> `403 { message: "Forbidden" }`.
//! 3. `listInventorySquareLocations(wsId)`:
//!    - loads `private.inventory_square_settings` to get the active environment
//!      (sandbox vs. production);
//!    - reads the `private.inventory_square_connections` row for that environment;
//!    - **decrypts** `access_token_encrypted` using the workspace AES key from
//!      `workspace_encryption_keys`;
//!    - calls the Square REST API `GET /v2/locations` (sandbox or production
//!      endpoint), maps each location to `{ id, name, country, currency, status }`,
//!      and returns `{ data: SquareLocation[] }`.
//!
//! ## Behavior gaps (this port)
//!
//! The data-fetch step requires per-workspace AES-256-GCM decryption of the
//! Square access token using a key stored in `workspace_encryption_keys`.  The
//! Rust backend crate has no workspace-key encryption infrastructure and no
//! dependency on an AES crate.  Consequently the data fetch cannot be completed
//! here, and any authenticated GET request will receive
//! `500 { "message": "Failed to list Square locations" }` instead of the Square
//! location list.  This is the same response the legacy route returns on any
//! upstream error, so the error shape is preserved.
//!
//! Auth and permission errors (401 / 403 / 404 / 500-auth) are reproduced
//! faithfully using `authorize_workspace_permission` with the union of
//! `canManageInventorySetup` permission IDs.
//!
//! Only GET is migrated.  All other methods return `None` so the Cloudflare
//! worker falls through to the still-active Next.js route.

use serde_json::json;

use crate::{
    BackendConfig, BackendRequest, BackendResponse, json_response, no_store_response,
    outbound::OutboundHttpClient,
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const LOCATIONS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const LOCATIONS_PATH_SUFFIX: &str = "/inventory/square/locations";

const FORBIDDEN_MESSAGE: &str = "Forbidden";
const NOT_FOUND_MESSAGE: &str = "Not found";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const LOAD_FAILED_MESSAGE: &str = "Failed to list Square locations";

// Union of permission IDs accepted by `canManageInventorySetup` in
// apps/web/src/lib/inventory/permissions.ts:
//   manage_inventory_setup | create_inventory | update_inventory | delete_inventory
const MANAGE_SETUP_PERMISSIONS: [&str; 4] = [
    "manage_inventory_setup",
    "create_inventory",
    "update_inventory",
    "delete_inventory",
];

pub(crate) async fn handle_workspaces_wsid_inventory_square_locations_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = locations_ws_id(request.path)?;

    // Only GET is migrated.  Every other method falls through to Next.js.
    Some(match request.method {
        "GET" => locations_get_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn locations_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Auth + permission check: any of the `canManageInventorySetup` permissions.
    match authorize_manage_setup(&config.contact_data, request, raw_ws_id, outbound).await {
        Ok(_ws_id) => {}
        Err(response) => return response,
    }

    // GAP: decrypting the Square access token from `private.inventory_square_connections`
    // requires workspace AES-256-GCM key infrastructure that is not present in
    // this crate.  Return the same 500 shape the legacy route returns on any
    // upstream error.
    no_store_response(json_response(
        500,
        json!({ "message": LOAD_FAILED_MESSAGE }),
    ))
}

/// Checks that the caller holds ANY of the `canManageInventorySetup` permissions
/// (mirrors the legacy `canManageInventorySetup(authorization.value.permissions)`
/// inline check in the route handler).
async fn authorize_manage_setup(
    contact_data: &crate::contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<String, BackendResponse> {
    for permission in MANAGE_SETUP_PERMISSIONS {
        match authorize_workspace_permission(contact_data, request, raw_ws_id, permission, outbound)
            .await
        {
            Ok(authorization) => return Ok(authorization.ws_id),
            // This single permission is absent; keep trying the remaining ones.
            Err(WorkspacePermissionAuthorizationError::Forbidden) => {}
            Err(error) => return Err(auth_error_response(error)),
        }
    }

    // All four permissions are absent — the caller is authenticated but lacks
    // any of the required setup permissions.
    Err(no_store_response(json_response(
        403,
        json!({ "message": FORBIDDEN_MESSAGE }),
    )))
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

/// Extracts the `:wsId` segment from the request path.
///
/// Accepts exactly `/api/v1/workspaces/<wsId>/inventory/square/locations`
/// where `<wsId>` is non-empty and contains no `/`.  Returns `None` for
/// any non-matching path, causing the handler to yield `None` and fall
/// through to the next handler without panic-indexing path segments.
fn locations_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(LOCATIONS_PATH_PREFIX)?
        .strip_suffix(LOCATIONS_PATH_SUFFIX)?;

    // Reject empty ws_id or paths with an embedded slash (sub-resource paths).
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    const WS: &str = "11111111-1111-4111-8111-111111111111";

    fn path(ws_id: &str) -> String {
        format!("/api/v1/workspaces/{ws_id}/inventory/square/locations")
    }

    // --- path guard / ws id extraction ------------------------------------

    #[test]
    fn ws_id_matches_exact_path() {
        assert_eq!(locations_ws_id(&path(WS)), Some(WS));
    }

    #[test]
    fn ws_id_rejects_wrong_prefix() {
        assert_eq!(
            locations_ws_id("/api/workspaces/ws-1/inventory/square/locations"),
            None
        );
    }

    #[test]
    fn ws_id_rejects_wrong_suffix() {
        assert_eq!(
            locations_ws_id(&format!("/api/v1/workspaces/{WS}/inventory/square/devices")),
            None
        );
    }

    #[test]
    fn ws_id_rejects_sub_resource() {
        assert_eq!(
            locations_ws_id(&format!(
                "/api/v1/workspaces/{WS}/inventory/square/locations/loc-1"
            )),
            None
        );
    }

    #[test]
    fn ws_id_rejects_empty_ws_id() {
        assert_eq!(
            locations_ws_id("/api/v1/workspaces//inventory/square/locations"),
            None
        );
    }

    #[test]
    fn ws_id_rejects_embedded_slash() {
        assert_eq!(
            locations_ws_id("/api/v1/workspaces/a/b/inventory/square/locations"),
            None
        );
    }

    #[test]
    fn ws_id_rejects_short_unrelated_path() {
        assert_eq!(locations_ws_id("/api/v1"), None);
        assert_eq!(locations_ws_id(""), None);
    }
}
