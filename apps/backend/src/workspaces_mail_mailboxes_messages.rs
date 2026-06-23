use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const MAIL_SEGMENT: &str = "/mail/mailboxes/";
const MESSAGES_SEGMENT: &str = "/messages/";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const MAIL_APP_SESSION_TARGETS: &[&str] = &["mail", "platform"];

/// Extracted dynamic path segments for this route.
struct RouteParams<'a> {
    raw_ws_id: &'a str,
    mailbox_id: &'a str,
    message_id: &'a str,
}

/// Authenticated caller identity (from app session OR supabase session).
struct CallerIdentity {
    user_id: String,
    email: Option<String>,
    /// Present only when authenticated via a supabase session bearer/cookie.
    access_token: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct MailboxMemberRow {
    role: Option<String>,
}

#[derive(Deserialize)]
struct MailboxRow {
    status: Option<String>,
}

#[derive(Deserialize)]
struct MailMessageRow {
    id: Option<String>,
    mailbox_id: Option<String>,
    subject: Option<String>,
    status: Option<String>,
    direction: Option<String>,
    thread_id: Option<String>,
    from_address: Option<String>,
    from_name: Option<String>,
    snippet: Option<String>,
    body_text: Option<String>,
    body_html: Option<String>,
    sanitized_html: Option<String>,
    has_attachments: Option<bool>,
    created_at: Option<String>,
    received_at: Option<String>,
    sent_at: Option<String>,
}

#[derive(Deserialize)]
struct MailMessageStateRow {
    read_at: Option<String>,
    starred_at: Option<String>,
}

#[derive(Deserialize)]
struct MailMessageLabelLinkRow {
    label_id: Option<String>,
}

#[derive(Deserialize)]
struct MailLabelRow {
    id: Option<String>,
    color: Option<String>,
    kind: Option<String>,
    name: Option<String>,
    slug: Option<String>,
}

#[derive(Deserialize)]
struct MailRecipientRow {
    address: Option<String>,
    display_name: Option<String>,
    kind: Option<String>,
}

#[derive(Deserialize)]
struct MailAttachmentRow {
    id: Option<String>,
    content_id: Option<String>,
    content_type: Option<String>,
    disposition: Option<String>,
    filename: Option<String>,
    storage_bucket: Option<String>,
    size_bytes: Option<serde_json::Value>,
}

#[derive(Serialize)]
struct MailLabelOut {
    color: Option<String>,
    id: String,
    kind: Option<String>,
    name: Option<String>,
    slug: Option<String>,
}

#[derive(Serialize)]
struct MailRecipientOut {
    address: Option<String>,
    #[serde(rename = "displayName")]
    display_name: Option<String>,
    kind: Option<String>,
}

#[derive(Serialize)]
struct MailAttachmentOut {
    #[serde(rename = "contentId")]
    content_id: Option<String>,
    #[serde(rename = "contentType")]
    content_type: Option<String>,
    disposition: Option<String>,
    filename: Option<String>,
    id: String,
    #[serde(rename = "protectedUrl")]
    protected_url: Option<String>,
    #[serde(rename = "sizeBytes")]
    size_bytes: i64,
}

#[derive(Serialize)]
struct MailMessageDetailOut {
    #[serde(rename = "bodyText")]
    body_text: Option<String>,
    #[serde(rename = "createdAt")]
    created_at: Option<String>,
    #[serde(rename = "fromAddress")]
    from_address: Option<String>,
    #[serde(rename = "fromName")]
    from_name: Option<String>,
    #[serde(rename = "hasAttachments")]
    has_attachments: bool,
    id: String,
    labels: Vec<MailLabelOut>,
    #[serde(rename = "mailboxId")]
    mailbox_id: Option<String>,
    #[serde(rename = "receivedAt")]
    received_at: Option<String>,
    #[serde(rename = "sentAt")]
    sent_at: Option<String>,
    snippet: Option<String>,
    starred: bool,
    status: Option<String>,
    subject: String,
    #[serde(rename = "threadId")]
    thread_id: Option<String>,
    unread: bool,
    #[serde(rename = "bodyHtml")]
    body_html: Option<String>,
    #[serde(rename = "sanitizedHtml")]
    sanitized_html: Option<String>,
    attachments: Vec<MailAttachmentOut>,
    recipients: Vec<MailRecipientOut>,
}

pub(crate) async fn handle_workspaces_mail_mailboxes_messages_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let params = parse_route(request.path)?;

    Some(match request.method {
        "GET" => get_message_response(config, request, &params, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

/// Matches `/api/v1/workspaces/:wsId/mail/mailboxes/:mailboxId/messages/:messageId`
/// with no trailing sub-path. Returns `None` if shape does not match.
fn parse_route(path: &str) -> Option<RouteParams<'_>> {
    let rest = path.strip_prefix(PATH_PREFIX)?;

    let mail_idx = rest.find(MAIL_SEGMENT)?;
    let raw_ws_id = &rest[..mail_idx];
    if raw_ws_id.is_empty() || raw_ws_id.contains('/') {
        return None;
    }

    let after_mail = &rest[mail_idx + MAIL_SEGMENT.len()..];
    let messages_idx = after_mail.find(MESSAGES_SEGMENT)?;
    let mailbox_id = &after_mail[..messages_idx];
    if mailbox_id.is_empty() || mailbox_id.contains('/') {
        return None;
    }

    let message_id = &after_mail[messages_idx + MESSAGES_SEGMENT.len()..];
    if message_id.is_empty() || message_id.contains('/') {
        return None;
    }

    Some(RouteParams {
        raw_ws_id,
        mailbox_id,
        message_id,
    })
}

async fn get_message_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    params: &RouteParams<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // --- Authenticate caller (app session OR supabase session) ---
    let Some(caller) = resolve_caller(config, request, outbound).await else {
        return error_response(401, "Unauthorized");
    };

    // --- Mail is restricted to exact @tuturuuu.com emails ---
    if !is_exact_tuturuuu_dot_com_email(caller.email.as_deref()) {
        return no_store_response(json_response(
            403,
            json!({
                "error": "Forbidden",
                "message": "Mail is available only to exact @tuturuuu.com accounts.",
            }),
        ));
    }

    let contact_data = &config.contact_data;

    // --- Normalize workspace id ---
    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, params.raw_ws_id, &caller).await {
            Ok(ws_id) => ws_id,
            Err(()) => return error_response(500, "Internal server error"),
        };

    // --- Verify workspace membership (ANY type) ---
    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &caller.user_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(403, "You don't have access to this workspace"),
        Err(()) => return error_response(500, "Internal server error"),
    }

    // --- Mailbox access: membership role + active mailbox ---
    match require_mailbox_access(contact_data, outbound, params.mailbox_id, &caller.user_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(404, "Not found"),
        Err(()) => return error_response(500, "Internal server error"),
    }

    // --- Load the message scoped to the mailbox ---
    let row = match load_message(contact_data, outbound, params.mailbox_id, params.message_id).await
    {
        Ok(Some(row)) => row,
        Ok(None) => return error_response(404, "Not found"),
        Err(()) => return error_response(500, "Internal server error"),
    };

    let message_id = match row.id.clone() {
        Some(id) => id,
        None => return error_response(500, "Internal server error"),
    };

    // --- Aggregate state, labels, recipients, attachments ---
    let state = match load_message_state(contact_data, outbound, &message_id, &caller.user_id).await
    {
        Ok(state) => state,
        Err(()) => return error_response(500, "Internal server error"),
    };
    let labels = match load_message_labels(contact_data, outbound, &message_id).await {
        Ok(labels) => labels,
        Err(()) => return error_response(500, "Internal server error"),
    };
    let recipients = match load_recipients(contact_data, outbound, &message_id).await {
        Ok(recipients) => recipients,
        Err(()) => return error_response(500, "Internal server error"),
    };
    let attachments = match load_attachments(
        contact_data,
        outbound,
        &resolved_ws_id,
        params.mailbox_id,
        &message_id,
    )
    .await
    {
        Ok(attachments) => attachments,
        Err(()) => return error_response(500, "Internal server error"),
    };

    let detail = build_detail(row, state, labels, recipients, attachments);

    no_store_response(json_response(200, detail))
}

async fn resolve_caller(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<CallerIdentity> {
    // Prefer app-session identity when an app session token is present.
    if contact::request_has_app_session_token(request) {
        let identity =
            contact::resolve_app_session_identity(config, request, MAIL_APP_SESSION_TARGETS)
                .ok()?;
        let user_id = identity.id;
        if user_id.trim().is_empty() {
            return None;
        }
        return Some(CallerIdentity {
            user_id,
            email: identity.email,
            access_token: None,
        });
    }

    // Otherwise fall back to a supabase session (bearer or cookie).
    let access_token = supabase_auth::request_access_token(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;
    let user_id = user.id.filter(|id| !id.trim().is_empty())?;

    Some(CallerIdentity {
        user_id,
        email: user.email,
        access_token: Some(access_token),
    })
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    caller: &CallerIdentity,
) -> Result<String, ()> {
    let resolved = resolve_workspace_id(raw_ws_id);

    if resolved == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, caller).await;
    }

    if !is_workspace_uuid_literal(&resolved) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_workspace_handle(&handle) {
            return Ok(resolved);
        }
        if let Some(ws_id) = workspace_id_by_handle(contact_data, outbound, &handle).await? {
            return Ok(ws_id);
        }
    }

    Ok(resolved)
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    caller: &CallerIdentity,
) -> Result<String, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id,workspace_members!inner(user_id,type)".to_owned(),
            ),
            ("personal", "eq.true".to_owned()),
            (
                "workspace_members.user_id",
                format!("eq.{}", caller.user_id),
            ),
            ("workspace_members.type", "eq.MEMBER".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_rest_request(contact_data, outbound, &url, caller).await?;
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

    // requiredType is 'ANY': any membership row grants access.
    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .map(|row| row.membership_type)
        .is_some())
}

async fn require_mailbox_access(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    mailbox_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    // Caller must be a member of the mailbox.
    let Some(member_url) = contact_data.rest_url(
        "mail_mailbox_members",
        &[
            ("select", "role".to_owned()),
            ("mailbox_id", format!("eq.{mailbox_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_private_rest_request(contact_data, outbound, &member_url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let member = response
        .json::<Vec<MailboxMemberRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next();
    let has_role = member
        .and_then(|row| row.role)
        .map(|role| !role.trim().is_empty())
        .unwrap_or(false);
    if !has_role {
        return Ok(false);
    }

    // Mailbox must exist and be active.
    let Some(mailbox_url) = contact_data.rest_url(
        "mail_mailboxes",
        &[
            ("select", "status".to_owned()),
            ("id", format!("eq.{mailbox_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_private_rest_request(contact_data, outbound, &mailbox_url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let active = response
        .json::<Vec<MailboxRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.status)
        .as_deref()
        == Some("active");

    Ok(active)
}

async fn load_message(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    mailbox_id: &str,
    message_id: &str,
) -> Result<Option<MailMessageRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "mail_messages",
        &[
            ("select", "*".to_owned()),
            ("mailbox_id", format!("eq.{mailbox_id}")),
            ("id", format!("eq.{message_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_private_rest_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<MailMessageRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn load_message_state(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    message_id: &str,
    user_id: &str,
) -> Result<Option<MailMessageStateRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "mail_message_user_state",
        &[
            ("select", "*".to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("message_id", format!("eq.{message_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_private_rest_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<MailMessageStateRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn load_message_labels(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    message_id: &str,
) -> Result<Vec<MailLabelOut>, ()> {
    let Some(link_url) = contact_data.rest_url(
        "mail_message_labels",
        &[
            ("select", "message_id,label_id".to_owned()),
            ("message_id", format!("eq.{message_id}")),
        ],
    ) else {
        return Err(());
    };
    let response = send_private_rest_request(contact_data, outbound, &link_url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let links = response
        .json::<Vec<MailMessageLabelLinkRow>>()
        .map_err(|_| ())?;

    let mut label_ids: Vec<String> = Vec::new();
    for link in links {
        if let Some(id) = link.label_id {
            if !label_ids.contains(&id) {
                label_ids.push(id);
            }
        }
    }
    if label_ids.is_empty() {
        return Ok(Vec::new());
    }

    let in_list = format!("({})", label_ids.join(","));
    let Some(label_url) = contact_data.rest_url(
        "mail_labels",
        &[("select", "*".to_owned()), ("id", format!("in.{in_list}"))],
    ) else {
        return Err(());
    };
    let response = send_private_rest_request(contact_data, outbound, &label_url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let labels = response.json::<Vec<MailLabelRow>>().map_err(|_| ())?;

    Ok(labels
        .into_iter()
        .filter_map(|row| {
            row.id.map(|id| MailLabelOut {
                color: row.color,
                id,
                kind: row.kind,
                name: row.name,
                slug: row.slug,
            })
        })
        .collect())
}

async fn load_recipients(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    message_id: &str,
) -> Result<Vec<MailRecipientOut>, ()> {
    let Some(url) = contact_data.rest_url(
        "mail_recipients",
        &[
            ("select", "*".to_owned()),
            ("message_id", format!("eq.{message_id}")),
            ("order", "created_at.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_private_rest_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<MailRecipientRow>>()
        .map_err(|_| ())?
        .into_iter()
        .map(|row| MailRecipientOut {
            address: row.address,
            display_name: row.display_name,
            kind: row.kind,
        })
        .collect())
}

async fn load_attachments(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    mailbox_id: &str,
    message_id: &str,
) -> Result<Vec<MailAttachmentOut>, ()> {
    let Some(url) = contact_data.rest_url(
        "mail_attachments",
        &[
            ("select", "*".to_owned()),
            ("message_id", format!("eq.{message_id}")),
            ("order", "filename.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_private_rest_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<MailAttachmentRow>>().map_err(|_| ())?;

    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let id = row.id?;
            let protected_url = match row.storage_bucket {
                Some(ref bucket) if !bucket.trim().is_empty() => Some(format!(
                    "/api/v1/workspaces/{ws_id}/mail/mailboxes/{mailbox_id}/messages/{message_id}/attachments/{id}"
                )),
                _ => None,
            };
            Some(MailAttachmentOut {
                content_id: row.content_id,
                content_type: row.content_type,
                disposition: row.disposition,
                filename: row.filename,
                id,
                protected_url,
                size_bytes: json_number_to_i64(row.size_bytes.as_ref()),
            })
        })
        .collect())
}

fn build_detail(
    row: MailMessageRow,
    state: Option<MailMessageStateRow>,
    labels: Vec<MailLabelOut>,
    recipients: Vec<MailRecipientOut>,
    attachments: Vec<MailAttachmentOut>,
) -> MailMessageDetailOut {
    let read_at = state.as_ref().and_then(|s| s.read_at.clone());
    let starred_at = state.as_ref().and_then(|s| s.starred_at.clone());

    let direction = row.direction.clone();
    let subject = row
        .subject
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "(no subject)".to_owned());

    let starred = starred_at.is_some();
    let unread = direction.as_deref() == Some("inbound") && read_at.is_none();

    MailMessageDetailOut {
        body_text: row.body_text,
        created_at: row.created_at,
        from_address: row.from_address,
        from_name: row.from_name,
        has_attachments: row.has_attachments.unwrap_or(false),
        id: row.id.unwrap_or_default(),
        labels,
        mailbox_id: row.mailbox_id,
        received_at: row.received_at,
        sent_at: row.sent_at,
        snippet: row.snippet,
        starred,
        status: row.status,
        subject,
        thread_id: row.thread_id,
        unread,
        body_html: row.body_html,
        sanitized_html: row.sanitized_html,
        attachments,
        recipients,
    }
}

fn json_number_to_i64(value: Option<&serde_json::Value>) -> i64 {
    match value {
        Some(serde_json::Value::Number(n)) => n
            .as_i64()
            .or_else(|| n.as_f64().map(|f| f as i64))
            .unwrap_or(0),
        Some(serde_json::Value::String(s)) => s.trim().parse::<i64>().unwrap_or(0),
        _ => 0,
    }
}

/// Caller-context REST request: uses the supabase access token when present
/// (RLS-scoped), otherwise falls back to service role (app-session callers).
async fn send_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    caller: &CallerIdentity,
) -> Result<OutboundResponse, ()> {
    match caller.access_token.as_deref() {
        Some(token) => send_caller_rest_request(contact_data, outbound, url, token).await,
        None => send_service_role_rest_request(contact_data, outbound, url).await,
    }
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

/// Reads from the `private` Postgres schema (mail tables live there).
/// Uses service-role credentials plus the `Accept-Profile` header so PostgREST
/// targets the `private` schema, mirroring the legacy admin client.
async fn send_private_rest_request(
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
                .with_header("Accept-Profile", "private"),
        )
        .await
        .map_err(|_| ())
}

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
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

fn is_exact_tuturuuu_dot_com_email(email: Option<&str>) -> bool {
    let Some(email) = email else {
        return false;
    };
    let email = email.trim();
    let Some((local, domain)) = email.split_once('@') else {
        return false;
    };

    !local.is_empty()
        && !local.chars().any(char::is_whitespace)
        && domain.eq_ignore_ascii_case("tuturuuu.com")
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
