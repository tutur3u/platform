//! Handler for `GET /api/v1/workspaces/:wsId/api-keys/roles`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/api-keys/roles/route.ts`.
//!
//! The legacy route is wrapped in `withSessionAuth`, normalizes the workspace
//! id, runs `assertWorkspaceApiKeysAccess` (workspace membership + the
//! `manage_api_keys` permission), then reads `workspace_roles` (`id, name`)
//! filtered by `ws_id` and ordered by `name` ascending with the *caller's*
//! Supabase client (RLS active). On success it returns `{ "data": rows }`.
//!
//! This mirrors the already-migrated `workspaces_api_keys_keyid_usage_logs`
//! handler, which ports the same `assertWorkspaceApiKeysAccess` helper. The
//! workspace-membership and permission checks use the service-role client (as
//! in that template); the final `workspace_roles` read forwards the caller's
//! access token to keep RLS semantics identical to the legacy route.
//!
//! Status codes (matching legacy / the shared helper):
//!   * missing/invalid Supabase session            -> `401 { "error": "Unauthorized" }`
//!   * workspace-id resolution failure             -> `500 { "message": "Internal server error" }`
//!   * membership lookup failure                   -> `500 { "error": "Failed to verify workspace membership" }`
//!   * non-member caller                           -> `403 { "message": "You don't have access to this workspace" }`
//!   * permission RPC failure                      -> `500 { "message": "Error checking permission" }`
//!   * caller lacking `manage_api_keys`            -> `403 { "message": "You do not have permission to manage API keys" }`
//!   * `workspace_roles` read failure              -> `500 { "message": "Error fetching workspace roles" }`
//!   * success                                     -> `200 { "data": [ { "id", "name" }, ... ] }`
//!
//! NOTE (behavior gap): the legacy `withSessionAuth` wrapper also accepts
//! Tuturuuu app-session and CLI bearer tokens. As in the usage-logs template,
//! this handler only resolves Supabase access tokens (bearer or auth cookie)
//! and returns `401` when an app-session token is present, so app/CLI callers
//! are not served the migrated GET here. The legacy 401 body for the session
//! wrapper is `{ "error": "Unauthorized" }`.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// Path shape: /api/v1/workspaces/{wsId}/api-keys/roles
const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/api-keys/roles";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "You don't have access to this workspace";
const NO_PERMISSION_MESSAGE: &str = "You do not have permission to manage API keys";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace membership";
const PERMISSION_CHECK_ERROR_MESSAGE: &str = "Error checking permission";
const FETCH_ROLES_ERROR_MESSAGE: &str = "Error fetching workspace roles";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const MANAGE_API_KEYS_PERMISSION: &str = "manage_api_keys";
const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";

#[derive(serde::Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(serde::Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_api_keys_roles_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = roles_ws_id(request.path)?;

    Some(match request.method {
        "GET" => roles_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn roles_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };

    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(()) => return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
        };

    // assertWorkspaceApiKeysAccess: membership + manage_api_keys permission.
    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(403, FORBIDDEN_MESSAGE),
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    match has_manage_api_keys_permission(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(403, NO_PERMISSION_MESSAGE),
        Err(()) => return message_response(500, PERMISSION_CHECK_ERROR_MESSAGE),
    }

    match fetch_roles(contact_data, outbound, &resolved_ws_id, &access_token).await {
        Ok(rows) => no_store_response(json_response(200, json!({ "data": rows }))),
        Err(()) => message_response(500, FETCH_ROLES_ERROR_MESSAGE),
    }
}

async fn fetch_roles(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    access_token: &str,
) -> Result<Vec<Value>, ()> {
    // Legacy reads via the caller's Supabase client (RLS active), so forward the
    // caller access token instead of the service-role key.
    let Some(url) = contact_data.rest_url(
        "workspace_roles",
        &[
            ("select", "id,name".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("order", "name.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

async fn has_manage_api_keys_permission(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let rpc_url = contact_data
        .rpc_url(HAS_WORKSPACE_PERMISSION_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&json!({
        "p_user_id": user_id,
        "p_ws_id": ws_id,
        "p_permission": MANAGE_API_KEYS_PERMISSION,
    }))
    .map_err(|_| ())?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response.json::<bool>().unwrap_or(false))
}

async fn verify_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // verifyWorkspaceMembershipType defaults to requiredType "MEMBER" and
    // requires an exact match (not OWNER/ADMIN), mirrored here.
    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        == Some("MEMBER"))
}

// --- Workspace id normalization (mirrors workspaces_api_keys_keyid_usage_logs). ---

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(resolved_ws_id);
        }

        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, access_token).await?
        {
            return Ok(workspace_id);
        }
        if let Some(workspace_id) =
            workspace_id_by_handle_service_role(contact_data, outbound, &handle).await?
        {
            return Ok(workspace_id);
        }
    }

    Ok(resolved_ws_id)
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let Some(url) = contact_data.rest_url(
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
    ) else {
        return Err(());
    };
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id)
        .ok_or(())
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id".to_owned()),
            ("handle", format!("eq.{handle}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn workspace_id_by_handle_service_role(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id".to_owned()),
            ("handle", format!("eq.{handle}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn send_caller_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

async fn send_service_role_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
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
            .all(|(index, value)| match index {
                8 | 13 | 18 | 23 => value == '-',
                _ => value.is_ascii_hexdigit(),
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

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

fn roles_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roles_ws_id_extracts_workspace_segment() {
        assert_eq!(
            roles_ws_id("/api/v1/workspaces/ws-123/api-keys/roles"),
            Some("ws-123")
        );
    }

    #[test]
    fn roles_ws_id_rejects_other_paths() {
        assert_eq!(roles_ws_id("/api/v1/workspaces/ws-123/api-keys"), None);
        assert_eq!(
            roles_ws_id("/api/v1/workspaces/ws-123/api-keys/keyid/usage-logs"),
            None
        );
        assert_eq!(roles_ws_id("/api/workspaces/ws-123/api-keys/roles"), None);
        assert_eq!(roles_ws_id("/api/v1/workspaces//api-keys/roles"), None);
    }

    #[test]
    fn roles_ws_id_rejects_nested_workspace_segment() {
        assert_eq!(
            roles_ws_id("/api/v1/workspaces/ws/extra/api-keys/roles"),
            None
        );
    }

    #[test]
    fn resolve_workspace_id_maps_internal_slug_to_root() {
        assert_eq!(resolve_workspace_id("internal"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("ws-1"), "ws-1");
    }

    #[test]
    fn message_and_error_response_shapes_match_legacy() {
        let message = message_response(403, FORBIDDEN_MESSAGE);
        assert_eq!(message.status, 403);
        assert_eq!(message.body, json!({ "message": FORBIDDEN_MESSAGE }));

        let error = error_response(401, UNAUTHORIZED_MESSAGE);
        assert_eq!(error.status, 401);
        assert_eq!(error.body, json!({ "error": UNAUTHORIZED_MESSAGE }));
    }
}
