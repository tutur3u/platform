use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const WORKSPACES_INVENTORY_STOREFRONTS_LISTINGS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_INVENTORY_STOREFRONTS_LISTINGS_INFIX: &str = "/inventory/storefronts/";
const WORKSPACES_INVENTORY_STOREFRONTS_LISTINGS_SUFFIX: &str = "/listings";

const LIST_STOREFRONT_LISTINGS_RPC: &str = "list_inventory_storefront_listings";
const PRIVATE_SCHEMA: &str = "private";

const FORBIDDEN_MESSAGE: &str = "Forbidden";
const NOT_FOUND_MESSAGE: &str = "Not found";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const LOAD_FAILED_MESSAGE: &str = "Failed to fetch inventory storefront listings";
const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";

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

// Mirrors `ListingStatusSchema` (z.enum) in
// apps/web/src/lib/inventory/commerce/schemas.ts. The `status` query param is a
// union of these values plus the literal 'all'.
const LISTING_STATUSES: [&str; 4] = ["draft", "published", "paused", "archived"];

#[derive(Serialize)]
struct ListStorefrontListingsRequest<'a> {
    p_status: Option<&'a str>,
    p_storefront_id: &'a str,
    p_ws_id: &'a str,
}

// Each RPC row carries the aggregate total_count and the `listing` payload. The
// `listing` JSON is forwarded verbatim to match the legacy `mapRpcList` output.
#[derive(Deserialize)]
struct ListingRpcRow {
    #[serde(default)]
    total_count: Option<i64>,
    #[serde(default)]
    listing: Option<Value>,
}

pub(crate) async fn handle_workspaces_inventory_storefronts_storefrontid_listings_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, storefront_id) =
        workspaces_inventory_storefronts_storefrontid_listings_segments(request.path)?;

    Some(match request.method {
        "GET" => listings_response(config, request, raw_ws_id, storefront_id, outbound).await,
        // Other HTTP methods (POST, ...) on this route are NOT migrated yet; fall
        // through to the still-active Next.js route by returning None.
        _ => return None,
    })
}

async fn listings_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    storefront_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Validate the optional `status` query param up front (Zod safeParse) so an
    // invalid value yields the legacy 400 before any auth-bound work.
    let status = match parse_status_param(request.url) {
        Ok(status) => status,
        Err(response) => return response,
    };

    let ws_id =
        match authorize_inventory_catalog(&config.contact_data, request, raw_ws_id, outbound).await
        {
            Ok(ws_id) => ws_id,
            Err(response) => return response,
        };

    match list_storefront_listings(
        &config.contact_data,
        outbound,
        &ws_id,
        storefront_id,
        status.as_deref(),
    )
    .await
    {
        Ok(payload) => no_store_response(json_response(200, payload)),
        Err(()) => no_store_response(json_response(
            500,
            json!({ "message": LOAD_FAILED_MESSAGE }),
        )),
    }
}

/// Mirrors the Zod `status` validation: a union of `ListingStatusSchema` and the
/// literal `'all'`, both optional. Returns `Some(status)` for a concrete status
/// that should be forwarded as the RPC `p_status` filter, `None` when the param
/// is absent or `'all'` (no filter), or an `Err` 400 response otherwise.
fn parse_status_param(url: Option<&str>) -> Result<Option<String>, BackendResponse> {
    let mut status_raw: Option<String> = None;
    if let Some(raw_url) = url
        && let Ok(parsed) = url::Url::parse(raw_url)
    {
        for (name, value) in parsed.query_pairs() {
            if name.as_ref() == "status" {
                status_raw = Some(value.into_owned());
            }
        }
    }

    match status_raw {
        None => Ok(None),
        Some(value) if value == "all" => Ok(None),
        Some(value) if LISTING_STATUSES.contains(&value.as_str()) => Ok(Some(value)),
        Some(value) => Err(invalid_query_response(value)),
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

/// Mirrors `listStorefrontListings` + `mapRpcList`
/// (apps/web/src/lib/inventory/commerce/repository.ts). Calls the `private`
/// schema RPC with the service role and reshapes the rows into the legacy
/// `{ count, data }` payload, forwarding each row's `listing` object verbatim.
async fn list_storefront_listings(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    storefront_id: &str,
    status: Option<&str>,
) -> Result<Value, ()> {
    let rpc_url = contact_data
        .rpc_url(LIST_STOREFRONT_LISTINGS_RPC)
        .ok_or(())?;
    let body = serde_json::to_string(&ListStorefrontListingsRequest {
        p_status: status,
        p_storefront_id: storefront_id,
        p_ws_id: ws_id,
    })
    .map_err(|_| ())?;

    let response = send_private_service_role_rpc(contact_data, outbound, &rpc_url, &body).await?;
    if !is_success_status(response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<ListingRpcRow>>().map_err(|_| ())?;

    // count = rows[0].total_count ?? 0
    let count = rows.first().and_then(|row| row.total_count).unwrap_or(0);

    // data = rows.map(row => row.listing).filter(Boolean)
    let data: Vec<Value> = rows
        .into_iter()
        .filter_map(|row| row.listing)
        .filter(|listing| !listing.is_null())
        .collect();

    Ok(json!({ "count": count, "data": data }))
}

async fn send_private_service_role_rpc(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    body: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_body(body),
        )
        .await
        .map_err(|_| ())
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

/// Approximates the Zod `invalid_union` issue emitted for an out-of-range
/// `status` value. The exact nested-union issue tree is not reproduced; the
/// stable parts (top-level message + path) match the legacy 400 contract.
fn invalid_query_response(received: String) -> BackendResponse {
    no_store_response(json_response(
        400,
        json!({
            "message": INVALID_QUERY_MESSAGE,
            "errors": [
                {
                    "code": "invalid_union",
                    "path": ["status"],
                    "message": "Invalid input",
                    "received": received,
                }
            ],
        }),
    ))
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

/// Matches the dynamic `/api/v1/workspaces/:wsId/inventory/storefronts/:storefrontId/listings`
/// shape, extracting `(wsId, storefrontId)`. Returns `None` for any deeper or
/// malformed path so more specific handlers / the Next.js fallback keep it.
fn workspaces_inventory_storefronts_storefrontid_listings_segments(
    path: &str,
) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(WORKSPACES_INVENTORY_STOREFRONTS_LISTINGS_PATH_PREFIX)?;
    let (ws_id, after_ws) = rest.split_once(WORKSPACES_INVENTORY_STOREFRONTS_LISTINGS_INFIX)?;
    let storefront_id = after_ws.strip_suffix(WORKSPACES_INVENTORY_STOREFRONTS_LISTINGS_SUFFIX)?;

    if ws_id.is_empty()
        || ws_id.contains('/')
        || storefront_id.is_empty()
        || storefront_id.contains('/')
    {
        return None;
    }

    Some((ws_id, storefront_id))
}
