//! Handler for `GET /api/v1/workspaces/:wsId/inventory/square/devices`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/inventory/square/devices/route.ts`.
//!
//! ## Auth model
//!
//! The legacy route calls `authorizeInventoryWorkspace` (session auth, no
//! app-session tokens accepted) and then checks `canManageInventorySetup`,
//! which grants access when the caller holds ANY of:
//!
//! - `manage_inventory_setup`
//! - `create_inventory`
//! - `update_inventory`
//! - `delete_inventory`
//!
//! This handler mirrors that multi-permission pattern by iterating over the
//! same set and returning `403 Forbidden` only when none of them is held.
//!
//! ## Behavior gaps vs. legacy
//!
//! - **Square API not called.** The legacy handler calls the external Square
//!   Devices API in real time (via `listInventorySquareDevices`) and upserts
//!   the results into `inventory_square_devices`. This Rust handler instead
//!   reads the cached rows already stored in that table. Devices are therefore
//!   only as fresh as the last successful call to the legacy route or a
//!   webhook-triggered sync. The status code and JSON shape (`{ "data": [...] }`)
//!   are identical for the success path.
//!
//! - **Service-role key used for data read.** The legacy route reads device
//!   data with the admin (service-role) Supabase client. This handler does the
//!   same, so row-level security is bypassed and the workspace ID filter
//!   provides scoping.
//!
//! Status codes:
//!
//! - unauthenticated / invalid session -> `401`
//! - workspace not found               -> `401`
//! - lacks all setup permissions       -> `403`
//! - configuration / upstream error    -> `500`
//! - success                           -> `200 { "data": [...] }`
//!
//! `POST`/`PUT`/`PATCH`/`DELETE` return `None` so the still-live Next.js route
//! handles mutations.

use serde::Serialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/inventory/square/devices";

const FORBIDDEN_MESSAGE: &str = "Forbidden";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const LOAD_FAILED_MESSAGE: &str = "Failed to list Square devices";

/// Mirrors `canManageInventorySetup` in
/// `apps/web/src/lib/inventory/permissions.ts`.
/// Access is granted when the caller holds ANY of these permissions.
const MANAGE_INVENTORY_SETUP_PERMISSIONS: [&str; 4] = [
    "manage_inventory_setup",
    "create_inventory",
    "update_inventory",
    "delete_inventory",
];

/// Mirrors the `SquareDevice` type produced by `mapDevice` in
/// `apps/web/src/lib/inventory/commerce/square/devices.ts`, read back from
/// the `inventory_square_devices` table columns set by `upsertDevice`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SquareDeviceRow {
    id: Option<String>,
    name: Option<String>,
    location_id: Option<String>,
    status: Option<String>,
    product_type: Option<String>,
    paired_at: Option<String>,
    updated_at: Option<String>,
    code: Option<String>,
}

impl<'de> serde::Deserialize<'de> for SquareDeviceRow {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(serde::Deserialize)]
        struct Raw {
            device_id: Option<String>,
            device_name: Option<String>,
            location_id: Option<String>,
            status: Option<String>,
            product_type: Option<String>,
            paired_at: Option<String>,
            updated_at: Option<String>,
            device_code_id: Option<String>,
        }
        let raw = Raw::deserialize(deserializer)?;
        Ok(Self {
            id: raw.device_id,
            name: raw.device_name,
            location_id: raw.location_id,
            status: raw.status,
            product_type: raw.product_type,
            paired_at: raw.paired_at,
            updated_at: raw.updated_at,
            code: raw.device_code_id,
        })
    }
}

pub(crate) async fn handle_workspaces_wsid_inventory_square_devices_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = extract_ws_id(request.path)?;

    Some(match request.method {
        "GET" => get_devices_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn get_devices_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let ws_id =
        match authorize_manage_inventory_setup(&config.contact_data, request, raw_ws_id, outbound)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(response) => return response,
        };

    match fetch_square_devices(&config.contact_data, outbound, &ws_id).await {
        Ok(devices) => no_store_response(json_response(200, json!({ "data": devices }))),
        Err(()) => no_store_response(json_response(
            500,
            json!({ "message": LOAD_FAILED_MESSAGE }),
        )),
    }
}

/// Authorizes the caller for inventory setup management, succeeding if they
/// hold ANY of `MANAGE_INVENTORY_SETUP_PERMISSIONS`. Returns the resolved
/// workspace ID on success, or a ready-to-send error response.
async fn authorize_manage_inventory_setup(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<String, BackendResponse> {
    for permission in MANAGE_INVENTORY_SETUP_PERMISSIONS {
        match authorize_workspace_permission(contact_data, request, raw_ws_id, permission, outbound)
            .await
        {
            Ok(authorization) => return Ok(authorization.ws_id),
            // Missing one permission does not deny access; keep checking.
            Err(WorkspacePermissionAuthorizationError::Forbidden) => {}
            Err(error) => return Err(auth_error_response(error)),
        }
    }

    Err(no_store_response(json_response(
        403,
        json!({ "message": FORBIDDEN_MESSAGE }),
    )))
}

/// Reads cached Square device rows from `inventory_square_devices` filtered
/// by `ws_id`. Uses the service-role key (bypasses RLS) matching the legacy
/// admin Supabase client used by `upsertDevice`.
async fn fetch_square_devices(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<SquareDeviceRow>, ()> {
    let url = contact_data
        .rest_url(
            "inventory_square_devices",
            &[
                (
                    "select",
                    "device_id,device_name,location_id,status,product_type,paired_at,updated_at,device_code_id".to_owned(),
                ),
                ("ws_id", format!("eq.{ws_id}")),
            ],
        )
        .ok_or(())?;

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<SquareDeviceRow>>().map_err(|_| ())
}

fn auth_error_response(error: WorkspacePermissionAuthorizationError) -> BackendResponse {
    match error {
        WorkspacePermissionAuthorizationError::Unauthorized
        | WorkspacePermissionAuthorizationError::NotFound => no_store_response(json_response(
            401,
            json!({ "message": UNAUTHORIZED_MESSAGE }),
        )),
        WorkspacePermissionAuthorizationError::Forbidden => {
            no_store_response(json_response(403, json!({ "message": FORBIDDEN_MESSAGE })))
        }
        WorkspacePermissionAuthorizationError::Internal => no_store_response(json_response(
            500,
            json!({ "message": LOAD_FAILED_MESSAGE }),
        )),
    }
}

/// Extracts the `wsId` segment from a path matching
/// `/api/v1/workspaces/<wsId>/inventory/square/devices`.
fn extract_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---------------------------------------------------------------------------
    // extract_ws_id
    // ---------------------------------------------------------------------------

    #[test]
    fn extract_ws_id_returns_none_for_unrelated_path() {
        assert!(extract_ws_id("/api/v1/workspaces/abc/inventory/square/locations").is_none());
        assert!(extract_ws_id("/api/v1/workspaces/abc/inventory/bundles").is_none());
        assert!(extract_ws_id("/api/v1/workspaces").is_none());
        assert!(extract_ws_id("/api/v2/workspaces/abc/inventory/square/devices").is_none());
    }

    #[test]
    fn extract_ws_id_returns_none_for_empty_ws_id() {
        assert!(extract_ws_id("/api/v1/workspaces//inventory/square/devices").is_none());
    }

    #[test]
    fn extract_ws_id_returns_none_for_extra_segments() {
        assert!(extract_ws_id("/api/v1/workspaces/ws/extra/inventory/square/devices").is_none());
    }

    #[test]
    fn extract_ws_id_accepts_uuid() {
        let ws_id = "11111111-1111-4111-8111-111111111111";
        let path = format!("/api/v1/workspaces/{ws_id}/inventory/square/devices");
        assert_eq!(extract_ws_id(&path), Some(ws_id));
    }

    #[test]
    fn extract_ws_id_accepts_slug() {
        let path = "/api/v1/workspaces/my-workspace/inventory/square/devices";
        assert_eq!(extract_ws_id(path), Some("my-workspace"));
    }

    // ---------------------------------------------------------------------------
    // SquareDeviceRow serialization
    // ---------------------------------------------------------------------------

    #[test]
    fn square_device_row_serializes_camel_case() {
        let row = SquareDeviceRow {
            id: Some("dev-1".to_owned()),
            name: Some("Terminal 1".to_owned()),
            location_id: Some("loc-1".to_owned()),
            status: Some("PAIRED".to_owned()),
            product_type: Some("TERMINAL_API".to_owned()),
            paired_at: Some("2024-01-01T00:00:00Z".to_owned()),
            updated_at: Some("2024-06-01T00:00:00Z".to_owned()),
            code: Some("dc-1".to_owned()),
        };

        let value = serde_json::to_value(&row).unwrap();
        assert_eq!(value["id"], "dev-1");
        assert_eq!(value["name"], "Terminal 1");
        assert_eq!(value["locationId"], "loc-1");
        assert_eq!(value["status"], "PAIRED");
        assert_eq!(value["productType"], "TERMINAL_API");
        assert_eq!(value["pairedAt"], "2024-01-01T00:00:00Z");
        assert_eq!(value["updatedAt"], "2024-06-01T00:00:00Z");
        assert_eq!(value["code"], "dc-1");
        // Ensure snake_case keys are absent
        assert!(value.get("location_id").is_none());
        assert!(value.get("product_type").is_none());
    }

    #[test]
    fn square_device_row_deserializes_from_db_columns() {
        let json = serde_json::json!({
            "device_id": "dev-2",
            "device_name": "Terminal 2",
            "location_id": "loc-2",
            "status": "UNPAIRED",
            "product_type": "TERMINAL_API",
            "paired_at": null,
            "updated_at": "2025-01-01T00:00:00Z",
            "device_code_id": "dc-2"
        });

        let row: SquareDeviceRow = serde_json::from_value(json).unwrap();
        assert_eq!(row.id.as_deref(), Some("dev-2"));
        assert_eq!(row.name.as_deref(), Some("Terminal 2"));
        assert_eq!(row.code.as_deref(), Some("dc-2"));
        assert!(row.paired_at.is_none());
    }
}
