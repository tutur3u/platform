//! Handler for `GET /api/v1/workspaces/:wsId/users/feedbacks`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/users/feedbacks/route.ts`.
//!
//! Auth requires the `view_user_groups` workspace permission. Only GET is
//! migrated; POST, PUT, and DELETE return `None` to fall through to Next.js.
//!
//! Status codes:
//!
//! - no session  -> `401 { "message": "Unauthorized" }`
//! - workspace not found / non-member -> `404 { "error": "Not found" }`
//! - lacking `view_user_groups` -> `403 { "message": "Insufficient permissions to view feedback" }`
//! - bad query params -> `400 { "message": "Invalid query parameters" }`
//! - upstream failure -> `500 { "message": "Error fetching feedbacks" }`
//!
//! Behavior gap: `authorize_workspace_permission` maps "no session" to 401 and
//! "non-member" to 404; the legacy `getPermissions` surfaced both as 404.

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
const PATH_SUFFIX: &str = "/users/feedbacks";
const VIEW_PERMISSION: &str = "view_user_groups";
const FEEDBACK_TABLE: &str = "user_feedbacks";
/// Mirrors the `.select(...)` call in `buildWorkspaceFeedbacksQuery` (shared.ts).
const FEEDBACK_SELECT: &str = concat!(
    "id,user_id,group_id,creator_id,content,require_attention,created_at,",
    "user:workspace_users!user_feedbacks_user_id_fkey!inner(",
    "id,ws_id,full_name,display_name,email),",
    "creator:workspace_users!user_feedbacks_creator_id_fkey(",
    "id,full_name,display_name,email),",
    "group:workspace_user_groups!user_feedbacks_group_id_fkey(id,name)"
);

const DEFAULT_PAGE: i64 = 1;
const DEFAULT_PAGE_SIZE: i64 = 10;
const MIN_PAGE: i64 = 1;
const MIN_PAGE_SIZE: i64 = 1;
const MAX_PAGE_SIZE: i64 = 100;

pub(crate) async fn handle_workspaces_wsid_users_feedbacks_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = feedbacks_ws_id(request.path)?;

    Some(match request.method {
        "GET" => feedbacks_get(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn feedbacks_get(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return msg(500, "Internal server error");
    }

    let ws_id = match authorize_workspace_permission(
        contact_data,
        request,
        raw_ws_id,
        VIEW_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(auth) => auth.ws_id,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return msg(401, "Unauthorized");
        }
        Err(WorkspacePermissionAuthorizationError::NotFound) => {
            return no_store_response(json_response(404, json!({ "error": "Not found" })));
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return msg(403, "Insufficient permissions to view feedback");
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return msg(500, "Internal server error");
        }
    };

    let query = match FeedbackQuery::parse(request.url) {
        Ok(q) => q,
        Err(()) => {
            return no_store_response(json_response(
                400,
                json!({ "message": "Invalid query parameters" }),
            ));
        }
    };

    match fetch_feedbacks(contact_data, outbound, &ws_id, &query).await {
        Ok((count, rows)) => {
            let data: Vec<Value> = rows.into_iter().filter_map(normalize_row).collect();
            let total_pages = std::cmp::max(1, (count + query.page_size - 1) / query.page_size);
            no_store_response(json_response(
                200,
                json!({
                    "data": data,
                    "count": count,
                    "page": query.page,
                    "pageSize": query.page_size,
                    "totalPages": total_pages,
                }),
            ))
        }
        Err(()) => msg(500, "Error fetching feedbacks"),
    }
}

async fn fetch_feedbacks(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &FeedbackQuery,
) -> Result<(i64, Vec<Value>), ()> {
    let from = (query.page - 1) * query.page_size;
    let to = from + query.page_size - 1;
    let range = format!("{from}-{to}");

    let mut params: Vec<(&str, String)> = vec![
        ("select", FEEDBACK_SELECT.to_owned()),
        ("user.ws_id", format!("eq.{ws_id}")),
        ("order", "created_at.desc".to_owned()),
    ];
    if let Some(ref gid) = query.group_id {
        params.push(("group_id", format!("eq.{gid}")));
    }
    if let Some(ref uid) = query.user_id {
        params.push(("user_id", format!("eq.{uid}")));
    }
    if let Some(ref cid) = query.creator_id {
        params.push(("creator_id", format!("eq.{cid}")));
    }
    match query.require_attention {
        RequireAttention::True => params.push(("require_attention", "eq.true".to_owned())),
        RequireAttention::False => params.push(("require_attention", "eq.false".to_owned())),
        RequireAttention::All => {}
    }
    if !query.q.is_empty() {
        let e = query.q.replace('%', "\\%").replace(',', "\\,");
        params.push((
            "or",
            format!(
                "(content.ilike.%{e}%,user.full_name.ilike.%{e}%,\
             user.display_name.ilike.%{e}%,creator.full_name.ilike.%{e}%,\
             creator.display_name.ilike.%{e}%,group.name.ilike.%{e}%)"
            ),
        ));
    }

    let url = contact_data.rest_url(FEEDBACK_TABLE, &params).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key)
                .with_header("Prefer", "count=exact")
                .with_header("Range-Unit", "items")
                .with_header("Range", &range),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // PostgREST returns exact total in `Content-Range: {from}-{to}/{total}`.
    let count = content_range_total(response.header("content-range")).unwrap_or(0);
    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;

    Ok((count, rows))
}

/// Raw PostgREST row shape.
#[derive(Deserialize)]
struct RawRow {
    id: String,
    user_id: Option<String>,
    group_id: Option<String>,
    creator_id: Option<String>,
    content: String,
    require_attention: bool,
    created_at: String,
    user: Option<Value>,
    creator: Option<Value>,
    group: Option<Value>,
}

fn normalize_row(raw: Value) -> Option<Value> {
    let row: RawRow = serde_json::from_value(raw).ok()?;

    let user = normalize_person(&row.user);
    let creator = normalize_person(&row.creator);
    let group = normalize_group(&row.group);

    let user_name = display_name(user.as_ref());
    let creator_name = display_name(creator.as_ref());
    let group_name = group
        .as_ref()
        .and_then(|g| g.get("name"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("Unknown Group")
        .to_owned();

    Some(json!({
        "id": row.id,
        "user_id": row.user_id.unwrap_or_default(),
        "group_id": row.group_id.unwrap_or_default(),
        "creator_id": row.creator_id,
        "content": row.content,
        "require_attention": row.require_attention,
        "created_at": row.created_at,
        "user": user,
        "creator": creator,
        "group": group,
        "user_name": user_name,
        "creator_name": creator_name,
        "group_name": group_name,
    }))
}

fn normalize_person(value: &Option<Value>) -> Option<Value> {
    let obj = match value.as_ref()? {
        Value::Object(m) => Some(m.clone()),
        Value::Array(arr) => arr.first().and_then(Value::as_object).cloned(),
        _ => None,
    }?;

    Some(json!({
        "id": obj.get("id").and_then(Value::as_str),
        "full_name": obj.get("full_name").and_then(Value::as_str),
        "display_name": obj.get("display_name").and_then(Value::as_str),
        "email": obj.get("email").and_then(Value::as_str),
    }))
}

fn normalize_group(value: &Option<Value>) -> Option<Value> {
    let obj = match value.as_ref()? {
        Value::Object(m) => Some(m.clone()),
        Value::Array(arr) => arr.first().and_then(Value::as_object).cloned(),
        _ => None,
    }?;

    Some(json!({
        "id": obj.get("id").and_then(Value::as_str),
        "name": obj.get("name").and_then(Value::as_str),
    }))
}

fn display_name(person: Option<&Value>) -> String {
    let Some(obj) = person.and_then(Value::as_object) else {
        return "Unknown User".to_owned();
    };

    for field in ["full_name", "display_name", "email"] {
        if let Some(v) = obj.get(field).and_then(Value::as_str) {
            let trimmed = v.trim();
            if !trimmed.is_empty() {
                return trimmed.to_owned();
            }
        }
    }

    "Unknown User".to_owned()
}

/// Mirrors `FeedbackListSearchParamsSchema.requireAttention`.
enum RequireAttention {
    All,
    True,
    False,
}

struct FeedbackQuery {
    q: String,
    page: i64,
    page_size: i64,
    require_attention: RequireAttention,
    group_id: Option<String>,
    user_id: Option<String>,
    creator_id: Option<String>,
}

impl FeedbackQuery {
    fn parse(url: Option<&str>) -> Result<Self, ()> {
        let mut q = String::new();
        let mut page_raw = String::new();
        let mut page_size_raw = String::new();
        let mut require_attention_raw = String::new();
        let mut group_id: Option<String> = None;
        let mut user_id: Option<String> = None;
        let mut creator_id: Option<String> = None;

        if let Some(Ok(parsed)) = url.map(url::Url::parse) {
            for (key, value) in parsed.query_pairs() {
                match key.as_ref() {
                    "q" => q = value.trim().to_owned(),
                    "page" => page_raw = value.into_owned(),
                    "pageSize" => page_size_raw = value.into_owned(),
                    "requireAttention" => require_attention_raw = value.into_owned(),
                    "groupId" => group_id = Some(value.into_owned()),
                    "userId" => user_id = Some(value.into_owned()),
                    "creatorId" => creator_id = Some(value.into_owned()),
                    _ => {}
                }
            }
        }

        let page = if page_raw.is_empty() {
            DEFAULT_PAGE
        } else {
            let n: i64 = page_raw.trim().parse().map_err(|_| ())?;
            if n < MIN_PAGE {
                return Err(());
            }
            n
        };

        let page_size = if page_size_raw.is_empty() {
            DEFAULT_PAGE_SIZE
        } else {
            let n: i64 = page_size_raw.trim().parse().map_err(|_| ())?;
            if !(MIN_PAGE_SIZE..=MAX_PAGE_SIZE).contains(&n) {
                return Err(());
            }
            n
        };

        let require_attention = match require_attention_raw.as_str() {
            "" | "all" => RequireAttention::All,
            "true" => RequireAttention::True,
            "false" => RequireAttention::False,
            _ => return Err(()),
        };

        for id in [&group_id, &user_id, &creator_id].into_iter().flatten() {
            if !is_uuid(id) {
                return Err(());
            }
        }

        Ok(Self {
            q,
            page,
            page_size,
            require_attention,
            group_id,
            user_id,
            creator_id,
        })
    }
}

fn feedbacks_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn content_range_total(header: Option<&str>) -> Option<i64> {
    let total = header?.split('/').nth(1)?.trim();
    if total == "*" {
        return None;
    }
    total.parse::<i64>().ok()
}

fn is_uuid(value: &str) -> bool {
    let v = value.trim();
    v.len() == 36
        && v.chars().enumerate().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        })
}

fn msg(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    const WS_UUID: &str = "11111111-1111-4111-8111-111111111111";

    #[test]
    fn path_guard_accepts_valid_path() {
        assert_eq!(
            feedbacks_ws_id("/api/v1/workspaces/ws-123/users/feedbacks"),
            Some("ws-123")
        );
        assert_eq!(
            feedbacks_ws_id(&format!("/api/v1/workspaces/{WS_UUID}/users/feedbacks")),
            Some(WS_UUID)
        );
    }

    #[test]
    fn path_guard_rejects_wrong_prefix_suffix_or_extra_segments() {
        assert_eq!(feedbacks_ws_id("/api/workspaces/ws/users/feedbacks"), None);
        assert_eq!(feedbacks_ws_id("/api/v1/workspaces/ws/users"), None);
        assert_eq!(feedbacks_ws_id("/api/v1/workspaces//users/feedbacks"), None);
        assert_eq!(
            feedbacks_ws_id("/api/v1/workspaces/a/b/users/feedbacks"),
            None
        );
    }

    #[test]
    fn content_range_parses_correctly() {
        assert_eq!(content_range_total(Some("0-9/42")), Some(42));
        assert_eq!(content_range_total(Some("*/0")), Some(0));
        assert_eq!(content_range_total(Some("0-0/*")), None);
        assert_eq!(content_range_total(None), None);
    }

    #[test]
    fn uuid_check_accepts_valid_and_rejects_invalid() {
        assert!(is_uuid(WS_UUID));
        assert!(!is_uuid("not-a-uuid"));
        assert!(!is_uuid("11111111111141118111111111111111111"));
    }

    #[test]
    fn query_defaults_on_empty_url() {
        let q = FeedbackQuery::parse(Some("https://x/path")).expect("should succeed");
        assert_eq!(q.page, DEFAULT_PAGE);
        assert_eq!(q.page_size, DEFAULT_PAGE_SIZE);
        assert!(q.q.is_empty());
        assert!(q.group_id.is_none());
    }

    #[test]
    fn query_parses_explicit_params() {
        let q = FeedbackQuery::parse(Some(&format!(
            "https://x/path?q=hello&page=2&pageSize=20\
             &requireAttention=true&groupId={WS_UUID}"
        )))
        .expect("should succeed");
        assert_eq!(q.page, 2);
        assert_eq!(q.page_size, 20);
        assert_eq!(q.q, "hello");
        assert!(matches!(q.require_attention, RequireAttention::True));
        assert_eq!(q.group_id.as_deref(), Some(WS_UUID));
    }

    #[test]
    fn query_rejects_invalid_params() {
        assert!(FeedbackQuery::parse(Some("https://x/path?page=0")).is_err());
        assert!(FeedbackQuery::parse(Some("https://x/path?pageSize=101")).is_err());
        assert!(FeedbackQuery::parse(Some("https://x/path?requireAttention=maybe")).is_err());
        assert!(FeedbackQuery::parse(Some("https://x/path?groupId=not-a-uuid")).is_err());
    }
}
