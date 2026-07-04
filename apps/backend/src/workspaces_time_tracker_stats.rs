use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const WORKSPACE_TIME_TRACKER_STATS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACE_TIME_TRACKER_STATS_PATH_SUFFIX: &str = "/time-tracker/stats";

const GET_TIME_TRACKER_STATS_RPC: &str = "get_time_tracker_stats";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

// Mirror of `@tuturuuu/utils/constants` values used by the legacy zod schema.
const MAX_SHORT_TEXT_LENGTH: usize = 255;
const MAX_COLOR_LENGTH: usize = 50;

const DEFAULT_TIMEZONE: &str = "UTC";
const DEFAULT_DAYS_BACK: i64 = 365;

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace membership";
const ACCESS_DENIED_MESSAGE: &str = "Workspace access denied";
const STATS_FETCH_FAILED_MESSAGE: &str = "Failed to fetch time tracking stats";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

#[derive(Debug, Eq, PartialEq)]
struct TimeTrackerStatsQuery {
    user_id: String,
    is_personal: bool,
    timezone: String,
    summary_only: bool,
    days_back: i64,
}

#[derive(Serialize)]
struct TimeTrackerStatsRpcRequest<'a> {
    p_user_id: &'a str,
    p_ws_id: &'a str,
    p_is_personal: bool,
    p_timezone: &'a str,
    p_days_back: i64,
}

// File-local copy of the workspace-id resolution row used by
// `workspace_habits_access::WorkspaceIdRow`; per the one-file constraint it is
// duplicated here rather than shared.
#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

// RPC row shape (snake_case as returned by `get_time_tracker_stats`). Only rows
// matching this shape are treated as valid; anything else falls back to zeros.
#[derive(Deserialize)]
struct TimeTrackerStatsRow {
    today_time: f64,
    week_time: f64,
    month_time: f64,
    streak: f64,
    daily_activity: Value,
}

pub(crate) async fn handle_workspaces_time_tracker_stats_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = time_tracker_stats_ws_id(request.path)?;

    Some(match request.method {
        "GET" => time_tracker_stats_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn time_tracker_stats_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let query = match time_tracker_stats_query_from_url(request.url) {
        Some(query) => query,
        None => return invalid_query_response(),
    };

    // Authentication: resolve the caller's Supabase user from the session token.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return unauthorized_response();
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return unauthorized_response();
    };

    // The legacy route requires the authenticated user to match the query userId.
    if user_id != query.user_id {
        return unauthorized_response();
    }

    let resolved_ws_id = match normalize_workspace_id(
        &config.contact_data,
        outbound,
        raw_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(ws_id) => ws_id,
        Err(()) => return membership_lookup_failed_response(),
    };

    match verify_workspace_membership(&config.contact_data, outbound, &resolved_ws_id, &user_id)
        .await
    {
        Ok(true) => {}
        Ok(false) => return access_denied_response(),
        Err(()) => return membership_lookup_failed_response(),
    }

    let p_days_back = if query.summary_only {
        0
    } else {
        query.days_back
    };

    match fetch_time_tracker_stats(
        &config.contact_data,
        outbound,
        &resolved_ws_id,
        &query,
        p_days_back,
    )
    .await
    {
        Ok(Some(stats)) => no_store_response(json_response(
            200,
            json!({
                "todayTime": stats.today_time,
                "weekTime": stats.week_time,
                "monthTime": stats.month_time,
                "streak": stats.streak,
                "dailyActivity": stats.daily_activity,
            }),
        )),
        // RPC returned no row or an unparseable row: legacy responds 200 zeros.
        Ok(None) => no_store_response(json_response(200, empty_stats_payload())),
        Err(()) => stats_fetch_failed_response(),
    }
}

async fn fetch_time_tracker_stats(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &TimeTrackerStatsQuery,
    p_days_back: i64,
) -> Result<Option<TimeTrackerStatsRow>, ()> {
    let rpc_url = contact_data.rpc_url(GET_TIME_TRACKER_STATS_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&TimeTrackerStatsRpcRequest {
        p_user_id: &query.user_id,
        p_ws_id: ws_id,
        p_is_personal: query.is_personal,
        p_timezone: &query.timezone,
        p_days_back,
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

    // The RPC returns an array of rows; legacy reads `data?.[0]`.
    let rows = response
        .json::<Vec<TimeTrackerStatsRow>>()
        .map_err(|_| ())?;
    Ok(rows.into_iter().next())
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
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

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
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

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
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

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

// Legacy `verifyWorkspaceMembershipType` treats ANY membership row as access
// (it does not require MEMBER), so a present row of any type is sufficient.
async fn verify_workspace_membership(
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
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(!response.json::<Vec<Value>>().map_err(|_| ())?.is_empty())
}

async fn send_caller_rest_request(
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

async fn send_service_role_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
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

fn time_tracker_stats_query_from_url(request_url: Option<&str>) -> Option<TimeTrackerStatsQuery> {
    let url = request_url.and_then(|request_url| url::Url::parse(request_url).ok())?;
    let mut user_id: Option<String> = None;
    let mut is_personal: Option<bool> = None;
    let mut timezone: Option<String> = None;
    let mut summary_only: Option<bool> = None;
    let mut days_back: Option<i64> = None;

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "userId" if user_id.is_none() => user_id = Some(value.into_owned()),
            "isPersonal" if is_personal.is_none() => {
                is_personal = match value.as_ref() {
                    "true" => Some(true),
                    "false" => Some(false),
                    _ => return None,
                };
            }
            "timezone" if timezone.is_none() => {
                let value = value.into_owned();
                if value.len() > MAX_SHORT_TEXT_LENGTH {
                    return None;
                }
                timezone = Some(value);
            }
            "summaryOnly" if summary_only.is_none() => {
                summary_only = match value.as_ref() {
                    "true" => Some(true),
                    "false" => Some(false),
                    _ => return None,
                };
            }
            "daysBack" if days_back.is_none() => {
                let value = value.into_owned();
                if value.is_empty() || !value.chars().all(|c| c.is_ascii_digit()) {
                    return None;
                }
                days_back = Some(value.parse::<i64>().map_err(|_| ()).ok()?);
            }
            _ => {}
        }
    }

    // `userId` and `isPersonal` are required by the legacy zod schema.
    let user_id = user_id?;
    if user_id.trim().is_empty() {
        return None;
    }
    let is_personal = is_personal?;

    Some(TimeTrackerStatsQuery {
        user_id,
        is_personal,
        timezone: timezone.unwrap_or_else(|| DEFAULT_TIMEZONE.to_owned()),
        summary_only: summary_only.unwrap_or(false),
        days_back: days_back.unwrap_or(DEFAULT_DAYS_BACK),
    })
}

fn time_tracker_stats_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACE_TIME_TRACKER_STATS_PATH_PREFIX)?
        .strip_suffix(WORKSPACE_TIME_TRACKER_STATS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
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

fn empty_stats_payload() -> Value {
    json!({
        "todayTime": 0,
        "weekTime": 0,
        "monthTime": 0,
        "streak": 0,
        "dailyActivity": [],
    })
}

fn invalid_query_response() -> BackendResponse {
    // Legacy includes `issues` from zod; the Worker handler cannot reproduce the
    // exact zod issue payload, so it returns an empty `issues` array.
    no_store_response(json_response(
        400,
        json!({ "error": INVALID_QUERY_MESSAGE, "issues": [] }),
    ))
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(401, json!({ "error": UNAUTHORIZED_MESSAGE })))
}

fn membership_lookup_failed_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "error": MEMBERSHIP_LOOKUP_FAILED_MESSAGE }),
    ))
}

fn access_denied_response() -> BackendResponse {
    no_store_response(json_response(
        403,
        json!({ "error": ACCESS_DENIED_MESSAGE }),
    ))
}

fn stats_fetch_failed_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "error": STATS_FETCH_FAILED_MESSAGE }),
    ))
}

#[allow(dead_code)]
fn internal_server_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "error": INTERNAL_SERVER_ERROR_MESSAGE }),
    ))
}

#[allow(dead_code)]
const MAX_COLOR_LENGTH_REF: usize = MAX_COLOR_LENGTH;
