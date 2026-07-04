//! Handler for `GET /api/v1/hive/servers/:serverId`.
//!
//! Legacy source:
//! `apps/web/src/app/api/v1/hive/servers/[serverId]/route.ts`
//!
//! ## Portability gap — Hive Postgres database
//!
//! The legacy GET handler calls `getHiveSnapshot(serverId)`, which reads from a
//! **separate Hive Postgres database** reached via the `HIVE_DATABASE_URL`
//! environment variable (the `postgres` npm driver). The tables queried
//! (`hive_servers`, `hive_world_states`, `hive_world_events`, `hive_npcs`,
//! `hive_warehouses`, `hive_crop_instances`, `hive_inventory_items`) do NOT
//! live in the main Supabase Postgres instance and are NOT exposed through
//! Supabase REST / PostgREST.
//!
//! The Cloudflare-Workers backend (`BackendConfig`) only has Supabase REST
//! access via `config.contact_data`; it has no connection to the separate Hive
//! Postgres database. Therefore the snapshot data layer of this route CANNOT be
//! reproduced here without first adding Hive-DB connectivity to the backend (a
//! new shared capability that is out of scope for a single route port).
//!
//! This handler therefore:
//!
//! - Recognises the dynamic path shape `/api/v1/hive/servers/{serverId}`
//!   (exactly 5 path segments; sub-routes such as `/economy` are handled by
//!   their own dedicated modules).
//! - Enforces the EXACT same auth gate as `requireHiveAccess` in the legacy
//!   route:
//!   - `401` `{ "error": "Unauthorized" }` — missing/invalid session.
//!   - `500` `{ "error": "Failed to resolve Hive access" }` — internal error
//!     while resolving access.
//!   - `403` `{ "error": "Hive access required" }` — authenticated but lacks
//!     access.
//! - After a successful auth check, returns `None` so the request falls
//!   through to the legacy Next.js handler (which has `HIVE_DATABASE_URL`
//!   access) and the real snapshot data is served.
//! - Returns `None` for non-GET methods (PATCH, DELETE) so they also fall
//!   through to the still-live Next.js route handlers.

use serde_json::json;

use crate::{BackendResponse, hive_access, json_response, no_store_response};

const HIVE_APP_SESSION_TARGETS: [&str; 1] = ["hive"];

/// Returns `true` when `path` matches `/api/v1/hive/servers/{serverId}`
/// with exactly one non-empty dynamic `serverId` segment (no trailing
/// sub-route segments).
fn is_hive_servers_serverid_path(path: &str) -> bool {
    let segments: Vec<&str> = path
        .trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect();

    segments.len() == 5
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "hive"
        && segments[3] == "servers"
        && !segments[4].is_empty()
}

pub(crate) async fn handle_hive_servers_serverid_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    if !is_hive_servers_serverid_path(request.path) {
        return None;
    }

    // Non-GET methods (PATCH, DELETE) belong entirely to the legacy Next.js
    // route. Return None so they fall through without a 405.
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

    // Auth passed. The snapshot data lives in the separate Hive Postgres
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
    use super::is_hive_servers_serverid_path;

    #[test]
    fn matches_valid_server_id_path() {
        assert!(is_hive_servers_serverid_path(
            "/api/v1/hive/servers/some-server-id"
        ));
        assert!(is_hive_servers_serverid_path(
            "/api/v1/hive/servers/550e8400-e29b-41d4-a716-446655440000"
        ));
    }

    #[test]
    fn does_not_match_sub_routes() {
        // Sub-routes like /economy are handled by separate modules.
        assert!(!is_hive_servers_serverid_path(
            "/api/v1/hive/servers/some-server-id/economy"
        ));
        assert!(!is_hive_servers_serverid_path(
            "/api/v1/hive/servers/some-server-id/workflows/runs"
        ));
    }

    #[test]
    fn does_not_match_list_path() {
        // /api/v1/hive/servers (no serverId) is a different route.
        assert!(!is_hive_servers_serverid_path("/api/v1/hive/servers"));
        assert!(!is_hive_servers_serverid_path("/api/v1/hive/servers/"));
    }

    #[test]
    fn does_not_match_wrong_prefix() {
        assert!(!is_hive_servers_serverid_path(
            "/api/v2/hive/servers/some-id"
        ));
        assert!(!is_hive_servers_serverid_path("/hive/servers/some-id"));
    }

    #[test]
    fn does_not_match_empty_server_id() {
        assert!(!is_hive_servers_serverid_path("/api/v1/hive/servers//"));
    }

    #[test]
    fn matches_path_without_leading_slash() {
        // trim_matches('/') handles both forms.
        assert!(is_hive_servers_serverid_path(
            "api/v1/hive/servers/some-server-id"
        ));
    }
}
