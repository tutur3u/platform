//! Port of `GET /api/v1/infrastructure/monitoring/cron`.
//!
//! Legacy source:
//! `apps/web/src/app/api/v1/infrastructure/monitoring/cron/route.ts`.
//!
//! ## Auth
//!
//! The legacy route calls `authorizeInfrastructureViewer(request)` which checks
//! the `view_infrastructure` permission in the root workspace via
//! `getPermissions`. This port delegates to
//! `workspace_permission_check::authorize_workspace_permission` using the root
//! workspace ID and the same permission string.
//!
//! ## Behavior Gaps
//!
//! - `readCronMonitoringSnapshot()` is entirely filesystem-based. A Cloudflare
//!   Worker has no filesystem, so every file read returns its fallback and the
//!   snapshot always collapses to the all-defaults shape documented in
//!   `empty_cron_snapshot()`.
//! - `readManagedExternalCronMonitoring()` calls `listExternalApps()` (a DB
//!   query) to resolve human-readable display names for external apps. This
//!   port skips that lookup and uses the raw `externalAppId` as
//!   `appDisplayName`. All other normalization is faithful to the legacy code.
//! - The legacy route does not set an explicit `Cache-Control` header; Next.js
//!   defaults to `no-store` for API routes, so this port adds `no-store`.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

pub(crate) const INFRASTRUCTURE_MONITORING_CRON_PATH: &str =
    "/api/v1/infrastructure/monitoring/cron";

const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const VIEW_INFRASTRUCTURE_PERMISSION: &str = "view_infrastructure";
const MANAGED_CRON_RPC: &str = "external_app_managed_cron_monitoring";

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_infrastructure_monitoring_cron_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    if request.path != INFRASTRUCTURE_MONITORING_CRON_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => cron_monitoring_response(config, request, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn cron_monitoring_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    match authorize_workspace_permission(
        &config.contact_data,
        request,
        ROOT_WORKSPACE_ID,
        VIEW_INFRASTRUCTURE_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(_) => {}
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return message_response(401, "Unauthorized");
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return message_response(403, "Forbidden");
        }
        Err(
            WorkspacePermissionAuthorizationError::NotFound
            | WorkspacePermissionAuthorizationError::Internal,
        ) => {
            return message_response(500, "Failed to load cron monitoring snapshot");
        }
    }

    let managed_external_cron =
        match fetch_managed_external_cron(&config.contact_data, outbound).await {
            Ok(data) => data,
            Err(()) => unavailable_managed_external_cron(),
        };

    let mut body = empty_cron_snapshot();
    body["managedExternalCron"] = managed_external_cron;

    no_store_response(json_response(200, body))
}

// ---------------------------------------------------------------------------
// Cron snapshot — all-defaults (no filesystem in the worker runtime)
// ---------------------------------------------------------------------------

/// Returns the `CronMonitoringSnapshot` produced when no monitoring files exist
/// on disk. This mirrors `readCronMonitoringSnapshot()` with every `readJsonFile`
/// returning its fallback and every `existsSync` returning `false`.
fn empty_cron_snapshot() -> Value {
    json!({
        "control": {
            "enabled": true,
            "jobs": {},
            "updatedAt": Value::Null,
            "updatedBy": Value::Null,
            "updatedByEmail": Value::Null,
        },
        "diagnostics": [
            {
                "code": "runner_not_live",
                "detail": "Cron runner heartbeat is missing.",
                "severity": "error",
                "timestamp": Value::Null,
            },
            {
                "code": "watcher_not_live",
                "detail": "Blue/green watcher heartbeat is missing.",
                "severity": "warning",
                "timestamp": Value::Null,
            },
        ],
        "enabled": true,
        "jobs": [],
        "lastExecution": Value::Null,
        "nextRunAt": Value::Null,
        "overview": {
            "enabledJobs": 0,
            "failedExecutions": 0,
            "failedJobs": 0,
            "processingRuns": 0,
            "queuedRuns": 0,
            "retainedExecutions": 0,
            "totalJobs": 0,
        },
        "recovery": {
            "blockedReason": Value::Null,
            "canRequest": true,
            // neither directControl nor watcher is live → "none"
            "consumer": "none",
            "directControl": {
                // PLATFORM_DOCKER_CONTROL_URL / PLATFORM_DOCKER_CONTROL_TOKEN
                // are not available in the worker environment.
                "configured": false,
                "lastRecovery": Value::Null,
                // normalizeStatusHealth(null, now) → "missing"
                "status": "missing",
                "updatedAt": Value::Null,
                "watchdog": Value::Null,
            },
            "pendingRequestAgeMs": Value::Null,
            "requestIsStale": false,
            "watcherStatus": "missing",
        },
        "retainedExecutionCount": 0,
        "runnerRecoveryRequest": Value::Null,
        "runs": [],
        "source": {
            "configAvailable": false,
            "controlAvailable": false,
            "dockerControlStatusAvailable": false,
            "runtimeDirAvailable": false,
            "statusAvailable": false,
            "watcherStatusAvailable": false,
        },
        // normalizeStatusHealth(null, now) → "missing" (updatedAt is null)
        "status": "missing",
        "updatedAt": Value::Null,
    })
}

// ---------------------------------------------------------------------------
// Managed external cron monitoring (Supabase RPC)
// ---------------------------------------------------------------------------

/// `unavailableManagedExternalCronMonitoring()` from the legacy module.
fn unavailable_managed_external_cron() -> Value {
    let now = now_iso();
    json!({
        "apps": [],
        "available": false,
        "error": "Managed external cron monitoring is unavailable.",
        "executions": [],
        "generatedAt": now,
        "serverNow": now,
    })
}

/// Calls `external_app_managed_cron_monitoring` RPC with the service role key
/// and normalizes the result. On any error returns `Err(())`.
async fn fetch_managed_external_cron(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Value, ()> {
    let rpc_url = contact_data.rpc_url(MANAGED_CRON_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(r#"{"p_execution_limit":50}"#),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let raw = response.json::<Value>().map_err(|_| ())?;
    Ok(normalize_managed_external_cron(&raw))
}

// ---------------------------------------------------------------------------
// Normalization helpers (mirrors managed-external-cron-monitoring.ts)
//
// Operated on `serde_json::Value` to avoid verbose typed-struct definitions.
// ---------------------------------------------------------------------------

fn clean_str(v: &Value) -> Option<String> {
    v.as_str()
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.trim().to_owned())
}

fn normalize_execution(v: &Value) -> Value {
    let id = clean_str(&v["id"]);
    let job_key = clean_str(&v["jobKey"]);
    let started_at = clean_str(&v["startedAt"]);
    let workspace_id = clean_str(&v["workspaceId"]);

    if id.is_none() || job_key.is_none() || started_at.is_none() || workspace_id.is_none() {
        return Value::Null;
    }

    let raw_status = clean_str(&v["status"]).unwrap_or_else(|| "failed".to_owned());
    let status = if matches!(
        raw_status.as_str(),
        "configuration_error" | "failed" | "skipped" | "success" | "timeout"
    ) {
        raw_status
    } else {
        "failed".to_owned()
    };
    let source = if v["source"].as_str() == Some("manual") {
        "manual"
    } else {
        "scheduled"
    };
    let job_key_ref = job_key.clone().unwrap_or_default();
    let response_summary = clean_str(&v["responseSummary"]).or_else(|| clean_str(&v["response"]));

    json!({
        "durationMs": v["durationMs"].as_f64().filter(|n| n.is_finite()),
        "endedAt": clean_str(&v["endedAt"]),
        "error": clean_str(&v["error"]),
        "httpStatus": v["httpStatus"].as_f64().filter(|n| n.is_finite()),
        "id": id,
        "jobKey": job_key,
        "jobName": clean_str(&v["jobName"]).unwrap_or(job_key_ref),
        "responseSummary": response_summary,
        "source": source,
        "startedAt": started_at,
        "status": status,
        "workspaceId": workspace_id,
    })
}

fn normalize_job(v: &Value) -> Value {
    let job_key = clean_str(&v["jobKey"]).unwrap_or_else(|| "unknown".to_owned());
    let schedule = clean_str(&v["schedule"]).unwrap_or_else(|| "* * * * *".to_owned());
    let schedule_timezone = clean_str(&v["scheduleTimezone"]).unwrap_or_else(|| "UTC".to_owned());
    let job_name = clean_str(&v["jobName"]).unwrap_or_else(|| job_key.clone());
    // scheduleDescription: prefer the pre-computed value; fall back to
    // "<schedule> (<timezone>)" to avoid pulling in a cron-parser dependency.
    let schedule_description = clean_str(&v["scheduleDescription"])
        .unwrap_or_else(|| format!("{schedule} ({schedule_timezone})"));
    let enabled = v["enabled"]
        .as_bool()
        .unwrap_or_else(|| v["active"].as_bool().unwrap_or(false));
    let last_execution = normalize_execution(&v["lastExecution"]);
    let failure_streak = v["failureStreak"]
        .as_f64()
        .filter(|n| n.is_finite())
        .unwrap_or(0.0);

    json!({
        "enabled": enabled,
        "failureStreak": failure_streak,
        "isOverdue": v["isOverdue"].as_bool().unwrap_or(false),
        "jobKey": job_key,
        "jobName": job_name,
        "lastExecution": last_execution,
        "nextRunAt": clean_str(&v["nextRunAt"]),
        "overdueReason": clean_str(&v["overdueReason"]),
        "overdueSince": clean_str(&v["overdueSince"]),
        "schedule": schedule,
        "scheduleDescription": schedule_description,
        "scheduleTimezone": schedule_timezone,
    })
}

fn normalize_app(app: &Value) -> Option<Value> {
    let external_app_id = clean_str(&app["externalAppId"])?;
    let workspace_id = clean_str(&app["workspaceId"])?;
    // Mirrors the `validateUUID` check in the legacy code.
    if workspace_id.len() != 36 || workspace_id.chars().filter(|c| *c == '-').count() != 4 {
        return None;
    }
    let status = &app["status"];
    let now = now_iso();
    let generated_at = clean_str(&status["generatedAt"]).unwrap_or_else(|| now.clone());
    let server_now = clean_str(&status["serverNow"]).unwrap_or_else(|| generated_at.clone());
    let jobs: Vec<Value> = status["jobs"]
        .as_array()
        .map(|arr| arr.iter().map(normalize_job).collect())
        .unwrap_or_default();

    Some(json!({
        // Gap: appDisplayName falls back to appId — listExternalApps() skipped.
        "appDisplayName": external_app_id,
        "appId": external_app_id,
        "configured": status["configured"].as_bool().unwrap_or(false),
        "enabled": status["enabled"].as_bool().unwrap_or(false),
        "generatedAt": generated_at,
        "jobs": jobs,
        "serverNow": server_now,
        "workspaceId": workspace_id,
    }))
}

fn normalize_managed_external_cron(raw: &Value) -> Value {
    let now = now_iso();
    let generated_at = clean_str(&raw["generatedAt"]).unwrap_or_else(|| now.clone());
    let server_now = clean_str(&raw["serverNow"]).unwrap_or_else(|| generated_at.clone());

    let apps: Vec<Value> = raw["apps"]
        .as_array()
        .map(|arr| arr.iter().filter_map(normalize_app).collect())
        .unwrap_or_default();

    let executions: Vec<Value> = raw["executions"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .map(normalize_execution)
                .filter(|v| !v.is_null())
                .collect()
        })
        .unwrap_or_default();

    json!({
        "apps": apps,
        "available": raw["available"].as_bool().unwrap_or(true),
        "error": clean_str(&raw["error"]),
        "executions": executions,
        "generatedAt": generated_at,
        "serverNow": server_now,
    })
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/// Produces a simple ISO-8601 UTC timestamp at second precision.
fn now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let sec = secs % 60;
    let min = (secs / 60) % 60;
    let hour = (secs / 3600) % 24;
    let (year, month, day) = days_to_ymd(secs / 86400);
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{min:02}:{sec:02}.000Z")
}

/// Converts days-since-Unix-epoch to (year, month, day).
///
/// Algorithm: <http://howardhinnant.github.io/date_algorithms.html>
fn days_to_ymd(days: u64) -> (u64, u64, u64) {
    let z = days + 719_468;
    let era = z / 146_097;
    let doe = z % 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
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

    #[test]
    fn path_constant_matches_route() {
        assert_eq!(
            INFRASTRUCTURE_MONITORING_CRON_PATH,
            "/api/v1/infrastructure/monitoring/cron"
        );
    }

    #[test]
    fn empty_cron_snapshot_shape() {
        let snap = empty_cron_snapshot();
        assert_eq!(snap["enabled"], true);
        assert_eq!(snap["status"], "missing");
        assert_eq!(snap["jobs"], json!([]));
        assert_eq!(snap["runs"], json!([]));
        assert_eq!(snap["retainedExecutionCount"], 0);
        assert_eq!(snap["updatedAt"], Value::Null);
        assert_eq!(snap["nextRunAt"], Value::Null);
        assert_eq!(snap["control"]["enabled"], true);
        assert_eq!(snap["recovery"]["consumer"], "none");
        assert_eq!(snap["recovery"]["canRequest"], true);
        assert_eq!(snap["recovery"]["directControl"]["configured"], false);
        assert_eq!(snap["source"]["runtimeDirAvailable"], false);
    }

    #[test]
    fn unavailable_managed_external_cron_shape() {
        let val = unavailable_managed_external_cron();
        assert_eq!(val["available"], false);
        assert_eq!(val["apps"], json!([]));
        assert_eq!(val["executions"], json!([]));
        assert!(val["generatedAt"].is_string());
        assert_eq!(
            val["error"],
            "Managed external cron monitoring is unavailable."
        );
    }

    #[test]
    fn clean_str_trims_and_filters_blank() {
        assert_eq!(
            clean_str(&Value::String("  hello  ".to_owned())),
            Some("hello".to_owned())
        );
        assert_eq!(clean_str(&Value::String("   ".to_owned())), None);
        assert_eq!(clean_str(&Value::Null), None);
    }

    #[test]
    fn days_to_ymd_unix_epoch() {
        assert_eq!(days_to_ymd(0), (1970, 1, 1));
    }

    #[test]
    fn days_to_ymd_known_date() {
        // 2024-01-01 = 19723 days since 1970-01-01
        assert_eq!(days_to_ymd(19723), (2024, 1, 1));
    }

    #[test]
    fn normalize_managed_external_cron_empty_raw() {
        let val = normalize_managed_external_cron(&json!({}));
        assert_eq!(val["apps"], json!([]));
        assert_eq!(val["available"], true);
        assert_eq!(val["executions"], json!([]));
        assert!(val["generatedAt"].is_string());
    }

    #[test]
    fn normalize_execution_rejects_incomplete() {
        // Missing `id` field → should return Null.
        let v = json!({
            "jobKey": "k",
            "startedAt": "2024-01-01T00:00:00Z",
            "workspaceId": "00000000-0000-0000-0000-000000000000",
        });
        assert!(normalize_execution(&v).is_null());
    }

    #[test]
    fn normalize_app_rejects_invalid_workspace_id() {
        let app = json!({
            "externalAppId": "app-1",
            "workspaceId": "not-a-uuid",
        });
        assert!(normalize_app(&app).is_none());
    }

    #[test]
    fn normalize_job_defaults() {
        let val = normalize_job(&json!({}));
        assert_eq!(val["jobKey"], "unknown");
        assert_eq!(val["schedule"], "* * * * *");
        assert_eq!(val["scheduleTimezone"], "UTC");
        assert_eq!(val["enabled"], false);
        assert_eq!(val["failureStreak"], 0.0);
        assert_eq!(val["isOverdue"], false);
    }
}
