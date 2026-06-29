//! Handler for `GET /api/v1/workspaces/:wsId/courses`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/courses/route.ts`. The legacy
//! route also exposes a `POST` handler (create a course); only `GET` is ported
//! here, and every non-GET method returns `None` so the worker falls through to
//! the still-live Next.js route.
//!
//! The legacy GET flow is:
//!   1. resolve/normalize the workspace id,
//!   2. require workspace membership,
//!   3. require the `view_user_groups` workspace permission,
//!   4. read `workspace_user_groups` (filtered to `is_guest = false`) with the
//!      embedded `workspace_course_modules(id)` and
//!      `workspace_user_groups_users!...(user_id)` relations, ordered by
//!      `created_at` descending, paginated, with an exact total count, and
//!   5. respond with `{ data, count, page, pageSize }` where each course exposes
//!      `members_count`/`modules_count` derived from the embedded relation
//!      lengths.
//!
//! Auth is delegated to `workspace_permission_check::authorize_workspace_permission`,
//! which performs the workspace-id normalization, membership lookup, and the
//! `view_user_groups` permission check in one call.
//!
//! BEHAVIOR GAPS vs legacy:
//!   * The shared auth helper collapses several legacy auth failure modes. The
//!     legacy route distinguishes "no workspace access" (403, "You don't have
//!     access to this workspace") from "missing permission" (403, "Insufficient
//!     permissions to view courses") and a null-session "Unauthorized" (401).
//!     This handler maps `Unauthorized` -> 401, `NotFound` (workspace not
//!     resolvable / no membership context) -> 403 with the workspace-access
//!     message, `Forbidden` -> 403 with the insufficient-permissions message,
//!     and `Internal` -> 500.
//!   * The legacy route reads with the caller's RLS-active Supabase client after
//!     the permission check. Because the permission is already verified, this
//!     handler reads `workspace_user_groups` with the service-role key scoped by
//!     the resolved `ws_id` (matching the existing migrated user-groups
//!     handlers); the resulting rows are identical for an authorized caller.
//!   * The legacy `allowAppSessionAuth` / rate-limit middleware options are not
//!     reproduced here (the shared helper intentionally ignores app-session
//!     bearer tokens, mirroring the other migrated workspace-permission routes).

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/courses";
const COURSES_TABLE: &str = "workspace_user_groups";
const VIEW_PERMISSION: &str = "view_user_groups";
const COURSES_SELECT: &str = "id,name,description,cert_template,created_at,archived,ending_date,is_course_published,starting_date,workspace_course_modules(id),workspace_user_groups_users!workspace_user_roles_users_role_id_fkey(user_id)";

const DEFAULT_PAGE_SIZE: i64 = 20;
const MAX_PAGE_SIZE: i64 = 100;

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const NO_ACCESS_MESSAGE: &str = "You don't have access to this workspace";
const FORBIDDEN_MESSAGE: &str = "Insufficient permissions to view courses";
const VERIFY_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const FETCH_ERROR_MESSAGE: &str = "Error fetching workspace courses";

#[derive(Deserialize)]
struct CourseRow {
    #[serde(default)]
    id: Value,
    #[serde(default)]
    name: Value,
    #[serde(default)]
    description: Value,
    #[serde(default)]
    cert_template: Value,
    #[serde(default)]
    created_at: Value,
    #[serde(default)]
    archived: Value,
    #[serde(default)]
    ending_date: Value,
    #[serde(default)]
    is_course_published: Value,
    #[serde(default)]
    starting_date: Value,
    #[serde(default)]
    workspace_course_modules: Vec<Value>,
    #[serde(default)]
    workspace_user_groups_users: Vec<Value>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct CoursesQuery {
    page: i64,
    page_size: i64,
}

pub(crate) async fn handle_workspaces_wsid_courses_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = courses_ws_id(request.path)?;

    Some(match request.method {
        "GET" => courses_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn courses_response(
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
        Ok(authorization) => authorization,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return message_response(401, UNAUTHORIZED_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::NotFound) => {
            return message_response(403, NO_ACCESS_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return message_response(403, FORBIDDEN_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, VERIFY_FAILED_MESSAGE);
        }
    };

    let query = parse_courses_query(request.url);
    let status = status_filter(request.url);
    let search = search_filter(request.url);

    match fetch_courses(
        contact_data,
        outbound,
        &authorization.ws_id,
        query,
        status.as_deref(),
        search.as_deref(),
    )
    .await
    {
        Ok((rows, count)) => no_store_response(json_response(
            200,
            json!({
                "data": rows.into_iter().map(course_to_json).collect::<Vec<_>>(),
                "count": count,
                "page": query.page,
                "pageSize": query.page_size,
            }),
        )),
        Err(()) => message_response(500, FETCH_ERROR_MESSAGE),
    }
}

async fn fetch_courses(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: CoursesQuery,
    status: Option<&str>,
    search: Option<&str>,
) -> Result<(Vec<CourseRow>, i64), ()> {
    let mut params: Vec<(&str, String)> = vec![
        ("select", COURSES_SELECT.to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("is_guest", "eq.false".to_owned()),
        ("order", "created_at.desc".to_owned()),
    ];

    // Legacy: `if (status !== 'all') queryBuilder.eq('archived', status === 'archived')`.
    if let Some(status) = status
        && status != "all" {
            let archived = status == "archived";
            params.push(("archived", format!("eq.{archived}")));
        }

    // Legacy: `if ((q?.length ?? 0) > 0) queryBuilder.ilike('name', `%${q}%`)`.
    if let Some(search) = search.filter(|value| !value.is_empty()) {
        params.push(("name", format!("ilike.%{search}%")));
    }

    let Some(url) = contact_data.rest_url(COURSES_TABLE, &params) else {
        return Err(());
    };

    let from = (query.page - 1) * query.page_size;
    let to = from + query.page_size - 1;
    let range = format!("{from}-{to}");

    let response =
        send_service_role_get(contact_data, outbound, &url, &range, "count=exact").await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let count = total_count_from_content_range(&response).unwrap_or(0);
    let rows = response.json::<Vec<CourseRow>>().map_err(|_| ())?;

    Ok((rows, count))
}

fn course_to_json(course: CourseRow) -> Value {
    json!({
        "id": course.id,
        "name": course.name,
        "description": course.description,
        "cert_template": course.cert_template,
        "created_at": course.created_at,
        "archived": course.archived,
        "ending_date": course.ending_date,
        "is_course_published": course.is_course_published,
        "members_count": course.workspace_user_groups_users.len(),
        "modules_count": course.workspace_course_modules.len(),
        "starting_date": course.starting_date,
    })
}

async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    range: &str,
    prefer: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Range-Unit", "items")
                .with_header("Range", range)
                .with_header("Prefer", prefer),
        )
        .await
        .map_err(|_| ())
}

fn courses_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

/// Mirrors the legacy `page`/`pageSize` query parsing:
///   page = max(parseInt(page ?? '1') || 1, 1)
///   pageSize = min(max(parseInt(pageSize ?? '20') || 20, 1), 100)
fn parse_courses_query(request_url: Option<&str>) -> CoursesQuery {
    let mut page = 1_i64;
    let mut page_size = DEFAULT_PAGE_SIZE;

    if let Some(url) = request_url.and_then(|value| url::Url::parse(value).ok()) {
        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "page" => page = parse_int_prefix(&value).filter(|n| *n != 0).unwrap_or(1),
                "pageSize" => {
                    page_size = parse_int_prefix(&value)
                        .filter(|n| *n != 0)
                        .unwrap_or(DEFAULT_PAGE_SIZE)
                }
                _ => {}
            }
        }
    }

    CoursesQuery {
        page: page.max(1),
        page_size: page_size.clamp(1, MAX_PAGE_SIZE),
    }
}

fn status_filter(request_url: Option<&str>) -> Option<String> {
    let value = query_value(request_url, "status");
    // Legacy default: `searchParams.get('status') ?? 'active'`.
    Some(value.unwrap_or_else(|| "active".to_owned()))
}

fn search_filter(request_url: Option<&str>) -> Option<String> {
    // Legacy: `searchParams.get('q')?.trim()`.
    query_value(request_url, "q").map(|value| value.trim().to_owned())
}

fn query_value(request_url: Option<&str>, key: &str) -> Option<String> {
    url::Url::parse(request_url?)
        .ok()?
        .query_pairs()
        .find_map(|(name, value)| (name == key).then(|| value.into_owned()))
}

/// Mirrors JavaScript `parseInt(value, 10)`: parse the leading signed integer
/// prefix, ignoring trailing non-digit characters. Returns `None` when no digits
/// are found (legacy treats this as `NaN`, which the `|| default` fallback then
/// replaces with the default).
fn parse_int_prefix(value: &str) -> Option<i64> {
    let trimmed = value.trim_start();
    let mut chars = trimmed.chars().peekable();
    let mut sign = 1_i64;

    match chars.peek().copied() {
        Some('-') => {
            sign = -1;
            chars.next();
        }
        Some('+') => {
            chars.next();
        }
        _ => {}
    }

    let mut digits = String::new();
    while let Some(character) = chars.peek().copied() {
        if !character.is_ascii_digit() {
            break;
        }
        digits.push(character);
        chars.next();
    }

    if digits.is_empty() {
        return None;
    }

    digits.parse::<i64>().ok().map(|value| sign * value)
}

fn total_count_from_content_range(response: &OutboundResponse) -> Option<i64> {
    let header = response.header("content-range")?;
    let (_, total) = header.rsplit_once('/')?;
    total.parse::<i64>().ok()
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn courses_ws_id_extracts_segment_for_exact_path() {
        assert_eq!(
            courses_ws_id("/api/v1/workspaces/abc-123/courses"),
            Some("abc-123")
        );
    }

    #[test]
    fn courses_ws_id_rejects_other_paths() {
        assert_eq!(courses_ws_id("/api/workspaces/abc/courses"), None);
        assert_eq!(courses_ws_id("/api/v1/workspaces/abc/courses/1"), None);
        assert_eq!(courses_ws_id("/api/v1/workspaces//courses"), None);
        assert_eq!(courses_ws_id("/api/v1/workspaces/abc/courses/"), None);
        assert_eq!(courses_ws_id("/api/v1/workspaces/abc/modules"), None);
    }

    #[test]
    fn parse_courses_query_defaults() {
        let query = parse_courses_query(Some("https://x.test/api/v1/workspaces/w/courses"));
        assert_eq!(query.page, 1);
        assert_eq!(query.page_size, DEFAULT_PAGE_SIZE);
    }

    #[test]
    fn parse_courses_query_clamps_values() {
        let query = parse_courses_query(Some(
            "https://x.test/api/v1/workspaces/w/courses?page=3&pageSize=50",
        ));
        assert_eq!(query.page, 3);
        assert_eq!(query.page_size, 50);

        let clamped = parse_courses_query(Some(
            "https://x.test/api/v1/workspaces/w/courses?page=-5&pageSize=9999",
        ));
        assert_eq!(clamped.page, 1);
        assert_eq!(clamped.page_size, MAX_PAGE_SIZE);

        let min_size = parse_courses_query(Some(
            "https://x.test/api/v1/workspaces/w/courses?pageSize=0",
        ));
        // `0` falls back to the default before clamping.
        assert_eq!(min_size.page_size, DEFAULT_PAGE_SIZE);

        let negative_size = parse_courses_query(Some(
            "https://x.test/api/v1/workspaces/w/courses?pageSize=-3",
        ));
        assert_eq!(negative_size.page_size, 1);
    }

    #[test]
    fn parse_courses_query_ignores_non_numeric() {
        let query = parse_courses_query(Some(
            "https://x.test/api/v1/workspaces/w/courses?page=abc&pageSize=xyz",
        ));
        assert_eq!(query.page, 1);
        assert_eq!(query.page_size, DEFAULT_PAGE_SIZE);
    }

    #[test]
    fn status_filter_defaults_to_active() {
        assert_eq!(
            status_filter(Some("https://x.test/api/v1/workspaces/w/courses")),
            Some("active".to_owned())
        );
        assert_eq!(
            status_filter(Some(
                "https://x.test/api/v1/workspaces/w/courses?status=all"
            )),
            Some("all".to_owned())
        );
        assert_eq!(
            status_filter(Some(
                "https://x.test/api/v1/workspaces/w/courses?status=archived"
            )),
            Some("archived".to_owned())
        );
    }

    #[test]
    fn search_filter_trims_value() {
        assert_eq!(
            search_filter(Some(
                "https://x.test/api/v1/workspaces/w/courses?q=%20math%20"
            )),
            Some("math".to_owned())
        );
        assert_eq!(
            search_filter(Some("https://x.test/api/v1/workspaces/w/courses")),
            None
        );
    }

    #[test]
    fn course_to_json_derives_counts() {
        let row = CourseRow {
            id: json!("course-1"),
            name: json!("Algebra"),
            description: Value::Null,
            cert_template: json!("default"),
            created_at: json!("2024-01-01T00:00:00Z"),
            archived: json!(false),
            ending_date: Value::Null,
            is_course_published: json!(true),
            starting_date: Value::Null,
            workspace_course_modules: vec![json!({"id": 1}), json!({"id": 2})],
            workspace_user_groups_users: vec![json!({"user_id": "u1"})],
        };

        assert_eq!(
            course_to_json(row),
            json!({
                "id": "course-1",
                "name": "Algebra",
                "description": null,
                "cert_template": "default",
                "created_at": "2024-01-01T00:00:00Z",
                "archived": false,
                "ending_date": null,
                "is_course_published": true,
                "members_count": 1,
                "modules_count": 2,
                "starting_date": null,
            })
        );
    }

    #[test]
    fn parse_int_prefix_matches_parse_int_semantics() {
        assert_eq!(parse_int_prefix("42"), Some(42));
        assert_eq!(parse_int_prefix("  7abc"), Some(7));
        assert_eq!(parse_int_prefix("-3"), Some(-3));
        assert_eq!(parse_int_prefix("abc"), None);
        assert_eq!(parse_int_prefix(""), None);
    }
}
