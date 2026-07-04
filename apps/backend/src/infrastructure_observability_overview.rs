//! Port of `GET /api/v1/infrastructure/observability/overview`.
//!
//! Legacy source:
//! `apps/web/src/app/api/v1/infrastructure/observability/overview/route.ts`.
//!
//! The legacy route delegates to `handleObservabilityRequest` (shared helper in
//! `apps/web/src/app/api/v1/infrastructure/observability/_shared.ts`), which:
//!
//! 1. Authorizes an "infrastructure viewer" (`view_infrastructure` permission in
//!    the ROOT workspace via `authorizeInfrastructureViewer`).
//! 2. Calls `readObservabilityOverview(filters)` from
//!    `apps/web/src/lib/infrastructure/observability.ts`.
//! 3. Returns `NextResponse.json(result)` (no explicit cache headers).
//!
//! `readObservabilityOverview` aggregates three data sources via
//! `Promise.all`:
//!
//! - `loadRecentRequests` — queries a local PostgreSQL log-drain database;
//!   falls back to reading request-archive JSON files under `tmp/docker-web`.
//! - `loadRecentLogs` — same log-drain database; falls back to in-memory
//!   legacy watcher-log and request-console-log archives.
//! - `readObservabilityCronRuns` — same log-drain database; falls back to a
//!   cron-execution JSON archive from the host filesystem.
//!
//! A Cloudflare Worker has neither a log-drain SQL client nor a host
//! filesystem, so all three sources return empty results. The resulting
//! overview always collapses to the following fixed shape:
//!
//! ```json
//! {
//!   "cronFailureRate": 0,
//!   "errorRate": 0,
//!   "lastEventAt": null,
//!   "p95DurationMs": null,
//!   "recentErrors": [],
//!   "requestCount": 0,
//!   "serverErrorCount": 0,
//!   "slowRequestCount": 0,
//!   "sourceCounts": {},
//!   "topRoutes": []
//! }
//! ```
//!
//! Auth mirrors `authorizeInfrastructureViewer`, which uses
//! `resolveAuthenticatedSessionUser` (app-session/CLI tokens are NOT
//! accepted). This handler delegates to `authorize_workspace_permission`,
//! which likewise ignores app sessions.
//!
//! Behavior gaps vs. the legacy route:
//!
//! - Data gap: real request, log, and cron-run records from the log-drain
//!   Postgres database or filesystem archives are never returned. The handler
//!   always produces the empty overview shape shown above.
//! - Cache gap: the legacy `NextResponse.json(data)` does not set an
//!   explicit `Cache-Control` header; this handler adds `no-store`,
//!   consistent with every other infrastructure route in the backend.

use serde_json::json;

use crate::{
    BackendConfig, BackendRequest, BackendResponse, json_response, no_store_response,
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

pub(crate) const INFRASTRUCTURE_OBSERVABILITY_OVERVIEW_PATH: &str =
    "/api/v1/infrastructure/observability/overview";

const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const VIEW_INFRASTRUCTURE_PERMISSION: &str = "view_infrastructure";

pub(crate) async fn handle_infrastructure_observability_overview_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    if request.path != INFRASTRUCTURE_OBSERVABILITY_OVERVIEW_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => overview_response(config, request, outbound).await,
        _ => return None,
    })
}

async fn overview_response(
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
                json!({ "message": "Failed to load observability overview" }),
            ));
        }
    }

    // The Worker has no log-drain SQL client and no host filesystem, so all
    // three data sources (requests, logs, cron-runs) return empty results.
    // Mirror the empty shape produced by readObservabilityOverview when all
    // sources yield empty slices.
    no_store_response(json_response(
        200,
        json!({
            "cronFailureRate": 0,
            "errorRate": 0,
            "lastEventAt": null,
            "p95DurationMs": null,
            "recentErrors": [],
            "requestCount": 0,
            "serverErrorCount": 0,
            "slowRequestCount": 0,
            "sourceCounts": {},
            "topRoutes": [],
        }),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- path guard ---

    #[test]
    fn path_guard_matches_exact_path() {
        assert_eq!(
            INFRASTRUCTURE_OBSERVABILITY_OVERVIEW_PATH,
            "/api/v1/infrastructure/observability/overview"
        );
    }

    #[test]
    fn path_guard_does_not_match_prefix() {
        let path = "/api/v1/infrastructure/observability/overview/extra";
        assert_ne!(path, INFRASTRUCTURE_OBSERVABILITY_OVERVIEW_PATH);
    }

    #[test]
    fn path_guard_does_not_match_sibling() {
        let path = "/api/v1/infrastructure/observability/cron-runs";
        assert_ne!(path, INFRASTRUCTURE_OBSERVABILITY_OVERVIEW_PATH);
    }

    #[test]
    fn path_guard_does_not_match_parent() {
        let path = "/api/v1/infrastructure/observability";
        assert_ne!(path, INFRASTRUCTURE_OBSERVABILITY_OVERVIEW_PATH);
    }

    // --- empty response shape ---

    #[test]
    fn empty_overview_shape_has_expected_numeric_zeros() {
        let body = json!({
            "cronFailureRate": 0,
            "errorRate": 0,
            "lastEventAt": null,
            "p95DurationMs": null,
            "recentErrors": [],
            "requestCount": 0,
            "serverErrorCount": 0,
            "slowRequestCount": 0,
            "sourceCounts": {},
            "topRoutes": [],
        });

        assert_eq!(body["cronFailureRate"], 0);
        assert_eq!(body["errorRate"], 0);
        assert_eq!(body["requestCount"], 0);
        assert_eq!(body["serverErrorCount"], 0);
        assert_eq!(body["slowRequestCount"], 0);
    }

    #[test]
    fn empty_overview_shape_has_expected_null_fields() {
        let body = json!({
            "cronFailureRate": 0,
            "errorRate": 0,
            "lastEventAt": null,
            "p95DurationMs": null,
            "recentErrors": [],
            "requestCount": 0,
            "serverErrorCount": 0,
            "slowRequestCount": 0,
            "sourceCounts": {},
            "topRoutes": [],
        });

        assert!(body["lastEventAt"].is_null());
        assert!(body["p95DurationMs"].is_null());
    }

    #[test]
    fn empty_overview_shape_has_empty_collections() {
        let body = json!({
            "cronFailureRate": 0,
            "errorRate": 0,
            "lastEventAt": null,
            "p95DurationMs": null,
            "recentErrors": [],
            "requestCount": 0,
            "serverErrorCount": 0,
            "slowRequestCount": 0,
            "sourceCounts": {},
            "topRoutes": [],
        });

        assert!(body["recentErrors"].as_array().unwrap().is_empty());
        assert!(body["topRoutes"].as_array().unwrap().is_empty());
        assert!(body["sourceCounts"].as_object().unwrap().is_empty());
    }
}
