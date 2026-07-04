use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRIVATE_SCHEMA: &str = "private";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const NO_WORKSPACE_ACCESS_MESSAGE: &str = "You don't have access to this workspace";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";
const MAIL_ONLY_MESSAGE: &str = "Mail is available only to exact @tuturuuu.com accounts.";

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const MAILBOXES_SEGMENT: &str = "/mail/mailboxes/";
const MESSAGES_SUFFIX: &str = "/messages";

const DEFAULT_PAGE: i64 = 1;
const DEFAULT_PAGE_SIZE: i64 = 40;
const MAX_PAGE_SIZE: i64 = 100;
const MESSAGE_FETCH_LIMIT: i64 = 500;

// ---------------------------------------------------------------------------
// Deserialization helpers
// ---------------------------------------------------------------------------

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

#[derive(Deserialize, Clone)]
struct MailMessageRow {
    id: String,
    mailbox_id: Option<String>,
    body_text: Option<Value>,
    created_at: Option<Value>,
    direction: Option<String>,
    from_address: Option<Value>,
    from_name: Option<Value>,
    has_attachments: Option<Value>,
    received_at: Option<Value>,
    sent_at: Option<Value>,
    snippet: Option<Value>,
    status: Option<String>,
    subject: Option<Value>,
    thread_id: Option<Value>,
}

#[derive(Deserialize)]
struct MailMessageStateRow {
    message_id: Option<String>,
    read_at: Option<Value>,
    starred_at: Option<Value>,
    archived_at: Option<Value>,
    trashed_at: Option<Value>,
}

#[derive(Deserialize)]
struct MailMessageLabelLinkRow {
    message_id: Option<String>,
    label_id: Option<String>,
}

#[derive(Deserialize)]
struct MailLabelRow {
    id: Option<String>,
    color: Option<Value>,
    kind: Option<Value>,
    name: Option<Value>,
    slug: Option<Value>,
}

// ---------------------------------------------------------------------------
// Serialization helpers (response shape)
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone)]
struct MailLabel {
    color: Value,
    id: String,
    kind: Value,
    name: Value,
    slug: Value,
}

/// In-memory representation of a message + its resolved state so we can filter
/// and paginate the same way the legacy repository does.
struct LocalState {
    read_at: bool,
    starred_at: bool,
    archived_at: bool,
    trashed_at: bool,
}

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq, Eq)]
enum Folder {
    Archive,
    Drafts,
    Inbox,
    Sent,
    Spam,
    Starred,
    Trash,
}

struct ListQuery {
    folder: Folder,
    page: i64,
    page_size: i64,
    query: Option<String>,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_mail_mailboxes_mailboxid_messages_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (ws_id, mailbox_id) = parse_path(request.path)?;

    Some(match request.method {
        "GET" => list_messages_response(config, request, ws_id, mailbox_id, outbound).await,
        // Other methods (e.g. POST) are NOT migrated yet: fall through to the
        // still-active Next.js route by returning None.
        _ => return None,
    })
}

async fn list_messages_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    mailbox_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // --- Auth: resolve caller via Supabase access token (session / cookie). ---
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(auth_user) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) = auth_user
        .id
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_owned)
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    // Mail is gated to exact @tuturuuu.com accounts.
    if !is_exact_tuturuuu_dot_com_email(auth_user.email.as_deref()) {
        return no_store_response(json_response(
            403,
            json!({ "error": FORBIDDEN_MESSAGE, "message": MAIL_ONLY_MESSAGE }),
        ));
    }

    // --- Normalize workspace + verify membership (ANY type). ---
    let resolved_ws_id = match normalize_workspace_id(
        &config.contact_data,
        outbound,
        raw_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(ws_id) => ws_id,
        Err(()) => return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    };

    match verify_workspace_member(&config.contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(403, NO_WORKSPACE_ACCESS_MESSAGE),
        Err(()) => return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    }

    // --- Mailbox access (requireMailboxAccess): member role + active mailbox. ---
    match require_mailbox_access(&config.contact_data, outbound, mailbox_id, &user_id).await {
        Ok(true) => {}
        // listMailMessages returns null when access is denied -> { error: 'Forbidden' } 403.
        Ok(false) => return message_response(403, FORBIDDEN_MESSAGE),
        Err(()) => return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    }

    let list_query = parse_list_query(request.url);

    match build_messages_payload(
        &config.contact_data,
        outbound,
        mailbox_id,
        &user_id,
        &list_query,
    )
    .await
    {
        Ok(payload) => no_store_response(json_response(200, payload)),
        Err(()) => message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// Mailbox access
// ---------------------------------------------------------------------------

/// Mirrors `requireMailboxAccess`: the caller must be a member of the mailbox
/// (any role, since the messages list passes no `roles` restriction) and the
/// mailbox must be `active`. Returns Ok(false) for "no access" (-> 403),
/// Ok(true) for granted, Err for an upstream failure (-> 500).
///
/// NOTE: the legacy helper also upserts system labels via
/// `ensureSystemLabels` as a side-effect. That write does not change the
/// messages-list response body (the message list only reads custom
/// per-message labels), so this read-only handler omits it. Flagged in notes.
async fn require_mailbox_access(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    mailbox_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    // Membership lookup (maybeSingle -> first row).
    let Some(url) = contact_data.rest_url(
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
    let response = send_private_service_role_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let member_role = response
        .json::<Vec<MailboxMemberRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.role)
        .filter(|role| !role.trim().is_empty());

    if member_role.is_none() {
        return Ok(false);
    }

    // Mailbox lookup; must be active.
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
    let mailbox_response =
        send_private_service_role_request(contact_data, outbound, &mailbox_url).await?;
    if !(200..300).contains(&mailbox_response.status) {
        return Err(());
    }
    let status = mailbox_response
        .json::<Vec<MailboxRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.status);

    Ok(status.as_deref() == Some("active"))
}

// ---------------------------------------------------------------------------
// Messages payload
// ---------------------------------------------------------------------------

async fn build_messages_payload(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    mailbox_id: &str,
    user_id: &str,
    query: &ListQuery,
) -> Result<Value, ()> {
    let page = query.page.max(1);
    let page_size = query.page_size.clamp(1, MAX_PAGE_SIZE);

    let rows = fetch_messages(contact_data, outbound, mailbox_id, query).await?;
    let message_ids: Vec<String> = rows.iter().map(|row| row.id.clone()).collect();

    let states = fetch_states(contact_data, outbound, &message_ids, user_id).await?;
    let labels_by_message = fetch_labels(contact_data, outbound, &message_ids).await?;

    // Filter rows by folder using resolved per-user state.
    let filtered: Vec<&MailMessageRow> = rows
        .iter()
        .filter(|row| matches_folder(row, states.get(&row.id), query.folder))
        .collect();

    let total = filtered.len() as i64;
    let start = ((page - 1) * page_size).max(0) as usize;
    let page_rows: Vec<&MailMessageRow> = filtered
        .into_iter()
        .skip(start)
        .take(page_size.max(0) as usize)
        .collect();

    let messages: Vec<Value> = page_rows
        .into_iter()
        .map(|row| {
            row_to_summary(
                row,
                states.get(&row.id),
                labels_by_message.get(&row.id).cloned().unwrap_or_default(),
            )
        })
        .collect();

    Ok(json!({
        "messages": messages,
        "pagination": {
            "page": page,
            "pageSize": page_size,
            "total": total,
        },
    }))
}

async fn fetch_messages(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    mailbox_id: &str,
    query: &ListQuery,
) -> Result<Vec<MailMessageRow>, ()> {
    let mut params = vec![
        ("select", "*".to_owned()),
        ("mailbox_id", format!("eq.{mailbox_id}")),
        ("order", "created_at.desc".to_owned()),
        ("limit", MESSAGE_FETCH_LIMIT.to_string()),
    ];

    if let Some(search) = query
        .query
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        // Mirror legacy escaping of literal `%` before building the ilike filter.
        let escaped = search.replace('%', "\\%");
        params.push((
            "or",
            format!(
                "(subject.ilike.%{escaped}%,from_address.ilike.%{escaped}%,snippet.ilike.%{escaped}%)"
            ),
        ));
    }

    let Some(url) = contact_data.rest_url("mail_messages", &params) else {
        return Err(());
    };
    let response = send_private_service_role_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<MailMessageRow>>().map_err(|_| ())
}

async fn fetch_states(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    message_ids: &[String],
    user_id: &str,
) -> Result<HashMap<String, LocalState>, ()> {
    if message_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let Some(url) = contact_data.rest_url(
        "mail_message_user_state",
        &[
            ("select", "*".to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("message_id", in_filter(message_ids)),
        ],
    ) else {
        return Err(());
    };
    let response = send_private_service_role_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response
        .json::<Vec<MailMessageStateRow>>()
        .map_err(|_| ())?;

    let mut map = HashMap::new();
    for row in rows {
        let Some(message_id) = row.message_id else {
            continue;
        };
        map.insert(
            message_id,
            LocalState {
                read_at: is_present(row.read_at.as_ref()),
                starred_at: is_present(row.starred_at.as_ref()),
                archived_at: is_present(row.archived_at.as_ref()),
                trashed_at: is_present(row.trashed_at.as_ref()),
            },
        );
    }

    Ok(map)
}

async fn fetch_labels(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    message_ids: &[String],
) -> Result<HashMap<String, Vec<MailLabel>>, ()> {
    if message_ids.is_empty() {
        return Ok(HashMap::new());
    }

    // Step 1: message -> label_id links.
    let Some(links_url) = contact_data.rest_url(
        "mail_message_labels",
        &[
            ("select", "message_id,label_id".to_owned()),
            ("message_id", in_filter(message_ids)),
        ],
    ) else {
        return Err(());
    };
    let links_response =
        send_private_service_role_request(contact_data, outbound, &links_url).await?;
    if !(200..300).contains(&links_response.status) {
        return Err(());
    }
    let links = links_response
        .json::<Vec<MailMessageLabelLinkRow>>()
        .map_err(|_| ())?;

    let label_ids: Vec<String> = links
        .iter()
        .filter_map(|link| link.label_id.clone())
        .collect::<HashSet<String>>()
        .into_iter()
        .collect();

    if label_ids.is_empty() {
        return Ok(HashMap::new());
    }

    // Step 2: resolve labels.
    let Some(labels_url) = contact_data.rest_url(
        "mail_labels",
        &[("select", "*".to_owned()), ("id", in_filter(&label_ids))],
    ) else {
        return Err(());
    };
    let labels_response =
        send_private_service_role_request(contact_data, outbound, &labels_url).await?;
    if !(200..300).contains(&labels_response.status) {
        return Err(());
    }
    let label_rows = labels_response
        .json::<Vec<MailLabelRow>>()
        .map_err(|_| ())?;

    let label_by_id: HashMap<String, MailLabel> = label_rows
        .into_iter()
        .filter_map(|row| {
            row.id.clone().map(|id| {
                (
                    id.clone(),
                    MailLabel {
                        color: row.color.unwrap_or(Value::Null),
                        id,
                        kind: row.kind.unwrap_or(Value::Null),
                        name: row.name.unwrap_or(Value::Null),
                        slug: row.slug.unwrap_or(Value::Null),
                    },
                )
            })
        })
        .collect();

    // Step 3: group labels by message id.
    let mut labels_by_message: HashMap<String, Vec<MailLabel>> = HashMap::new();
    for link in links {
        let (Some(message_id), Some(label_id)) = (link.message_id, link.label_id) else {
            continue;
        };
        let Some(label) = label_by_id.get(&label_id) else {
            continue;
        };
        labels_by_message
            .entry(message_id)
            .or_default()
            .push(label.clone());
    }

    Ok(labels_by_message)
}

// ---------------------------------------------------------------------------
// Folder filtering + summary mapping (mirrors repository/messages.ts)
// ---------------------------------------------------------------------------

fn matches_folder(row: &MailMessageRow, state: Option<&LocalState>, folder: Folder) -> bool {
    let status = row.status.as_deref();
    let direction = row.direction.as_deref();
    let archived = state.is_some_and(|s| s.archived_at);
    let trashed = state.is_some_and(|s| s.trashed_at);
    let starred = state.is_some_and(|s| s.starred_at);

    match folder {
        Folder::Drafts => status == Some("draft"),
        Folder::Sent => direction == Some("outbound") && status != Some("draft"),
        Folder::Starred => starred,
        Folder::Archive => archived,
        Folder::Spam => status == Some("quarantined"),
        Folder::Trash => trashed || status == Some("quarantined"),
        Folder::Inbox => {
            status != Some("draft") && !archived && !trashed && direction == Some("inbound")
        }
    }
}

fn row_to_summary(
    row: &MailMessageRow,
    state: Option<&LocalState>,
    labels: Vec<MailLabel>,
) -> Value {
    let starred = state.is_some_and(|s| s.starred_at);
    let read = state.is_some_and(|s| s.read_at);
    let unread = row.direction.as_deref() == Some("inbound") && !read;

    let subject = match row.subject.as_ref() {
        Some(Value::String(s)) if !s.is_empty() => Value::String(s.clone()),
        _ => Value::String("(no subject)".to_owned()),
    };

    json!({
        "bodyText": value_or_null(row.body_text.as_ref()),
        "createdAt": value_or_null(row.created_at.as_ref()),
        "fromAddress": value_or_null(row.from_address.as_ref()),
        "fromName": value_or_null(row.from_name.as_ref()),
        "hasAttachments": value_or_null(row.has_attachments.as_ref()),
        "id": row.id,
        "labels": labels,
        "mailboxId": value_or_null(row.mailbox_id.as_ref().map(|v| Value::String(v.clone())).as_ref()),
        "receivedAt": value_or_null(row.received_at.as_ref()),
        "sentAt": value_or_null(row.sent_at.as_ref()),
        "snippet": value_or_null(row.snippet.as_ref()),
        "starred": starred,
        "status": value_or_null(row.status.as_ref().map(|v| Value::String(v.clone())).as_ref()),
        "subject": subject,
        "threadId": value_or_null(row.thread_id.as_ref()),
        "unread": unread,
    })
}

// ---------------------------------------------------------------------------
// Workspace normalization + membership (shared pattern, copied file-local)
// ---------------------------------------------------------------------------

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
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(resolved_ws_id);
        }

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
    let response = send_public_service_role_request(contact_data, outbound, &url).await?;
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
    let response = send_public_service_role_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // requiredType: 'ANY' -> any membership row grants access.
    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        .is_some())
}

// ---------------------------------------------------------------------------
// Outbound request helpers
// ---------------------------------------------------------------------------

/// REST request against the `public` schema using the service-role key.
async fn send_public_service_role_request(
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

/// REST request against the `public` schema using the caller access token so
/// RLS applies (used during workspace normalization).
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

/// REST request against the `private` schema (mail tables) using the
/// service-role key. Mirrors the legacy admin client + `schema('private')`.
async fn send_private_service_role_request(
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
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/// Match `/api/v1/workspaces/{wsId}/mail/mailboxes/{mailboxId}/messages` and
/// extract the two dynamic segments. Returns None when the path does not match.
fn parse_path(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let (ws_id, after_ws) = rest.split_once(MAILBOXES_SEGMENT)?;
    let mailbox_id = after_ws.strip_suffix(MESSAGES_SUFFIX)?;

    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }
    if mailbox_id.is_empty() || mailbox_id.contains('/') {
        return None;
    }

    Some((ws_id, mailbox_id))
}

fn parse_list_query(request_url: Option<&str>) -> ListQuery {
    let mut query = ListQuery {
        folder: Folder::Inbox,
        page: DEFAULT_PAGE,
        page_size: DEFAULT_PAGE_SIZE,
        query: None,
    };

    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return query;
    };

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "folder" => {
                if let Some(folder) = parse_folder(value.as_ref()) {
                    query.folder = folder;
                }
            }
            "page" => {
                // Legacy: Number(... ?? 1); invalid -> NaN -> Math.max(1, NaN) = 1.
                query.page = value.parse::<f64>().ok().map_or(DEFAULT_PAGE, |n| {
                    if n.is_finite() {
                        n as i64
                    } else {
                        DEFAULT_PAGE
                    }
                });
            }
            "pageSize" => {
                query.page_size = value.parse::<f64>().ok().map_or(DEFAULT_PAGE_SIZE, |n| {
                    if n.is_finite() {
                        n as i64
                    } else {
                        DEFAULT_PAGE_SIZE
                    }
                });
            }
            "query" => {
                let trimmed = value.trim();
                if !trimmed.is_empty() {
                    query.query = Some(trimmed.to_owned());
                }
            }
            _ => {}
        }
    }

    query
}

fn parse_folder(value: &str) -> Option<Folder> {
    match value {
        "archive" => Some(Folder::Archive),
        "drafts" => Some(Folder::Drafts),
        "inbox" => Some(Folder::Inbox),
        "sent" => Some(Folder::Sent),
        "spam" => Some(Folder::Spam),
        "starred" => Some(Folder::Starred),
        "trash" => Some(Folder::Trash),
        // Unknown folder values fall back to inbox (legacy casts to the union
        // and the in-memory filter treats unrecognized values as the default
        // inbox branch).
        _ => Some(Folder::Inbox),
    }
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

/// Mirrors `isExactTuturuuuDotComEmail`: trimmed, case-insensitive, exact
/// `<local>@tuturuuu.com` with a non-empty whitespace-free local part.
fn is_exact_tuturuuu_dot_com_email(email: Option<&str>) -> bool {
    let Some(email) = email else {
        return false;
    };
    let trimmed = email.trim();
    let Some((local, domain)) = trimmed.split_once('@') else {
        return false;
    };

    !local.is_empty()
        && !local.chars().any(char::is_whitespace)
        && domain.eq_ignore_ascii_case("tuturuuu.com")
}

/// Build a PostgREST `in.(a,b,c)` filter value for the given ids.
fn in_filter(ids: &[String]) -> String {
    let joined = ids
        .iter()
        .map(|id| format!("\"{}\"", id.replace('"', "\\\"")))
        .collect::<Vec<_>>()
        .join(",");
    format!("in.({joined})")
}

/// A nullable timestamp column is "present" (truthy) when it is a non-null,
/// non-empty JSON value, matching JS `Boolean(state?.field)`.
fn is_present(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) => false,
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Bool(b)) => *b,
        Some(_) => true,
    }
}

fn value_or_null(value: Option<&Value>) -> Value {
    match value {
        Some(Value::Null) | None => Value::Null,
        Some(value) => value.clone(),
    }
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
