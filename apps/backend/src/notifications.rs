//! Handler for `GET /api/v1/notifications`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/notifications/route.ts` (GET only).
//!
//! # Auth model
//!
//! The legacy route uses `withSessionAuth` with
//! `allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH`, which means both
//! Supabase session (access-token) callers and app-session callers (CLI /
//! mobile) are accepted.  App-session callers get service-role data access;
//! Supabase-session callers pass their own token (RLS active).
//!
//! # Behavior gaps vs. legacy
//!
//! - **Cache-Control**: the legacy route sets `maxAge: 15, swr: 15`
//!   (`s-maxage=15, stale-while-revalidate=15`).  This handler always emits
//!   `Cache-Control: no-store` because the Rust crate does not expose a
//!   `max-age` response builder and all sibling notification handlers use
//!   `no_store_response`.
//! - **PATCH**: not migrated here; `None` is returned for every non-GET
//!   method so the worker falls through to the still-live Next.js route.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const NOTIFICATIONS_PATH: &str = "/api/v1/notifications";
const NOTIFICATIONS_TABLE: &str = "notifications";
const WORKSPACE_MEMBERS_TABLE: &str = "workspace_members";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INTERNAL_ERROR_MESSAGE: &str = "Internal server error";
const FETCH_ERROR_MESSAGE: &str = "Failed to fetch notifications";

/// Default page size matching the legacy `limit` default.
const DEFAULT_LIMIT: u64 = 20;

/// Auth context for the caller, mirroring `withSessionAuth` with
/// `allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH`.
enum CallerAuth {
    AppSession,
    AccessToken(String),
}

#[derive(Deserialize)]
struct WorkspaceMemberRow {
    ws_id: Option<String>,
}

/// Parsed and validated query parameters, mirroring the legacy `querySchema`.
struct NotificationQuery {
    ws_id: Option<String>,
    scope: Option<String>,
    limit: u64,
    offset: u64,
    unread_only: bool,
    read_only: bool,
    notification_type: Option<String>,
    priority: Option<String>,
}

pub(crate) async fn handle_notifications_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    if request.path != NOTIFICATIONS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => notifications_response(config, request, outbound).await,
        // PATCH and all other methods: fall through to the Next.js route.
        _ => return None,
    })
}

async fn notifications_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // ── 1. Authenticate the caller ──────────────────────────────────────────
    let (user_id, user_email, caller_auth) = match resolve_caller(config, request, outbound).await {
        Some(identity) => identity,
        None => return error_response(401, UNAUTHORIZED_MESSAGE),
    };

    // ── 2. Parse query parameters ───────────────────────────────────────────
    let query = match parse_query(request.url) {
        Ok(q) => q,
        Err(()) => {
            return no_store_response(json_response(
                400,
                json!({ "error": "Invalid query parameters" }),
            ));
        }
    };

    // ── 3. Resolve workspace memberships for the access filter ──────────────
    let workspace_ids =
        match fetch_workspace_ids(contact_data, outbound, &user_id, &caller_auth).await {
            Ok(ids) => ids,
            Err(()) => return error_response(500, INTERNAL_ERROR_MESSAGE),
        };

    // ── 4. Build the PostgREST `or` access filter ───────────────────────────
    let access_filter =
        build_notification_access_filter(&user_id, user_email.as_deref(), &workspace_ids);

    // ── 5. Fetch notifications with count ───────────────────────────────────
    match fetch_notifications(contact_data, outbound, &caller_auth, &access_filter, &query).await {
        Ok((notifications, count)) => {
            let transformed: Vec<Value> = notifications
                .into_iter()
                .map(transform_notification)
                .collect();

            no_store_response(json_response(
                200,
                json!({
                    "notifications": transformed,
                    "count": count,
                    "limit": query.limit,
                    "offset": query.offset,
                }),
            ))
        }
        Err(()) => error_response(500, FETCH_ERROR_MESSAGE),
    }
}

// ── Auth helpers ─────────────────────────────────────────────────────────────

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

// ── Query parsing ─────────────────────────────────────────────────────────────

/// Mirrors the legacy `querySchema`: validates types, applies defaults.
/// Returns `Err(())` for any field that fails validation.
fn parse_query(request_url: Option<&str>) -> Result<NotificationQuery, ()> {
    let url_parsed = request_url.and_then(|u| url::Url::parse(u).ok());

    let param = |key: &str| -> Option<String> {
        let url = url_parsed.as_ref()?;
        url.query_pairs()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.into_owned())
    };

    let non_blank = |key: &str| -> Option<String> { param(key).filter(|v| !v.is_empty()) };

    // wsId: optional GUID
    let ws_id = match non_blank("wsId") {
        None => None,
        Some(v) if is_uuid_literal(&v) => Some(v),
        Some(_) => return Err(()),
    };

    // scope: optional enum
    let scope = match non_blank("scope") {
        None => None,
        Some(v) if matches!(v.as_str(), "user" | "workspace" | "system") => Some(v),
        Some(_) => return Err(()),
    };

    // limit: optional positive integer, defaults to 20
    let limit = match non_blank("limit") {
        None => DEFAULT_LIMIT,
        Some(v) => v.parse::<u64>().map_err(|_| ())?,
    };

    // offset: optional non-negative integer, defaults to 0
    let offset = match non_blank("offset") {
        None => 0u64,
        Some(v) => v.parse::<u64>().map_err(|_| ())?,
    };

    // unreadOnly / readOnly: "true" == true
    let unread_only = param("unreadOnly").as_deref() == Some("true");
    let read_only = param("readOnly").as_deref() == Some("true");

    // type: optional notification-type enum
    let notification_type = match non_blank("type") {
        None => None,
        Some(v) if is_valid_notification_type(&v) => Some(v),
        Some(_) => return Err(()),
    };

    // priority: optional enum
    let priority = match non_blank("priority") {
        None => None,
        Some(v) if matches!(v.as_str(), "low" | "medium" | "high" | "urgent") => Some(v),
        Some(_) => return Err(()),
    };

    Ok(NotificationQuery {
        ws_id,
        scope,
        limit,
        offset,
        unread_only,
        read_only,
        notification_type,
        priority,
    })
}

fn is_valid_notification_type(v: &str) -> bool {
    matches!(
        v,
        "task_assigned"
            | "task_updated"
            | "task_completed"
            | "task_reopened"
            | "task_priority_changed"
            | "task_due_date_changed"
            | "task_start_date_changed"
            | "task_estimation_changed"
            | "task_moved"
            | "task_mention"
            | "task_title_changed"
            | "task_description_changed"
            | "task_label_added"
            | "task_label_removed"
            | "task_project_linked"
            | "task_project_unlinked"
            | "task_assignee_removed"
            | "deadline_reminder"
            | "workspace_invite"
            | "system_announcement"
            | "account_update"
            | "security_alert"
            | "report_approved"
            | "report_rejected"
            | "post_approved"
            | "post_rejected"
            | "time_tracking_request_submitted"
            | "time_tracking_request_resubmitted"
            | "time_tracking_request_approved"
            | "time_tracking_request_rejected"
            | "time_tracking_request_needs_info"
    )
}

// ── Data access ───────────────────────────────────────────────────────────────

async fn fetch_workspace_ids(
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
        .json::<Vec<WorkspaceMemberRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.ws_id)
        .filter(|id| !id.is_empty())
        .collect())
}

async fn fetch_notifications(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    _caller_auth: &CallerAuth,
    access_filter: &str,
    query: &NotificationQuery,
) -> Result<(Vec<Value>, i64), ()> {
    // Build PostgREST query params mirroring the legacy supabase-js query.
    let mut params: Vec<(&str, String)> = vec![
        (
            "select",
            "*,workspace:workspaces(name),actor:users!notifications_created_by_fkey(id,display_name,avatar_url)".to_owned(),
        ),
        ("or", access_filter.to_owned()),
        ("order", "created_at.desc,id.desc".to_owned()),
    ];

    if let Some(ws_id) = &query.ws_id {
        params.push(("ws_id", format!("eq.{ws_id}")));
    }

    if let Some(scope) = &query.scope {
        params.push(("scope", format!("eq.{scope}")));
    }

    if query.unread_only {
        params.push(("read_at", "is.null".to_owned()));
    } else if query.read_only {
        params.push(("read_at", "not.is.null".to_owned()));
    }

    if let Some(notification_type) = &query.notification_type {
        params.push(("type", format!("eq.{notification_type}")));
    }

    if let Some(priority) = &query.priority {
        params.push(("priority", format!("eq.{priority}")));
    }

    let Some(url) = contact_data.rest_url(NOTIFICATIONS_TABLE, &params) else {
        return Err(());
    };

    // Range header: inclusive 0-based indices, mirroring `.range(offset, offset + limit - 1)`.
    let end = query.offset.saturating_add(query.limit).saturating_sub(1);
    let range_value = format!("{}-{}", query.offset, end);

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    // App-session callers use service-role (admin) access; Supabase session
    // callers use their own access token (RLS). The legacy always uses admin
    // via `createAdminClient`, so we always use service-role here regardless.
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key)
                .with_header("Prefer", "count=exact")
                .with_header("Range-Unit", "items")
                .with_header("Range", &range_value),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let count = count_from_content_range(&response).unwrap_or(0);
    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;

    Ok((rows, count))
}

// ── Response transformation ───────────────────────────────────────────────────

/// Mirrors the `transformedNotifications` map in the legacy route:
///
/// - For `workspace_invite` notifications, resolves the canonical
///   `workspace_id` from `data.workspace_id`, `entity_id`, or `ws_id`.
/// - Merges `workspace.name` (or falling back to `data.workspace_name`) into
///   `data.workspace_name`.
/// - Replaces the joined `actor` object with the simplified `{id, display_name,
///   avatar_url}` shape (or `null`).
/// - Removes the `workspace` join key from the top-level object.
fn transform_notification(mut n: Value) -> Value {
    let workspace_name = n
        .get("workspace")
        .and_then(|w| w.get("name"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_owned());

    // For workspace_invite, find the canonical workspace_id from the first
    // non-empty candidate: data.workspace_id -> entity_id -> ws_id.
    let notification_type = n.get("type").and_then(|t| t.as_str()).map(|s| s.to_owned());

    let workspace_invite_ws_id = if notification_type.as_deref() == Some("workspace_invite") {
        let from_data = n
            .get("data")
            .and_then(|d| d.get("workspace_id"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_owned());
        let from_entity = n
            .get("entity_id")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_owned());
        let from_ws = n
            .get("ws_id")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_owned());
        from_data.or(from_entity).or(from_ws)
    } else {
        None
    };

    // Mutate the `data` sub-object in place.
    if let Some(data_obj) = n.get_mut("data").and_then(|d| d.as_object_mut()) {
        // workspace_name: joined workspace name takes priority (|| semantics).
        let existing_ws_name = data_obj
            .get("workspace_name")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_owned());

        let resolved_ws_name = workspace_name.clone().or(existing_ws_name);
        match resolved_ws_name {
            Some(name) => {
                data_obj.insert("workspace_name".to_owned(), Value::String(name));
            }
            None => {
                data_obj.insert("workspace_name".to_owned(), Value::Null);
            }
        }

        if let Some(ws_id) = workspace_invite_ws_id {
            data_obj.insert("workspace_id".to_owned(), Value::String(ws_id));
        }
    } else if n.get("data").is_none() {
        // If the `data` field is absent entirely, create it with workspace_name.
        let ws_name_value = match workspace_name {
            Some(name) => Value::String(name),
            None => Value::Null,
        };
        if let Some(obj) = n.as_object_mut() {
            let mut data_map = serde_json::Map::new();
            data_map.insert("workspace_name".to_owned(), ws_name_value);
            obj.insert("data".to_owned(), Value::Object(data_map));
        }
    }

    // Simplify the actor field: keep only id, display_name, avatar_url.
    let actor_simplified = n.get("actor").map(|a| {
        if a.is_null() {
            Value::Null
        } else {
            let id = a.get("id").cloned().unwrap_or(Value::Null);
            let display_name = a.get("display_name").cloned().unwrap_or(Value::Null);
            let avatar_url = a.get("avatar_url").cloned().unwrap_or(Value::Null);
            json!({
                "id": id,
                "display_name": display_name,
                "avatar_url": avatar_url,
            })
        }
    });

    if let Some(obj) = n.as_object_mut() {
        // Set actor (or null if absent).
        match actor_simplified {
            Some(a) => {
                obj.insert("actor".to_owned(), a);
            }
            None => {
                obj.insert("actor".to_owned(), Value::Null);
            }
        }
        // Remove the joined workspace object.
        obj.remove("workspace");
    }

    n
}

// ── Shared HTTP helper ────────────────────────────────────────────────────────

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
        CallerAuth::AccessToken(token) => token.as_str(),
    };
    let authorization = format!("Bearer {bearer}");

    let mut req = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if let Some(p) = prefer {
        req = req.with_header("Prefer", p);
    }

    outbound.send(req).await.map_err(|_| ())
}

fn count_from_content_range(response: &OutboundResponse) -> Option<i64> {
    let header = response.header("content-range")?;
    let (_, total) = header.rsplit_once('/')?;
    total.parse::<i64>().ok()
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/// Mirrors `buildNotificationAccessFilter` from `access.ts`.
///
/// Returns a PostgREST `or` expression already wrapped in the outer
/// parentheses that PostgREST expects for the `or` query parameter.
fn build_notification_access_filter(
    user_id: &str,
    user_email: Option<&str>,
    workspace_ids: &[String],
) -> String {
    let mut branches: Vec<String> = Vec::with_capacity(3);

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
        && value.chars().enumerate().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        })
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── Path guard ────────────────────────────────────────────────────────────

    #[test]
    fn exact_path_matches() {
        // The handler must match this exact string.
        assert_eq!(NOTIFICATIONS_PATH, "/api/v1/notifications");
    }

    // ── is_uuid_literal ───────────────────────────────────────────────────────

    #[test]
    fn valid_uuid_accepted() {
        assert!(is_uuid_literal("550e8400-e29b-41d4-a716-446655440000"));
    }

    #[test]
    fn short_string_rejected() {
        assert!(!is_uuid_literal("not-a-uuid"));
    }

    #[test]
    fn uuid_with_wrong_separator_rejected() {
        assert!(!is_uuid_literal("550e8400_e29b_41d4_a716_446655440000"));
    }

    // ── parse_query ───────────────────────────────────────────────────────────

    #[test]
    fn parse_query_defaults() {
        let q = parse_query(Some("https://example.com/api/v1/notifications")).unwrap();
        assert_eq!(q.limit, DEFAULT_LIMIT);
        assert_eq!(q.offset, 0);
        assert!(!q.unread_only);
        assert!(!q.read_only);
        assert!(q.ws_id.is_none());
        assert!(q.scope.is_none());
        assert!(q.notification_type.is_none());
        assert!(q.priority.is_none());
    }

    #[test]
    fn parse_query_valid_params() {
        let url = "https://example.com/api/v1/notifications\
            ?wsId=550e8400-e29b-41d4-a716-446655440000\
            &scope=user\
            &limit=10\
            &offset=5\
            &unreadOnly=true\
            &type=task_assigned\
            &priority=high";
        let q = parse_query(Some(url)).unwrap();
        assert_eq!(
            q.ws_id.as_deref(),
            Some("550e8400-e29b-41d4-a716-446655440000")
        );
        assert_eq!(q.scope.as_deref(), Some("user"));
        assert_eq!(q.limit, 10);
        assert_eq!(q.offset, 5);
        assert!(q.unread_only);
        assert_eq!(q.notification_type.as_deref(), Some("task_assigned"));
        assert_eq!(q.priority.as_deref(), Some("high"));
    }

    #[test]
    fn parse_query_invalid_scope_returns_error() {
        let url = "https://example.com/api/v1/notifications?scope=invalid";
        assert!(parse_query(Some(url)).is_err());
    }

    #[test]
    fn parse_query_invalid_ws_id_returns_error() {
        let url = "https://example.com/api/v1/notifications?wsId=not-a-uuid";
        assert!(parse_query(Some(url)).is_err());
    }

    #[test]
    fn parse_query_invalid_type_returns_error() {
        let url = "https://example.com/api/v1/notifications?type=unknown_type";
        assert!(parse_query(Some(url)).is_err());
    }

    #[test]
    fn parse_query_invalid_priority_returns_error() {
        let url = "https://example.com/api/v1/notifications?priority=extreme";
        assert!(parse_query(Some(url)).is_err());
    }

    // ── build_notification_access_filter ──────────────────────────────────────

    #[test]
    fn filter_no_email_no_workspaces() {
        let filter = build_notification_access_filter("user-1", None, &[]);
        assert!(filter.starts_with('('));
        assert!(filter.ends_with(')'));
        assert!(filter.contains("user_id.eq.user-1"));
        assert!(filter.contains("ws_id.is.null"));
    }

    #[test]
    fn filter_with_email_and_workspaces() {
        let ws_ids = vec!["ws-1".to_owned(), "ws-2".to_owned()];
        let filter = build_notification_access_filter("user-1", Some("user@example.com"), &ws_ids);
        assert!(filter.contains("email.eq.\"user@example.com\""));
        assert!(filter.contains("ws_id.in.(ws-1,ws-2)"));
    }

    #[test]
    fn filter_email_quoting() {
        let filter =
            build_notification_access_filter("user-1", Some("test\"user@example.com"), &[]);
        // Double-quote in email should be escaped.
        assert!(filter.contains("\\\""));
    }

    // ── transform_notification ────────────────────────────────────────────────

    #[test]
    fn transform_copies_workspace_name_into_data() {
        let n = json!({
            "id": "n1",
            "type": "task_assigned",
            "data": { "foo": "bar" },
            "workspace": { "name": "My Workspace" },
            "actor": null,
        });
        let result = transform_notification(n);
        assert_eq!(
            result["data"]["workspace_name"].as_str(),
            Some("My Workspace")
        );
        assert!(result.get("workspace").is_none());
    }

    #[test]
    fn transform_workspace_invite_resolves_workspace_id() {
        // entity_id used when data.workspace_id absent.
        let n = json!({
            "id": "n2",
            "type": "workspace_invite",
            "data": {},
            "entity_id": "entity-ws-id",
            "ws_id": "top-ws-id",
            "workspace": null,
            "actor": null,
        });
        let result = transform_notification(n);
        assert_eq!(
            result["data"]["workspace_id"].as_str(),
            Some("entity-ws-id")
        );
    }

    #[test]
    fn transform_workspace_invite_prefers_data_workspace_id() {
        let n = json!({
            "id": "n3",
            "type": "workspace_invite",
            "data": { "workspace_id": "data-ws-id" },
            "entity_id": "entity-ws-id",
            "ws_id": "top-ws-id",
            "workspace": null,
            "actor": null,
        });
        let result = transform_notification(n);
        assert_eq!(result["data"]["workspace_id"].as_str(), Some("data-ws-id"));
    }

    #[test]
    fn transform_actor_simplified() {
        let n = json!({
            "id": "n4",
            "type": "task_assigned",
            "data": {},
            "workspace": null,
            "actor": {
                "id": "actor-id",
                "display_name": "Alice",
                "avatar_url": "https://example.com/avatar.png",
                "extra_field": "should_be_removed",
            },
        });
        let result = transform_notification(n);
        assert_eq!(result["actor"]["id"].as_str(), Some("actor-id"));
        assert_eq!(result["actor"]["display_name"].as_str(), Some("Alice"));
        assert_eq!(
            result["actor"]["avatar_url"].as_str(),
            Some("https://example.com/avatar.png")
        );
        // extra_field is not in the simplified actor.
        assert!(result["actor"].get("extra_field").is_none());
    }

    // ── quote_postgrest_string ────────────────────────────────────────────────

    #[test]
    fn quote_wraps_in_double_quotes() {
        assert_eq!(quote_postgrest_string("hello"), "\"hello\"");
    }

    #[test]
    fn quote_escapes_backslash() {
        assert_eq!(quote_postgrest_string("a\\b"), "\"a\\\\b\"");
    }

    #[test]
    fn quote_escapes_double_quote() {
        assert_eq!(quote_postgrest_string("a\"b"), "\"a\\\"b\"");
    }

    // ── normalize_email ───────────────────────────────────────────────────────

    #[test]
    fn normalize_email_lowercases_and_trims() {
        assert_eq!(
            normalize_email("  User@EXAMPLE.COM  ".to_owned()),
            Some("user@example.com".to_owned())
        );
    }

    #[test]
    fn normalize_email_empty_returns_none() {
        assert_eq!(normalize_email("   ".to_owned()), None);
    }
}
