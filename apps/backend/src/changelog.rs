use base64::Engine;
use base64::engine::general_purpose::URL_SAFE;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const CHANGELOG_LIST_PATH: &str = "/api/v1/infrastructure/changelog";
const CHANGELOG_SLUG_PATH_PREFIX: &str = "/api/v1/infrastructure/changelog/slug/";
const CHANGELOG_DETAIL_PATH_PREFIX: &str = "/api/v1/infrastructure/changelog/";
const CHANGELOG_ENTRIES_TABLE: &str = "changelog_entries";
const CHANGELOG_LIST_ERROR_MESSAGE: &str = "Error fetching changelog entries";
const CHANGELOG_ENTRY_NOT_FOUND_MESSAGE: &str = "Changelog entry not found";
const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";
const MANAGE_CHANGELOG_PERMISSION: &str = "manage_changelog";
const POSTGREST_SINGLE_JSON: &str = "application/vnd.pgrst.object+json";
const POSTGREST_SINGULAR_RESPONSE_ERROR_CODE: &str = "PGRST116";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const SUPABASE_AUTH_COOKIE_BASE64_PREFIX: &str = "base64-";
const SUPABASE_AUTH_USER_PATH: &str = "user";

#[derive(Deserialize)]
struct PostgrestError {
    code: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct ChangelogListQuery {
    category: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
    published: Option<bool>,
}

#[derive(Clone, Debug, Default)]
struct SupabaseAuthCookieGroup {
    base: Option<String>,
    chunks: BTreeMap<usize, String>,
    duplicate: bool,
}

#[derive(Deserialize)]
struct SupabaseCookieSession {
    access_token: Option<String>,
}

#[derive(Deserialize)]
struct SupabaseUserResponse {
    id: Option<String>,
}

#[derive(Serialize)]
struct HasWorkspacePermissionRequest<'a> {
    p_permission: &'a str,
    p_user_id: &'a str,
    p_ws_id: &'a str,
}

enum ChangelogRoute<'a> {
    Detail { id: &'a str },
    List,
    Slug { slug: &'a str },
}

pub(crate) async fn handle_changelog_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let route = changelog_route(request.path)?;

    Some(match request.method {
        "GET" => match route {
            ChangelogRoute::Detail { id } => {
                changelog_detail_response(&config.contact_data, request, id, outbound).await
            }
            ChangelogRoute::List => {
                changelog_list_response(&config.contact_data, request, outbound).await
            }
            ChangelogRoute::Slug { slug } => {
                changelog_slug_response(&config.contact_data, slug, outbound).await
            }
        },
        method => method_not_allowed(method, "GET"),
    })
}

async fn changelog_list_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !contact_data.configured() {
        return changelog_list_error_response();
    }

    let query = changelog_list_query_from_url(request.url);
    let authorized = request_has_changelog_admin_access(contact_data, request, outbound).await;
    let mut params = vec![
        ("select", "*".to_owned()),
        (
            "order",
            "published_at.desc.nullslast,created_at.desc".to_owned(),
        ),
    ];

    if !authorized {
        params.extend(public_changelog_filters());
    } else if let Some(published) = query.published {
        params.push(("is_published", format!("eq.{published}")));
    }

    if let Some(category) = &query.category {
        params.push(("category", format!("eq.{category}")));
    }

    let Some(url) = contact_data.rest_url(CHANGELOG_ENTRIES_TABLE, &params) else {
        return changelog_list_error_response();
    };
    let range = changelog_range(&query);
    let Ok(response) = send_changelog_get(
        contact_data,
        outbound,
        &url,
        APPLICATION_JSON,
        Some(&range),
        Some("count=exact"),
    )
    .await
    else {
        return changelog_list_error_response();
    };

    if !(200..300).contains(&response.status) {
        return changelog_list_error_response();
    }

    let Ok(data) = response.json::<Value>() else {
        return changelog_list_error_response();
    };
    let total = total_count_from_content_range(&response).unwrap_or(0);
    let total_pages = changelog_total_pages(total, query.page_size);

    no_store_response(json_response(
        200,
        json!({
            "data": data,
            "pagination": {
                "page": query.page,
                "pageSize": query.page_size,
                "total": total,
                "totalPages": total_pages,
            },
        }),
    ))
}

async fn changelog_detail_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !contact_data.configured() {
        return changelog_error_response(500);
    }

    let authorized = request_has_changelog_admin_access(contact_data, request, outbound).await;
    let mut params = vec![("select", "*".to_owned()), ("id", format!("eq.{id}"))];

    if !authorized {
        params.extend(public_changelog_filters());
    }

    let Some(url) = contact_data.rest_url(CHANGELOG_ENTRIES_TABLE, &params) else {
        return changelog_error_response(500);
    };
    let Ok(response) = send_changelog_get(
        contact_data,
        outbound,
        &url,
        POSTGREST_SINGLE_JSON,
        None,
        None,
    )
    .await
    else {
        return changelog_error_response(500);
    };

    if !(200..300).contains(&response.status) {
        return changelog_error_response(if is_postgrest_single_not_found(&response) {
            404
        } else {
            500
        });
    }

    match response.json::<Value>() {
        Ok(body) => no_store_response(json_response(200, body)),
        Err(_) => changelog_error_response(500),
    }
}

async fn changelog_slug_response(
    contact_data: &contact::ContactDataConfig,
    slug: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !contact_data.configured() {
        return changelog_error_response(500);
    }

    let Some(url) = contact_data.rest_url(
        CHANGELOG_ENTRIES_TABLE,
        &[
            ("select", "*".to_owned()),
            ("slug", format!("eq.{slug}")),
            ("is_published", "eq.true".to_owned()),
            ("published_at", "not.is.null".to_owned()),
        ],
    ) else {
        return changelog_error_response(500);
    };
    let Ok(response) = send_changelog_get(
        contact_data,
        outbound,
        &url,
        POSTGREST_SINGLE_JSON,
        None,
        None,
    )
    .await
    else {
        return changelog_error_response(500);
    };

    if !(200..300).contains(&response.status) {
        return changelog_error_response(if is_postgrest_single_not_found(&response) {
            404
        } else {
            500
        });
    }

    match response.json::<Value>() {
        Ok(body) => no_store_response(json_response(200, body)),
        Err(_) => changelog_error_response(500),
    }
}

async fn request_has_changelog_admin_access(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> bool {
    let Some(access_token) = request_access_token(request) else {
        return false;
    };
    let Some(user_id) = fetch_supabase_user_id(contact_data, &access_token, outbound).await else {
        return false;
    };

    has_manage_changelog_permission(contact_data, &user_id, outbound).await
}

async fn fetch_supabase_user_id(
    contact_data: &contact::ContactDataConfig,
    access_token: &str,
    outbound: &impl OutboundHttpClient,
) -> Option<String> {
    let user_url = contact_data.auth_url(SUPABASE_AUTH_USER_PATH)?;
    let service_role_key = contact_data.service_role_key()?;
    let authorization = format!("Bearer {access_token}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &user_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .ok()?;

    if !(200..300).contains(&response.status) {
        return None;
    }

    response
        .json::<SupabaseUserResponse>()
        .ok()
        .and_then(|user| user.id)
        .filter(|id| !id.trim().is_empty())
}

async fn has_manage_changelog_permission(
    contact_data: &contact::ContactDataConfig,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> bool {
    let Some(rpc_url) = contact_data.rpc_url(HAS_WORKSPACE_PERMISSION_RPC) else {
        return false;
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return false;
    };
    let Ok(body) = serde_json::to_string(&HasWorkspacePermissionRequest {
        p_permission: MANAGE_CHANGELOG_PERMISSION,
        p_user_id: user_id,
        p_ws_id: ROOT_WORKSPACE_ID,
    }) else {
        return false;
    };
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await;

    let Ok(response) = response else {
        return false;
    };

    if !(200..300).contains(&response.status) {
        return false;
    }

    response.json::<bool>().unwrap_or(false)
}

async fn send_changelog_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    accept: &str,
    range: Option<&str>,
    prefer: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", accept)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if let Some(range) = range {
        request = request
            .with_header("Range-Unit", "items")
            .with_header("Range", range);
    }

    if let Some(prefer) = prefer {
        request = request.with_header("Prefer", prefer);
    }

    outbound.send(request).await.map_err(|_| ())
}

fn changelog_route(path: &str) -> Option<ChangelogRoute<'_>> {
    if path == CHANGELOG_LIST_PATH {
        return Some(ChangelogRoute::List);
    }

    if let Some(slug) = path.strip_prefix(CHANGELOG_SLUG_PATH_PREFIX)
        && !slug.is_empty()
        && !slug.contains('/')
    {
        return Some(ChangelogRoute::Slug { slug });
    }

    let id = path.strip_prefix(CHANGELOG_DETAIL_PATH_PREFIX)?;

    if id.is_empty() || id.contains('/') || id == "slug" || id == "upload" {
        return None;
    }

    Some(ChangelogRoute::Detail { id })
}

fn changelog_list_query_from_url(request_url: Option<&str>) -> ChangelogListQuery {
    let mut query = ChangelogListQuery {
        category: None,
        page: Some(1),
        page_size: Some(20),
        published: None,
    };
    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return query;
    };

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "category" if query.category.is_none() && !value.is_empty() => {
                query.category = Some(value.into_owned());
            }
            "page" => query.page = parse_js_parse_int_prefix(&value),
            "pageSize" => query.page_size = parse_js_parse_int_prefix(&value),
            "published" if value == "true" => query.published = Some(true),
            "published" if value == "false" => query.published = Some(false),
            _ => {}
        }
    }

    query
}

fn changelog_range(query: &ChangelogListQuery) -> String {
    let (Some(page), Some(page_size)) = (query.page, query.page_size) else {
        return "NaN-NaN".to_owned();
    };
    let page = i128::from(page);
    let page_size = i128::from(page_size);
    let start = (page - 1) * page_size;
    let end = start + page_size - 1;

    format!("{start}-{end}")
}

fn changelog_total_pages(total: usize, page_size: Option<i64>) -> Option<i64> {
    let page_size = page_size?;

    if page_size == 0 {
        return None;
    }

    let total = i128::try_from(total).ok()?;
    let page_size = i128::from(page_size);
    let total_pages = if page_size > 0 {
        (total + page_size - 1) / page_size
    } else {
        total / page_size
    };

    i64::try_from(total_pages).ok()
}

fn parse_js_parse_int_prefix(value: &str) -> Option<i64> {
    let trimmed = value.trim_start();
    let mut chars = trimmed.char_indices().peekable();
    let mut sign = 1_i64;

    if let Some((_, first)) = chars.peek().copied() {
        match first {
            '-' => {
                sign = -1;
                chars.next();
            }
            '+' => {
                chars.next();
            }
            _ => {}
        }
    }

    let mut digits = String::new();
    while let Some((_, character)) = chars.peek().copied() {
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

fn public_changelog_filters() -> Vec<(&'static str, String)> {
    vec![
        ("is_published", "eq.true".to_owned()),
        ("published_at", "not.is.null".to_owned()),
    ]
}

fn request_access_token(request: BackendRequest<'_>) -> Option<String> {
    request
        .cookie
        .and_then(supabase_access_token_from_cookie_header)
}

fn supabase_access_token_from_cookie_header(cookie_header: &str) -> Option<String> {
    let groups = supabase_auth_cookie_groups(cookie_header);

    groups
        .values()
        .filter_map(supabase_auth_cookie_value)
        .find_map(|value| access_token_from_supabase_cookie_value(&value))
}

fn supabase_auth_cookie_groups(cookie_header: &str) -> BTreeMap<String, SupabaseAuthCookieGroup> {
    let mut groups = BTreeMap::<String, SupabaseAuthCookieGroup>::new();

    for (name, value) in cookie_header
        .split(';')
        .filter_map(|cookie| cookie.trim().split_once('='))
    {
        let Some((storage_key, chunk_index)) = supabase_auth_cookie_name_parts(name.trim()) else {
            continue;
        };
        let group = groups.entry(storage_key).or_default();

        match chunk_index {
            Some(index) => {
                if group
                    .chunks
                    .insert(index, value.trim().to_owned())
                    .is_some()
                {
                    group.duplicate = true;
                }
            }
            None => {
                if group.base.is_some() {
                    group.duplicate = true;
                }
                group.base = Some(value.trim().to_owned());
            }
        }
    }

    groups
}

fn supabase_auth_cookie_name_parts(name: &str) -> Option<(String, Option<usize>)> {
    if !name.starts_with("sb-") {
        return None;
    }

    if name.ends_with("-auth-token") {
        return Some((name.to_owned(), None));
    }

    let (storage_key, suffix) = name.rsplit_once('.')?;

    if !storage_key.ends_with("-auth-token") {
        return None;
    }

    suffix
        .parse::<usize>()
        .ok()
        .map(|index| (storage_key.to_owned(), Some(index)))
}

fn supabase_auth_cookie_value(group: &SupabaseAuthCookieGroup) -> Option<String> {
    if group.duplicate {
        return None;
    }

    match (&group.base, group.chunks.is_empty()) {
        (Some(base), true) => return Some(base.clone()),
        (Some(_), false) => return None,
        (None, true) => return None,
        (None, false) => {}
    }

    let mut value = String::new();
    for index in 0..group.chunks.len() {
        value.push_str(group.chunks.get(&index)?);
    }

    Some(value)
}

fn access_token_from_supabase_cookie_value(cookie_value: &str) -> Option<String> {
    let session =
        if let Some(base64_body) = cookie_value.strip_prefix(SUPABASE_AUTH_COOKIE_BASE64_PREFIX) {
            let mut padded = base64_body.to_owned();
            while padded.len() % 4 != 0 {
                padded.push('=');
            }
            let decoded = URL_SAFE.decode(padded.as_bytes()).ok()?;
            serde_json::from_slice::<SupabaseCookieSession>(&decoded).ok()?
        } else if cookie_value.starts_with('{') {
            serde_json::from_str::<SupabaseCookieSession>(cookie_value).ok()?
        } else {
            return None;
        };

    session
        .access_token
        .filter(|token| !token.trim().is_empty())
}

fn total_count_from_content_range(response: &OutboundResponse) -> Option<usize> {
    let header = response.header("content-range")?;
    let (_, total) = header.rsplit_once('/')?;

    total.parse::<usize>().ok()
}

fn is_postgrest_single_not_found(response: &crate::outbound::OutboundResponse) -> bool {
    response
        .json::<PostgrestError>()
        .ok()
        .and_then(|error| error.code)
        .as_deref()
        == Some(POSTGREST_SINGULAR_RESPONSE_ERROR_CODE)
}

fn changelog_list_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "message": CHANGELOG_LIST_ERROR_MESSAGE,
        }),
    ))
}

fn changelog_error_response(status: u16) -> BackendResponse {
    no_store_response(json_response(
        status,
        json!({
            "message": CHANGELOG_ENTRY_NOT_FOUND_MESSAGE,
        }),
    ))
}
