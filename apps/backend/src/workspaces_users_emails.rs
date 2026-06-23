use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const DEFAULT_PAGE: i64 = 0;
const DEFAULT_PAGE_SIZE: i64 = 10;
const FETCH_ERROR_MESSAGE: &str = "Error fetching sent emails";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const SENT_EMAILS_TABLE: &str = "sent_emails";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

pub(crate) async fn handle_workspaces_users_emails_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let segments = workspaces_users_emails_segments(request.path)?;

    Some(match request.method {
        "GET" => {
            workspaces_users_emails_response(
                config,
                request,
                segments.ws_id,
                segments.user_id,
                outbound,
            )
            .await
        }
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

struct RouteSegments<'a> {
    ws_id: &'a str,
    user_id: &'a str,
}

/// Matches `/api/v1/workspaces/{wsId}/users/{userId}/emails` and extracts the
/// two dynamic segments. Returns `None` for any other shape so the dispatcher
/// can fall through to the remaining handlers.
fn workspaces_users_emails_segments(path: &str) -> Option<RouteSegments<'_>> {
    let trimmed = path.trim_matches('/');
    let segments: Vec<&str> = trimmed.split('/').collect();

    if segments.len() != 7
        || segments[0] != "api"
        || segments[1] != "v1"
        || segments[2] != "workspaces"
        || segments[4] != "users"
        || segments[6] != "emails"
    {
        return None;
    }

    let ws_id = segments[3];
    let user_id = segments[5];

    if ws_id.is_empty() || user_id.is_empty() {
        return None;
    }

    Some(RouteSegments { ws_id, user_id })
}

async fn workspaces_users_emails_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return message_response(500, FETCH_ERROR_MESSAGE);
    }

    // `getPermissions` returns `null` for any auth/membership failure, which the
    // legacy route maps to a 401 Unauthorized.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(auth_user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    let Ok(resolved_ws_id) = normalize_workspace_id(
        contact_data,
        outbound,
        raw_ws_id,
        &auth_user_id,
        &access_token,
    )
    .await
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    // `getPermissions` requires membership of ANY type (MEMBER or GUEST).
    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &auth_user_id).await {
        Ok(true) => {}
        Ok(false) | Err(()) => return message_response(401, UNAUTHORIZED_MESSAGE),
    }

    let (page, page_size) = pagination_from_url(request.url);
    let start = page.saturating_mul(page_size);
    let end = start + page_size - 1;

    // The legacy route filters `sent_emails` by the RAW `wsId` path segment
    // (not the resolved workspace id), so we mirror that exactly.
    let Some(url) = contact_data.rest_url(
        SENT_EMAILS_TABLE,
        &[
            ("select", "*".to_owned()),
            ("ws_id", format!("eq.{raw_ws_id}")),
            ("receiver_id", format!("eq.{user_id}")),
            ("order", "created_at.desc".to_owned()),
        ],
    ) else {
        return message_response(500, FETCH_ERROR_MESSAGE);
    };

    let range = format!("{start}-{end}");
    let Ok(response) = send_service_role_get(
        contact_data,
        outbound,
        &url,
        Some(&range),
        Some("count=exact"),
    )
    .await
    else {
        return message_response(500, FETCH_ERROR_MESSAGE);
    };

    if !(200..300).contains(&response.status) {
        return message_response(500, FETCH_ERROR_MESSAGE);
    }

    let data = response.json::<Value>().unwrap_or_else(|_| json!([]));
    let count = total_count_from_content_range(&response).unwrap_or(0);

    no_store_response(json_response(
        200,
        json!({
            "data": data,
            "count": count,
        }),
    ))
}

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

    if !is_workspace_uuid_literal(&resolved_ws_id) {
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
    let response = send_caller_get(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
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
    let response = send_caller_get(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
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
    let response = send_service_role_get(contact_data, outbound, &url, None, None).await?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn verify_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url, None, None).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // `getPermissions` uses `requiredType: 'ANY'`, so any membership row counts
    // (MEMBER or GUEST).
    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .map(|row| row.membership_type.is_some())
        .unwrap_or(false))
}

async fn send_caller_get(
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

async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    range: Option<&str>,
    prefer: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
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

fn pagination_from_url(request_url: Option<&str>) -> (i64, i64) {
    let mut page = DEFAULT_PAGE;
    let mut page_size = DEFAULT_PAGE_SIZE;

    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return (page, page_size);
    };

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            // Mirror JavaScript `parseInt(x || '0', 10)` / `'10'` defaults: a
            // non-numeric value parses to `NaN`, which the legacy arithmetic
            // turns into `NaN` ranges. We fall back to the defaults instead,
            // since PostgREST cannot consume a NaN range.
            "page" => page = parse_int_prefix(&value).unwrap_or(DEFAULT_PAGE),
            "pageSize" => page_size = parse_int_prefix(&value).unwrap_or(DEFAULT_PAGE_SIZE),
            _ => {}
        }
    }

    (page, page_size)
}

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

fn total_count_from_content_range(response: &OutboundResponse) -> Option<usize> {
    let header = response.header("content-range")?;
    let (_, total) = header.rsplit_once('/')?;

    total.parse::<usize>().ok()
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
        || is_workspace_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

fn is_workspace_uuid_literal(value: &str) -> bool {
    value.trim().len() == 36
        && value
            .trim()
            .chars()
            .enumerate()
            .all(|(index, value)| match index {
                8 | 13 | 18 | 23 => value == '-',
                _ => value.is_ascii_hexdigit(),
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

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
