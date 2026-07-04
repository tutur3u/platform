//! Handler for `GET /api/v1/workspaces/:wsId/user-groups/:groupId/linked-products`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/linked-products/route.ts`.
//!
//! ## Auth
//!
//! The legacy route uses `getFinanceRouteContext` / `resolveFinanceRouteAuthContext`
//! and grants access when the caller has **either** `view_user_groups` or
//! `create_invoices`. This handler reproduces that by calling
//! `authorize_finance_permission` twice when the first check fails with
//! `Forbidden`:
//!
//! - First call checks `view_user_groups`.
//! - If that returns `Forbidden`, a second call checks `create_invoices`.
//! - Only when both calls return `Forbidden` does this handler respond `403`.
//!
//! ## Response shape
//!
//! ```json
//! { "items": [...], "count": 42 }
//! ```
//!
//! Each item has `id`, `name`, `description`, `warehouse_id`, and `unit_id`
//! fields, mirroring the legacy `.map()` over `user_group_linked_products` rows
//! with an embedded `workspace_products!inner` join.
//!
//! ## Behavior gaps
//!
//! - The legacy route accepts an `API_KEY` header auth path; `BackendRequest`
//!   does not expose arbitrary headers, so only the session / app-session path
//!   is implemented here.
//! - `POST` is not migrated; this handler returns `None` for non-GET methods so
//!   the Cloudflare worker falls through to the still-active Next.js route.
//! - The exact count is read from the PostgREST `Content-Range` response header
//!   (`Prefer: count=exact`) and falls back to `0` when the header is absent or
//!   unparseable, matching the legacy `count ?? 0` fallback.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorizationError, authorize_finance_permission},
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_MIDDLE: &str = "/user-groups/";
const PATH_SUFFIX: &str = "/linked-products";

const VIEW_USER_GROUPS_PERMISSION: &str = "view_user_groups";
const CREATE_INVOICES_PERMISSION: &str = "create_invoices";

/// Nested workspace_products columns embedded in a user_group_linked_products row.
#[derive(Deserialize)]
struct LinkedProductProduct {
    id: Option<String>,
    name: Option<String>,
    description: Option<String>,
}

/// A single row from `user_group_linked_products` with embedded join.
#[derive(Deserialize)]
struct LinkedProductRow {
    warehouse_id: Option<String>,
    unit_id: Option<String>,
    workspace_products: Option<LinkedProductProduct>,
}

/// A row from `workspace_user_groups` used for group existence check.
#[derive(Deserialize)]
#[allow(dead_code)]
struct GroupRow {
    id: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_user_groups_groupid_linked_products_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, group_id) = linked_products_segments(request.path)?;

    Some(match request.method {
        "GET" => linked_products_get(config, request, raw_ws_id, group_id, outbound).await,
        // POST and other methods are not migrated; fall through to Next.js.
        _ => return None,
    })
}

async fn linked_products_get(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    group_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Attempt permission check for `view_user_groups` first.  If Forbidden,
    // fall back to `create_invoices` (legacy OR gate).
    let authorization = match authorize_finance_permission(
        config,
        request,
        raw_ws_id,
        VIEW_USER_GROUPS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(auth) => auth,
        Err(FinanceAuthorizationError::Forbidden) => {
            // Try the second allowed permission.
            match authorize_finance_permission(
                config,
                request,
                raw_ws_id,
                CREATE_INVOICES_PERMISSION,
                outbound,
            )
            .await
            {
                Ok(auth) => auth,
                Err(
                    FinanceAuthorizationError::Unauthorized | FinanceAuthorizationError::NotFound,
                ) => {
                    return unauthorized_response();
                }
                Err(FinanceAuthorizationError::Forbidden) => {
                    return message_response(
                        403,
                        "Insufficient permissions to view linked products",
                    );
                }
                Err(FinanceAuthorizationError::Internal) => {
                    return error_response("Error fetching linked products");
                }
            }
        }
        Err(FinanceAuthorizationError::Unauthorized | FinanceAuthorizationError::NotFound) => {
            return unauthorized_response();
        }
        Err(FinanceAuthorizationError::Internal) => {
            return error_response("Error fetching linked products");
        }
    };

    // Verify the group exists in the workspace.
    match fetch_group(
        &config.contact_data,
        outbound,
        &authorization.ws_id,
        group_id,
    )
    .await
    {
        Ok(Some(_)) => {}
        Ok(None) => return message_response(404, "User group not found"),
        Err(()) => return error_response("Error fetching linked products"),
    }

    // Fetch the linked products with embedded workspace_products join.
    match fetch_linked_products(&config.contact_data, outbound, group_id).await {
        Ok((items, count)) => no_store_response(json_response(
            200,
            json!({ "items": items, "count": count }),
        )),
        Err(()) => error_response("Error fetching linked products"),
    }
}

/// Checks whether a user group with `group_id` exists in `ws_id`.
async fn fetch_group(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    group_id: &str,
) -> Result<Option<GroupRow>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_user_groups",
            &[
                ("select", "id".to_owned()),
                ("id", format!("eq.{group_id}")),
                ("ws_id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
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

    Ok(response
        .json::<Vec<GroupRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

/// Fetches linked product rows for `group_id` together with the embedded
/// `workspace_products` columns, and the exact total count.
async fn fetch_linked_products(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    group_id: &str,
) -> Result<(Vec<Value>, i64), ()> {
    let url = contact_data
        .rest_url(
            "user_group_linked_products",
            &[
                (
                    "select",
                    "warehouse_id,unit_id,workspace_products!inner(id,name,description)".to_owned(),
                ),
                ("group_id", format!("eq.{group_id}")),
                ("order", "created_at.desc".to_owned()),
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
                .with_header("apikey", service_role_key)
                // Request an exact count; PostgREST returns it in Content-Range.
                .with_header("Prefer", "count=exact"),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // Parse the Content-Range header to extract total count.
    // Format: "0-9/42" or "*/0" when empty.
    let count = parse_content_range_count(response.header("Content-Range"));

    let rows = response.json::<Vec<LinkedProductRow>>().map_err(|_| ())?;

    let items: Vec<Value> = rows
        .into_iter()
        .map(|row| {
            let product = row.workspace_products.unwrap_or(LinkedProductProduct {
                id: None,
                name: None,
                description: None,
            });
            json!({
                "id": product.id,
                "name": product.name,
                "description": product.description,
                "warehouse_id": row.warehouse_id,
                "unit_id": row.unit_id,
            })
        })
        .collect();

    Ok((items, count))
}

/// Extracts the total record count from a PostgREST `Content-Range` header
/// value such as `"0-9/42"` or `"*/0"`.  Returns `0` on any parse failure,
/// matching the legacy `count ?? 0` fallback.
fn parse_content_range_count(header: Option<&str>) -> i64 {
    header
        .and_then(|v| v.split('/').nth(1))
        .and_then(|total| total.parse::<i64>().ok())
        .unwrap_or(0)
}

/// Extracts `(raw_ws_id, group_id)` from a path matching
/// `/api/v1/workspaces/{wsId}/user-groups/{groupId}/linked-products`.
fn linked_products_segments(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    let (ws_id, group_id) = rest.split_once(PATH_MIDDLE)?;

    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }
    if group_id.is_empty() || group_id.contains('/') {
        return None;
    }

    Some((ws_id, group_id))
}

fn unauthorized_response() -> BackendResponse {
    message_response(401, "Unauthorized")
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response(message: &str) -> BackendResponse {
    no_store_response(json_response(500, json!({ "message": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn linked_products_segments_valid() {
        let ws = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
        let grp = "11111111-2222-3333-4444-555555555555";
        let path = format!("/api/v1/workspaces/{ws}/user-groups/{grp}/linked-products");
        assert_eq!(linked_products_segments(&path), Some((ws, grp)));
    }

    #[test]
    fn linked_products_segments_rejects_missing_suffix() {
        let path = "/api/v1/workspaces/ws1/user-groups/grp1/linked-products/extra";
        // The suffix strip will fail to match because PATH_SUFFIX is a prefix of the extra part.
        // Actually strip_suffix strips the literal "/linked-products", so adding "/extra" makes
        // the suffix "/linked-products/extra" which does not end in PATH_SUFFIX.
        assert!(linked_products_segments(path).is_none());
    }

    #[test]
    fn linked_products_segments_rejects_empty_ws_id() {
        let path = "/api/v1/workspaces//user-groups/grp1/linked-products";
        assert!(linked_products_segments(path).is_none());
    }

    #[test]
    fn linked_products_segments_rejects_empty_group_id() {
        let path = "/api/v1/workspaces/ws1/user-groups//linked-products";
        assert!(linked_products_segments(path).is_none());
    }

    #[test]
    fn linked_products_segments_rejects_slash_in_ws_id() {
        let path = "/api/v1/workspaces/ws1/extra/user-groups/grp1/linked-products";
        assert!(linked_products_segments(path).is_none());
    }

    #[test]
    fn parse_content_range_count_normal() {
        assert_eq!(parse_content_range_count(Some("0-9/42")), 42);
    }

    #[test]
    fn parse_content_range_count_empty_result() {
        assert_eq!(parse_content_range_count(Some("*/0")), 0);
    }

    #[test]
    fn parse_content_range_count_none() {
        assert_eq!(parse_content_range_count(None), 0);
    }

    #[test]
    fn parse_content_range_count_malformed() {
        assert_eq!(parse_content_range_count(Some("bad-header")), 0);
    }

    #[test]
    fn parse_content_range_count_single_page() {
        assert_eq!(parse_content_range_count(Some("0-2/3")), 3);
    }
}
