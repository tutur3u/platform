//! Handler for `GET /api/v1/workspaces/:wsId/api-keys/:keyId`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/api-keys/[keyId]/route.ts`
//! (GET only; the legacy `PUT` and `DELETE` mutation paths are intentionally
//! left to the still-live Next.js route and this handler returns `None` for
//! every non-GET method so the worker falls through).
//!
//! The legacy GET is wrapped in `withSessionAuth`, normalizes the workspace id,
//! reads `keyId` from the route params, runs `assertWorkspaceApiKeysAccess`
//! (workspace membership + the `manage_api_keys` permission), then reads a
//! single `workspace_api_keys` row with the *admin* (service-role) client
//! filtered by `id` + `ws_id` (`.maybeSingle()`), selecting only `SAFE_COLUMNS`.
//!
//! Response shape (matching legacy):
//!   * success                            -> `200 { "data": <row> }`
//!   * key not found (`!error && !data`)  -> `404 { "message": "API key not found" }`
//!   * `workspace_api_keys` read failure  -> `500 { "message": "Error fetching workspace API key" }`
//!
//! This mirrors the already-migrated sibling
//! `workspaces_api_keys_keyid_usage_logs` handler, which ports the same
//! `assertWorkspaceApiKeysAccess` helper and workspace-id normalization. The
//! membership and permission checks use the service-role client; the
//! `workspace_api_keys` read uses the service-role (admin) client, matching the
//! legacy `createAdminClient()` read (RLS bypassed, scoped by the `id` + `ws_id`
//! filters).
//!
//! Status codes (matching legacy / the shared helper):
//!   * missing/invalid Supabase session   -> `401 { "message": "Unauthorized" }`
//!   * workspace-id resolution failure     -> `500 { "message": "Internal server error" }`
//!   * membership lookup failure           -> `500 { "error": "Failed to verify workspace membership" }`
//!   * non-member caller                   -> `403 { "message": "You don't have access to this workspace" }`
//!   * permission RPC failure              -> `500 { "message": "Error checking permission" }`
//!   * caller lacking `manage_api_keys`    -> `403 { "message": "You do not have permission to manage API keys" }`
//!   * success / not-found / read failure  -> see shape above.
//!
//! NOTE (behavior gaps):
//!   * `withSessionAuth` also accepts Tuturuuu app-session and CLI bearer
//!     tokens; like the sibling handlers, this handler only resolves Supabase
//!     access tokens (bearer or auth cookie) and returns `401` otherwise.
//!   * The legacy `404` branch only fires when there is no error and no row
//!     (`!error && !data`); any read error maps to `500`. A non-2xx PostgREST
//!     response or a transport/decode failure is treated as the error path
//!     (`500`), while an empty result set is the not-found path (`404`),
//!     matching `.maybeSingle()` semantics.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// Path shape: /api/v1/workspaces/{wsId}/api-keys/{keyId}
const PATH_PREFIX: &str = "/api/v1/workspaces/";
const API_KEYS_SEGMENT: &str = "/api-keys/";

// Static sibling route under `/api-keys/` that Next.js prioritizes over the
// dynamic `[keyId]` segment; must not be intercepted by this handler.
const ROLES_SEGMENT: &str = "roles";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "You don't have access to this workspace";
const NO_PERMISSION_MESSAGE: &str = "You do not have permission to manage API keys";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace membership";
const PERMISSION_CHECK_ERROR_MESSAGE: &str = "Error checking permission";
const KEY_NOT_FOUND_MESSAGE: &str = "API key not found";
const FETCH_KEY_ERROR_MESSAGE: &str = "Error fetching workspace API key";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const MANAGE_API_KEYS_PERMISSION: &str = "manage_api_keys";
const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";

// SAFE_COLUMNS from the legacy route (spaces removed for the PostgREST select).
const SAFE_COLUMNS: &str = "id,ws_id,name,description,key_prefix,role_id,last_used_at,expires_at,created_at,updated_at,created_by";

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_api_keys_keyid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, key_id) = parse_path(request.path)?;

    Some(match request.method {
        "GET" => api_key_response(config, request, raw_ws_id, key_id, outbound).await,
        _ => return None,
    })
}

async fn api_key_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    key_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
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
        Err(()) => {
            return no_store_response(json_response(
                500,
                json!({ "error": MEMBERSHIP_LOOKUP_FAILED_MESSAGE }),
            ));
        }
    }

    match has_manage_api_keys_permission(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(403, NO_PERMISSION_MESSAGE),
        Err(()) => return message_response(500, PERMISSION_CHECK_ERROR_MESSAGE),
    }

    // Read the single key row with the service-role (admin) client. `.maybeSingle()`
    // maps to: empty result -> 404; read error -> 500; row -> 200 { data }.
    match fetch_api_key(contact_data, outbound, key_id, &resolved_ws_id).await {
        Ok(Some(row)) => no_store_response(json_response(200, json!({ "data": row }))),
        Ok(None) => message_response(404, KEY_NOT_FOUND_MESSAGE),
        Err(()) => message_response(500, FETCH_KEY_ERROR_MESSAGE),
    }
}

async fn fetch_api_key(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    key_id: &str,
    ws_id: &str,
) -> Result<Option<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_api_keys",
        &[
            ("select", SAFE_COLUMNS.to_owned()),
            ("id", format!("eq.{key_id}")),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<Value>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
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

// --- Workspace id normalization (mirrors the sibling api-keys handlers). ---

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

// --- Pure helpers (path guard, response shaping). ---

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

/// Extracts `(wsId, keyId)` from `/api/v1/workspaces/{wsId}/api-keys/{keyId}`.
///
/// Returns `None` (so the dispatch chain continues) for:
///   * any other prefix (e.g. `/api/...` without `/v1`),
///   * the collection route `/api-keys` (no `keyId`),
///   * nested routes like `/api-keys/{keyId}/usage-logs` or `/rotate`
///     (the `keyId` segment would contain a `/`), and
///   * the static sibling route `/api-keys/roles`, which Next.js serves from
///     its own folder in preference to the dynamic `[keyId]` segment.
fn parse_path(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    // rest == "{wsId}/api-keys/{keyId}"
    let (ws_id, key_id) = rest.split_once(API_KEYS_SEGMENT)?;

    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }
    if key_id.is_empty() || key_id.contains('/') {
        return None;
    }
    // `roles` is a static sibling route; do not intercept it.
    if key_id == ROLES_SEGMENT {
        return None;
    }

    Some((ws_id, key_id))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_path_extracts_workspace_and_key_segments() {
        assert_eq!(
            parse_path("/api/v1/workspaces/ws-123/api-keys/key-456"),
            Some(("ws-123", "key-456"))
        );
    }

    #[test]
    fn parse_path_rejects_collection_and_sibling_routes() {
        // Collection route (no keyId).
        assert_eq!(parse_path("/api/v1/workspaces/ws-123/api-keys"), None);
        // Static sibling route handled by its own folder.
        assert_eq!(parse_path("/api/v1/workspaces/ws-123/api-keys/roles"), None);
        // Nested routes under [keyId].
        assert_eq!(
            parse_path("/api/v1/workspaces/ws-123/api-keys/key-456/usage-logs"),
            None
        );
        assert_eq!(
            parse_path("/api/v1/workspaces/ws-123/api-keys/key-456/rotate"),
            None
        );
    }

    #[test]
    fn parse_path_rejects_other_prefixes_and_empty_segments() {
        // Missing the `/v1` version segment.
        assert_eq!(parse_path("/api/workspaces/ws-123/api-keys/key-456"), None);
        // Empty workspace segment.
        assert_eq!(parse_path("/api/v1/workspaces//api-keys/key-456"), None);
        // Nested workspace segment.
        assert_eq!(
            parse_path("/api/v1/workspaces/ws/extra/api-keys/key-456"),
            None
        );
        // Empty key segment.
        assert_eq!(parse_path("/api/v1/workspaces/ws-123/api-keys/"), None);
    }

    #[test]
    fn message_response_shape_matches_legacy() {
        let not_found = message_response(404, KEY_NOT_FOUND_MESSAGE);
        assert_eq!(not_found.status, 404);
        assert_eq!(not_found.body, json!({ "message": KEY_NOT_FOUND_MESSAGE }));

        let error = message_response(500, FETCH_KEY_ERROR_MESSAGE);
        assert_eq!(error.status, 500);
        assert_eq!(error.body, json!({ "message": FETCH_KEY_ERROR_MESSAGE }));
    }
}
