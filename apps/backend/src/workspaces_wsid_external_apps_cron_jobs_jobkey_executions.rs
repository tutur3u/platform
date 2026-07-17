//! Handler for `GET /api/v1/workspaces/:wsId/external-apps/cron/jobs/:jobKey/executions`.
//!
//! Ports the GET handler from the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/external-apps/cron/jobs/[jobKey]/executions/route.ts`.
//!
//! # Auth model
//!
//! The legacy route authenticates callers via a scoped app-coordination JWT
//! (`ttr_app_` prefixed bearer token). The full verification chain is:
//!
//! 1. `getBearerAppCoordinationToken(request)` — read the `Authorization` header;
//!    require a case-insensitive `bearer ` prefix and a token starting with `ttr_app_`.
//!    Missing or malformed -> `401 { "error": "Unauthorized" }`.
//! 2. `verifyAppCoordinationToken(token)` — HMAC-SHA256 signature + claim
//!    validation. Invalid -> `401 Unauthorized`.
//! 3. `hasScope(...)` for `workspace:cron:read` -> `403` when missing.
//! 4. `getExternalAppById(target_app)` and `app.enabled` -> `403 Forbidden`.
//! 5. `normalizeWorkspaceIdForUser` (alias/handle/personal resolution) ->
//!    `403 Forbidden` on failure.
//! 6. `app.allowedWorkspaceIds.includes(...)` -> `403` with approval-required body.
//! 7. `verifyWorkspaceMembershipType('MEMBER')` -> `500` / `403`.
//! 8. `getPermissions(...)` -> `403 Forbidden` when null or missing workspace
//!    management permissions.
//!
//! # Success response shape
//!
//! Calls the Supabase RPC `external_app_managed_cron_executions` with params
//! derived from query string (`page`, `pageSize`) and the path `jobKey`. Returns:
//!
//! ```json
//! {
//!   "hasNextPage": bool,
//!   "hasPreviousPage": bool,
//!   "items": [...],
//!   "limit": number,
//!   "offset": number,
//!   "page": number,
//!   "pageCount": number,
//!   "total": number
//! }
//! ```
//!
//! # Behavior gaps
//!
//! The app-coordination token verification requires HMAC-SHA256 cryptography
//! over a shared secret that is not accessible from this crate, and the full
//! success path calls the Supabase RPC `external_app_managed_cron_executions`
//! which requires verified external-app identity obtained from that same token.
//! Reproducing the complete verified path faithfully is not possible without
//! those primitives.
//!
//! Following the pattern of the sibling handler
//! `workspaces_wsid_external_apps_members`, this handler only short-circuits the
//! one rejection that is pure and deterministic: a request without a valid-form
//! `ttr_app_` bearer token is immediately returned `401 { "error": "Unauthorized" }`.
//! Any request carrying a well-formed app-coordination bearer token falls through
//! (`None`) to the still-live Next.js route, which performs full verification,
//! RPC execution, and response serialization. Non-GET methods always fall through.

use serde_json::json;

use crate::{BackendConfig, BackendRequest, BackendResponse, json_response, no_store_response};

/// HTTP `bearer ` scheme prefix (7 bytes), matched case-insensitively.
const BEARER_PREFIX_LEN: usize = 7;

/// Token prefix from `@tuturuuu/auth/app-coordination` (`isAppCoordinationToken`).
const APP_COORDINATION_TOKEN_PREFIX: &str = "ttr_app_";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";

pub(crate) async fn handle_workspaces_wsid_external_apps_cron_jobs_jobkey_executions_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<BackendResponse> {
    // PATH GUARD: match exactly
    // /api/v1/workspaces/:wsId/external-apps/cron/jobs/:jobKey/executions
    extract_ws_id_and_job_key(request.path)?;

    // The Supabase config and outbound client are not needed for the partial
    // port; bind them to avoid unused-variable warnings without triggering
    // unused-import errors.
    let _ = (config, outbound);

    Some(match request.method {
        "GET" => match executions_get_response(request) {
            Some(response) => response,
            None => return None,
        },
        // POST / PATCH / DELETE / PUT etc. remain on the live Next.js route.
        _ => return None,
    })
}

/// Returns `Some(401)` when the request lacks a valid-form app-coordination
/// bearer token (mirrors `getBearerAppCoordinationToken` returning `null`).
/// Returns `None` to defer to the live Next.js route for full verification.
fn executions_get_response(request: BackendRequest<'_>) -> Option<BackendResponse> {
    if bearer_app_coordination_token(request.authorization).is_none() {
        return Some(unauthorized_response());
    }

    // Well-formed token present: defer heavy verification + RPC to Next.js.
    None
}

/// Mirrors `getBearerAppCoordinationToken`: read the `Authorization` header
/// only, require a case-insensitive `bearer ` prefix, then require the token to
/// start with `ttr_app_` (`isAppCoordinationToken`).
fn bearer_app_coordination_token(authorization: Option<&str>) -> Option<&str> {
    let authorization = authorization?;

    let scheme = authorization.get(..BEARER_PREFIX_LEN)?;
    if !scheme.eq_ignore_ascii_case("bearer ") {
        return None;
    }

    let token = authorization[BEARER_PREFIX_LEN..].trim();
    token
        .starts_with(APP_COORDINATION_TOKEN_PREFIX)
        .then_some(token)
}

/// Returns `401 { "error": "Unauthorized" }` with no-store cache control.
fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(401, json!({ "error": UNAUTHORIZED_MESSAGE })))
}

/// Extracts `(ws_id, job_key)` from a path matching
/// `/api/v1/workspaces/:wsId/external-apps/cron/jobs/:jobKey/executions`.
///
/// Returns `None` if the path does not match.
fn extract_ws_id_and_job_key(path: &str) -> Option<(&str, &str)> {
    let segments: Vec<&str> = path
        .trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect();

    // Expected segments (0-indexed):
    //   0: api
    //   1: v1
    //   2: workspaces
    //   3: :wsId
    //   4: external-apps
    //   5: cron
    //   6: jobs
    //   7: :jobKey
    //   8: executions
    let matched = segments.len() == 9
        && segments.first().copied() == Some("api")
        && segments.get(1).copied() == Some("v1")
        && segments.get(2).copied() == Some("workspaces")
        && segments.get(3).map(|s| !s.is_empty()).unwrap_or(false)
        && segments.get(4).copied() == Some("external-apps")
        && segments.get(5).copied() == Some("cron")
        && segments.get(6).copied() == Some("jobs")
        && segments.get(7).map(|s| !s.is_empty()).unwrap_or(false)
        && segments.get(8).copied() == Some("executions");

    matched.then(|| {
        // Safety: all indices are bounds-checked in the `matched` guard above.
        (segments[3], segments[7])
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- path extraction ---

    #[test]
    fn extracts_valid_path() {
        let result = extract_ws_id_and_job_key(
            "/api/v1/workspaces/ws-abc/external-apps/cron/jobs/process-queue/executions",
        );
        assert_eq!(result, Some(("ws-abc", "process-queue")));
    }

    #[test]
    fn extracts_valid_path_no_leading_slash() {
        let result = extract_ws_id_and_job_key(
            "api/v1/workspaces/ws-abc/external-apps/cron/jobs/process-queue/executions",
        );
        assert_eq!(result, Some(("ws-abc", "process-queue")));
    }

    #[test]
    fn extracts_valid_path_trailing_slash() {
        let result = extract_ws_id_and_job_key(
            "/api/v1/workspaces/ws-abc/external-apps/cron/jobs/process-queue/executions/",
        );
        assert_eq!(result, Some(("ws-abc", "process-queue")));
    }

    #[test]
    fn extracts_uuid_ids() {
        let ws_id = "550e8400-e29b-41d4-a716-446655440000";
        let job_key = "enqueue-tracked-sources";
        let path =
            format!("/api/v1/workspaces/{ws_id}/external-apps/cron/jobs/{job_key}/executions");
        assert_eq!(extract_ws_id_and_job_key(&path), Some((ws_id, job_key)));
    }

    #[test]
    fn rejects_short_path_missing_executions() {
        // Missing the final `executions` segment.
        let result = extract_ws_id_and_job_key(
            "/api/v1/workspaces/ws-abc/external-apps/cron/jobs/process-queue",
        );
        assert_eq!(result, None);
    }

    #[test]
    fn rejects_extra_segment() {
        let result = extract_ws_id_and_job_key(
            "/api/v1/workspaces/ws-abc/external-apps/cron/jobs/process-queue/executions/extra",
        );
        assert_eq!(result, None);
    }

    #[test]
    fn rejects_wrong_prefix() {
        let result = extract_ws_id_and_job_key(
            "/api/v2/workspaces/ws-abc/external-apps/cron/jobs/process-queue/executions",
        );
        assert_eq!(result, None);
    }

    #[test]
    fn rejects_wrong_static_segments() {
        // `cron` replaced with `scheduled`.
        let result = extract_ws_id_and_job_key(
            "/api/v1/workspaces/ws-abc/external-apps/scheduled/jobs/process-queue/executions",
        );
        assert_eq!(result, None);
    }

    #[test]
    fn rejects_empty_ws_id() {
        // Double slash produces empty segment filtered out, changing segment count.
        let result = extract_ws_id_and_job_key(
            "/api/v1/workspaces//external-apps/cron/jobs/process-queue/executions",
        );
        assert_eq!(result, None);
    }

    #[test]
    fn rejects_empty_job_key() {
        let result = extract_ws_id_and_job_key(
            "/api/v1/workspaces/ws-abc/external-apps/cron/jobs//executions",
        );
        assert_eq!(result, None);
    }

    // --- bearer token extraction ---

    #[test]
    fn bearer_token_accepted_with_app_coordination_prefix() {
        assert_eq!(
            bearer_app_coordination_token(Some("Bearer ttr_app_abc.def.ghi")),
            Some("ttr_app_abc.def.ghi")
        );
    }

    #[test]
    fn bearer_token_case_insensitive_scheme() {
        assert_eq!(
            bearer_app_coordination_token(Some("bEaReR ttr_app_xyz")),
            Some("ttr_app_xyz")
        );
    }

    #[test]
    fn bearer_token_trims_surrounding_whitespace() {
        assert_eq!(
            bearer_app_coordination_token(Some("Bearer   ttr_app_trim  ")),
            Some("ttr_app_trim")
        );
    }

    #[test]
    fn bearer_token_rejected_when_absent() {
        assert_eq!(bearer_app_coordination_token(None), None);
    }

    #[test]
    fn bearer_token_rejected_without_scheme() {
        assert_eq!(bearer_app_coordination_token(Some("ttr_app_abc")), None);
    }

    #[test]
    fn bearer_token_rejected_wrong_scheme() {
        assert_eq!(
            bearer_app_coordination_token(Some("Basic ttr_app_abc")),
            None
        );
    }

    #[test]
    fn bearer_token_rejected_non_app_coordination_jwt() {
        assert_eq!(
            bearer_app_coordination_token(Some("Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig")),
            None
        );
    }

    #[test]
    fn bearer_token_rejected_too_short() {
        assert_eq!(bearer_app_coordination_token(Some("bear")), None);
    }

    // --- unauthorized response shape ---

    #[test]
    fn unauthorized_response_matches_legacy_shape() {
        let response = unauthorized_response();
        assert_eq!(response.status, 401);
        assert_eq!(response.body, json!({ "error": "Unauthorized" }));
        assert_eq!(
            response.cache_control,
            Some("no-store, no-cache, must-revalidate")
        );
    }

    // --- get response logic ---

    #[test]
    fn missing_token_yields_401() {
        let request = BackendRequest {
            authorization: None,
            body_text: None,
            cookie: None,
            if_none_match: None,
            method: "GET",
            origin: None,
            path: "/api/v1/workspaces/ws-1/external-apps/cron/jobs/process-queue/executions",
            referer: None,
            request_id: None,
            url: None,
        };
        let response = executions_get_response(request)
            .expect("missing bearer token must short-circuit to 401");
        assert_eq!(response.status, 401);
    }

    #[test]
    fn well_formed_token_defers_to_nextjs() {
        let request = BackendRequest {
            authorization: Some("Bearer ttr_app_abc.def.ghi"),
            body_text: None,
            cookie: None,
            if_none_match: None,
            method: "GET",
            origin: None,
            path: "/api/v1/workspaces/ws-1/external-apps/cron/jobs/process-queue/executions",
            referer: None,
            request_id: None,
            url: None,
        };
        assert!(executions_get_response(request).is_none());
    }
}
