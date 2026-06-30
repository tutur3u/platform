//! Handler for `GET /api/v1/workspaces/:wsId/calendars`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/calendars/route.ts`
//! (GET only; the legacy `POST`, `PATCH`, and `DELETE` paths stay live in
//! Next.js, so this handler returns `None` for every non-GET method).
//!
//! Legacy GET flow:
//!
//!   1. `resolveSessionAuthContext(request, { allowAppSessionAuth: { targetApp:
//!      "calendar" } })` resolves the caller. Failure -> `401`.
//!   2. `verifyWorkspaceMembershipType({ wsId, userId, supabase })` with the
//!      default `requiredType: 'MEMBER'`. A lookup error maps to
//!      `500 { "error": "Failed to verify workspace access" }`; a missing or
//!      non-`MEMBER` membership maps to `403 { "error": "Forbidden" }`.
//!   3. Reads `workspace_calendars` (select `*`, `ws_id=eq.<wsId>`,
//!      ordered by `position ASC, created_at ASC`) from the **private** schema
//!      via the admin (service-role) client and returns:
//!
//!      ```json
//!      {
//!        "calendars": [...],
//!        "grouped": { "system": [...], "custom": [...] },
//!        "total": <number>
//!      }
//!      ```
//!
//!      Any read error maps to
//!      `500 { "error": "Failed to fetch calendars" }`.
//!
//! Behavior notes / gaps:
//!
//!   * The legacy route normalizes `wsId` ("personal" -> user's personal
//!     workspace id, "internal" -> root workspace UUID). This handler forwards
//!     the raw path segment unchanged; slug normalization is not reproduced.
//!   * The legacy route also accepts a calendar app-session token
//!     (`allowAppSessionAuth: { targetApp: "calendar" }`). Reproducing signed
//!     `ttr_app_*` app-session verification is too heavy to port here; app-
//!     session callers fall through to the still-live Next.js route.
//!   * The legacy route uses the admin (service-role) client with
//!     `.schema('private')`. This handler reproduces that by sending the
//!     service-role bearer token and the `Accept-Profile: private` header to
//!     the PostgREST endpoint.
//!   * The legacy response does not set explicit `Cache-Control` headers, but
//!     this handler wraps the response in `no_store_response` to match the
//!     convention used by all sibling calendar handlers in this crate.

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
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const FETCH_CALENDARS_ERROR_MESSAGE: &str = "Failed to fetch calendars";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

#[derive(Deserialize)]
struct MembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_calendars_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let ws_id = calendars_ws_id(request.path)?;

    Some(match request.method {
        "GET" => calendars_get_response(config, request, ws_id, outbound).await,
        _ => return None,
    })
}

async fn calendars_get_response(
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
        Ok(false) => return error_response(403, FORBIDDEN_MESSAGE),
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    match fetch_calendars(contact_data, outbound, ws_id).await {
        Ok(calendars) => calendars_success_response(calendars),
        Err(()) => error_response(500, FETCH_CALENDARS_ERROR_MESSAGE),
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

/// Reads `workspace_calendars` from the `private` schema via the service-role
/// client. The legacy code uses `sbAdmin.schema('private')` which bypasses RLS
/// entirely; this handler mirrors that by sending the service-role bearer token
/// and `Accept-Profile: private` to PostgREST.
async fn fetch_calendars(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<Value>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_calendars",
            &[
                ("select", "*".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("order", "position.asc,created_at.asc".to_owned()),
            ],
        )
        .ok_or(())?;

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Accept-Profile", "private")
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
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

fn calendars_ws_id(path: &str) -> Option<&str> {
    let segments = path_segments(path);

    match segments.as_slice() {
        ["api", "v1", "workspaces", ws_id, "calendars"] if !ws_id.is_empty() => Some(ws_id),
        _ => None,
    }
}

fn calendars_success_response(calendars: Vec<Value>) -> BackendResponse {
    let system: Vec<&Value> = calendars
        .iter()
        .filter(|c| c.get("is_system").and_then(Value::as_bool).unwrap_or(false))
        .collect();
    let custom: Vec<&Value> = calendars
        .iter()
        .filter(|c| !c.get("is_system").and_then(Value::as_bool).unwrap_or(false))
        .collect();
    let total = calendars.len();

    no_store_response(json_response(
        200,
        json!({
            "calendars": calendars,
            "grouped": {
                "system": system,
                "custom": custom,
            },
            "total": total,
        }),
    ))
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    const WORKSPACE_ID: &str = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    fn leaked(s: String) -> &'static str {
        Box::leak(s.into_boxed_str())
    }

    // -------------------------------------------------------------------------
    // Path extraction
    // -------------------------------------------------------------------------

    #[test]
    fn ws_id_matches_exact_mount_path() {
        assert_eq!(
            calendars_ws_id(&format!("/api/v1/workspaces/{WORKSPACE_ID}/calendars")),
            Some(WORKSPACE_ID)
        );
    }

    #[test]
    fn ws_id_matches_arbitrary_slug() {
        assert_eq!(
            calendars_ws_id("/api/v1/workspaces/my-ws/calendars"),
            Some("my-ws")
        );
    }

    #[test]
    fn ws_id_ignores_unrelated_paths() {
        // Missing v1.
        assert_eq!(calendars_ws_id("/api/workspaces/ws-123/calendars"), None);
        // Extra trailing segment.
        assert_eq!(
            calendars_ws_id("/api/v1/workspaces/ws-123/calendars/extra"),
            None
        );
        // Different resource.
        assert_eq!(
            calendars_ws_id("/api/v1/workspaces/ws-123/calendar-settings"),
            None
        );
        // Short path must not panic.
        assert_eq!(calendars_ws_id("/api/v1/workspaces"), None);
    }

    #[test]
    fn ws_id_rejects_empty_workspace_segment() {
        assert_eq!(calendars_ws_id("/api/v1/workspaces//calendars"), None);
    }

    #[test]
    fn handler_path_guard_passes_for_calendars_path() {
        let path = leaked(format!("/api/v1/workspaces/{WORKSPACE_ID}/calendars"));
        assert_eq!(calendars_ws_id(path), Some(WORKSPACE_ID));
    }

    #[test]
    fn handler_path_guard_rejects_other_paths() {
        assert_eq!(
            calendars_ws_id("/api/v1/workspaces/ws-1/calendar/categories"),
            None
        );
    }

    // -------------------------------------------------------------------------
    // Response shaping
    // -------------------------------------------------------------------------

    #[test]
    fn success_response_groups_by_is_system() {
        let system_cal = json!({ "id": "s1", "is_system": true, "name": "Main" });
        let custom_cal = json!({ "id": "c1", "is_system": false, "name": "Custom" });
        let no_flag_cal = json!({ "id": "c2", "name": "No Flag" });

        let calendars = vec![system_cal.clone(), custom_cal.clone(), no_flag_cal.clone()];
        let response = calendars_success_response(calendars);

        assert_eq!(response.status, 200);
        let body = &response.body;
        assert_eq!(body["total"], json!(3));

        let system = body["grouped"]["system"].as_array().unwrap();
        let custom = body["grouped"]["custom"].as_array().unwrap();

        assert_eq!(system.len(), 1);
        assert_eq!(system[0]["id"], json!("s1"));

        // Calendars without is_system or is_system: false fall into custom.
        assert_eq!(custom.len(), 2);
        let custom_ids: Vec<&str> = custom.iter().map(|c| c["id"].as_str().unwrap()).collect();
        assert!(custom_ids.contains(&"c1"));
        assert!(custom_ids.contains(&"c2"));
    }

    #[test]
    fn success_response_emits_empty_lists_for_no_calendars() {
        let response = calendars_success_response(Vec::new());
        assert_eq!(response.status, 200);
        assert_eq!(response.body["calendars"], json!([]));
        assert_eq!(response.body["grouped"]["system"], json!([]));
        assert_eq!(response.body["grouped"]["custom"], json!([]));
        assert_eq!(response.body["total"], json!(0));
    }

    #[test]
    fn error_response_uses_legacy_error_key() {
        let r = error_response(401, UNAUTHORIZED_MESSAGE);
        assert_eq!(r.status, 401);
        assert_eq!(r.body, json!({ "error": "Unauthorized" }));

        let r = error_response(403, FORBIDDEN_MESSAGE);
        assert_eq!(r.status, 403);
        assert_eq!(r.body, json!({ "error": "Forbidden" }));

        let r = error_response(500, FETCH_CALENDARS_ERROR_MESSAGE);
        assert_eq!(r.status, 500);
        assert_eq!(r.body, json!({ "error": "Failed to fetch calendars" }));

        let r = error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE);
        assert_eq!(r.status, 500);
        assert_eq!(
            r.body,
            json!({ "error": "Failed to verify workspace access" })
        );
    }
}
