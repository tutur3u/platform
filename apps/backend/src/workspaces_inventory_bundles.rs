use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const WORKSPACES_INVENTORY_BUNDLES_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_INVENTORY_BUNDLES_PATH_SUFFIX: &str = "/inventory/bundles";
const LIST_BUNDLES_RPC: &str = "list_inventory_bundles";
const PRIVATE_SCHEMA: &str = "private";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const NOT_FOUND_MESSAGE: &str = "Not found";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";
// NOTE: the legacy GET handler does NOT wrap `listBundles` in a try/catch
// (unlike the sibling costing route), so an upstream failure surfaces as the
// Next.js framework default 500 with an empty/HTML body. We can only emit a
// 500 status code here; we attach a JSON diagnostic message rather than
// attempting to reproduce the Next.js default error page. This divergence only
// affects the rare upstream-failure path (status code is identical).
const LOAD_FAILED_MESSAGE: &str = "Failed to fetch inventory bundles";

const DEFAULT_PAGE_SIZE: i64 = 25;
const MIN_PAGE_SIZE: i64 = 1;
const MAX_PAGE_SIZE: i64 = 100;
const DEFAULT_PAGE: i64 = 1;
const MIN_PAGE: i64 = 1;
const MAX_SEARCH_LEN: usize = 120;

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

/// Parsed + validated `listQuerySchema(BundleStatusSchema)` query parameters.
/// Invalid inputs surface as HTTP 400 (mirroring the legacy `safeParse`
/// failure path), so parsing returns `Err(())` for any out-of-range /
/// non-conforming value.
struct BundleListQuery {
    /// `p_limit`: clamped page size (`Math.max(1, Math.min(pageSize ?? 25, 100))`).
    limit: i64,
    /// `p_offset`: `(Math.max(1, page ?? 1) - 1) * limit`.
    offset: i64,
    /// `p_search`: trimmed search text, `None` (=> SQL NULL) when empty/missing.
    search: Option<String>,
    /// `p_status`: concrete status, or `None` (=> SQL NULL) for `all`/missing.
    status: Option<String>,
}

#[derive(Deserialize)]
struct BundleListRow {
    /// `total_count` from the RPC; the first row carries the total.
    #[serde(default)]
    total_count: Option<i64>,
    /// `bundle` JSON column produced by the RPC.
    #[serde(default)]
    bundle: Option<Value>,
}

pub(crate) async fn handle_workspaces_inventory_bundles_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_inventory_bundles_ws_id(request.path)?;

    // Only GET is migrated. Every other method (POST/PUT/PATCH/DELETE) must fall
    // through to the still-active Next.js route, so return `None` for them.
    Some(match request.method {
        "GET" => list_bundles_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn list_bundles_response(
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

    let query = match parse_query(request.url) {
        Ok(query) => query,
        Err(()) => {
            // The legacy route returns `{ errors: parsed.error.issues, message }`.
            // The Zod issue objects are not reproducible here, so emit an empty
            // `errors` array alongside the identical message + 400 status.
            return no_store_response(json_response(
                400,
                json!({ "errors": [], "message": INVALID_QUERY_MESSAGE }),
            ));
        }
    };

    match fetch_bundles(&config.contact_data, outbound, &ws_id, &query).await {
        Ok(rows) => no_store_response(json_response(200, map_rpc_list(rows))),
        // The legacy GET handler re-throws repository errors, producing a
        // Next.js framework default 500. We emit a matching 500 status with a
        // JSON diagnostic message (see LOAD_FAILED_MESSAGE note above).
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

/// Mirrors `listBundles` (apps/web/src/lib/inventory/commerce/bundles.ts):
/// calls the `private.list_inventory_bundles` RPC with the service role and
/// returns the raw SETOF rows.
async fn fetch_bundles(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &BundleListQuery,
) -> Result<Vec<BundleListRow>, ()> {
    let rpc_url = contact_data.rpc_url(LIST_BUNDLES_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&json!({
        "p_limit": query.limit,
        "p_offset": query.offset,
        "p_search": query.search,
        "p_status": query.status,
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

    // A SETOF-returning RPC over PostgREST yields a JSON array of rows.
    response.json::<Vec<BundleListRow>>().map_err(|_| ())
}

/// Mirrors `mapRpcList(data, 'bundle')`:
/// `count = rows[0]?.total_count ?? 0`, `data = rows.map(r => r.bundle).filter(Boolean)`.
fn map_rpc_list(rows: Vec<BundleListRow>) -> Value {
    let count = rows.first().and_then(|row| row.total_count).unwrap_or(0);
    let data: Vec<Value> = rows
        .into_iter()
        .filter_map(|row| row.bundle)
        // `filter(Boolean)` drops null / falsy bundle values.
        .filter(|bundle| !bundle.is_null())
        .collect();

    json!({ "count": count, "data": data })
}

/// Parses + validates `listQuerySchema(BundleStatusSchema)`. Returns `Err(())`
/// for any value the Zod schema would reject (the legacy route surfaces that as
/// 400). Unknown query keys are ignored, matching Zod's default key-stripping.
fn parse_query(request_url: Option<&str>) -> Result<BundleListQuery, ()> {
    let mut page_raw: Option<String> = None;
    let mut page_size_raw: Option<String> = None;
    let mut q_raw: Option<String> = None;
    let mut status_raw: Option<String> = None;

    if let Some(url) = request_url.and_then(|url| url::Url::parse(url).ok()) {
        // Mirror `Object.fromEntries(searchParams.entries())`: the last
        // occurrence of a repeated key wins.
        for (key, value) in url.query_pairs() {
            let value = value.into_owned();
            match key.as_ref() {
                "page" => page_raw = Some(value),
                "pageSize" => page_size_raw = Some(value),
                "q" => q_raw = Some(value),
                "status" => status_raw = Some(value),
                _ => {}
            }
        }
    }

    // `page`: z.coerce.number().int().min(1).optional()
    let page = parse_optional_int(page_raw.as_deref(), MIN_PAGE, i64::MAX)?.unwrap_or(DEFAULT_PAGE);
    // `pageSize`: z.coerce.number().int().min(1).max(100).optional()
    let page_size = parse_optional_int(page_size_raw.as_deref(), MIN_PAGE_SIZE, MAX_PAGE_SIZE)?;

    // `q`: z.string().trim().max(120).optional()
    let search = match q_raw {
        Some(value) => {
            let trimmed = value.trim();
            if trimmed.chars().count() > MAX_SEARCH_LEN {
                return Err(());
            }
            // `normalizeSearch`: empty -> null.
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_owned())
            }
        }
        None => None,
    };

    // `status`: z.union([BundleStatusSchema, z.literal('all')]).optional()
    // `listBundles` keeps a concrete status and drops `all`/missing to null.
    let status = match status_raw.as_deref() {
        None => None,
        Some("all") => None,
        Some(value @ ("draft" | "active" | "paused" | "archived")) => Some(value.to_owned()),
        Some(_) => return Err(()),
    };

    // `normalizePagination`: limit = clamp(pageSize ?? 25, 1, 100);
    // offset = (max(1, page ?? 1) - 1) * limit.
    let limit = page_size
        .unwrap_or(DEFAULT_PAGE_SIZE)
        .clamp(MIN_PAGE_SIZE, MAX_PAGE_SIZE);
    let offset = (page.max(MIN_PAGE) - 1) * limit;

    Ok(BundleListQuery {
        limit,
        offset,
        search,
        status,
    })
}

/// Mirrors `z.coerce.number().int().min(min).max(max).optional()`:
/// - missing -> `Ok(None)`
/// - present: coerced like JS `Number(value)`; must be a finite whole number
///   within `[min, max]`, otherwise the schema fails (`Err`).
fn parse_optional_int(raw: Option<&str>, min: i64, max: i64) -> Result<Option<i64>, ()> {
    let Some(raw) = raw else {
        return Ok(None);
    };

    // JS `Number('')` and `Number('  ')` are 0; otherwise parse as a float and
    // require it to be a finite whole number (Zod `.int()`).
    let trimmed = raw.trim();
    let number: f64 = if trimmed.is_empty() {
        0.0
    } else {
        trimmed.parse::<f64>().map_err(|_| ())?
    };

    if !number.is_finite() || number.fract() != 0.0 {
        return Err(());
    }

    let value = number as i64;
    if value < min || value > max {
        return Err(());
    }

    Ok(Some(value))
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

fn workspaces_inventory_bundles_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_INVENTORY_BUNDLES_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_INVENTORY_BUNDLES_PATH_SUFFIX)?;

    // A non-empty ws_id with no remaining slashes guarantees this is exactly the
    // `/inventory/bundles` collection route (and not e.g. `/inventory/bundles/:id`).
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn map_rpc_list_preserves_expanded_category_bundle_payloads() {
        let payload = map_rpc_list(vec![BundleListRow {
            bundle: Some(json!({
                "id": "bundle-1",
                "pricingMode": "selected_items",
                "categoryCandidateScope": "all_stock",
                "categoryComponents": [
                    {
                        "id": "component-1",
                        "categoryId": "category-1",
                        "quantityRequired": 3,
                        "freeQuantity": 1,
                        "discountStrategy": "cheapest_free",
                        "candidates": [
                            {
                                "listingId": "listing-1",
                                "productId": "product-1",
                                "unitId": "unit-1",
                                "warehouseId": "warehouse-1",
                                "price": 1200
                            }
                        ]
                    }
                ]
            })),
            total_count: Some(1),
        }]);

        assert_eq!(payload["count"], 1);
        assert_eq!(payload["data"][0]["pricingMode"], "selected_items");
        assert_eq!(payload["data"][0]["categoryCandidateScope"], "all_stock");
        assert_eq!(
            payload["data"][0]["categoryComponents"][0]["quantityRequired"],
            3
        );
        assert_eq!(
            payload["data"][0]["categoryComponents"][0]["candidates"][0]["listingId"],
            "listing-1"
        );
    }

    #[test]
    fn workspace_bundle_route_extracts_only_collection_paths() {
        assert_eq!(
            workspaces_inventory_bundles_ws_id("/api/v1/workspaces/ws-1/inventory/bundles"),
            Some("ws-1")
        );
        assert_eq!(
            workspaces_inventory_bundles_ws_id("/api/v1/workspaces/ws-1/inventory/bundles/id-1"),
            None
        );
    }
}
