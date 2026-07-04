use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FETCH_ERROR_MESSAGE: &str = "Error fetching workspace user group tags";

const DEFAULT_PAGE_SIZE: i64 = 10;
const MAX_PAGE_SIZE: i64 = 100;

const WORKSPACES_GROUP_TAGS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_GROUP_TAGS_PATH_SUFFIX: &str = "/group-tags";

#[derive(Serialize)]
struct WorkspaceGroupTagsResponse {
    data: Vec<Value>,
    count: i64,
    page: i64,
    #[serde(rename = "pageSize")]
    page_size: i64,
}

/// Embedded `workspace_user_group_tag_groups(group_id)` row from the nested
/// select. Mirrors the legacy `group_ids:workspace_user_group_tag_groups(group_id)`
/// alias.
#[derive(Deserialize)]
struct GroupIdRow {
    group_id: Option<String>,
}

struct ParsedQuery {
    q: Option<String>,
    page: i64,
    page_size: i64,
}

/// Handles `GET /api/v1/workspaces/:wsId/group-tags`.
///
/// Returns `None` when the request path does not match this route (so the
/// caller can keep dispatching), or when the HTTP method is one that has not
/// been migrated yet (e.g. `POST`), so the Cloudflare worker falls through to
/// the still-active Next.js route for those mutations. Only the migrated `GET`
/// method produces `Some(...)`.
pub(crate) async fn handle_workspaces_group_tags_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = workspaces_group_tags_ws_id(request.path)?;

    Some(match request.method {
        "GET" => group_tags_response(config, request, ws_id, outbound).await,
        // POST (and any other method) is NOT migrated yet. Returning None lets
        // the worker fall through to the still-active Next.js route instead of
        // 405-ing a valid mutation.
        _ => return None,
    })
}

async fn group_tags_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // The legacy route uses `createClient()` (the authenticated session client)
    // so PostgREST enforces RLS exactly like the Next.js handler. There is no
    // additional membership/permission check in the legacy code; RLS is the
    // gate. We forward the caller's access token to preserve that behavior.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(_user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    let ParsedQuery { q, page, page_size } = parse_query(request.url);

    match fetch_group_tags(
        &config.contact_data,
        outbound,
        ws_id,
        &access_token,
        q.as_deref(),
        page,
        page_size,
    )
    .await
    {
        Ok((data, count)) => no_store_response(json_response(
            200,
            WorkspaceGroupTagsResponse {
                data,
                count,
                page,
                page_size,
            },
        )),
        Err(()) => message_response(500, FETCH_ERROR_MESSAGE),
    }
}

/// Mirrors the legacy supabase query:
///
/// ```text
/// from('workspace_user_group_tags')
///   .select('*, group_ids:workspace_user_group_tag_groups(group_id)', { count: 'exact' })
///   .eq('ws_id', id)
///   .order('created_at', { ascending: false })
///   [.ilike('name', `%${q}%`)]
///   .range(from, from + pageSize - 1)
/// ```
///
/// Returns the mapped data array (with `group_ids` flattened to a string array)
/// and the exact total count (from the PostgREST `Content-Range` header).
async fn fetch_group_tags(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    access_token: &str,
    q: Option<&str>,
    page: i64,
    page_size: i64,
) -> Result<(Vec<Value>, i64), ()> {
    let from = (page - 1) * page_size;
    // supabase-js `.range(from, to)` translates to PostgREST `offset`/`limit`.
    let limit = page_size;

    let mut params: Vec<(&str, String)> = vec![
        (
            "select",
            "*, group_ids:workspace_user_group_tag_groups(group_id)".to_owned(),
        ),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "created_at.desc".to_owned()),
        ("offset", from.to_string()),
        ("limit", limit.to_string()),
    ];

    // Only apply the name filter when q is a non-empty trimmed string, matching
    // `if ((q?.length ?? 0) > 0)`. supabase-js `.ilike('name', '%q%')` sends the
    // pattern verbatim (with `%` wildcards); rest_url URL-encodes it.
    if let Some(q) = q {
        params.push(("name", format!("ilike.%{q}%")));
    }

    let Some(url) = contact_data.rest_url("workspace_user_group_tags", &params) else {
        return Err(());
    };
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Prefer", "count=exact"),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let count = response
        .header("content-range")
        .and_then(parse_content_range);

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    let count = count.unwrap_or(rows.len() as i64);

    let data = rows.into_iter().map(map_tag).collect();

    Ok((data, count))
}

/// Mirrors the legacy `.map(({ group_ids, ...tag }) => ({ ...tag, group_ids: [...] }))`:
/// strips the embedded `group_ids` join rows and replaces them with a flat array
/// of `group_id` strings.
fn map_tag(row: Value) -> Value {
    let mut object = match row {
        Value::Object(map) => map,
        other => return other,
    };

    let group_ids_value = object.remove("group_ids").unwrap_or(Value::Null);
    let group_ids: Vec<Value> = serde_json::from_value::<Vec<GroupIdRow>>(group_ids_value)
        .unwrap_or_default()
        .into_iter()
        .filter_map(|group| group.group_id)
        .map(Value::String)
        .collect();

    object.insert("group_ids".to_owned(), Value::Array(group_ids));

    Value::Object(object)
}

/// Mirrors the legacy query-param parsing:
/// - `q`: trimmed; treated as absent when empty.
/// - `page`: `max(parseInt(page ?? '1') || 1, 1)`.
/// - `pageSize`: `min(max(parseInt(pageSize ?? '10') || 10, 1), 100)`.
fn parse_query(request_url: Option<&str>) -> ParsedQuery {
    let mut q_raw: Option<String> = None;
    let mut page_raw: Option<String> = None;
    let mut page_size_raw: Option<String> = None;

    if let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) {
        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "q" => q_raw = Some(value.into_owned()),
                "page" => page_raw = Some(value.into_owned()),
                "pageSize" => page_size_raw = Some(value.into_owned()),
                _ => {}
            }
        }
    }

    let q = q_raw
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty());

    // `Number.parseInt(x, 10) || 1` then `max(_, 1)`. A parsed 0 (or absent /
    // NaN) falls back to 1 via the `|| 1` semantics, then `max(_, 1)`.
    let parsed_page = match parse_int_radix10(page_raw.as_deref()) {
        Some(value) if value != 0 => value,
        _ => 1,
    };
    let page = parsed_page.max(1);

    // `Number.parseInt(x, 10) || DEFAULT_PAGE_SIZE`, then clamp to [1, 100].
    let parsed_page_size = match parse_int_radix10(page_size_raw.as_deref()) {
        Some(value) if value != 0 => value,
        _ => DEFAULT_PAGE_SIZE,
    };
    let page_size = parsed_page_size.clamp(1, MAX_PAGE_SIZE);

    ParsedQuery { q, page, page_size }
}

/// Mirrors JS `Number.parseInt(value, 10)`: parses a leading optional sign plus
/// leading decimal digits, ignoring trailing non-digit characters. Returns
/// `None` for `NaN` (no leading digits / absent value), matching the `|| default`
/// fallthrough in the legacy code.
fn parse_int_radix10(value: Option<&str>) -> Option<i64> {
    let value = value?;
    let trimmed = value.trim_start();
    let bytes = trimmed.as_bytes();

    let mut index = 0;
    let mut negative = false;
    if let Some(&first) = bytes.first()
        && (first == b'+' || first == b'-')
    {
        negative = first == b'-';
        index = 1;
    }

    let digits_start = index;
    while index < bytes.len() && bytes[index].is_ascii_digit() {
        index += 1;
    }

    if index == digits_start {
        return None;
    }

    let digits = &trimmed[digits_start..index];
    let magnitude = digits.parse::<i64>().ok()?;

    Some(if negative { -magnitude } else { magnitude })
}

/// Matches `/api/v1/workspaces/:wsId/group-tags` exactly (no trailing dynamic
/// segments) and extracts the `wsId` dynamic segment. Paths with extra segments
/// such as `/group-tags/:tagId/...` are intentionally NOT matched so they
/// continue routing to their own handlers.
fn workspaces_group_tags_ws_id(path: &str) -> Option<&str> {
    let path = path.split('?').next().unwrap_or(path);
    let ws_id = path
        .strip_prefix(WORKSPACES_GROUP_TAGS_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_GROUP_TAGS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

/// Parses the total count from a PostgREST `Content-Range` header value such as
/// `0-9/100` or `*/100`. Returns the value after the final `/`.
fn parse_content_range(content_range: &str) -> Option<i64> {
    let total = content_range.rsplit('/').next()?.trim();
    if total.is_empty() || total == "*" {
        return None;
    }
    total.parse::<i64>().ok()
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
