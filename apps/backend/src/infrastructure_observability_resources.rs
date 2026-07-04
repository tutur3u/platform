//! Port of `GET /api/v1/infrastructure/observability/resources`.
//!
//! Legacy source:
//! `apps/web/src/app/api/v1/infrastructure/observability/resources/route.ts`.
//!
//! The legacy route delegates to `handleObservabilityRequest` (shared helper in
//! `apps/web/src/app/api/v1/infrastructure/observability/_shared.ts`), which:
//!
//! 1. Authorizes an "infrastructure viewer" (`view_infrastructure` permission in
//!    the ROOT workspace via `authorizeInfrastructureViewer`).
//! 2. Calls `readObservabilityResources(filters)` from
//!    `apps/web/src/lib/infrastructure/observability.ts`.
//! 3. Returns `NextResponse.json(result)` (no explicit cache headers).
//!
//! `readObservabilityResources` reads from two sources that are not available
//! inside a Cloudflare Worker:
//!
//! - A local PostgreSQL log-drain database (`usage_events` table for resource
//!   metric samples).
//! - The blue-green monitoring filesystem archive (`tmp/docker-web` on the
//!   deployment host), accessed via `readBlueGreenMonitoringSnapshot`.
//!
//! When both sources are unavailable the TypeScript implementation falls back to
//! a single "live" bucket constructed from `getCurrentResourceBucket`, which
//! uses `Date.now()` as `bucketStart` and the current docker metrics (all zero
//! in the Worker) for the resource fields. This handler faithfully reproduces
//! that empty shape, computing `bucketStart` from the current wall-clock time.
//!
//! # Auth
//!
//! The legacy route calls `authorizeInfrastructureViewer(request)` which
//! resolves to a `view_infrastructure` permission check on the root workspace
//! (`00000000-0000-0000-0000-000000000000`). This module uses
//! `authorize_workspace_permission` with the same permission string, mirroring
//! the pattern used in `infrastructure_observability_overview.rs`.
//!
//! # Behavior gaps vs. the legacy route
//!
//! - **Data gap**: real resource-metric samples from the log-drain Postgres
//!   database or the host-filesystem docker-resource snapshot are never
//!   returned. The handler always produces the empty shape described above.
//! - **Cache gap**: the legacy `NextResponse.json(data)` sets no explicit
//!   `Cache-Control` header; this handler adds `no-store`, consistent with
//!   every other infrastructure route in the backend.

use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::json;

use crate::{
    BackendConfig, BackendRequest, BackendResponse, json_response, no_store_response,
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const ROUTE_PATH: &str = "/api/v1/infrastructure/observability/resources";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const VIEW_INFRASTRUCTURE_PERMISSION: &str = "view_infrastructure";

/// Milliseconds between resource samples — matches `RESOURCE_SAMPLE_MIN_INTERVAL_MS`
/// in the legacy TypeScript (`60_000 ms = 1 minute`).
const RESOURCE_SAMPLE_MIN_INTERVAL_MS: u64 = 60_000;

pub(crate) async fn handle_infrastructure_observability_resources_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != ROUTE_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => resources_response(config, request, outbound).await,
        _ => return None,
    })
}

async fn resources_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
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
            return no_store_response(json_response(401, json!({ "message": "Unauthorized" })));
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden)
        | Err(WorkspacePermissionAuthorizationError::NotFound) => {
            return no_store_response(json_response(403, json!({ "message": "Forbidden" })));
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return no_store_response(json_response(
                500,
                json!({ "message": "Failed to load observability resources" }),
            ));
        }
    }

    let now_ms = current_time_ms();
    let payload = build_empty_resources(now_ms);

    no_store_response(json_response(200, payload))
}

/// Returns the current wall-clock time in milliseconds since the Unix epoch.
fn current_time_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Builds the empty `ObservabilityResources` shape produced when both the
/// log-drain Postgres database and the host-filesystem docker snapshot are
/// unavailable (the Worker context).
///
/// Mirrors `readObservabilityResources` with all sources returning nothing:
///
/// - A single live-only bucket at `bucketStart = now_ms` with all resource
///   metrics set to `0`.
/// - Empty docker-resources (no containers, no service health, state `"idle"`).
/// - Empty build-resources (no active builds, state `"idle"`).
/// - Sampling summaries with `status = "live-only"` and one bucket each.
fn build_empty_resources(now_ms: i64) -> serde_json::Value {
    let live_bucket = json!({
        "bucketStart": now_ms,
        "cpuPercent": 0,
        "hasLiveSample": true,
        "memoryBytes": 0,
        "rxBytes": 0,
        "sampleCount": 0,
        "txBytes": 0,
    });

    let sampling_summary = json!({
        "bucketCount": 1,
        "expectedIntervalMs": RESOURCE_SAMPLE_MIN_INTERVAL_MS,
        "gapBucketCount": 0,
        "latestSampleAgeMs": null,
        "latestSampleAt": null,
        "sampledBucketCount": 0,
        "status": "live-only",
    });

    json!({
        "buildBuckets": [live_bucket.clone()],
        "buildResources": {
            "activeBuilds": [],
            "containers": [],
            "state": "idle",
            "totalCpuPercent": 0,
            "totalMemoryBytes": 0,
            "totalRxBytes": 0,
            "totalTxBytes": 0,
        },
        "buckets": [live_bucket],
        "dockerResources": {
            "allContainers": [],
            "containers": [],
            "message": null,
            "serviceHealth": [],
            "state": "idle",
            "totalCpuPercent": 0,
            "totalMemoryBytes": 0,
            "totalRxBytes": 0,
            "totalTxBytes": 0,
        },
        "sampling": {
            "build": sampling_summary.clone(),
            "runtime": sampling_summary,
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- path guard ---

    #[test]
    fn path_exact_match() {
        assert_eq!(ROUTE_PATH, "/api/v1/infrastructure/observability/resources");
    }

    #[test]
    fn path_with_trailing_slash_does_not_match() {
        let path = "/api/v1/infrastructure/observability/resources/";
        assert_ne!(path, ROUTE_PATH);
    }

    #[test]
    fn path_sibling_does_not_match() {
        let path = "/api/v1/infrastructure/observability/overview";
        assert_ne!(path, ROUTE_PATH);
    }

    #[test]
    fn path_parent_does_not_match() {
        let path = "/api/v1/infrastructure/observability";
        assert_ne!(path, ROUTE_PATH);
    }

    // --- build_empty_resources shape ---

    #[test]
    fn empty_resources_has_single_runtime_bucket() {
        let result = build_empty_resources(1_000_000_i64);
        let buckets = result["buckets"].as_array().unwrap();
        assert_eq!(buckets.len(), 1);
    }

    #[test]
    fn empty_resources_has_single_build_bucket() {
        let result = build_empty_resources(1_000_000_i64);
        let build_buckets = result["buildBuckets"].as_array().unwrap();
        assert_eq!(build_buckets.len(), 1);
    }

    #[test]
    fn runtime_bucket_start_matches_now_ms() {
        let now_ms = 1_234_567_890_i64;
        let result = build_empty_resources(now_ms);
        let bucket_start = result["buckets"][0]["bucketStart"].as_i64().unwrap();
        assert_eq!(bucket_start, now_ms);
    }

    #[test]
    fn build_bucket_start_matches_now_ms() {
        let now_ms = 9_876_543_210_i64;
        let result = build_empty_resources(now_ms);
        let bucket_start = result["buildBuckets"][0]["bucketStart"].as_i64().unwrap();
        assert_eq!(bucket_start, now_ms);
    }

    #[test]
    fn runtime_bucket_has_live_sample() {
        let result = build_empty_resources(1_000_i64);
        assert_eq!(result["buckets"][0]["hasLiveSample"], true);
    }

    #[test]
    fn runtime_bucket_zero_metrics() {
        let result = build_empty_resources(0_i64);
        let bucket = &result["buckets"][0];
        assert_eq!(bucket["cpuPercent"].as_i64(), Some(0));
        assert_eq!(bucket["memoryBytes"].as_i64(), Some(0));
        assert_eq!(bucket["rxBytes"].as_i64(), Some(0));
        assert_eq!(bucket["txBytes"].as_i64(), Some(0));
        assert_eq!(bucket["sampleCount"].as_i64(), Some(0));
    }

    #[test]
    fn docker_resources_empty() {
        let result = build_empty_resources(0_i64);
        let dr = &result["dockerResources"];
        assert!(dr["allContainers"].as_array().unwrap().is_empty());
        assert!(dr["containers"].as_array().unwrap().is_empty());
        assert!(dr["serviceHealth"].as_array().unwrap().is_empty());
        assert!(dr["message"].is_null());
        assert_eq!(dr["state"], "idle");
        assert_eq!(dr["totalCpuPercent"].as_i64(), Some(0));
    }

    #[test]
    fn build_resources_empty() {
        let result = build_empty_resources(0_i64);
        let br = &result["buildResources"];
        assert!(br["activeBuilds"].as_array().unwrap().is_empty());
        assert!(br["containers"].as_array().unwrap().is_empty());
        assert_eq!(br["state"], "idle");
        assert_eq!(br["totalCpuPercent"].as_i64(), Some(0));
    }

    #[test]
    fn sampling_runtime_is_live_only() {
        let result = build_empty_resources(0_i64);
        let s = &result["sampling"]["runtime"];
        assert_eq!(s["status"], "live-only");
        assert_eq!(s["bucketCount"].as_i64(), Some(1));
        assert_eq!(s["sampledBucketCount"].as_i64(), Some(0));
        assert_eq!(s["gapBucketCount"].as_i64(), Some(0));
        assert!(s["latestSampleAt"].is_null());
        assert!(s["latestSampleAgeMs"].is_null());
        assert_eq!(
            s["expectedIntervalMs"].as_u64(),
            Some(RESOURCE_SAMPLE_MIN_INTERVAL_MS)
        );
    }

    #[test]
    fn sampling_build_is_live_only() {
        let result = build_empty_resources(0_i64);
        let s = &result["sampling"]["build"];
        assert_eq!(s["status"], "live-only");
        assert_eq!(s["bucketCount"].as_i64(), Some(1));
    }
}
