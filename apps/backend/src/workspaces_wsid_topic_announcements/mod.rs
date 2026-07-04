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

pub(crate) const PATH_PREFIX: &str = "/api/v1/workspaces/";
pub(crate) const PATH_SUFFIX: &str = "/topic-announcements";

pub(crate) const PRIVATE_SCHEMA: &str = "private";
pub(crate) const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
pub(crate) const PERSONAL_WORKSPACE_SLUG: &str = "personal";
pub(crate) const INTERNAL_WORKSPACE_SLUG: &str = "internal";

pub(crate) const TOPIC_ANNOUNCEMENTS_SECRET: &str = "ENABLE_TOPIC_ANNOUNCEMENTS";
pub(crate) const MANAGE_USERS_PERMISSION: &str = "manage_users";
pub(crate) const LINKED_VERIFIED_RPC: &str = "topic_announcement_contact_has_linked_verified_email";

pub(crate) const NOT_FOUND_MESSAGE: &str = "Not found";
pub(crate) const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
pub(crate) const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient permissions";
pub(crate) const INTERNAL_ERROR_MESSAGE: &str = "Internal Server Error";
pub(crate) const INVALID_QUERY_MESSAGE: &str = "Invalid query";

pub(crate) const ALLOWED_STATUSES: &[&str] = &[
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

mod access;
mod db;
mod normalization;
mod outbound;
mod path;
mod query;
mod shaping;
#[cfg(test)]
mod tests;
mod types;

use access::*;
use db::*;
use normalization::*;
use outbound::*;
use path::*;
use query::*;
use shaping::*;
use types::*;

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
