//! Handler for `GET /api/v1/workspaces/:wsId/settings/:configId`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/settings/[configId]/route.ts`
//! (GET only; the legacy `PUT` upsert is intentionally left to the still-live
//! Next.js route).
//!
//! Legacy GET behavior (the common "workspace config read" path):
//!   1. Resolves the finance route auth context
//!      (`resolveFinanceRouteAuthContext` + `getFinanceRouteContext`): accepts a
//!      Supabase session (bearer/auth cookie) OR a finance/platform app-session
//!      OR a CLI access token. For the `DEFAULT_CURRENCY` config the inventory
//!      app-session audience is also accepted.
//!   2. `getFinanceRouteContext` calls `getPermissions`, which resolves the
//!      workspace id (handling `personal`/`internal`/handle aliases) and requires
//!      workspace membership. When `getPermissions` returns `null` the route
//!      replies `NextResponse.json({}, { status: 401 })` (a bare `{}` body).
//!   3. Reads the config value with the admin (service-role) client via
//!      `getWorkspaceConfig` (`workspace_configs.value` filtered by `ws_id` + `id`,
//!      `maybeSingle`, `value || null`):
//!        * value present (non-empty) -> `200 { "value": "<value>" }`
//!        * value null/empty / row absent / read error -> `404 {}`
//!          (`getWorkspaceConfig` swallows read errors and returns `null`).
//!
//! The reads use the service-role key (matching the legacy admin client), so RLS
//! is bypassed and the read is scoped purely by the `ws_id` + `id` filters; the
//! membership check above is what authorizes the caller.
//!
//! BEHAVIOR GAPS vs legacy (documented, intentional):
//!   * `configId == "ENABLE_CMS_GAMES"` uses a different auth model in the legacy
//!     route (`requireWorkspaceExternalProjectAccess`, external-project access
//!     rather than workspace membership). That branch is NOT reproduced here; the
//!     handler returns `None` for it so the still-live Next.js route serves it.
//!   * `configId == "DATABASE_DEFAULT_INCLUDED_GROUPS"` reads a different table
//!     (`workspace_default_included_user_groups`) with a different response shape
//!     in the legacy route. That branch is likewise deferred (`None`) to Next.js.
//!   * Authorization here verifies workspace membership only. The legacy
//!     `getPermissions` additionally requires the caller to have at least one
//!     effective permission (a role permission, a default permission for their
//!     member type, or workspace-creator status). A member with zero effective
//!     permissions would be allowed by this handler but receives `401` from the
//!     legacy route. This handler is therefore marginally more permissive on that
//!     edge case; it is never more permissive about workspace membership.
//!   * GET only: every non-GET method returns `None` so the live Next.js route
//!     continues to serve `PUT`.

use serde::Deserialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const SETTINGS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const SETTINGS_SEGMENT_PREFIX: &str = "settings/";

const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";

const ENABLE_CMS_GAMES_CONFIG_ID: &str = "ENABLE_CMS_GAMES";
const DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID: &str = "DATABASE_DEFAULT_INCLUDED_GROUPS";
const DEFAULT_CURRENCY_CONFIG_ID: &str = "DEFAULT_CURRENCY";

/// First path segment names under `/settings/` that resolve to their own static
/// Next.js routes (which take precedence over the `[configId]` dynamic segment).
/// Requests for these must fall through to their dedicated handlers / Next.js.
const STATIC_SETTINGS_SIBLINGS: [&str; 6] = [
    "approvals",
    "calendar-sync",
    "configs",
    "email-audit",
    "members",
    "permissions",
];

const FINANCE_APP_SESSION_TARGETS: [&str; 2] = ["finance", "platform"];
const FINANCE_INVENTORY_APP_SESSION_TARGETS: [&str; 3] = ["finance", "platform", "inventory"];

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct ConfigValueRow {
    value: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_settings_configid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, config_id) = settings_config_route_parts(request.path)?;

    // Config ids whose legacy GET uses a different auth model or response shape
    // are deferred to the still-live Next.js route.
    if is_deferred_config_id(config_id) {
        return None;
    }

    // If the worker is not configured to reach Supabase, defer to Next.js rather
    // than inventing an error code the legacy route never returns.
    if !config.contact_data.configured() {
        return None;
    }

    Some(match request.method {
        "GET" => config_response(config, request, raw_ws_id, config_id, outbound).await,
        // PUT (and any other method) remains served by the live Next.js route.
        _ => return None,
    })
}

async fn config_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    config_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // 1. Authenticate (Supabase session, finance/platform app-session, CLI token;
    //    inventory app-session additionally accepted for DEFAULT_CURRENCY).
    let Some(user_id) =
        authenticate_user(config, request, outbound, app_session_targets(config_id)).await
    else {
        return empty_object_response(401);
    };

    // 2. Resolve the workspace id (personal/internal/handle aliases). Any
    //    resolution failure mirrors `getPermissions` returning null -> 401 {}.
    let ws_id = match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id).await {
        Ok(Some(ws_id)) => ws_id,
        Ok(None) | Err(()) => return empty_object_response(401),
    };

    // 3. Require workspace membership (mirrors `getPermissions` non-null).
    match verify_membership(contact_data, outbound, &ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) | Err(()) => return empty_object_response(401),
    }

    // 4. Read the config value with the service-role client (admin read).
    match fetch_config_value(contact_data, outbound, &ws_id, config_id).await {
        // Legacy `getWorkspaceConfig` returns `value || null`; a null value (or a
        // swallowed read error) collapses to the legacy `404 {}` response.
        Ok(Some(value)) => no_store_response(json_response(200, json!({ "value": value }))),
        Ok(None) | Err(()) => empty_object_response(404),
    }
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

async fn authenticate_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
    app_targets: &[&str],
) -> Option<String> {
    if contact::request_has_app_session_token(request) {
        if let Ok(identity) = contact::resolve_app_session_identity(config, request, app_targets)
            && let Some(id) = non_empty(identity.id)
        {
            return Some(id);
        }

        if let Ok(identity) = contact::resolve_cli_app_session_identity(config, request)
            && let Some(id) = non_empty(identity.id)
        {
            return Some(id);
        }
    }

    let access_token = supabase_auth::request_access_token_allowing_app_sessions(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;

    non_empty(user.id?)
}

// ---------------------------------------------------------------------------
// Workspace id normalization (mirrors getPermissions' resolveWorkspaceIdForPermissions)
// ---------------------------------------------------------------------------

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
) -> Result<Option<String>, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id).await;
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(Some(resolved_ws_id));
        }

        if let Some(workspace_id) = workspace_id_by_handle(contact_data, outbound, &handle).await? {
            return Ok(Some(workspace_id));
        }
    }

    Ok(Some(resolved_ws_id))
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Option<String>, ()> {
    let url = contact_data
        .rest_url(
            "workspaces",
            &[
                (
                    "select",
                    "id,workspace_members!inner(user_id,type)".to_owned(),
                ),
                ("personal", "eq.true".to_owned()),
                ("workspace_members.user_id", format!("eq.{user_id}")),
                ("workspace_members.type", "eq.MEMBER".to_owned()),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_get(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
) -> Result<Option<String>, ()> {
    let url = contact_data
        .rest_url(
            "workspaces",
            &[
                ("select", "id".to_owned()),
                ("handle", format!("eq.{handle}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_get(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}

// ---------------------------------------------------------------------------
// Membership + config read
// ---------------------------------------------------------------------------

async fn verify_membership(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            "workspace_members",
            &[
                ("select", "user_id".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("user_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_get(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let rows = response
        .json::<Vec<serde_json::Value>>()
        .map_err(|_| ())?;

    Ok(!rows.is_empty())
}

async fn fetch_config_value(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    config_id: &str,
) -> Result<Option<String>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_configs",
            &[
                ("select", "value".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("id", format!("eq.{config_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_get(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    // Mirror `data?.value || null`: a missing row, null value, or empty string all
    // collapse to `None` (the legacy `404 {}`).
    Ok(decode_first_row::<ConfigValueRow>(&response)?
        .and_then(|row| row.value)
        .filter(|value| !value.is_empty()))
}

async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/// Extract `(wsId, configId)` from a path that exactly matches
/// `/api/v1/workspaces/<wsId>/settings/<configId>`. Returns `None` for the
/// collection route, nested sub-routes, or config ids that collide with a static
/// `/settings/*` sibling segment (which owns its own route).
fn settings_config_route_parts(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(SETTINGS_PATH_PREFIX)?;
    let (ws_id, after) = rest.split_once('/')?;
    let config_id = after.strip_prefix(SETTINGS_SEGMENT_PREFIX)?;

    if ws_id.is_empty() || config_id.is_empty() || config_id.contains('/') {
        return None;
    }
    if is_static_settings_sibling(config_id) {
        return None;
    }

    Some((ws_id, config_id))
}

fn is_static_settings_sibling(config_id: &str) -> bool {
    STATIC_SETTINGS_SIBLINGS.contains(&config_id)
}

fn is_deferred_config_id(config_id: &str) -> bool {
    config_id == ENABLE_CMS_GAMES_CONFIG_ID
        || config_id == DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID
}

fn app_session_targets(config_id: &str) -> &'static [&'static str] {
    if config_id == DEFAULT_CURRENCY_CONFIG_ID {
        &FINANCE_INVENTORY_APP_SESSION_TARGETS
    } else {
        &FINANCE_APP_SESSION_TARGETS
    }
}

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn is_direct_workspace_lookup_identifier(identifier: &str) -> bool {
    let normalized = identifier.trim().to_lowercase();

    normalized == PERSONAL_WORKSPACE_SLUG
        || normalized == ROOT_WORKSPACE_ID
        || normalized == INTERNAL_WORKSPACE_SLUG
        || is_workspace_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

fn is_workspace_uuid_literal(value: &str) -> bool {
    value.trim().len() == 36
        && value
            .trim()
            .chars()
            .enumerate()
            .all(|(index, character)| match index {
                8 | 13 | 18 | 23 => character == '-',
                _ => character.is_ascii_hexdigit(),
            })
}

fn is_workspace_handle(value: &str) -> bool {
    let length = value.len();
    if length == 0 || length > 64 {
        return false;
    }

    value.chars().enumerate().all(|(index, character)| {
        let is_edge = index == 0 || index + 1 == length;
        character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || (!is_edge && matches!(character, '_' | '-'))
    })
}

fn decode_first_row<T: for<'de> Deserialize<'de>>(
    response: &OutboundResponse,
) -> Result<Option<T>, ()> {
    response
        .json::<Vec<T>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

fn non_empty(value: String) -> Option<String> {
    (!value.trim().is_empty()).then_some(value)
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

/// Legacy `NextResponse.json({}, { status })`: a bare empty-object body.
fn empty_object_response(status: u16) -> BackendResponse {
    no_store_response(json_response(status, json!({})))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_ws_id_and_config_id_from_matching_path() {
        assert_eq!(
            settings_config_route_parts("/api/v1/workspaces/abc/settings/DEFAULT_CURRENCY"),
            Some(("abc", "DEFAULT_CURRENCY"))
        );
        assert_eq!(
            settings_config_route_parts(
                "/api/v1/workspaces/11111111-1111-4111-8111-111111111111/settings/default_wallet_id"
            ),
            Some(("11111111-1111-4111-8111-111111111111", "default_wallet_id"))
        );
    }

    #[test]
    fn rejects_non_matching_paths() {
        // Collection route (no configId).
        assert_eq!(settings_config_route_parts("/api/v1/workspaces/abc/settings"), None);
        assert_eq!(settings_config_route_parts("/api/v1/workspaces/abc/settings/"), None);
        // Nested sub-routes (extra segment) must not match a single configId.
        assert_eq!(
            settings_config_route_parts("/api/v1/workspaces/abc/settings/permissions/check"),
            None
        );
        // Wrong/missing version prefix.
        assert_eq!(settings_config_route_parts("/api/workspaces/abc/settings/X"), None);
        // Empty workspace id.
        assert_eq!(settings_config_route_parts("/api/v1/workspaces//settings/X"), None);
        // Different sub-path under the workspace.
        assert_eq!(settings_config_route_parts("/api/v1/workspaces/abc/secrets/X"), None);
    }

    #[test]
    fn rejects_static_settings_sibling_segments() {
        // These segments are owned by their own static Next.js routes.
        for sibling in STATIC_SETTINGS_SIBLINGS {
            assert_eq!(
                settings_config_route_parts(&format!("/api/v1/workspaces/abc/settings/{sibling}")),
                None,
                "expected `{sibling}` to fall through to its dedicated route"
            );
        }
    }

    #[test]
    fn deferred_config_ids_are_recognized() {
        assert!(is_deferred_config_id("ENABLE_CMS_GAMES"));
        assert!(is_deferred_config_id("DATABASE_DEFAULT_INCLUDED_GROUPS"));
        assert!(!is_deferred_config_id("DEFAULT_CURRENCY"));
        assert!(!is_deferred_config_id("default_wallet_id"));
    }

    #[test]
    fn default_currency_widens_app_session_targets_to_inventory() {
        assert_eq!(
            app_session_targets("DEFAULT_CURRENCY"),
            &["finance", "platform", "inventory"]
        );
        assert_eq!(app_session_targets("default_wallet_id"), &["finance", "platform"]);
    }

    #[test]
    fn workspace_uuid_literal_matches_canonical_form() {
        assert!(is_workspace_uuid_literal("11111111-1111-4111-8111-111111111111"));
        assert!(!is_workspace_uuid_literal("not-a-uuid"));
        assert!(!is_workspace_uuid_literal("11111111111141118111111111111111"));
    }

    #[test]
    fn resolve_workspace_id_maps_internal_to_root() {
        assert_eq!(resolve_workspace_id("internal"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("INTERNAL"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("acme"), "acme");
    }

    #[test]
    fn empty_object_response_is_bare_object_with_no_store() {
        let unauthorized = empty_object_response(401);
        assert_eq!(unauthorized.status, 401);
        assert_eq!(unauthorized.body, json!({}));
        assert!(unauthorized.cache_control.is_some());

        let not_found = empty_object_response(404);
        assert_eq!(not_found.status, 404);
        assert_eq!(not_found.body, json!({}));
    }

    #[test]
    fn value_success_body_wraps_value() {
        let response = no_store_response(json_response(200, json!({ "value": "VND" })));
        assert_eq!(response.status, 200);
        assert_eq!(response.body, json!({ "value": "VND" }));
        assert!(response.cache_control.is_some());
    }
}
