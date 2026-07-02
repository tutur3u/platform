//! Handler for `GET /api/v1/workspaces/:wsId/roles/default`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/roles/default/route.ts` (GET only;
//! the legacy PUT remains served by Next.js — this handler returns `None` for
//! every non-GET method so the worker falls through).
//!
//! The legacy GET handler:
//!   1. parses the `memberType` query param via `parseDefaultMemberType`:
//!      absent/empty -> `MEMBER`; `MEMBER` or `GUEST` accepted verbatim; any
//!      other value -> `null`, which yields
//!      `400 { "message": "Invalid memberType. Use MEMBER or GUEST." }`.
//!      (This validation runs BEFORE authorization, matching legacy order.)
//!   2. authorizes via `getPermissions({ wsId, request })`, requiring the
//!      `manage_workspace_roles` workspace permission. A `null` permission
//!      context (unauthenticated / unresolved workspace) AND a missing
//!      permission both return
//!      `403 { "message": "Workspace role access denied" }`.
//!   3. reads `workspace_default_permissions` with the admin (service-role)
//!      client, selecting `id:permission, enabled` (PostgREST renames the
//!      `permission` column to `id`), filtered by `ws_id` (the resolved
//!      workspace id) and `member_type`, ordered by `permission` ascending.
//!   4. on read error returns
//!      `500 { "message": "Error fetching default workspace permissions" }`.
//!   5. on success returns
//!      `{ id: "DEFAULT", member_type, name: "<MEMBER_TYPE>_DEFAULT",
//!         permissions: data ?? [] }`.
//!
//! Auth mapping (this handler reuses `authorize_workspace_permission`, which
//! distinguishes more error states than the legacy `getPermissions` boolean):
//!   * Unauthorized / NotFound / Forbidden -> `403 Workspace role access denied`
//!     (the legacy route collapses all of these to a 403)
//!   * Internal (config / upstream failure during auth) -> `500` (the legacy
//!     route would throw an unhandled error -> 500)
//!
//! BEHAVIOR GAP: none known. The legacy route sets no explicit cache headers;
//! this handler mirrors the rest of the migrated read handlers by returning a
//! `no-store` response.

use serde_json::{Value, json};

use crate::{
    BackendConfig, BackendRequest, BackendResponse, contact, json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const ROLES_DEFAULT_PATH_PREFIX: &str = "/api/v1/workspaces/";
const ROLES_DEFAULT_PATH_SUFFIX: &str = "/roles/default";

const WORKSPACE_DEFAULT_PERMISSIONS_TABLE: &str = "workspace_default_permissions";
const MANAGE_WORKSPACE_ROLES_PERMISSION: &str = "manage_workspace_roles";

const DEFAULT_PERMISSIONS_SELECT: &str = "id:permission, enabled";

const APPLICATION_JSON: &str = "application/json";

const ACCESS_DENIED_MESSAGE: &str = "Workspace role access denied";
const FETCH_FAILED_MESSAGE: &str = "Error fetching default workspace permissions";
const INTERNAL_ERROR_MESSAGE: &str = "Internal server error";
const INVALID_MEMBER_TYPE_MESSAGE: &str = "Invalid memberType. Use MEMBER or GUEST.";

const MEMBER_TYPE_MEMBER: &str = "MEMBER";
const MEMBER_TYPE_GUEST: &str = "GUEST";

pub(crate) async fn handle_workspaces_wsid_roles_default_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = roles_default_ws_id(request.path)?;

    // Only GET is migrated. PUT (and any other method) must fall through to the
    // still-active Next.js route by returning None (not a 405).
    Some(match request.method {
        "GET" => roles_default_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn roles_default_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Legacy validates memberType BEFORE authorization.
    let Some(member_type) = parse_default_member_type(member_type_query_value(request.url)) else {
        return message_response(400, INVALID_MEMBER_TYPE_MESSAGE);
    };

    let ws_id = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        MANAGE_WORKSPACE_ROLES_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization.ws_id,
        Err(error) => return auth_error_response(error),
    };

    match fetch_default_permissions(&config.contact_data, outbound, &ws_id, member_type).await {
        Ok(permissions) => no_store_response(json_response(
            200,
            json!({
                "id": "DEFAULT",
                "member_type": member_type,
                "name": format!("{member_type}_DEFAULT"),
                "permissions": permissions,
            }),
        )),
        Err(()) => message_response(500, FETCH_FAILED_MESSAGE),
    }
}

/// Reads `workspace_default_permissions` with the service-role key, mirroring
/// `createAdminClient()` in the legacy route (RLS bypassed, scoped by `ws_id`
/// and `member_type`). Returns the rows (`[{ id, enabled }]`) on success.
async fn fetch_default_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    member_type: &str,
    // The select aliases `permission` -> `id`; ordering uses the real column.
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        WORKSPACE_DEFAULT_PERMISSIONS_TABLE,
        &[
            ("select", DEFAULT_PERMISSIONS_SELECT.to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("member_type", format!("eq.{member_type}")),
            ("order", "permission.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

/// Mirrors `parseDefaultMemberType`:
///   * `None` / empty -> `Some("MEMBER")`
///   * `"MEMBER"` / `"GUEST"` -> echoed back
///   * anything else -> `None` (legacy 400)
fn parse_default_member_type(value: Option<&str>) -> Option<&'static str> {
    match value {
        None => Some(MEMBER_TYPE_MEMBER),
        Some("") => Some(MEMBER_TYPE_MEMBER),
        Some(MEMBER_TYPE_MEMBER) => Some(MEMBER_TYPE_MEMBER),
        Some(MEMBER_TYPE_GUEST) => Some(MEMBER_TYPE_GUEST),
        Some(_) => None,
    }
}

/// Reads the raw `memberType` query value. Mirrors
/// `new URL(req.url).searchParams.get('memberType')`, returning `None` when the
/// param is absent (so the default applies).
fn member_type_query_value(request_url: Option<&str>) -> Option<&str> {
    let request_url = request_url?;
    let query = request_url.split_once('?').map(|(_, query)| query)?;

    for pair in query.split('&') {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        if key == "memberType" {
            // `memberType` values here are plain identifiers (MEMBER / GUEST),
            // so no percent-decoding is required to distinguish them.
            return Some(value);
        }
    }

    None
}

fn auth_error_response(error: WorkspacePermissionAuthorizationError) -> BackendResponse {
    match error {
        // Legacy collapses null permissions AND missing permission into a 403.
        WorkspacePermissionAuthorizationError::Unauthorized
        | WorkspacePermissionAuthorizationError::NotFound
        | WorkspacePermissionAuthorizationError::Forbidden => {
            message_response(403, ACCESS_DENIED_MESSAGE)
        }
        // Config / upstream failure during auth -> legacy throws -> 500.
        WorkspacePermissionAuthorizationError::Internal => {
            message_response(500, INTERNAL_ERROR_MESSAGE)
        }
    }
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn roles_default_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(ROLES_DEFAULT_PATH_PREFIX)?
        .strip_suffix(ROLES_DEFAULT_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_extracts_ws_id() {
        assert_eq!(
            roles_default_ws_id("/api/v1/workspaces/ws-123/roles/default"),
            Some("ws-123")
        );
        assert_eq!(
            roles_default_ws_id("/api/v1/workspaces/personal/roles/default"),
            Some("personal")
        );
    }

    #[test]
    fn path_guard_rejects_non_matching_paths() {
        // Wrong prefix (no v1).
        assert_eq!(
            roles_default_ws_id("/api/workspaces/ws-1/roles/default"),
            None
        );
        // Roles list (no /default suffix).
        assert_eq!(roles_default_ws_id("/api/v1/workspaces/ws-1/roles"), None);
        // Deeper nested path.
        assert_eq!(
            roles_default_ws_id("/api/v1/workspaces/ws-1/roles/default/extra"),
            None
        );
        // Empty ws id.
        assert_eq!(
            roles_default_ws_id("/api/v1/workspaces//roles/default"),
            None
        );
        // Nested ws segment.
        assert_eq!(
            roles_default_ws_id("/api/v1/workspaces/a/b/roles/default"),
            None
        );
        // Unrelated route (must not panic / must return None).
        assert_eq!(roles_default_ws_id("/api/v1/health"), None);
    }

    #[test]
    fn parse_default_member_type_matches_legacy() {
        // Absent -> default MEMBER.
        assert_eq!(parse_default_member_type(None), Some(MEMBER_TYPE_MEMBER));
        // Empty -> default MEMBER.
        assert_eq!(
            parse_default_member_type(Some("")),
            Some(MEMBER_TYPE_MEMBER)
        );
        // Exact accepted values.
        assert_eq!(
            parse_default_member_type(Some("MEMBER")),
            Some(MEMBER_TYPE_MEMBER)
        );
        assert_eq!(
            parse_default_member_type(Some("GUEST")),
            Some(MEMBER_TYPE_GUEST)
        );
        // Invalid -> None (legacy 400). Case-sensitive, matching JS includes().
        assert_eq!(parse_default_member_type(Some("member")), None);
        assert_eq!(parse_default_member_type(Some("ADMIN")), None);
    }

    #[test]
    fn member_type_query_value_reads_param() {
        assert_eq!(
            member_type_query_value(Some(
                "https://tuturuuu.localhost/api/v1/workspaces/ws-1/roles/default?memberType=GUEST"
            )),
            Some("GUEST")
        );
        // Present but empty.
        assert_eq!(
            member_type_query_value(Some(
                "https://tuturuuu.localhost/api/v1/workspaces/ws-1/roles/default?memberType="
            )),
            Some("")
        );
        // Absent param.
        assert_eq!(
            member_type_query_value(Some(
                "https://tuturuuu.localhost/api/v1/workspaces/ws-1/roles/default"
            )),
            None
        );
        // Among other params.
        assert_eq!(
            member_type_query_value(Some(
                "https://tuturuuu.localhost/api/v1/workspaces/ws-1/roles/default?foo=bar&memberType=MEMBER&baz=1"
            )),
            Some("MEMBER")
        );
        // No URL at all.
        assert_eq!(member_type_query_value(None), None);
    }
}
