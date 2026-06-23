use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const WORKSPACES_INVITE_STATUS_PATH_PREFIX: &str = "/api/workspaces/";
const WORKSPACES_INVITE_STATUS_PATH_SUFFIX: &str = "/invite-status";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const WORKSPACE_NOT_FOUND_MESSAGE: &str = "Workspace not found";
const WORKSPACE_NOT_FOUND_CODE: &str = "WORKSPACE_NOT_FOUND";
const LOOKUP_FAILED_MESSAGE: &str = "Failed to read workspace invite status";
const LOOKUP_FAILED_CODE: &str = "WORKSPACE_INVITE_STATUS_LOOKUP_FAILED";

// The legacy route opts into app-session auth via
// `allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH`, whose target list is
// the canonical current-user audience set exposed by `contact`.

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceRow {
    id: Option<String>,
    name: Option<String>,
    avatar_url: Option<String>,
    logo_url: Option<String>,
    handle: Option<String>,
    personal: Option<bool>,
}

#[derive(Deserialize)]
struct WorkspaceMemberRow {
    ws_id: Option<String>,
}

#[derive(Deserialize)]
struct UserPrivateDetailsRow {
    email: Option<String>,
}

#[derive(Deserialize)]
struct DirectInviteRow {
    ws_id: Option<String>,
    #[serde(rename = "type")]
    invite_type: Option<String>,
    created_at: Option<String>,
}

#[derive(Deserialize)]
struct EmailInviteRow {
    ws_id: Option<String>,
    #[serde(rename = "type")]
    invite_type: Option<String>,
    created_at: Option<String>,
    email: Option<String>,
}

#[derive(Clone, Serialize)]
struct WorkspaceSummary {
    avatar_url: Option<String>,
    handle: Option<String>,
    id: String,
    logo_url: Option<String>,
    name: Option<String>,
    personal: bool,
}

pub(crate) async fn handle_workspaces_invite_status_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_invite_status_ws_id(request.path)?;

    Some(match request.method {
        "GET" => invite_status_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn invite_status_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let (user_id, auth_email) = match authenticated_identity(config, request, outbound).await {
        Ok(identity) => identity,
        Err(()) => return message_response(401, UNAUTHORIZED_MESSAGE),
    };

    match compute_invite_status(
        &config.contact_data,
        outbound,
        raw_ws_id,
        &user_id,
        auth_email,
    )
    .await
    {
        Ok(InviteStatus::Member { workspace }) => no_store_response(json_response(
            200,
            json!({
                "status": "member",
                "workspace": workspace,
            }),
        )),
        Ok(InviteStatus::PendingInvite {
            workspace,
            invitation,
        }) => no_store_response(json_response(
            200,
            json!({
                "status": "pending_invite",
                "workspace": workspace,
                "invitation": invitation,
            }),
        )),
        Ok(InviteStatus::WorkspaceNotFound) => not_found_response(),
        Err(()) => lookup_failed_response(),
    }
}

enum InviteStatus {
    Member {
        workspace: WorkspaceSummary,
    },
    PendingInvite {
        workspace: WorkspaceSummary,
        invitation: serde_json::Value,
    },
    WorkspaceNotFound,
}

async fn compute_invite_status(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    auth_email: Option<String>,
) -> Result<InviteStatus, ()> {
    let workspace_id = normalize_direct_workspace_id(contact_data, outbound, raw_ws_id).await?;

    let candidate_emails = candidate_emails(contact_data, outbound, user_id, auth_email).await?;
    let member_ws_ids =
        fetch_membership_workspace_ids(contact_data, outbound, user_id, &workspace_id).await?;
    let direct_invites =
        fetch_direct_invites(contact_data, outbound, user_id, &workspace_id).await?;

    // Member short-circuit, mirroring the legacy ordering.
    if member_ws_ids.iter().any(|id| id == &workspace_id) {
        let Some(workspace) = fetch_workspace(contact_data, outbound, &workspace_id).await? else {
            // Legacy returns a `none` body (HTTP 200) when the membership row
            // exists but the workspace row is missing, since `result.workspace`
            // is null. The route's 404 branch is only hit when `result.workspace`
            // is falsy, so this is treated as Workspace not found (404).
            return Ok(InviteStatus::WorkspaceNotFound);
        };
        return Ok(InviteStatus::Member {
            workspace: to_summary(workspace),
        });
    }

    let email_invites =
        fetch_email_invites(contact_data, outbound, &candidate_emails, &workspace_id).await?;

    if direct_invites.is_empty() && email_invites.is_empty() {
        // Legacy: `{ status: 'none', workspace: null }` -> 404 (workspace null).
        return Ok(InviteStatus::WorkspaceNotFound);
    }

    let Some(workspace) = fetch_workspace(contact_data, outbound, &workspace_id).await? else {
        return Ok(InviteStatus::WorkspaceNotFound);
    };

    if workspace.personal == Some(true) {
        return Ok(InviteStatus::WorkspaceNotFound);
    }

    let summary = to_summary(workspace);
    let Some(invitation) = choose_invite_for_workspace(&direct_invites, &email_invites, &summary)
    else {
        return Ok(InviteStatus::WorkspaceNotFound);
    };

    Ok(InviteStatus::PendingInvite {
        workspace: summary,
        invitation,
    })
}

fn choose_invite_for_workspace(
    direct_invites: &[DirectInviteRow],
    email_invites: &[EmailInviteRow],
    workspace: &WorkspaceSummary,
) -> Option<serde_json::Value> {
    if let Some(direct) = direct_invites
        .iter()
        .find(|invite| invite.ws_id.as_deref() == Some(workspace.id.as_str()))
    {
        return Some(json!({
            "createdAt": direct.created_at,
            "matchedEmail": serde_json::Value::Null,
            "source": "direct",
            "type": direct.invite_type,
            "workspace": workspace,
        }));
    }

    let email_invite = email_invites
        .iter()
        .find(|invite| invite.ws_id.as_deref() == Some(workspace.id.as_str()))?;

    Some(json!({
        "createdAt": email_invite.created_at,
        "matchedEmail": normalize_email(email_invite.email.as_deref()),
        "source": "email",
        "type": email_invite.invite_type,
        "workspace": workspace,
    }))
}

async fn authenticated_identity(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Result<(String, Option<String>), ()> {
    if contact::request_has_app_session_token(request) {
        let identity = contact::resolve_app_session_identity(
            config,
            request,
            contact::current_user_app_session_targets(),
        )?;
        let id = identity.id.trim().to_owned();
        if id.is_empty() {
            return Err(());
        }
        return Ok((id, identity.email));
    }

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return Err(());
    };

    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .ok_or(())?;

    let id = user.id.filter(|id| !id.trim().is_empty()).ok_or(())?;
    Ok((id, user.email))
}

async fn candidate_emails(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    auth_email: Option<String>,
) -> Result<Vec<String>, ()> {
    let private_email = fetch_user_private_email(contact_data, outbound, user_id).await?;

    let mut emails = Vec::new();
    for candidate in [auth_email, private_email] {
        if let Some(email) = normalize_email(candidate.as_deref())
            && !emails.contains(&email)
        {
            emails.push(email);
        }
    }

    Ok(emails)
}

async fn fetch_user_private_email(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Option<String>, ()> {
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

    Ok(response
        .json::<Vec<UserPrivateDetailsRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.email))
}

async fn fetch_membership_workspace_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    workspace_id: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "ws_id".to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("ws_id", format!("in.({workspace_id})")),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceMemberRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.ws_id)
        .collect())
}

async fn fetch_direct_invites(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    workspace_id: &str,
) -> Result<Vec<DirectInviteRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_invites",
        &[
            ("select", "ws_id,type,created_at".to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("ws_id", format!("eq.{workspace_id}")),
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
    workspace_id: &str,
) -> Result<Vec<EmailInviteRow>, ()> {
    if candidate_emails.is_empty() {
        return Ok(Vec::new());
    }

    let emails_filter = candidate_emails.join(",");
    let Some(url) = contact_data.rest_url(
        "workspace_email_invites",
        &[
            ("select", "ws_id,type,created_at,email".to_owned()),
            ("email", format!("in.({emails_filter})")),
            ("ws_id", format!("eq.{workspace_id}")),
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

async fn fetch_workspace(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
) -> Result<Option<WorkspaceRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id,name,avatar_url,logo_url,handle,personal".to_owned(),
            ),
            ("id", format!("eq.{workspace_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn normalize_direct_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
) -> Result<String, ()> {
    if is_workspace_uuid_literal(raw_ws_id) {
        return Ok(raw_ws_id.to_owned());
    }

    // Mirrors `normalizeWorkspaceId(workspaceId, admin)`. The legacy route runs
    // with the admin (service-role) client, so handle/personal lookups execute
    // with the service-role key here.
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        // `personal` requires the authenticated user's membership. The invite
        // status route is intended for direct workspace identifiers / handles,
        // but mirror the legacy fallback by returning the resolved value so the
        // downstream membership/invite checks naturally yield `none`.
        return Ok(resolved_ws_id);
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(resolved_ws_id);
        }

        if let Some(workspace_id) = workspace_id_by_handle(contact_data, outbound, &handle).await? {
            return Ok(workspace_id);
        }
    }

    Ok(resolved_ws_id)
}

async fn workspace_id_by_handle(
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

fn to_summary(workspace: WorkspaceRow) -> WorkspaceSummary {
    WorkspaceSummary {
        avatar_url: workspace.avatar_url,
        handle: workspace.handle,
        id: workspace.id.unwrap_or_default(),
        logo_url: workspace.logo_url,
        name: workspace.name,
        personal: workspace.personal == Some(true),
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

fn workspaces_invite_status_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_INVITE_STATUS_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_INVITE_STATUS_PATH_SUFFIX)?;

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
            .all(|(index, value)| match index {
                8 | 13 | 18 | 23 => value == '-',
                _ => value.is_ascii_hexdigit(),
            })
}

fn is_workspace_handle(value: &str) -> bool {
    let length = value.len();
    if length == 0 || length > 64 {
        return false;
    }

    value.chars().enumerate().all(|(index, character)| {
        let is_edge = index == 0 || index + 1 == length;
        character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || (!is_edge && matches!(character, '_' | '-'))
    })
}

fn not_found_response() -> BackendResponse {
    no_store_response(json_response(
        404,
        json!({
            "error": WORKSPACE_NOT_FOUND_MESSAGE,
            "errorCode": WORKSPACE_NOT_FOUND_CODE,
        }),
    ))
}

fn lookup_failed_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "error": LOOKUP_FAILED_MESSAGE,
            "errorCode": LOOKUP_FAILED_CODE,
        }),
    ))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
