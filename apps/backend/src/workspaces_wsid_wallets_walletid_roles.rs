//! Handler for `GET /api/v1/workspaces/:wsId/wallets/:walletId/roles`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/wallets/[walletId]/roles/route.ts`
//! (GET only; POST returns `None` so the still-live Next.js route handles it).
//!
//! The legacy GET handler:
//!
//! 1. Authorizes via `getPermissions({ wsId, request })`, requiring the
//!    `manage_workspace_roles` workspace permission. A `null` permission
//!    context returns `404 { "error": "Not found" }` and a missing permission
//!    returns `403 { "message": "Insufficient permissions" }`.
//! 2. Reads `workspace_role_wallet_whitelist` with the user (RLS) Supabase
//!    client, selecting `id, role_id, viewing_window, custom_days, created_at`
//!    plus the embedded `workspace_roles:role_id (id, name)` resource, filtered
//!    by `wallet_id = walletId` and ordered by `created_at` descending.
//! 3. Returns the array as JSON (no explicit `Cache-Control`; `NextResponse.json`
//!    sets none).
//!
//! Auth mapping (`authorize_workspace_permission` error variants):
//!
//! - Unauthorized / NotFound / Forbidden -> `403 { "message": "Insufficient permissions" }`
//! - Internal -> `500 { "message": "Error fetching role access list" }`
//!
//! BEHAVIOR GAP: the legacy route returns `404 { "error": "Not found" }` when
//! the workspace cannot be resolved (no auth context).
//! `authorize_workspace_permission` maps that case to `NotFound`, which this
//! handler collapses to `403`, matching the sibling role/wallet handlers in this
//! crate for consistency.
//!
//! BEHAVIOR GAP: the legacy GET reads with the caller's RLS client
//! (`createClient(req)`). This handler uses the service-role key after the
//! permission check passes, which bypasses RLS but is functionally equivalent
//! because `authorize_workspace_permission` has already confirmed the caller
//! holds `manage_workspace_roles` in the workspace.

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
const PATH_WALLETS_INFIX: &str = "wallets/";
const PATH_SUFFIX: &str = "/roles";

const WHITELIST_TABLE: &str = "workspace_role_wallet_whitelist";
const WHITELIST_SELECT: &str =
    "id,role_id,viewing_window,custom_days,created_at,workspace_roles:role_id(id,name)";

const MANAGE_WORKSPACE_ROLES_PERMISSION: &str = "manage_workspace_roles";

const ACCESS_DENIED_MESSAGE: &str = "Insufficient permissions";
const FETCH_FAILED_MESSAGE: &str = "Error fetching role access list";
const INTERNAL_ERROR_MESSAGE: &str = "Error fetching role access list";

pub(crate) async fn handle_workspaces_wsid_wallets_walletid_roles_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, wallet_id) = wallet_roles_path_ids(request.path)?;

    // Only GET is migrated; POST (and any other method) must fall through to
    // the still-active Next.js route by returning None (not a 405).
    Some(match request.method {
        "GET" => wallet_roles_response(config, request, raw_ws_id, wallet_id, outbound).await,
        _ => return None,
    })
}

async fn wallet_roles_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    wallet_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
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

    match fetch_wallet_roles(&config.contact_data, outbound, wallet_id).await {
        Ok(rows) => no_store_response(json_response(200, rows)),
        Err(()) => message_response(500, FETCH_FAILED_MESSAGE),
    }
}

/// Fetches all `workspace_role_wallet_whitelist` rows for the given `wallet_id`
/// with the embedded `workspace_roles` resource, ordered by `created_at`
/// descending. Uses the service-role (admin) key so RLS is bypassed; auth was
/// already confirmed by `authorize_workspace_permission`.
async fn fetch_wallet_roles(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    wallet_id: &str,
) -> Result<Vec<Value>, ()> {
    let url = contact_data
        .rest_url(
            WHITELIST_TABLE,
            &[
                ("select", WHITELIST_SELECT.to_owned()),
                ("wallet_id", format!("eq.{wallet_id}")),
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

fn auth_error_response(error: WorkspacePermissionAuthorizationError) -> BackendResponse {
    match error {
        // Legacy !permissions -> 404 { "error": "Not found" } and missing
        // permission -> 403 { "message": "Insufficient permissions" }.
        // We collapse Unauthorized/NotFound to 403 here, matching sibling
        // role/wallet handlers (see behavior gap note in the module doc comment).
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

/// Extracts `(wsId, walletId)` from
/// `/api/v1/workspaces/<wsId>/wallets/<walletId>/roles`.
///
/// Returns `None` for any non-matching path so unrelated routes keep working.
///
/// - Never indexes path segments eagerly (no panic on short paths).
/// - The `walletId` segment must be non-empty and must not contain `/`.
fn wallet_roles_path_ids(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let (ws_id, after_ws) = rest.split_once('/')?;
    let after_wallets = after_ws.strip_prefix(PATH_WALLETS_INFIX)?;
    let wallet_id = after_wallets.strip_suffix(PATH_SUFFIX)?;

    if ws_id.is_empty() || wallet_id.is_empty() || wallet_id.contains('/') {
        return None;
    }

    Some((ws_id, wallet_id))
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
            wallet_roles_path_ids("/api/v1/workspaces/ws-123/wallets/wallet-9/roles"),
            Some(("ws-123", "wallet-9"))
        );
        assert_eq!(
            wallet_roles_path_ids("/api/v1/workspaces/personal/wallets/abc/roles"),
            Some(("personal", "abc"))
        );
        assert_eq!(
            wallet_roles_path_ids(
                "/api/v1/workspaces/00000000-0000-0000-0000-000000000001/wallets/00000000-0000-0000-0000-000000000002/roles"
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
            wallet_roles_path_ids("/api/workspaces/ws-1/wallets/w-1/roles"),
            None
        );
        // Missing wallet id.
        assert_eq!(
            wallet_roles_path_ids("/api/v1/workspaces/ws-1/wallets//roles"),
            None
        );
        // Missing ws id.
        assert_eq!(
            wallet_roles_path_ids("/api/v1/workspaces//wallets/w-1/roles"),
            None
        );
        // Extra segment after /roles.
        assert_eq!(
            wallet_roles_path_ids("/api/v1/workspaces/ws-1/wallets/w-1/roles/extra"),
            None
        );
        // Wrong infix (no /wallets/).
        assert_eq!(
            wallet_roles_path_ids("/api/v1/workspaces/ws-1/members/w-1/roles"),
            None
        );
        // Missing /roles suffix.
        assert_eq!(
            wallet_roles_path_ids("/api/v1/workspaces/ws-1/wallets/w-1"),
            None
        );
        // Unrelated route (must not panic).
        assert_eq!(wallet_roles_path_ids("/api/v1/health"), None);
        // Empty path.
        assert_eq!(wallet_roles_path_ids(""), None);
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
    // message_response helper tests
    // -------------------------------------------------------------------------

    #[test]
    fn message_response_shapes_body_and_status() {
        let response = message_response(500, FETCH_FAILED_MESSAGE);
        assert_eq!(response.status, 500);
        assert_eq!(response.body, json!({ "message": FETCH_FAILED_MESSAGE }));
    }

    #[test]
    fn message_response_403_uses_access_denied_message() {
        let response = message_response(403, ACCESS_DENIED_MESSAGE);
        assert_eq!(response.status, 403);
        assert_eq!(response.body, json!({ "message": ACCESS_DENIED_MESSAGE }));
    }
}
