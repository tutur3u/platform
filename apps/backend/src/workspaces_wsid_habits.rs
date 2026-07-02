//! Handler for `GET /api/v1/workspaces/:wsId/habits`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/habits/route.ts`.
//!
//! GET lists every habit for a workspace. The legacy auth model is:
//!   1. resolve the authenticated session user (else `401` "Please sign in to
//!      view habits");
//!   2. normalize the workspace id (`personal`/`internal`/handle aliases);
//!   3. validate the normalized id is a UUID (else `400` "Invalid workspace
//!      ID");
//!   4. gate on the `ENABLE_HABITS` workspace secret (else `404` "Not found",
//!      mirroring `habitsNotFoundResponse`);
//!   5. verify workspace membership (`MEMBER`), returning `500` "Failed to
//!      verify workspace membership" on lookup failure and `403` "You don't
//!      have access to this workspace" when not a member.
//!
//! On success it reads `workspace_habits` with the admin (service-role) client
//! scoped by `ws_id`, ordered by `created_at` desc, optionally filtered to
//! active and non-deleted rows, and returns `{ "habits": [...] }`. Read failures
//! map to `500` "Failed to fetch habits".
//!
//! Behavior gaps / notes:
//!   * Only GET is migrated. POST (and any other method) returns `None` so the
//!     worker falls through to the still-live Next.js route.
//!   * The workspace-id normalization, membership verification, and
//!     habits-enabled checks are COPIED from `workspace_habits_access.rs` /
//!     `workspaces_habits_habitid_stats.rs` because those fns are private and
//!     editing those modules is out of scope for this port.

use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const ENABLE_HABITS_SECRET: &str = "ENABLE_HABITS";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const HABITS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const HABITS_PATH_SUFFIX: &str = "/habits";

// ============================================================================
// ROUTE ENTRY
// ============================================================================

pub(crate) async fn handle_workspaces_wsid_habits_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = habits_ws_id(request.path)?;

    Some(match request.method {
        "GET" => habits_get_response(config, request, raw_ws_id, outbound).await,
        // Every non-GET method (POST, etc.) is still served by the live
        // Next.js route, so fall through instead of returning a 405.
        _ => return None,
    })
}

async fn habits_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, "Please sign in to view habits");
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, "Please sign in to view habits");
    };

    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            // Legacy: normalizeWorkspaceId failure surfaces as membership lookup failure.
            Err(()) => return error_response(500, "Failed to verify workspace membership"),
        };

    // validate(normalizedWsId) -> 400 "Invalid workspace ID".
    if !is_uuid(&resolved_ws_id) {
        return error_response(400, "Invalid workspace ID");
    }

    // isHabitsEnabled gate (returns the same 404 the legacy habitsNotFoundResponse uses).
    if !habits_workspace_enabled(contact_data, outbound, &resolved_ws_id)
        .await
        .unwrap_or(false)
    {
        return error_response(404, "Not found");
    }

    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(403, "You don't have access to this workspace"),
        Err(()) => return error_response(500, "Failed to verify workspace membership"),
    }

    let url = request.url.and_then(|url| url::Url::parse(url).ok());
    let active_only = active_only_from(query_value(url.as_ref(), "active").as_deref());
    let include_deleted =
        include_deleted_from(query_value(url.as_ref(), "includeDeleted").as_deref());

    match fetch_habits(
        contact_data,
        outbound,
        &resolved_ws_id,
        active_only,
        include_deleted,
    )
    .await
    {
        Ok(habits) => no_store_response(json_response(200, json!({ "habits": habits }))),
        Err(()) => error_response(500, "Failed to fetch habits"),
    }
}

// ============================================================================
// QUERY PARSING
// ============================================================================

/// `searchParams.get('active') !== 'false'` — defaults to active-only.
fn active_only_from(value: Option<&str>) -> bool {
    value != Some("false")
}

/// `searchParams.get('includeDeleted') === 'true'` — defaults to excluding deleted.
fn include_deleted_from(value: Option<&str>) -> bool {
    value == Some("true")
}

fn query_value(url: Option<&url::Url>, key: &str) -> Option<String> {
    url?.query_pairs()
        .find_map(|(name, value)| (name == key).then(|| value.into_owned()))
}

// ============================================================================
// HABITS READ (service-role / admin client)
// ============================================================================

async fn fetch_habits(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    active_only: bool,
    include_deleted: bool,
) -> Result<Vec<serde_json::Value>, ()> {
    let mut params = vec![
        ("select", "*".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "created_at.desc".to_owned()),
    ];
    if active_only {
        params.push(("is_active", "eq.true".to_owned()));
    }
    if !include_deleted {
        params.push(("deleted_at", "is.null".to_owned()));
    }

    let Some(url) = contact_data.rest_url("workspace_habits", &params) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<serde_json::Value>>().map_err(|_| ())
}

// ============================================================================
// PATH MATCHING
// ============================================================================

fn habits_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(HABITS_PATH_PREFIX)?
        .strip_suffix(HABITS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

// ============================================================================
// WORKSPACE ACCESS HELPERS
//
// COPIED (file-local) from `workspace_habits_access.rs` because those fns are
// private there and editing that file is out of scope for this port.
// ============================================================================

#[derive(serde::Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(serde::Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(serde::Deserialize)]
struct WorkspaceSecretRow {
    value: Option<String>,
}

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

    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        == Some("MEMBER"))
}

async fn habits_workspace_enabled(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "value".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("name", format!("eq.{ENABLE_HABITS_SECRET}")),
            ("order", "created_at.desc".to_owned()),
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
        .json::<Vec<WorkspaceSecretRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.value)
        .as_deref()
        == Some("true"))
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
    is_uuid(value)
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

fn is_uuid(value: &str) -> bool {
    let value = value.trim();
    value.len() == 36
        && value.chars().enumerate().all(|(index, ch)| match index {
            8 | 13 | 18 | 23 => ch == '-',
            _ => ch.is_ascii_hexdigit(),
        })
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ============================================================================
// TESTS (pure/sync helpers only)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_matches_exact_route() {
        assert_eq!(
            habits_ws_id("/api/v1/workspaces/ws-123/habits"),
            Some("ws-123")
        );
    }

    #[test]
    fn path_guard_rejects_other_routes() {
        assert_eq!(habits_ws_id("/api/v1/workspaces/ws-123/habits/abc"), None);
        assert_eq!(habits_ws_id("/api/v1/workspaces//habits"), None);
        assert_eq!(habits_ws_id("/api/workspaces/ws-123/habits"), None);
        assert_eq!(habits_ws_id("/api/v1/workspaces/ws-123/habit"), None);
        assert_eq!(
            habits_ws_id("/api/v1/workspaces/ws/extra/habits"),
            None,
            "embedded slash in ws id must not match"
        );
    }

    #[test]
    fn active_only_defaults_true_and_only_false_disables() {
        assert!(active_only_from(None));
        assert!(active_only_from(Some("true")));
        assert!(active_only_from(Some("anything")));
        assert!(!active_only_from(Some("false")));
    }

    #[test]
    fn include_deleted_defaults_false_and_only_true_enables() {
        assert!(!include_deleted_from(None));
        assert!(!include_deleted_from(Some("false")));
        assert!(!include_deleted_from(Some("1")));
        assert!(include_deleted_from(Some("true")));
    }

    #[test]
    fn query_value_extracts_named_param() {
        let url = url::Url::parse(
            "https://example.com/api/v1/workspaces/ws/habits?active=false&includeDeleted=true",
        )
        .unwrap();
        assert_eq!(query_value(Some(&url), "active").as_deref(), Some("false"));
        assert_eq!(
            query_value(Some(&url), "includeDeleted").as_deref(),
            Some("true")
        );
        assert_eq!(query_value(Some(&url), "missing"), None);
        assert_eq!(query_value(None, "active"), None);
    }

    #[test]
    fn uuid_validation_matches_legacy_shape() {
        assert!(is_uuid("00000000-0000-0000-0000-000000000000"));
        assert!(is_uuid("a1b2c3d4-e5f6-7890-abcd-ef0123456789"));
        assert!(!is_uuid("not-a-uuid"));
        assert!(!is_uuid("personal"));
        assert!(!is_uuid(""));
    }

    #[test]
    fn resolve_workspace_id_maps_internal_to_root() {
        assert_eq!(resolve_workspace_id("internal"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("INTERNAL"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("my-handle"), "my-handle");
    }
}
