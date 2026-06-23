use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const WORKSPACE_NOT_FOUND_MESSAGE: &str = "Workspace not found";
const WORKSPACE_FETCH_ERROR_MESSAGE: &str = "Error fetching workspace";
const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/posts/bootstrap";

#[derive(Serialize)]
struct DefaultDateRange {
    start: String,
    end: String,
}

#[derive(Serialize)]
struct BootstrapResponse {
    #[serde(rename = "wsId")]
    ws_id: String,
    #[serde(rename = "defaultDateRange")]
    default_date_range: DefaultDateRange,
}

#[derive(Deserialize)]
struct WorkspaceRow {
    id: Option<String>,
    timezone: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

pub(crate) async fn handle_workspaces_posts_bootstrap_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = bootstrap_ws_id(request.path)?;

    Some(match request.method {
        "GET" => bootstrap_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn bootstrap_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    // Mirror normalizeWorkspaceId: resolve aliases (`personal`, `internal`) to a
    // concrete workspace id before fetching the workspace row.
    let resolved_ws_id = match normalize_workspace_id(
        &config.contact_data,
        outbound,
        raw_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(Some(ws_id)) => ws_id,
        // A failed alias resolution maps to the legacy `catch` branch (404).
        Ok(None) => return message_response(404, WORKSPACE_NOT_FOUND_MESSAGE),
        Err(()) => return message_response(404, WORKSPACE_NOT_FOUND_MESSAGE),
    };

    // Fetch the workspace row with the caller's token so RLS enforces the
    // `workspace_members!inner(user_id)` membership filter from the legacy query.
    match fetch_workspace_row(
        &config.contact_data,
        outbound,
        &resolved_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(Some(row)) => {
            let ws_id = row.id.unwrap_or(resolved_ws_id);
            let default_date_range = build_default_posts_date_range(row.timezone.as_deref());
            no_store_response(json_response(
                200,
                BootstrapResponse {
                    ws_id,
                    default_date_range,
                },
            ))
        }
        Ok(None) => message_response(404, WORKSPACE_NOT_FOUND_MESSAGE),
        Err(()) => message_response(500, WORKSPACE_FETCH_ERROR_MESSAGE),
    }
}

/// Fetches `id, timezone` from `workspaces` for the resolved workspace id,
/// joined against the caller's membership so RLS rejects non-members (matching
/// `workspace_members!inner(user_id)` + `eq(workspace_members.user_id, user.id)`).
async fn fetch_workspace_row(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Option<WorkspaceRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id,timezone,workspace_members!inner(user_id)".to_owned(),
            ),
            ("id", format!("eq.{ws_id}")),
            ("workspace_members.user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let trimmed = raw_ws_id.trim();

    if trimmed.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
    }

    if trimmed.eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG) {
        return personal_workspace_id(contact_data, outbound, user_id, access_token)
            .await
            .map(Some);
    }

    Ok(Some(raw_ws_id.to_owned()))
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

fn bootstrap_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

/// Replicates `buildDefaultPostsDateRange`: a 30-day range ending at the start
/// of "tomorrow" (exclusive).
///
/// NOTE: The legacy implementation computes this boundary in the workspace's
/// IANA timezone (via dayjs `.tz`). The Cloudflare-Workers backend has no IANA
/// timezone database available (no `chrono-tz` dependency), so this always
/// computes the boundary in UTC. This matches the legacy behavior exactly when
/// the workspace timezone is unset, `"auto"`, invalid, or `"UTC"`, and diverges
/// by at most a one-day shift in the default range for workspaces configured
/// with a non-UTC IANA timezone. See notes.
fn build_default_posts_date_range(_timezone_setting: Option<&str>) -> DefaultDateRange {
    let now_millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0);

    let now_days = now_millis.div_euclid(86_400_000);
    // startOf('day') of tomorrow == start of (today_day + 1) in UTC.
    let end_exclusive_days = now_days + 1;
    let start_days = end_exclusive_days - 30;

    DefaultDateRange {
        start: unix_days_to_iso_midnight(start_days),
        end: unix_days_to_iso_midnight(end_exclusive_days),
    }
}

fn unix_days_to_iso_midnight(days_since_unix_epoch: i64) -> String {
    let (year, month, day) = civil_from_days(days_since_unix_epoch);
    format!("{year:04}-{month:02}-{day:02}T00:00:00.000Z")
}

fn civil_from_days(days_since_unix_epoch: i64) -> (i64, i64, i64) {
    let days = days_since_unix_epoch + 719_468;
    let era = if days >= 0 { days } else { days - 146_096 } / 146_097;
    let day_of_era = days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };

    (year + if month <= 2 { 1 } else { 0 }, month, day)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
