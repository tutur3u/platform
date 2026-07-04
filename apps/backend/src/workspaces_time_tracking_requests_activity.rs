use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PRIVATE_SCHEMA: &str = "private";

// Mirrors MAX_SHORT_TEXT_LENGTH from @tuturuuu/utils/constants, the legacy
// upper bound for the `limit` pagination parameter.
const MAX_SHORT_TEXT_LENGTH: u64 = 200;
const DEFAULT_PAGE: u64 = 1;
const DEFAULT_LIMIT: u64 = 5;

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const REQUEST_NOT_FOUND_MESSAGE: &str = "Request not found";
const INVALID_PAGINATION_MESSAGE: &str = "Invalid pagination parameters";
const COUNT_FAILED_MESSAGE: &str = "Failed to count activity";
const FETCH_FAILED_MESSAGE: &str = "Failed to fetch activity log";

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct TimeTrackingRequestIdRow {
    #[allow(dead_code)]
    id: Option<String>,
}

struct PaginationParams {
    page: u64,
    limit: u64,
}

pub(crate) async fn handle_workspaces_time_tracking_requests_activity_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (ws_id, request_id) = workspaces_time_tracking_requests_activity_ids(request.path)?;

    Some(match request.method {
        "GET" => activity_response(config, request, ws_id, request_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn activity_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    request_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Authenticate the caller. The legacy route allows app-session auth.
    let Some(access_token) = supabase_auth::request_access_token_allowing_app_sessions(request)
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };

    // Verify the caller is a MEMBER of the workspace.
    match verify_workspace_member(contact_data, outbound, ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(403, FORBIDDEN_MESSAGE),
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    // Verify the request belongs to this workspace.
    match request_belongs_to_workspace(contact_data, outbound, ws_id, request_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(404, REQUEST_NOT_FOUND_MESSAGE),
        // Legacy treats any lookup failure (error OR no row) as 404.
        Err(()) => return error_response(404, REQUEST_NOT_FOUND_MESSAGE),
    }

    // Parse pagination parameters.
    let Some(PaginationParams { page, limit }) = parse_pagination(request.url) else {
        return error_response(400, INVALID_PAGINATION_MESSAGE);
    };
    let offset = (page - 1) * limit;

    // Get total count via a head request with count=exact.
    let total = match activity_count(contact_data, outbound, request_id).await {
        Ok(total) => total,
        Err(()) => return error_response(500, COUNT_FAILED_MESSAGE),
    };

    // Fetch the activity log page.
    let activities = match activity_page(
        contact_data,
        outbound,
        request_id,
        offset,
        offset + limit - 1,
    )
    .await
    {
        Ok(activities) => activities,
        Err(()) => return error_response(500, FETCH_FAILED_MESSAGE),
    };

    no_store_response(json_response(
        200,
        json!({
            "data": activities,
            "total": total,
            "page": page,
            "limit": limit,
        }),
    ))
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
    let response = send_service_role_get(contact_data, outbound, &url, false).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        == Some("MEMBER"))
}

async fn request_belongs_to_workspace(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    request_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "time_tracking_requests",
        &[
            ("select", "id".to_owned()),
            ("id", format!("eq.{request_id}")),
            ("workspace_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    // private schema table -> Accept-Profile: private.
    let response = send_service_role_get(contact_data, outbound, &url, true).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(!response
        .json::<Vec<TimeTrackingRequestIdRow>>()
        .map_err(|_| ())?
        .is_empty())
}

async fn activity_count(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    request_id: &str,
) -> Result<u64, ()> {
    let Some(url) = contact_data.rest_url(
        "time_tracking_request_activity_with_users",
        &[
            ("select", "*".to_owned()),
            ("request_id", format!("eq.{request_id}")),
        ],
    ) else {
        return Err(());
    };

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    // The outbound client only models GET; PostgREST still returns the exact
    // count in the Content-Range header when count=exact is requested. We cap
    // the body to a single row so we never materialize the full result set.
    let request = OutboundRequest::new(OutboundMethod::Get, &url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Accept-Profile", PRIVATE_SCHEMA)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key)
        .with_header("Range-Unit", "items")
        .with_header("Range", "0-0")
        .with_header("Prefer", "count=exact");

    let response = outbound.send(request).await.map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(total_count_from_content_range(&response).unwrap_or(0))
}

async fn activity_page(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    request_id: &str,
    range_start: u64,
    range_end: u64,
) -> Result<Value, ()> {
    let Some(url) = contact_data.rest_url(
        "time_tracking_request_activity_with_users",
        &[
            ("select", "*".to_owned()),
            ("request_id", format!("eq.{request_id}")),
            ("order", "created_at.desc".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let range = format!("{range_start}-{range_end}");
    let request = OutboundRequest::new(OutboundMethod::Get, &url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Accept-Profile", PRIVATE_SCHEMA)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key)
        .with_header("Range-Unit", "items")
        .with_header("Range", &range);

    let response = outbound.send(request).await.map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Value>().map_err(|_| ())
}

async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    private_schema: bool,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if private_schema {
        request = request.with_header("Accept-Profile", PRIVATE_SCHEMA);
    }

    outbound.send(request).await.map_err(|_| ())
}

fn parse_pagination(request_url: Option<&str>) -> Option<PaginationParams> {
    let url = request_url.and_then(|url| url::Url::parse(url).ok());
    let page_param = query_value(url.as_ref(), "page");
    let limit_param = query_value(url.as_ref(), "limit");

    let page = parse_positive_coerced(page_param.as_deref(), DEFAULT_PAGE)?;
    let limit = parse_positive_coerced(limit_param.as_deref(), DEFAULT_LIMIT)?;

    if limit > MAX_SHORT_TEXT_LENGTH {
        return None;
    }

    Some(PaginationParams { page, limit })
}

// Mirrors zod `z.coerce.number().int().positive()`. Missing param falls back to
// the default; a present-but-invalid (non-positive / non-integer / NaN) param
// fails the schema (returns None -> 400).
fn parse_positive_coerced(value: Option<&str>, fallback: u64) -> Option<u64> {
    let Some(raw) = value else {
        return Some(fallback);
    };

    // z.coerce.number() on an empty string coerces to 0, which fails positive().
    let parsed = raw.trim().parse::<f64>().ok()?;
    if !parsed.is_finite() || parsed.fract() != 0.0 || parsed < 1.0 {
        return None;
    }

    Some(parsed as u64)
}

fn query_value(url: Option<&url::Url>, key: &str) -> Option<String> {
    url?.query_pairs()
        .find_map(|(name, value)| (name == key).then(|| value.into_owned()))
}

fn total_count_from_content_range(response: &OutboundResponse) -> Option<u64> {
    let header = response.header("content-range")?;
    let (_, total) = header.rsplit_once('/')?;

    total.parse::<u64>().ok()
}

fn workspaces_time_tracking_requests_activity_ids(path: &str) -> Option<(&str, &str)> {
    // /api/v1/workspaces/:wsId/time-tracking/requests/:id/activity
    let mut segments = path.trim_start_matches('/').split('/');

    if segments.next()? != "api" {
        return None;
    }
    if segments.next()? != "v1" {
        return None;
    }
    if segments.next()? != "workspaces" {
        return None;
    }
    let ws_id = segments.next()?;
    if segments.next()? != "time-tracking" {
        return None;
    }
    if segments.next()? != "requests" {
        return None;
    }
    let request_id = segments.next()?;
    if segments.next()? != "activity" {
        return None;
    }
    if segments.next().is_some() {
        return None;
    }

    if ws_id.is_empty() || request_id.is_empty() {
        return None;
    }

    Some((ws_id, request_id))
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
