//! Handler for `GET /api/v1/workspaces/:wsId/external-apps/members`.
//!
//! Ports (partially) the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/external-apps/members/route.ts`.
//!
//! ## Legacy behavior
//!
//! The GET handler delegates to
//! `@/lib/external-apps/workspace-members.requireExternalAppWorkspaceMembersAccess`
//! (requiring scopes `workspace:members:read` + `workspace:roles:read`) and then
//! `loadExternalAppWorkspaceMembers`. The access check, in order:
//!   1. `getBearerAppCoordinationToken(request)` — read the `Authorization`
//!      header only (no cookies); require a `bearer ` prefix and a token that
//!      starts with the app-coordination prefix (`ttr_app_`). Missing -> `401`
//!      `{ "error": "Unauthorized" }`.
//!   2. `verifyAppCoordinationToken(token)` — HMAC-SHA256 signature + claim
//!      validation. Invalid -> `401 Unauthorized`.
//!   3. `hasScope(...)` for each required scope (with `*` / `:*` wildcards) ->
//!      `403 { "error": "Forbidden" }` when missing.
//!   4. `getExternalAppById(target_app)` and `app.enabled` -> `403 Forbidden`.
//!   5. `normalizeWorkspaceIdForUser` (resolve alias/handle/personal) ->
//!      `403 Forbidden` on failure.
//!   6. `app.allowedWorkspaceIds.includes(...)` -> `403` with
//!      `{ "error": "App is not linked to this workspace" }`.
//!   7. `verifyWorkspaceMembershipType('MEMBER')` ->
//!      `500 { "error": "Failed to verify workspace membership" }` on lookup
//!      failure, `403 Forbidden` otherwise.
//!   8. `getPermissions(...)` -> `403 Forbidden` when null.
//!   9. capability `'view'` is always allowed.
//!      On success it returns
//!      `{ context: { canManageMembers, canManageRoles, defaultAdminEnabled },
//!    invitations: [{ createdAt, email }], members: [{ ... }] }`
//!      built from `getWorkspaceMembers` + `normalizeWorkspaceMembers`.
//!
//! ## Behavior gaps (deliberate, documented)
//!
//! This route's auth model is the app-coordination JWT with wildcard scope
//! matching — it matches NONE of the shared backend auth helpers
//! (`authorize_workspace_permission`, `authorize_finance_permission`,
//! `authorize_root_workspace_read_access`), all of which expect a Supabase
//! session / workspace-permission string rather than a scoped app token. The
//! crate's app-coordination verification primitives
//! (`contact::session::verify_app_session_token` etc.) additionally require the
//! `internal-app:session` scope and an expected-target list, which this route
//! does NOT impose, so they are not reusable here either (and they are
//! `#[cfg(test)]`-gated outside tests).
//!
//! More importantly, the success body depends on `getWorkspaceMembers`
//! (a ~400 LOC helper issuing many joined Supabase reads across
//! `workspace_members`, invites, roles, role members, role/default permissions,
//! and workspace profiles) plus `getPermissions` and `normalizeWorkspaceMembers`.
//! Reproducing that faithfully is far beyond this module's budget and carries a
//! high divergence risk, so the authenticated/authorized success path and the
//! token-verification / scope / app-enabled / workspace-resolution / membership
//! / permission rejections are intentionally NOT reproduced here.
//!
//! To stay strictly behavior-preserving and never break a live external-app
//! integration, this handler only short-circuits the one rejection that is pure,
//! deterministic, and free of any cryptographic guesswork: a request with no
//! valid-form app-coordination bearer token is rejected with the exact legacy
//! `401 { "error": "Unauthorized" }`. Every request that *does* carry a
//! well-formed `ttr_app_` bearer token falls through (returns `None`) to the
//! still-live Next.js route, which performs token verification and serves the
//! full member snapshot. Non-GET methods also fall through.

use serde_json::json;

use crate::{BackendConfig, BackendRequest, BackendResponse, json_response, no_store_response};

const EXTERNAL_APPS_MEMBERS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const EXTERNAL_APPS_MEMBERS_PATH_SUFFIX: &str = "/external-apps/members";

/// `TOKEN_PREFIX` from `@tuturuuu/auth/app-coordination`
/// (`isAppCoordinationToken`).
const APP_COORDINATION_TOKEN_PREFIX: &str = "ttr_app_";

/// HTTP `bearer ` scheme prefix (7 bytes), matched case-insensitively to mirror
/// the legacy `authorization.toLowerCase().startsWith('bearer ')` check.
const BEARER_PREFIX_LEN: usize = 7;

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";

pub(crate) async fn handle_workspaces_wsid_external_apps_members_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<BackendResponse> {
    // PATH GUARD: only the verbatim legacy mount path. Anything else -> None so
    // other handlers / Next.js keep running.
    external_apps_members_ws_id(request.path)?;

    // The authenticated success path is served by the live Next.js route, so we
    // do not need the Supabase config or outbound client here. Bind them so the
    // exact required signature compiles without unused-variable warnings.
    let _ = (config, outbound);

    Some(match request.method {
        // GET is the only method this route owns. We may still defer to Next.js
        // (None) for authenticated requests; see the module doc comment.
        "GET" => match external_apps_members_get_response(request) {
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
fn external_apps_members_get_response(request: BackendRequest<'_>) -> Option<BackendResponse> {
    if bearer_app_coordination_token(request.authorization).is_none() {
        return Some(unauthorized_response());
    }

    // Well-formed token present: defer the heavy verification + member snapshot
    // to Next.js so behavior stays identical.
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
/// path is not this exact route. Mirrors the prefix/suffix style of
/// `workspaces_finance_invoices_count`; the `wsId` must be non-empty and contain
/// no further path separators.
fn external_apps_members_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(EXTERNAL_APPS_MEMBERS_PATH_PREFIX)?
        .strip_suffix(EXTERNAL_APPS_MEMBERS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ws_id_extracted_from_canonical_path() {
        assert_eq!(
            external_apps_members_ws_id("/api/v1/workspaces/ws-123/external-apps/members"),
            Some("ws-123")
        );
    }

    #[test]
    fn ws_id_accepts_alias_segment() {
        assert_eq!(
            external_apps_members_ws_id("/api/v1/workspaces/personal/external-apps/members"),
            Some("personal")
        );
    }

    #[test]
    fn ws_id_rejects_wrong_prefix() {
        // No `/v1` segment.
        assert_eq!(
            external_apps_members_ws_id("/api/workspaces/ws-123/external-apps/members"),
            None
        );
    }

    #[test]
    fn ws_id_rejects_wrong_suffix() {
        assert_eq!(
            external_apps_members_ws_id("/api/v1/workspaces/ws-123/external-apps"),
            None
        );
        assert_eq!(
            external_apps_members_ws_id("/api/v1/workspaces/ws-123/external-apps/members/extra"),
            None
        );
    }

    #[test]
    fn ws_id_rejects_empty_or_nested_segment() {
        assert_eq!(
            external_apps_members_ws_id("/api/v1/workspaces//external-apps/members"),
            None
        );
        assert_eq!(
            external_apps_members_ws_id("/api/v1/workspaces/a/b/external-apps/members"),
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
            path: "/api/v1/workspaces/ws-1/external-apps/members",
            referer: None,
            request_id: None,
            url: None,
        };
        let response = external_apps_members_get_response(request)
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
            path: "/api/v1/workspaces/ws-1/external-apps/members",
            referer: None,
            request_id: None,
            url: None,
        };
        assert!(external_apps_members_get_response(request).is_none());
    }
}
