//! Handler for `GET /api/v1/workspaces/:wsId/external-apps/cron/executions`.
//!
//! Ports (partially) the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/external-apps/cron/executions/route.ts`.
//!
//! ## Legacy behavior
//!
//! The GET handler delegates to
//! `handleExternalAppWorkspaceCronRoute` with `operation: 'history'` and
//! `requiredScopes: ['workspace:cron:read']`, then to
//! `loadExternalAppWorkspaceCronExecutions`. The access check, in order:
//!
//!   1. `getBearerAppCoordinationToken(request)` — read the `Authorization`
//!      header only (no cookies); require a `bearer ` prefix and a token that
//!      starts with the app-coordination prefix (`ttr_app_`). Missing -> `401`
//!      `{ "error": "Unauthorized" }`.
//!   2. `verifyAppCoordinationToken(token)` — HMAC-SHA256 signature + claim
//!      validation. Invalid -> `401 Unauthorized`.
//!   3. `hasScope(...)` for `workspace:cron:read` (with `*` / `:*` wildcards)
//!      -> `403 { "error": "Requested scope is not allowed for this app" }`.
//!   4. `getExternalAppById(target_app)` and `app.enabled` -> `403 Forbidden`.
//!   5. `normalizeWorkspaceIdForUser` (resolve alias/handle/personal) ->
//!      `403 Forbidden` on failure.
//!   6. `app.allowedWorkspaceIds.includes(...)` -> `403` with
//!      `{ "error": "Managed scheduler approval required",
//!         "code": "CRON_APPROVAL_REQUIRED", ... }`.
//!   7. `verifyWorkspaceMembershipType('MEMBER')` ->
//!      `500 { "error": "Failed to verify workspace membership" }` on lookup
//!      failure, `403 Forbidden` otherwise.
//!   8. `getPermissions(...)` -> `403 Forbidden` when null or missing
//!      required workspace permissions.
//!
//! On success: calls `callManagedCronRpc('external_app_managed_cron_executions',
//! { p_external_app_id, p_external_job_key, p_limit, p_offset, p_ws_id })`
//! and returns a paginated JSON body:
//!
//! ```json
//! {
//!   "hasNextPage": <bool>,
//!   "hasPreviousPage": <bool>,
//!   "items": [...],
//!   "limit": <number>,
//!   "offset": <number>,
//!   "page": <number>,
//!   "pageCount": <number>,
//!   "total": <number>
//! }
//! ```
//!
//! ## Behavior gaps (deliberate, documented)
//!
//! This route's auth model is the app-coordination JWT with wildcard scope
//! matching — it matches NONE of the shared backend auth helpers
//! (`authorize_workspace_permission`, `authorize_finance_permission`,
//! `authorize_root_workspace_read_access`), all of which expect a Supabase
//! session / workspace-permission string rather than a scoped app token.
//!
//! The success body depends on `callManagedCronRpc` invoking the
//! `external_app_managed_cron_executions` PL/pgSQL RPC with validated,
//! app-coordination-JWT-derived parameters (`target_app`, normalized workspace
//! id, scope-verified user id). Reproducing that verification + RPC call
//! faithfully would require porting the full HMAC-SHA256 token verification,
//! scope checking, app lookup, workspace normalization, and membership checks —
//! far beyond this module's budget.
//!
//! To stay strictly behavior-preserving and never break a live external-app
//! integration, this handler only short-circuits the one rejection that is pure,
//! deterministic, and free of any cryptographic guesswork: a request with no
//! valid-form app-coordination bearer token is rejected with the exact legacy
//! `401 { "error": "Unauthorized" }`. Every request that *does* carry a
//! well-formed `ttr_app_` bearer token falls through (returns `None`) to the
//! still-live Next.js route, which performs full verification and serves the
//! paginated execution history. Non-GET methods also fall through.

use serde_json::json;

use crate::{BackendConfig, BackendRequest, BackendResponse, json_response, no_store_response};

const CRON_EXECUTIONS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const CRON_EXECUTIONS_PATH_SUFFIX: &str = "/external-apps/cron/executions";

/// `TOKEN_PREFIX` from `@tuturuuu/auth/app-coordination`
/// (`isAppCoordinationToken`).
const APP_COORDINATION_TOKEN_PREFIX: &str = "ttr_app_";

/// HTTP `bearer ` scheme prefix (7 bytes), matched case-insensitively to mirror
/// the legacy `authorization.toLowerCase().startsWith('bearer ')` check.
const BEARER_PREFIX_LEN: usize = 7;

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";

pub(crate) async fn handle_workspaces_wsid_external_apps_cron_executions_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<BackendResponse> {
    // PATH GUARD: only the verbatim legacy mount path. Anything else -> None so
    // other handlers / Next.js keep running.
    cron_executions_ws_id(request.path)?;

    // The authenticated success path is served by the live Next.js route, so we
    // do not need the Supabase config or outbound client here. Bind them so the
    // exact required signature compiles without unused-variable warnings.
    let _ = (config, outbound);

    Some(match request.method {
        // GET is the only method this route owns. We may still defer to Next.js
        // (None) for authenticated requests; see the module doc comment.
        "GET" => match cron_executions_get_response(request) {
            Some(response) => response,
            None => return None,
        },
        // POST / PATCH / DELETE etc. remain on the live Next.js route.
        _ => return None,
    })
}

/// Returns `Some(401)` for a request lacking a valid-form app-coordination
/// bearer token (faithful to `getBearerAppCoordinationToken` returning `null`),
/// or `None` to defer to the live Next.js route for full verification + body.
fn cron_executions_get_response(request: BackendRequest<'_>) -> Option<BackendResponse> {
    if bearer_app_coordination_token(request.authorization).is_none() {
        return Some(unauthorized_response());
    }

    // Well-formed token present: defer the heavy verification + RPC execution
    // snapshot to Next.js so behavior stays identical.
    None
}

/// Mirrors `getBearerAppCoordinationToken`: read the `Authorization` header
/// only, require a case-insensitive `bearer ` prefix, then require the token to
/// start with the app-coordination prefix (`isAppCoordinationToken`).
fn bearer_app_coordination_token(authorization: Option<&str>) -> Option<&str> {
    let authorization = authorization?;

    // `get(..7)` returns None on a short string or a non-char-boundary, avoiding
    // any slice panic; the scheme prefix is pure ASCII so this is exact.
    let scheme = authorization.get(..BEARER_PREFIX_LEN)?;
    if !scheme.eq_ignore_ascii_case("bearer ") {
        return None;
    }

    let token = authorization[BEARER_PREFIX_LEN..].trim();

    token
        .starts_with(APP_COORDINATION_TOKEN_PREFIX)
        .then_some(token)
}

/// Mirrors `accessError('Unauthorized', 401)`: `{ "error": "Unauthorized" }`.
fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(401, json!({ "error": UNAUTHORIZED_MESSAGE })))
}

/// Extracts the `wsId` segment from the legacy mount path, or `None` when the
/// path is not this exact route. The `wsId` must be non-empty and contain no
/// further path separators.
fn cron_executions_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(CRON_EXECUTIONS_PATH_PREFIX)?
        .strip_suffix(CRON_EXECUTIONS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ws_id_extracted_from_canonical_path() {
        assert_eq!(
            cron_executions_ws_id("/api/v1/workspaces/ws-123/external-apps/cron/executions"),
            Some("ws-123")
        );
    }

    #[test]
    fn ws_id_accepts_alias_segment() {
        assert_eq!(
            cron_executions_ws_id("/api/v1/workspaces/personal/external-apps/cron/executions"),
            Some("personal")
        );
    }

    #[test]
    fn ws_id_accepts_uuid_segment() {
        assert_eq!(
            cron_executions_ws_id(
                "/api/v1/workspaces/550e8400-e29b-41d4-a716-446655440000/external-apps/cron/executions"
            ),
            Some("550e8400-e29b-41d4-a716-446655440000")
        );
    }

    #[test]
    fn ws_id_rejects_wrong_prefix() {
        // No `/v1` segment.
        assert_eq!(
            cron_executions_ws_id("/api/workspaces/ws-123/external-apps/cron/executions"),
            None
        );
    }

    #[test]
    fn ws_id_rejects_wrong_suffix() {
        assert_eq!(
            cron_executions_ws_id("/api/v1/workspaces/ws-123/external-apps/cron"),
            None
        );
        assert_eq!(
            cron_executions_ws_id("/api/v1/workspaces/ws-123/external-apps/cron/executions/extra"),
            None
        );
        assert_eq!(
            cron_executions_ws_id("/api/v1/workspaces/ws-123/external-apps/members"),
            None
        );
    }

    #[test]
    fn ws_id_rejects_empty_or_nested_segment() {
        assert_eq!(
            cron_executions_ws_id("/api/v1/workspaces//external-apps/cron/executions"),
            None
        );
        assert_eq!(
            cron_executions_ws_id("/api/v1/workspaces/a/b/external-apps/cron/executions"),
            None
        );
    }

    #[test]
    fn bearer_token_requires_app_coordination_prefix() {
        assert_eq!(
            bearer_app_coordination_token(Some("Bearer ttr_app_abc.def.ghi")),
            Some("ttr_app_abc.def.ghi")
        );
        // Case-insensitive scheme, mirroring the legacy lowercased check.
        assert_eq!(
            bearer_app_coordination_token(Some("bEaReR ttr_app_xyz")),
            Some("ttr_app_xyz")
        );
        // Surrounding whitespace is trimmed (legacy `.slice(7).trim()`).
        assert_eq!(
            bearer_app_coordination_token(Some("Bearer   ttr_app_trim  ")),
            Some("ttr_app_trim")
        );
    }

    #[test]
    fn bearer_token_rejected_when_absent_or_non_app_coordination() {
        assert_eq!(bearer_app_coordination_token(None), None);
        // Missing scheme.
        assert_eq!(bearer_app_coordination_token(Some("ttr_app_abc")), None);
        // Wrong scheme.
        assert_eq!(
            bearer_app_coordination_token(Some("Basic ttr_app_abc")),
            None
        );
        // Bearer token that is not an app-coordination token (e.g. Supabase JWT).
        assert_eq!(
            bearer_app_coordination_token(Some("Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig")),
            None
        );
        // Too short to hold the scheme prefix.
        assert_eq!(bearer_app_coordination_token(Some("bear")), None);
    }

    #[test]
    fn unauthorized_response_matches_legacy_shape() {
        let response = unauthorized_response();
        assert_eq!(response.status, 401);
        assert_eq!(response.body, json!({ "error": "Unauthorized" }));
        // `no_store_response` applies the shared no-store cache directive.
        assert_eq!(
            response.cache_control,
            Some("no-store, no-cache, must-revalidate")
        );
    }

    #[test]
    fn missing_token_yields_unauthorized() {
        let request = BackendRequest {
            authorization: None,
            body_text: None,
            cookie: None,
            method: "GET",
            origin: None,
            path: "/api/v1/workspaces/ws-1/external-apps/cron/executions",
            referer: None,
            request_id: None,
            url: None,
        };
        let response = cron_executions_get_response(request)
            .expect("missing bearer token must short-circuit to 401");
        assert_eq!(response.status, 401);
    }

    #[test]
    fn well_formed_token_defers_to_nextjs() {
        let request = BackendRequest {
            authorization: Some("Bearer ttr_app_abc.def.ghi"),
            body_text: None,
            cookie: None,
            method: "GET",
            origin: None,
            path: "/api/v1/workspaces/ws-1/external-apps/cron/executions",
            referer: None,
            request_id: None,
            url: None,
        };
        assert!(cron_executions_get_response(request).is_none());
    }

    #[test]
    fn supabase_jwt_yields_unauthorized() {
        let request = BackendRequest {
            authorization: Some("Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig"),
            body_text: None,
            cookie: None,
            method: "GET",
            origin: None,
            path: "/api/v1/workspaces/ws-1/external-apps/cron/executions",
            referer: None,
            request_id: None,
            url: None,
        };
        let response = cron_executions_get_response(request)
            .expect("Supabase JWT must short-circuit to 401 (not an app-coordination token)");
        assert_eq!(response.status, 401);
    }
}
