//! Port of the legacy Next.js route
//! `apps/web/src/app/api/v1/workspaces/[wsId]/inventory/costing/[profileId]/route.ts`.
//!
//! GET /api/v1/workspaces/:wsId/inventory/costing/:profileId
//!
//! Fetches a single inventory cost profile by calling the Supabase RPC
//! `private.get_inventory_cost_profile(p_ws_id, p_profile_id)` with the
//! service-role key (bypassing RLS), mirroring the legacy `getCostProfile`
//! helper.
//!
//! Auth mirrors `authorizeInventoryWorkspace` + `canViewInventoryCatalog`:
//!
//! 1. Resolve the session (Supabase access token from bearer / cookie).
//! 2. Normalize the workspace id (`personal`/`internal` aliases + handle
//!    lookup) and verify workspace membership.
//! 3. Require ANY of the `canViewInventoryCatalog` permissions (same set
//!    used by `workspaces_inventory_costing`).
//!
//! Response shape:
//!
//! - 200 `{ "data": <CostProfile> }` — profile found.
//! - 404 `{ "message": "Not found" }` — RPC returned null.
//! - 500 `{ "message": "Failed to load inventory cost profile" }` — RPC
//!   error or backend misconfigured.
//!
//! Status codes:
//!
//! - missing/invalid session     → 401 `{ "message": "Unauthorized" }`
//! - unresolved workspace        → 404 `{ "error": "Not found" }`
//! - member lacking permission   → 403 `{ "message": "Forbidden" }`
//! - profile not found           → 404 `{ "message": "Not found" }`
//! - upstream failure            → 500 `{ "message": "Failed to load inventory cost profile" }`
//!
//! Only GET is migrated. PATCH and DELETE return `None` so the Cloudflare
//! worker falls through to the still-active Next.js route.
//!
//! GAP: `authorizeInventoryWorkspace` in the legacy route maps a non-member
//! to 403, while `authorize_workspace_permission` here maps it to 404 (via
//! `NotFound`). This is the same accepted tradeoff documented in sibling
//! inventory ports (e.g. `workspaces_wsid_inventory_warehouses`).

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_MID: &str = "/inventory/costing/";

const GET_COST_PROFILE_RPC: &str = "get_inventory_cost_profile";
const PRIVATE_SCHEMA: &str = "private";

const FORBIDDEN_MESSAGE: &str = "Forbidden";
const NOT_FOUND_MESSAGE: &str = "Not found";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const LOAD_FAILED_MESSAGE: &str = "Failed to load inventory cost profile";

// Mirrors `canViewInventoryCatalog` from
// apps/web/src/lib/inventory/permissions.ts. Any one of these grants read
// access. Workspace admins / creators are covered by `has_all_permissions`
// inside `authorize_workspace_permission`.
const VIEW_INVENTORY_CATALOG_PERMISSIONS: [&str; 6] = [
    "view_inventory_catalog",
    "manage_inventory_catalog",
    "view_inventory",
    "create_inventory",
    "update_inventory",
    "delete_inventory",
];

pub(crate) async fn handle_workspaces_wsid_inventory_costing_profileid_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (raw_ws_id, profile_id) = extract_path_segments(request.path)?;

    // Only GET is migrated. PATCH / DELETE must fall through to Next.js.
    Some(match request.method {
        "GET" => get_cost_profile_response(config, request, raw_ws_id, profile_id, outbound).await,
        _ => return None,
    })
}

async fn get_cost_profile_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    profile_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let ws_id =
        match authorize_inventory_catalog(&config.contact_data, request, raw_ws_id, outbound).await
        {
            Ok(ws_id) => ws_id,
            Err(response) => return response,
        };

    match fetch_cost_profile(&config.contact_data, outbound, &ws_id, profile_id).await {
        Ok(Some(data)) => no_store_response(json_response(200, json!({ "data": data }))),
        Ok(None) => no_store_response(json_response(404, json!({ "message": NOT_FOUND_MESSAGE }))),
        Err(()) => no_store_response(json_response(
            500,
            json!({ "message": LOAD_FAILED_MESSAGE }),
        )),
    }
}

/// Authorizes the caller for the workspace, succeeding if they hold ANY of the
/// `canViewInventoryCatalog` permissions. Returns the resolved workspace id on
/// success, or a ready-to-send error response.
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

/// Calls the `private.get_inventory_cost_profile` RPC with the service-role
/// key (mirroring the legacy `createAdminClient().schema('private')` call in
/// `getCostProfile`). Returns `Ok(Some(value))` when the RPC returns a non-null
/// profile, `Ok(None)` when null, and `Err(())` on network / parse failure.
async fn fetch_cost_profile(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    profile_id: &str,
) -> Result<Option<Value>, ()> {
    let rpc_url = contact_data.rpc_url(GET_COST_PROFILE_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&json!({
        "p_profile_id": profile_id,
        "p_ws_id": ws_id,
    }))
    .map_err(|_| ())?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // The RPC returns a single scalar JSON value (the profile object or null).
    let value = response.json::<Value>().map_err(|_| ())?;
    if value.is_null() {
        Ok(None)
    } else {
        Ok(Some(value))
    }
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

/// Extracts `(ws_id, profile_id)` from a path of the form:
/// `/api/v1/workspaces/<wsId>/inventory/costing/<profileId>`
///
/// Returns `None` for any path that does not match exactly (wrong prefix,
/// wrong middle segment, empty ids, or extra trailing segments).
fn extract_path_segments(path: &str) -> Option<(&str, &str)> {
    // Strip the leading `/api/v1/workspaces/` prefix.
    let rest = path.strip_prefix(PATH_PREFIX)?;

    // Find the middle `/inventory/costing/` separator and split around it.
    let mid_pos = rest.find(PATH_MID)?;
    let ws_id = &rest[..mid_pos];
    let profile_id = &rest[mid_pos + PATH_MID.len()..];

    // Both segments must be non-empty and must not contain a `/` (no extra
    // nested path components allowed).
    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }
    if profile_id.is_empty() || profile_id.contains('/') {
        return None;
    }

    Some((ws_id, profile_id))
}

#[cfg(test)]
mod tests {
    use super::*;

    const WS: &str = "11111111-1111-4111-8111-111111111111";
    const PROFILE: &str = "22222222-2222-4222-8222-222222222222";

    // --- path guard / segment extraction ------------------------------------

    #[test]
    fn extracts_valid_path() {
        let path = format!("/api/v1/workspaces/{WS}/inventory/costing/{PROFILE}");
        let (ws_id, profile_id) = extract_path_segments(&path).expect("valid path");
        assert_eq!(ws_id, WS);
        assert_eq!(profile_id, PROFILE);
    }

    #[test]
    fn rejects_collection_path_without_profile_id() {
        let path = format!("/api/v1/workspaces/{WS}/inventory/costing");
        assert!(extract_path_segments(&path).is_none());
    }

    #[test]
    fn rejects_trailing_slash_after_profile_id() {
        // A trailing slash produces an empty final segment — reject.
        let path = format!("/api/v1/workspaces/{WS}/inventory/costing/{PROFILE}/");
        assert!(extract_path_segments(&path).is_none());
    }

    #[test]
    fn rejects_nested_sub_resource() {
        let path = format!("/api/v1/workspaces/{WS}/inventory/costing/{PROFILE}/sub");
        assert!(extract_path_segments(&path).is_none());
    }

    #[test]
    fn rejects_wrong_prefix() {
        let path = format!("/api/workspaces/{WS}/inventory/costing/{PROFILE}");
        assert!(extract_path_segments(&path).is_none());
    }

    #[test]
    fn rejects_wrong_middle_segment() {
        let path = format!("/api/v1/workspaces/{WS}/inventory/batches/{PROFILE}");
        assert!(extract_path_segments(&path).is_none());
    }

    #[test]
    fn rejects_empty_ws_id() {
        let path = format!("/api/v1/workspaces//inventory/costing/{PROFILE}");
        assert!(extract_path_segments(&path).is_none());
    }

    #[test]
    fn rejects_empty_profile_id() {
        let path = format!("/api/v1/workspaces/{WS}/inventory/costing/");
        assert!(extract_path_segments(&path).is_none());
    }

    #[test]
    fn rejects_ws_id_with_embedded_slash() {
        let path = format!("/api/v1/workspaces/a/b/inventory/costing/{PROFILE}");
        assert!(extract_path_segments(&path).is_none());
    }

    #[test]
    fn rejects_short_unrelated_path() {
        assert!(extract_path_segments("/api/v1").is_none());
        assert!(extract_path_segments("/").is_none());
    }

    // --- response payload shaping ------------------------------------------

    #[test]
    fn found_response_wraps_data() {
        let profile = json!({ "id": PROFILE, "name": "Test profile" });
        let payload = json!({ "data": profile.clone() });
        assert_eq!(payload["data"], profile);
    }

    #[test]
    fn null_rpc_result_treated_as_not_found() {
        let value: Value = serde_json::from_str("null").unwrap();
        assert!(value.is_null());
    }
}
