//! Handler for `GET /api/v1/workspaces/:wsId/users/:userId`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/users/[userId]/route.ts`.
//!
//! The legacy GET exposes two code paths:
//!
//!   1. An `API_KEY` header path that validates a workspace API key and reads
//!      `workspace_users` with the admin (service-role) client.
//!   2. A session path that resolves the finance route auth context (supports
//!      Supabase session, app-session tokens, and CLI tokens), verifies the
//!      caller is a workspace member, then reads `workspace_users` with the
//!      admin client.
//!
//! This handler implements path 2 only. Path 1 is not reproduced because
//! `BackendRequest` does not surface raw extra headers such as `API_KEY`.
//! Requests that carry `API_KEY` fall through to the still-live Next.js route.
//!
//! ## Behavior gaps
//!
//!   * **API_KEY path** — not implemented; falls through to Next.js.
//!   * **Permission check** — the legacy GET permits any authenticated
//!     workspace member without requiring a named permission. This handler uses
//!     `authorize_finance_permission` with `"view_members"`, so members who
//!     lack that explicit grant are rejected with `403` instead of being
//!     allowed through. Workspace creators and holders of the `admin`
//!     permission are unaffected (they satisfy every permission check).
//!   * **Avatar normalization** — the legacy route calls
//!     `normalizeAvatarImageSrc` to expand relative Supabase storage paths
//!     into full CDN URLs. The Rust port returns the raw `avatar_url` value
//!     from Postgres without rewriting it.
//!
//! ## Status codes (session path)
//!
//!   * `401 { "message": "Unauthorized" }` — missing/invalid session or
//!     unresolved workspace.
//!   * `403 { "message": "Unauthorized" }` — authenticated but lacks
//!     `view_members`.
//!   * `500 { "message": "Error fetching workspace users" }` — Supabase
//!     read failure.
//!   * `200` — JSON array of matching `workspace_users` rows.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorization, FinanceAuthorizationError, authorize_finance_permission},
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const VIEW_MEMBERS_PERMISSION: &str = "view_members";
const ERROR_MESSAGE: &str = "Error fetching workspace users";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";

pub(crate) async fn handle_workspaces_wsid_users_userid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, user_id) = extract_path_params(request.path)?;

    Some(match request.method {
        "GET" => get_response(config, request, raw_ws_id, user_id, outbound).await,
        _ => return None,
    })
}

async fn get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let authorization = match authorize_finance_permission(
        config,
        request,
        raw_ws_id,
        VIEW_MEMBERS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(auth) => auth,
        Err(FinanceAuthorizationError::Unauthorized | FinanceAuthorizationError::NotFound) => {
            return message_response(401, UNAUTHORIZED_MESSAGE);
        }
        Err(FinanceAuthorizationError::Forbidden) => {
            return message_response(403, UNAUTHORIZED_MESSAGE);
        }
        Err(FinanceAuthorizationError::Internal) => {
            return error_response();
        }
    };

    match fetch_workspace_user(&config.contact_data, outbound, &authorization, user_id).await {
        Ok(data) => no_store_response(json_response(200, data)),
        Err(()) => error_response(),
    }
}

async fn fetch_workspace_user(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    user_id: &str,
) -> Result<Value, ()> {
    let url = contact_data
        .rest_url(
            "workspace_users",
            &[
                ("select", "*".to_owned()),
                ("ws_id", format!("eq.{}", authorization.ws_id)),
                ("id", format!("eq.{user_id}")),
            ],
        )
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

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
        return Err(());
    }

    response.json::<Value>().map_err(|_| ())
}

/// Extracts `(ws_id, user_id)` from a path of the exact shape
/// `/api/v1/workspaces/{wsId}/users/{userId}` (six non-empty segments).
///
/// Returns `None` for any other path shape, including sub-routes or paths
/// with extra trailing segments.
fn extract_path_params(path: &str) -> Option<(&str, &str)> {
    let segments: Vec<&str> = path
        .trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect();

    if segments.len() != 6 {
        return None;
    }

    let is_correct_shape = segments.first() == Some(&"api")
        && segments.get(1) == Some(&"v1")
        && segments.get(2) == Some(&"workspaces")
        && segments.get(4) == Some(&"users");

    if !is_correct_shape {
        return None;
    }

    let ws_id = segments.get(3)?;
    let user_id = segments.get(5)?;

    if ws_id.is_empty() || user_id.is_empty() {
        return None;
    }

    Some((ws_id, user_id))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response() -> BackendResponse {
    message_response(500, ERROR_MESSAGE)
}

#[cfg(test)]
mod tests {
    use super::extract_path_params;

    #[test]
    fn matches_valid_uuid_path() {
        let result = extract_path_params(
            "/api/v1/workspaces/550e8400-e29b-41d4-a716-446655440000/users/user-123",
        );
        assert_eq!(
            result,
            Some(("550e8400-e29b-41d4-a716-446655440000", "user-123"))
        );
    }

    #[test]
    fn matches_without_leading_slash() {
        let result = extract_path_params("api/v1/workspaces/ws-abc/users/user-xyz");
        assert_eq!(result, Some(("ws-abc", "user-xyz")));
    }

    #[test]
    fn rejects_extra_trailing_segment() {
        assert_eq!(
            extract_path_params("/api/v1/workspaces/ws-abc/users/user-xyz/extra"),
            None
        );
    }

    #[test]
    fn rejects_missing_user_id() {
        assert_eq!(
            extract_path_params("/api/v1/workspaces/ws-abc/users/"),
            None
        );
        assert_eq!(extract_path_params("/api/v1/workspaces/ws-abc/users"), None);
    }

    #[test]
    fn rejects_wrong_api_version() {
        assert_eq!(
            extract_path_params("/api/v2/workspaces/ws-abc/users/user-xyz"),
            None
        );
    }

    #[test]
    fn rejects_wrong_resource_prefix() {
        assert_eq!(
            extract_path_params("/api/v1/workspace/ws-abc/users/user-xyz"),
            None
        );
    }

    #[test]
    fn rejects_wrong_segment_label() {
        assert_eq!(
            extract_path_params("/api/v1/workspaces/ws-abc/members/user-xyz"),
            None
        );
    }

    #[test]
    fn rejects_list_path_without_user_id() {
        assert_eq!(extract_path_params("/api/v1/workspaces/ws-abc/users"), None);
    }
}
