//! Handler for `GET /api/v1/hive/servers/:serverId/crdt`.
//!
//! Legacy source:
//! `apps/web/src/app/api/v1/hive/servers/[serverId]/crdt/route.ts`
//!
//! ## Portability gap — Hive Postgres database
//!
//! The legacy GET handler calls `getHiveSnapshot(serverId)`, which reads from a
//! **separate Hive Postgres database** reached via the `HIVE_DATABASE_URL`
//! environment variable (the `postgres` npm driver). The tables queried
//! (`hive_servers`, `hive_world_states`, and related CRDT state columns) do NOT
//! live in the main Supabase Postgres instance and are NOT exposed through
//! Supabase REST / PostgREST.
//!
//! The Cloudflare-Workers backend (`BackendConfig`) only has Supabase REST
//! access via `config.contact_data`; it has no connection to the separate Hive
//! Postgres database. Therefore the CRDT snapshot data layer of this route
//! CANNOT be reproduced here without first adding Hive-DB connectivity to the
//! backend (a new shared capability that is out of scope for a single route port).
//!
//! This handler therefore:
//!
//! - Recognises the dynamic path shape
//!   `/api/v1/hive/servers/{serverId}/crdt` (exactly 6 path segments with a
//!   non-empty `serverId` segment and a literal `crdt` trailing segment).
//! - Enforces the EXACT same auth gate as `requireHiveAccess` in the legacy
//!   route:
//!   - `401` `{ "error": "Unauthorized" }` — missing/invalid session.
//!   - `500` `{ "error": "Failed to resolve Hive access" }` — internal error
//!     while resolving access.
//!   - `403` `{ "error": "Hive access required" }` — authenticated but lacks
//!     access.
//! - After a successful auth check, returns `None` so the request falls through
//!   to the legacy Next.js handler (which has `HIVE_DATABASE_URL` access) and
//!   the real CRDT snapshot data is served.
//! - Returns `None` for non-GET methods (POST) so they also fall through to the
//!   still-live Next.js route handlers, which implement the CRDT write path.

use serde_json::json;

use crate::{BackendResponse, hive_access, json_response, no_store_response};

const HIVE_APP_SESSION_TARGETS: [&str; 1] = ["hive"];

/// Returns `true` when `path` matches `/api/v1/hive/servers/{serverId}/crdt`
/// with exactly one non-empty dynamic `serverId` segment and a literal `crdt`
/// trailing segment.
fn is_hive_servers_serverid_crdt_path(path: &str) -> bool {
    let segments: Vec<&str> = path
        .trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect();

    segments.len() == 6
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "hive"
        && segments[3] == "servers"
        && !segments[4].is_empty()
        && segments[5] == "crdt"
}

pub(crate) async fn handle_hive_servers_serverid_crdt_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    if !is_hive_servers_serverid_crdt_path(request.path) {
        return None;
    }

    // Non-GET methods (POST) belong entirely to the legacy Next.js route.
    // Return None so they fall through without a 405.
    if request.method != "GET" {
        return None;
    }

    // --- Auth gate: mirrors `requireHiveAccess` from the legacy route ---

    let user =
        match hive_access::authenticated_user(config, request, &HIVE_APP_SESSION_TARGETS, outbound)
            .await
        {
            Ok(user) => user,
            Err(()) => return Some(unauthorized_response()),
        };

    let access =
        match hive_access::resolve_hive_access(&config.contact_data, &user.id, outbound).await {
            Ok(access) => access,
            Err(()) => return Some(failed_to_resolve_hive_access_response()),
        };

    if !access.has_access() {
        return Some(hive_access_required_response());
    }

    // Auth passed. The CRDT snapshot data lives in the separate Hive Postgres
    // database (HIVE_DATABASE_URL) which the Worker cannot reach. Fall through
    // to the legacy Next.js handler so the real data is served. See module
    // docs for the full rationale.
    None
}

/// Legacy: `NextResponse.json({ error: 'Unauthorized' }, { status: 401 })`.
fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(
        401,
        json!({
            "error": "Unauthorized",
        }),
    ))
}

/// Legacy: `NextResponse.json({ error: 'Failed to resolve Hive access' }, { status: 500 })`.
fn failed_to_resolve_hive_access_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "error": "Failed to resolve Hive access",
        }),
    ))
}

/// Legacy: `NextResponse.json({ error: 'Hive access required' }, { status: 403 })`.
fn hive_access_required_response() -> BackendResponse {
    no_store_response(json_response(
        403,
        json!({
            "error": "Hive access required",
        }),
    ))
}

#[cfg(test)]
mod tests {
    use super::is_hive_servers_serverid_crdt_path;

    #[test]
    fn matches_valid_crdt_path() {
        assert!(is_hive_servers_serverid_crdt_path(
            "/api/v1/hive/servers/some-server-id/crdt"
        ));
        assert!(is_hive_servers_serverid_crdt_path(
            "/api/v1/hive/servers/550e8400-e29b-41d4-a716-446655440000/crdt"
        ));
    }

    #[test]
    fn matches_path_without_leading_slash() {
        assert!(is_hive_servers_serverid_crdt_path(
            "api/v1/hive/servers/some-server-id/crdt"
        ));
    }

    #[test]
    fn does_not_match_server_list_path() {
        assert!(!is_hive_servers_serverid_crdt_path("/api/v1/hive/servers"));
        assert!(!is_hive_servers_serverid_crdt_path("/api/v1/hive/servers/"));
    }

    #[test]
    fn does_not_match_serverid_only_path() {
        assert!(!is_hive_servers_serverid_crdt_path(
            "/api/v1/hive/servers/some-server-id"
        ));
    }

    #[test]
    fn does_not_match_other_sub_routes() {
        assert!(!is_hive_servers_serverid_crdt_path(
            "/api/v1/hive/servers/some-server-id/economy"
        ));
        assert!(!is_hive_servers_serverid_crdt_path(
            "/api/v1/hive/servers/some-server-id/workflows/runs"
        ));
    }

    #[test]
    fn does_not_match_wrong_prefix() {
        assert!(!is_hive_servers_serverid_crdt_path(
            "/api/v2/hive/servers/some-id/crdt"
        ));
        assert!(!is_hive_servers_serverid_crdt_path(
            "/hive/servers/some-id/crdt"
        ));
    }

    #[test]
    fn does_not_match_empty_server_id() {
        assert!(!is_hive_servers_serverid_crdt_path(
            "/api/v1/hive/servers//crdt"
        ));
    }

    #[test]
    fn does_not_match_extra_segments() {
        assert!(!is_hive_servers_serverid_crdt_path(
            "/api/v1/hive/servers/some-server-id/crdt/extra"
        ));
    }
}
