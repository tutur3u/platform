//! Mirrors `apps/web/src/app/api/workspaces/[wsId]/wallets/route.ts` (GET only).
//!
//! That route delegates to `packages/apis/src/finance/wallets/route.ts` GET,
//! which is also what the `/api/v1/workspaces/:wsId/wallets` handler mirrors.
//! The only difference between this module and `workspaces_wallets` is the
//! mount path: this handler owns `/api/workspaces/:wsId/wallets` (no `v1`).
//!
//! Behavior gaps (none significant):
//!
//! - POST is not migrated; returning `None` falls through to the still-live
//!   Next.js route.
//! - `flattenWalletCreditList` is called via `attach_and_flatten_credit_data`;
//!   the TS double-call on the "no roles, default wallet" branch is a no-op for
//!   non-credit wallets and is reproduced faithfully.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const WALLETS_PATH_PREFIX: &str = "/api/workspaces/";
const WALLETS_PATH_SUFFIX: &str = "/wallets";

const FINANCE_APP_SESSION_TARGETS: [&str; 2] = ["finance", "platform"];
const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";
const GET_WALLET_CHECKPOINT_AUDIT_STATUS_RPC: &str = "get_wallet_checkpoint_audit_status";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const PRIVATE_SCHEMA: &str = "private";

const DEFAULT_WALLET_CONFIG_ID: &str = "default_wallet_id";

const MANAGE_FINANCE_PERMISSION: &str = "manage_finance";
const CREATE_INVOICES_PERMISSION: &str = "create_invoices";
const VIEW_TRANSACTIONS_PERMISSION: &str = "view_transactions";
const CHANGE_FINANCE_WALLETS_PERMISSION: &str = "change_finance_wallets";
const SET_FINANCE_WALLETS_ON_CREATE_PERMISSION: &str = "set_finance_wallets_on_create";

const FULL_WALLET_SELECT: &str = "*";
const INVOICE_SAFE_WALLET_SELECT: &str = "id,name,type,currency,icon,image_src";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const ERROR_FETCHING_TRANSACTION_WALLETS_MESSAGE: &str = "Error fetching transaction wallets";
const ERROR_FETCHING_USER_ROLES_MESSAGE: &str = "Error fetching user roles";
const ERROR_FETCHING_WHITELISTED_WALLETS_MESSAGE: &str = "Error fetching whitelisted wallets";
const ERROR_FETCHING_WALLET_DETAILS_MESSAGE: &str = "Error fetching wallet details";

mod auth;
mod db;
mod handler;
mod helpers;
mod http;
#[cfg(test)]
mod tests;
mod types;
mod wallet_loader;

use auth::*;
use db::*;
use handler::*;
use helpers::*;
use http::*;
use types::*;
use wallet_loader::*;

pub(crate) async fn handle_workspaces_wsid_wallets_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = wallets_ws_id(request.path)?;

    Some(match request.method {
        "GET" => wallets_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}
