use serde::Deserialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const FORBIDDEN_MESSAGE: &str = "Forbidden";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
// Mirrors the legacy 500 body, which (despite the product context) reads
// "Error fetching workspace users".
const LOOKUP_FAILED_MESSAGE: &str = "Error fetching workspace users";

const WORKSPACES_PRODUCTS_COUNT_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_PRODUCTS_COUNT_PATH_SUFFIX: &str = "/products/count";

// The legacy route gates the session path on `view_inventory`
// (`permissions.containsPermission('view_inventory')`).
const VIEW_INVENTORY_PERMISSION: &str = "view_inventory";

#[derive(Deserialize)]
struct ProductCountRow {
    count: Option<i64>,
}

pub(crate) async fn handle_workspaces_products_count_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_products_count_ws_id(request.path)?;

    Some(match request.method {
        "GET" => products_count_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn products_count_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Legacy also supports an `API_KEY` header path that validates a workspace
    // API key and reads the count with the admin client. `BackendRequest` does
    // not surface arbitrary request headers, so only the session path is
    // implemented here (see notes). The session path resolves the workspace
    // alias and enforces `view_inventory`, mapping:
    //   - auth failure                         => 401 Unauthorized
    //   - no resolvable permission context     => 403 Forbidden (getPermissions
    //                                             returns null => `!permissions`)
    //   - context present but lacks permission => 403 Forbidden
    let resolved_ws_id = match authorize_workspace_permission(
        contact_data,
        request,
        raw_ws_id,
        VIEW_INVENTORY_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization.ws_id,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return message_response(401, UNAUTHORIZED_MESSAGE);
        }
        Err(
            WorkspacePermissionAuthorizationError::Forbidden
            | WorkspacePermissionAuthorizationError::NotFound,
        ) => {
            return message_response(403, FORBIDDEN_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, LOOKUP_FAILED_MESSAGE);
        }
    };

    match products_count(contact_data, outbound, &resolved_ws_id).await {
        Ok(count) => no_store_response(json_response(200, count)),
        Err(()) => message_response(500, LOOKUP_FAILED_MESSAGE),
    }
}

/// Mirrors the legacy query:
/// `workspace_products.select('count()').filter('archived', 'eq', 'false')
///  .eq('ws_id', wsId).single()` returning `data?.count || 0`.
async fn products_count(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<i64, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_products",
        &[
            ("select", "count()".to_owned()),
            ("archived", "eq.false".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<ProductCountRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.count)
        .unwrap_or(0))
}

async fn send_service_role_rest_request(
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

fn workspaces_products_count_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_PRODUCTS_COUNT_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_PRODUCTS_COUNT_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
