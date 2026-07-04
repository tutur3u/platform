//! Handler for `/api/v1/workspaces/:wsId/habit-trackers`.
//!
//! Ports the **GET** method of the legacy Next.js route
//! `apps/web/src/app/api/v1/workspaces/[wsId]/habit-trackers/route.ts`, which
//! returns a `HabitTrackerListResponse` (trackers + per-member streak
//! summaries, team summary, leaderboards). Other HTTP methods (POST) are NOT
//! migrated yet: this handler returns `None` for them so the Cloudflare worker
//! falls through to the still-active Next.js route.
//!
//! Auth + gating mirrors the legacy `createHabitTrackerRouteContext`:
//!   1. Resolve the Supabase auth user from the bearer token (401 otherwise).
//!   2. Normalize the workspace id (personal / internal / handle / uuid).
//!   3. Verify the caller is a workspace MEMBER (403 / 500 otherwise).
//!   4. Require the `ENABLE_HABITS` workspace secret to equal `"true"` (404
//!      otherwise).
//!
//! All Supabase reads use the service-role key (the legacy service layer runs
//! through `sbAdmin`, the admin client), matching `workspace_habits_access.rs`.
//!
//! NOTE FOR INTEGRATOR: the workspace-normalization + membership + habits-secret
//! helpers below are intentionally COPIED (file-local) from
//! `workspace_habits_access.rs` because that module exposes them only as
//! private fns. This module does not edit any existing file. If those helpers
//! are ever promoted to `pub(crate)`, the copies here can be replaced.

pub(crate) use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};
pub(crate) use serde::Deserialize;
pub(crate) use serde_json::{Value, json};

pub(crate) const ENABLE_HABITS_SECRET: &str = "ENABLE_HABITS";
pub(crate) const INTERNAL_WORKSPACE_SLUG: &str = "internal";
pub(crate) const PERSONAL_WORKSPACE_SLUG: &str = "personal";
pub(crate) const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

pub(crate) const PATH_PREFIX: &str = "/api/v1/workspaces/";
pub(crate) const PATH_SUFFIX: &str = "/habit-trackers";

pub(crate) const SIGN_IN_MESSAGE: &str = "Please sign in to use habit trackers";
pub(crate) const ACCESS_DENIED_MESSAGE: &str = "Workspace access denied";
pub(crate) const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace membership";
pub(crate) const NOT_FOUND_MESSAGE: &str = "Not found";
pub(crate) const INTERNAL_ERROR_MESSAGE: &str = "Internal server error";

mod db_trackers;
mod db_workspace;
mod get_handler;
mod helpers;
mod models;
mod normalizers;
mod response;
mod streak_engine;

use db_trackers::*;
use db_workspace::*;
use get_handler::*;
use helpers::*;
use models::*;
use normalizers::*;
use response::*;
use streak_engine::*;

pub(crate) async fn handle_workspaces_habit_trackers_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = collection_ws_id(request.path)?;

    Some(match request.method {
        "GET" => handle_get(config, request, raw_ws_id, outbound).await,
        // Every other method (e.g. POST) is still served by the Next.js route.
        _ => return None,
    })
}

fn collection_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}
