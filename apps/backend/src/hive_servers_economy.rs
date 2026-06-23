//! Handler for `GET /api/v1/hive/servers/:serverId/economy`.
//!
//! Legacy source:
//! `apps/web/src/app/api/v1/hive/servers/[serverId]/economy/route.ts`
//!
//! IMPORTANT PORTABILITY NOTE
//! --------------------------
//! The legacy route serves its entire response payload (`crops`,
//! `inventories`, `ledger`, `totalCurrency`, `warehouses`) from the dedicated
//! **Hive Postgres database** reached through `HIVE_DATABASE_URL` (the `postgres`
//! npm driver, via `getHiveSnapshot` / `listHiveLedgerEntries`). Those tables
//! (`hive_servers`, `hive_crop_instances`, `hive_inventory_items`,
//! `hive_ledger_entries`, `hive_warehouses`) do NOT live in the main Supabase
//! Postgres instance and are NOT exposed through Supabase REST / PostgREST.
//!
//! The Cloudflare-Workers backend (`BackendConfig`) only has Supabase REST
//! access via `config.contact_data`; it has no connection to the separate Hive
//! Postgres database. Therefore the economy data layer of this route CANNOT be
//! reproduced here without first adding Hive-DB connectivity to the backend
//! (a new shared capability that is out of scope for a single route port).
//!
//! Given that, this handler:
//!   * recognises the dynamic path shape `/api/v1/hive/servers/{serverId}/economy`,
//!   * enforces the EXACT same auth/access gate as the legacy route
//!     (`requireHiveAccess`): 401 `Unauthorized`, 500
//!     `Failed to resolve Hive access`, 403 `Hive access required`, mirroring the
//!     legacy JSON `{ "error": ... }` shapes,
//!   * but, because the snapshot/ledger data cannot be fetched in the Worker,
//!     returns `None` for the matched path so the request falls through to the
//!     legacy Next.js handler (which has Hive-DB access) instead of returning a
//!     wrong/empty payload.
//!
//! As a result `handle_hive_servers_economy_route` deliberately returns `None`
//! even when the path matches (with the single exception of an unsupported
//! method, which is answered with `405`). This is the honest, correct behaviour
//! until the backend gains Hive Postgres access; see the integrator notes in the
//! structured result.

use serde_json::json;

use crate::{
    BackendConfig, BackendRequest, BackendResponse, hive_access, json_response, method_not_allowed,
    no_store_response, outbound::OutboundHttpClient,
};

const HIVE_APP_SESSION_TARGETS: [&str; 1] = ["hive"];

/// Returns `true` when `path` matches `/api/v1/hive/servers/{serverId}/economy`
/// with a single, non-empty dynamic `serverId` segment.
fn is_hive_servers_economy_path(path: &str) -> bool {
    let segments: Vec<&str> = path
        .trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();

    segments.len() == 6
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "hive"
        && segments[3] == "servers"
        && !segments[4].is_empty()
        && segments[5] == "economy"
}

pub(crate) async fn handle_hive_servers_economy_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if !is_hive_servers_economy_path(request.path) {
        return None;
    }

    // The legacy route only implements GET. Answer non-GET methods with the
    // framework's standard 405 so this matched path never silently falls
    // through for an unsupported verb.
    if request.method != "GET" {
        return Some(method_not_allowed(request.method, "GET"));
    }

    // Enforce the same auth gate as `requireHiveAccess` in the legacy route.
    // On any auth failure we return the matching error response immediately so
    // unauthenticated / forbidden callers get the legacy error contract without
    // ever touching the Hive Postgres data layer.
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

    // Auth passed, but the economy snapshot + ledger live in the separate Hive
    // Postgres database which the Worker cannot reach. Fall through to the
    // legacy Next.js handler (it owns `HIVE_DATABASE_URL`) so the real data is
    // served. See module docs for the full rationale.
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
