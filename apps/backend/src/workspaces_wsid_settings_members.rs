//! Handler for `GET /api/v1/workspaces/:wsId/settings/members`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/settings/members/route.ts`.
//!
//! Legacy behavior reproduced (GET only):
//!   1. `withSessionAuth` authenticates the caller. A missing/invalid session
//!      surfaces as `401 { "error": "Unauthorized" }` (the wrapper returns this
//!      before the handler runs).
//!   2. `getPermissions({ request, wsId })` resolves the caller's effective
//!      workspace permissions (with `internal`/`personal`/handle workspace-id
//!      normalization). A `null` result -> `403 { "message": "Workspace access
//!      denied" }`.
//!   3. Member-settings access requires `manage_workspace_members` OR
//!      `manage_workspace_roles`. An authenticated member who has workspace
//!      access but neither permission -> `403 { "message": "Workspace member
//!      settings access denied" }`.
//!   4. `verifyHasSecrets(wsId, ['DISABLE_INVITE'])` reads `workspace_secrets`
//!      with the admin (service-role) client and returns whether the
//!      `DISABLE_INVITE` secret's value is exactly `"true"`. Success responds
//!      `200 { "disableInvite": <bool> }` with
//!      `Cache-Control: private, max-age=30, stale-while-revalidate=30`.
//!   5. Any unexpected error -> `500 { "message": "Internal server error" }`.
//!
//! This handler reuses `workspace_permission_check::authorize_workspace_permission`
//! for authentication, workspace-id normalization, and the permission check.
//! Because that helper checks a single permission, the `manage_workspace_members`
//! OR `manage_workspace_roles` gate is implemented by trying the first
//! permission and, only when it returns `Forbidden` (i.e. the caller is an
//! authenticated member with workspace access but lacks that permission),
//! re-checking the second. The error mapping mirrors the legacy distinctions:
//!   * `Unauthorized` -> `401 { "error": "Unauthorized" }`
//!   * `NotFound`     -> `403 { "message": "Workspace access denied" }`
//!   * `Forbidden`    -> `403 { "message": "Workspace member settings access denied" }`
//!   * `Internal`     -> `500 { "message": "Internal server error" }`
//!
//! NOTES / behavior gaps:
//! - The legacy route does NOT enable `allowAppSessionAuth`, so internal
//!   app-session / CLI bearer tokens (`ttr_app_*`) are not accepted. The shared
//!   helper's `request_access_token_ignoring_app_sessions` already ignores those
//!   tokens, matching the legacy 401 outcome.
//! - The secret read mirrors the legacy quirk: `verifyHasSecrets` uses the RAW
//!   `wsId` via `resolveWorkspaceId` (which only maps the literal `internal`
//!   slug to the ROOT workspace id; `personal` and handles pass through
//!   verbatim). The normalized id returned by `getPermissions` is intentionally
//!   NOT used for the secret read, so for a `personal`/handle `wsId` the read
//!   matches nothing and `disableInvite` is `false` — same as legacy.
//! - `getSecrets` swallows read errors and returns `null`, so any secret-read
//!   failure (config/transport/non-2xx/decode) yields `disableInvite: false`
//!   and a `200` response, not a `500`. This handler preserves that.

use serde::Deserialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const MEMBER_SETTINGS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const MEMBER_SETTINGS_PATH_SUFFIX: &str = "/settings/members";

const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";

const MANAGE_WORKSPACE_MEMBERS: &str = "manage_workspace_members";
const MANAGE_WORKSPACE_ROLES: &str = "manage_workspace_roles";

const DISABLE_INVITE_SECRET: &str = "DISABLE_INVITE";
const SECRET_ENABLED_VALUE: &str = "true";

const MEMBER_SETTINGS_CACHE_CONTROL: &str = "private, max-age=30, stale-while-revalidate=30";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const WORKSPACE_ACCESS_DENIED_MESSAGE: &str = "Workspace access denied";
const MEMBER_SETTINGS_DENIED_MESSAGE: &str = "Workspace member settings access denied";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

#[derive(Deserialize)]
struct SecretRow {
    name: Option<String>,
    value: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_settings_members_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = member_settings_ws_id(request.path)?;

    Some(match request.method {
        "GET" => member_settings_response(config, request, raw_ws_id, outbound).await,
        // Only GET is migrated. Return None for every other method so the worker
        // falls through to the still-active Next.js route for mutations.
        _ => return None,
    })
}

async fn member_settings_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if let Err(response) =
        authorize_member_settings_access(&config.contact_data, request, raw_ws_id, outbound).await
    {
        return response;
    }

    // verifyHasSecrets reads against the RAW wsId via resolveWorkspaceId (only
    // `internal` maps to ROOT), not the normalized id from getPermissions.
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);
    let disable_invite =
        fetch_disable_invite(&config.contact_data, outbound, &resolved_ws_id).await;

    success_response(disable_invite)
}

async fn authorize_member_settings_access(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<(), BackendResponse> {
    match authorize_workspace_permission(
        contact_data,
        request,
        raw_ws_id,
        MANAGE_WORKSPACE_MEMBERS,
        outbound,
    )
    .await
    {
        Ok(_) => Ok(()),
        // Authenticated member with workspace access but lacking
        // `manage_workspace_members`: fall back to the `manage_workspace_roles`
        // half of the OR gate before denying.
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            match authorize_workspace_permission(
                contact_data,
                request,
                raw_ws_id,
                MANAGE_WORKSPACE_ROLES,
                outbound,
            )
            .await
            {
                Ok(_) => Ok(()),
                Err(WorkspacePermissionAuthorizationError::Forbidden) => {
                    Err(member_settings_denied_response())
                }
                Err(error) => Err(map_authorization_error(error)),
            }
        }
        Err(error) => Err(map_authorization_error(error)),
    }
}

fn map_authorization_error(error: WorkspacePermissionAuthorizationError) -> BackendResponse {
    match error {
        WorkspacePermissionAuthorizationError::Unauthorized => unauthorized_response(),
        WorkspacePermissionAuthorizationError::NotFound => workspace_access_denied_response(),
        WorkspacePermissionAuthorizationError::Forbidden => member_settings_denied_response(),
        WorkspacePermissionAuthorizationError::Internal => internal_server_error_response(),
    }
}

async fn fetch_disable_invite(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> bool {
    // The legacy `getSecrets({ forceAdmin: true })` reads with the admin
    // (service-role) client and swallows errors (returns null -> false).
    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "name,value".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("name", format!("eq.{DISABLE_INVITE_SECRET}")),
            ("order", "created_at.desc".to_owned()),
        ],
    ) else {
        return false;
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return false;
    };
    let bearer = format!("Bearer {service_role_key}");

    let Ok(response) = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
    else {
        return false;
    };

    if !(200..300).contains(&response.status) {
        return false;
    }

    let Ok(rows) = response.json::<Vec<SecretRow>>() else {
        return false;
    };

    disable_invite_value(&rows)
}

/// Mirrors `verifyHasSecrets(['DISABLE_INVITE'])` over a `getSecrets` result:
/// the (newest, since rows are ordered `created_at.desc`) `DISABLE_INVITE`
/// secret must have value exactly `"true"`.
fn disable_invite_value(rows: &[SecretRow]) -> bool {
    rows.iter()
        .find(|row| row.name.as_deref() == Some(DISABLE_INVITE_SECRET))
        .and_then(|row| row.value.as_deref())
        == Some(SECRET_ENABLED_VALUE)
}

/// Match `/api/v1/workspaces/:wsId/settings/members` and extract the raw `wsId`.
fn member_settings_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(MEMBER_SETTINGS_PATH_PREFIX)?
        .strip_suffix(MEMBER_SETTINGS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

/// Mirrors `resolveWorkspaceId`: only the literal `internal` slug maps to the
/// ROOT workspace id; every other identifier (including `personal`) passes
/// through verbatim.
fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn success_response(disable_invite: bool) -> BackendResponse {
    let mut response = json_response(200, json!({ "disableInvite": disable_invite }));
    response.cache_control = Some(MEMBER_SETTINGS_CACHE_CONTROL);
    response
}

fn unauthorized_response() -> BackendResponse {
    json_response(401, json!({ "error": UNAUTHORIZED_MESSAGE }))
}

fn workspace_access_denied_response() -> BackendResponse {
    json_response(403, json!({ "message": WORKSPACE_ACCESS_DENIED_MESSAGE }))
}

fn member_settings_denied_response() -> BackendResponse {
    json_response(403, json!({ "message": MEMBER_SETTINGS_DENIED_MESSAGE }))
}

fn internal_server_error_response() -> BackendResponse {
    json_response(500, json!({ "message": INTERNAL_SERVER_ERROR_MESSAGE }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn secret(name: &str, value: &str) -> SecretRow {
        SecretRow {
            name: Some(name.to_owned()),
            value: Some(value.to_owned()),
        }
    }

    #[test]
    fn member_settings_ws_id_matches_canonical_path() {
        assert_eq!(
            member_settings_ws_id(
                "/api/v1/workspaces/11111111-1111-4111-8111-111111111111/settings/members"
            ),
            Some("11111111-1111-4111-8111-111111111111")
        );
        assert_eq!(
            member_settings_ws_id("/api/v1/workspaces/personal/settings/members"),
            Some("personal")
        );
    }

    #[test]
    fn member_settings_ws_id_rejects_non_matching_paths() {
        // Wrong/extra suffix.
        assert_eq!(
            member_settings_ws_id("/api/v1/workspaces/ws-1/settings/members/extra"),
            None
        );
        assert_eq!(
            member_settings_ws_id("/api/v1/workspaces/ws-1/settings/roles"),
            None
        );
        // Missing version segment (legacy mount is /api/v1/...).
        assert_eq!(
            member_settings_ws_id("/api/workspaces/ws-1/settings/members"),
            None
        );
        // Empty ws id segment.
        assert_eq!(
            member_settings_ws_id("/api/v1/workspaces//settings/members"),
            None
        );
        // Nested ws id (would contain a slash).
        assert_eq!(
            member_settings_ws_id("/api/v1/workspaces/a/b/settings/members"),
            None
        );
        // Unrelated path.
        assert_eq!(member_settings_ws_id("/api/health"), None);
    }

    #[test]
    fn resolve_workspace_id_only_maps_internal_slug() {
        assert_eq!(resolve_workspace_id("internal"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("INTERNAL"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("personal"), "personal");
        assert_eq!(resolve_workspace_id("ws-handle"), "ws-handle");
        assert_eq!(
            resolve_workspace_id("11111111-1111-4111-8111-111111111111"),
            "11111111-1111-4111-8111-111111111111"
        );
    }

    #[test]
    fn disable_invite_value_requires_exact_true() {
        assert!(disable_invite_value(&[secret(
            DISABLE_INVITE_SECRET,
            "true"
        )]));
        assert!(!disable_invite_value(&[secret(
            DISABLE_INVITE_SECRET,
            "false"
        )]));
        assert!(!disable_invite_value(&[secret(
            DISABLE_INVITE_SECRET,
            "TRUE"
        )]));
        assert!(!disable_invite_value(&[secret(DISABLE_INVITE_SECRET, "1")]));
    }

    #[test]
    fn disable_invite_value_ignores_other_secrets_and_missing() {
        assert!(!disable_invite_value(&[]));
        assert!(!disable_invite_value(&[secret("OTHER_SECRET", "true")]));
        // First matching DISABLE_INVITE row wins (rows are created_at.desc).
        assert!(disable_invite_value(&[
            secret(DISABLE_INVITE_SECRET, "true"),
            secret(DISABLE_INVITE_SECRET, "false"),
        ]));
    }

    #[test]
    fn disable_invite_value_handles_null_value() {
        let rows = vec![SecretRow {
            name: Some(DISABLE_INVITE_SECRET.to_owned()),
            value: None,
        }];
        assert!(!disable_invite_value(&rows));
    }
}
