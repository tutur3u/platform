use serde::Deserialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const NOTIFICATIONS_UNREAD_COUNT_PATH: &str = "/api/v1/notifications/unread-count";
const NOTIFICATIONS_TABLE: &str = "notifications";
const WORKSPACE_MEMBERS_TABLE: &str = "workspace_members";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const ACCESS_DENIED_MESSAGE: &str = "Access denied to workspace";
const FETCH_ERROR_MESSAGE: &str = "Failed to fetch unread count";
const INTERNAL_ERROR_MESSAGE: &str = "Internal server error";

/// Auth context for the caller. Mirrors the legacy `withSessionAuth` behavior:
/// app-session callers operate with service-role data access, while Supabase
/// session callers operate with their own access token (RLS).
enum CallerAuth {
    AppSession,
    AccessToken(String),
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    ws_id: Option<String>,
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

pub(crate) async fn handle_notifications_unread_count_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != NOTIFICATIONS_UNREAD_COUNT_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => unread_count_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn unread_count_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Resolve the authenticated user (id + email) honoring app-session auth,
    // matching `allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH`.
    let (user_id, user_email, caller_auth) = match resolve_caller(config, request, outbound).await {
        Some(identity) => identity,
        None => return message_response(401, UNAUTHORIZED_MESSAGE),
    };

    // Parse and validate the optional `wsId` query parameter.
    let ws_id = match parse_ws_id(request.url) {
        Ok(ws_id) => ws_id,
        Err(()) => return invalid_query_response(),
    };

    // Load the caller's workspace memberships for the access filter.
    let workspace_ids =
        match notification_workspace_ids(contact_data, outbound, &user_id, &caller_auth).await {
            Ok(ids) => ids,
            // The legacy `getNotificationAccessContext` throws on failure, which
            // the surrounding try/catch turns into a 500 internal server error.
            Err(()) => return message_response(500, INTERNAL_ERROR_MESSAGE),
        };

    // If a workspace is specified, verify membership before counting.
    if let Some(ws_id) = ws_id.as_deref() {
        match verify_workspace_member(contact_data, outbound, ws_id, &user_id, &caller_auth).await {
            Ok(true) => {}
            Ok(false) => return message_response(403, ACCESS_DENIED_MESSAGE),
            Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
        }
    }

    // Count unread notifications via the service-role client (RLS bypassed; the
    // `or(...)` access filter scopes the result to the caller).
    let filter = build_notification_access_filter(&user_id, user_email.as_deref(), &workspace_ids);

    match unread_count(contact_data, outbound, &filter, ws_id.as_deref()).await {
        Ok(count) => no_store_response(json_response(200, json!({ "count": count }))),
        Err(()) => message_response(500, FETCH_ERROR_MESSAGE),
    }
}

async fn resolve_caller(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<(String, Option<String>, CallerAuth)> {
    if contact::request_has_app_session_token(request) {
        let identity = contact::resolve_app_session_identity(
            config,
            request,
            contact::current_user_app_session_targets(),
        )
        .ok()?;

        let user_id = non_empty(identity.id)?;
        let email = identity.email.and_then(normalize_email);

        return Some((user_id, email, CallerAuth::AppSession));
    }

    let access_token = supabase_auth::request_access_token(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;
    let user_id = user.id.and_then(non_empty)?;
    let email = user.email.and_then(normalize_email);

    Some((user_id, email, CallerAuth::AccessToken(access_token)))
}

/// Parses and validates the optional `wsId` query parameter. Returns
/// `Ok(Some(uuid))` when a valid GUID is supplied, `Ok(None)` when absent or
/// blank, and `Err(())` when present but not a GUID (legacy zod `.guid()`).
fn parse_ws_id(request_url: Option<&str>) -> Result<Option<String>, ()> {
    let Some(url) = request_url.and_then(|url| url::Url::parse(url).ok()) else {
        return Ok(None);
    };

    let raw = url
        .query_pairs()
        .find(|(key, _)| key == "wsId")
        .map(|(_, value)| value.into_owned());

    match raw {
        // The legacy schema treats null/empty as undefined (no filtering).
        None => Ok(None),
        Some(value) if value.is_empty() => Ok(None),
        Some(value) if is_uuid_literal(&value) => Ok(Some(value)),
        Some(_) => Err(()),
    }
}

async fn notification_workspace_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    caller_auth: &CallerAuth,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        WORKSPACE_MEMBERS_TABLE,
        &[
            ("select", "ws_id".to_owned()),
            ("user_id", format!("eq.{user_id}")),
        ],
    ) else {
        return Err(());
    };

    let response = send_get(contact_data, outbound, &url, caller_auth, None).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.ws_id)
        .filter(|ws_id| !ws_id.is_empty())
        .collect())
}

async fn verify_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    caller_auth: &CallerAuth,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        WORKSPACE_MEMBERS_TABLE,
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_get(contact_data, outbound, &url, caller_auth, None).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // Legacy `verifyWorkspaceMembershipType` defaults to `requiredType: 'MEMBER'`.
    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        == Some("MEMBER"))
}

async fn unread_count(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    filter: &str,
    ws_id: Option<&str>,
) -> Result<usize, ()> {
    let mut params = vec![
        ("select", "id".to_owned()),
        ("or", filter.to_owned()),
        ("read_at", "is.null".to_owned()),
    ];

    if let Some(ws_id) = ws_id {
        params.push(("ws_id", format!("eq.{ws_id}")));
    }

    let Some(url) = contact_data.rest_url(NOTIFICATIONS_TABLE, &params) else {
        return Err(());
    };

    // Service-role read (mirrors `createAdminClient`), with `count=exact` to read
    // the total from the Content-Range header. `Range: 0-0` keeps the body small.
    let response = send_service_role_count(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(total_count_from_content_range(&response).unwrap_or(0))
}

async fn send_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    caller_auth: &CallerAuth,
    prefer: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = match caller_auth {
        CallerAuth::AppSession => service_role_key,
        CallerAuth::AccessToken(access_token) => access_token,
    };
    let authorization = format!("Bearer {bearer}");

    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if let Some(prefer) = prefer {
        request = request.with_header("Prefer", prefer);
    }

    outbound.send(request).await.map_err(|_| ())
}

async fn send_service_role_count(
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
                .with_header("apikey", service_role_key)
                .with_header("Prefer", "count=exact")
                .with_header("Range-Unit", "items")
                .with_header("Range", "0-0"),
        )
        .await
        .map_err(|_| ())
}

fn total_count_from_content_range(response: &OutboundResponse) -> Option<usize> {
    let header = response.header("content-range")?;
    let (_, total) = header.rsplit_once('/')?;

    total.parse::<usize>().ok()
}

/// Mirrors `buildNotificationAccessFilter`. Returns a PostgREST `or` expression
/// already wrapped in the outer parentheses PostgREST expects.
fn build_notification_access_filter(
    user_id: &str,
    user_email: Option<&str>,
    workspace_ids: &[String],
) -> String {
    let mut branches = Vec::with_capacity(4);

    branches.push(format!("and(scope.in.(user,system),user_id.eq.{user_id})"));

    if let Some(email) = user_email {
        branches.push(format!(
            "and(scope.in.(user,system),user_id.is.null,email.eq.{})",
            quote_postgrest_string(email)
        ));
    }

    if workspace_ids.is_empty() {
        branches.push(format!(
            "and(scope.eq.workspace,user_id.eq.{user_id},ws_id.is.null)"
        ));
    } else {
        branches.push(format!(
            "and(scope.eq.workspace,user_id.eq.{user_id},or(ws_id.is.null,ws_id.in.({})))",
            workspace_ids.join(",")
        ));
    }

    format!("({})", branches.join(","))
}

fn quote_postgrest_string(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

fn normalize_email(email: String) -> Option<String> {
    let normalized = email.trim().to_lowercase();
    (!normalized.is_empty()).then_some(normalized)
}

fn non_empty(value: String) -> Option<String> {
    (!value.trim().is_empty()).then_some(value)
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

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
