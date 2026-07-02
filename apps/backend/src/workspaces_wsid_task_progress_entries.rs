//! Handler for `GET /api/v1/workspaces/:wsId/task-progress/entries`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/task-progress/entries/route.ts`
//! (and its shared `_utils.ts`/`_schemas.ts` helpers). Only the `GET` method is
//! migrated; `POST` (entry creation) falls through to the still-live Next.js
//! route by returning `None`.
//!
//! Auth model (legacy `resolveTaskProgressRouteAuth`): authenticate the Supabase
//! session user, normalize the workspace id (`personal` slug / handle / UUID /
//! `internal`), then require **workspace membership of type `MEMBER`** — there is
//! no specific workspace permission gate. This port reproduces that
//! membership-only check directly (token -> user -> `workspace_members` lookup),
//! mirroring the sibling `workspaces_wsid_task_progress_stats` handler.
//!
//! Legacy status codes preserved (mirror of `taskProgressErrorResponse`):
//!
//! - no authenticated user                  -> `401 { "error": "Unauthorized" }`
//! - member lookup transport/query failure  -> `500 { "error": "Failed to verify workspace membership" }`
//! - not a `MEMBER` of the workspace        -> `403 { "error": "Workspace access denied" }`
//! - task-progress schema missing           -> `200 { ok:false, code:"schema_unavailable", schemaAvailable:false, message:..., entries:[] }`
//! - any other read failure                 -> `500 { "error": "Failed to list task progress entries" }`
//! - success                                -> `200 { ok:true, schemaAvailable:true, entries:[...], count:N|null, page:N, pageSize:N }`
//!
//! BEHAVIOR NOTE: The legacy GET uses PostgREST `.range(from, to)` with an exact
//! count, which maps to `Prefer: count=exact` + `Range: items=from-to` request
//! headers. The count is extracted from the `Content-Range` response header.
//! This port reproduces that behaviour faithfully.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/task-progress/entries";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const SCHEMA_UNAVAILABLE_MESSAGE: &str =
    "Task progress is not available until the latest database migration is applied.";
const ENTRIES_FAILURE_MESSAGE: &str = "Failed to list task progress entries";

/// Columns returned for each entry row plus the embedded metric.
const ENTRY_SELECT: &str = concat!(
    "id,ws_id,metric_id,task_id,project_id,board_id,list_id,",
    "entry_date,value,mode,note,tags,source_type,source_id,",
    "created_by,created_at,updated_at,deleted_at,",
    "metric:task_progress_metrics(*)"
);

/// Default page size used when the caller omits the `pageSize` query param.
const DEFAULT_PAGE_SIZE: u64 = 50;
/// Maximum page size the API honours (mirrors the legacy `Math.min(..., 200)`).
const MAX_PAGE_SIZE: u64 = 200;

#[derive(Clone, Copy)]
enum MembershipError {
    Unauthorized,
    LookupFailed,
    AccessDenied,
}

#[derive(serde::Deserialize)]
struct IdRow {
    id: Option<String>,
}

#[derive(serde::Deserialize)]
struct MembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_task_progress_entries_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = entries_ws_id(request.path)?;

    Some(match request.method {
        "GET" => entries_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

fn entries_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

async fn entries_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        return error_response(500, "Failed to verify workspace membership");
    }

    let ws_id = match authorize_membership(contact_data, request, raw_ws_id, outbound).await {
        Ok(ws_id) => ws_id,
        Err(MembershipError::Unauthorized) => return error_response(401, "Unauthorized"),
        Err(MembershipError::LookupFailed) => {
            return error_response(500, "Failed to verify workspace membership");
        }
        Err(MembershipError::AccessDenied) => {
            return error_response(403, "Workspace access denied");
        }
    };

    // Parse pagination params (mirror of the legacy clamping logic).
    let page_size = parse_page_size(request.url);
    let page = parse_page(request.url);
    let range_from = (page - 1) * page_size;
    let range_to = range_from + page_size - 1;

    let url = entries_url(contact_data, &ws_id, request.url);
    if url.is_empty() {
        return error_response(500, ENTRIES_FAILURE_MESSAGE);
    }

    let range_header = format!("items={range_from}-{range_to}");

    let response = match service_get_with_range(contact_data, outbound, &url, &range_header).await {
        Ok(response) => response,
        Err(()) => return error_response(500, ENTRIES_FAILURE_MESSAGE),
    };

    if !is_success(response.status) {
        let body = response.json::<Value>().unwrap_or(Value::Null);
        return if is_schema_unavailable(&body) {
            schema_unavailable_response()
        } else {
            error_response(500, ENTRIES_FAILURE_MESSAGE)
        };
    }

    // Extract the count from the `Content-Range: items from-to/count` header.
    let count = parse_content_range_count(response.header("content-range"));

    let entries: Vec<Value> = match response.json() {
        Ok(rows) => rows,
        Err(_) => return error_response(500, ENTRIES_FAILURE_MESSAGE),
    };

    no_store_response(json_response(
        200,
        json!({
            "ok": true,
            "schemaAvailable": true,
            "entries": entries,
            "count": count,
            "page": page,
            "pageSize": page_size,
        }),
    ))
}

// ---------------------------------------------------------------------------
// Membership authorization (mirror of `resolveTaskProgressRouteAuth`)
// ---------------------------------------------------------------------------

async fn authorize_membership(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<String, MembershipError> {
    let access_token =
        supabase_auth::request_access_token(request).ok_or(MembershipError::Unauthorized)?;
    let user = supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
        .await
        .ok_or(MembershipError::Unauthorized)?;
    let user_id = user
        .id
        .filter(|id| !id.trim().is_empty())
        .ok_or(MembershipError::Unauthorized)?;

    let ws_id = normalize_ws_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
        .await
        .map_err(|_| MembershipError::LookupFailed)?;

    let url = contact_data
        .rest_url(
            "workspace_members",
            &[
                ("select", "type".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("user_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(MembershipError::LookupFailed)?;
    let response = caller_get(contact_data, outbound, &url, &access_token)
        .await
        .map_err(|_| MembershipError::LookupFailed)?;
    if !is_success(response.status) {
        return Err(MembershipError::LookupFailed);
    }

    let membership = response
        .json::<Vec<MembershipRow>>()
        .map_err(|_| MembershipError::LookupFailed)?
        .into_iter()
        .next()
        .ok_or(MembershipError::AccessDenied)?;

    if membership.membership_type.as_deref() == Some("MEMBER") {
        Ok(ws_id)
    } else {
        Err(MembershipError::AccessDenied)
    }
}

async fn normalize_ws_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let resolved = if raw_ws_id.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        raw_ws_id.to_owned()
    };

    if resolved == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_uuid_literal(&resolved) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_lookup_identifier(&handle) {
            return Ok(resolved);
        }
        if let Some(id) =
            workspace_id_by_handle(contact_data, outbound, &handle, Some(access_token)).await?
        {
            return Ok(id);
        }
        if let Some(id) = workspace_id_by_handle(contact_data, outbound, &handle, None).await? {
            return Ok(id);
        }
    }

    Ok(resolved)
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let url = contact_data
        .rest_url(
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
        )
        .ok_or(())?;
    let response = caller_get(contact_data, outbound, &url, access_token).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response
        .json::<Vec<IdRow>>()
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
    access_token: Option<&str>,
) -> Result<Option<String>, ()> {
    let url = contact_data
        .rest_url(
            "workspaces",
            &[
                ("select", "id".to_owned()),
                ("handle", format!("eq.{handle}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = match access_token {
        Some(token) => caller_get(contact_data, outbound, &url, token).await?,
        None => service_get(contact_data, outbound, &url).await?,
    };
    if !is_success(response.status) {
        return Ok(None);
    }
    Ok(response
        .json::<Vec<IdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

// ---------------------------------------------------------------------------
// Data fetch
// ---------------------------------------------------------------------------

/// Build the PostgREST URL for `task_progress_entries`, applying the same
/// filters as the legacy `buildEntryQuery` helper.
fn entries_url(
    contact_data: &contact::ContactDataConfig,
    ws_id: &str,
    request_url: Option<&str>,
) -> String {
    let mut params: Vec<(&str, String)> = vec![
        ("select", ENTRY_SELECT.to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("deleted_at", "is.null".to_owned()),
    ];

    for key in [
        "metric_id",
        "task_id",
        "project_id",
        "board_id",
        "list_id",
        "created_by",
    ] {
        if let Some(value) = query_param(request_url, key) {
            params.push((key, format!("eq.{value}")));
        }
    }
    if let Some(from) = query_param(request_url, "from") {
        params.push(("entry_date", format!("gte.{from}")));
    }
    if let Some(to) = query_param(request_url, "to") {
        params.push(("entry_date", format!("lte.{to}")));
    }

    // Mirror the legacy `.order('entry_date', { ascending: false })` +
    // `.order('created_at', { ascending: false })` chained orders.
    params.push(("order", "entry_date.desc,created_at.desc".to_owned()));

    contact_data
        .rest_url("task_progress_entries", &params)
        .unwrap_or_default()
}

/// Service-role GET with PostgREST range and exact-count headers.
async fn service_get_with_range(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    range_header: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Prefer", "count=exact")
                .with_header("Range-Unit", "items")
                .with_header("Range", range_header),
        )
        .await
        .map_err(|_| ())
}

async fn service_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    send_get(outbound, url, service_role_key, service_role_key).await
}

async fn caller_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    send_get(outbound, url, access_token, service_role_key).await
}

async fn send_get(
    outbound: &impl OutboundHttpClient,
    url: &str,
    bearer_token: &str,
    apikey: &str,
) -> Result<OutboundResponse, ()> {
    let authorization = format!("Bearer {bearer_token}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", apikey),
        )
        .await
        .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Pagination helpers
// ---------------------------------------------------------------------------

/// Mirror of `Math.min(Math.max(Number(pageSize ?? 50), 1), 200)`.
fn parse_page_size(request_url: Option<&str>) -> u64 {
    query_param(request_url, "pageSize")
        .and_then(|value| value.parse::<f64>().ok())
        .map(|value| {
            if value.is_finite() && value >= 1.0 {
                (value as u64).clamp(1, MAX_PAGE_SIZE)
            } else {
                DEFAULT_PAGE_SIZE
            }
        })
        .unwrap_or(DEFAULT_PAGE_SIZE)
}

/// Mirror of `Math.max(Number(page ?? 1), 1)`.
fn parse_page(request_url: Option<&str>) -> u64 {
    query_param(request_url, "page")
        .and_then(|value| value.parse::<f64>().ok())
        .map(|value| {
            if value.is_finite() && value >= 1.0 {
                (value as u64).max(1)
            } else {
                1
            }
        })
        .unwrap_or(1)
}

/// Parse the `Content-Range` response header to extract the total count.
///
/// PostgREST returns `Content-Range: items 0-49/100` (with `Prefer: count=exact`).
/// The legacy `.range(from, to)` call surfaces this as the `count` field in the
/// Supabase response object.
fn parse_content_range_count(header: Option<&str>) -> Option<i64> {
    // Header format: `items 0-49/100` or `items */100` or `0-49/100`
    let header = header?;
    let slash_pos = header.rfind('/')?;
    let count_str = header.get(slash_pos + 1..)?.trim();
    if count_str == "*" {
        return None;
    }
    count_str.parse::<i64>().ok()
}

// ---------------------------------------------------------------------------
// Schema-unavailable detection (mirror of `isTaskProgressSchemaUnavailableError`)
// ---------------------------------------------------------------------------

fn is_schema_unavailable(body: &Value) -> bool {
    let code = body.get("code").and_then(Value::as_str).unwrap_or("");
    let message = body.get("message").and_then(Value::as_str).unwrap_or("");
    let details = body.get("details").and_then(Value::as_str).unwrap_or("");
    let text = format!("{message} {details}").to_lowercase();
    let mentions = text.contains("task_progress_") || text.contains("task_leaderboard");
    let looks_missing = text.contains("schema cache")
        || text.contains("could not find")
        || text.contains("does not exist")
        || text.contains("column")
        || text.contains("relation");

    code == "42P01"
        || code == "42703"
        || code == "PGRST204"
        || code == "PGRST205"
        || (mentions && looks_missing)
}

// ---------------------------------------------------------------------------
// Misc helpers / responses
// ---------------------------------------------------------------------------

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

fn is_direct_lookup_identifier(value: &str) -> bool {
    let normalized = value.trim().to_lowercase();
    normalized == PERSONAL_WORKSPACE_SLUG
        || normalized == ROOT_WORKSPACE_ID
        || normalized == INTERNAL_WORKSPACE_SLUG
        || is_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

fn query_param(request_url: Option<&str>, key: &str) -> Option<String> {
    url::Url::parse(request_url?)
        .ok()?
        .query_pairs()
        .find_map(|(name, value)| (name == key && !value.is_empty()).then(|| value.into_owned()))
}

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

fn schema_unavailable_response() -> BackendResponse {
    no_store_response(json_response(
        200,
        json!({
            "ok": false,
            "code": "schema_unavailable",
            "schemaAvailable": false,
            "message": SCHEMA_UNAVAILABLE_MESSAGE,
            "entries": [],
        }),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---------------------------------------------------------------------------
    // Path guard
    // ---------------------------------------------------------------------------

    #[test]
    fn path_guard_extracts_ws_id() {
        assert_eq!(
            entries_ws_id("/api/v1/workspaces/abc/task-progress/entries"),
            Some("abc")
        );
        let uuid = "11111111-1111-4111-8111-111111111111";
        assert_eq!(
            entries_ws_id(&format!("/api/v1/workspaces/{uuid}/task-progress/entries")),
            Some(uuid)
        );
    }

    #[test]
    fn path_guard_rejects_foreign_and_short_paths() {
        assert_eq!(
            entries_ws_id("/api/v1/workspaces//task-progress/entries"),
            None
        );
        assert_eq!(
            entries_ws_id("/api/v1/workspaces/abc/def/task-progress/entries"),
            None
        );
        assert_eq!(entries_ws_id("/api/v1/workspaces/abc/task-progress"), None);
        assert_eq!(
            entries_ws_id("/api/workspaces/abc/task-progress/entries"),
            None
        );
        assert_eq!(entries_ws_id("/totally/unrelated"), None);
    }

    // ---------------------------------------------------------------------------
    // Pagination helpers
    // ---------------------------------------------------------------------------

    #[test]
    fn parse_page_size_defaults_and_clamps() {
        assert_eq!(parse_page_size(None), 50);
        assert_eq!(parse_page_size(Some("https://x/path?pageSize=10")), 10);
        assert_eq!(parse_page_size(Some("https://x/path?pageSize=0")), 50);
        assert_eq!(parse_page_size(Some("https://x/path?pageSize=300")), 200);
        assert_eq!(parse_page_size(Some("https://x/path?pageSize=abc")), 50);
    }

    #[test]
    fn parse_page_defaults_and_floors_at_one() {
        assert_eq!(parse_page(None), 1);
        assert_eq!(parse_page(Some("https://x/path?page=3")), 3);
        assert_eq!(parse_page(Some("https://x/path?page=0")), 1);
        assert_eq!(parse_page(Some("https://x/path?page=-5")), 1);
        assert_eq!(parse_page(Some("https://x/path?page=abc")), 1);
    }

    #[test]
    fn parse_content_range_count_standard_format() {
        assert_eq!(parse_content_range_count(Some("items 0-49/100")), Some(100));
        assert_eq!(parse_content_range_count(Some("0-49/100")), Some(100));
        assert_eq!(parse_content_range_count(Some("items */*")), None);
        assert_eq!(parse_content_range_count(None), None);
        assert_eq!(parse_content_range_count(Some("items 0-49/0")), Some(0));
    }

    // ---------------------------------------------------------------------------
    // Schema-unavailable detection
    // ---------------------------------------------------------------------------

    #[test]
    fn schema_unavailable_detects_postgrest_codes() {
        assert!(is_schema_unavailable(&json!({ "code": "PGRST205" })));
        assert!(is_schema_unavailable(&json!({ "code": "42P01" })));
        assert!(is_schema_unavailable(&json!({
            "message": "Could not find the table for task_progress_entries in the schema cache"
        })));
        assert!(!is_schema_unavailable(
            &json!({ "code": "23505", "message": "duplicate key" })
        ));
    }

    // ---------------------------------------------------------------------------
    // Query param
    // ---------------------------------------------------------------------------

    #[test]
    fn query_param_reads_first_non_empty_value() {
        let url = Some(
            "https://x.localhost/api/v1/workspaces/w/task-progress/entries?metric_id=m1&from=2026-01-01",
        );
        assert_eq!(query_param(url, "metric_id"), Some("m1".to_owned()));
        assert_eq!(query_param(url, "from"), Some("2026-01-01".to_owned()));
        assert_eq!(query_param(url, "missing"), None);
    }

    // ---------------------------------------------------------------------------
    // UUID / handle helpers
    // ---------------------------------------------------------------------------

    #[test]
    fn is_uuid_literal_validates_shape() {
        assert!(is_uuid_literal("11111111-1111-4111-8111-111111111111"));
        assert!(!is_uuid_literal("personal"));
        assert!(!is_uuid_literal("not-a-uuid"));
    }
}
