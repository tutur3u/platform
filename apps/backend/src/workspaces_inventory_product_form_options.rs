use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const WORKSPACES_INVENTORY_PRODUCT_FORM_OPTIONS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_INVENTORY_PRODUCT_FORM_OPTIONS_PATH_SUFFIX: &str =
    "/inventory/product-form-options";
const PRODUCT_FORM_OPTIONS_RPC: &str = "get_inventory_product_form_options";
const PRIVATE_SCHEMA: &str = "private";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const NOT_FOUND_MESSAGE: &str = "Not found";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const LOAD_FAILED_MESSAGE: &str = "Failed to fetch inventory product form options";

// Mirrors `canViewInventoryCatalog` in
// apps/web/src/lib/inventory/permissions.ts (any of these permissions grants
// access). Workspace creators / admins are covered by `has_all_permissions`
// inside `authorize_workspace_permission`.
const VIEW_INVENTORY_CATALOG_PERMISSIONS: [&str; 6] = [
    "view_inventory_catalog",
    "manage_inventory_catalog",
    "view_inventory",
    "create_inventory",
    "update_inventory",
    "delete_inventory",
];

pub(crate) async fn handle_workspaces_inventory_product_form_options_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_inventory_product_form_options_ws_id(request.path)?;

    Some(match request.method {
        "GET" => product_form_options_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn product_form_options_response(
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

    match fetch_product_form_options(&config.contact_data, outbound, &ws_id).await {
        Ok(options) => no_store_response(json_response(200, options)),
        Err(()) => no_store_response(json_response(
            500,
            json!({ "message": LOAD_FAILED_MESSAGE }),
        )),
    }
}

/// Authorizes the caller for the workspace, succeeding if they hold ANY of the
/// inventory-catalog permissions. Returns the resolved workspace id on success,
/// or a ready-to-send error response.
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

async fn fetch_product_form_options(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Value, ()> {
    let rpc_url = contact_data.rpc_url(PRODUCT_FORM_OPTIONS_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&json!({ "p_ws_id": ws_id })).map_err(|_| ())?;

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

    let payload = response.json::<Value>().map_err(|_| ())?;

    Ok(normalize_product_form_options(payload))
}

/// Mirrors the default-filling in `getInventoryProductFormOptions`
/// (apps/web/src/lib/inventory/product-rpc.ts): every list key falls back to an
/// empty array when the RPC returns null or omits it.
fn normalize_product_form_options(payload: Value) -> Value {
    let source = if payload.is_object() {
        payload
    } else {
        Value::Object(Default::default())
    };

    json!({
        "categories": list_or_empty(&source, "categories"),
        "financeCategories": list_or_empty(&source, "financeCategories"),
        "manufacturers": list_or_empty(&source, "manufacturers"),
        "owners": list_or_empty(&source, "owners"),
        "units": list_or_empty(&source, "units"),
        "warehouses": list_or_empty(&source, "warehouses"),
    })
}

fn list_or_empty(source: &Value, key: &str) -> Value {
    match source.get(key) {
        Some(value) if value.is_array() => value.clone(),
        _ => Value::Array(Vec::new()),
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

fn workspaces_inventory_product_form_options_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_INVENTORY_PRODUCT_FORM_OPTIONS_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_INVENTORY_PRODUCT_FORM_OPTIONS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}
