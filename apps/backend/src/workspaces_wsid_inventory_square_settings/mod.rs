//! GET handler for `/api/v1/workspaces/:wsId/inventory/square-settings`.
//!
//! Ported from:
//! `apps/web/src/app/api/v1/workspaces/[wsId]/inventory/square-settings/route.ts`
//!
//! # Auth model
//!
//! Identical to the Polar-settings handler: inventory app-session token **or**
//! Supabase access token → workspace membership check (MEMBER) → effective
//! permissions check → `canManageInventorySetup`.
//!
//! # Behaviour gaps vs legacy (GET only)
//!
//! - The readiness `webhook_signature_missing` issue is detected by checking
//!   whether `webhook_signature_key_encrypted` is non-null in the connections
//!   row.  The field is read only for presence — its encrypted bytes are never
//!   returned to the caller, matching the legacy behaviour.
//! - The `scopes_missing` readiness issue compares connection scopes against
//!   the six canonical Square OAuth scopes hard-coded in this file (mirroring
//!   the `SQUARE_OAUTH_SCOPES` constant from `square/types.ts`).
//! - PUT (and any other method) is **not** migrated; this handler returns
//!   `None` for non-GET methods so the Next.js route still handles them.

pub(super) use serde::{Deserialize, Serialize};
pub(super) use serde_json::{Value, json};

pub(super) use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

pub(super) const ADMIN_PERMISSION: &str = "admin";
pub(super) const FORBIDDEN_MESSAGE: &str = "Forbidden";
pub(super) const FAILED_TO_LOAD_MESSAGE: &str = "Failed to load Square settings";
pub(super) const INTERNAL_WORKSPACE_SLUG: &str = "internal";
pub(super) const INVENTORY_APP_SESSION_TARGETS: [&str; 1] = ["inventory"];
pub(super) const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
pub(super) const NOT_FOUND_MESSAGE: &str = "Not found";
pub(super) const PERSONAL_WORKSPACE_SLUG: &str = "personal";
pub(super) const PRIVATE_SCHEMA: &str = "private";
pub(super) const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
pub(super) const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";

pub(super) const PATH_PREFIX: &str = "/api/v1/workspaces/";
pub(super) const PATH_SUFFIX: &str = "/inventory/square-settings";

/// Permissions that satisfy `canManageInventorySetup`.
///
/// `admin` is handled via `has_all_permissions` (workspace creator / admin
/// shortcut) and is not listed here.
pub(super) const MANAGE_INVENTORY_SETUP_PERMISSIONS: [&str; 4] = [
    "manage_inventory_setup",
    "create_inventory",
    "update_inventory",
    "delete_inventory",
];

/// Mirrors `SQUARE_OAUTH_SCOPES` from `square/types.ts`.
pub(super) const SQUARE_OAUTH_SCOPES: [&str; 6] = [
    "MERCHANT_PROFILE_READ",
    "ORDERS_READ",
    "ORDERS_WRITE",
    "PAYMENTS_READ",
    "PAYMENTS_WRITE",
    "DEVICE_CREDENTIAL_MANAGEMENT",
];

// ---------------------------------------------------------------------------
// Submodules
// ---------------------------------------------------------------------------

mod types;
use types::*;

mod helpers;
use helpers::*;

mod db;
use db::*;

mod auth;
use auth::*;

mod handler;
use handler::*;

#[cfg(test)]
mod tests;

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_inventory_square_settings_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = extract_ws_id(request.path)?;

    Some(match request.method {
        "GET" => get_response(config, request, raw_ws_id, outbound).await,
        // PUT and all other methods fall through to the still-live Next.js route.
        _ => return None,
    })
}
