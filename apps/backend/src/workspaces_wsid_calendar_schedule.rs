//! Handler for `GET /api/v1/workspaces/:wsId/calendar/schedule`.
//!
//! Ports the GET path of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/calendar/schedule/route.ts`.
//! The POST method is NOT owned by this handler — `None` is returned for every
//! non-GET method so that Next.js continues to serve them.
//!
//! Legacy GET flow:
//!
//!   1. `resolveSessionAuthContext(request, { allowAppSessionAuth: true })`
//!      resolves the caller's Supabase session. Failure -> `401 { "error": "Unauthorized" }`.
//!   2. `verifyWorkspaceMembershipType({ wsId, userId, supabase })` with default
//!      `requiredType: 'MEMBER'`.
//!      Lookup failure -> `500 { "error": "Failed to verify workspace access" }`.
//!      Non-member -> `403 { "error": "You don't have access to this workspace" }`.
//!   3. Fetches `workspaces.personal` to determine `mode`.
//!   4. Fetches `workspace_scheduling_metadata` from the `private` Postgres schema
//!      (via `Accept-Profile: private` PostgREST header).
//!   5. Counts active auto-schedule habits in `workspace_habits`.
//!   6. Calls `fetchSchedulableTasksForWorkspace` to count auto-schedulable tasks.
//!   7. Returns `200` with metadata, statistics, and schedulable-item counts.
//!
//! Behavior gaps vs legacy:
//!
//!   * `fetchSchedulableTasksForWorkspace` is a multi-join query across tasks,
//!     task lists, and board memberships that is too complex to reproduce here.
//!     `autoScheduleTasks` is therefore always returned as `0`. Callers that
//!     rely on this count should use the still-live Next.js POST path or observe
//!     `statistics.tasksScheduled` from a prior scheduling run.
//!   * App-session tokens (`ttr_app_*`) are accepted by the legacy route but
//!     not supported in this handler. App-session callers fall through to the
//!     still-live Next.js route.

use serde::Deserialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    path_segments, supabase_auth,
};

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const ACCESS_DENIED_MESSAGE: &str = "You don't have access to this workspace";
const INTERNAL_ERROR_MESSAGE: &str = "Internal server error";
const MEMBER_TYPE: &str = "MEMBER";

#[derive(Deserialize)]
struct SchedulingMetadataRow {
    bumped_habits: Option<i64>,
    events_created: Option<i64>,
    habits_scheduled: Option<i64>,
    last_message: Option<String>,
    last_scheduled_at: Option<String>,
    last_status: Option<String>,
    tasks_scheduled: Option<i64>,
    window_days: Option<i64>,
}

#[derive(Deserialize)]
struct WorkspacePersonalRow {
    personal: Option<bool>,
}

#[derive(Deserialize)]
struct HabitCountRow {
    count: Option<i64>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_calendar_schedule_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let ws_id = calendar_schedule_ws_id(request.path)?;

    Some(match request.method {
        "GET" => schedule_get_response(config, request, ws_id, outbound).await,
        _ => return None,
    })
}

async fn schedule_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        return error_response(500, INTERNAL_ERROR_MESSAGE);
    }

    // Resolve the caller's Supabase session (excludes app-session tokens).
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) = user.id.filter(|id| !id.trim().is_empty()) else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };

    // Mirror `verifyWorkspaceMembershipType` with `requiredType: 'MEMBER'`.
    match verify_workspace_membership(contact_data, outbound, ws_id, &user_id, &access_token).await
    {
        Ok(true) => {}
        Ok(false) => return error_response(403, ACCESS_DENIED_MESSAGE),
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    // Fetch workspace personal flag to determine response `mode`.
    let is_personal_workspace = fetch_workspace_personal_flag(contact_data, outbound, ws_id).await;

    // Fetch scheduling metadata from the `private` Supabase schema.
    let metadata = fetch_scheduling_metadata(contact_data, outbound, ws_id)
        .await
        .unwrap_or(None);

    // Fetch count of active auto-schedule habits.
    let active_habits_count = fetch_active_habits_count(contact_data, outbound, ws_id)
        .await
        .unwrap_or(0);

    let mode = if is_personal_workspace {
        "personal"
    } else {
        "workspace"
    };

    no_store_response(json_response(
        200,
        json!({
            "lastScheduledAt": metadata.as_ref().and_then(|m| m.last_scheduled_at.as_deref()),
            "lastStatus": metadata.as_ref().and_then(|m| m.last_status.as_deref()),
            "lastMessage": metadata.as_ref().and_then(|m| m.last_message.as_deref()),
            "statistics": {
                "habitsScheduled": metadata.as_ref().and_then(|m| m.habits_scheduled).unwrap_or(0),
                "tasksScheduled": metadata.as_ref().and_then(|m| m.tasks_scheduled).unwrap_or(0),
                "eventsCreated": metadata.as_ref().and_then(|m| m.events_created).unwrap_or(0),
                "bumpedHabits": metadata.as_ref().and_then(|m| m.bumped_habits).unwrap_or(0),
                "windowDays": metadata.as_ref().and_then(|m| m.window_days).unwrap_or(30),
            },
            "schedulableItems": {
                "activeHabits": active_habits_count,
                // fetchSchedulableTasksForWorkspace is not ported; see module doc.
                "autoScheduleTasks": 0_i64,
            },
            "mode": mode,
        }),
    ))
}

/// Mirrors `verifyWorkspaceMembershipType` with the default `requiredType:
/// 'MEMBER'`. Returns `Ok(true)` when the caller is a MEMBER, `Ok(false)` for
/// a missing or non-MEMBER membership (legacy `403`), and `Err(())` for a
/// lookup failure (legacy `500`).
async fn verify_workspace_membership(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            "workspace_members",
            &[
                ("select", "type".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("user_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = send_caller_get(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let membership = response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next();

    Ok(matches!(
        membership,
        Some(row) if row.membership_type.as_deref() == Some(MEMBER_TYPE)
    ))
}

/// Fetches `workspaces.personal` for the given workspace using the service-role
/// key (RLS bypassed). Returns `false` on any error or when the row is absent.
async fn fetch_workspace_personal_flag(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> bool {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "personal".to_owned()),
            ("id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return false;
    };

    let service_role_key = match contact_data.service_role_key() {
        Some(k) => k,
        None => return false,
    };
    let bearer = format!("Bearer {service_role_key}");

    let Ok(response) = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
    else {
        return false;
    };

    if !(200..300).contains(&response.status) {
        return false;
    }

    response
        .json::<Vec<WorkspacePersonalRow>>()
        .ok()
        .and_then(|rows| rows.into_iter().next())
        .and_then(|row| row.personal)
        .unwrap_or(false)
}

/// Reads `private.workspace_scheduling_metadata` for the workspace via the
/// service-role key. The `Accept-Profile: private` header directs PostgREST to
/// target the `private` Postgres schema instead of the default `public` schema.
///
/// Returns `Ok(None)` when no metadata row exists yet (workspace has never been
/// scheduled), and `Err(())` on a hard upstream failure.
async fn fetch_scheduling_metadata(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Option<SchedulingMetadataRow>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_scheduling_metadata",
            &[
                ("select", "*".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                // Target the `private` Postgres schema via PostgREST schema header.
                .with_header("Accept-Profile", "private")
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        // Treat non-2xx as "no metadata yet" rather than a hard failure, since
        // the table row does not exist until the first scheduling run completes.
        return Ok(None);
    }

    Ok(response
        .json::<Vec<SchedulingMetadataRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

/// Counts active auto-schedule habits for the workspace using the service-role
/// key. Mirrors:
///
/// ```text
/// sbAdmin
///   .from('workspace_habits')
///   .select('id', { count: 'exact' })
///   .eq('ws_id', wsId)
///   .eq('is_active', true)
///   .eq('auto_schedule', true)
///   .is('deleted_at', null)
/// ```
///
/// We use `select=count()` which PostgREST returns as `[{"count": N}]`.
async fn fetch_active_habits_count(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<i64, ()> {
    let url = contact_data
        .rest_url(
            "workspace_habits",
            &[
                ("select", "count()".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("is_active", "eq.true".to_owned()),
                ("auto_schedule", "eq.true".to_owned()),
                ("deleted_at", "is.null".to_owned()),
            ],
        )
        .ok_or(())?;

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<HabitCountRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.count)
        .unwrap_or(0))
}

/// Sends a GET request authenticated with the caller's access token. The
/// `apikey` header is set to the service-role key as required by the Supabase
/// gateway, but the `Authorization` header uses the caller's token so that RLS
/// policies are enforced.
async fn send_caller_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

fn calendar_schedule_ws_id(path: &str) -> Option<&str> {
    let segments = path_segments(path);

    match segments.as_slice() {
        ["api", "v1", "workspaces", ws_id, "calendar", "schedule"] if !ws_id.is_empty() => {
            Some(ws_id)
        }
        _ => None,
    }
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ws_id_matches_exact_mount_path() {
        assert_eq!(
            calendar_schedule_ws_id("/api/v1/workspaces/ws-123/calendar/schedule"),
            Some("ws-123")
        );
    }

    #[test]
    fn ws_id_matches_uuid_segment() {
        assert_eq!(
            calendar_schedule_ws_id(
                "/api/v1/workspaces/11111111-1111-4111-8111-111111111111/calendar/schedule"
            ),
            Some("11111111-1111-4111-8111-111111111111")
        );
    }

    #[test]
    fn ws_id_ignores_unrelated_paths() {
        // Missing `v1`.
        assert_eq!(
            calendar_schedule_ws_id("/api/workspaces/ws-123/calendar/schedule"),
            None
        );
        // Wrong final segment.
        assert_eq!(
            calendar_schedule_ws_id("/api/v1/workspaces/ws-123/calendar/events"),
            None
        );
        // Extra trailing segment.
        assert_eq!(
            calendar_schedule_ws_id("/api/v1/workspaces/ws-123/calendar/schedule/extra"),
            None
        );
        // Short path — must not panic.
        assert_eq!(calendar_schedule_ws_id("/api/v1/workspaces"), None);
    }

    #[test]
    fn ws_id_rejects_empty_workspace_segment() {
        assert_eq!(
            calendar_schedule_ws_id("/api/v1/workspaces//calendar/schedule"),
            None
        );
    }

    #[test]
    fn error_response_uses_error_key() {
        let resp = error_response(403, "You don't have access to this workspace");
        assert_eq!(resp.status, 403);
        assert_eq!(
            resp.body,
            json!({ "error": "You don't have access to this workspace" })
        );
    }
}
