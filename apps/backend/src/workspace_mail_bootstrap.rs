//! Handler for `GET /api/v1/workspaces/:wsId/mail/bootstrap`.
//!
//! Ports `apps/web/src/app/api/v1/workspaces/[wsId]/mail/bootstrap/route.ts`
//! (which delegates to `withMailContext` + `getMailBootstrap`).
//!
//! Auth model (mirrors `resolveMailRouteContext`):
//!   1. Resolve caller via app-session token (targets `mail`/`platform`) or a
//!      Supabase access token. Failure -> 401.
//!   2. Caller email must be an exact `@tuturuuu.com` address -> else 403.
//!   3. Normalize the workspace id (`personal`/`internal`/handle aliases) and
//!      require ANY workspace membership row -> else 403 / 500 on lookup error.
//!
//! Bootstrap behaviour (mirrors `getMailBootstrap`):
//!   * Ensure the caller's personal mailbox exists (insert if missing), upsert
//!     their `owner` membership, and ensure the system labels exist.
//!   * Load the caller's mailbox memberships, the non-archived mailboxes, and
//!     all labels for those mailboxes, transformed into the bootstrap payload.
//!
//! All mail tables live in the Supabase `private` schema, so every REST call
//! sets `Accept-Profile`/`Content-Profile: private` and uses the service-role
//! key (the legacy code uses the admin client). Any unexpected failure returns
//! 500 `{ "error": "Internal server error" }`, matching `withMailContext`'s
//! catch-all.
//!
//! NOTE: this module is fully self-contained per the porting constraint. The
//! workspace-id normalization / membership helpers below are COPIED from
//! `workspace_habits_access.rs` (which in turn mirror `@tuturuuu/utils`'s
//! `normalizeWorkspaceId`) and adapted (ANY membership instead of MEMBER-only)
//! because those helpers are private to that module. The integrator should
//! consider promoting these to a shared helper later.

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const WORKSPACE_MAIL_BOOTSTRAP_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACE_MAIL_BOOTSTRAP_PATH_SUFFIX: &str = "/mail/bootstrap";

const PRIVATE_SCHEMA: &str = "private";
const MAIL_APP_SESSION_TARGETS: [&str; 2] = ["mail", "platform"];

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const FORBIDDEN_EMAIL_DETAIL: &str = "Mail is available only to exact @tuturuuu.com accounts.";
const NO_WORKSPACE_ACCESS_MESSAGE: &str = "You don't have access to this workspace";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

/// Mirrors the static `SYSTEM_LABELS` array in `repository/shared.ts`.
const SYSTEM_LABELS: [(&str, &str); 7] = [
    ("Inbox", "inbox"),
    ("Sent", "sent"),
    ("Drafts", "drafts"),
    ("Archive", "archive"),
    ("Trash", "trash"),
    ("Starred", "starred"),
    ("Spam", "spam"),
];

// ---------------------------------------------------------------------------
// Response shapes (match `MailBootstrapResponse` from `@tuturuuu/internal-api`)
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct MailBootstrapResponse {
    labels: Vec<MailLabel>,
    mailboxes: Vec<MailMailbox>,
    user: MailUser,
}

#[derive(Serialize)]
struct MailUser {
    email: String,
    id: String,
}

#[derive(Serialize)]
struct MailMailbox {
    address: String,
    #[serde(rename = "displayName")]
    display_name: String,
    id: String,
    role: String,
    status: String,
    #[serde(rename = "type")]
    mailbox_type: String,
}

#[derive(Serialize)]
struct MailLabel {
    color: Option<String>,
    id: String,
    kind: String,
    name: String,
    slug: String,
}

// ---------------------------------------------------------------------------
// Deserialization rows (from Supabase REST responses)
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
struct MailMailboxRow {
    id: Option<String>,
    address: Option<String>,
    #[serde(default)]
    display_name: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(rename = "type", default)]
    mailbox_type: Option<String>,
}

#[derive(Deserialize)]
struct MailMailboxMemberRow {
    mailbox_id: Option<String>,
    #[serde(default)]
    role: Option<String>,
}

#[derive(Deserialize)]
struct MailLabelRow {
    id: Option<String>,
    #[serde(default)]
    color: Option<String>,
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    slug: Option<String>,
}

/// Resolved caller identity (email + id), available from either auth path.
struct MailUserIdentity {
    email: String,
    id: String,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspace_mail_bootstrap_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspace_mail_bootstrap_ws_id(request.path)?;

    Some(match request.method {
        "GET" => workspace_mail_bootstrap_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn workspace_mail_bootstrap_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // 1. Authenticate the caller (app-session or Supabase token).
    let (identity, access_token) = match resolve_mail_identity(config, request, outbound).await {
        Some(value) => value,
        None => return message_response(401, UNAUTHORIZED_MESSAGE),
    };

    // 2. Email gate: exact @tuturuuu.com only.
    if !is_exact_tuturuuu_dot_com_email(&identity.email) {
        return forbidden_email_response();
    }

    // 3. Normalize workspace id and require ANY membership.
    let resolved_ws_id = match normalize_workspace_id(
        &config.contact_data,
        outbound,
        raw_ws_id,
        &identity.id,
        access_token.as_deref(),
    )
    .await
    {
        Ok(ws_id) => ws_id,
        Err(()) => return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    };

    match verify_workspace_membership_any(
        &config.contact_data,
        outbound,
        &resolved_ws_id,
        &identity.id,
    )
    .await
    {
        Ok(true) => {}
        Ok(false) => return message_response(403, NO_WORKSPACE_ACCESS_MESSAGE),
        // membership_lookup_failed -> 500 Internal server error
        Err(()) => return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    }

    // 4. Run the bootstrap (mailbox provisioning + reads). Any failure mirrors
    //    `withMailContext`'s catch -> 500.
    match build_mail_bootstrap(&config.contact_data, outbound, &identity).await {
        Ok(payload) => no_store_response(json_response(200, payload)),
        Err(()) => message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/// Resolves the caller identity. Returns `(identity, Some(access_token))` for
/// the Supabase-token path and `(identity, None)` for the app-session path
/// (which has no Supabase access token to forward).
async fn resolve_mail_identity(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<(MailUserIdentity, Option<String>)> {
    if contact::request_has_app_session_token(request) {
        let identity =
            contact::resolve_app_session_identity(config, request, &MAIL_APP_SESSION_TARGETS)
                .ok()?;
        let id = non_empty(identity.id)?;
        let email = identity.email.and_then(non_empty)?;

        return Some((MailUserIdentity { email, id }, None));
    }

    let access_token = supabase_auth::request_access_token(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;
    let id = user.id.and_then(non_empty)?;
    let email = user.email.and_then(non_empty)?;

    Some((MailUserIdentity { email, id }, Some(access_token)))
}

fn non_empty(value: String) -> Option<String> {
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_owned())
}

/// Mirrors `isExactTuturuuuDotComEmail` (`/^[^\s@]+@tuturuuu\.com$/i`).
fn is_exact_tuturuuu_dot_com_email(email: &str) -> bool {
    let trimmed = email.trim();
    let Some((local, domain)) = trimmed.split_once('@') else {
        return false;
    };

    !local.is_empty()
        && !local.chars().any(|c| c.is_whitespace() || c == '@')
        && domain.eq_ignore_ascii_case("tuturuuu.com")
}

// ---------------------------------------------------------------------------
// Bootstrap logic
// ---------------------------------------------------------------------------

async fn build_mail_bootstrap(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    identity: &MailUserIdentity,
) -> Result<MailBootstrapResponse, ()> {
    ensure_personal_mailbox(contact_data, outbound, identity).await?;

    let member_rows = load_mailbox_memberships(contact_data, outbound, &identity.id).await?;
    let mailbox_ids: Vec<String> = member_rows
        .iter()
        .filter_map(|row| row.mailbox_id.clone())
        .collect();

    if mailbox_ids.is_empty() {
        return Ok(MailBootstrapResponse {
            labels: Vec::new(),
            mailboxes: Vec::new(),
            user: MailUser {
                email: identity.email.clone(),
                id: identity.id.clone(),
            },
        });
    }

    let mailbox_rows = load_active_mailboxes(contact_data, outbound, &mailbox_ids).await?;

    let mailboxes: Vec<MailMailbox> = mailbox_rows
        .into_iter()
        .filter_map(|row| {
            let id = row.id.clone()?;
            let role = member_rows
                .iter()
                .find(|member| member.mailbox_id.as_deref() == Some(id.as_str()))
                .and_then(|member| member.role.clone())
                .unwrap_or_else(|| "viewer".to_owned());

            Some(to_mailbox(row, role))
        })
        .collect();

    let mailbox_id_list: Vec<String> = mailboxes.iter().map(|mailbox| mailbox.id.clone()).collect();
    let labels = load_labels(contact_data, outbound, &mailbox_id_list).await?;

    Ok(MailBootstrapResponse {
        labels,
        mailboxes,
        user: MailUser {
            email: identity.email.clone(),
            id: identity.id.clone(),
        },
    })
}

/// Mirrors `ensurePersonalMailbox`: look up the mailbox by normalized address,
/// create it if missing, upsert the owner membership, then ensure the system
/// labels exist.
async fn ensure_personal_mailbox(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    identity: &MailUserIdentity,
) -> Result<(), ()> {
    let address = identity.email.trim().to_lowercase();

    let mailbox_id = match find_mailbox_id_by_address(contact_data, outbound, &address).await? {
        Some(id) => id,
        None => create_personal_mailbox(contact_data, outbound, identity, &address).await?,
    };

    upsert_mailbox_owner_member(contact_data, outbound, &mailbox_id, &identity.id).await?;
    ensure_system_labels(contact_data, outbound, &mailbox_id).await?;

    Ok(())
}

async fn find_mailbox_id_by_address(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    address: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "mail_mailboxes",
        &[
            ("select", "id".to_owned()),
            ("address", format!("eq.{address}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_private_get(contact_data, outbound, &url).await?;
    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn create_personal_mailbox(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    identity: &MailUserIdentity,
    address: &str,
) -> Result<String, ()> {
    let Some(url) = contact_data.rest_url("mail_mailboxes", &[("select", "id".to_owned())]) else {
        return Err(());
    };

    let display_name = user_display_name(&identity.email);
    let body = serde_json::to_string(&json!({
        "address": address,
        "created_by": identity.id,
        "display_name": display_name,
        "type": "personal",
    }))
    .map_err(|_| ())?;

    let response = send_private_write(
        contact_data,
        outbound,
        OutboundMethod::Post,
        &url,
        &body,
        "return=representation",
    )
    .await?;

    if !is_success_status(response.status) {
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

async fn upsert_mailbox_owner_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    mailbox_id: &str,
    user_id: &str,
) -> Result<(), ()> {
    let Some(url) = contact_data.rest_url(
        "mail_mailbox_members",
        &[("on_conflict", "mailbox_id,user_id".to_owned())],
    ) else {
        return Err(());
    };

    let body = serde_json::to_string(&json!({
        "created_by": user_id,
        "mailbox_id": mailbox_id,
        "role": "owner",
        "user_id": user_id,
    }))
    .map_err(|_| ())?;

    let response = send_private_write(
        contact_data,
        outbound,
        OutboundMethod::Post,
        &url,
        &body,
        "resolution=merge-duplicates,return=minimal",
    )
    .await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(())
}

async fn ensure_system_labels(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    mailbox_id: &str,
) -> Result<(), ()> {
    let Some(url) = contact_data.rest_url(
        "mail_labels",
        &[("on_conflict", "mailbox_id,slug".to_owned())],
    ) else {
        return Err(());
    };

    let rows: Vec<_> = SYSTEM_LABELS
        .iter()
        .map(|(name, slug)| {
            json!({
                "kind": "system",
                "mailbox_id": mailbox_id,
                "name": name,
                "slug": slug,
            })
        })
        .collect();
    let body = serde_json::to_string(&rows).map_err(|_| ())?;

    let response = send_private_write(
        contact_data,
        outbound,
        OutboundMethod::Post,
        &url,
        &body,
        "resolution=merge-duplicates,return=minimal",
    )
    .await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(())
}

async fn load_mailbox_memberships(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Vec<MailMailboxMemberRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "mail_mailbox_members",
        &[
            ("select", "mailbox_id,role".to_owned()),
            ("user_id", format!("eq.{user_id}")),
        ],
    ) else {
        return Err(());
    };

    let response = send_private_get(contact_data, outbound, &url).await?;
    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<MailMailboxMemberRow>>().map_err(|_| ())
}

async fn load_active_mailboxes(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    mailbox_ids: &[String],
) -> Result<Vec<MailMailboxRow>, ()> {
    let in_filter = format!("in.({})", mailbox_ids.join(","));
    let Some(url) = contact_data.rest_url(
        "mail_mailboxes",
        &[
            ("select", "*".to_owned()),
            ("id", in_filter),
            ("status", "neq.archived".to_owned()),
            // .order('type', asc).order('address', asc)
            ("order", "type.asc,address.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_private_get(contact_data, outbound, &url).await?;
    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<MailMailboxRow>>().map_err(|_| ())
}

async fn load_labels(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    mailbox_ids: &[String],
) -> Result<Vec<MailLabel>, ()> {
    if mailbox_ids.is_empty() {
        return Ok(Vec::new());
    }

    let in_filter = format!("in.({})", mailbox_ids.join(","));
    let Some(url) = contact_data.rest_url(
        "mail_labels",
        &[
            ("select", "*".to_owned()),
            ("mailbox_id", in_filter),
            // .order('kind', desc).order('name', asc)
            ("order", "kind.desc,name.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_private_get(contact_data, outbound, &url).await?;
    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<MailLabelRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(to_label)
        .collect())
}

// ---------------------------------------------------------------------------
// Transforms (mirror `toMailbox` / `toLabel` / `getUserDisplayName`)
// ---------------------------------------------------------------------------

fn to_mailbox(row: MailMailboxRow, role: String) -> MailMailbox {
    let address = row.address.unwrap_or_default();
    let display_name = row
        .display_name
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| address.clone());

    MailMailbox {
        address,
        display_name,
        id: row.id.unwrap_or_default(),
        role,
        status: row.status.unwrap_or_default(),
        mailbox_type: row.mailbox_type.unwrap_or_default(),
    }
}

fn to_label(row: MailLabelRow) -> Option<MailLabel> {
    let id = row.id?;
    Some(MailLabel {
        color: row.color,
        id,
        kind: row.kind.unwrap_or_default(),
        name: row.name.unwrap_or_default(),
        slug: row.slug.unwrap_or_default(),
    })
}

/// Mirrors `getUserDisplayName`: `user.email?.split('@')[0] ?? 'Tuturuuu Mail'`.
fn user_display_name(email: &str) -> String {
    email
        .split('@')
        .next()
        .filter(|value| !value.is_empty())
        .unwrap_or("Tuturuuu Mail")
        .to_owned()
}

// ---------------------------------------------------------------------------
// Workspace id normalization + membership (COPIED from
// workspace_habits_access.rs, adapted to ANY membership and an optional
// access token for the app-session auth path).
// ---------------------------------------------------------------------------

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: Option<&str>,
) -> Result<String, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id).await;
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(resolved_ws_id);
        }

        if let Some(access_token) = access_token {
            if let Some(workspace_id) =
                workspace_id_by_handle_caller(contact_data, outbound, &handle, access_token).await?
            {
                return Ok(workspace_id);
            }
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

    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !is_success_status(response.status) {
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

async fn workspace_id_by_handle_caller(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = workspace_handle_url(contact_data, handle) else {
        return Err(());
    };

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

    if !is_success_status(response.status) {
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
    let Some(url) = workspace_handle_url(contact_data, handle) else {
        return Err(());
    };

    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !is_success_status(response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

fn workspace_handle_url(contact_data: &contact::ContactDataConfig, handle: &str) -> Option<String> {
    contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id".to_owned()),
            ("handle", format!("eq.{handle}")),
            ("limit", "1".to_owned()),
        ],
    )
}

/// ANY membership check: a membership row of any type must exist.
async fn verify_workspace_membership_any(
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

    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(!response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .is_empty())
}

// ---------------------------------------------------------------------------
// REST helpers
// ---------------------------------------------------------------------------

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

/// Service-role GET against the `private` schema.
async fn send_private_get(
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
                .with_header("Accept-Profile", PRIVATE_SCHEMA),
        )
        .await
        .map_err(|_| ())
}

/// Service-role write (POST/PATCH) against the `private` schema.
async fn send_private_write(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
    body: &str,
    prefer: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(method, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Prefer", prefer)
                .with_body(body),
        )
        .await
        .map_err(|_| ())
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

// ---------------------------------------------------------------------------
// Path matching + small workspace-id helpers
// ---------------------------------------------------------------------------

fn workspace_mail_bootstrap_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACE_MAIL_BOOTSTRAP_PATH_PREFIX)?
        .strip_suffix(WORKSPACE_MAIL_BOOTSTRAP_PATH_SUFFIX)?;

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

// ---------------------------------------------------------------------------
// Response builders
// ---------------------------------------------------------------------------

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

fn forbidden_email_response() -> BackendResponse {
    no_store_response(json_response(
        403,
        json!({
            "error": FORBIDDEN_MESSAGE,
            "message": FORBIDDEN_EMAIL_DETAIL,
        }),
    ))
}
