//! Handler for `GET /api/v1/workspaces/:wsId/habits/:habitId`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/habits/[habitId]/route.ts`.
//!
//! GET returns a single habit together with its scheduled calendar events and a
//! computed streak. The legacy auth model is:
//!   1. validate `habitId` is a GUID (else `400` "Invalid habit ID");
//!   2. resolve the authenticated session user (else `401` "Please sign in to
//!      view habits");
//!   3. normalize the workspace id (`personal`/`internal`/handle aliases);
//!   4. verify workspace membership (`MEMBER`), returning `500` "Failed to
//!      verify workspace membership" on lookup failure and `403` "You don't
//!      have access to this workspace" when not a member;
//!   5. gate on the `ENABLE_HABITS` workspace secret (else `404` "Not found",
//!      mirroring `habitsNotFoundResponse`);
//!   6. read `workspace_habits` (id + ws_id, deleted_at is null) with the admin
//!      (service-role) client; missing -> `404` "Habit not found".
//!
//! On success it reads `habit_calendar_events` (embedding
//! `workspace_calendar_events`) ordered by `occurrence_date` asc, computes the
//! streak from `habit_completions` (mirroring `fetchHabitStreak` ->
//! `calculateHabitStreak`), and returns `{ habit, events, streak }`.
//!
//! Behavior gaps / notes:
//!   * Only GET is migrated. PUT/DELETE (and any other method) return `None` so
//!     the worker falls through to the still-live Next.js route.
//!   * Like the legacy route, the events read and the completions read are
//!     best-effort: a failure surfaces as an empty list (`?? []` / `|| []`),
//!     not an error.
//!   * `normalizeWorkspaceId` failure surfaces as `500` "Failed to verify
//!     workspace membership" (matching the sibling habits handlers' reading of
//!     the legacy flow rather than the bare try/catch `Internal server error`).
//!   * The recurrence calendar + streak math is reimplemented locally (the web
//!     app uses `@tuturuuu/ai/scheduling`'s `getOccurrencesInRange` and the
//!     `calculateHabitStreak` helper); dates are computed in UTC, mirroring the
//!     server's `new Date()` / `toISOString()` reliance.
//!   * The workspace-id normalization, membership verification, and
//!     habits-enabled checks are COPIED from `workspace_habits_access.rs` /
//!     `workspaces_habits_habitid_stats.rs` because those fns are private and
//!     editing those modules is out of scope for this port.

pub(super) use serde::Deserialize;
pub(super) use serde_json::{Value, json};

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
mod recurrence;
use recurrence::*;
mod workspace_access;
use workspace_access::*;

#[cfg(test)]
mod tests;

pub(super) const ENABLE_HABITS_SECRET: &str = "ENABLE_HABITS";
pub(super) const INTERNAL_WORKSPACE_SLUG: &str = "internal";
pub(super) const PERSONAL_WORKSPACE_SLUG: &str = "personal";
pub(super) const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

// ============================================================================
// ROUTE ENTRY
// ============================================================================

pub(crate) async fn handle_workspaces_wsid_habits_habitid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, habit_id) = habit_path_params(request.path)?;

    Some(match request.method {
        "GET" => habit_get_response(config, request, raw_ws_id, habit_id, outbound).await,
        // PUT/DELETE (and any other method) are still served by the live Next.js
        // route, so fall through instead of returning a 405.
        _ => return None,
    })
}

// ============================================================================
// PATH MATCHING
// ============================================================================

/// Matches `/api/v1/workspaces/{wsId}/habits/{habitId}` and extracts the two
/// dynamic segments. Returns `None` (so other handlers / Next.js still run)
/// whenever the shape does not match — never panics on short paths.
pub(super) fn habit_path_params(path: &str) -> Option<(&str, &str)> {
    let segments: Vec<&str> = path
        .trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();

    if segments.len() != 6 {
        return None;
    }
    if segments.first() != Some(&"api")
        || segments.get(1) != Some(&"v1")
        || segments.get(2) != Some(&"workspaces")
        || segments.get(4) != Some(&"habits")
    {
        return None;
    }

    let ws_id = *segments.get(3)?;
    let habit_id = *segments.get(5)?;
    if ws_id.is_empty() || habit_id.is_empty() {
        return None;
    }

    Some((ws_id, habit_id))
}
