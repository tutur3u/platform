use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const LINKED_PRODUCTS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const LINKED_PRODUCTS_PATH_SUFFIX: &str = "/user-groups/linked-products";
const LINKED_PRODUCTS_RPC: &str = "get_user_group_linked_products_with_units";
const PRIVATE_SCHEMA: &str = "private";

// Legacy route (`apps/web/.../user-groups/linked-products/route.ts`) grants
// access when the caller holds EITHER of these permissions. Workspace
// creators / admins are covered by `has_all_permissions` inside
// `authorize_workspace_permission`.
const VIEW_LINKED_PRODUCTS_PERMISSIONS: [&str; 2] = ["view_user_groups", "create_invoices"];

const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient permissions to view linked products";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const LOAD_FAILED_MESSAGE: &str = "Error fetching linked products";

pub(crate) async fn handle_workspaces_user_groups_linked_products_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = linked_products_ws_id(request.path)?;

    Some(match request.method {
        "GET" => linked_products_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn linked_products_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let ws_id =
        match authorize_linked_products(&config.contact_data, request, raw_ws_id, outbound).await {
            Ok(ws_id) => ws_id,
            Err(response) => return response,
        };

    let group_ids = group_ids_from_url(request.url);

    // Mirrors the legacy short-circuit: no group ids means no lookup, just an
    // empty list (after the access check has already passed).
    if group_ids.is_empty() {
        return no_store_response(json_response(200, json!({ "items": [] })));
    }

    match fetch_linked_products(&config.contact_data, outbound, &ws_id, &group_ids).await {
        Ok(items) => no_store_response(json_response(200, json!({ "items": items }))),
        Err(()) => no_store_response(json_response(
            500,
            json!({ "message": LOAD_FAILED_MESSAGE }),
        )),
    }
}

/// Authorizes the caller for the workspace, succeeding if they hold ANY of the
/// linked-products permissions. Returns the resolved workspace id on success,
/// or a ready-to-send error response that mirrors the legacy status codes and
/// messages.
async fn authorize_linked_products(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<String, BackendResponse> {
    for permission in VIEW_LINKED_PRODUCTS_PERMISSIONS {
        match authorize_workspace_permission(contact_data, request, raw_ws_id, permission, outbound)
            .await
        {
            Ok(authorization) => return Ok(authorization.ws_id),
            // A single missing permission does not deny access; the legacy
            // route grants access when ANY of the permissions is present, so
            // keep checking the remaining permissions.
            Err(WorkspacePermissionAuthorizationError::Forbidden) => {}
            Err(error) => return Err(auth_error_response(error)),
        }
    }

    Err(no_store_response(json_response(
        403,
        json!({ "message": INSUFFICIENT_PERMISSIONS_MESSAGE }),
    )))
}

async fn fetch_linked_products(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    group_ids: &[String],
) -> Result<Vec<Value>, ()> {
    let rpc_url = contact_data.rpc_url(LINKED_PRODUCTS_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&json!({
        "p_group_ids": group_ids,
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

    let rows = response.json::<Vec<LinkedProductRow>>().map_err(|_| ())?;

    // Mirror `data.map((row) => row.item).filter(Boolean)`: keep only the
    // non-null `item` payloads.
    Ok(rows
        .into_iter()
        .filter_map(|row| match row.item {
            Some(item) if !item.is_null() => Some(item),
            _ => None,
        })
        .collect())
}

#[derive(Deserialize)]
struct LinkedProductRow {
    item: Option<Value>,
}

/// Collects every `groupIds` query parameter, trimming whitespace and dropping
/// empty values, mirroring the legacy `getAll('groupIds').map(trim).filter`.
fn group_ids_from_url(request_url: Option<&str>) -> Vec<String> {
    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return Vec::new();
    };

    url.query_pairs()
        .filter(|(key, _)| key == "groupIds")
        .filter_map(|(_, value)| {
            let trimmed = value.trim();
            (!trimmed.is_empty()).then(|| trimmed.to_owned())
        })
        .collect()
}

fn linked_products_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(LINKED_PRODUCTS_PATH_PREFIX)?
        .strip_suffix(LINKED_PRODUCTS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn auth_error_response(error: WorkspacePermissionAuthorizationError) -> BackendResponse {
    match error {
        // The legacy `getFinanceRouteContext` returns 401 when the session is
        // missing or the workspace cannot be resolved for the user.
        WorkspacePermissionAuthorizationError::Unauthorized
        | WorkspacePermissionAuthorizationError::NotFound => no_store_response(json_response(
            401,
            json!({ "message": UNAUTHORIZED_MESSAGE }),
        )),
        WorkspacePermissionAuthorizationError::Forbidden => no_store_response(json_response(
            403,
            json!({ "message": INSUFFICIENT_PERMISSIONS_MESSAGE }),
        )),
        WorkspacePermissionAuthorizationError::Internal => no_store_response(json_response(
            500,
            json!({ "message": LOAD_FAILED_MESSAGE }),
        )),
    }
}
