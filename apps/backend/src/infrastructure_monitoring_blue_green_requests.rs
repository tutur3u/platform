//! Port of `GET /api/v1/infrastructure/monitoring/blue-green/requests`.
//!
//! Legacy source:
//! `apps/web/src/app/api/v1/infrastructure/monitoring/blue-green/requests/route.ts`.
//!
//! The legacy route authorizes an "infrastructure viewer" (the ROOT workspace
//! `view_infrastructure` permission) and then returns a paginated blue/green
//! monitoring *request archive* produced by
//! `readBlueGreenMonitoringRequestArchive`.
//!
//! IMPORTANT RUNTIME NOTE: like the sibling `infrastructure_monitoring_blue_green`
//! module, the request archive is assembled *entirely* from the local filesystem
//! (the blue/green watcher writes JSON telemetry files under `tmp/docker-web` on
//! the deployment host). A Cloudflare Worker has no such filesystem, so
//! `resolveMonitoringDir` finds nothing, every file read returns empty, and the
//! archive collapses to its empty shape: zero items, a single (clamped) page,
//! and all-zero analytics. This handler reproduces that exact empty shape. The
//! only request-dependent parts of the empty response are:
//!   * `limit` (the clamped `pageSize`, capped at 100, default 25),
//!   * the analytics `timeframe` window (derived from `timeframeDays`, clamped to
//!     `[1, 30]`, default 7, against the current time), and
//!   * the `timeframeDays` 400 validation.
//! `page` always normalizes to 1 when `total === 0`. The filter params (`q`,
//! `status`, `route`, `render`, `traffic`, `since`, `until`) never change the
//! empty output, so they are parsed only insofar as `timeframeDays` requires.
//!
//! Auth and permission resolution mirror `infrastructure_monitoring_blue_green.rs`
//! (which itself mirrors `getPermissions`). That module's permission helpers are
//! private to it, so the equivalent logic is re-implemented locally here.

use serde::Deserialize;
use serde_json::{Value, json};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

pub(crate) const INFRASTRUCTURE_MONITORING_BLUE_GREEN_REQUESTS_PATH: &str =
    "/api/v1/infrastructure/monitoring/blue-green/requests";

const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const VIEW_INFRASTRUCTURE_PERMISSION: &str = "view_infrastructure";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const LOAD_FAILED_MESSAGE: &str = "Failed to load blue-green monitoring request archive";

// Mirrors the legacy constants in `blue-green-monitoring.ts`.
const DEFAULT_ARCHIVE_PAGE_SIZE: i64 = 25;
const MAX_ARCHIVE_PAGE_SIZE: i64 = 100;
const DEFAULT_REQUEST_ARCHIVE_TIMEFRAME_DAYS: i64 = 7;
const MAX_REQUEST_ARCHIVE_TIMEFRAME_DAYS: i64 = 30;
const MILLIS_PER_DAY: i64 = 24 * 60 * 60 * 1000;

#[derive(Clone, Debug, Eq, PartialEq)]
struct AuthenticatedUser {
    id: String,
}

#[derive(Deserialize)]
struct MembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceCreatorRow {
    creator_id: Option<String>,
}

#[derive(Deserialize)]
struct PermissionRow {
    permission: Option<String>,
}

#[derive(Deserialize)]
struct RoleMemberRow {
    #[serde(default)]
    workspace_roles: Vec<RoleRow>,
}

#[derive(Deserialize)]
struct RoleRow {
    #[serde(default)]
    workspace_role_permissions: Vec<PermissionRow>,
}

pub(crate) async fn handle_infrastructure_monitoring_blue_green_requests_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != INFRASTRUCTURE_MONITORING_BLUE_GREEN_REQUESTS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => blue_green_requests_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn blue_green_requests_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(user) = resolve_authenticated_user(config, request, outbound).await else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    let access =
        match workspace_permissions(&config.contact_data, outbound, ROOT_WORKSPACE_ID, &user.id)
            .await
        {
            Ok(access) => access,
            Err(()) => return error_response(),
        };

    if !access.contains(VIEW_INFRASTRUCTURE_PERMISSION) {
        return message_response(403, FORBIDDEN_MESSAGE);
    }

    // Query-param parsing. The legacy route validates `timeframeDays` *before*
    // the try/catch, so a bad value yields a 400 even though the eventual
    // archive read never throws here.
    let params = QueryParams::from_url(request.url);

    let timeframe_days = match params.timeframe_days() {
        Ok(days) => days,
        Err(message) => return message_response(400, &message),
    };

    let page_size = params.page_size();

    // The archive is filesystem-derived on the host and there is no filesystem in
    // the Worker runtime, so it is always the empty shape.
    no_store_response(json_response(
        200,
        empty_request_archive(page_size, timeframe_days, current_time_millis()),
    ))
}

/// The empty `BlueGreenMonitoringRequestArchive` returned when no telemetry files
/// exist on disk. Mirrors `readBlueGreenMonitoringRequestArchive(...)` evaluated
/// with `monitoringDir.exists === false`: `total === 0`, a single page, and
/// all-zero analytics over an empty request set.
fn empty_request_archive(page_size: i64, timeframe_days: i64, now: i64) -> Value {
    // createArchiveResponse([], page=1, page_size, total=0):
    //   pageCount = max(1, ceil(0/page_size)) = 1
    //   getArchivePage(page, 0, page_size) => page=1, offset=0
    //   hasNextPage = 1 < 1 = false; hasPreviousPage = 1 > 1 = false
    //   window = { newestAt: null, oldestAt: null }
    json!({
        "analytics": empty_analytics(timeframe_days, now),
        "hasNextPage": false,
        "hasPreviousPage": false,
        "items": [],
        "limit": page_size,
        "offset": 0,
        "page": 1,
        "pageCount": 1,
        "total": 0,
        "window": {
            "newestAt": Value::Null,
            "oldestAt": Value::Null,
        },
    })
}

/// `buildRequestArchiveAnalytics({ requests: [], retainedRequestCount: 0, timeframe })`.
fn empty_analytics(timeframe_days: i64, now: i64) -> Value {
    json!({
        "averageLatencyMs": Value::Null,
        "distinctRoutes": 0,
        "errorRequestCount": 0,
        "externalRequestCount": 0,
        "internalRequestCount": 0,
        "requestCount": 0,
        "retainedRequestCount": 0,
        "rscRequestCount": 0,
        "statusCodes": [],
        "timeframe": {
            "days": timeframe_days,
            "endAt": now,
            "startAt": now - timeframe_days * MILLIS_PER_DAY,
        },
        "topRoutes": [],
    })
}

struct QueryParams {
    page_size: Option<String>,
    timeframe_days: Option<String>,
}

impl QueryParams {
    fn from_url(request_url: Option<&str>) -> Self {
        let mut params = Self {
            page_size: None,
            timeframe_days: None,
        };
        let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok())
        else {
            return params;
        };

        // `URLSearchParams.get(...)` returns the *first* occurrence, so only the
        // first value for each key is retained.
        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "pageSize" if params.page_size.is_none() => {
                    params.page_size = Some(value.into_owned());
                }
                "timeframeDays" if params.timeframe_days.is_none() => {
                    params.timeframe_days = Some(value.into_owned());
                }
                _ => {}
            }
        }

        params
    }

    /// Mirrors `clampArchivePageSize(parsePositiveInt(pageSize, 25))`:
    ///   - `parsePositiveInt`: `Number.parseInt(value, 10)`; if not an integer
    ///     `> 0`, fall back to 25.
    ///   - `clampArchivePageSize`: `Math.min(parsed, 100)`.
    fn page_size(&self) -> i64 {
        let parsed = self
            .page_size
            .as_deref()
            .and_then(parse_positive_int)
            .unwrap_or(DEFAULT_ARCHIVE_PAGE_SIZE);

        parsed.min(MAX_ARCHIVE_PAGE_SIZE)
    }

    /// Mirrors `parseTimeframeDays`:
    ///   - empty/absent => default 7 days.
    ///   - `"all"` (case-insensitive, trimmed) => 400.
    ///   - otherwise `Number(value)` must be an integer in `[1, 30]`; else 400.
    fn timeframe_days(&self) -> Result<i64, String> {
        let Some(raw) = self.timeframe_days.as_deref() else {
            return Ok(DEFAULT_REQUEST_ARCHIVE_TIMEFRAME_DAYS);
        };
        if raw.is_empty() {
            return Ok(DEFAULT_REQUEST_ARCHIVE_TIMEFRAME_DAYS);
        }

        let message = format!(
            "timeframeDays must be an integer between 1 and {MAX_REQUEST_ARCHIVE_TIMEFRAME_DAYS}"
        );

        let normalized = raw.trim().to_lowercase();
        if normalized == "all" {
            return Err(message);
        }

        // JavaScript `Number(normalized)` must yield an integer in [1, 30]. A
        // non-integer string (e.g. "7.5", "abc", "") or out-of-range value
        // fails the `Number.isInteger(parsed) && parsed >= 1 && parsed <= 30`
        // guard. `Number("")` is 0, but the empty case is handled above; the
        // trimmed-empty case (e.g. whitespace) yields `Number(" ") === 0` which
        // is < 1 and therefore a 400 as well.
        match parse_js_number_integer(&normalized) {
            Some(days) if (1..=MAX_REQUEST_ARCHIVE_TIMEFRAME_DAYS).contains(&days) => Ok(days),
            _ => Err(message),
        }
    }
}

/// Mirrors `Number.parseInt(value, 10)` followed by the
/// `Number.isInteger(parsed) && parsed > 0` guard from `parsePositiveInt`.
/// `parseInt` consumes a leading integer prefix and ignores trailing junk.
fn parse_positive_int(value: &str) -> Option<i64> {
    let trimmed = value.trim_start();
    let bytes = trimmed.as_bytes();
    let mut index = 0;

    if matches!(bytes.first(), Some(b'+' | b'-')) {
        index += 1;
    }

    let digits_start = index;
    while index < bytes.len() && bytes[index].is_ascii_digit() {
        index += 1;
    }

    if index == digits_start {
        return None;
    }

    let parsed = trimmed[..index].parse::<i64>().ok()?;
    (parsed > 0).then_some(parsed)
}

/// Mirrors JavaScript `Number(value)` restricted to the
/// `Number.isInteger(parsed)` outcome. Unlike `parseInt`, `Number(...)` requires
/// the *entire* (trimmed) string to be a valid numeric literal and rejects
/// trailing junk. We only need the integer-valued cases; anything fractional or
/// non-numeric returns `None`, which the caller treats as invalid.
fn parse_js_number_integer(value: &str) -> Option<i64> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        // Number("") === 0 (but reached only via whitespace-only input here).
        return Some(0);
    }

    // `Number("12.0")` is a valid integer 12; `Number("12.5")` is 12.5 (not an
    // integer). Parse as f64 to honor JS numeric coercion, then require an
    // integral, finite value within i64 range.
    let parsed: f64 = trimmed.parse().ok()?;
    if parsed.is_finite() && parsed.fract() == 0.0 {
        Some(parsed as i64)
    } else {
        None
    }
}

fn current_time_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

async fn resolve_authenticated_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<AuthenticatedUser> {
    if contact::request_has_app_session_token(request) {
        let identity = contact::resolve_app_session_identity(
            config,
            request,
            contact::current_user_app_session_targets(),
        )
        .ok()?;

        return Some(AuthenticatedUser { id: identity.id });
    }

    let access_token = supabase_auth::request_access_token(request)?;
    let user_id =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))?;

    Some(AuthenticatedUser { id: user_id })
}

/// Resolve the effective permission ids a user has in a workspace, mirroring
/// `getPermissions` (and the equivalent logic in
/// `infrastructure_monitoring_blue_green.rs`).
async fn workspace_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
    user_id: &str,
) -> Result<WorkspaceAccess, ()> {
    let Some(membership_type) =
        workspace_membership_type(contact_data, outbound, workspace_id, user_id).await?
    else {
        return Ok(WorkspaceAccess::none());
    };

    let Some(creator_id) = workspace_creator_id(contact_data, outbound, workspace_id).await? else {
        return Ok(WorkspaceAccess::none());
    };
    let is_creator = membership_type == "MEMBER" && creator_id == user_id;

    if is_creator {
        return Ok(WorkspaceAccess::all());
    }

    let mut permissions = Vec::new();
    if membership_type == "MEMBER" {
        permissions.extend(role_permissions(contact_data, outbound, workspace_id, user_id).await?);
    }
    permissions
        .extend(default_permissions(contact_data, outbound, workspace_id, &membership_type).await?);

    Ok(WorkspaceAccess::from_permissions(permissions))
}

#[derive(Clone, Debug)]
struct WorkspaceAccess {
    all: bool,
    permissions: Vec<String>,
}

impl WorkspaceAccess {
    fn none() -> Self {
        Self {
            all: false,
            permissions: Vec::new(),
        }
    }

    fn all() -> Self {
        Self {
            all: true,
            permissions: Vec::new(),
        }
    }

    fn from_permissions(permissions: Vec<String>) -> Self {
        let all = permissions.iter().any(|permission| permission == "admin");
        Self { all, permissions }
    }

    fn contains(&self, permission: &str) -> bool {
        self.all || self.permissions.iter().any(|value| value == permission)
    }
}

async fn workspace_membership_type(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
    user_id: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{workspace_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<MembershipRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.membership_type))
}

async fn workspace_creator_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "creator_id".to_owned()),
            ("id", format!("eq.{workspace_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceCreatorRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.creator_id))
}

async fn role_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
    user_id: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_role_members",
        &[
            (
                "select",
                "workspace_roles!inner(workspace_role_permissions(permission))".to_owned(),
            ),
            ("user_id", format!("eq.{user_id}")),
            ("workspace_roles.ws_id", format!("eq.{workspace_id}")),
            (
                "workspace_roles.workspace_role_permissions.enabled",
                "eq.true".to_owned(),
            ),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<RoleMemberRow>>()
        .map_err(|_| ())?
        .into_iter()
        .flat_map(|member| member.workspace_roles)
        .flat_map(|role| role.workspace_role_permissions)
        .filter_map(|permission| permission.permission)
        .collect())
}

async fn default_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
    member_type: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_default_permissions",
        &[
            ("select", "permission".to_owned()),
            ("ws_id", format!("eq.{workspace_id}")),
            ("member_type", format!("eq.{member_type}")),
            ("enabled", "eq.true".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<PermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
}

async fn service_role_get(
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

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": LOAD_FAILED_MESSAGE }),
    ))
}
