//! Handler for `GET /api/v1/workspaces/:wsId/time-tracking/goals`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/time-tracking/goals/route.ts`.
//!
//! # Authentication
//!
//! The legacy route calls `resolveSessionAuthContext` with
//! `allowAppSessionAuth: true`. This handler reproduces the common
//! session-token path (Bearer JWT or Supabase auth cookie). App-session-token
//! exchange is complex and handled in the contact module for other routes; that
//! path is a **behavior gap** here — callers using `ttr_app_*` bearer tokens
//! will receive a `401` from this handler instead of falling through to the
//! app-session exchange. Standard browser sessions and explicit Bearer JWTs
//! work correctly.
//!
//! # Status codes
//!
//! | Condition                                       | Status |
//! |------------------------------------------------|--------|
//! | Missing / invalid session token                | 401    |
//! | Caller not a workspace member                  | 403    |
//! | Target `userId` not a workspace member         | 404    |
//! | Membership lookup or data-fetch failure        | 500    |
//! | Success                                        | 200    |
//!
//! The response shape is `{ "goals": [...] }` where each goal row embeds
//! `category: time_tracking_categories(*)` inline, matching the admin-client
//! select in the legacy route.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/time-tracking/goals";

const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const WORKSPACE_ACCESS_DENIED_MESSAGE: &str = "Workspace access denied";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace membership";
const TARGET_MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str =
    "Failed to verify target user workspace membership";
const TARGET_NOT_IN_WORKSPACE_MESSAGE: &str = "Target user not found in workspace";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
#[allow(dead_code)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_time_tracking_goals_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = goals_ws_id(request.path)?;

    Some(match request.method {
        "GET" => goals_get_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn goals_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Auth: accept both standard session tokens and app-session tokens in the
    // bearer position (legacy uses allowAppSessionAuth: true).
    let Some(access_token) = supabase_auth::request_access_token_allowing_app_sessions(request)
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };

    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };

    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
        };

    // Verify caller is a workspace member.
    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(403, WORKSPACE_ACCESS_DENIED_MESSAGE),
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    // Parse optional `userId` query parameter.
    let parsed_url = request.url.and_then(|u| url::Url::parse(u).ok());
    let target_user_id = parsed_url.as_ref().and_then(|u| {
        u.query_pairs()
            .find_map(|(key, value)| (key == "userId").then(|| value.into_owned()))
            .filter(|v| !v.is_empty())
    });

    let query_user_id = target_user_id
        .as_deref()
        .unwrap_or(user_id.as_str())
        .to_owned();

    // If targeting another user, verify they are in the same workspace.
    if let Some(ref tid) = target_user_id
        && tid != &user_id
    {
        match verify_workspace_member(contact_data, outbound, &resolved_ws_id, tid).await {
            Ok(true) => {}
            Ok(false) => {
                return error_response(404, TARGET_NOT_IN_WORKSPACE_MESSAGE);
            }
            Err(()) => {
                return error_response(500, TARGET_MEMBERSHIP_LOOKUP_FAILED_MESSAGE);
            }
        }
    }

    match fetch_goals(contact_data, outbound, &resolved_ws_id, &query_user_id).await {
        Ok(goals) => no_store_response(json_response(200, json!({ "goals": goals }))),
        Err(()) => error_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    }
}

/// Fetch time tracking goals from Supabase using the service-role key
/// (mirroring the legacy `sbAdmin` / admin-client read), ordered by
/// `created_at` descending, with embedded category rows.
async fn fetch_goals(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Value, ()> {
    let select = "*,category:time_tracking_categories(*)";

    let Some(url) = contact_data.rest_url(
        "time_tracking_goals",
        &[
            ("select", select.to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("order", "created_at.desc".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Value>().map_err(|_| ())
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if is_direct_workspace_lookup_identifier(&handle) {
            if let Some(workspace_id) =
                workspace_id_by_handle(contact_data, outbound, &handle, access_token).await?
            {
                return Ok(workspace_id);
            }
            if let Some(workspace_id) =
                workspace_id_by_handle_service_role(contact_data, outbound, &handle).await?
            {
                return Ok(workspace_id);
            }
        }
    }

    Ok(resolved_ws_id)
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id,workspace_members!inner(user_id,type)".to_owned(),
            ),
            ("personal", "eq.true".to_owned()),
            ("workspace_members.user_id", format!("eq.{user_id}")),
            ("workspace_members.type", "eq.MEMBER".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id)
        .ok_or(())
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id".to_owned()),
            ("handle", format!("eq.{handle}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn workspace_id_by_handle_service_role(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id".to_owned()),
            ("handle", format!("eq.{handle}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

/// Verify that `user_id` has any membership row in `workspace_members` for the
/// given `ws_id`. Uses the service-role key so RLS does not filter rows.
/// Returns `Ok(true)` if a row exists, `Ok(false)` if the user is not a
/// member, `Err(())` on lookup failure.
async fn verify_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(!response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .is_empty())
}

async fn send_caller_rest_request(
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

async fn send_service_role_rest_request(
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

fn goals_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn is_direct_workspace_lookup_identifier(identifier: &str) -> bool {
    let normalized = identifier.trim().to_lowercase();

    normalized == PERSONAL_WORKSPACE_SLUG
        || normalized == ROOT_WORKSPACE_ID
        || normalized == INTERNAL_WORKSPACE_SLUG
        || is_workspace_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

fn is_workspace_uuid_literal(value: &str) -> bool {
    value.trim().len() == 36
        && value
            .trim()
            .chars()
            .enumerate()
            .all(|(index, ch)| match index {
                8 | 13 | 18 | 23 => ch == '-',
                _ => ch.is_ascii_hexdigit(),
            })
}

fn is_workspace_handle(value: &str) -> bool {
    let length = value.len();
    if length == 0 || length > 64 {
        return false;
    }

    value.chars().enumerate().all(|(index, ch)| {
        let is_edge = index == 0 || index + 1 == length;
        ch.is_ascii_lowercase() || ch.is_ascii_digit() || (!is_edge && matches!(ch, '_' | '-'))
    })
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn goals_ws_id_extracts_uuid() {
        let path = "/api/v1/workspaces/550e8400-e29b-41d4-a716-446655440000/time-tracking/goals";
        assert_eq!(
            goals_ws_id(path),
            Some("550e8400-e29b-41d4-a716-446655440000")
        );
    }

    #[test]
    fn goals_ws_id_rejects_wrong_suffix() {
        let path = "/api/v1/workspaces/abc123/time-tracking/sessions";
        assert_eq!(goals_ws_id(path), None);
    }

    #[test]
    fn goals_ws_id_rejects_wrong_prefix() {
        let path = "/api/v2/workspaces/abc123/time-tracking/goals";
        assert_eq!(goals_ws_id(path), None);
    }

    #[test]
    fn goals_ws_id_rejects_empty_segment() {
        let path = "/api/v1/workspaces//time-tracking/goals";
        assert_eq!(goals_ws_id(path), None);
    }

    #[test]
    fn goals_ws_id_rejects_extra_segments() {
        let path = "/api/v1/workspaces/abc/extra/time-tracking/goals";
        assert_eq!(goals_ws_id(path), None);
    }

    #[test]
    fn goals_ws_id_accepts_slug() {
        let path = "/api/v1/workspaces/personal/time-tracking/goals";
        assert_eq!(goals_ws_id(path), Some("personal"));
    }

    #[test]
    fn resolve_workspace_id_maps_internal_to_root() {
        assert_eq!(resolve_workspace_id("internal"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("INTERNAL"), ROOT_WORKSPACE_ID);
    }

    #[test]
    fn resolve_workspace_id_passthrough() {
        assert_eq!(resolve_workspace_id("personal"), "personal");
        assert_eq!(
            resolve_workspace_id("550e8400-e29b-41d4-a716-446655440000"),
            "550e8400-e29b-41d4-a716-446655440000"
        );
    }

    #[test]
    fn is_workspace_uuid_literal_valid() {
        assert!(is_workspace_uuid_literal(
            "550e8400-e29b-41d4-a716-446655440000"
        ));
        assert!(is_workspace_uuid_literal(ROOT_WORKSPACE_ID));
    }

    #[test]
    fn is_workspace_uuid_literal_invalid() {
        assert!(!is_workspace_uuid_literal("personal"));
        assert!(!is_workspace_uuid_literal("short"));
        assert!(!is_workspace_uuid_literal(
            "550e8400-e29b-41d4-a716-44665544000Z"
        ));
    }

    #[test]
    fn is_workspace_handle_valid() {
        assert!(is_workspace_handle("my-workspace"));
        assert!(is_workspace_handle("acme"));
        assert!(is_workspace_handle("team123"));
    }

    #[test]
    fn is_workspace_handle_invalid() {
        assert!(!is_workspace_handle(""));
        assert!(!is_workspace_handle("-starts-with-dash"));
        assert!(!is_workspace_handle("ends-with-dash-"));
        assert!(!is_workspace_handle("has spaces"));
        assert!(!is_workspace_handle(&"a".repeat(65)));
    }
}
