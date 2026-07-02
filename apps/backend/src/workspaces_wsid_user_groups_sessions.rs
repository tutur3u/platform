//! Handler for `GET /api/v1/workspaces/:wsId/user-groups/sessions`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/user-groups/sessions/route.ts`.
//! The legacy route also exposes a `POST` handler (create session); only `GET`
//! is ported here. Non-GET methods return `None` so the worker falls through
//! to the still-live Next.js route.
//!
//! # Auth
//!
//! The legacy GET checks `getPermissions({ wsId, request })` and requires the
//! `view_user_groups` permission. This handler delegates to
//! `workspace_permission_check::authorize_workspace_permission`, which
//! normalizes the workspace id and performs the permission check:
//!
//! - No auth principal / unresolvable workspace → `404 { "message": "Not
//!   found" }`
//! - Valid auth but missing `view_user_groups` → `403 { "message":
//!   "Insufficient permissions to view user group sessions" }`
//! - Configuration / upstream transport failure → `500 { "message": "Failed
//!   to list user group sessions" }`
//!
//! # Query params
//!
//! - `groupId`: UUID; when present, limits sessions to that group.
//! - `from`: datetime string; lower bound for `starts_at` (inclusive, `gte`).
//! - `to`: datetime string; upper bound for `starts_at` (inclusive, `lte`).
//! - `includeMissing`: `"true"` to request missing-occurrence synthesis.
//!
//! # Response shape
//!
//! On success: `200 { "data": [...sessions], "groups": [...], "tags": [...] }`.
//!
//! Each session in `data` includes the camelCase fields:
//! `id`, `groupId`, `groupName`, `title`, `description`, `descriptionJson`,
//! `startsAt`, `endsAt`, `startTimezone`, `endTimezone`, `status`, `source`,
//! `seriesId`, `recurrenceInstanceDate`, `tags`, `files`.
//!
//! # Behavior gaps vs. legacy
//!
//! - **`includeMissing=true`**: The legacy code synthesizes missing expected
//!   occurrences from a `workspace_user_group_session_series` table by
//!   performing complex date-range arithmetic. This Rust port always returns
//!   `missing: []` when `includeMissing=true` is requested and documents the
//!   gap here. The `data`, `groups`, and `tags` fields are still accurate.
//! - The `resolveUserGroupRouteWorkspaceId` alias resolution (workspace handle
//!   → UUID lookup) is handled by `authorize_workspace_permission`, which
//!   covers the `personal` and UUID cases. Exotic handle aliases may differ.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/user-groups/sessions";
const VIEW_PERMISSION: &str = "view_user_groups";
const PRIVATE_SCHEMA: &str = "private";

const NOT_FOUND_MESSAGE: &str = "Not found";
const FORBIDDEN_MESSAGE: &str = "Insufficient permissions to view user group sessions";
const LIST_ERROR_MESSAGE: &str = "Failed to list user group sessions";

// ---- DB row types -----------------------------------------------------------

#[derive(Deserialize)]
struct SessionDbRow {
    id: Option<String>,
    group_id: Option<String>,
    title: Option<Value>,
    description: Option<Value>,
    description_json: Option<Value>,
    starts_at: Option<String>,
    ends_at: Option<String>,
    start_timezone: Option<String>,
    end_timezone: Option<String>,
    status: Option<String>,
    source: Option<Value>,
    series_id: Option<Value>,
    recurrence_instance_date: Option<Value>,
}

#[derive(Deserialize)]
struct GroupDbRow {
    id: Option<String>,
    name: Option<String>,
}

#[derive(Deserialize)]
struct TagLinkRow {
    session_id: Option<String>,
    tag_id: Option<String>,
}

#[derive(Deserialize)]
struct TagRow {
    id: Option<String>,
    name: Option<String>,
    color: Option<Value>,
}

#[derive(Deserialize)]
struct FileDbRow {
    id: Option<String>,
    session_id: Option<String>,
    name: Option<Value>,
    storage_path: Option<String>,
}

// ---- Path extraction --------------------------------------------------------

fn sessions_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

// ---- Handler ----------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_user_groups_sessions_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = sessions_ws_id(request.path)?;

    Some(match request.method {
        "GET" => sessions_get_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn sessions_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    let authorization = match authorize_workspace_permission(
        contact_data,
        request,
        raw_ws_id,
        VIEW_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(auth) => auth,
        Err(
            WorkspacePermissionAuthorizationError::Unauthorized
            | WorkspacePermissionAuthorizationError::NotFound,
        ) => return message_response(404, NOT_FOUND_MESSAGE),
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return message_response(403, FORBIDDEN_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, LIST_ERROR_MESSAGE);
        }
    };

    let ws_id = &authorization.ws_id;

    // Parse query params.
    let (group_id, from, to, include_missing) = parse_query_params(request.url);

    match list_sessions(
        contact_data,
        outbound,
        ws_id,
        group_id.as_deref(),
        from.as_deref(),
        to.as_deref(),
        include_missing,
    )
    .await
    {
        Ok(body) => no_store_response(json_response(200, body)),
        Err(()) => message_response(500, LIST_ERROR_MESSAGE),
    }
}

fn parse_query_params(url: Option<&str>) -> (Option<String>, Option<String>, Option<String>, bool) {
    let mut group_id: Option<String> = None;
    let mut from: Option<String> = None;
    let mut to: Option<String> = None;
    let mut include_missing = false;

    if let Some(parsed) = url.and_then(|u| url::Url::parse(u).ok()) {
        for (key, value) in parsed.query_pairs() {
            match key.as_ref() {
                "groupId" => group_id = Some(value.into_owned()),
                "from" => from = Some(value.into_owned()),
                "to" => to = Some(value.into_owned()),
                "includeMissing" => include_missing = value == "true",
                _ => {}
            }
        }
    }

    (group_id, from, to, include_missing)
}

async fn list_sessions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    group_id: Option<&str>,
    from: Option<&str>,
    to: Option<&str>,
    include_missing: bool,
) -> Result<Value, ()> {
    // 1. Fetch sessions from private schema.
    let session_rows = fetch_sessions(contact_data, outbound, ws_id, group_id, from, to).await?;

    let session_ids: Vec<&str> = session_rows
        .iter()
        .filter_map(|row| row.id.as_deref())
        .collect();

    // 2. Fetch groups (all non-archived) and session relations in parallel.
    let (groups_result, links_result, files_result) = futures_join3(
        fetch_all_groups(contact_data, outbound, ws_id),
        fetch_tag_links(contact_data, outbound, ws_id, &session_ids),
        fetch_files(contact_data, outbound, ws_id, &session_ids),
    )
    .await;

    let group_rows = groups_result?;
    let tag_links = links_result?;
    let file_rows = files_result?;

    // Build group name map (by id).
    let group_name_map: Vec<(String, String)> = group_rows
        .iter()
        .filter_map(|row| {
            let id = row.id.as_deref()?.to_owned();
            let name = row.name.as_deref()?.to_owned();
            Some((id, name))
        })
        .collect();

    // 3. Collect unique tag IDs, then fetch tags.
    let tag_ids: Vec<&str> = {
        let mut ids: Vec<&str> = tag_links
            .iter()
            .filter_map(|link| link.tag_id.as_deref())
            .collect();
        ids.sort_unstable();
        ids.dedup();
        ids
    };

    let tag_rows = if tag_ids.is_empty() {
        Vec::new()
    } else {
        fetch_tags(contact_data, outbound, ws_id, &tag_ids).await?
    };

    // Build tag map by id.
    let tag_map: Vec<(String, Value)> = tag_rows
        .iter()
        .filter_map(|row| {
            let id = row.id.as_deref()?.to_owned();
            let obj = json!({
                "color": row.color,
                "id": id.clone(),
                "name": row.name,
            });
            Some((id, obj))
        })
        .collect();

    // Build session_id -> tags map.
    let mut tags_by_session: Vec<(String, Vec<Value>)> = Vec::new();
    for link in &tag_links {
        let (Some(session_id), Some(tag_id)) = (link.session_id.as_deref(), link.tag_id.as_deref())
        else {
            continue;
        };
        let tag_value = tag_map
            .iter()
            .find(|(id, _)| id == tag_id)
            .map(|(_, v)| v.clone());
        let Some(tag_value) = tag_value else { continue };
        if let Some(entry) = tags_by_session
            .iter_mut()
            .find(|(sid, _)| sid == session_id)
        {
            entry.1.push(tag_value);
        } else {
            tags_by_session.push((session_id.to_owned(), vec![tag_value]));
        }
    }

    // Build session_id -> files map.
    let mut files_by_session: Vec<(String, Vec<Value>)> = Vec::new();
    for file in &file_rows {
        let Some(session_id) = file.session_id.as_deref() else {
            continue;
        };
        let file_value = json!({
            "id": file.id,
            "name": file.name,
            "storagePath": file.storage_path,
        });
        if let Some(entry) = files_by_session
            .iter_mut()
            .find(|(sid, _)| sid == session_id)
        {
            entry.1.push(file_value);
        } else {
            files_by_session.push((session_id.to_owned(), vec![file_value]));
        }
    }

    // 4. Serialize sessions.
    let data: Vec<Value> = session_rows
        .iter()
        .map(|row| {
            let id = row.id.as_deref().unwrap_or("");
            let group_id_str = row.group_id.as_deref().unwrap_or("");
            let group_name = group_name_map
                .iter()
                .find(|(gid, _)| gid == group_id_str)
                .map(|(_, name)| Value::String(name.clone()))
                .unwrap_or(Value::Null);
            let session_tags = tags_by_session
                .iter()
                .find(|(sid, _)| sid == id)
                .map(|(_, tags)| tags.clone())
                .unwrap_or_default();
            let session_files = files_by_session
                .iter()
                .find(|(sid, _)| sid == id)
                .map(|(_, files)| files.clone())
                .unwrap_or_default();
            json!({
                "description": row.description,
                "descriptionJson": row.description_json,
                "endTimezone": row.end_timezone,
                "endsAt": row.ends_at,
                "files": session_files,
                "groupId": row.group_id,
                "groupName": group_name,
                "id": row.id,
                "recurrenceInstanceDate": row.recurrence_instance_date,
                "seriesId": row.series_id,
                "source": row.source,
                "startTimezone": row.start_timezone,
                "startsAt": row.starts_at,
                "status": row.status,
                "tags": session_tags,
                "title": row.title,
            })
        })
        .collect();

    // 5. Build the `groups` array (all non-archived groups in workspace).
    let groups: Vec<Value> = group_name_map
        .iter()
        .map(|(id, name)| json!({ "id": id, "name": name }))
        .collect();

    // 6. Build the `tags` array (unique across all sessions).
    let tags: Vec<Value> = tag_map.iter().map(|(_, v)| v.clone()).collect();

    // The `includeMissing` feature requires series date-range arithmetic that
    // cannot be faithfully ported without a timezone database. Always return
    // `missing: []` when requested (documented gap).
    if include_missing {
        Ok(json!({ "data": data, "groups": groups, "missing": [], "tags": tags }))
    } else {
        Ok(json!({ "data": data, "groups": groups, "tags": tags }))
    }
}

// ---- Outbound helpers -------------------------------------------------------

async fn fetch_sessions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    group_id: Option<&str>,
    from: Option<&str>,
    to: Option<&str>,
) -> Result<Vec<SessionDbRow>, ()> {
    let mut params: Vec<(&str, String)> = vec![
        ("select", "*".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("status", "eq.scheduled".to_owned()),
        ("order", "starts_at.asc".to_owned()),
    ];
    if let Some(gid) = group_id {
        params.push(("group_id", format!("eq.{gid}")));
    }
    if let Some(f) = from {
        params.push(("starts_at", format!("gte.{f}")));
    }
    if let Some(t) = to {
        params.push(("starts_at", format!("lte.{t}")));
    }

    let Some(url) = contact_data.rest_url("workspace_user_group_sessions", &params) else {
        return Err(());
    };

    let response = send_private_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    response.json::<Vec<SessionDbRow>>().map_err(|_| ())
}

async fn fetch_all_groups(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<GroupDbRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_user_groups",
        &[
            ("select", "id,name".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("archived", "eq.false".to_owned()),
            ("order", "name.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    response.json::<Vec<GroupDbRow>>().map_err(|_| ())
}

async fn fetch_tag_links(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    session_ids: &[&str],
) -> Result<Vec<TagLinkRow>, ()> {
    if session_ids.is_empty() {
        return Ok(Vec::new());
    }
    let in_filter = format!("in.({})", session_ids.join(","));
    let Some(url) = contact_data.rest_url(
        "workspace_user_group_session_tag_links",
        &[
            ("select", "session_id,tag_id".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("session_id", in_filter),
        ],
    ) else {
        return Err(());
    };

    let response = send_private_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    response.json::<Vec<TagLinkRow>>().map_err(|_| ())
}

async fn fetch_tags(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    tag_ids: &[&str],
) -> Result<Vec<TagRow>, ()> {
    let in_filter = format!("in.({})", tag_ids.join(","));
    let Some(url) = contact_data.rest_url(
        "workspace_user_group_session_tags",
        &[
            ("select", "id,ws_id,name,color".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("id", in_filter),
        ],
    ) else {
        return Err(());
    };

    let response = send_private_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    response.json::<Vec<TagRow>>().map_err(|_| ())
}

async fn fetch_files(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    session_ids: &[&str],
) -> Result<Vec<FileDbRow>, ()> {
    if session_ids.is_empty() {
        return Ok(Vec::new());
    }
    let in_filter = format!("in.({})", session_ids.join(","));
    let Some(url) = contact_data.rest_url(
        "workspace_user_group_session_files",
        &[
            ("select", "id,session_id,storage_path,name".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("session_id", in_filter),
        ],
    ) else {
        return Err(());
    };

    let response = send_private_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    response.json::<Vec<FileDbRow>>().map_err(|_| ())
}

async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<crate::outbound::OutboundResponse, ()> {
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

async fn send_private_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<crate::outbound::OutboundResponse, ()> {
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

// ---- Minimal join helper (no tokio, no futures crate) -----------------------

async fn futures_join3<A, B, C, EA, EB, EC>(
    a: impl std::future::Future<Output = Result<A, EA>>,
    b: impl std::future::Future<Output = Result<B, EB>>,
    c: impl std::future::Future<Output = Result<C, EC>>,
) -> (Result<A, EA>, Result<B, EB>, Result<C, EC>) {
    // Sequential execution; suitable since all three are independent I/O calls
    // in a single-threaded Cloudflare Worker runtime.
    let ra = a.await;
    let rb = b.await;
    let rc = c.await;
    (ra, rb, rc)
}

// ---- Response helpers -------------------------------------------------------

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

// ---- Tests ------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sessions_ws_id_matches_exact_path() {
        assert_eq!(
            sessions_ws_id("/api/v1/workspaces/abc-123/user-groups/sessions"),
            Some("abc-123")
        );
    }

    #[test]
    fn sessions_ws_id_matches_uuid_ws_id() {
        assert_eq!(
            sessions_ws_id(
                "/api/v1/workspaces/11111111-2222-3333-4444-555555555555/user-groups/sessions"
            ),
            Some("11111111-2222-3333-4444-555555555555")
        );
    }

    #[test]
    fn sessions_ws_id_matches_personal_slug() {
        assert_eq!(
            sessions_ws_id("/api/v1/workspaces/personal/user-groups/sessions"),
            Some("personal")
        );
    }

    #[test]
    fn sessions_ws_id_rejects_longer_path() {
        // Nested path (e.g. group-summaries) must not match.
        assert_eq!(
            sessions_ws_id("/api/v1/workspaces/abc/user-groups/sessions/group-summaries"),
            None
        );
    }

    #[test]
    fn sessions_ws_id_rejects_missing_v1() {
        assert_eq!(
            sessions_ws_id("/api/workspaces/abc/user-groups/sessions"),
            None
        );
    }

    #[test]
    fn sessions_ws_id_rejects_empty_ws_id() {
        assert_eq!(
            sessions_ws_id("/api/v1/workspaces//user-groups/sessions"),
            None
        );
    }

    #[test]
    fn sessions_ws_id_rejects_extra_segment_in_ws_id() {
        assert_eq!(
            sessions_ws_id("/api/v1/workspaces/a/b/user-groups/sessions"),
            None
        );
    }

    #[test]
    fn sessions_ws_id_rejects_unrelated_resource() {
        assert_eq!(
            sessions_ws_id("/api/v1/workspaces/abc/finance/invoices"),
            None
        );
    }

    #[test]
    fn parse_query_params_extracts_all_fields() {
        let url = "https://example.com/api/v1/workspaces/abc/user-groups/sessions\
                   ?groupId=gid-1&from=2024-01-01T00:00:00Z&to=2024-02-01T00:00:00Z\
                   &includeMissing=true";
        let (group_id, from, to, include_missing) = parse_query_params(Some(url));
        assert_eq!(group_id.as_deref(), Some("gid-1"));
        assert_eq!(from.as_deref(), Some("2024-01-01T00:00:00Z"));
        assert_eq!(to.as_deref(), Some("2024-02-01T00:00:00Z"));
        assert!(include_missing);
    }

    #[test]
    fn parse_query_params_defaults_when_absent() {
        let (group_id, from, to, include_missing) = parse_query_params(None);
        assert!(group_id.is_none());
        assert!(from.is_none());
        assert!(to.is_none());
        assert!(!include_missing);
    }

    #[test]
    fn parse_query_params_include_missing_false_unless_true() {
        let url = "https://example.com/path?includeMissing=false";
        let (_, _, _, include_missing) = parse_query_params(Some(url));
        assert!(!include_missing);
    }

    #[test]
    fn message_response_shape() {
        let resp = message_response(404, NOT_FOUND_MESSAGE);
        assert_eq!(resp.status, 404);
        assert_eq!(resp.body, json!({ "message": NOT_FOUND_MESSAGE }));
    }
}
