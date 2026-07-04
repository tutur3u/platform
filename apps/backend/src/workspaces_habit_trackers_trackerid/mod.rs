//! Handler for `/api/v1/workspaces/:wsId/habit-trackers/:trackerId`.
//!
//! Ports the **GET** method of the legacy Next.js route
//! `apps/web/src/app/api/v1/workspaces/[wsId]/habit-trackers/[trackerId]/route.ts`,
//! which returns a `HabitTrackerDetailResponse`:
//!   - `tracker`
//!   - `entries`  (recent entries for the tracker, sorted by `occurred_at`
//!     descending, truncated to 50, each augmented with a `member` field)
//!   - `current_member` (omitted when absent)
//!   - `team`
//!   - `member_summaries`
//!   - `leaderboard`
//!   - `current_period_metrics`
//!
//! The legacy route ALSO defines PATCH (update) and DELETE (archive). Those
//! methods are NOT migrated here: this handler returns `None` for them so the
//! Cloudflare worker falls through to the still-active Next.js route. Returning
//! a 405 would incorrectly reject still-valid mutations.
//!
//! Auth + gating mirrors the legacy `createHabitTrackerRouteContext`:
//!   1. `assertValidTrackerId(trackerId)` — invalid UUID -> 400
//!      "Invalid habit tracker ID" (runs before auth in the legacy route).
//!   2. Resolve the Supabase auth user from the bearer token (401 otherwise).
//!   3. Normalize the workspace id (personal / internal / handle / uuid).
//!   4. Verify the caller is a workspace MEMBER (403 / 500 otherwise).
//!   5. Require the `ENABLE_HABITS` workspace secret to equal `"true"` (404).
//!   6. Load the tracker (not archived) — 404 if missing.
//!
//! All Supabase reads use the service-role key (the legacy service layer runs
//! through `sbAdmin`, the admin client), matching `workspace_habits_access.rs`
//! and the sibling habit-tracker handlers.
//!
//! NOTE FOR INTEGRATOR: every helper below (workspace normalization, membership
//! / habits-secret checks, the streak engine, JSON normalizers, outbound REST
//! helpers) is intentionally COPIED file-local from the sibling modules
//! `workspaces_habit_trackers.rs` / `workspaces_habit_trackers_trackerid_entries.rs`
//! / `workspace_habits_access.rs`, because those modules expose them only as
//! private fns. This module edits no existing file. If those helpers are ever
//! promoted to `pub(crate)`, the copies here can be replaced.

pub(super) use std::collections::HashMap;

pub(super) use serde::Deserialize;
pub(super) use serde_json::{Map, Value, json};

pub(super) use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

mod db;
use db::*;
mod get_handler;
use get_handler::*;
mod helpers;
use helpers::*;
mod models;
use models::*;
mod normalizers;
use normalizers::*;
mod response_builder;
use response_builder::*;
mod serializers;
use serializers::*;
mod streak_engine;
use streak_engine::*;
mod workspace_access;
use workspace_access::*;

const ENABLE_HABITS_SECRET: &str = "ENABLE_HABITS";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const HABIT_TRACKERS_SEGMENT: &str = "/habit-trackers/";

const MAX_RECENT_ENTRIES: usize = 50;
const METRICS_TAIL: usize = 12;

// Error messages copied verbatim from the legacy HabitTrackerError usages so the
// JSON `{ "error": ... }` payloads match exactly.
const MSG_INVALID_TRACKER_ID: &str = "Invalid habit tracker ID";
const MSG_UNAUTHORIZED: &str = "Please sign in to use habit trackers";
const MSG_MEMBERSHIP_LOOKUP_FAILED: &str = "Failed to verify workspace membership";
const MSG_ACCESS_DENIED: &str = "Workspace access denied";
const MSG_NOT_FOUND: &str = "Not found";
const MSG_TRACKER_NOT_FOUND: &str = "Habit tracker not found";
const MSG_LOAD_TRACKER_FAILED: &str = "Failed to load habit tracker";
const MSG_INTERNAL_ERROR: &str = "Internal server error";

/// Typed error used internally to short-circuit with a JSON `{ "error": ... }`
/// response carrying a specific status + message.
struct HabitError {
    status: u16,
    message: &'static str,
}

impl HabitError {
    fn new(status: u16, message: &'static str) -> Self {
        Self { status, message }
    }
}

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_habit_trackers_trackerid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, tracker_id) = parse_path(request.path)?;

    Some(match request.method {
        "GET" => {
            match get_detail_response(config, request, raw_ws_id, tracker_id, outbound).await {
                Ok(response) => response,
                Err(err) => error_response(err.status, err.message),
            }
        }
        // Every non-migrated method (PATCH, DELETE, ...) must fall through to the
        // still-active Next.js route, NOT return a 405.
        _ => return None,
    })
}

/// Match `/api/v1/workspaces/{wsId}/habit-trackers/{trackerId}` and extract
/// `(wsId, trackerId)`. Both segments must be non-empty and contain no further
/// slashes. The trailing-slash and any sub-resource (e.g. `/entries`) cases are
/// rejected so this handler never shadows the collection or sub-routes.
fn parse_path(path: &str) -> Option<(&str, &str)> {
    let inner = path.strip_prefix(PATH_PREFIX)?;
    let (ws_id, tracker_id) = inner.split_once(HABIT_TRACKERS_SEGMENT)?;

    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }
    if tracker_id.is_empty() || tracker_id.contains('/') {
        return None;
    }

    Some((ws_id, tracker_id))
}
