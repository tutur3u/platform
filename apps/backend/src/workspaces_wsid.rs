//! Handler for `GET /api/workspaces/:wsId`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/workspaces/[wsId]/route.ts` — GET method only.
//! PUT and DELETE are not migrated; this handler returns `None` for those
//! methods so the still-live Next.js route continues to handle them.
//!
//! ## Legacy GET behaviour
//!
//! The legacy route:
//!
//!   1. Authenticates the caller via Supabase session (or app-session JWT).
//!   2. Normalizes the workspace identifier ("personal", "internal", UUID,
//!      handle slug).
//!   3. Queries `workspaces` with an inner join on `workspace_members` filtered
//!      by the caller's user id to verify membership.
//!   4. On success returns all workspace columns (minus the synthetic
//!      `workspace_members` embed) with
//!      `Cache-Control: private, max-age=60, stale-while-revalidate=30`.
//!   5. On membership failure falls back to a task-board guest-share check and
//!      returns extended workspace data including `access_type: "guest"`.
//!   6. On total failure returns `500 { "message": "Error fetching workspaces" }`.
//!
//! ## Behaviour gaps vs. legacy
//!
//! - **App-session auth**: The legacy GET accepts `allowAppSessionAuth:
//!   CURRENT_USER_APP_SESSION_AUTH`. This handler uses
//!   `supabase_auth::request_access_token`, which ignores `ttr_app_*` bearer
//!   tokens. App-session callers receive `401 Unauthorized` instead of being
//!   authenticated.
//! - **Guest board-share fallback**: When the caller is not a direct workspace
//!   member the legacy route calls `loadTaskBoardGuestSharesForWorkspace` and
//!   returns extended workspace data with `access_type`, `guest_board_count`,
//!   `guest_highest_permission`, `guest_landing_path`, and `guest_products`.
//!   This handler returns `500 { "message": "Error fetching workspaces" }`
//!   instead, so guest-only users will see an error rather than reduced access.
//! - **Workspace-handle normalization**: Handle (slug) resolution follows the
//!   same two-step lookup (caller token then service-role) used in
//!   `workspace_permission_check::normalize_workspace_id`, covering UUIDs,
//!   "personal", "internal", and named handles.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const WORKSPACES_WSID_PATH_PREFIX: &str = "/api/workspaces/";
const WORKSPACE_CACHE_CONTROL: &str = "private, max-age=60, stale-while-revalidate=30";
const PERSONAL_SLUG: &str = "personal";
const INTERNAL_SLUG: &str = "internal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const FETCH_ERROR_MESSAGE: &str = "Error fetching workspaces";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_wsid_ws_id(request.path)?;

    Some(match request.method {
        "GET" => workspaces_wsid_get_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn workspaces_wsid_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        return error_response();
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

    let ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(Some(id)) => id,
            Ok(None) | Err(()) => return error_response(),
        };

    match fetch_workspace(contact_data, outbound, &ws_id, &user_id, &access_token).await {
        Ok(Some(data)) => {
            let mut response = json_response(200, data);
            response.cache_control = Some(WORKSPACE_CACHE_CONTROL);
            response
        }
        Ok(None) | Err(()) => error_response(),
    }
}

/// Normalize a raw workspace identifier to a UUID string.
///
/// Covers the common cases handled by the legacy
/// `normalizeWorkspaceId` helper:
///
/// - UUID literals are returned as-is.
/// - `"internal"` maps to the root workspace UUID.
/// - `"personal"` is resolved by querying the caller's personal workspace.
/// - Handle slugs are resolved by two-step lookup (caller token then
///   service-role).
async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let trimmed = raw_ws_id.trim();
    let lowered = trimmed.to_lowercase();

    if lowered == INTERNAL_SLUG {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
    }

    if is_workspace_uuid_literal(trimmed) {
        return Ok(Some(trimmed.to_owned()));
    }

    if lowered == PERSONAL_SLUG {
        return resolve_personal_workspace(contact_data, outbound, user_id, access_token).await;
    }

    // Named handle: try caller token first, then service role.
    if let Ok(Some(id)) = resolve_handle(contact_data, outbound, &lowered, Some(access_token)).await
    {
        return Ok(Some(id));
    }
    resolve_handle(contact_data, outbound, &lowered, None).await
}

async fn resolve_personal_workspace(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let url = contact_data
        .rest_url(
            "workspaces",
            &[
                ("select", "id,workspace_members!inner(user_id)".to_owned()),
                ("personal", "eq.true".to_owned()),
                ("workspace_members.user_id", format!("eq.{user_id}")),
                ("workspace_members.type", "eq.MEMBER".to_owned()),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {access_token}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;
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

async fn resolve_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    access_token: Option<&str>,
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
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = match access_token {
        Some(token) => format!("Bearer {token}"),
        None => format!("Bearer {service_role_key}"),
    };
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;
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

/// Fetch all workspace columns for the given `ws_id`, filtered by membership.
///
/// Uses the caller's access token so Supabase RLS applies. The synthetic
/// `workspace_members` embed is removed before the value is returned.
async fn fetch_workspace(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Option<Value>, ()> {
    let url = contact_data
        .rest_url(
            "workspaces",
            &[
                ("select", "*,workspace_members!inner(user_id)".to_owned()),
                ("id", format!("eq.{ws_id}")),
                ("workspace_members.user_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {access_token}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;
    if !(200..300).contains(&response.status) {
        return Ok(None);
    }
    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    let Some(mut workspace) = rows.into_iter().next() else {
        return Ok(None);
    };
    // Strip the synthetic workspace_members embed so the response matches the
    // legacy shape (`{ ...workspaceData }` without `workspace_members`).
    if let Some(obj) = workspace.as_object_mut() {
        obj.remove("workspace_members");
    }
    Ok(Some(workspace))
}

fn workspaces_wsid_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(WORKSPACES_WSID_PATH_PREFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn is_workspace_uuid_literal(value: &str) -> bool {
    value.len() == 36
        && value.chars().enumerate().all(|(index, c)| match index {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        })
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(
        401,
        json!({ "message": UNAUTHORIZED_MESSAGE }),
    ))
}

fn error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": FETCH_ERROR_MESSAGE }),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    const VALID_UUID: &str = "11111111-1111-4111-8111-111111111111";

    #[test]
    fn path_guard_matches_uuid() {
        let path = format!("/api/workspaces/{VALID_UUID}");
        assert_eq!(workspaces_wsid_ws_id(&path), Some(VALID_UUID));
    }

    #[test]
    fn path_guard_matches_personal_slug() {
        assert_eq!(
            workspaces_wsid_ws_id("/api/workspaces/personal"),
            Some("personal")
        );
    }

    #[test]
    fn path_guard_matches_internal_slug() {
        assert_eq!(
            workspaces_wsid_ws_id("/api/workspaces/internal"),
            Some("internal")
        );
    }

    #[test]
    fn path_guard_matches_handle() {
        assert_eq!(
            workspaces_wsid_ws_id("/api/workspaces/my-workspace"),
            Some("my-workspace")
        );
    }

    #[test]
    fn path_guard_rejects_empty_ws_id() {
        assert!(workspaces_wsid_ws_id("/api/workspaces/").is_none());
    }

    #[test]
    fn path_guard_rejects_sub_paths() {
        let path = format!("/api/workspaces/{VALID_UUID}/settings");
        assert!(workspaces_wsid_ws_id(&path).is_none());
    }

    #[test]
    fn path_guard_rejects_v1_paths() {
        let path = format!("/api/v1/workspaces/{VALID_UUID}");
        assert!(workspaces_wsid_ws_id(&path).is_none());
    }

    #[test]
    fn path_guard_rejects_list_path() {
        assert!(workspaces_wsid_ws_id("/api/workspaces").is_none());
    }

    #[test]
    fn uuid_check_accepts_valid_uuid() {
        assert!(is_workspace_uuid_literal(VALID_UUID));
        assert!(is_workspace_uuid_literal(ROOT_WORKSPACE_ID));
    }

    #[test]
    fn uuid_check_rejects_slugs_and_handles() {
        assert!(!is_workspace_uuid_literal("personal"));
        assert!(!is_workspace_uuid_literal("internal"));
        assert!(!is_workspace_uuid_literal("my-workspace"));
    }

    #[test]
    fn uuid_check_rejects_wrong_length() {
        assert!(!is_workspace_uuid_literal(
            "11111111-1111-4111-8111-11111111111"
        ));
        assert!(!is_workspace_uuid_literal(
            "11111111-1111-4111-8111-1111111111111"
        ));
    }
}
