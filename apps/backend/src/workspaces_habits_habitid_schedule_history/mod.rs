//! Handler for
//! `GET /api/v1/workspaces/:wsId/habits/:habitId/schedule/history`.
//!
//! Ports
//! `apps/web/src/app/api/v1/workspaces/[wsId]/habits/[habitId]/schedule/history/route.ts`.
//!
//! Returns the per-occurrence schedule history of a habit within a date range
//! (default: today-30d .. today+30d). For every recurrence occurrence in the
//! range it derives a status of `completed | scheduled | skipped |
//! to_be_scheduled`, plus the linked calendar event (when any) and the active
//! skip's `revoked_at`. It also returns aggregate counts.
//!
//! The recurrence calendar (`getOccurrencesInRange` and friends from
//! `@tuturuuu/ai/scheduling`) is reimplemented locally. Dates are computed in
//! UTC, mirroring the legacy route's reliance on `new Date()` / `toISOString()`
//! running on the (UTC) server.
//!
//! IMPORTANT: this module is fully self-contained per the porting constraints.
//! The workspace-id normalization, membership verification, habits-enabled
//! checks, REST request senders, and the recurrence calendar are COPIED
//! (file-local) from `workspace_habits_access.rs` /
//! `workspaces_habits_habitid_stats.rs` because their original fns are private
//! there and editing those files is out of scope for this port.

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
mod workspace_access;
use workspace_access::*;

pub(crate) async fn handle_workspaces_habits_habitid_schedule_history_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, habit_id) = schedule_history_path_params(request.path)?;

    Some(match request.method {
        "GET" => schedule_history_response(config, request, raw_ws_id, habit_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}
