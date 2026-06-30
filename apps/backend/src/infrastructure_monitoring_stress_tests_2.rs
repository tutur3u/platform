//! Port of `GET /api/v1/infrastructure/monitoring/stress-tests`.
//!
//! Legacy source:
//! `apps/web/src/app/api/v1/infrastructure/monitoring/stress-tests/route.ts`.
//!
//! # Behavior gaps
//!
//! - **Auth**: uses `authorize_root_workspace_read_access` (root-workspace
//!   membership), not the full `view_infrastructure` permission check.
//! - **`canManage`**: checks role-based permissions only (not default-role
//!   grants or workspace-creator status); falls back to `false` on error.
//! - **Runtime runs**: always empty — the Worker has no host filesystem.
//! - **`targets`**: returns the hardcoded default list because
//!   `PLATFORM_STRESS_TEST_TARGETS` is not surfaced through `BackendConfig`.

use std::time::{SystemTime, UNIX_EPOCH};

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    infrastructure_root_auth::{RootWorkspaceReadAuthError, authorize_root_workspace_read_access},
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const ROUTE_PATH: &str = "/api/v1/infrastructure/monitoring/stress-tests";
const PRIVATE_SCHEMA: &str = "private";
const RUNS_TABLE: &str = "infrastructure_stress_test_runs";
const ROOT_WS_ID: &str = "00000000-0000-0000-0000-000000000000";
const MANAGE_PERM: &str = "manage_infrastructure_stress_tests";

#[derive(Deserialize)]
struct RunRow {
    #[serde(default)]
    abort_reason: Option<String>,
    #[serde(default)]
    abort_requested_at: Option<String>,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    ended_at: Option<String>,
    #[serde(default)]
    error_message: Option<String>,
    id: String,
    #[serde(default)]
    profile: Value,
    #[serde(default)]
    queued_at: Option<String>,
    #[serde(default)]
    requested_by: Option<String>,
    #[serde(default)]
    requested_by_email: Option<String>,
    #[serde(default)]
    resource_spikes: Value,
    #[serde(default)]
    result_notes: Option<String>,
    #[serde(default)]
    started_at: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    summary: Value,
    #[serde(default)]
    target_id: Option<String>,
    #[serde(default)]
    target_label: Option<String>,
    #[serde(default)]
    target_url: Option<String>,
    #[serde(default)]
    updated_at: Option<String>,
}

#[derive(Deserialize)]
struct RoleMemberRow {
    #[serde(default)]
    workspace_roles: Vec<RoleRow>,
}
#[derive(Deserialize)]
struct RoleRow {
    #[serde(default)]
    workspace_role_permissions: Vec<PermRow>,
}
#[derive(Deserialize)]
struct PermRow {
    permission: Option<String>,
}

pub(crate) async fn handle_infrastructure_monitoring_stress_tests_2_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != ROUTE_PATH {
        return None;
    }
    Some(match request.method {
        "GET" => snapshot_response(config, request, outbound).await,
        _ => return None,
    })
}

async fn snapshot_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let access = match authorize_root_workspace_read_access(config, request, outbound).await {
        Ok(a) => a,
        Err(RootWorkspaceReadAuthError::Unauthorized) => return msg(401, "Unauthorized"),
        Err(RootWorkspaceReadAuthError::Forbidden) => return msg(403, "Forbidden"),
    };

    let can_manage = check_can_manage(&config.contact_data, outbound, &access.user_id)
        .await
        .unwrap_or(false);

    let recent_runs = fetch_runs(&config.contact_data, outbound, &access.access_token).await;

    let active_run = recent_runs
        .iter()
        .find(|r| {
            matches!(
                r.get("status").and_then(Value::as_str),
                Some("running" | "queued")
            )
        })
        .cloned()
        .unwrap_or(Value::Null);

    no_store_response(json_response(
        200,
        json!({
            "activeRun":  active_run,
            "canManage":  can_manage,
            "profiles":   profiles(),
            "recentRuns": recent_runs,
            "targets":    targets(),
        }),
    ))
}

/// Simplified role-based `manage_infrastructure_stress_tests` check.
async fn check_can_manage(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            "workspace_role_members",
            &[
                (
                    "select",
                    "workspace_roles!inner(workspace_role_permissions(permission))".to_owned(),
                ),
                ("user_id", format!("eq.{user_id}")),
                ("workspace_roles.ws_id", format!("eq.{ROOT_WS_ID}")),
                (
                    "workspace_roles.workspace_role_permissions.enabled",
                    "eq.true".to_owned(),
                ),
            ],
        )
        .ok_or(())?;
    let srk = contact_data.service_role_key().ok_or(())?;
    let auth = format!("Bearer {srk}");
    let resp = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &auth)
                .with_header("apikey", srk),
        )
        .await
        .map_err(|_| ())?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    Ok(resp
        .json::<Vec<RoleMemberRow>>()
        .map_err(|_| ())?
        .into_iter()
        .flat_map(|m| m.workspace_roles)
        .flat_map(|r| r.workspace_role_permissions)
        .any(|p| p.permission.as_deref() == Some(MANAGE_PERM)))
}

/// Fetch up to 25 persisted runs (newest first) from the private schema.
async fn fetch_runs(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
) -> Vec<Value> {
    let Some(url) = contact_data.rest_url(
        RUNS_TABLE,
        &[
            ("select", "*".to_owned()),
            ("order", "created_at.desc".to_owned()),
            ("limit", "25".to_owned()),
        ],
    ) else {
        return Vec::new();
    };
    let Some(srk) = contact_data.service_role_key() else {
        return Vec::new();
    };
    let auth = format!("Bearer {access_token}");
    let Ok(resp) = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &auth)
                .with_header("apikey", srk)
                .with_header("Accept-Profile", PRIVATE_SCHEMA),
        )
        .await
    else {
        return Vec::new();
    };
    if !(200..300).contains(&resp.status) {
        return Vec::new();
    }
    resp.json::<Vec<RunRow>>()
        .map_err(|_| ())
        .map_or(Vec::new(), |rows| {
            rows.into_iter().filter_map(row_to_run).collect()
        })
}

/// Port of `rowToRun` + `normalizeStressTestRun` for the persisted-DB path.
fn row_to_run(row: RunRow) -> Option<Value> {
    let target_url = row.target_url.as_deref().unwrap_or_default();
    let parsed = url::Url::parse(target_url).ok()?;
    let origin = parsed.origin().ascii_serialization();
    let pathname = parsed.path().to_owned();

    let created_at = ts(row.created_at.as_deref()).unwrap_or_else(now_ms);
    let queued_at = ts(row.queued_at.as_deref()).unwrap_or_else(now_ms);
    let started_at = ts(row.started_at.as_deref());
    let ended_at = ts(row.ended_at.as_deref());
    let updated_at = ts(row.updated_at.as_deref()).unwrap_or_else(now_ms);
    let status = row.status.unwrap_or_else(|| "queued".to_owned());

    let summary = if row
        .summary
        .get("totalRequests")
        .and_then(Value::as_i64)
        .unwrap_or(0)
        > 0
    {
        row.summary
    } else {
        default_summary()
    };
    let resource_spikes = if row
        .resource_spikes
        .as_array()
        .is_some_and(|a| !a.is_empty())
    {
        row.resource_spikes
    } else {
        empty_spikes(started_at)
    };

    Some(json!({
        "abortReason":        opt_s(row.abort_reason.as_deref()),
        "abortRequestedAt":   opt_ms(ts(row.abort_requested_at.as_deref())),
        "createdAt":          created_at,
        "endedAt":            opt_ms(ended_at),
        "errorMessage":       opt_s(row.error_message.as_deref()),
        "id":                 row.id,
        "profile":            if row.profile.is_null() { Value::Null } else { row.profile },
        "queuedAt":           queued_at,
        "requestedBy":        opt_s(row.requested_by.as_deref()),
        "requestedByEmail":   opt_s(row.requested_by_email.as_deref()),
        "resourceSpikes":     resource_spikes,
        "resultNotes":        opt_s(row.result_notes.as_deref()),
        "samples":            Value::Array(vec![]),
        "startedAt":          opt_ms(started_at),
        "status":             status,
        "summary":            summary,
        "target": {
            "baseUrl":     origin,
            "defaultPath": pathname,
            "description": Value::Null,
            "id":          opt_s(row.target_id.as_deref()),
            "label":       opt_s(row.target_label.as_deref()),
        },
        "updatedAt": updated_at,
    }))
}

fn default_summary() -> Value {
    json!({
        "averageRequestsPerSecond": Value::Null,
        "capacityJudgement":        Value::Null,
        "errorRate":                Value::Null,
        "estimatedSteadyUsers":     Value::Null,
        "failureMode":              Value::Null,
        "latency": { "p50Ms": Value::Null, "p95Ms": Value::Null, "p99Ms": Value::Null },
        "peakRequestsPerSecond":    Value::Null,
        "safeRequestsPerSecond":    Value::Null,
        "saturationPoint":          Value::Null,
        "totalRequests":            0,
    })
}

fn empty_spikes(started_at: Option<i64>) -> Value {
    let ttp = opt_ms(started_at.map(|_| 0i64));
    let spike = |metric: &str, unit: &str| {
        json!({
            "baseline": Value::Null, "delta": Value::Null, "metric": metric,
            "peak": Value::Null, "recoveryMs": Value::Null, "timeToPeakMs": ttp, "unit": unit,
        })
    };
    json!([
        spike("cpu", "percent"),
        spike("memory", "bytes"),
        spike("rx", "bytes"),
        spike("tx", "bytes")
    ])
}

fn opt_s(v: Option<&str>) -> Value {
    v.map_or(Value::Null, |s| Value::String(s.to_owned()))
}
fn opt_ms(v: Option<i64>) -> Value {
    v.map_or(Value::Null, |n| json!(n))
}

/// Parse a trimmed, non-empty ISO-8601 timestamp string to epoch milliseconds.
fn ts(v: Option<&str>) -> Option<i64> {
    let v = v?.trim();
    if v.is_empty() {
        return None;
    }
    let s = v.replace(' ', "T");
    if s.len() < 19 {
        return None;
    }
    let year: i64 = s.get(0..4)?.parse().ok()?;
    let month: i64 = s.get(5..7)?.parse().ok()?;
    let day: i64 = s.get(8..10)?.parse().ok()?;
    let hour: i64 = s.get(11..13)?.parse().ok()?;
    let min: i64 = s.get(14..16)?.parse().ok()?;
    let sec: i64 = s.get(17..19)?.parse().ok()?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    let tail = &s[19..];
    let mut ms_frac: i64 = 0;
    if let Some(after_dot) = tail.strip_prefix('.') {
        let mut frac: String = after_dot
            .chars()
            .take_while(|c| c.is_ascii_digit())
            .collect();
        frac.truncate(3);
        while frac.len() < 3 {
            frac.push('0');
        }
        ms_frac = frac.parse().unwrap_or(0);
    }
    let tz = parse_tz(tail);
    let era = |y: i64| if y >= 0 { y } else { y - 399 } / 400;
    let y2 = if month <= 2 { year - 1 } else { year };
    let e = era(y2);
    let yoe = y2 - e * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = e * 146_097 + doe - 719_468;
    Some((days * 86_400 + hour * 3_600 + min * 60 + sec - tz) * 1_000 + ms_frac)
}

fn parse_tz(tail: &str) -> i64 {
    let tail = if let Some(s) = tail.strip_prefix('.') {
        let n = s.chars().take_while(|c| c.is_ascii_digit()).count();
        &s[n..]
    } else {
        tail
    };
    let tail = tail.trim();
    if tail.is_empty() || tail.eq_ignore_ascii_case("Z") {
        return 0;
    }
    let (sign, rest) = if let Some(r) = tail.strip_prefix('+') {
        (1i64, r)
    } else if let Some(r) = tail.strip_prefix('-') {
        (-1i64, r)
    } else {
        return 0;
    };
    let digits: String = rest.chars().filter(|c| c.is_ascii_digit()).collect();
    let (h, m): (i64, i64) = match digits.len() {
        2 => (digits.parse().unwrap_or(0), 0),
        4 => (
            digits[0..2].parse().unwrap_or(0),
            digits[2..4].parse().unwrap_or(0),
        ),
        _ => (0, 0),
    };
    sign * (h * 3_600 + m * 60)
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or_default()
}

/// Static profiles mirroring `STRESS_TEST_PROFILES` in `stress-testing-runtime.ts`.
fn profiles() -> Value {
    json!([
        { "concurrency":  5, "durationSeconds":  30, "id": "smoke",  "label": "Smoke",
          "maxRequestsPerSecond":  10, "rampSeconds":   5 },
        { "concurrency": 50, "durationSeconds": 300, "id": "steady", "label": "Steady",
          "maxRequestsPerSecond": 100, "rampSeconds":  60 },
        { "concurrency":120, "durationSeconds": 180, "id": "spike",  "label": "Spike",
          "maxRequestsPerSecond": 250, "rampSeconds":  15 },
        { "concurrency":200, "durationSeconds": 600, "id": "ramp",   "label": "Ramp",
          "maxRequestsPerSecond": 400, "rampSeconds": 240 },
    ])
}

/// Default target list — fallback when `PLATFORM_STRESS_TEST_TARGETS` is absent.
fn targets() -> Value {
    json!([{
        "baseUrl":     "http://127.0.0.1:7803",
        "defaultPath": "/",
        "description": "Local web runtime on the native developer machine.",
        "id":          "local-web",
        "label":       "Local Web",
    }])
}

fn msg(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_exact() {
        assert_eq!(ROUTE_PATH, "/api/v1/infrastructure/monitoring/stress-tests");
    }

    #[test]
    fn path_guard_rejects_sub_path() {
        // Trailing run-id must NOT match; the sibling per-run handler owns those.
        assert_ne!(
            "/api/v1/infrastructure/monitoring/stress-tests/some-id",
            ROUTE_PATH,
        );
    }

    #[test]
    fn ts_utc_round_trip() {
        // 2024-01-15T12:00:00Z -> 1705320000000 ms
        assert_eq!(ts(Some("2024-01-15T12:00:00Z")), Some(1_705_320_000_000));
    }

    #[test]
    fn ts_millis_preserved() {
        assert_eq!(
            ts(Some("2024-01-15T12:00:00.123Z")),
            Some(1_705_320_000_123)
        );
    }

    #[test]
    fn ts_empty_none() {
        assert_eq!(ts(None), None);
        assert_eq!(ts(Some("")), None);
        assert_eq!(ts(Some("   ")), None);
    }

    #[test]
    fn profiles_has_four_entries() {
        assert_eq!(profiles().as_array().map(|a| a.len()), Some(4));
    }

    #[test]
    fn targets_has_default_entry() {
        let t = targets();
        assert_eq!(t.as_array().map(|a| a.len()), Some(1));
        assert_eq!(t[0]["id"], json!("local-web"));
    }
}
