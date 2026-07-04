//! Handler for `GET /api/v1/workspaces/:wsId/topic-announcements/contacts`.
//!
//! Migrates ONLY the GET method of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/topic-announcements/contacts/route.ts`.
//! The legacy route also defines POST; that (and any future verb) is left to the
//! still-active Next.js route by returning `None` for every non-GET method so
//! the Cloudflare worker falls through.
//!
//! The legacy GET resolves access via `resolveTopicAnnouncementsAccess(request,
//! wsId, { requireManage: true })`, which:
//!
//!   1. normalizes the workspace id (slug / `personal` / `internal` handling),
//!   2. requires `getPermissions(...)` to be non-null (else 404 "Not found"),
//!   3. requires the `ENABLE_TOPIC_ANNOUNCEMENTS` workspace secret to equal
//!      "true" (else 404 "Not found"),
//!   4. requires the workspace to exist and be non-personal (else 404),
//!   5. requires the `manage_users` permission (else 403 "Insufficient
//!      permissions").
//!
//! It then reads `topic_announcement_contacts` (PRIVATE schema) filtered by
//! `ws_id`, ordered by `name` ascending, limited to 500 rows, applies optional
//! `q` (OR filter on name/email) and `includeArchived` filters, serializes each
//! contact with its verification status, and returns `{ data: [...] }`.
//!
//! # Behavior gaps vs. legacy
//!
//! - The auth machinery is a file-local copy of the equivalent private fns in
//!   the sibling `workspaces_wsid_topic_announcements.rs` module. A
//!   fully-missing session yields `401 "Unauthorized"` here rather than the
//!   legacy `getPermissions(...) === null -> 404`. Once a session exists every
//!   subsequent status code matches the legacy ordering exactly.
//! - Any thrown Supabase error in the legacy handler surfaces as an unhandled
//!   500; this port returns `500 { "message": "Internal Server Error" }`.

use serde::Deserialize;
use serde_json::{Map, Value, json};
use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/topic-announcements/contacts";

const PRIVATE_SCHEMA: &str = "private";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";

const TOPIC_ANNOUNCEMENTS_SECRET: &str = "ENABLE_TOPIC_ANNOUNCEMENTS";
const MANAGE_USERS_PERMISSION: &str = "manage_users";
const LINKED_VERIFIED_RPC: &str = "topic_announcement_contact_has_linked_verified_email";

const NOT_FOUND_MESSAGE: &str = "Not found";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient permissions";
const INTERNAL_ERROR_MESSAGE: &str = "Internal Server Error";

// ---------------------------------------------------------------------------
// Row deserialisation structs
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspacePersonalRow {
    personal: Option<bool>,
}

#[derive(Deserialize)]
struct WorkspaceCreatorRow {
    creator_id: Option<String>,
}

#[derive(Deserialize)]
struct MembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct PermissionRow {
    permission: Option<String>,
}

#[derive(Deserialize)]
struct RoleMemberRow {
    #[serde(default)]
    workspace_roles: Vec<RoleRow>,
}

#[derive(Deserialize)]
struct RoleRow {
    #[serde(default)]
    workspace_role_permissions: Vec<PermissionRow>,
}

#[derive(Deserialize)]
struct WorkspaceSecretRow {
    value: Option<String>,
}

#[derive(Deserialize)]
struct VerificationRow {
    contact_id: Option<String>,
    status: Option<String>,
    expires_at: Option<String>,
}

// ---------------------------------------------------------------------------
// Effective workspace permissions (mirrors getPermissions)
// ---------------------------------------------------------------------------

struct WorkspaceAccess {
    all: bool,
    permissions: Vec<String>,
}

impl WorkspaceAccess {
    fn all() -> Self {
        Self {
            all: true,
            permissions: Vec::new(),
        }
    }

    fn from_permissions(permissions: Vec<String>) -> Self {
        let all = permissions.iter().any(|p| p == "admin");
        Self { all, permissions }
    }

    fn contains(&self, permission: &str) -> bool {
        self.all || self.permissions.iter().any(|p| p == permission)
    }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_topic_announcements_contacts_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = contacts_ws_id(request.path)?;

    Some(match request.method {
        "GET" => contacts_get_response(config, request, raw_ws_id, outbound).await,
        // Every non-GET method (POST and any future verb) is still served by
        // the active Next.js route, so fall through instead of 405-ing.
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET response
// ---------------------------------------------------------------------------

async fn contacts_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        return message_response(500, INTERNAL_ERROR_MESSAGE);
    }

    // --- Authenticate the caller -------------------------------------------
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    // --- Resolve access (mirrors resolveTopicAnnouncementsAccess) ----------
    let normalized_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(()) => return message_response(500, INTERNAL_ERROR_MESSAGE),
        };

    let access =
        match workspace_permissions(contact_data, outbound, &normalized_ws_id, &user_id).await {
            Ok(Some(access)) => access,
            Ok(None) => return message_response(404, NOT_FOUND_MESSAGE),
            Err(()) => return message_response(500, INTERNAL_ERROR_MESSAGE),
        };

    match topic_announcements_enabled(contact_data, outbound, &normalized_ws_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(404, NOT_FOUND_MESSAGE),
        Err(()) => return message_response(500, INTERNAL_ERROR_MESSAGE),
    }

    match workspace_is_non_personal(contact_data, outbound, &normalized_ws_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(404, NOT_FOUND_MESSAGE),
        Err(()) => return message_response(500, INTERNAL_ERROR_MESSAGE),
    }

    if !access.contains(MANAGE_USERS_PERMISSION) {
        return message_response(403, INSUFFICIENT_PERMISSIONS_MESSAGE);
    }

    // --- Parse query params ------------------------------------------------
    let (q, include_archived) = parse_contacts_query(request.url);

    // --- Fetch and serialise contacts --------------------------------------
    match build_contacts_payload(
        contact_data,
        outbound,
        &normalized_ws_id,
        &q,
        include_archived,
    )
    .await
    {
        Ok(payload) => no_store_response(json_response(200, payload)),
        Err(()) => message_response(500, INTERNAL_ERROR_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// Query parsing
// ---------------------------------------------------------------------------

/// Returns `(q, include_archived)` from the request URL's search params.
/// Both params are optional; `q` defaults to `""`, `includeArchived` defaults
/// to `false`.
fn parse_contacts_query(request_url: Option<&str>) -> (String, bool) {
    let mut raw: BTreeMap<String, String> = BTreeMap::new();
    if let Some(url) = request_url.and_then(|u| url::Url::parse(u).ok()) {
        for (key, value) in url.query_pairs() {
            raw.insert(key.into_owned(), value.into_owned());
        }
    }

    let q = raw
        .get("q")
        .map(|v| v.trim().to_owned())
        .unwrap_or_default();

    let include_archived = raw
        .get("includeArchived")
        .map(|v| v == "true")
        .unwrap_or(false);

    (q, include_archived)
}

// ---------------------------------------------------------------------------
// Data read + response assembly
// ---------------------------------------------------------------------------

async fn build_contacts_payload(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    q: &str,
    include_archived: bool,
) -> Result<Value, ()> {
    // Build Supabase REST query params for topic_announcement_contacts.
    let mut params: Vec<(&str, String)> =
        vec![("select", "*".to_owned()), ("ws_id", format!("eq.{ws_id}"))];

    if !include_archived {
        params.push(("archived", "eq.false".to_owned()));
    }

    if !q.is_empty() {
        params.push(("or", format!("(name.ilike.%{q}%,email.ilike.%{q}%)")));
    }

    params.push(("order", "name.asc".to_owned()));
    params.push(("limit", "500".to_owned()));

    let Some(url) = contact_data.rest_url("topic_announcement_contacts", &params) else {
        return Err(());
    };

    let response = service_role_get(contact_data, outbound, &url, true).await?;
    if !is_success(response.status) {
        return Err(());
    }

    let rows: Vec<Map<String, Value>> = response
        .json::<Vec<Value>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|v| match v {
            Value::Object(map) => Some(map),
            _ => None,
        })
        .collect();

    // Collect contact ids for verification status lookup.
    let contact_ids: Vec<String> = rows
        .iter()
        .filter_map(|row| row.get("id").and_then(Value::as_str).map(str::to_owned))
        .collect();

    let statuses = contact_verification_statuses(contact_data, outbound, &contact_ids).await?;

    let data: Vec<Value> = rows
        .iter()
        .map(|row| {
            let contact_id = row.get("id").and_then(Value::as_str).unwrap_or_default();
            let status = statuses
                .get(contact_id)
                .map(String::as_str)
                .unwrap_or("needs_verification");
            serialize_contact(row, status)
        })
        .collect();

    Ok(json!({ "data": data }))
}

// ---------------------------------------------------------------------------
// Contact serialisation (mirrors serializeTopicAnnouncementContact)
// ---------------------------------------------------------------------------

fn serialize_contact(contact: &Map<String, Value>, verification_status: &str) -> Value {
    json!({
        "archived": contact.get("archived").cloned().unwrap_or(Value::Null),
        "createdAt": contact.get("created_at").cloned().unwrap_or(Value::Null),
        "email": contact.get("email").cloned().unwrap_or(Value::Null),
        "id": contact.get("id").cloned().unwrap_or(Value::Null),
        "metadata": contact.get("metadata").cloned().unwrap_or(Value::Null),
        "name": contact.get("name").cloned().unwrap_or(Value::Null),
        "tags": contact.get("tags").cloned().unwrap_or(Value::Null),
        "verificationStatus": verification_status,
        "workspaceUserId": contact.get("workspace_user_id").cloned().unwrap_or(Value::Null),
    })
}

// ---------------------------------------------------------------------------
// Contact verification statuses (mirrors getContactVerificationStatuses)
// ---------------------------------------------------------------------------

async fn contact_verification_statuses(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    contact_ids: &[String],
) -> Result<BTreeMap<String, String>, ()> {
    let mut statuses: BTreeMap<String, String> = BTreeMap::new();
    for id in contact_ids {
        statuses.insert(id.clone(), "needs_verification".to_owned());
    }
    if contact_ids.is_empty() {
        return Ok(statuses);
    }

    let now = now_iso_timestamp();
    let Some(url) = contact_data.rest_url(
        "topic_announcement_contact_verifications",
        &[
            ("select", "contact_id,status,expires_at".to_owned()),
            ("contact_id", format!("in.({})", contact_ids.join(","))),
            ("status", "in.(pending,verified)".to_owned()),
            ("order", "created_at.desc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, true).await?;
    if !is_success(response.status) {
        return Err(());
    }

    for row in response.json::<Vec<VerificationRow>>().map_err(|_| ())? {
        let Some(contact_id) = row.contact_id else {
            continue;
        };
        match row.status.as_deref() {
            Some("verified") => {
                statuses.insert(contact_id, "verified".to_owned());
            }
            Some("pending") => {
                let still_needs =
                    statuses.get(&contact_id).map(String::as_str) == Some("needs_verification");
                let not_expired = row
                    .expires_at
                    .as_deref()
                    .is_some_and(|expires_at| expires_at > now.as_str());
                if still_needs && not_expired {
                    statuses.insert(contact_id, "pending".to_owned());
                }
            }
            _ => {}
        }
    }

    // Per-contact RPC override -> linked_confirmed_account.
    for contact_id in contact_ids {
        if contact_has_linked_verified_email(contact_data, outbound, contact_id).await? {
            statuses.insert(contact_id.clone(), "linked_confirmed_account".to_owned());
        }
    }

    Ok(statuses)
}

async fn contact_has_linked_verified_email(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    contact_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rpc_url(LINKED_VERIFIED_RPC) else {
        return Err(());
    };
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = json!({ "p_contact_id": contact_id }).to_string();

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(js_truthy(&response.json::<Value>().map_err(|_| ())?))
}

// ---------------------------------------------------------------------------
// Access resolution helpers (file-local copies; mirrors sibling modules)
// ---------------------------------------------------------------------------

async fn topic_announcements_enabled(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "value".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("name", format!("eq.{TOPIC_ANNOUNCEMENTS_SECRET}")),
            ("order", "created_at.desc".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceSecretRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.value)
        .as_deref()
        == Some("true"))
}

async fn workspace_is_non_personal(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "personal".to_owned()),
            ("id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspacePersonalRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .map(|row| row.personal != Some(true))
        .unwrap_or(false))
}

async fn workspace_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
    user_id: &str,
) -> Result<Option<WorkspaceAccess>, ()> {
    let Some(membership_type) =
        workspace_membership_type(contact_data, outbound, workspace_id, user_id).await?
    else {
        return Ok(None);
    };

    let Some(creator_id) = workspace_creator_id(contact_data, outbound, workspace_id).await? else {
        return Ok(None);
    };
    let is_creator = membership_type == "MEMBER" && creator_id == user_id;

    if is_creator {
        return Ok(Some(WorkspaceAccess::all()));
    }

    let mut permissions = Vec::new();
    if membership_type == "MEMBER" {
        permissions.extend(role_permissions(contact_data, outbound, workspace_id, user_id).await?);
    }
    permissions
        .extend(default_permissions(contact_data, outbound, workspace_id, &membership_type).await?);

    Ok(Some(WorkspaceAccess::from_permissions(permissions)))
}

async fn workspace_membership_type(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
    user_id: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{workspace_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<MembershipRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.membership_type))
}

async fn workspace_creator_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "creator_id".to_owned()),
            ("id", format!("eq.{workspace_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceCreatorRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.creator_id))
}

async fn role_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
    user_id: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_role_members",
        &[
            (
                "select",
                "workspace_roles!inner(workspace_role_permissions(permission))".to_owned(),
            ),
            ("user_id", format!("eq.{user_id}")),
            ("workspace_roles.ws_id", format!("eq.{workspace_id}")),
            (
                "workspace_roles.workspace_role_permissions.enabled",
                "eq.true".to_owned(),
            ),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<RoleMemberRow>>()
        .map_err(|_| ())?
        .into_iter()
        .flat_map(|member| member.workspace_roles)
        .flat_map(|role| role.workspace_role_permissions)
        .filter_map(|permission| permission.permission)
        .collect())
}

async fn default_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
    member_type: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_default_permissions",
        &[
            ("select", "permission".to_owned()),
            ("ws_id", format!("eq.{workspace_id}")),
            ("member_type", format!("eq.{member_type}")),
            ("enabled", "eq.true".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<PermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
}

// ---------------------------------------------------------------------------
// Workspace id normalisation (mirrors normalizeWorkspaceId)
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

    if !is_uuid_literal(&resolved_ws_id) {
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
    let response = caller_rest_get(contact_data, outbound, &url, access_token).await?;
    if !is_success(response.status) {
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
    let response = caller_rest_get(contact_data, outbound, &url, access_token).await?;
    if !is_success(response.status) {
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
    let response = service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success(response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

// ---------------------------------------------------------------------------
// Outbound helpers
// ---------------------------------------------------------------------------

async fn caller_rest_get(
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

async fn service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    private_schema: bool,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if private_schema {
        request = request.with_header("Accept-Profile", PRIVATE_SCHEMA);
    }

    outbound.send(request).await.map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

fn contacts_ws_id(path: &str) -> Option<&str> {
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
        || is_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

fn is_uuid_literal(value: &str) -> bool {
    let value = value.trim();
    value.len() == 36
        && value
            .chars()
            .enumerate()
            .all(|(index, character)| match index {
                8 | 13 | 18 | 23 => character == '-',
                _ => character.is_ascii_hexdigit(),
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

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

/// JS truthiness for the RPC scalar result (`if (data)`).
fn js_truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().map(|n| n != 0.0).unwrap_or(false),
        Value::String(s) => !s.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

// ---------------------------------------------------------------------------
// Timestamp helpers (mirror `new Date().toISOString()`)
// ---------------------------------------------------------------------------

fn now_iso_timestamp() -> String {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    unix_millis_to_iso_timestamp(
        duration.as_secs() as i64 * 1_000 + i64::from(duration.subsec_millis()),
    )
}

fn unix_millis_to_iso_timestamp(unix_millis: i64) -> String {
    let seconds = unix_millis.div_euclid(1_000);
    let millis = unix_millis.rem_euclid(1_000);
    let days = seconds.div_euclid(86_400);
    let seconds_of_day = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis:03}Z")
}

fn civil_from_days(days_since_unix_epoch: i64) -> (i64, i64, i64) {
    let days = days_since_unix_epoch + 719_468;
    let era = if days >= 0 { days } else { days - 146_096 } / 146_097;
    let day_of_era = days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };

    (year + if month <= 2 { 1 } else { 0 }, month, day)
}

// ---------------------------------------------------------------------------
// Tests (pure / sync helpers only)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ws_id_extracted_from_exact_path() {
        assert_eq!(
            contacts_ws_id("/api/v1/workspaces/abc/topic-announcements/contacts"),
            Some("abc")
        );
    }

    #[test]
    fn ws_id_rejects_unrelated_and_nested_paths() {
        assert_eq!(
            contacts_ws_id("/api/v1/workspaces/abc/topic-announcements"),
            None
        );
        assert_eq!(
            contacts_ws_id("/api/v1/workspaces/abc/topic-announcements/contacts/extra"),
            None
        );
        assert_eq!(
            contacts_ws_id("/api/v1/workspaces//topic-announcements/contacts"),
            None
        );
        assert_eq!(
            contacts_ws_id("/api/v2/workspaces/abc/topic-announcements/contacts"),
            None
        );
        assert_eq!(contacts_ws_id("/api/v1/workspaces/abc"), None);
    }

    #[test]
    fn ws_id_accepts_uuid_segment() {
        let uuid = "11111111-1111-4111-8111-111111111111";
        let path = format!("/api/v1/workspaces/{uuid}/topic-announcements/contacts");
        assert_eq!(contacts_ws_id(&path), Some(uuid));
    }

    #[test]
    fn parse_query_defaults() {
        let (q, include_archived) = parse_contacts_query(Some(
            "https://x.test/api/v1/workspaces/abc/topic-announcements/contacts",
        ));
        assert_eq!(q, "");
        assert!(!include_archived);
    }

    #[test]
    fn parse_query_reads_q_and_include_archived() {
        let url = "https://x.test/p?q=%20hello%20&includeArchived=true";
        let (q, include_archived) = parse_contacts_query(Some(url));
        assert_eq!(q, "hello");
        assert!(include_archived);
    }

    #[test]
    fn parse_query_include_archived_false_for_other_values() {
        let (_, include_archived) =
            parse_contacts_query(Some("https://x.test/p?includeArchived=1"));
        assert!(!include_archived);
        let (_, include_archived2) =
            parse_contacts_query(Some("https://x.test/p?includeArchived=True"));
        assert!(!include_archived2);
    }

    #[test]
    fn serialize_contact_renames_columns() {
        let mut contact = Map::new();
        contact.insert("id".to_owned(), json!("c1"));
        contact.insert("created_at".to_owned(), json!("2026-01-01T00:00:00Z"));
        contact.insert("email".to_owned(), json!("a@b.test"));
        contact.insert("name".to_owned(), json!("Alice"));
        contact.insert("archived".to_owned(), json!(false));
        contact.insert("tags".to_owned(), json!(["x"]));
        contact.insert("metadata".to_owned(), json!({ "k": "v" }));
        contact.insert("workspace_user_id".to_owned(), json!("wu1"));

        let serialized = serialize_contact(&contact, "verified");
        assert_eq!(serialized["id"], json!("c1"));
        assert_eq!(serialized["createdAt"], json!("2026-01-01T00:00:00Z"));
        assert_eq!(serialized["verificationStatus"], json!("verified"));
        assert_eq!(serialized["workspaceUserId"], json!("wu1"));
        assert_eq!(serialized["metadata"], json!({ "k": "v" }));
        assert!(!serialized.as_object().unwrap().contains_key("created_at"));
        assert!(
            !serialized
                .as_object()
                .unwrap()
                .contains_key("workspace_user_id")
        );
    }

    #[test]
    fn js_truthy_matches_javascript() {
        assert!(js_truthy(&json!(true)));
        assert!(!js_truthy(&json!(false)));
        assert!(!js_truthy(&Value::Null));
        assert!(!js_truthy(&json!(0)));
        assert!(js_truthy(&json!(1)));
        assert!(!js_truthy(&json!("")));
        assert!(js_truthy(&json!("x")));
    }

    #[test]
    fn is_uuid_literal_accepts_valid_uuid() {
        assert!(is_uuid_literal("11111111-1111-4111-8111-111111111111"));
        assert!(!is_uuid_literal("not-a-uuid"));
        assert!(!is_uuid_literal(""));
        assert!(!is_uuid_literal("11111111-1111-4111-8111-11111111111g"));
    }

    #[test]
    fn now_iso_timestamp_is_well_formed() {
        let ts = now_iso_timestamp();
        // e.g. "2026-06-30T12:34:56.789Z"
        assert_eq!(ts.len(), 24);
        assert!(ts.ends_with('Z'));
        assert_eq!(&ts[4..5], "-");
        assert_eq!(&ts[7..8], "-");
        assert_eq!(&ts[10..11], "T");
    }
}
