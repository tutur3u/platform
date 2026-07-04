//! Handler for `GET /api/v1/workspaces/:wsId/habits/:habitId/stats`.
//!
//! Ports `apps/web/src/app/api/v1/workspaces/[wsId]/habits/[habitId]/stats/route.ts`.
//!
//! Returns habit metadata, streak info, and 30-day/4-week stats. The streak,
//! total-occurrences, and weekly-trend numbers all depend on the habit
//! recurrence calendar, which is reimplemented locally (the web app uses
//! `@tuturuuu/ai/scheduling`'s `getOccurrencesInRange` + the
//! `calculateHabitStreak` helper). Dates are computed in UTC, mirroring the
//! legacy route's reliance on `new Date()`/`toISOString()` on the server.
//!
//! IMPORTANT: this module is fully self-contained per the porting constraints.
//! The workspace-id normalization, membership verification, and habits-enabled
//! checks are COPIED from `workspace_habits_access.rs` (their original fns are
//! private there and cannot be re-exported without editing that file).

pub(super) use serde::Deserialize;
pub(super) use serde_json::json;

pub(super) use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

mod civil_date;
use civil_date::*;
mod db;
use db::*;
mod get_handler;
use get_handler::*;
mod helpers;
use helpers::*;
mod recurrence;
use recurrence::*;
mod streak;
use streak::*;
mod workspace_access;
use workspace_access::*;

pub(crate) async fn handle_workspaces_habits_habitid_stats_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, habit_id) = stats_path_params(request.path)?;

    Some(match request.method {
        "GET" => stats_response(config, request, raw_ws_id, habit_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}
