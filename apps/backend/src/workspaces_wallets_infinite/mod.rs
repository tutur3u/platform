//! Handler for `GET /api/v1/workspaces/:wsId/wallets/infinite`.
//!
//! Ports the legacy Next.js route that lived at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/wallets/infinite/route.ts`, which
//! delegated to `@tuturuuu/apis/finance/wallets/infinite/route` (which in turn
//! reuses the base wallets `GET` from `@tuturuuu/apis/finance/wallets/route`).
//!
//! The route loads the wallets a caller is allowed to see for a workspace (using
//! the same permission tiers as the base wallets route) and then applies the
//! infinite-scroll envelope: `q` filter (case-insensitive substring on `name`),
//! `offset`/`limit` pagination, and the `{ data, hasMore, nextOffset,
//! totalCount }` JSON shape.
//!
//! NOTE: This module is fully self-contained per the porting constraints. The
//! workspace-id normalization, supabase auth-token extraction, and effective
//! permission aggregation helpers are copied (file-local) from
//! `workspace_permission_check.rs`/`workspace_habits_access.rs` because those
//! variants are private to their modules. See the structured notes for the list
//! of copied helpers.

pub(crate) use base64::Engine;
pub(crate) use base64::engine::general_purpose::URL_SAFE;
pub(crate) use serde::Deserialize;
pub(crate) use serde_json::{Map, Value, json};
pub(crate) use std::collections::{BTreeMap, BTreeSet};

pub(crate) use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

pub(crate) const ADMIN_PERMISSION: &str = "admin";
pub(crate) const APP_SESSION_BEARER_PREFIX: &str = "ttr_app_";
pub(crate) const DEFAULT_LIMIT: i64 = 20;
pub(crate) const INTERNAL_WORKSPACE_SLUG: &str = "internal";
pub(crate) const MAX_LIMIT: i64 = 100;
pub(crate) const PERSONAL_WORKSPACE_SLUG: &str = "personal";
pub(crate) const PRIVATE_SCHEMA: &str = "private";
pub(crate) const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
pub(crate) const SUPABASE_AUTH_COOKIE_BASE64_PREFIX: &str = "base64-";
pub(crate) const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
pub(crate) const WALLETS_INFINITE_PATH_PREFIX: &str = "/api/v1/workspaces/";
pub(crate) const WALLETS_INFINITE_PATH_SUFFIX: &str = "/wallets/infinite";

// Wallet column selects mirror the legacy route.
pub(crate) const FULL_WALLET_SELECT: &str = "*";
pub(crate) const INVOICE_SAFE_WALLET_SELECT: &str = "id,name,type,currency,icon,image_src";

mod auth;
mod handler;
mod helpers;
mod outbound;
mod permissions;
mod types;
mod wallet_data;

use auth::*;
use handler::*;
use helpers::*;
use outbound::*;
use permissions::*;
use types::*;
use wallet_data::*;

pub(crate) async fn handle_workspaces_wallets_infinite_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = wallets_infinite_ws_id(request.path)?;

    Some(match request.method {
        "GET" => wallets_infinite_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

fn wallets_infinite_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WALLETS_INFINITE_PATH_PREFIX)?
        .strip_suffix(WALLETS_INFINITE_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}
