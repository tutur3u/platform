//! Handler for `GET /api/v1/workspaces/:wsId/wallets/checkpoints/history`.
//!
//! Ports the legacy Next.js route
//! `apps/web/src/app/api/workspaces/[wsId]/wallets/checkpoints/history/route.ts`
//! (which delegates to
//! `packages/apis/src/finance/wallets/checkpoints/history/route.ts`).
//!
//! The legacy flow is:
//!   1. Resolve finance auth + `view_transactions` permission for the workspace.
//!   2. List wallets the caller can see (all wallets for `manage_finance`
//!      holders; otherwise role-whitelisted wallets, each with a viewing
//!      window).
//!   3. Read checkpoints from `private.workspace_wallet_checkpoints`, enrich
//!      each with a fresh ledger balance via the `get_wallet_ledger_balance_at`
//!      RPC, filter by viewing window, and normalize.
//!   4. Per-wallet interval listing via `list_wallet_checkpoint_intervals` RPC,
//!      window-filtered + decorated with wallet currency/name.
//!   5. Audit statuses via `get_wallet_checkpoint_audit_status` RPC,
//!      window-sanitized.
//!   6. Aggregate per-currency totals from the latest checkpoint per wallet.
//!
//! "Checkpoint storage missing" errors degrade gracefully to empty payloads,
//! exactly like the legacy route.

pub(super) use std::collections::{BTreeMap, HashMap};

pub(super) use serde::Deserialize;
pub(super) use serde_json::{Map, Value, json};

pub(super) use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorization, FinanceAuthorizationError, authorize_finance_permission},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

pub(super) const PATH_PREFIX: &str = "/api/workspaces/";
pub(super) const PATH_SUFFIX: &str = "/wallets/checkpoints/history";
pub(super) const PRIVATE_SCHEMA: &str = "private";
pub(super) const VIEW_TRANSACTIONS_PERMISSION: &str = "view_transactions";
pub(super) const MANAGE_FINANCE_PERMISSION: &str = "manage_finance";
pub(super) const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";

pub(super) const WALLET_CHECKPOINT_SELECT: &str = "id,wallet_id,checked_at,actual_balance,ledger_balance,currency,note,created_by,created_at,updated_at";

pub(super) const ERROR_FETCHING_CHECKPOINTS: &str = "Error fetching wallet checkpoints";
pub(super) const ERROR_FETCHING_HISTORY: &str = "Error fetching wallet checkpoint history";

pub(super) const DEFAULT_VIEWING_WINDOW_DAYS: i64 = 30;

mod checkpoints;
mod handler;
mod helpers;
mod outbound;
mod rpc;
mod totals;
mod types;
mod wallet_access;
mod window;

use checkpoints::*;
use handler::*;
use helpers::*;
use outbound::*;
use rpc::*;
use totals::*;
use types::*;
use wallet_access::*;
use window::*;

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wallets_checkpoints_history_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = match_path(request.path)?;

    Some(match request.method {
        "GET" => history_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}
