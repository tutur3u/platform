//! Handler for `GET /api/v1/workspaces/:wsId/calendar/default-source`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/calendar/default-source/route.ts`
//! (GET only; the legacy `PATCH` path stays live in Next.js, so this handler
//! returns `None` for every non-GET method).
//!
//! Legacy GET flow:
//!
//!   1. Resolve the caller's Supabase session and verify workspace membership
//!      (the same `verifyWorkspaceMembershipType` guard as the categories
//!      handler). Missing/invalid session -> `401`. Lookup failure -> `500`.
//!      Non-member -> `403`.
//!   2. Read `private.workspace_calendars` (enabled only, ordered by
//!      `is_system desc, position asc`) for native Tuturuuu calendar options.
//!   3. Read `calendar_auth_tokens` and `calendar_connections` (public schema)
//!      filtered to the caller's active google/microsoft tokens and enabled
//!      writable connections for that workspace.
//!   4. Read `private.calendar_user_workspace_preferences` for the user-specific
//!      default source preference.
//!   5. Resolve the default source from preference + options, with a fallback to
//!      the primary workspace calendar (even if disabled).
//!   6. Return `200 { "defaultSource": <CalendarSourceOption>,
//!      "options": [<CalendarSourceOption>] }`.
//!
//! Behavior notes / gaps:
//!
//!   * The legacy route also accepts a `calendar` app-session token
//!     (`allowAppSessionAuth: { targetApp: 'calendar' }`). App-session callers
//!     fall through to the still-live Next.js route; only Supabase session
//!     (bearer token or `sb-*-auth-token` cookie) callers are served here.
//!   * The legacy `normalizeWorkspaceId` resolves the `personal` alias to the
//!     user's default workspace. This handler forwards the raw path segment
//!     unchanged; `personal` callers fall through to Next.js.
//!   * All calendar data reads use the service-role key (bypassing RLS) with
//!     explicit `ws_id` / `user_id` filters, matching the legacy
//!     `createAdminClient()` admin path.
//!   * Private schema tables (`workspace_calendars`,
//!     `calendar_user_workspace_preferences`) are queried with the PostgREST
//!     `Accept-Profile: private` header.

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
const ACCESS_DENIED_MESSAGE: &str = "Workspace access denied";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace membership";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";
const FAILED_TO_LOAD_MESSAGE: &str = "Failed to load calendar default source";

/// Access roles that confer write permission. A `None` / empty role also means
/// writable, matching the legacy `isWritableCalendarAccess` helper.
const WRITABLE_ACCESS_ROLES: [&str; 4] = ["owner", "writer", "write", "editor"];

#[derive(Deserialize)]
struct MembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceCalendarRow {
    id: Option<String>,
    name: Option<String>,
    color: Option<Value>,
    calendar_type: Option<String>,
}

#[derive(Deserialize)]
struct CalendarPreferenceRow {
    default_provider: Option<String>,
    default_workspace_calendar_id: Option<String>,
    default_calendar_connection_id: Option<String>,
}

#[derive(Deserialize)]
struct CalendarAuthTokenRow {
    id: Option<String>,
    provider: Option<String>,
    account_email: Option<String>,
    account_name: Option<String>,
}

#[derive(Deserialize)]
struct CalendarConnectionRow {
    id: Option<String>,
    calendar_id: Option<String>,
    calendar_name: Option<String>,
    color: Option<Value>,
    provider: Option<String>,
    auth_token_id: Option<String>,
    workspace_calendar_id: Option<String>,
    access_role: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_calendar_default_source_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = default_source_ws_id(request.path)?;

    Some(match request.method {
        "GET" => default_source_response(config, request, ws_id, outbound).await,
        _ => return None,
    })
}

async fn default_source_response(
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

    // All calendar data reads use the service-role key (legacy createAdminClient).
    let workspace_calendars = match fetch_workspace_calendars(contact_data, outbound, ws_id).await {
        Ok(rows) => rows,
        Err(()) => return error_response(500, FAILED_TO_LOAD_MESSAGE),
    };

    let auth_tokens = match fetch_auth_tokens(contact_data, outbound, ws_id, &user_id).await {
        Ok(rows) => rows,
        Err(()) => return error_response(500, FAILED_TO_LOAD_MESSAGE),
    };

    let token_ids: Vec<String> = auth_tokens.iter().filter_map(|t| t.id.clone()).collect();

    let connections = if token_ids.is_empty() {
        Vec::new()
    } else {
        match fetch_connections(contact_data, outbound, ws_id, &token_ids).await {
            Ok(rows) => rows,
            Err(()) => return error_response(500, FAILED_TO_LOAD_MESSAGE),
        }
    };

    // Build tuturuuu native options (one per enabled workspace calendar).
    let mut options: Vec<Value> = workspace_calendars
        .iter()
        .filter_map(|cal| {
            let id = cal.id.as_deref()?;
            let calendar_type = cal.calendar_type.as_deref().unwrap_or("");
            let label = if calendar_type == "primary" {
                "Tuturuuu Primary".to_owned()
            } else {
                cal.name.clone().unwrap_or_default()
            };
            Some(json!({
                "id": format!("tuturuuu:{id}"),
                "provider": "tuturuuu",
                "workspaceCalendarId": id,
                "label": label,
                "color": cal.color,
                "primary": calendar_type == "primary",
                "writable": true,
            }))
        })
        .collect();

    // Build external (google/microsoft) options from writable connections.
    for connection in &connections {
        let Some(connection_id) = connection.id.as_deref() else {
            continue;
        };
        let Some(provider) = connection.provider.as_deref() else {
            continue;
        };
        if provider != "google" && provider != "microsoft" {
            continue;
        }
        // Require the connection's token to exist and have matching provider.
        let token = connection
            .auth_token_id
            .as_deref()
            .and_then(|tid| auth_tokens.iter().find(|t| t.id.as_deref() == Some(tid)));
        let Some(token) = token else { continue };
        if token.provider.as_deref() != Some(provider) {
            continue;
        }
        if !is_writable_calendar_access(connection.access_role.as_deref()) {
            continue;
        }
        options.push(json!({
            "id": format!("{provider}:{connection_id}"),
            "provider": provider,
            "connectionId": connection_id,
            "workspaceCalendarId": connection.workspace_calendar_id,
            "externalCalendarId": connection.calendar_id,
            "accessRole": connection.access_role,
            "accountEmail": token.account_email,
            "accountName": token.account_name,
            "label": connection.calendar_name,
            "color": connection.color,
            "writable": true,
        }));
    }

    let preference = match fetch_preference(contact_data, outbound, ws_id, &user_id).await {
        Ok(row) => row,
        Err(()) => return error_response(500, FAILED_TO_LOAD_MESSAGE),
    };

    let default_source =
        match resolve_default_source(&options, preference.as_ref(), contact_data, outbound, ws_id)
            .await
        {
            Ok(src) => src,
            Err(()) => return error_response(500, FAILED_TO_LOAD_MESSAGE),
        };

    no_store_response(json_response(
        200,
        json!({
            "defaultSource": default_source,
            "options": options,
        }),
    ))
}

/// Mirrors the preference-lookup path of `resolveCalendarSource` used by
/// `getDefaultCalendarSource`. Returns the matching `CalendarSourceOption`
/// value from `options`, or a synthetic one built from the primary workspace
/// calendar when no option matches.
async fn resolve_default_source(
    options: &[Value],
    preference: Option<&CalendarPreferenceRow>,
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Value, ()> {
    let pref_provider = preference.and_then(|p| p.default_provider.as_deref());
    let pref_ws_cal_id = preference.and_then(|p| p.default_workspace_calendar_id.as_deref());
    let pref_conn_id = preference.and_then(|p| p.default_calendar_connection_id.as_deref());

    // Try to find the option that matches the stored preference.
    let matched_option = if pref_provider == Some("tuturuuu") {
        options.iter().find(|opt| {
            opt["provider"] == "tuturuuu"
                && (pref_ws_cal_id.is_none()
                    || opt["workspaceCalendarId"].as_str() == pref_ws_cal_id)
        })
    } else if matches!(pref_provider, Some("google" | "microsoft")) {
        let provider = pref_provider.unwrap_or("");
        let conn_id = pref_conn_id.unwrap_or("");
        options.iter().find(|opt| {
            opt["provider"].as_str() == Some(provider)
                && opt["connectionId"].as_str() == Some(conn_id)
        })
    } else {
        None
    };

    if let Some(opt) = matched_option {
        return Ok(opt.clone());
    }

    // No preference match — fall back to the primary tuturuuu option in
    // enabled calendars (legacy fallback in `resolveCalendarSource`).
    let fallback = options
        .iter()
        .find(|opt| opt["provider"] == "tuturuuu" && opt["primary"] == true);

    if let Some(opt) = fallback {
        return Ok(opt.clone());
    }

    // No enabled primary calendar in options — query the private schema for
    // the primary calendar regardless of `is_enabled`, mirroring
    // `getPrimaryWorkspaceCalendar` which does not filter by `is_enabled`.
    let url = contact_data
        .rest_url(
            "workspace_calendars",
            &[
                ("select", "id,name,color,calendar_type".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("calendar_type", "eq.primary".to_owned()),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = send_service_role_get_private(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let rows = response
        .json::<Vec<WorkspaceCalendarRow>>()
        .map_err(|_| ())?;
    let primary = rows.into_iter().next().ok_or(())?;
    let primary_id = primary.id.as_deref().ok_or(())?;

    Ok(json!({
        "id": format!("tuturuuu:{primary_id}"),
        "provider": "tuturuuu",
        "workspaceCalendarId": primary_id,
        "label": primary.name,
        "color": primary.color,
        "primary": true,
        "writable": true,
    }))
}

/// Checks whether the caller holds a `MEMBER` (or better) workspace
/// membership. Uses the caller's access token so RLS applies, matching the
/// `verifyWorkspaceMembershipType` helper in the legacy route.
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
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<MembershipRow>>().map_err(|_| ())?;
    Ok(matches!(
        rows.into_iter().next(),
        Some(row) if row.membership_type.as_deref() == Some(MEMBER_TYPE)
    ))
}

async fn fetch_workspace_calendars(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<WorkspaceCalendarRow>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_calendars",
            &[
                ("select", "id,name,color,calendar_type".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("is_enabled", "eq.true".to_owned()),
                ("order", "is_system.desc,position.asc".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_get_private(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    response.json::<Vec<WorkspaceCalendarRow>>().map_err(|_| ())
}

async fn fetch_auth_tokens(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Vec<CalendarAuthTokenRow>, ()> {
    let url = contact_data
        .rest_url(
            "calendar_auth_tokens",
            &[
                (
                    "select",
                    "id,provider,account_email,account_name".to_owned(),
                ),
                ("ws_id", format!("eq.{ws_id}")),
                ("user_id", format!("eq.{user_id}")),
                ("is_active", "eq.true".to_owned()),
                ("provider", "in.(google,microsoft)".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    response.json::<Vec<CalendarAuthTokenRow>>().map_err(|_| ())
}

async fn fetch_connections(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    token_ids: &[String],
) -> Result<Vec<CalendarConnectionRow>, ()> {
    let ids_str = token_ids.join(",");
    let url = contact_data
        .rest_url(
            "calendar_connections",
            &[
                (
                    "select",
                    "id,calendar_id,calendar_name,color,provider,auth_token_id,workspace_calendar_id,access_role"
                        .to_owned(),
                ),
                ("ws_id", format!("eq.{ws_id}")),
                ("is_enabled", "eq.true".to_owned()),
                ("auth_token_id", format!("in.({ids_str})")),
                ("order", "created_at.asc".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    response
        .json::<Vec<CalendarConnectionRow>>()
        .map_err(|_| ())
}

async fn fetch_preference(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Option<CalendarPreferenceRow>, ()> {
    let url = contact_data
        .rest_url(
            "calendar_user_workspace_preferences",
            &[
                (
                    "select",
                    "default_provider,default_workspace_calendar_id,default_calendar_connection_id"
                        .to_owned(),
                ),
                ("ws_id", format!("eq.{ws_id}")),
                ("user_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_get_private(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let rows = response
        .json::<Vec<CalendarPreferenceRow>>()
        .map_err(|_| ())?;
    Ok(rows.into_iter().next())
}

/// Service-role GET for a **public** schema table.
async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

/// Service-role GET for a **private** schema table.
///
/// Adds `Accept-Profile: private` so PostgREST targets the `private` schema.
async fn send_service_role_get_private(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Accept-Profile", "private")
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

/// Mirrors the legacy `isWritableCalendarAccess` helper.
///
/// `None` or an empty access role is treated as writable (the default for
/// workspace-owned calendars). Only recognised read-only roles (`reader`,
/// `freeBusyReader`, etc.) cause this to return `false`.
fn is_writable_calendar_access(access_role: Option<&str>) -> bool {
    match access_role {
        None | Some("") => true,
        Some(role) => {
            let lower = role.to_ascii_lowercase();
            WRITABLE_ACCESS_ROLES.contains(&lower.as_str())
        }
    }
}

fn default_source_ws_id(path: &str) -> Option<&str> {
    match path_segments(path).as_slice() {
        [
            "api",
            "v1",
            "workspaces",
            ws_id,
            "calendar",
            "default-source",
        ] if !ws_id.is_empty() => Some(ws_id),
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
            default_source_ws_id("/api/v1/workspaces/ws-123/calendar/default-source"),
            Some("ws-123")
        );
    }

    #[test]
    fn ws_id_ignores_unrelated_paths() {
        // Missing `v1` prefix.
        assert_eq!(
            default_source_ws_id("/api/workspaces/ws-123/calendar/default-source"),
            None
        );
        // Different sibling resource.
        assert_eq!(
            default_source_ws_id("/api/v1/workspaces/ws-123/calendar/categories"),
            None
        );
        // Trailing extra segment must not match.
        assert_eq!(
            default_source_ws_id("/api/v1/workspaces/ws-123/calendar/default-source/extra"),
            None
        );
        // Short path must not panic.
        assert_eq!(default_source_ws_id("/api/v1/workspaces"), None);
    }

    #[test]
    fn ws_id_rejects_empty_workspace_segment() {
        assert_eq!(
            default_source_ws_id("/api/v1/workspaces//calendar/default-source"),
            None
        );
    }

    #[test]
    fn is_writable_none_and_empty_are_writable() {
        assert!(is_writable_calendar_access(None));
        assert!(is_writable_calendar_access(Some("")));
    }

    #[test]
    fn is_writable_accepted_roles_are_writable() {
        for role in ["owner", "writer", "write", "editor", "OWNER", "Writer"] {
            assert!(
                is_writable_calendar_access(Some(role)),
                "{role} should be writable"
            );
        }
    }

    #[test]
    fn is_writable_read_roles_are_not_writable() {
        for role in ["reader", "freeBusyReader", "read", "viewer"] {
            assert!(
                !is_writable_calendar_access(Some(role)),
                "{role} should not be writable"
            );
        }
    }

    #[test]
    fn error_response_uses_error_key() {
        let resp = error_response(401, UNAUTHORIZED_MESSAGE);
        assert_eq!(resp.status, 401);
        assert_eq!(resp.body, json!({ "error": "Unauthorized" }));

        let resp = error_response(403, ACCESS_DENIED_MESSAGE);
        assert_eq!(resp.status, 403);
        assert_eq!(resp.body, json!({ "error": "Workspace access denied" }));

        let resp = error_response(500, FAILED_TO_LOAD_MESSAGE);
        assert_eq!(resp.status, 500);
        assert_eq!(
            resp.body,
            json!({ "error": "Failed to load calendar default source" })
        );
    }
}
