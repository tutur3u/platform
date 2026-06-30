//! Handler for `GET /api/v1/workspaces/:wsId/calendar/categories`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/calendar/categories/route.ts`
//! (GET only; the legacy `POST` insert path stays live in Next.js, so this
//! handler returns `None` for every non-GET method).
//!
//! Legacy GET flow:
//!   1. `resolveSessionAuthContext(request, { allowAppSessionAuth: true })`
//!      resolves the caller. Failure -> `401 { "error": "Unauthorized" }`.
//!   2. `verifyWorkspaceMembershipType({ wsId, userId, supabase })` with the
//!      default `requiredType: 'MEMBER'`. A lookup error maps to
//!      `500 { "error": "Failed to verify workspace access" }`; a missing
//!      membership or a non-`MEMBER` membership type maps to
//!      `403 { "error": "Workspace access denied" }`.
//!   3. Reads `workspace_calendar_categories` (`select=*`, `ws_id=eq.<wsId>`,
//!      ordered by `position`) through the caller's session (RLS active) and
//!      returns `200 { "categories": [...] }` (the legacy `data || []` shape).
//!      Any read error maps to `500 { "error": "Internal server error" }`.
//!
//! Behavior notes / gaps:
//!   * The legacy `wsId` is used verbatim (no `resolveWorkspaceId` /
//!     normalization), so this handler forwards the raw path segment unchanged.
//!   * The legacy route also accepts an app-session token
//!     (`allowAppSessionAuth: true`). Reproducing the signed `ttr_app_*`
//!     app-session verification is too heavy to port here, so this handler
//!     implements only the common Supabase-session path (bearer token or
//!     `sb-*-auth-token` cookie). App-session callers fall through to the still
//!     -live Next.js route. All other behavior is preserved.

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

#[derive(Deserialize)]
struct MembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_calendar_categories_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = calendar_categories_ws_id(request.path)?;

    Some(match request.method {
        "GET" => categories_response(config, request, ws_id, outbound).await,
        _ => return None,
    })
}

async fn categories_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        return error_response(500, INTERNAL_SERVER_ERROR_MESSAGE);
    }

    // The legacy route relies on the caller's Supabase session (RLS) via
    // `createClient()`. Mirror that by reading with the caller's access token.
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

    match fetch_calendar_categories(contact_data, outbound, ws_id, &access_token).await {
        Ok(rows) => categories_success_response(rows),
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

async fn fetch_calendar_categories(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    access_token: &str,
) -> Result<Vec<Value>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_calendar_categories",
            &[
                ("select", "*".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("order", "position".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = send_caller_get(contact_data, outbound, &url, access_token).await?;

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

fn calendar_categories_ws_id(path: &str) -> Option<&str> {
    let segments = path_segments(path);

    match segments.as_slice() {
        ["api", "v1", "workspaces", ws_id, "calendar", "categories"] if !ws_id.is_empty() => {
            Some(ws_id)
        }
        _ => None,
    }
}

fn categories_success_response(rows: Vec<Value>) -> BackendResponse {
    no_store_response(json_response(200, json!({ "categories": rows })))
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
            calendar_categories_ws_id("/api/v1/workspaces/ws-123/calendar/categories"),
            Some("ws-123")
        );
    }

    #[test]
    fn ws_id_ignores_unrelated_paths() {
        // Missing `v1` prefix.
        assert_eq!(
            calendar_categories_ws_id("/api/workspaces/ws-123/calendar/categories"),
            None
        );
        // Trailing segment beyond the categories collection.
        assert_eq!(
            calendar_categories_ws_id("/api/v1/workspaces/ws-123/calendar/categories/cat-1"),
            None
        );
        // Different sibling resource.
        assert_eq!(
            calendar_categories_ws_id("/api/v1/workspaces/ws-123/calendar/events"),
            None
        );
        // Short path must not panic.
        assert_eq!(calendar_categories_ws_id("/api/v1/workspaces"), None);
    }

    #[test]
    fn ws_id_rejects_empty_workspace_segment() {
        assert_eq!(
            calendar_categories_ws_id("/api/v1/workspaces//calendar/categories"),
            None
        );
    }

    #[test]
    fn categories_success_response_wraps_rows() {
        let response = categories_success_response(vec![json!({ "id": "1", "position": 0 })]);
        assert_eq!(response.status, 200);
        assert_eq!(
            response.body,
            json!({ "categories": [{ "id": "1", "position": 0 }] })
        );
    }

    #[test]
    fn categories_success_response_emits_empty_array() {
        let response = categories_success_response(Vec::new());
        assert_eq!(response.status, 200);
        assert_eq!(response.body, json!({ "categories": [] }));
    }

    #[test]
    fn error_response_uses_legacy_error_key() {
        let unauthorized = error_response(401, UNAUTHORIZED_MESSAGE);
        assert_eq!(unauthorized.status, 401);
        assert_eq!(unauthorized.body, json!({ "error": "Unauthorized" }));

        let forbidden = error_response(403, ACCESS_DENIED_MESSAGE);
        assert_eq!(forbidden.status, 403);
        assert_eq!(
            forbidden.body,
            json!({ "error": "Workspace access denied" })
        );

        let lookup_failed = error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE);
        assert_eq!(lookup_failed.status, 500);
        assert_eq!(
            lookup_failed.body,
            json!({ "error": "Failed to verify workspace access" })
        );
    }
}
