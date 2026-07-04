//! Handler for `GET /api/v1/workspaces/:wsId/users/fields`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/users/fields/route.ts`
//! (GET only; the legacy POST insert path falls through to the still-live
//! Next.js route by returning `None` for every non-GET method).
//!
//! Legacy GET behavior:
//!
//! - Resolves the caller's Supabase session and verifies workspace membership.
//! - Requires EITHER the `view_users_private_info` OR the
//!   `view_users_public_info` workspace permission; returns `403 Forbidden`
//!   when both are absent.
//! - Reads every row in `workspace_user_fields` for the resolved workspace
//!   with the admin (service-role) client, ordered by `created_at DESC`.
//! - On read failure responds `500` with
//!   `{ "message": "Error fetching workspace API configs" }`.
//! - On success responds `200` with the raw row array.
//!
//! Auth fidelity / gaps:
//!
//! - The OR permission check is implemented by calling
//!   `authorize_workspace_permission` for `view_users_private_info` first; if
//!   that returns `Forbidden`, the call is retried with `view_users_public_info`.
//!   This means two auth round-trips in the "lacks private but has public" case
//!   — an acceptable trade-off given no single-call OR API exists in the crate.
//! - Legacy performs `normalizeWorkspaceId` (resolves `personal`, handles, etc.)
//!   inside `authorize_workspace_permission`, which is reproduced faithfully.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/users/fields";
const FIELDS_TABLE: &str = "workspace_user_fields";
const PERMISSION_PRIVATE: &str = "view_users_private_info";
const PERMISSION_PUBLIC: &str = "view_users_public_info";
const ERROR_MESSAGE: &str = "Error fetching workspace API configs";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";

pub(crate) async fn handle_workspaces_wsid_users_fields_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = fields_ws_id(request.path)?;

    Some(match request.method {
        "GET" => fields_get_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn fields_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Try view_users_private_info first; on Forbidden fall through to
    // view_users_public_info (legacy OR check).
    let authorization = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        PERMISSION_PRIVATE,
        outbound,
    )
    .await
    {
        Ok(auth) => auth,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return message_response(401, UNAUTHORIZED_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::NotFound) => {
            return message_response(401, UNAUTHORIZED_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return error_response();
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            // Retry with the public permission before giving up.
            match authorize_workspace_permission(
                &config.contact_data,
                request,
                raw_ws_id,
                PERMISSION_PUBLIC,
                outbound,
            )
            .await
            {
                Ok(auth) => auth,
                Err(WorkspacePermissionAuthorizationError::Forbidden) => {
                    return message_response(403, FORBIDDEN_MESSAGE);
                }
                Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
                    return message_response(401, UNAUTHORIZED_MESSAGE);
                }
                Err(WorkspacePermissionAuthorizationError::NotFound) => {
                    return message_response(401, UNAUTHORIZED_MESSAGE);
                }
                Err(WorkspacePermissionAuthorizationError::Internal) => {
                    return error_response();
                }
            }
        }
    };

    match fetch_user_fields(&config.contact_data, outbound, &authorization.ws_id).await {
        Ok(rows) => no_store_response(json_response(200, rows)),
        Err(()) => error_response(),
    }
}

async fn fetch_user_fields(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Value, ()> {
    // The legacy route uses the admin (service-role) client, so RLS is bypassed
    // and the read is scoped purely by the ws_id filter.
    let url = contact_data
        .rest_url(
            FIELDS_TABLE,
            &[
                ("select", "*".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("order", "created_at.desc".to_owned()),
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

fn fields_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response() -> BackendResponse {
    message_response(500, ERROR_MESSAGE)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_ws_id_from_exact_path() {
        assert_eq!(
            fields_ws_id("/api/v1/workspaces/ws-123/users/fields"),
            Some("ws-123")
        );
    }

    #[test]
    fn extracts_uuid_ws_id() {
        assert_eq!(
            fields_ws_id("/api/v1/workspaces/11111111-1111-4111-8111-111111111111/users/fields"),
            Some("11111111-1111-4111-8111-111111111111")
        );
    }

    #[test]
    fn rejects_wrong_prefix() {
        assert_eq!(fields_ws_id("/api/workspaces/ws-123/users/fields"), None);
        assert_eq!(fields_ws_id("/workspaces/ws-123/users/fields"), None);
    }

    #[test]
    fn rejects_wrong_suffix() {
        assert_eq!(
            fields_ws_id("/api/v1/workspaces/ws-123/users/fields/extra"),
            None
        );
        assert_eq!(fields_ws_id("/api/v1/workspaces/ws-123/users"), None);
        assert_eq!(fields_ws_id("/api/v1/workspaces/ws-123"), None);
    }

    #[test]
    fn rejects_empty_ws_id() {
        assert_eq!(fields_ws_id("/api/v1/workspaces//users/fields"), None);
    }

    #[test]
    fn rejects_nested_ws_id_segments() {
        assert_eq!(fields_ws_id("/api/v1/workspaces/ws/sub/users/fields"), None);
    }

    #[test]
    fn error_response_matches_legacy_shape() {
        let response = error_response();
        assert_eq!(response.status, 500);
        assert_eq!(response.body, json!({ "message": ERROR_MESSAGE }));
    }

    #[test]
    fn message_response_matches_legacy_forbidden_shape() {
        let response = message_response(403, FORBIDDEN_MESSAGE);
        assert_eq!(response.status, 403);
        assert_eq!(response.body, json!({ "message": "Forbidden" }));
    }

    #[test]
    fn message_response_matches_legacy_unauthorized_shape() {
        let response = message_response(401, UNAUTHORIZED_MESSAGE);
        assert_eq!(response.status, 401);
        assert_eq!(response.body, json!({ "message": "Unauthorized" }));
    }
}
