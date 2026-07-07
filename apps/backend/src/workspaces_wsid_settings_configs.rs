//! Handler for `GET /api/v1/workspaces/:wsId/settings/configs`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/settings/configs/route.ts`
//! (GET only; the legacy `PUT` upsert is intentionally left to the still-live
//! Next.js route, so this handler returns `None` for every non-GET method).
//!
//! Legacy GET behavior:
//!   1. Requires an authenticated Supabase session (bearer or auth cookie;
//!      `ttr_app_*` app-session tokens are accepted for the finance invoice
//!      default read path). Missing/invalid session -> `401 { "error":
//!      "Unauthorized" }`.
//!   2. Normalizes the workspace id (`personal`/`internal`/handle aliases ->
//!      canonical UUID) and resolves the caller's effective workspace
//!      permissions (the `getPermissions` equivalent). When no permission
//!      context can be resolved -> `404 { "error": "Not found" }`.
//!   3. Parses the `ids` query param (comma-separated, trimmed, de-duplicated,
//!      empties dropped). When the resulting set is empty the route returns
//!      `200 {}` (an empty object).
//!   4. Authorizes the read. A caller with `manage_workspace_settings` may read
//!      any requested config ids. A caller with `create_invoices` may read only
//!      the homogeneous invoice-default subset. Lacking either applicable
//!      permission -> `403 { "error": "Insufficient permissions to read
//!      workspace settings" }`.
//!   5. Reads `workspace_configs (id, value)` for the requested ids (excluding
//!      the synthetic `DATABASE_DEFAULT_INCLUDED_GROUPS` id) with the admin
//!      (service-role) client, and — when `DATABASE_DEFAULT_INCLUDED_GROUPS` is
//!      requested — reads `workspace_default_included_user_groups (group_id)`
//!      ordered by `created_at` ascending. Either read failing ->
//!      `500 { "error": "Failed to fetch workspace configs" }`.
//!   6. Success (`200`): an object keyed by each requested id. The
//!      `DATABASE_DEFAULT_INCLUDED_GROUPS` id maps to the comma-joined group ids
//!      (or `null` when none), and every other id maps to its stored config
//!      value (or `null` when absent).
//!
//! BEHAVIOR GAPS vs legacy:
//!   * The legacy route grants narrower read access to callers WITHOUT
//!     `manage_workspace_settings` when they request ONLY a homogeneous subset of
//!     configs they are otherwise entitled to:
//!       - report-render configs readable with `view_user_groups_reports`,
//!         `approve_reports`, or `manage_user_report_templates`;
//!       - profile-link defaults readable with `manage_user_profile_links`.
//!         Reproducing those alternate paths requires the caller's FULL permission
//!         set, which the shared `authorize_workspace_permission` helper does not
//!         surface (it checks a single permission). This handler reproduces the
//!         invoice-default alternate path because the finance app needs it, but
//!         still gates the report-render and profile-link alternate paths on
//!         `manage_workspace_settings`.
//!   * The legacy route runs `verifyWorkspaceMembershipType` separately, yielding
//!     `403 { "error": "Workspace access denied" }` for a non-member and
//!     `500 { "error": "Failed to verify workspace membership" }` on a lookup
//!     failure. The shared helper folds membership into permission resolution, so
//!     a non-member collapses to `404 { "error": "Not found" }` here.
//!   * The legacy empty-`ids` `200 {}` short-circuit happens for any member with a
//!     permission context (before the settings-permission gate). Here it happens
//!     only after the `manage_workspace_settings` gate, so a member lacking that
//!     permission gets `403` instead of `200 {}` for an empty `ids` request.
//!   * Rate limiting, IP-block, suspension, and step-up challenges from the
//!     legacy middleware are not reproduced; the worker relies on its own edge
//!     protections. The authenticated read path is otherwise faithful.

use serde_json::json;

mod data;
mod helpers;

use crate::{
    BackendConfig, BackendRequest, BackendResponse, finance_auth, json_response, no_store_response,
    outbound::OutboundHttpClient,
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};
use data::{fetch_default_included_groups, fetch_workspace_configs};
use helpers::{
    DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID, build_result, configs_ws_id,
    is_invoice_creation_default_read, parse_config_ids,
};

const CREATE_INVOICES_PERMISSION: &str = "create_invoices";
const FINANCE_APP_SESSION_TARGETS: [&str; 2] = ["finance", "platform"];
const MANAGE_WORKSPACE_SETTINGS_PERMISSION: &str = "manage_workspace_settings";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const NOT_FOUND_MESSAGE: &str = "Not found";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str =
    "Insufficient permissions to read workspace settings";
const CONFIGS_FETCH_FAILED_MESSAGE: &str = "Failed to fetch workspace configs";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

pub(crate) async fn handle_workspaces_wsid_settings_configs_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = configs_ws_id(request.path)?;

    Some(match request.method {
        "GET" => configs_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn configs_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return error_response(500, INTERNAL_SERVER_ERROR_MESSAGE);
    }

    let ids = parse_config_ids(request.url);
    let ws_id = match authorize_config_read(config, request, raw_ws_id, outbound, &ids).await {
        Ok(ws_id) => ws_id,
        Err(response) => return response,
    };

    if ids.is_empty() {
        return no_store_response(json_response(200, json!({})));
    }

    let should_resolve_default_included = ids
        .iter()
        .any(|id| id == DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID);
    let workspace_config_ids: Vec<String> = ids
        .iter()
        .filter(|id| id.as_str() != DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID)
        .cloned()
        .collect();

    let config_values = match fetch_workspace_configs(
        contact_data,
        outbound,
        &ws_id,
        &workspace_config_ids,
    )
    .await
    {
        Ok(values) => values,
        Err(()) => return error_response(500, CONFIGS_FETCH_FAILED_MESSAGE),
    };

    let included_groups = if should_resolve_default_included {
        match fetch_default_included_groups(contact_data, outbound, &ws_id).await {
            Ok(groups) => groups,
            Err(()) => return error_response(500, CONFIGS_FETCH_FAILED_MESSAGE),
        }
    } else {
        Vec::new()
    };

    no_store_response(json_response(
        200,
        build_result(&ids, &config_values, &included_groups),
    ))
}

async fn authorize_config_read(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
    ids: &[String],
) -> Result<String, BackendResponse> {
    if is_invoice_creation_default_read(ids) {
        return finance_auth::authorize_scoped_app_permission(
            config,
            request,
            raw_ws_id,
            CREATE_INVOICES_PERMISSION,
            &FINANCE_APP_SESSION_TARGETS,
            outbound,
        )
        .await
        .map(|authorization| authorization.ws_id)
        .map_err(invoice_permission_error_response);
    }

    authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        MANAGE_WORKSPACE_SETTINGS_PERMISSION,
        outbound,
    )
    .await
    .map(|authorization| authorization.ws_id)
    .map_err(workspace_permission_error_response)
}

fn workspace_permission_error_response(
    error: WorkspacePermissionAuthorizationError,
) -> BackendResponse {
    match error {
        WorkspacePermissionAuthorizationError::Unauthorized => {
            error_response(401, UNAUTHORIZED_MESSAGE)
        }
        WorkspacePermissionAuthorizationError::NotFound => error_response(404, NOT_FOUND_MESSAGE),
        WorkspacePermissionAuthorizationError::Forbidden => {
            error_response(403, INSUFFICIENT_PERMISSIONS_MESSAGE)
        }
        WorkspacePermissionAuthorizationError::Internal => {
            error_response(500, INTERNAL_SERVER_ERROR_MESSAGE)
        }
    }
}

fn invoice_permission_error_response(
    error: finance_auth::FinanceAuthorizationError,
) -> BackendResponse {
    match error {
        finance_auth::FinanceAuthorizationError::Unauthorized => {
            error_response(401, UNAUTHORIZED_MESSAGE)
        }
        finance_auth::FinanceAuthorizationError::NotFound => error_response(404, NOT_FOUND_MESSAGE),
        finance_auth::FinanceAuthorizationError::Forbidden => {
            error_response(403, INSUFFICIENT_PERMISSIONS_MESSAGE)
        }
        finance_auth::FinanceAuthorizationError::Internal => {
            error_response(500, INTERNAL_SERVER_ERROR_MESSAGE)
        }
    }
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
