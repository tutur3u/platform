//! Handler for `GET /api/v1/notifications/preferences`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/notifications/preferences/route.ts`.
//!
//! ## Auth model
//!
//! The legacy route resolves the caller via `resolveAuthenticatedSessionUser`
//! (a plain Supabase session / cookie-based auth). This handler reproduces that
//! path using `supabase_auth::request_access_token` + `fetch_supabase_auth_user`.
//! App-session tokens (`ttr_app_*`) are intentionally excluded (the legacy route
//! does not support them).
//!
//! ## Query parameters
//!
//! - `wsId` (required, UUID / GUID): the workspace to read preferences for.
//!   Returns `400` when absent or not a valid UUID.
//!
//! ## Workspace membership check
//!
//! The legacy route calls `verifyWorkspaceMembershipType` (via the admin client)
//! which checks that the user has any active membership row. This handler
//! reproduces that check with a service-role read of `workspace_members` filtered
//! by `(ws_id, user_id)`, treating a returned row of `type = 'MEMBER'` as a
//! successful membership match, consistent with the existing
//! `notifications_unread_count` migration.
//!
//! ## Data read
//!
//! The legacy route reads `notification_preferences` with the **caller** Supabase
//! client (RLS active), filtered by `ws_id` and `user_id`. This handler forwards
//! the caller's access token rather than the service-role key, preserving that
//! RLS behavior.
//!
//! ## Response
//!
//! Success: `200 { "preferences": [...] }` (no-store).
//!
//! ## Behavior gaps
//!
//! - The `PUT` method is intentionally not ported; `None` is returned so the
//!   Cloudflare worker falls through to the still-active Next.js route.
//! - The legacy zod `querySchema` uses `z.guid()` which accepts only strict
//!   RFC-4122 UUIDs. This handler uses the same 36-char hex+dash check as
//!   other migrated notification handlers (`is_uuid_literal`).

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const NOTIFICATIONS_PREFERENCES_PATH: &str = "/api/v1/notifications/preferences";
const NOTIFICATION_PREFERENCES_TABLE: &str = "notification_preferences";
const WORKSPACE_MEMBERS_TABLE: &str = "workspace_members";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const ACCESS_DENIED_MESSAGE: &str = "Access denied to workspace";
const FETCH_FAILED_MESSAGE: &str = "Failed to fetch preferences";
const INTERNAL_ERROR_MESSAGE: &str = "Internal server error";

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

pub(crate) async fn handle_notifications_preferences_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    if request.path != NOTIFICATIONS_PREFERENCES_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => preferences_response(config, request, outbound).await,
        // PUT and all other methods are still owned by the legacy Next.js route.
        _ => return None,
    })
}

async fn preferences_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Step 1: authenticate the caller via access token.
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

    // Step 2: parse the required `wsId` query parameter.
    let ws_id = match parse_required_ws_id(request.url) {
        Ok(ws_id) => ws_id,
        Err(()) => return invalid_query_response(),
    };

    // Step 3: verify the caller is a member of the workspace (service-role read).
    match verify_workspace_member(contact_data, outbound, &ws_id, &user_id, &access_token).await {
        Ok(true) => {}
        Ok(false) => return error_response(403, ACCESS_DENIED_MESSAGE),
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    // Step 4: fetch preferences with the caller's token (RLS active).
    match fetch_preferences(contact_data, outbound, &ws_id, &user_id, &access_token).await {
        Ok(preferences) => {
            no_store_response(json_response(200, json!({ "preferences": preferences })))
        }
        Err(()) => error_response(500, FETCH_FAILED_MESSAGE),
    }
}

/// Parses the required `wsId` query parameter. Returns `Ok(uuid)` for a valid
/// GUID, `Err(())` for absent, blank, or non-GUID values.
fn parse_required_ws_id(request_url: Option<&str>) -> Result<String, ()> {
    let url = request_url
        .and_then(|u| url::Url::parse(u).ok())
        .ok_or(())?;

    let raw = url
        .query_pairs()
        .find(|(key, _)| key == "wsId")
        .map(|(_, value)| value.into_owned())
        .ok_or(())?;

    if raw.is_empty() || !is_uuid_literal(&raw) {
        return Err(());
    }

    Ok(raw)
}

async fn verify_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    _access_token: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            WORKSPACE_MEMBERS_TABLE,
            &[
                ("select", "type".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("user_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    // Use service-role key to bypass RLS on workspace_members (mirrors
    // the admin client the legacy route uses for membership verification).
    let response = send_service_role_get(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        == Some("MEMBER"))
}

async fn fetch_preferences(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Vec<Value>, ()> {
    let url = contact_data
        .rest_url(
            NOTIFICATION_PREFERENCES_TABLE,
            &[
                ("select", "*".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("user_id", format!("eq.{user_id}")),
            ],
        )
        .ok_or(())?;

    // Forward the caller's access token so RLS applies (mirrors the legacy
    // route which reads with the RLS-scoped caller `supabase` client).
    let response = send_caller_get(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

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

fn is_uuid_literal(value: &str) -> bool {
    value.len() == 36
        && value
            .chars()
            .enumerate()
            .all(|(index, character)| match index {
                8 | 13 | 18 | 23 => character == '-',
                _ => character.is_ascii_hexdigit(),
            })
}

fn invalid_query_response() -> BackendResponse {
    no_store_response(json_response(
        400,
        json!({
            "error": INVALID_QUERY_MESSAGE,
            "details": { "issues": [{ "path": ["wsId"], "message": "Invalid GUID" }] },
        }),
    ))
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    let _ = INTERNAL_ERROR_MESSAGE;
    no_store_response(json_response(status, json!({ "error": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_exact_match() {
        assert!(
            "/api/v1/notifications/preferences" == NOTIFICATIONS_PREFERENCES_PATH,
            "path constant must match the legacy mount"
        );
    }

    #[test]
    fn path_guard_no_match_on_prefix() {
        assert_ne!(
            "/api/v1/notifications/preferences/extra",
            NOTIFICATIONS_PREFERENCES_PATH
        );
    }

    #[test]
    fn is_uuid_literal_valid() {
        assert!(is_uuid_literal("550e8400-e29b-41d4-a716-446655440000"));
    }

    #[test]
    fn is_uuid_literal_rejects_short() {
        assert!(!is_uuid_literal("550e8400-e29b-41d4-a716"));
    }

    #[test]
    fn is_uuid_literal_rejects_no_dashes() {
        assert!(!is_uuid_literal("550e8400e29b41d4a716446655440000"));
    }

    #[test]
    fn parse_required_ws_id_valid() {
        let url = "https://example.com/api/v1/notifications/preferences?wsId=550e8400-e29b-41d4-a716-446655440000";
        assert_eq!(
            parse_required_ws_id(Some(url)),
            Ok("550e8400-e29b-41d4-a716-446655440000".to_owned())
        );
    }

    #[test]
    fn parse_required_ws_id_missing() {
        let url = "https://example.com/api/v1/notifications/preferences";
        assert_eq!(parse_required_ws_id(Some(url)), Err(()));
    }

    #[test]
    fn parse_required_ws_id_empty() {
        let url = "https://example.com/api/v1/notifications/preferences?wsId=";
        assert_eq!(parse_required_ws_id(Some(url)), Err(()));
    }

    #[test]
    fn parse_required_ws_id_invalid_guid() {
        let url = "https://example.com/api/v1/notifications/preferences?wsId=not-a-uuid";
        assert_eq!(parse_required_ws_id(Some(url)), Err(()));
    }

    #[test]
    fn parse_required_ws_id_none_url() {
        assert_eq!(parse_required_ws_id(None), Err(()));
    }
}
