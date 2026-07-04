use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const WORKSPACES_INVITATIONS_PATH: &str = "/api/workspaces/invitations";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const LOOKUP_FAILED_MESSAGE: &str = "Failed to list workspace invitations";
const LOOKUP_FAILED_ERROR_CODE: &str = "WORKSPACE_INVITATIONS_LOOKUP_FAILED";

#[derive(Deserialize)]
struct UserPrivateDetailsEmailRow {
    email: Option<String>,
}

#[derive(Deserialize)]
struct DirectInviteRow {
    ws_id: String,
    #[serde(rename = "type")]
    invite_type: String,
    created_at: Option<String>,
}

#[derive(Deserialize)]
struct EmailInviteRow {
    ws_id: String,
    #[serde(rename = "type")]
    invite_type: String,
    created_at: Option<String>,
    email: String,
}

#[derive(Deserialize)]
struct MembershipRow {
    ws_id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceRow {
    id: String,
    name: Option<String>,
    avatar_url: Option<String>,
    logo_url: Option<String>,
    handle: Option<String>,
    personal: Option<bool>,
}

#[derive(Serialize)]
struct WorkspaceSummary {
    avatar_url: Option<String>,
    handle: Option<String>,
    id: String,
    logo_url: Option<String>,
    name: Option<String>,
    personal: bool,
}

#[derive(Serialize)]
struct InvitationRecord {
    #[serde(rename = "createdAt")]
    created_at: Option<String>,
    #[serde(rename = "matchedEmail")]
    matched_email: Option<String>,
    source: &'static str,
    #[serde(rename = "type")]
    invite_type: String,
    workspace: WorkspaceSummary,
}

#[derive(Serialize)]
struct InvitationsResponse {
    invitations: Vec<InvitationRecord>,
}

/// Authenticated identity resolved for the request. Data reads always use the
/// service role (mirroring the legacy `createAdminClient`), so we only need the
/// user id and the auth email here.
struct ResolvedUser {
    id: String,
    auth_email: Option<String>,
}

pub(crate) async fn handle_workspaces_invitations_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != WORKSPACES_INVITATIONS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => invitations_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn invitations_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let user = match resolve_user(config, request, outbound).await {
        Some(user) => user,
        None => return message_response(401, json!({ "message": UNAUTHORIZED_MESSAGE })),
    };

    match list_pending_invitations(&config.contact_data, outbound, &user).await {
        Ok(invitations) => {
            no_store_response(json_response(200, InvitationsResponse { invitations }))
        }
        Err(()) => message_response(
            500,
            json!({
                "error": LOOKUP_FAILED_MESSAGE,
                "errorCode": LOOKUP_FAILED_ERROR_CODE,
            }),
        ),
    }
}

/// Resolve the authenticated user. The legacy route uses `withSessionAuth` with
/// `allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH`, so either a Supabase
/// session token or a `ttr_app_` app-session token is accepted.
async fn resolve_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<ResolvedUser> {
    if contact::request_has_app_session_token(request) {
        let identity = contact::resolve_app_session_identity(
            config,
            request,
            contact::current_user_app_session_targets(),
        )
        .ok()?;

        if identity.id.trim().is_empty() {
            return None;
        }

        return Some(ResolvedUser {
            id: identity.id,
            auth_email: identity.email,
        });
    }

    let access_token = supabase_auth::request_access_token(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;
    let id = user.id.filter(|id| !id.trim().is_empty())?;

    Some(ResolvedUser {
        id,
        auth_email: user.email,
    })
}

async fn list_pending_invitations(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user: &ResolvedUser,
) -> Result<Vec<InvitationRecord>, ()> {
    let candidate_emails =
        candidate_emails(contact_data, outbound, &user.id, user.auth_email.as_deref()).await?;

    let direct_invites = fetch_direct_invites(contact_data, outbound, &user.id).await?;
    let email_invites = fetch_email_invites(contact_data, outbound, &candidate_emails).await?;

    let mut workspace_ids: Vec<String> = Vec::new();
    for ws_id in direct_invites
        .iter()
        .map(|invite| invite.ws_id.clone())
        .chain(email_invites.iter().map(|invite| invite.ws_id.clone()))
    {
        if !workspace_ids.contains(&ws_id) {
            workspace_ids.push(ws_id);
        }
    }

    if workspace_ids.is_empty() {
        return Ok(Vec::new());
    }

    let member_workspace_ids =
        fetch_membership_workspace_ids(contact_data, outbound, &user.id, &workspace_ids).await?;
    let workspace_rows = fetch_workspaces(contact_data, outbound, &workspace_ids).await?;

    let mut invitations: Vec<InvitationRecord> = Vec::new();

    for workspace in workspace_rows {
        let is_member = member_workspace_ids.iter().any(|id| id == &workspace.id);
        let is_personal = workspace.personal == Some(true);
        if is_member || is_personal {
            continue;
        }

        let summary = to_workspace_summary(&workspace);
        if let Some(record) = choose_invite_for_workspace(&direct_invites, &email_invites, summary)
        {
            invitations.push(record);
        }
    }

    invitations.sort_by(compare_invitations);

    Ok(invitations)
}

async fn candidate_emails(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    auth_email: Option<&str>,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "user_private_details",
        &[
            ("select", "email".to_owned()),
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

    let private_email = response
        .json::<Vec<UserPrivateDetailsEmailRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.email);

    Ok(unique_emails(&[auth_email, private_email.as_deref()]))
}

async fn fetch_direct_invites(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Vec<DirectInviteRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_invites",
        &[
            ("select", "ws_id,type,created_at".to_owned()),
            ("user_id", format!("eq.{user_id}")),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<DirectInviteRow>>().map_err(|_| ())
}

async fn fetch_email_invites(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    candidate_emails: &[String],
) -> Result<Vec<EmailInviteRow>, ()> {
    if candidate_emails.is_empty() {
        return Ok(Vec::new());
    }

    let Some(url) = contact_data.rest_url(
        "workspace_email_invites",
        &[
            ("select", "ws_id,type,created_at,email".to_owned()),
            (
                "email",
                format!("in.({})", postgrest_in_list(candidate_emails)),
            ),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<EmailInviteRow>>().map_err(|_| ())
}

async fn fetch_membership_workspace_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    workspace_ids: &[String],
) -> Result<Vec<String>, ()> {
    if workspace_ids.is_empty() {
        return Ok(Vec::new());
    }

    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "ws_id".to_owned()),
            ("user_id", format!("eq.{user_id}")),
            (
                "ws_id",
                format!("in.({})", postgrest_in_list(workspace_ids)),
            ),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<MembershipRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.ws_id)
        .collect())
}

async fn fetch_workspaces(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_ids: &[String],
) -> Result<Vec<WorkspaceRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id,name,avatar_url,logo_url,handle,personal".to_owned(),
            ),
            ("id", format!("in.({})", postgrest_in_list(workspace_ids))),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<WorkspaceRow>>().map_err(|_| ())
}

fn choose_invite_for_workspace(
    direct_invites: &[DirectInviteRow],
    email_invites: &[EmailInviteRow],
    workspace: WorkspaceSummary,
) -> Option<InvitationRecord> {
    if let Some(direct) = direct_invites
        .iter()
        .find(|invite| invite.ws_id == workspace.id)
    {
        return Some(InvitationRecord {
            created_at: direct.created_at.clone(),
            matched_email: None,
            source: "direct",
            invite_type: direct.invite_type.clone(),
            workspace,
        });
    }

    let email = email_invites
        .iter()
        .find(|invite| invite.ws_id == workspace.id)?;

    Some(InvitationRecord {
        created_at: email.created_at.clone(),
        matched_email: normalize_email(Some(&email.email)),
        source: "email",
        invite_type: email.invite_type.clone(),
        workspace,
    })
}

fn to_workspace_summary(workspace: &WorkspaceRow) -> WorkspaceSummary {
    WorkspaceSummary {
        avatar_url: workspace.avatar_url.clone(),
        handle: workspace.handle.clone(),
        id: workspace.id.clone(),
        logo_url: workspace.logo_url.clone(),
        name: workspace.name.clone(),
        personal: workspace.personal == Some(true),
    }
}

fn compare_invitations(a: &InvitationRecord, b: &InvitationRecord) -> std::cmp::Ordering {
    let a_time = a.created_at.as_deref().and_then(parse_iso8601_millis);
    let b_time = b.created_at.as_deref().and_then(parse_iso8601_millis);

    match (a_time, b_time) {
        (Some(a_time), Some(b_time)) => b_time.cmp(&a_time),
        // Mirrors the legacy NaN branch: fall back to name comparison.
        _ => {
            let a_name = a.workspace.name.as_deref().unwrap_or("");
            let b_name = b.workspace.name.as_deref().unwrap_or("");
            a_name.cmp(b_name)
        }
    }
}

fn normalize_email(value: Option<&str>) -> Option<String> {
    let trimmed = value?.trim().to_lowercase();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn unique_emails(values: &[Option<&str>]) -> Vec<String> {
    let mut result: Vec<String> = Vec::new();
    for value in values {
        if let Some(email) = normalize_email(*value)
            && !result.contains(&email)
        {
            result.push(email);
        }
    }
    result
}

fn postgrest_in_list(values: &[String]) -> String {
    values
        .iter()
        .map(|value| format!("\"{}\"", value.replace('"', "\\\"")))
        .collect::<Vec<_>>()
        .join(",")
}

/// Best-effort parse of an ISO-8601 timestamp to epoch milliseconds, sufficient
/// for ordering. Returns None when the string cannot be parsed, mirroring the
/// legacy `Date.parse` NaN fallback.
fn parse_iso8601_millis(value: &str) -> Option<i64> {
    let value = value.trim();
    if value.len() < 19 {
        return None;
    }
    let bytes = value.as_bytes();
    let digits = |start: usize, len: usize| -> Option<i64> {
        let slice = value.get(start..start + len)?;
        slice.parse::<i64>().ok()
    };

    if bytes.get(4) != Some(&b'-') || bytes.get(7) != Some(&b'-') {
        return None;
    }
    let year = digits(0, 4)?;
    let month = digits(5, 2)?;
    let day = digits(8, 2)?;
    let hour = digits(11, 2)?;
    let minute = digits(14, 2)?;
    let second = digits(17, 2)?;

    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    // Days from civil date (Howard Hinnant's algorithm).
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;

    let total_seconds = days * 86_400 + hour * 3_600 + minute * 60 + second;

    // Optional fractional seconds (milliseconds).
    let mut millis = 0i64;
    if let Some(b'.') = bytes.get(19) {
        let frac: String = value[20..]
            .chars()
            .take_while(|c| c.is_ascii_digit())
            .take(3)
            .collect();
        if !frac.is_empty() {
            let padded = format!("{frac:0<3}");
            millis = padded.parse::<i64>().unwrap_or(0);
        }
    }

    Some(total_seconds * 1_000 + millis)
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

fn message_response(status: u16, payload: serde_json::Value) -> BackendResponse {
    no_store_response(json_response(status, payload))
}
