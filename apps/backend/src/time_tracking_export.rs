use serde::Serialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const TIME_TRACKING_EXPORT_PATH: &str = "/api/time-tracking/export";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const ROOT_EMAIL_SUFFIX: &str = "@tuturuuu.com";
const GET_GROUPED_SESSIONS_PAGINATED_RPC: &str = "get_grouped_sessions_paginated";
// The legacy helper uses dayjs.tz.guess(); on the edge runtime there is no
// reliable local timezone, so we fall back to UTC for grouping.
const DEFAULT_TIMEZONE: &str = "UTC";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace membership";
const WORKSPACE_ACCESS_DENIED_MESSAGE: &str = "Workspace access denied";

#[derive(Serialize)]
struct GroupedSessionsRpcRequest<'a> {
    p_ws_id: &'a str,
    p_period: &'a str,
    p_page: i64,
    p_limit: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_search: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_start_date: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_end_date: Option<&'a str>,
    p_timezone: &'a str,
}

#[derive(serde::Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

struct ExportQuery {
    ws_id: String,
    period: String,
    page: i64,
    limit: i64,
    search: String,
    start_date: String,
    end_date: String,
}

pub(crate) async fn handle_time_tracking_export_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != TIME_TRACKING_EXPORT_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => export_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn export_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Authentication.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) = user.id.as_deref().filter(|id| !id.trim().is_empty()) else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };

    // Root user gating: email must end with "@tuturuuu.com".
    let is_root_user = user
        .email
        .as_deref()
        .is_some_and(|email| email.ends_with(ROOT_EMAIL_SUFFIX));
    if !is_root_user {
        return error_response(403, FORBIDDEN_MESSAGE);
    }

    // Parse query parameters.
    let query = export_query_from_url(request.url);

    // Workspace must be the root workspace.
    if query.ws_id != ROOT_WORKSPACE_ID {
        return error_response(403, FORBIDDEN_MESSAGE);
    }

    // Validate workspace membership.
    match verify_workspace_member(&config.contact_data, outbound, &query.ws_id, user_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(403, WORKSPACE_ACCESS_DENIED_MESSAGE),
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    // Fetch paginated grouped sessions through the database RPC.
    match fetch_grouped_sessions(&config.contact_data, outbound, &access_token, &query).await {
        Ok(result) => no_store_response(json_response(200, result)),
        // The legacy route falls back to a complex JS grouping implementation on
        // RPC failure that ultimately returns an empty result set when it cannot
        // recover. We approximate that terminal behavior with an empty payload.
        Err(()) => no_store_response(json_response(200, empty_result(&query))),
    }
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
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        .is_some())
}

async fn fetch_grouped_sessions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
    query: &ExportQuery,
) -> Result<Value, ()> {
    let rpc_url = contact_data
        .rpc_url(GET_GROUPED_SESSIONS_PAGINATED_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");

    let search = query
        .search
        .is_empty()
        .then_some(())
        .map_or(Some(query.search.as_str()), |()| None);
    let start_date = (!query.start_date.is_empty()).then_some(query.start_date.as_str());
    let end_date = (!query.end_date.is_empty()).then_some(query.end_date.as_str());

    let body = serde_json::to_string(&GroupedSessionsRpcRequest {
        p_ws_id: &query.ws_id,
        p_period: &query.period,
        p_page: query.page,
        p_limit: query.limit,
        p_search: search,
        p_start_date: start_date,
        p_end_date: end_date,
        p_timezone: DEFAULT_TIMEZONE,
    })
    .map_err(|_| ())?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rpc_result = response.json::<Value>().map_err(|_| ())?;

    // The RPC returns a JSON object with `data` and `pagination`. The legacy
    // route re-shapes it into `{ data, pagination }`; we forward those fields
    // directly and fall back to an empty result if either is missing.
    let data = rpc_result.get("data").cloned().unwrap_or_else(|| json!([]));
    let pagination = rpc_result
        .get("pagination")
        .cloned()
        .unwrap_or_else(|| pagination_value(query.page, query.limit, 0, 0));

    Ok(json!({
        "data": data,
        "pagination": pagination,
    }))
}

fn empty_result(query: &ExportQuery) -> Value {
    json!({
        "data": [],
        "pagination": pagination_value(query.page, query.limit, 0, 0),
    })
}

fn pagination_value(page: i64, limit: i64, total: i64, pages: i64) -> Value {
    json!({
        "page": page,
        "limit": limit,
        "total": total,
        "pages": pages,
    })
}

fn export_query_from_url(request_url: Option<&str>) -> ExportQuery {
    let mut query = ExportQuery {
        ws_id: ROOT_WORKSPACE_ID.to_owned(),
        period: "day".to_owned(),
        page: 1,
        limit: 100,
        search: String::new(),
        start_date: String::new(),
        end_date: String::new(),
    };

    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return query;
    };

    let mut saw_ws_id = false;
    let mut saw_period = false;
    let mut saw_page = false;
    let mut saw_limit = false;
    let mut saw_search = false;
    let mut saw_start_date = false;
    let mut saw_end_date = false;

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            // `searchParams.get(...) || DEFAULT`: empty values fall back to the
            // default, mirroring the JS `||` behavior.
            "wsId" if !saw_ws_id => {
                saw_ws_id = true;
                if !value.is_empty() {
                    query.ws_id = value.into_owned();
                }
            }
            "period" if !saw_period => {
                saw_period = true;
                if !value.is_empty() {
                    query.period = value.into_owned();
                }
            }
            "page" if !saw_page => {
                saw_page = true;
                // parseInt(value || '1', 10); empty string -> '1'.
                query.page = parse_js_parse_int(&value).unwrap_or(1);
            }
            "limit" if !saw_limit => {
                saw_limit = true;
                // parseInt(value || '100', 10) then Math.min(limit, 1000).
                let parsed = parse_js_parse_int(&value).unwrap_or(100);
                query.limit = parsed.min(1000);
            }
            "search" if !saw_search => {
                saw_search = true;
                query.search = value.into_owned();
            }
            "startDate" if !saw_start_date => {
                saw_start_date = true;
                query.start_date = value.into_owned();
            }
            "endDate" if !saw_end_date => {
                saw_end_date = true;
                query.end_date = value.into_owned();
            }
            _ => {}
        }
    }

    query
}

fn parse_js_parse_int(value: &str) -> Option<i64> {
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

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
