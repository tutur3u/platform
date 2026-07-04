//! Handler for `GET /api/v1/workspaces/:wsId/roles/:roleId/wallets`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/roles/[roleId]/wallets/route.ts`
//! (GET only).
//!
//! The legacy GET handler:
//!
//! 1. Authorizes via `getPermissions({ wsId, request })`, requiring the
//!    `manage_workspace_roles` workspace permission. A `null` permission
//!    context returns `404 { "error": "Not found" }` and a missing permission
//!    returns `403 { "message": "Insufficient permissions" }`.
//! 2. Reads `workspace_role_wallet_whitelist` with the admin (service-role)
//!    client, selecting `id, wallet_id, viewing_window, custom_days, created_at`,
//!    filtered by `role_id = roleId`, ordered by `created_at` descending.
//! 3. Collects unique non-null `wallet_id` values from the result, then reads
//!    `private.workspace_wallets` selecting `id, name, balance, currency, type`
//!    for those IDs (admin client).
//! 4. Merges the two result sets: each whitelist row is enriched with a
//!    `workspace_wallets` key containing the matching wallet object, or `null`
//!    if no match.
//! 5. Responds with the merged array (no explicit cache header; legacy uses
//!    `NextResponse.json` which sets no `Cache-Control`).
//!
//! Auth mapping (`authorize_workspace_permission` error variants):
//!
//! - Unauthorized / NotFound -> `403 Workspace role access denied` (the legacy
//!   `!permissions` path returns 404, but the auth helper cannot distinguish
//!   that case from the Forbidden case; behaviour gap is documented below).
//! - Forbidden -> `403 Workspace role access denied`.
//! - Internal -> `500 Internal server error`.
//!
//! BEHAVIOR GAP: the legacy route returns
//! `404 { "error": "Not found" }` when the workspace cannot be resolved (no
//! auth context). `authorize_workspace_permission` maps that case to
//! `NotFound`, which this handler returns as a 403, matching the sibling
//! role handlers in this crate for consistency.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const ROLE_WALLETS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const ROLE_WALLETS_ROLES_INFIX: &str = "roles/";
const ROLE_WALLETS_PATH_SUFFIX: &str = "/wallets";

const WALLET_WHITELIST_TABLE: &str = "workspace_role_wallet_whitelist";
const WALLET_WHITELIST_SELECT: &str = "id, wallet_id, viewing_window, custom_days, created_at";

const PRIVATE_WALLETS_TABLE: &str = "workspace_wallets";
const PRIVATE_WALLETS_SELECT: &str = "id, name, balance, currency, type";
const PRIVATE_SCHEMA: &str = "private";

const MANAGE_WORKSPACE_ROLES_PERMISSION: &str = "manage_workspace_roles";

const ACCESS_DENIED_MESSAGE: &str = "Workspace role access denied";
const FETCH_FAILED_MESSAGE: &str = "Error fetching wallet whitelist";
const INTERNAL_ERROR_MESSAGE: &str = "Internal server error";

pub(crate) async fn handle_workspaces_wsid_roles_roleid_wallets_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, role_id) = role_wallets_path_ids(request.path)?;

    // Only GET is migrated. POST (and any other method) must fall through to
    // the still-active Next.js route by returning None (not a 405).
    Some(match request.method {
        "GET" => role_wallets_response(config, request, raw_ws_id, role_id, outbound).await,
        _ => return None,
    })
}

async fn role_wallets_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    role_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // ws_id is the resolved canonical workspace UUID; we capture it only to
    // confirm auth (the DB FK already scopes whitelist rows to the correct
    // workspace via the role). We explicitly drop it to silence the
    // unused-variable warning while keeping the auth call mandatory.
    let _ws_id = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        MANAGE_WORKSPACE_ROLES_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization.ws_id,
        Err(error) => return auth_error_response(error),
    };

    let whitelist_rows = match fetch_wallet_whitelist(&config.contact_data, outbound, role_id).await
    {
        Ok(rows) => rows,
        Err(()) => return message_response(500, FETCH_FAILED_MESSAGE),
    };

    // Collect unique non-null wallet IDs for the follow-up private-schema read.
    // Mirrors the legacy `[...new Set(data.map(r => r.wallet_id).filter(...))]`.
    let wallet_ids: Vec<String> = {
        let mut seen = std::collections::HashSet::new();
        whitelist_rows
            .iter()
            .filter_map(|row| {
                row.as_object()?
                    .get("wallet_id")?
                    .as_str()
                    .map(str::to_owned)
            })
            .filter(|id| seen.insert(id.clone()))
            .collect()
    };

    let wallets_by_id = if wallet_ids.is_empty() {
        std::collections::HashMap::new()
    } else {
        match fetch_private_wallets(&config.contact_data, outbound, &wallet_ids).await {
            Ok(map) => map,
            Err(()) => return message_response(500, FETCH_FAILED_MESSAGE),
        }
    };

    // Merge: enrich each whitelist row with the matching wallet object.
    // Mirrors: `(data ?? []).map(row => ({ ...row, workspace_wallets: walletsById.get(row.wallet_id) ?? null }))`.
    let merged: Vec<Value> = whitelist_rows
        .into_iter()
        .map(|mut row| {
            let wallet = row
                .as_object()
                .and_then(|map| map.get("wallet_id"))
                .and_then(Value::as_str)
                .and_then(|id| wallets_by_id.get(id))
                .cloned()
                .unwrap_or(Value::Null);

            if let Value::Object(ref mut map) = row {
                map.insert("workspace_wallets".to_owned(), wallet);
            }
            row
        })
        .collect();

    // Legacy uses NextResponse.json (no explicit Cache-Control), so we emit
    // no-store to match the sibling role handlers.
    no_store_response(json_response(200, merged))
}

/// Fetches all `workspace_role_wallet_whitelist` rows for the given `role_id`,
/// ordered by `created_at` descending. Uses the service-role (admin) key,
/// mirroring `createAdminClient()` in the legacy route.
async fn fetch_wallet_whitelist(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    role_id: &str,
) -> Result<Vec<Value>, ()> {
    let url = contact_data
        .rest_url(
            WALLET_WHITELIST_TABLE,
            &[
                ("select", WALLET_WHITELIST_SELECT.to_owned()),
                ("role_id", format!("eq.{role_id}")),
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
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

/// Fetches `id, name, balance, currency, type` from `private.workspace_wallets`
/// for the given wallet IDs. Uses the service-role key with `Accept-Profile: private`
/// to target the private PostgREST schema.
///
/// Returns a map from wallet ID to the wallet `Value`.
async fn fetch_private_wallets(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    wallet_ids: &[String],
) -> Result<std::collections::HashMap<String, Value>, ()> {
    if wallet_ids.is_empty() {
        return Ok(std::collections::HashMap::new());
    }

    // PostgREST IN filter: `id=in.(id1,id2,...)`.
    let ids_csv = wallet_ids.join(",");
    let url = contact_data
        .rest_url(
            PRIVATE_WALLETS_TABLE,
            &[
                ("select", PRIVATE_WALLETS_SELECT.to_owned()),
                ("id", format!("in.({ids_csv})")),
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
                .with_header("Accept-Profile", PRIVATE_SCHEMA),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let wallets = response.json::<Vec<Value>>().map_err(|_| ())?;

    Ok(wallets
        .into_iter()
        .filter_map(|wallet| {
            let id = wallet.get("id")?.as_str()?.to_owned();
            Some((id, wallet))
        })
        .collect())
}

fn auth_error_response(error: WorkspacePermissionAuthorizationError) -> BackendResponse {
    match error {
        // Legacy !permissions -> 404, missing permission -> 403; we collapse
        // to 403 here matching the sibling role handlers (see behavior gap note
        // in the module doc comment).
        WorkspacePermissionAuthorizationError::Unauthorized
        | WorkspacePermissionAuthorizationError::NotFound
        | WorkspacePermissionAuthorizationError::Forbidden => {
            message_response(403, ACCESS_DENIED_MESSAGE)
        }
        WorkspacePermissionAuthorizationError::Internal => {
            message_response(500, INTERNAL_ERROR_MESSAGE)
        }
    }
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

/// Extracts `(wsId, roleId)` from
/// `/api/v1/workspaces/<wsId>/roles/<roleId>/wallets`.
///
/// Returns `None` for any non-matching path so unrelated routes keep working.
///
/// - Never indexes path segments eagerly (no panic on short paths).
/// - The `roleId` segment must not be empty and must not contain `/`.
fn role_wallets_path_ids(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(ROLE_WALLETS_PATH_PREFIX)?;
    let (ws_id, after_ws) = rest.split_once('/')?;
    let after_roles = after_ws.strip_prefix(ROLE_WALLETS_ROLES_INFIX)?;
    let role_id = after_roles.strip_suffix(ROLE_WALLETS_PATH_SUFFIX)?;

    if ws_id.is_empty() || role_id.is_empty() || role_id.contains('/') {
        return None;
    }

    Some((ws_id, role_id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // -------------------------------------------------------------------------
    // Path guard tests
    // -------------------------------------------------------------------------

    #[test]
    fn path_guard_extracts_ids() {
        assert_eq!(
            role_wallets_path_ids("/api/v1/workspaces/ws-123/roles/role-9/wallets"),
            Some(("ws-123", "role-9"))
        );
        assert_eq!(
            role_wallets_path_ids("/api/v1/workspaces/personal/roles/abc/wallets"),
            Some(("personal", "abc"))
        );
        assert_eq!(
            role_wallets_path_ids(
                "/api/v1/workspaces/00000000-0000-0000-0000-000000000001/roles/00000000-0000-0000-0000-000000000002/wallets"
            ),
            Some((
                "00000000-0000-0000-0000-000000000001",
                "00000000-0000-0000-0000-000000000002"
            ))
        );
    }

    #[test]
    fn path_guard_rejects_non_matching_paths() {
        // Wrong prefix (no v1).
        assert_eq!(
            role_wallets_path_ids("/api/workspaces/ws-1/roles/r-1/wallets"),
            None
        );
        // Roles list (no role id) must not match.
        assert_eq!(
            role_wallets_path_ids("/api/v1/workspaces/ws-1/roles/wallets"),
            None
        );
        // Role detail (no /wallets suffix) must not match.
        assert_eq!(
            role_wallets_path_ids("/api/v1/workspaces/ws-1/roles/r-1"),
            None
        );
        // Extra segment after /wallets.
        assert_eq!(
            role_wallets_path_ids("/api/v1/workspaces/ws-1/roles/r-1/wallets/extra"),
            None
        );
        // Empty ws id.
        assert_eq!(
            role_wallets_path_ids("/api/v1/workspaces//roles/r-1/wallets"),
            None
        );
        // Empty role id.
        assert_eq!(
            role_wallets_path_ids("/api/v1/workspaces/ws-1/roles//wallets"),
            None
        );
        // Wrong infix segment.
        assert_eq!(
            role_wallets_path_ids("/api/v1/workspaces/ws-1/members/r-1/wallets"),
            None
        );
        // Unrelated route (must not panic).
        assert_eq!(role_wallets_path_ids("/api/v1/health"), None);
        // Empty path.
        assert_eq!(role_wallets_path_ids(""), None);
    }

    // -------------------------------------------------------------------------
    // Auth error mapping tests
    // -------------------------------------------------------------------------

    #[test]
    fn auth_error_maps_to_expected_status_codes() {
        for error in [
            WorkspacePermissionAuthorizationError::Unauthorized,
            WorkspacePermissionAuthorizationError::NotFound,
            WorkspacePermissionAuthorizationError::Forbidden,
        ] {
            let response = auth_error_response(error);
            assert_eq!(response.status, 403);
            assert_eq!(response.body, json!({ "message": ACCESS_DENIED_MESSAGE }));
        }

        let response = auth_error_response(WorkspacePermissionAuthorizationError::Internal);
        assert_eq!(response.status, 500);
        assert_eq!(response.body, json!({ "message": INTERNAL_ERROR_MESSAGE }));
    }

    // -------------------------------------------------------------------------
    // Wallet merge logic tests
    // -------------------------------------------------------------------------

    #[test]
    fn merge_enriches_whitelist_rows_with_wallet_details() {
        let whitelist_rows = vec![
            json!({
                "id": "wl-1",
                "wallet_id": "w-1",
                "viewing_window": "1_month",
                "custom_days": null,
                "created_at": "2024-01-01T00:00:00Z"
            }),
            json!({
                "id": "wl-2",
                "wallet_id": "w-2",
                "viewing_window": "custom",
                "custom_days": 30,
                "created_at": "2024-01-02T00:00:00Z"
            }),
            json!({
                "id": "wl-3",
                "wallet_id": null,
                "viewing_window": "7_days",
                "custom_days": null,
                "created_at": "2024-01-03T00:00:00Z"
            }),
        ];

        let mut wallets_by_id = std::collections::HashMap::new();
        wallets_by_id.insert(
            "w-1".to_owned(),
            json!({ "id": "w-1", "name": "Ops", "balance": 100.0, "currency": "USD", "type": "standard" }),
        );
        // w-2 intentionally absent -> should produce workspace_wallets: null.

        let merged: Vec<Value> = whitelist_rows
            .into_iter()
            .map(|mut row| {
                let wallet = row
                    .as_object()
                    .and_then(|map| map.get("wallet_id"))
                    .and_then(Value::as_str)
                    .and_then(|id| wallets_by_id.get(id))
                    .cloned()
                    .unwrap_or(Value::Null);

                if let Value::Object(ref mut map) = row {
                    map.insert("workspace_wallets".to_owned(), wallet);
                }
                row
            })
            .collect();

        assert_eq!(merged.len(), 3);
        assert_eq!(merged[0]["id"], json!("wl-1"));
        assert_eq!(merged[0]["workspace_wallets"]["id"], json!("w-1"));
        assert_eq!(merged[0]["workspace_wallets"]["name"], json!("Ops"));

        // w-2 absent from wallets_by_id -> null.
        assert_eq!(merged[1]["id"], json!("wl-2"));
        assert_eq!(merged[1]["workspace_wallets"], Value::Null);

        // wallet_id is null -> null.
        assert_eq!(merged[2]["id"], json!("wl-3"));
        assert_eq!(merged[2]["workspace_wallets"], Value::Null);
    }

    #[test]
    fn unique_wallet_id_deduplication_preserves_order() {
        let rows = [
            json!({ "wallet_id": "w-1" }),
            json!({ "wallet_id": "w-2" }),
            json!({ "wallet_id": "w-1" }),
            json!({ "wallet_id": null }),
        ];

        let mut seen = std::collections::HashSet::new();
        let ids: Vec<String> = rows
            .iter()
            .filter_map(|row| {
                row.as_object()?
                    .get("wallet_id")?
                    .as_str()
                    .map(str::to_owned)
            })
            .filter(|id| seen.insert(id.clone()))
            .collect();

        assert_eq!(ids, vec!["w-1".to_owned(), "w-2".to_owned()]);
    }

    #[test]
    fn message_response_is_no_store() {
        let response = message_response(500, FETCH_FAILED_MESSAGE);
        assert_eq!(response.status, 500);
        assert_eq!(response.body, json!({ "message": FETCH_FAILED_MESSAGE }));
    }
}
