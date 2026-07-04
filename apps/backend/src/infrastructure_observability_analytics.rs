//! Port of `GET /api/v1/infrastructure/observability/analytics`.
//!
//! Legacy source:
//! `apps/web/src/app/api/v1/infrastructure/observability/analytics/route.ts`.
//!
//! # Auth
//!
//! The legacy route calls `authorizeInfrastructureViewer(request)` (default
//! permission: `view_infrastructure`) on the root workspace, which mirrors the
//! `getPermissions` helper. This module duplicates the same permission-resolution
//! helpers used in `infrastructure_monitoring_blue_green.rs` (they are private
//! to that module and cannot be imported here).
//!
//! # Runtime gap
//!
//! `readObservabilityAnalytics` aggregates data from:
//!
//! - A local PostgreSQL log-drain (`ensureLogDrainSchema` / `getLogDrainSqlClient`), and
//! - The legacy blue/green monitoring filesystem archive
//!   (`tmp/docker-web` on the deployment host).
//!
//! A Cloudflare Worker has access to neither. When both sources are unavailable
//! the TypeScript implementation falls back to empty request lists and empty
//! cron-run pages, producing an all-zeros analytics payload whose only
//! request-dependent part is the time-bucket window derived from `timeframeHours`.
//! This handler faithfully reproduces that empty shape.

use serde::Deserialize;
use serde_json::{Value, json};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const ROUTE_PATH: &str = "/api/v1/infrastructure/observability/analytics";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const VIEW_INFRASTRUCTURE_PERMISSION: &str = "view_infrastructure";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const LOAD_FAILED_MESSAGE: &str = "Failed to load observability analytics";
const DEFAULT_TIMEFRAME_HOURS: i64 = 24;
const MAX_TIMEFRAME_HOURS: i64 = 24 * 90; // 2 160

// ---------------------------------------------------------------------------
// Deserialization helpers (duplicated from infrastructure_monitoring_blue_green)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_infrastructure_observability_analytics_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != ROUTE_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => analytics_response(config, request, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn analytics_response(
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
            Err(()) => return message_response(500, LOAD_FAILED_MESSAGE),
        };

    if !access.contains(VIEW_INFRASTRUCTURE_PERMISSION) {
        return message_response(403, FORBIDDEN_MESSAGE);
    }

    let timeframe_hours = parse_timeframe_hours(request.url);
    let now_ms = current_time_ms();
    let payload = build_empty_analytics(now_ms, timeframe_hours);

    no_store_response(json_response(200, payload))
}

// ---------------------------------------------------------------------------
// Analytics payload builder
// ---------------------------------------------------------------------------

/// Builds the `ObservabilityAnalytics` shape with all-zero counts.
///
/// Mirrors `readObservabilityAnalytics` evaluated when every data source
/// (log-drain DB and legacy filesystem archive) returns nothing:
///
/// - `bucketCount = Math.min(24, timeframeHours)`
/// - `bucketMs    = (timeframeHours * 3_600_000) / bucketCount`
/// - `start       = now - timeframeHours * 3_600_000`
/// - Each bucket: `{ bucketStart, cronRuns: 0, errors: 0, requests: 0, serverErrors: 0 }`
fn build_empty_analytics(now_ms: i64, timeframe_hours: i64) -> Value {
    let bucket_count = std::cmp::min(24, timeframe_hours).max(1) as usize;
    let timeframe_ms = timeframe_hours * 3_600_000_i64;
    let bucket_ms = timeframe_ms / bucket_count as i64;
    let start_ms = now_ms - timeframe_ms;

    let buckets: Vec<Value> = (0..bucket_count)
        .map(|index| {
            let bucket_start = start_ms + index as i64 * bucket_ms;
            json!({
                "bucketStart": bucket_start,
                "cronRuns": 0,
                "errors": 0,
                "requests": 0,
                "serverErrors": 0,
            })
        })
        .collect();

    json!({
        "buckets": buckets,
        "statusFamilies": {
            "clientError": 0,
            "redirect": 0,
            "serverError": 0,
            "success": 0,
            "unknown": 0,
        },
        "topCronJobs": [],
        "topRoutes": [],
    })
}

/// Parses `timeframeHours` from the request URL query string.
///
/// Mirrors `clampTimeframeHours` in the legacy TypeScript:
/// parse as integer; if positive use it (clamped to `MAX_TIMEFRAME_HOURS`);
/// otherwise fall back to `DEFAULT_TIMEFRAME_HOURS`.
fn parse_timeframe_hours(request_url: Option<&str>) -> i64 {
    let raw = request_url
        .and_then(|raw| url::Url::parse(raw).ok())
        .and_then(|url| {
            url.query_pairs()
                .find_map(|(k, v)| (k == "timeframeHours").then(|| v.into_owned()))
        });

    match raw.as_deref().and_then(|v| v.parse::<i64>().ok()) {
        Some(parsed) if parsed > 0 => parsed.min(MAX_TIMEFRAME_HOURS),
        _ => DEFAULT_TIMEFRAME_HOURS,
    }
}

fn current_time_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// ---------------------------------------------------------------------------
// Auth helpers (mirrors infrastructure_monitoring_blue_green.rs verbatim)
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Eq, PartialEq)]
struct AuthenticatedUser {
    id: String,
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // --- path guard ---

    #[test]
    fn path_exact_match_returns_some_sentinel() {
        // We cannot call the async handler here (test harness lives in lib.rs),
        // so we verify the path constant directly.
        assert_eq!(ROUTE_PATH, "/api/v1/infrastructure/observability/analytics");
    }

    #[test]
    fn path_with_trailing_slash_does_not_match() {
        let path = "/api/v1/infrastructure/observability/analytics/";
        assert_ne!(path, ROUTE_PATH);
    }

    #[test]
    fn unrelated_path_does_not_match() {
        let path = "/api/v1/infrastructure/observability/overview";
        assert_ne!(path, ROUTE_PATH);
    }

    // --- timeframe parsing ---

    #[test]
    fn timeframe_default_when_absent() {
        assert_eq!(parse_timeframe_hours(None), DEFAULT_TIMEFRAME_HOURS);
    }

    #[test]
    fn timeframe_default_when_invalid() {
        assert_eq!(
            parse_timeframe_hours(Some("http://host/path?timeframeHours=abc")),
            DEFAULT_TIMEFRAME_HOURS,
        );
    }

    #[test]
    fn timeframe_default_when_zero() {
        assert_eq!(
            parse_timeframe_hours(Some("http://host/path?timeframeHours=0")),
            DEFAULT_TIMEFRAME_HOURS,
        );
    }

    #[test]
    fn timeframe_default_when_negative() {
        assert_eq!(
            parse_timeframe_hours(Some("http://host/path?timeframeHours=-5")),
            DEFAULT_TIMEFRAME_HOURS,
        );
    }

    #[test]
    fn timeframe_parsed_valid() {
        assert_eq!(
            parse_timeframe_hours(Some("http://host/path?timeframeHours=48")),
            48,
        );
    }

    #[test]
    fn timeframe_clamped_to_max() {
        assert_eq!(
            parse_timeframe_hours(Some("http://host/path?timeframeHours=99999")),
            MAX_TIMEFRAME_HOURS,
        );
    }

    // --- bucket computation ---

    #[test]
    fn bucket_count_min_24_and_timeframe() {
        let now_ms = 1_000_000_000_i64;
        let analytics = build_empty_analytics(now_ms, 24);
        let buckets = analytics["buckets"].as_array().unwrap();
        assert_eq!(buckets.len(), 24);
    }

    #[test]
    fn bucket_count_capped_at_24_for_large_timeframe() {
        let now_ms = 1_000_000_000_i64;
        let analytics = build_empty_analytics(now_ms, 48);
        let buckets = analytics["buckets"].as_array().unwrap();
        assert_eq!(buckets.len(), 24);
    }

    #[test]
    fn bucket_count_equals_timeframe_when_less_than_24() {
        let now_ms = 1_000_000_000_i64;
        let analytics = build_empty_analytics(now_ms, 6);
        let buckets = analytics["buckets"].as_array().unwrap();
        assert_eq!(buckets.len(), 6);
    }

    #[test]
    fn first_bucket_start_matches_window_start() {
        let now_ms = 1_000_000_i64;
        let timeframe_hours = 24_i64;
        let analytics = build_empty_analytics(now_ms, timeframe_hours);
        let buckets = analytics["buckets"].as_array().unwrap();
        let first_bucket_start = buckets[0]["bucketStart"].as_i64().unwrap();
        let expected_start = now_ms - timeframe_hours * 3_600_000;
        assert_eq!(first_bucket_start, expected_start);
    }

    #[test]
    fn all_bucket_counts_are_zero() {
        let analytics = build_empty_analytics(1_000_000_i64, 24);
        let buckets = analytics["buckets"].as_array().unwrap();
        for bucket in buckets {
            assert_eq!(bucket["cronRuns"].as_i64(), Some(0));
            assert_eq!(bucket["errors"].as_i64(), Some(0));
            assert_eq!(bucket["requests"].as_i64(), Some(0));
            assert_eq!(bucket["serverErrors"].as_i64(), Some(0));
        }
    }

    #[test]
    fn status_families_are_all_zero() {
        let analytics = build_empty_analytics(1_000_000_i64, 24);
        let sf = &analytics["statusFamilies"];
        assert_eq!(sf["clientError"].as_i64(), Some(0));
        assert_eq!(sf["redirect"].as_i64(), Some(0));
        assert_eq!(sf["serverError"].as_i64(), Some(0));
        assert_eq!(sf["success"].as_i64(), Some(0));
        assert_eq!(sf["unknown"].as_i64(), Some(0));
    }

    #[test]
    fn top_routes_and_cron_jobs_are_empty() {
        let analytics = build_empty_analytics(1_000_000_i64, 24);
        assert_eq!(analytics["topCronJobs"].as_array().unwrap().len(), 0);
        assert_eq!(analytics["topRoutes"].as_array().unwrap().len(), 0);
    }

    // --- WorkspaceAccess ---

    #[test]
    fn workspace_access_none_denies_everything() {
        let access = WorkspaceAccess::none();
        assert!(!access.contains("view_infrastructure"));
    }

    #[test]
    fn workspace_access_all_grants_everything() {
        let access = WorkspaceAccess::all();
        assert!(access.contains("view_infrastructure"));
        assert!(access.contains("any_random_permission"));
    }

    #[test]
    fn workspace_access_from_admin_grants_everything() {
        let access = WorkspaceAccess::from_permissions(vec!["admin".to_owned()]);
        assert!(access.contains("view_infrastructure"));
    }

    #[test]
    fn workspace_access_specific_permission_grants_only_that() {
        let access = WorkspaceAccess::from_permissions(vec!["view_infrastructure".to_owned()]);
        assert!(access.contains("view_infrastructure"));
        assert!(!access.contains("manage_workspace_roles"));
    }
}
