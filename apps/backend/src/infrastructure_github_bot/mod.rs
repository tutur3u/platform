//! Handler for `GET /api/v1/infrastructure/github-bot`.
//!
//! Legacy source: `apps/web/src/app/api/v1/infrastructure/github-bot/route.ts`
//! plus `apps/web/src/lib/infrastructure/github-bot-access.ts`,
//! `apps/web/src/lib/infrastructure/github-bot/state.ts`,
//! `apps/web/src/lib/infrastructure/github-bot/shared.ts`, and
//! `apps/web/src/lib/infrastructure/github-bot/sanitize.ts`.
//!
//! Only the GET method is migrated here. The legacy route also defines a PUT
//! mutation (`saveGitHubBotConfiguration`) that is intentionally NOT handled:
//! this handler returns `None` for every non-GET method so the Cloudflare
//! worker falls through to the still-active Next.js route for those mutations.
//!
//! Legacy GET behavior reproduced:
//! 1. `authorizeGitHubBotAdmin(request)`:
//!    - Authenticates the Supabase user; if none -> 401 `{ message: "Unauthorized" }`.
//!    - Resolves the caller's effective permissions in the ROOT workspace
//!      (mirroring `getPermissions({ request, wsId: ROOT_WORKSPACE_ID })`). If
//!      the permission set does not contain `manage_workspace_secrets`
//!      (or `getPermissions` would have returned null) -> 403
//!      `{ message: "Forbidden" }`.
//! 2. `listGitHubBotState(db)` reads the `private` schema:
//!    - `github_bot_configurations` where `id = 'tuturuuu-ci'` (maybeSingle).
//!      When absent -> `{ auditEvents: [], clients: [], configuration: null }`.
//!    - Otherwise, `github_bot_watcher_clients` (configuration_id =
//!      'tuturuuu-ci', order created_at desc, limit 50) and
//!      `github_bot_audit_events` (select actor_type,created_at,event_type,id,
//!      metadata; configuration_id = 'tuturuuu-ci'; order created_at desc;
//!      limit 50), mapped to the camelCase status shapes.
//!    - Any read failure surfaces as a `GitHubBotStoreError(message, 500)` whose
//!      `code` defaults to `github_bot_error`. The route's `errorResponse`
//!      renders that as `{ code: "github_bot_error", message: <fallback> }`
//!      with status 500 (fallback message:
//!      "Failed to load GitHub bot configuration").
//!
//! NOTES / ASSUMPTIONS the integrator must verify:
//! - The legacy handler uses the admin (service-role) Supabase client and reads
//!   the `private` schema. PostgREST exposes non-public schemas via the
//!   `Accept-Profile` request header, so every private read here sends
//!   `Accept-Profile: private` (mirroring `workspaces_wallets_walletid.rs`).
//!   The `private` schema must be exposed in PostgREST's `db-schemas` config
//!   for this to work; if it is not, these reads would 404/406 and surface as a
//!   500, matching the legacy `assertNoError` failure shape.
//! - The permission-resolution helpers below are a file-local copy of the
//!   `getPermissions` composition in `workspaces_secrets.rs` (private fns that
//!   cannot be imported), restricted to the ROOT workspace only, since the
//!   legacy access helper checks only `wsId: ROOT_WORKSPACE_ID`.
//! - `sanitizeAuditMetadata` is ported by hand (no `regex` crate is available in
//!   this crate). The port reproduces the redaction intent: JWTs, bearer
//!   tokens, sensitive `key: value` pairs, sensitive query params, emails,
//!   local paths, URLs, and known hostnames are redacted; whitespace is
//!   collapsed; strings are truncated to 200 chars (keys to 80); objects and
//!   arrays are capped at 20 entries. Because the legacy implementation relies
//!   on JS regex semantics, exact byte-for-byte equivalence on adversarial
//!   inputs is NOT guaranteed -- this is the lowest-confidence part of the port
//!   and should be validated against representative audit metadata.

pub(super) use serde::Deserialize;
pub(super) use serde_json::{Map, Value, json};

pub(super) use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

mod handler;
use handler::*;
mod models;
use models::*;
mod db;
use db::*;
mod sanitize;
use sanitize::*;
mod permissions;
use permissions::*;
mod helpers;
use helpers::*;

pub(super) const GITHUB_BOT_PATH: &str = "/api/v1/infrastructure/github-bot";

pub(super) const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
pub(super) const ADMIN_PERMISSION: &str = "admin";
pub(super) const MANAGE_WORKSPACE_SECRETS: &str = "manage_workspace_secrets";

pub(super) const PRIVATE_SCHEMA: &str = "private";

pub(super) const GITHUB_BOT_CONFIG_ID: &str = "tuturuuu-ci";

pub(super) const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
pub(super) const FORBIDDEN_MESSAGE: &str = "Forbidden";
pub(super) const LOAD_FAILED_MESSAGE: &str = "Failed to load GitHub bot configuration";
pub(super) const STORE_ERROR_CODE: &str = "github_bot_error";

// `GITHUB_BOT_REQUIRED_PERMISSIONS = { checks: 'write' }` is emitted as a JSON
// object literal in `map_config`.

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_infrastructure_github_bot_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != GITHUB_BOT_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => github_bot_response(config, request, outbound).await,
        // Only GET is migrated. Return None for every other method (e.g. PUT) so
        // the worker falls through to the still-active Next.js route.
        _ => return None,
    })
}
