//! Handler for `GET /api/v1/workspaces/:wsId/topic-announcements`.
//!
//! Migrates ONLY the GET method of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/topic-announcements/route.ts`.
//! The legacy route also defines POST; that (and any future verb) is left to the
//! still-active Next.js route by returning `None` for every non-GET method so
//! the Cloudflare worker falls through.
//!
//! The legacy GET resolves access via `resolveTopicAnnouncementsAccess(request,
//! wsId, { requireManage: true })`, which:
//!   1. normalizes the workspace id (slug / `personal` / `internal` handling),
//!   2. requires `getPermissions(...)` to be non-null (else 404 "Not found"),
//!   3. requires the `ENABLE_TOPIC_ANNOUNCEMENTS` workspace secret to equal
//!      "true" (else 404 "Not found"),
//!   4. requires the workspace to exist and be non-personal (else 404),
//!   5. requires the `manage_users` permission (else 403 "Insufficient
//!      permissions").
//!      It then reads `topic_announcements` (PRIVATE schema) filtered by `ws_id`
//!      with the status/search/contact filters, paginated by `page`/`pageSize`,
//!      enriches each row with its recipients (serialized contacts, including
//!      verification status), attachments, and `workspace_user_groups` group, and
//!      returns `{ count, data, page, pageSize, totalPages }`.
//!
//! BEHAVIOR NOTES / GAPS:
//!   * The auth machinery is a file-local copy of the equivalent private fns in
//!     the sibling `workspaces_topic_announcements_templates.rs` module (which
//!     in turn mirror `cms_workspaces.rs` / `workspace_habits_access.rs`). This
//!     keeps the module self-contained without editing shared modules. As in the
//!     templates sibling, the caller's Supabase access token / user is resolved
//!     up front: a fully-missing session yields `401 "Unauthorized"` here rather
//!     than the legacy `getPermissions(...) === null -> 404`. Once a session
//!     exists every subsequent status code matches the legacy ordering exactly.
//!   * The legacy invalid-query response includes a Zod `issues` array; this port
//!     returns `400 { "message": "Invalid query" }` without the `issues` detail.
//!   * Any thrown Supabase error in the legacy handler surfaces as an unhandled
//!     500; this port returns `500 { "message": "Internal Server Error" }`.
//!   * `z.coerce.number()` uses JS `Number()` semantics. This port reproduces the
//!     common cases (trim, empty -> 0, integer/min/max constraints); exotic
//!     numeric literals JS would accept (e.g. `0x..`) are treated as invalid.

use serde::Deserialize;
use serde_json::{Map, Number, Value, json};
use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/topic-announcements";

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
const INVALID_QUERY_MESSAGE: &str = "Invalid query";

const ALLOWED_STATUSES: &[&str] = &[
    "draft",
    "queued",
    "processing",
    "sent",
    "failed",
    "skipped",
    "cancelled",
    "active",
    "all",
];

#[derive(Debug, Eq, PartialEq)]
struct ListQuery {
    contact_id: Option<String>,
    page: i64,
    page_size: i64,
    q: String,
    status: String,
}

impl ListQuery {
    fn offset(&self) -> i64 {
        (self.page - 1) * self.page_size
    }
}

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
struct WorkspaceGroupRow {
    id: Option<String>,
    name: Option<String>,
}

#[derive(Deserialize)]
struct RecipientIdRow {
    announcement_id: Option<String>,
}

#[derive(Deserialize)]
struct VerificationRow {
    contact_id: Option<String>,
    status: Option<String>,
    expires_at: Option<String>,
}

/// Effective permissions a user has in a workspace, mirroring `getPermissions`.
/// A creator (or an `admin` permission) grants every check.
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
        let all = permissions.iter().any(|permission| permission == "admin");
        Self { all, permissions }
    }

    fn contains(&self, permission: &str) -> bool {
        self.all || self.permissions.iter().any(|value| value == permission)
    }
}

pub(crate) async fn handle_workspaces_wsid_topic_announcements_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = topic_announcements_ws_id(request.path)?;

    Some(match request.method {
        "GET" => announcements_get_response(config, request, raw_ws_id, outbound).await,
        // Every non-GET method (POST and any future verb) is still served by the
        // active Next.js route, so fall through instead of 405-ing it.
        _ => return None,
    })
}

async fn announcements_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        return message_response(500, INTERNAL_ERROR_MESSAGE);
    }

    // --- Authenticate the caller (Supabase access token) -------------------
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

    // --- Parse the list query (mirrors TopicAnnouncementListQuerySchema) ----
    let query = match parse_list_query(request.url) {
        Ok(query) => query,
        Err(()) => return message_response(400, INVALID_QUERY_MESSAGE),
    };

    match build_announcements_payload(contact_data, outbound, &normalized_ws_id, &query).await {
        Ok(payload) => no_store_response(json_response(200, payload)),
        Err(()) => message_response(500, INTERNAL_ERROR_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// List query parsing
// ---------------------------------------------------------------------------

fn parse_list_query(request_url: Option<&str>) -> Result<ListQuery, ()> {
    let mut raw: BTreeMap<String, String> = BTreeMap::new();
    if let Some(url) = request_url.and_then(|value| url::Url::parse(value).ok()) {
        // `Object.fromEntries(searchParams.entries())` keeps the LAST value per key.
        for (key, value) in url.query_pairs() {
            raw.insert(key.into_owned(), value.into_owned());
        }
    }

    let page = match raw.get("page") {
        // `z.coerce.number().int().min(1)` has no upper bound.
        Some(value) => coerce_int(value, 1, None)?,
        None => 1,
    };
    let page_size = match raw.get("pageSize") {
        Some(value) => coerce_int(value, 1, Some(100))?,
        None => 20,
    };

    let q = match raw.get("q") {
        Some(value) => {
            let trimmed = value.trim();
            if trimmed.chars().count() > 200 {
                return Err(());
            }
            trimmed.to_owned()
        }
        None => String::new(),
    };

    let status = match raw.get("status") {
        Some(value) => {
            if !ALLOWED_STATUSES.contains(&value.as_str()) {
                return Err(());
            }
            value.clone()
        }
        None => "active".to_owned(),
    };

    let contact_id = match raw.get("contactId") {
        Some(value) => {
            if !is_uuid_literal(value) {
                return Err(());
            }
            Some(value.clone())
        }
        None => None,
    };

    Ok(ListQuery {
        contact_id,
        page,
        page_size,
        q,
        status,
    })
}

/// Reproduces `z.coerce.number().int().min(min).max(max)` for the common cases.
fn coerce_int(value: &str, min: i64, max: Option<i64>) -> Result<i64, ()> {
    let trimmed = value.trim();
    // JS `Number("")` (and whitespace-only) is `0`, not `NaN`.
    let number: f64 = if trimmed.is_empty() {
        0.0
    } else {
        trimmed.parse::<f64>().map_err(|_| ())?
    };

    if !number.is_finite() || number.fract() != 0.0 {
        return Err(());
    }
    let number = number as i64;
    if number < min {
        return Err(());
    }
    if let Some(max) = max
        && number > max
    {
        return Err(());
    }

    Ok(number)
}

/// Mirrors the legacy `status` filter branch on the announcements query.
fn status_filter(status: &str) -> Option<(&'static str, String)> {
    match status {
        "active" => Some(("status", "neq.cancelled".to_owned())),
        "all" => None,
        other => Some(("status", format!("eq.{other}"))),
    }
}

// ---------------------------------------------------------------------------
// Data reads + response assembly
// ---------------------------------------------------------------------------

async fn build_announcements_payload(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &ListQuery,
) -> Result<Value, ()> {
    // Optional contactId pre-filter: announcement ids the contact received.
    let contact_filter_ids = match &query.contact_id {
        Some(contact_id) => {
            Some(fetch_recipient_announcement_ids(contact_data, outbound, contact_id).await?)
        }
        None => None,
    };

    let (announcements, count) = fetch_announcements(
        contact_data,
        outbound,
        ws_id,
        query,
        contact_filter_ids.as_deref(),
    )
    .await?;

    let announcement_ids: Vec<String> = announcements
        .iter()
        .filter_map(|row| row.get("id").and_then(Value::as_str).map(str::to_owned))
        .collect();

    // Recipients (with embedded contacts) + attachments for the page.
    let (recipients_by_announcement, contacts_by_id) =
        fetch_recipients(contact_data, outbound, &announcement_ids).await?;
    let attachments_by_announcement =
        fetch_attachments(contact_data, outbound, &announcement_ids).await?;

    // Serialize contacts, attaching verification status.
    let unique_contact_ids: Vec<String> = contacts_by_id.keys().cloned().collect();
    let statuses =
        contact_verification_statuses(contact_data, outbound, &unique_contact_ids).await?;
    let mut serialized_by_id: BTreeMap<String, Value> = BTreeMap::new();
    for (id, raw_contact) in &contacts_by_id {
        let status = statuses
            .get(id)
            .map(String::as_str)
            .unwrap_or("needs_verification");
        serialized_by_id.insert(id.clone(), serialize_contact(raw_contact, status));
    }

    // Group lookup (PUBLIC schema), mirrors attachTopicAnnouncementGroups.
    let group_ids = distinct_group_ids(&announcements);
    let groups = fetch_groups(contact_data, outbound, &group_ids).await?;

    let data: Vec<Value> = announcements
        .into_iter()
        .map(|row| {
            let announcement_id = row
                .get("id")
                .and_then(Value::as_str)
                .map(str::to_owned)
                .unwrap_or_default();

            let attachments: Vec<Value> = attachments_by_announcement
                .get(&announcement_id)
                .map(|rows| rows.iter().map(serialize_attachment).collect())
                .unwrap_or_default();

            let contacts: Vec<Value> = recipients_by_announcement
                .get(&announcement_id)
                .map(|ids| {
                    ids.iter()
                        .filter_map(|id| serialized_by_id.get(id).cloned())
                        .collect()
                })
                .unwrap_or_default();

            let group = resolve_group(&row, &groups);

            map_announcement_row(row, attachments, contacts, group)
        })
        .collect();

    Ok(json!({
        "count": count,
        "data": data,
        "page": query.page,
        "pageSize": query.page_size,
        "totalPages": total_pages(count, query.page_size),
    }))
}

async fn fetch_recipient_announcement_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    contact_id: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "topic_announcement_recipients",
        &[
            ("select", "announcement_id".to_owned()),
            ("contact_id", format!("eq.{contact_id}")),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, true).await?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<RecipientIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.announcement_id)
        .collect())
}

async fn fetch_announcements(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &ListQuery,
    contact_filter_ids: Option<&[String]>,
) -> Result<(Vec<Map<String, Value>>, i64), ()> {
    let mut params: Vec<(&str, String)> =
        vec![("select", "*".to_owned()), ("ws_id", format!("eq.{ws_id}"))];
    if let Some(filter) = status_filter(&query.status) {
        params.push(filter);
    }
    if !query.q.is_empty() {
        let q = &query.q;
        params.push((
            "or",
            format!("(title.ilike.%{q}%,topic.ilike.%{q}%,class_label.ilike.%{q}%)"),
        ));
    }
    if let Some(ids) = contact_filter_ids {
        params.push(("id", format!("in.({})", ids.join(","))));
    }
    params.push(("order", "created_at.desc".to_owned()));
    params.push(("offset", query.offset().to_string()));
    params.push(("limit", query.page_size.to_string()));

    let Some(url) = contact_data.rest_url("topic_announcements", &params) else {
        return Err(());
    };

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Prefer", "count=exact"),
        )
        .await
        .map_err(|_| ())?;
    if !is_success(response.status) {
        return Err(());
    }

    let count = parse_content_range_count(response.header("Content-Range")).unwrap_or(0);
    let rows: Vec<Value> = response.json().map_err(|_| ())?;
    let announcements = rows
        .into_iter()
        .filter_map(|value| match value {
            Value::Object(map) => Some(map),
            _ => None,
        })
        .collect();

    Ok((announcements, count))
}

#[allow(clippy::type_complexity)]
async fn fetch_recipients(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    announcement_ids: &[String],
) -> Result<
    (
        BTreeMap<String, Vec<String>>,
        BTreeMap<String, Map<String, Value>>,
    ),
    (),
> {
    if announcement_ids.is_empty() {
        return Ok((BTreeMap::new(), BTreeMap::new()));
    }

    let Some(url) = contact_data.rest_url(
        "topic_announcement_recipients",
        &[
            (
                "select",
                "announcement_id,contact:topic_announcement_contacts(*)".to_owned(),
            ),
            (
                "announcement_id",
                format!("in.({})", announcement_ids.join(",")),
            ),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, true).await?;
    if !is_success(response.status) {
        return Err(());
    }

    let rows: Vec<Value> = response.json().map_err(|_| ())?;
    let mut by_announcement: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut contacts_by_id: BTreeMap<String, Map<String, Value>> = BTreeMap::new();

    for row in rows {
        let Some(announcement_id) = row.get("announcement_id").and_then(Value::as_str) else {
            continue;
        };
        let Some(Value::Object(contact)) = row.get("contact") else {
            continue;
        };
        let Some(contact_id) = contact.get("id").and_then(Value::as_str) else {
            continue;
        };

        by_announcement
            .entry(announcement_id.to_owned())
            .or_default()
            .push(contact_id.to_owned());
        contacts_by_id
            .entry(contact_id.to_owned())
            .or_insert_with(|| contact.clone());
    }

    Ok((by_announcement, contacts_by_id))
}

async fn fetch_attachments(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    announcement_ids: &[String],
) -> Result<BTreeMap<String, Vec<Map<String, Value>>>, ()> {
    if announcement_ids.is_empty() {
        return Ok(BTreeMap::new());
    }

    let Some(url) = contact_data.rest_url(
        "topic_announcement_attachments",
        &[
            (
                "select",
                "id,content_type,created_at,file_name,size_bytes,storage_path,storage_provider,announcement_id"
                    .to_owned(),
            ),
            ("announcement_id", format!("in.({})", announcement_ids.join(","))),
            ("order", "created_at.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, true).await?;
    if !is_success(response.status) {
        return Err(());
    }

    let rows: Vec<Value> = response.json().map_err(|_| ())?;
    let mut by_announcement: BTreeMap<String, Vec<Map<String, Value>>> = BTreeMap::new();
    for row in rows {
        let Value::Object(map) = row else { continue };
        let Some(announcement_id) = map.get("announcement_id").and_then(Value::as_str) else {
            continue;
        };
        by_announcement
            .entry(announcement_id.to_owned())
            .or_default()
            .push(map);
    }

    Ok(by_announcement)
}

/// Mirrors `getContactVerificationStatuses`. Returns `contact_id -> status`.
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

async fn fetch_groups(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    group_ids: &[String],
) -> Result<Vec<(String, String)>, ()> {
    if group_ids.is_empty() {
        return Ok(Vec::new());
    }

    let in_list = format!("({})", group_ids.join(","));
    let Some(url) = contact_data.rest_url(
        "workspace_user_groups",
        &[
            ("select", "id,name".to_owned()),
            ("id", format!("in.{in_list}")),
        ],
    ) else {
        return Err(());
    };
    // PUBLIC schema (legacy uses getPublicSchemaClient for the group lookup).
    let response = service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceGroupRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|group| match (group.id, group.name) {
            (Some(id), Some(name)) => Some((id, name)),
            _ => None,
        })
        .collect())
}

// ---------------------------------------------------------------------------
// Row shaping (pure)
// ---------------------------------------------------------------------------

fn distinct_group_ids(announcements: &[Map<String, Value>]) -> Vec<String> {
    let mut ids: Vec<String> = Vec::new();
    for row in announcements {
        if let Some(Value::String(group_id)) = row.get("group_id")
            && !group_id.is_empty()
            && !ids.iter().any(|existing| existing == group_id)
        {
            ids.push(group_id.clone());
        }
    }
    ids
}

fn resolve_group(row: &Map<String, Value>, groups: &[(String, String)]) -> Value {
    match row.get("group_id") {
        Some(Value::String(group_id)) if !group_id.is_empty() => groups
            .iter()
            .find(|(id, _)| id == group_id)
            .map(|(id, name)| json!({ "id": id, "name": name }))
            .unwrap_or(Value::Null),
        _ => Value::Null,
    }
}

/// Mirrors `mapTopicAnnouncementRow`: keep every announcement column, then add
/// the serialized `attachments`, `contacts`, and `group` fields.
fn map_announcement_row(
    mut row: Map<String, Value>,
    attachments: Vec<Value>,
    contacts: Vec<Value>,
    group: Value,
) -> Value {
    // The legacy mapper destructures these keys out of the row before spreading.
    row.remove("attachments");
    row.remove("contacts");
    row.remove("group");

    row.insert("attachments".to_owned(), Value::Array(attachments));
    row.insert("contacts".to_owned(), Value::Array(contacts));
    row.insert("group".to_owned(), group);

    Value::Object(row)
}

/// Mirrors `serializeTopicAnnouncementContact`.
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

/// Mirrors `serializeTopicAnnouncementAttachment`.
fn serialize_attachment(attachment: &Map<String, Value>) -> Value {
    let file_name = attachment
        .get("file_name")
        .and_then(Value::as_str)
        .unwrap_or("");
    json!({
        "contentType": attachment.get("content_type").cloned().unwrap_or(Value::Null),
        "createdAt": attachment.get("created_at").cloned().unwrap_or(Value::Null),
        "fileName": normalize_attachment_file_name(file_name),
        "id": attachment.get("id").cloned().unwrap_or(Value::Null),
        "sizeBytes": size_bytes_to_number(attachment.get("size_bytes")),
        "storagePath": attachment.get("storage_path").cloned().unwrap_or(Value::Null),
        "storageProvider": attachment.get("storage_provider").cloned().unwrap_or(Value::Null),
    })
}

/// Mirrors `Number(attachment.size_bytes)`.
fn size_bytes_to_number(value: Option<&Value>) -> Value {
    match value {
        Some(Value::Number(number)) => Value::Number(number.clone()),
        Some(Value::String(text)) => {
            let trimmed = text.trim();
            if let Ok(parsed) = trimmed.parse::<i64>() {
                Value::Number(parsed.into())
            } else if let Ok(parsed) = trimmed.parse::<f64>() {
                Number::from_f64(parsed)
                    .map(Value::Number)
                    .unwrap_or(Value::Number(0.into()))
            } else {
                Value::Number(0.into())
            }
        }
        // `Number(null)` is 0; `Number(undefined)` is NaN, but JSON has no NaN.
        _ => Value::Number(0.into()),
    }
}

/// Mirrors `Math.max(1, Math.ceil((count ?? 0) / pageSize))`.
fn total_pages(count: i64, page_size: i64) -> i64 {
    if page_size <= 0 {
        return 1;
    }
    let pages = ((count as f64) / (page_size as f64)).ceil() as i64;
    pages.max(1)
}

/// JS truthiness for the RPC scalar result (`if (data)`).
fn js_truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(boolean) => *boolean,
        Value::Number(number) => number.as_f64().map(|n| n != 0.0).unwrap_or(false),
        Value::String(text) => !text.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

/// Mirrors `normalizeTopicAnnouncementAttachmentFileName`.
fn normalize_attachment_file_name(file_name: &str) -> String {
    let base_name = file_name.rsplit(['/', '\\']).next().unwrap_or("").trim();
    let without_prefix = strip_generated_uuid_prefix(base_name).trim();

    if !without_prefix.is_empty() {
        without_prefix.to_owned()
    } else if !base_name.is_empty() {
        base_name.to_owned()
    } else {
        "attachment".to_owned()
    }
}

/// Strips a leading `<uuid>-` prefix (v1-5 UUID followed by `-` and >=1 char).
fn strip_generated_uuid_prefix(base: &str) -> &str {
    let bytes = base.as_bytes();
    // Need 36 (uuid) + 1 (hyphen) + at least 1 trailing char.
    if bytes.len() < 38 || bytes[36] != b'-' {
        return base;
    }
    if !is_generated_uuid(&bytes[..36]) {
        return base;
    }
    // bytes[0..37] are all validated ASCII, so 37 is a safe char boundary.
    &base[37..]
}

fn is_generated_uuid(bytes: &[u8]) -> bool {
    if bytes.len() != 36 {
        return false;
    }
    for (index, &byte) in bytes.iter().enumerate() {
        let valid = match index {
            8 | 13 | 18 | 23 => byte == b'-',
            // Version digit must be 1-5.
            14 => matches!(byte, b'1'..=b'5'),
            // Variant nibble must be 8, 9, a, or b (case-insensitive).
            19 => matches!(byte, b'8' | b'9' | b'a' | b'b' | b'A' | b'B'),
            _ => byte.is_ascii_hexdigit(),
        };
        if !valid {
            return false;
        }
    }
    true
}

fn parse_content_range_count(header: Option<&str>) -> Option<i64> {
    let total = header?.rsplit('/').next()?.trim();
    if total == "*" {
        return None;
    }
    total.parse::<i64>().ok()
}

// ---------------------------------------------------------------------------
// Access resolution helpers (file-local copies of the sibling templates module
// to keep this module self-contained).
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
// Workspace id normalization (mirrors normalizeWorkspaceId)
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
// Path + identifier helpers
// ---------------------------------------------------------------------------

fn topic_announcements_ws_id(path: &str) -> Option<&str> {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ws_id_extracted_from_exact_path() {
        assert_eq!(
            topic_announcements_ws_id("/api/v1/workspaces/abc/topic-announcements"),
            Some("abc")
        );
    }

    #[test]
    fn ws_id_rejects_unrelated_and_nested_paths() {
        assert_eq!(topic_announcements_ws_id("/api/v1/workspaces/abc"), None);
        assert_eq!(
            topic_announcements_ws_id("/api/v1/workspaces/abc/topic-announcements/templates"),
            None
        );
        assert_eq!(
            topic_announcements_ws_id("/api/v1/workspaces//topic-announcements"),
            None
        );
        assert_eq!(
            topic_announcements_ws_id("/api/v2/workspaces/abc/topic-announcements"),
            None
        );
    }

    #[test]
    fn parse_list_query_defaults() {
        let query = parse_list_query(Some(
            "https://x.test/api/v1/workspaces/abc/topic-announcements",
        ))
        .unwrap();
        assert_eq!(
            query,
            ListQuery {
                contact_id: None,
                page: 1,
                page_size: 20,
                q: String::new(),
                status: "active".to_owned(),
            }
        );
        assert_eq!(query.offset(), 0);
    }

    #[test]
    fn parse_list_query_reads_all_fields() {
        let url = "https://x.test/p?page=3&pageSize=10&q=%20hello%20&status=sent&contactId=11111111-1111-4111-8111-111111111111";
        let query = parse_list_query(Some(url)).unwrap();
        assert_eq!(query.page, 3);
        assert_eq!(query.page_size, 10);
        assert_eq!(query.q, "hello");
        assert_eq!(query.status, "sent");
        assert_eq!(
            query.contact_id.as_deref(),
            Some("11111111-1111-4111-8111-111111111111")
        );
        assert_eq!(query.offset(), 20);
    }

    #[test]
    fn parse_list_query_rejects_invalid_inputs() {
        assert!(parse_list_query(Some("https://x.test/p?status=bogus")).is_err());
        assert!(parse_list_query(Some("https://x.test/p?page=0")).is_err());
        assert!(parse_list_query(Some("https://x.test/p?page=abc")).is_err());
        assert!(parse_list_query(Some("https://x.test/p?page=2.5")).is_err());
        assert!(parse_list_query(Some("https://x.test/p?pageSize=101")).is_err());
        assert!(parse_list_query(Some("https://x.test/p?contactId=not-a-uuid")).is_err());
        assert!(parse_list_query(Some("https://x.test/p?contactId=")).is_err());
        // Empty page value coerces to 0 -> below min(1).
        assert!(parse_list_query(Some("https://x.test/p?page=")).is_err());
    }

    #[test]
    fn parse_list_query_last_value_wins() {
        let query = parse_list_query(Some("https://x.test/p?status=draft&status=all")).unwrap();
        assert_eq!(query.status, "all");
    }

    #[test]
    fn status_filter_branches_match_legacy() {
        assert_eq!(
            status_filter("active"),
            Some(("status", "neq.cancelled".to_owned()))
        );
        assert_eq!(status_filter("all"), None);
        assert_eq!(
            status_filter("sent"),
            Some(("status", "eq.sent".to_owned()))
        );
    }

    #[test]
    fn content_range_count_parsing() {
        assert_eq!(parse_content_range_count(Some("0-19/142")), Some(142));
        assert_eq!(parse_content_range_count(Some("*/0")), Some(0));
        assert_eq!(parse_content_range_count(Some("0-9/*")), None);
        assert_eq!(parse_content_range_count(None), None);
    }

    #[test]
    fn total_pages_matches_ceil_with_min_one() {
        assert_eq!(total_pages(0, 20), 1);
        assert_eq!(total_pages(20, 20), 1);
        assert_eq!(total_pages(21, 20), 2);
        assert_eq!(total_pages(142, 20), 8);
    }

    #[test]
    fn file_name_normalization_strips_generated_prefix() {
        assert_eq!(
            normalize_attachment_file_name("11111111-1111-4111-8111-111111111111-report.pdf"),
            "report.pdf"
        );
        // Keeps a non-generated name untouched, and strips path segments.
        assert_eq!(
            normalize_attachment_file_name("folder/sub\\photo.png"),
            "photo.png"
        );
        // Not a valid UUID prefix -> unchanged base name.
        assert_eq!(
            normalize_attachment_file_name("not-a-uuid-file.txt"),
            "not-a-uuid-file.txt"
        );
        // Empty -> fallback.
        assert_eq!(normalize_attachment_file_name(""), "attachment");
    }

    #[test]
    fn size_bytes_number_conversion() {
        assert_eq!(size_bytes_to_number(Some(&json!(1024))), json!(1024));
        assert_eq!(size_bytes_to_number(Some(&json!("2048"))), json!(2048));
        assert_eq!(size_bytes_to_number(Some(&Value::Null)), json!(0));
        assert_eq!(size_bytes_to_number(None), json!(0));
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
    fn map_announcement_row_shapes_response_element() {
        let mut row = Map::new();
        row.insert("id".to_owned(), json!("a1"));
        row.insert("title".to_owned(), json!("Hi"));
        // Stale embedded keys should be overwritten.
        row.insert("group".to_owned(), json!("stale"));

        let mapped = map_announcement_row(
            row,
            vec![json!({ "id": "att1" })],
            vec![json!({ "id": "c1" })],
            json!({ "id": "g1", "name": "Group" }),
        );

        assert_eq!(mapped["id"], json!("a1"));
        assert_eq!(mapped["title"], json!("Hi"));
        assert_eq!(mapped["attachments"], json!([{ "id": "att1" }]));
        assert_eq!(mapped["contacts"], json!([{ "id": "c1" }]));
        assert_eq!(mapped["group"], json!({ "id": "g1", "name": "Group" }));
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
    }

    #[test]
    fn serialize_attachment_renames_and_normalizes() {
        let mut attachment = Map::new();
        attachment.insert("id".to_owned(), json!("att1"));
        attachment.insert("content_type".to_owned(), json!("application/pdf"));
        attachment.insert("created_at".to_owned(), json!("2026-01-01T00:00:00Z"));
        attachment.insert(
            "file_name".to_owned(),
            json!("11111111-1111-4111-8111-111111111111-report.pdf"),
        );
        attachment.insert("size_bytes".to_owned(), json!("4096"));
        attachment.insert("storage_path".to_owned(), json!("topic/x"));
        attachment.insert("storage_provider".to_owned(), json!("r2"));

        let serialized = serialize_attachment(&attachment);
        assert_eq!(serialized["contentType"], json!("application/pdf"));
        assert_eq!(serialized["fileName"], json!("report.pdf"));
        assert_eq!(serialized["sizeBytes"], json!(4096));
        assert_eq!(serialized["storageProvider"], json!("r2"));
    }

    #[test]
    fn distinct_group_ids_dedupes() {
        let mut a = Map::new();
        a.insert("group_id".to_owned(), json!("g1"));
        let mut b = Map::new();
        b.insert("group_id".to_owned(), json!("g1"));
        let mut c = Map::new();
        c.insert("group_id".to_owned(), json!("g2"));
        let mut d = Map::new();
        d.insert("group_id".to_owned(), Value::Null);

        assert_eq!(
            distinct_group_ids(&[a, b, c, d]),
            vec!["g1".to_owned(), "g2".to_owned()]
        );
    }

    #[test]
    fn resolve_group_maps_or_nulls() {
        let groups = vec![("g1".to_owned(), "Group One".to_owned())];
        let mut row = Map::new();
        row.insert("group_id".to_owned(), json!("g1"));
        assert_eq!(
            resolve_group(&row, &groups),
            json!({ "id": "g1", "name": "Group One" })
        );

        let mut missing = Map::new();
        missing.insert("group_id".to_owned(), json!("g9"));
        assert_eq!(resolve_group(&missing, &groups), Value::Null);

        assert_eq!(resolve_group(&Map::new(), &groups), Value::Null);
    }
}
