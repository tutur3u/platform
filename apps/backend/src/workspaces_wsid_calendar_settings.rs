//! Handler for `GET /api/v1/workspaces/:wsId/calendar-settings`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/calendar-settings/route.ts`
//! (GET only; the legacy `PATCH` path stays live in Next.js, so this handler
//! returns `None` for every non-GET method).
//!
//! Legacy GET flow:
//!
//!   1. `resolveSessionAuthContext(request, { allowAppSessionAuth: true })`
//!      resolves the caller. Failure -> `401 { "error": "Unauthorized" }`.
//!   2. `verifyWorkspaceMembershipType({ wsId, userId, supabase })` with the
//!      default `requiredType: 'MEMBER'`. A lookup error maps to
//!      `500 { "error": "Failed to verify workspace access" }`; a missing
//!      or non-`MEMBER` membership maps to
//!      `403 { "error": "Workspace access denied" }`.
//!   3. Reads `workspaces` selecting `timezone`, `first_day_of_week`,
//!      `energy_profile`, and `scheduling_settings` through the caller's session
//!      (RLS active) and returns:
//!
//!      ```json
//!      {
//!        "timezone": "<value or \"auto\">",
//!        "first_day_of_week": "<value or \"auto\">",
//!        "energy_profile": "<value or \"morning_person\">",
//!        "scheduling_settings": "<value or {\"min_buffer\":5,\"preferred_buffer\":15}>"
//!      }
//!      ```
//!
//!      Any read error maps to `500 { "error": "Internal server error" }`.
//!
//! Behavior notes / gaps:
//!
//!   * The legacy route normalizes `wsId` ("personal" -> user's personal workspace
//!     id, "internal" -> root workspace UUID). This handler forwards the raw path
//!     segment unchanged; slug normalization is not reproduced here.
//!   * The legacy route also accepts an app-session token
//!     (`allowAppSessionAuth: true`). Signed `ttr_app_*` app-session verification
//!     is too heavy to port here; app-session callers fall through to the
//!     still-live Next.js route.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    path_segments, supabase_auth,
};

const MEMBER_TYPE: &str = "MEMBER";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const ACCESS_DENIED_MESSAGE: &str = "Workspace access denied";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

const DEFAULT_TIMEZONE: &str = "auto";
const DEFAULT_FIRST_DAY_OF_WEEK: &str = "auto";
const DEFAULT_ENERGY_PROFILE: &str = "morning_person";

#[derive(Deserialize)]
struct MembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceCalendarRow {
    timezone: Option<String>,
    first_day_of_week: Option<String>,
    energy_profile: Option<String>,
    scheduling_settings: Option<Value>,
}

pub(crate) async fn handle_workspaces_wsid_calendar_settings_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = calendar_settings_ws_id(request.path)?;

    Some(match request.method {
        "GET" => calendar_settings_response(config, request, ws_id, outbound).await,
        _ => return None,
    })
}

async fn calendar_settings_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        return error_response(500, INTERNAL_SERVER_ERROR_MESSAGE);
    }

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

    match verify_workspace_membership(contact_data, outbound, ws_id, &user_id, &access_token).await
    {
        Ok(true) => {}
        Ok(false) => return error_response(403, ACCESS_DENIED_MESSAGE),
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    match fetch_workspace_calendar_settings(contact_data, outbound, ws_id, &access_token).await {
        Ok(row) => calendar_settings_success_response(row),
        Err(()) => error_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    }
}

/// Mirrors `verifyWorkspaceMembershipType` with the default `requiredType:
/// 'MEMBER'`. Returns `Ok(true)` for a `MEMBER` membership, `Ok(false)` for a
/// missing or non-`MEMBER` membership (legacy `403`), and `Err(())` for a
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
        .json::<Vec<MembershipRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next();

    Ok(matches!(
        membership,
        Some(row) if row.membership_type.as_deref() == Some(MEMBER_TYPE)
    ))
}

async fn fetch_workspace_calendar_settings(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    access_token: &str,
) -> Result<WorkspaceCalendarRow, ()> {
    let url = contact_data
        .rest_url(
            "workspaces",
            &[
                (
                    "select",
                    "timezone,first_day_of_week,energy_profile,scheduling_settings".to_owned(),
                ),
                ("id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = send_caller_get(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response
        .json::<Vec<WorkspaceCalendarRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .ok_or(())
}

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

fn calendar_settings_ws_id(path: &str) -> Option<&str> {
    let segments = path_segments(path);

    match segments.as_slice() {
        ["api", "v1", "workspaces", ws_id, "calendar-settings"] if !ws_id.is_empty() => Some(ws_id),
        _ => None,
    }
}

fn default_scheduling_settings() -> Value {
    json!({ "min_buffer": 5, "preferred_buffer": 15 })
}

fn calendar_settings_success_response(row: WorkspaceCalendarRow) -> BackendResponse {
    let timezone = row
        .timezone
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_TIMEZONE.to_owned());
    let first_day_of_week = row
        .first_day_of_week
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_FIRST_DAY_OF_WEEK.to_owned());
    let energy_profile = row
        .energy_profile
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_ENERGY_PROFILE.to_owned());
    let scheduling_settings = row
        .scheduling_settings
        .filter(|v| !v.is_null())
        .unwrap_or_else(default_scheduling_settings);

    no_store_response(json_response(
        200,
        json!({
            "timezone": timezone,
            "first_day_of_week": first_day_of_week,
            "energy_profile": energy_profile,
            "scheduling_settings": scheduling_settings,
        }),
    ))
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    const WORKSPACE_ID: &str = "22222222-2222-4222-8222-222222222222";

    fn leaked(s: String) -> &'static str {
        Box::leak(s.into_boxed_str())
    }

    // ---------------------------------------------------------------------------
    // Path extraction
    // ---------------------------------------------------------------------------

    #[test]
    fn ws_id_matches_exact_mount_path() {
        assert_eq!(
            calendar_settings_ws_id(&format!(
                "/api/v1/workspaces/{WORKSPACE_ID}/calendar-settings"
            )),
            Some(WORKSPACE_ID)
        );
    }

    #[test]
    fn ws_id_matches_arbitrary_slug() {
        assert_eq!(
            calendar_settings_ws_id("/api/v1/workspaces/my-ws/calendar-settings"),
            Some("my-ws")
        );
    }

    #[test]
    fn ws_id_ignores_unrelated_paths() {
        // Missing v1.
        assert_eq!(
            calendar_settings_ws_id("/api/workspaces/ws-123/calendar-settings"),
            None
        );
        // Extra trailing segment.
        assert_eq!(
            calendar_settings_ws_id("/api/v1/workspaces/ws-123/calendar-settings/extra"),
            None
        );
        // Different resource.
        assert_eq!(
            calendar_settings_ws_id("/api/v1/workspaces/ws-123/calendar/categories"),
            None
        );
        // Short path must not panic.
        assert_eq!(calendar_settings_ws_id("/api/v1/workspaces"), None);
    }

    #[test]
    fn ws_id_rejects_empty_workspace_segment() {
        assert_eq!(
            calendar_settings_ws_id("/api/v1/workspaces//calendar-settings"),
            None
        );
    }

    // ---------------------------------------------------------------------------
    // Response shaping
    // ---------------------------------------------------------------------------

    #[test]
    fn success_response_uses_row_values_when_present() {
        let row = WorkspaceCalendarRow {
            timezone: Some("America/New_York".to_owned()),
            first_day_of_week: Some("monday".to_owned()),
            energy_profile: Some("night_owl".to_owned()),
            scheduling_settings: Some(json!({ "min_buffer": 10, "preferred_buffer": 30 })),
        };
        let response = calendar_settings_success_response(row);
        assert_eq!(response.status, 200);
        assert_eq!(
            response.body,
            json!({
                "timezone": "America/New_York",
                "first_day_of_week": "monday",
                "energy_profile": "night_owl",
                "scheduling_settings": { "min_buffer": 10, "preferred_buffer": 30 },
            })
        );
    }

    #[test]
    fn success_response_applies_defaults_for_null_fields() {
        let row = WorkspaceCalendarRow {
            timezone: None,
            first_day_of_week: None,
            energy_profile: None,
            scheduling_settings: None,
        };
        let response = calendar_settings_success_response(row);
        assert_eq!(response.status, 200);
        assert_eq!(
            response.body,
            json!({
                "timezone": "auto",
                "first_day_of_week": "auto",
                "energy_profile": "morning_person",
                "scheduling_settings": { "min_buffer": 5, "preferred_buffer": 15 },
            })
        );
    }

    #[test]
    fn error_response_uses_legacy_error_key() {
        let r = error_response(401, UNAUTHORIZED_MESSAGE);
        assert_eq!(r.status, 401);
        assert_eq!(r.body, json!({ "error": "Unauthorized" }));

        let r = error_response(403, ACCESS_DENIED_MESSAGE);
        assert_eq!(r.status, 403);
        assert_eq!(r.body, json!({ "error": "Workspace access denied" }));

        let r = error_response(500, INTERNAL_SERVER_ERROR_MESSAGE);
        assert_eq!(r.status, 500);
        assert_eq!(r.body, json!({ "error": "Internal server error" }));

        let r = error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE);
        assert_eq!(r.status, 500);
        assert_eq!(
            r.body,
            json!({ "error": "Failed to verify workspace access" })
        );
    }

    // ---------------------------------------------------------------------------
    // Route dispatch guard (pure / sync)
    // ---------------------------------------------------------------------------

    #[test]
    fn handler_path_guard_passes_for_calendar_settings_path() {
        let path = leaked(format!(
            "/api/v1/workspaces/{WORKSPACE_ID}/calendar-settings"
        ));
        assert_eq!(calendar_settings_ws_id(path), Some(WORKSPACE_ID));
    }

    #[test]
    fn handler_path_guard_rejects_other_paths() {
        assert_eq!(
            calendar_settings_ws_id("/api/v1/workspaces/ws-1/calendar/categories"),
            None
        );
    }
}
