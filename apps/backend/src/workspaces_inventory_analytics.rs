use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const WORKSPACES_INVENTORY_ANALYTICS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_INVENTORY_ANALYTICS_PATH_SUFFIX: &str = "/inventory/analytics";
const STOREFRONT_EVENTS_TABLE: &str = "inventory_storefront_events";
const PRIVATE_SCHEMA: &str = "private";

const FORBIDDEN_MESSAGE: &str = "Forbidden";
const NOT_FOUND_MESSAGE: &str = "Not found";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const LOAD_FAILED_MESSAGE: &str = "Failed to load storefront analytics";

const DAY_MS: i64 = 24 * 60 * 60 * 1_000;
const DEFAULT_DAYS: i64 = 30;
const MIN_DAYS: i64 = 1;
const MAX_DAYS: i64 = 365;

// Mirrors `canViewInventoryDashboard` in
// apps/web/src/lib/inventory/permissions.ts: access is granted when the caller
// holds ANY of these permissions. Workspace creators / admins are covered by
// `has_all_permissions` inside `authorize_workspace_permission`.
const VIEW_INVENTORY_DASHBOARD_PERMISSIONS: [&str; 2] =
    ["view_inventory_dashboard", "view_inventory"];

pub(crate) async fn handle_workspaces_inventory_analytics_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_inventory_analytics_ws_id(request.path)?;

    Some(match request.method {
        "GET" => analytics_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn analytics_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let ws_id =
        match authorize_inventory_dashboard(&config.contact_data, request, raw_ws_id, outbound)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(response) => return response,
        };

    let days = clamp_days(parse_days(request.url));

    match build_analytics(&config.contact_data, outbound, &ws_id, days).await {
        Ok(analytics) => no_store_response(json_response(200, analytics)),
        Err(()) => no_store_response(json_response(
            500,
            json!({ "message": LOAD_FAILED_MESSAGE }),
        )),
    }
}

/// Authorizes the caller for the workspace, succeeding if they hold ANY of the
/// inventory-dashboard permissions. Returns the resolved workspace id on
/// success, or a ready-to-send error response.
async fn authorize_inventory_dashboard(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<String, BackendResponse> {
    for permission in VIEW_INVENTORY_DASHBOARD_PERMISSIONS {
        match authorize_workspace_permission(contact_data, request, raw_ws_id, permission, outbound)
            .await
        {
            Ok(authorization) => return Ok(authorization.ws_id),
            // A single missing permission does not deny access; the legacy
            // `canViewInventoryDashboard` grants access when ANY permission is
            // present, so keep checking the remaining permissions.
            Err(WorkspacePermissionAuthorizationError::Forbidden) => {}
            Err(error) => return Err(auth_error_response(error)),
        }
    }

    Err(no_store_response(json_response(
        403,
        json!({ "message": FORBIDDEN_MESSAGE }),
    )))
}

/// Builds the storefront conversion funnel over the last `days` days, mirroring
/// `getInventoryStorefrontAnalytics`. Counts are read from
/// `private.inventory_storefront_events` via service-role REST (matching the
/// legacy admin client `.schema('private')`).
async fn build_analytics(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    days: i64,
) -> Result<serde_json::Value, ()> {
    let since = since_iso8601(days);

    let views = count_events(contact_data, outbound, ws_id, "view", &since).await?;
    let product_views = count_events(contact_data, outbound, ws_id, "product_view", &since).await?;
    let add_to_cart = count_events(contact_data, outbound, ws_id, "add_to_cart", &since).await?;
    let checkout_started =
        count_events(contact_data, outbound, ws_id, "checkout_started", &since).await?;
    let checkout_created =
        count_events(contact_data, outbound, ws_id, "checkout_created", &since).await?;
    let completed =
        count_events(contact_data, outbound, ws_id, "checkout_completed", &since).await?;

    let total_views = views + product_views;
    let conversion_rate = if total_views > 0 {
        completed as f64 / total_views as f64
    } else {
        0.0
    };

    Ok(json!({
        "days": days,
        "funnel": [
            { "key": "views", "count": total_views },
            { "key": "addToCart", "count": add_to_cart },
            { "key": "checkoutStarted", "count": checkout_started },
            { "key": "checkoutCreated", "count": checkout_created },
            { "key": "completed", "count": completed },
        ],
        "conversionRate": conversion_rate,
    }))
}

/// Returns the exact number of `inventory_storefront_events` rows for the
/// workspace + event type since `since`, mirroring a PostgREST
/// `count: 'exact', head: true` request via the `Content-Range` header.
async fn count_events(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    event_type: &str,
    since: &str,
) -> Result<i64, ()> {
    let url = contact_data
        .rest_url(
            STOREFRONT_EVENTS_TABLE,
            &[
                ("select", "id".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("event_type", format!("eq.{event_type}")),
                ("occurred_at", format!("gte.{since}")),
                // We only need the total from the `Content-Range` header; cap
                // the returned body to a single row (PostgREST has no HEAD verb
                // in this outbound client, so we use GET + `count=exact`).
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Prefer", "count=exact"),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .header("content-range")
        .and_then(parse_content_range_count)
        .unwrap_or(0))
}

/// Parses the total count from a PostgREST `Content-Range` header value such as
/// `0-24/100` or `*/100`. Returns the value after the final `/`.
fn parse_content_range_count(content_range: &str) -> Option<i64> {
    let total = content_range.rsplit('/').next()?.trim();
    if total.is_empty() || total == "*" {
        return None;
    }
    total.parse::<i64>().ok()
}

fn parse_days(request_url: Option<&str>) -> i64 {
    let Some(url) = request_url.and_then(|url| url::Url::parse(url).ok()) else {
        return DEFAULT_DAYS;
    };

    let Some(raw) = url
        .query_pairs()
        .find(|(key, _)| key == "days")
        .map(|(_, value)| value.into_owned())
    else {
        return DEFAULT_DAYS;
    };

    // Mirror JS `Number(value)` + `Number.isFinite(days) ? days : 30`. JS would
    // coerce the empty/whitespace string to 0, but the analytics builder later
    // clamps to at least 1, so the observable result is identical.
    match raw.trim().parse::<f64>() {
        Ok(value) if value.is_finite() => value as i64,
        _ => DEFAULT_DAYS,
    }
}

fn clamp_days(days: i64) -> i64 {
    days.clamp(MIN_DAYS, MAX_DAYS)
}

/// `new Date(Date.now() - days * DAY_MS).toISOString()`.
fn since_iso8601(days: i64) -> String {
    unix_millis_to_iso_timestamp(unix_millis_now() - days * DAY_MS)
}

fn auth_error_response(error: WorkspacePermissionAuthorizationError) -> BackendResponse {
    match error {
        WorkspacePermissionAuthorizationError::Unauthorized => no_store_response(json_response(
            401,
            json!({ "message": UNAUTHORIZED_MESSAGE }),
        )),
        WorkspacePermissionAuthorizationError::NotFound => {
            no_store_response(json_response(404, json!({ "error": NOT_FOUND_MESSAGE })))
        }
        WorkspacePermissionAuthorizationError::Forbidden => {
            no_store_response(json_response(403, json!({ "message": FORBIDDEN_MESSAGE })))
        }
        WorkspacePermissionAuthorizationError::Internal => no_store_response(json_response(
            500,
            json!({ "message": MEMBERSHIP_LOOKUP_FAILED_MESSAGE }),
        )),
    }
}

fn workspaces_inventory_analytics_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_INVENTORY_ANALYTICS_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_INVENTORY_ANALYTICS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

// ---------------------------------------------------------------------------
// Time helpers (ISO-8601 UTC, matching JS Date#toISOString output shape).
// ---------------------------------------------------------------------------

fn unix_millis_now() -> i64 {
    let duration = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    duration.as_secs() as i64 * 1_000 + i64::from(duration.subsec_millis())
}

fn unix_millis_to_iso_timestamp(unix_millis: i64) -> String {
    let seconds = unix_millis.div_euclid(1_000);
    let millis = unix_millis.rem_euclid(1_000);
    let days = seconds.div_euclid(86_400);
    let seconds_of_day = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis:03}Z")
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
