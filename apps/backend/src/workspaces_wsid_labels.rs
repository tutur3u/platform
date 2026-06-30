//! Handler for `GET /api/v1/workspaces/:wsId/labels`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/labels/route.ts`.
//!
//! Legacy GET behavior:
//!   * `withSessionAuth(..., { allowAppSessionAuth: { targetApp: [CLI, 'tasks'] } })`
//!     resolves the caller from a Supabase session OR a CLI/`tasks` app-session
//!     token; an unresolved caller yields `401 { "error": "Unauthorized" }`.
//!   * `normalizeWorkspaceId(id, supabase)` resolves `internal`/`personal`/handle
//!     aliases to a workspace UUID.
//!   * `verifyWorkspaceMembershipType({ wsId, userId, supabase })` requires the
//!     caller to be an exact `MEMBER` of the workspace:
//!       - membership lookup DB error -> `500 { "error": "Failed to verify workspace membership" }`
//!       - not a member / wrong member type -> `403 { "error": "Access denied" }`
//!   * reads `workspace_task_labels.* where ws_id = <wsId> order by created_at desc`
//!     with the admin (service-role) client and returns the raw array as JSON;
//!     a read failure yields `500 { "error": "Failed to fetch labels" }`.
//!   * any thrown error (e.g. unresolved `personal` workspace) is caught and
//!     reported as `500 { "error": "Internal server error" }`.
//!
//! Only GET is migrated here; POST stays on the still-live Next.js route (this
//! handler returns `None` for every other method).
//!
//! BEHAVIOR GAP: the legacy route also accepts CLI/`tasks` app-session tokens.
//! Reproducing app-session identity resolution + the `tasks` JWT verification is
//! intentionally left on the Next.js route, so when the request carries an
//! app-session token this handler returns `None` and the legacy GET serves it
//! unchanged. The common authenticated path (Supabase cookie/bearer session) is
//! migrated here.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const LABELS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const LABELS_PATH_SUFFIX: &str = "/labels";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const WORKSPACE_TASK_LABELS_TABLE: &str = "workspace_task_labels";

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

enum DataAuth<'a> {
    AccessToken(&'a str),
    ServiceRole,
}

pub(crate) async fn handle_workspaces_wsid_labels_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = labels_ws_id(request.path)?;

    // Owned method is GET only; every other method (POST, ...) falls through to
    // the still-live Next.js route.
    match request.method {
        "GET" => {}
        _ => return None,
    }

    // App-session callers (CLI / `tasks`) remain on the legacy Next.js GET, which
    // owns app-session identity resolution. Fall through for them.
    if contact::request_has_app_session_token(request) {
        return None;
    }

    Some(labels_response(config, request, raw_ws_id, outbound).await)
}

async fn labels_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        return internal_server_error_response();
    }

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return unauthorized_response();
    };
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return unauthorized_response();
    };
    let Some(user_id) = user.id.filter(|id| !id.trim().is_empty()) else {
        return unauthorized_response();
    };

    // `normalizeWorkspaceId` may throw (e.g. unresolved `personal`); the legacy
    // GET catches that and reports a generic 500.
    let ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(Some(ws_id)) => ws_id,
            Ok(None) | Err(()) => return internal_server_error_response(),
        };

    match verify_member(contact_data, outbound, &ws_id, &user_id, &access_token).await {
        Ok(true) => {}
        Ok(false) => return access_denied_response(),
        Err(()) => return membership_lookup_failed_response(),
    }

    match fetch_labels(contact_data, outbound, &ws_id).await {
        Ok(labels) => no_store_response(json_response(200, labels)),
        Err(()) => fetch_labels_error_response(),
    }
}

/// Mirrors `verifyWorkspaceMembershipType` with the default `requiredType =
/// 'MEMBER'`: the caller must have an exact `MEMBER` membership row. Returns
/// `Err(())` for an upstream lookup failure (legacy 500), `Ok(false)` for a
/// missing/mismatched membership (legacy 403), and `Ok(true)` otherwise.
async fn verify_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
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
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        &DataAuth::AccessToken(access_token),
    )
    .await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let membership_type =
        decode_first_row::<WorkspaceMembershipRow>(&response)?.and_then(|row| row.membership_type);

    Ok(membership_type.as_deref() == Some("MEMBER"))
}

/// Reads `workspace_task_labels.* where ws_id = <wsId> order by created_at desc`
/// with the service-role client, mirroring the legacy admin read. Returns the
/// raw PostgREST array unchanged so the response shape matches the legacy route.
async fn fetch_labels(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Value, ()> {
    let Some(url) = contact_data.rest_url(
        WORKSPACE_TASK_LABELS_TABLE,
        &[
            ("select", "*".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("order", "created_at.desc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        &DataAuth::ServiceRole,
    )
    .await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Value>().map_err(|_| ())
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        // Legacy throws when the personal workspace cannot be resolved; surface
        // that as `Ok(None)` so the caller maps it to the generic 500.
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(Some(resolved_ws_id));
        }

        if let Some(workspace_id) = workspace_id_by_handle(
            contact_data,
            outbound,
            &handle,
            &DataAuth::AccessToken(access_token),
        )
        .await?
        {
            return Ok(Some(workspace_id));
        }

        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, &DataAuth::ServiceRole).await?
        {
            return Ok(Some(workspace_id));
        }
    }

    Ok(Some(resolved_ws_id))
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
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
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        &DataAuth::AccessToken(access_token),
    )
    .await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    auth: &DataAuth<'_>,
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
    let response =
        send_rest_request(contact_data, outbound, OutboundMethod::Get, &url, auth).await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}

async fn send_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
    auth: &DataAuth<'_>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = match auth {
        DataAuth::AccessToken(access_token) => format!("Bearer {access_token}"),
        DataAuth::ServiceRole => format!("Bearer {service_role_key}"),
    };

    outbound
        .send(
            OutboundRequest::new(method, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

fn decode_first_row<T: for<'de> Deserialize<'de>>(
    response: &OutboundResponse,
) -> Result<Option<T>, ()> {
    response
        .json::<Vec<T>>()
        .map(|rows| rows.into_iter().next())
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

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn labels_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(LABELS_PATH_PREFIX)?
        .strip_suffix(LABELS_PATH_SUFFIX)?;

    // Reject empty and nested paths so this handler only claims the exact
    // `/api/v1/workspaces/{wsId}/labels` collection route.
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(401, json!({ "error": "Unauthorized" })))
}

fn access_denied_response() -> BackendResponse {
    no_store_response(json_response(403, json!({ "error": "Access denied" })))
}

fn membership_lookup_failed_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "error": "Failed to verify workspace membership" }),
    ))
}

fn fetch_labels_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "error": "Failed to fetch labels" }),
    ))
}

fn internal_server_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "error": "Internal server error" }),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels_ws_id_extracts_workspace_id() {
        assert_eq!(
            labels_ws_id("/api/v1/workspaces/abc-123/labels"),
            Some("abc-123")
        );
    }

    #[test]
    fn labels_ws_id_rejects_wrong_prefix() {
        // No `/v1` segment, or a different collection, must not match.
        assert_eq!(labels_ws_id("/api/workspaces/abc/labels"), None);
        assert_eq!(labels_ws_id("/api/v1/workspaces/abc/tags"), None);
    }

    #[test]
    fn labels_ws_id_rejects_nested_and_empty() {
        assert_eq!(labels_ws_id("/api/v1/workspaces//labels"), None);
        assert_eq!(
            labels_ws_id("/api/v1/workspaces/abc/labels/extra/labels"),
            None
        );
    }

    #[test]
    fn resolve_workspace_id_maps_internal_slug_to_root() {
        assert_eq!(resolve_workspace_id("internal"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("INTERNAL"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("my-ws"), "my-ws");
    }

    #[test]
    fn workspace_uuid_literal_detection() {
        assert!(is_workspace_uuid_literal(
            "11111111-1111-4111-8111-111111111111"
        ));
        assert!(!is_workspace_uuid_literal("not-a-uuid"));
        assert!(!is_workspace_uuid_literal("personal"));
    }

    #[test]
    fn direct_lookup_identifier_classification() {
        assert!(is_direct_workspace_lookup_identifier("personal"));
        assert!(is_direct_workspace_lookup_identifier("internal"));
        assert!(is_direct_workspace_lookup_identifier("my-team"));
        // Bare aliases that are not valid handles are looked up directly only
        // when they classify as handles/uuids/known slugs.
        assert!(!is_direct_workspace_lookup_identifier("-leading"));
    }

    #[test]
    fn response_builders_match_legacy_shapes() {
        let unauthorized = unauthorized_response();
        assert_eq!(unauthorized.status, 401);
        assert_eq!(unauthorized.body, json!({ "error": "Unauthorized" }));

        let denied = access_denied_response();
        assert_eq!(denied.status, 403);
        assert_eq!(denied.body, json!({ "error": "Access denied" }));

        let lookup_failed = membership_lookup_failed_response();
        assert_eq!(lookup_failed.status, 500);
        assert_eq!(
            lookup_failed.body,
            json!({ "error": "Failed to verify workspace membership" })
        );

        let fetch_error = fetch_labels_error_response();
        assert_eq!(fetch_error.status, 500);
        assert_eq!(
            fetch_error.body,
            json!({ "error": "Failed to fetch labels" })
        );

        let internal = internal_server_error_response();
        assert_eq!(internal.status, 500);
        assert_eq!(internal.body, json!({ "error": "Internal server error" }));
    }
}
