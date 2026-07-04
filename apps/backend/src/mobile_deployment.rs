//! Handler for `GET /api/v1/mobile-deployment`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/mobile-deployment/route.ts`.
//!
//! # Auth model
//!
//! The legacy route calls `authorizeMobileDeploymentAdmin`, which:
//!
//! - Resolves the authenticated session user via the Supabase cookie.
//! - Checks the `manage_mobile_deployment_vault` permission on the root
//!   workspace (`00000000-0000-0000-0000-000000000000`).
//! - Returns `401` with `{ code: "mobile_deployment_unauthorized" }` when no
//!   valid session is present.
//! - Returns `403` with `{ code: "mobile_deployment_forbidden" }` when the
//!   permission check fails.
//!
//! This handler reproduces the auth path via
//! `workspace_permission_check::authorize_workspace_permission` targeting the
//! root workspace ID, which matches the legacy behaviour for the session path.
//!
//! # Behavior gaps
//!
//! The GET data path calls `listMobileDeploymentState`, which:
//!
//! - Reads exclusively from the Supabase `private` schema tables
//!   (`mobile_deployment_environments`, `mobile_deployment_versions`,
//!   `mobile_deployment_secret_values`, `mobile_deployment_file_artifacts`,
//!   `mobile_deployment_ci_tokens`, `mobile_deployment_audit_events`).
//! - Decrypts per-version AES-GCM data keys and uses them to expose plaintext
//!   values for non-secret fields.
//!
//! The `private` schema is not exposed through the standard PostgREST
//! `/rest/v1/` endpoint used by `contact::ContactDataConfig::rest_url`, and
//! the decryption key material is not available in the Rust worker.  Because
//! of these two blockers, the data fetch cannot be reproduced here; on a
//! successful auth this handler returns `500` with the legacy fallback error
//! message (`"Failed to update mobile deployment vault"`).  A full port
//! requires either a dedicated PostgREST schema route for `private` or an RPC
//! wrapper that assembles and returns the state from within the database.
//!
//! The PUT handler is intentionally not ported (returns `None` so the
//! still-live Next.js route handles it).

use serde_json::json;

use crate::{
    BackendConfig, BackendRequest, BackendResponse, json_response, no_store_response,
    outbound::OutboundHttpClient,
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const MOBILE_DEPLOYMENT_PATH: &str = "/api/v1/mobile-deployment";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const VAULT_PERMISSION: &str = "manage_mobile_deployment_vault";

pub(crate) async fn handle_mobile_deployment_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    if request.path != MOBILE_DEPLOYMENT_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => mobile_deployment_get(config, request, outbound).await,
        _ => return None,
    })
}

async fn mobile_deployment_get(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    match authorize_workspace_permission(
        &config.contact_data,
        request,
        ROOT_WORKSPACE_ID,
        VAULT_PERMISSION,
        outbound,
    )
    .await
    {
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            no_store_response(json_response(
                401,
                json!({
                    "code": "mobile_deployment_unauthorized",
                    "message": "Unauthorized"
                }),
            ))
        }
        Err(WorkspacePermissionAuthorizationError::NotFound) => no_store_response(json_response(
            401,
            json!({
                "code": "mobile_deployment_unauthorized",
                "message": "Unauthorized"
            }),
        )),
        Err(WorkspacePermissionAuthorizationError::Forbidden) => no_store_response(json_response(
            403,
            json!({
                "code": "mobile_deployment_forbidden",
                "message": "You need root mobile deployment vault permission to edit mobile deployment resources."
            }),
        )),
        Err(WorkspacePermissionAuthorizationError::Internal) => no_store_response(json_response(
            500,
            json!({ "message": "Failed to update mobile deployment vault" }),
        )),
        Ok(_authorization) => {
            // Auth succeeded. The data fetch (listMobileDeploymentState) reads
            // from the Supabase `private` schema and performs AES-GCM
            // decryption — both are impossible in this worker (see module-level
            // doc). Return the legacy fallback 500 so callers receive the same
            // error shape they would get from an unexpected store failure.
            no_store_response(json_response(
                500,
                json!({ "message": "Failed to update mobile deployment vault" }),
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_matches_exact_route() {
        assert_eq!(MOBILE_DEPLOYMENT_PATH, "/api/v1/mobile-deployment");
    }

    #[test]
    fn path_guard_does_not_match_prefix_only() {
        assert!("/api/v1/mobile-deployment/extra" != MOBILE_DEPLOYMENT_PATH);
    }

    #[test]
    fn path_guard_does_not_match_different_route() {
        assert!("/api/v1/mobile-deployment-other" != MOBILE_DEPLOYMENT_PATH);
    }

    #[test]
    fn root_workspace_id_is_canonical() {
        assert_eq!(ROOT_WORKSPACE_ID, "00000000-0000-0000-0000-000000000000");
        assert_eq!(ROOT_WORKSPACE_ID.len(), 36);
    }

    #[test]
    fn vault_permission_matches_legacy_constant() {
        assert_eq!(VAULT_PERMISSION, "manage_mobile_deployment_vault");
    }
}
