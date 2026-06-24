//! Handler for `GET /api/v1/workspaces/:wsId/mail/mailboxes/:mailboxId/members`.
//!
//! Ports the GET method of
//! `apps/web/src/app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/members/route.ts`
//! (which delegates to `withMailContext` + `listMailboxMembers`).
//!
//! The legacy route file ALSO defines a POST method (`upsertMailboxMember`)
//! which is NOT being migrated here. For any non-GET method this handler
//! returns `None` so the Cloudflare worker falls through to the still-active
//! Next.js route. (We do NOT return `method_not_allowed` for POST, to avoid
//! 405ing a still-valid mutation.)
//!
//! Auth model (mirrors `resolveMailRouteContext`):
//!   1. Resolve the caller via an app-session token (targets `mail`/`platform`)
//!      or a Supabase access token. Failure -> 401 `{ "error": "Unauthorized" }`.
//!   2. Caller email must be an exact `@tuturuuu.com` address -> else 403
//!      `{ "error": "Forbidden", "message": "Mail is available only ..." }`.
//!   3. Normalize the workspace id (`personal`/`internal`/handle aliases) and
//!      require ANY workspace membership row -> else 403
//!      `{ "error": "You don't have access to this workspace" }` / 500 on
//!      membership lookup failure.
//!
//! GET behaviour (mirrors `listMailboxMembers` + `requireMailboxAccess`):
//!   * `requireMailboxAccess(ctx, mailboxId, ['admin','owner'])`:
//!       - membership row lookup error -> throws -> 500
//!       - no membership row, or role not in {admin, owner} -> returns null
//!         -> route returns 403 `{ "error": "Forbidden" }`
//!       - mailbox lookup error -> throws -> 500
//!       - mailbox status != 'active' -> returns null -> route returns 403
//!   * On access granted, list `mail_mailbox_members` rows
//!     (`created_at, role, user_id`) ordered by `created_at` ascending, and for
//!     each row enrich with the member's profile:
//!       - `users.display_name` (public schema)
//!       - `user_private_details.email, full_name` (public schema)
//!       - `email = private.email ?? null`
//!       - `fullName = private.full_name ?? users.display_name ?? null`
//!   * Respond 200 `{ "members": [{ createdAt, email, fullName, role, userId }] }`.
//!
//! All mail tables live in the Supabase `private` schema, so every mail REST
//! read sets `Accept-Profile: private` and uses the service-role key (the legacy
//! code uses the admin client). The profile tables (`users`,
//! `user_private_details`) live in the default `public` schema and are read with
//! the service-role key WITHOUT the private profile header. Any unexpected
//! failure returns 500 `{ "error": "Internal server error" }`, matching
//! `withMailContext`'s catch-all.
//!
//! NOTE: this module is fully self-contained per the porting constraint. The
//! authentication, workspace-id normalization, membership, mailbox-access, and
//! REST helpers below are COPIED from `workspace_mail_bootstrap.rs` /
//! `workspaces_mail_mailboxes_messages.rs` (which mirror `@tuturuuu/utils`'s
//! `normalizeWorkspaceId` and the mail repository), because those helpers are
//! private to those modules. The integrator should consider promoting the
//! shared mail-auth helpers to a common module later.

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const MAIL_SEGMENT: &str = "/mail/mailboxes/";
const MEMBERS_SUFFIX: &str = "/members";

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

/// Roles allowed to view the mailbox member list (mirrors the
/// `['admin', 'owner']` argument passed to `requireMailboxAccess`).
const ALLOWED_MEMBER_LIST_ROLES: [&str; 2] = ["admin", "owner"];

// ---------------------------------------------------------------------------
// Response shapes (match `MailMailboxMember` from `@tuturuuu/internal-api`)
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct MembersResponse {
    members: Vec<MailMailboxMember>,
}

#[derive(Serialize)]
struct MailMailboxMember {
    #[serde(rename = "createdAt")]
    created_at: Option<String>,
    email: Option<String>,
    #[serde(rename = "fullName")]
    full_name: Option<String>,
    role: Option<String>,
    #[serde(rename = "userId")]
    user_id: String,
}

// ---------------------------------------------------------------------------
// Deserialization rows (from Supabase REST responses)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct MailboxMemberRoleRow {
    #[serde(default)]
    role: Option<String>,
}

#[derive(Deserialize)]
struct MailboxStatusRow {
    #[serde(default)]
    status: Option<String>,
}

#[derive(Deserialize)]
struct MailboxMemberRow {
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    role: Option<String>,
    #[serde(default)]
    user_id: Option<String>,
}

#[derive(Deserialize)]
struct UserDisplayRow {
    #[serde(default)]
    display_name: Option<String>,
}

#[derive(Deserialize)]
struct UserPrivateDetailsRow {
    #[serde(default)]
    email: Option<String>,
    #[serde(default)]
    full_name: Option<String>,
}

/// Resolved caller identity (email + id), available from either auth path.
struct MailUserIdentity {
    email: String,
    id: String,
}

struct RouteParams<'a> {
    raw_ws_id: &'a str,
    mailbox_id: &'a str,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_mail_mailboxes_mailboxid_members_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let params = parse_route(request.path)?;

    // Only the GET method is migrated. Every other method (e.g. POST) must fall
    // through to the still-active Next.js route -> return None.
    Some(match request.method {
        "GET" => list_members_response(config, request, &params, outbound).await,
        _ => return None,
    })
}

/// Matches `/api/v1/workspaces/:wsId/mail/mailboxes/:mailboxId/members` with no
/// trailing sub-path. Returns `None` if the shape does not match.
fn parse_route(path: &str) -> Option<RouteParams<'_>> {
    let rest = path.strip_prefix(PATH_PREFIX)?;

    let mail_idx = rest.find(MAIL_SEGMENT)?;
    let raw_ws_id = &rest[..mail_idx];
    if raw_ws_id.is_empty() || raw_ws_id.contains('/') {
        return None;
    }

    let after_mail = &rest[mail_idx + MAIL_SEGMENT.len()..];
    let mailbox_id = after_mail.strip_suffix(MEMBERS_SUFFIX)?;
    if mailbox_id.is_empty() || mailbox_id.contains('/') {
        return None;
    }

    Some(RouteParams {
        raw_ws_id,
        mailbox_id,
    })
}

async fn list_members_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    params: &RouteParams<'_>,
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

    let contact_data = &config.contact_data;

    // 3. Normalize workspace id and require ANY membership.
    let resolved_ws_id = match normalize_workspace_id(
        contact_data,
        outbound,
        params.raw_ws_id,
        &identity.id,
        access_token.as_deref(),
    )
    .await
    {
        Ok(ws_id) => ws_id,
        Err(()) => return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    };

    match verify_workspace_membership_any(contact_data, outbound, &resolved_ws_id, &identity.id)
        .await
    {
        Ok(true) => {}
        Ok(false) => return message_response(403, NO_WORKSPACE_ACCESS_MESSAGE),
        Err(()) => return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    }

    // 4. Mailbox access: caller must be a member with role admin|owner AND the
    //    mailbox must be active. A lookup error mirrors the repository throwing
    //    -> 500; a denied access (null) mirrors `listMailboxMembers` returning
    //    null -> 403 Forbidden.
    match require_mailbox_access_role(contact_data, outbound, params.mailbox_id, &identity.id).await
    {
        Ok(true) => {}
        Ok(false) => return message_response(403, FORBIDDEN_MESSAGE),
        Err(()) => return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    }

    // 5. List members and enrich each with the member's profile.
    match build_members(contact_data, outbound, params.mailbox_id).await {
        Ok(members) => no_store_response(json_response(200, MembersResponse { members })),
        Err(()) => message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// Member listing (mirrors `listMailboxMembers`)
// ---------------------------------------------------------------------------

async fn build_members(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    mailbox_id: &str,
) -> Result<Vec<MailMailboxMember>, ()> {
    let rows = load_mailbox_member_rows(contact_data, outbound, mailbox_id).await?;

    let mut members = Vec::with_capacity(rows.len());
    for row in rows {
        let Some(user_id) = row.user_id else {
            // The legacy code always has a user_id; skip malformed rows.
            continue;
        };

        let (email, display_name, full_name) =
            load_member_profile(contact_data, outbound, &user_id).await?;

        let resolved_full_name = full_name.or(display_name);

        members.push(MailMailboxMember {
            created_at: row.created_at,
            email,
            full_name: resolved_full_name,
            role: row.role,
            user_id,
        });
    }

    Ok(members)
}

async fn load_mailbox_member_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    mailbox_id: &str,
) -> Result<Vec<MailboxMemberRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "mail_mailbox_members",
        &[
            ("select", "created_at,role,user_id".to_owned()),
            ("mailbox_id", format!("eq.{mailbox_id}")),
            ("order", "created_at.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_private_get(contact_data, outbound, &url).await?;
    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<MailboxMemberRow>>().map_err(|_| ())
}

/// Mirrors `getMailboxMemberProfile`: reads `users.display_name` and
/// `user_private_details.{email, full_name}` (both public schema). Returns
/// `(email, display_name, full_name)`.
async fn load_member_profile(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<(Option<String>, Option<String>, Option<String>), ()> {
    // users.display_name
    let Some(users_url) = contact_data.rest_url(
        "users",
        &[
            ("select", "display_name".to_owned()),
            ("id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let users_response = send_service_role_get(contact_data, outbound, &users_url).await?;
    if !is_success_status(users_response.status) {
        return Err(());
    }
    let display_name = users_response
        .json::<Vec<UserDisplayRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.display_name);

    // user_private_details.{email, full_name}
    let Some(private_url) = contact_data.rest_url(
        "user_private_details",
        &[
            ("select", "email,full_name".to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let private_response = send_service_role_get(contact_data, outbound, &private_url).await?;
    if !is_success_status(private_response.status) {
        return Err(());
    }
    let private_row = private_response
        .json::<Vec<UserPrivateDetailsRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next();
    let (email, full_name) = match private_row {
        Some(row) => (row.email, row.full_name),
        None => (None, None),
    };

    Ok((email, display_name, full_name))
}

// ---------------------------------------------------------------------------
// Mailbox access (mirrors `requireMailboxAccess` with roles {admin, owner})
// ---------------------------------------------------------------------------

/// Returns `Ok(true)` when the caller is a mailbox member whose role is one of
/// {admin, owner} AND the mailbox status is `active`. Returns `Ok(false)` for
/// the legacy "returns null" cases (no membership, role not allowed, mailbox
/// not active) which translate to 403. Returns `Err(())` for the legacy "throws"
/// cases (REST/parse failure) which translate to 500.
async fn require_mailbox_access_role(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    mailbox_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    // Caller must be a member of the mailbox with an allowed role.
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
    let response = send_private_get(contact_data, outbound, &member_url).await?;
    if !is_success_status(response.status) {
        return Err(());
    }
    let role = response
        .json::<Vec<MailboxMemberRoleRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.role);

    let allowed = role
        .as_deref()
        .map(|role| ALLOWED_MEMBER_LIST_ROLES.contains(&role))
        .unwrap_or(false);
    if !allowed {
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
    let response = send_private_get(contact_data, outbound, &mailbox_url).await?;
    if !is_success_status(response.status) {
        return Err(());
    }
    let active = response
        .json::<Vec<MailboxStatusRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.status)
        .as_deref()
        == Some("active");

    Ok(active)
}

// ---------------------------------------------------------------------------
// Authentication (COPIED from workspace_mail_bootstrap.rs)
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
// Workspace id normalization + membership (COPIED from
// workspace_mail_bootstrap.rs).
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

        if let Some(access_token) = access_token
            && let Some(workspace_id) =
                workspace_id_by_handle_caller(contact_data, outbound, &handle, access_token).await?
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
        .json::<Vec<serde_json::Value>>()
        .map_err(|_| ())?
        .is_empty())
}

// ---------------------------------------------------------------------------
// REST helpers (COPIED from workspace_mail_bootstrap.rs)
// ---------------------------------------------------------------------------

/// Service-role GET against the default (public) schema.
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

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

// ---------------------------------------------------------------------------
// Small workspace-id helpers (COPIED from workspace_mail_bootstrap.rs)
// ---------------------------------------------------------------------------

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
