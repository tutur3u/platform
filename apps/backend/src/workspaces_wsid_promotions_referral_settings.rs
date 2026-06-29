//! Handler for `GET /api/v1/workspaces/:wsId/promotions/referral-settings`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/promotions/referral-settings/route.ts`.
//!
//! Legacy GET behavior:
//!   1. Resolves the workspace via `getPermissions({ wsId, request })` and requires
//!      the `view_inventory` workspace permission. When `getPermissions` returns
//!      null (caller has no resolvable workspace access) or the caller lacks
//!      `view_inventory`, it responds `403` with `{ "message": "Unauthorized" }`.
//!   2. Reads the caller-scoped (RLS-active) `workspace_settings` row for the
//!      workspace with `select('*')` + `eq('ws_id', wsId)` + `.maybeSingle()`.
//!      On a Supabase error it responds `500` with
//!      `{ "message": "Failed to fetch referral settings" }`.
//!   3. On success it responds `200` with `{ "data": <row | null> }` (the bare
//!      row object, or `null` when no settings row exists).
//!
//! This handler owns GET only. The legacy route also exposes PUT (which performs
//! mutations); every non-GET method returns `None` so the worker falls through to
//! the still-live Next.js route.
//!
//! Behavior gaps / notes:
//!   * Authentication, workspace-id normalization, and the `view_inventory`
//!     permission check are delegated to
//!     `workspace_permission_check::authorize_workspace_permission`, mirroring the
//!     legacy `getPermissions` semantics. Every authorization failure
//!     (`Unauthorized` / `Forbidden` / `NotFound`) maps to the legacy `403`
//!     `{ "message": "Unauthorized" }` because legacy `getPermissions` collapses
//!     all of those cases into `!permissions || withoutPermission(...)`.
//!   * An `Internal` authorization error (contact-data not configured or an
//!     upstream Supabase failure during permission resolution) maps to `500`
//!     `{ "message": "Failed to fetch referral settings" }` — the only 500 body
//!     shape the legacy route emits.
//!   * The `workspace_settings` read forwards the caller's Supabase access token
//!     (RLS active), matching the legacy `createClient(request)` client. When no
//!     forwardable caller token can be extracted (rare app-session-only case that
//!     already passed the permission check via a cookie chunk path), it falls back
//!     to a service-role read so the response still reflects the same row.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const REFERRAL_SETTINGS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const REFERRAL_SETTINGS_PATH_SUFFIX: &str = "/promotions/referral-settings";
const VIEW_INVENTORY_PERMISSION: &str = "view_inventory";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FETCH_FAILED_MESSAGE: &str = "Failed to fetch referral settings";

pub(crate) async fn handle_workspaces_wsid_promotions_referral_settings_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = referral_settings_ws_id(request.path)?;

    Some(match request.method {
        "GET" => referral_settings_response(config, request, raw_ws_id, outbound).await,
        // The legacy route still owns PUT (and any other verb); fall through to it.
        _ => return None,
    })
}

async fn referral_settings_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    let authorization = match authorize_workspace_permission(
        contact_data,
        request,
        raw_ws_id,
        VIEW_INVENTORY_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(
            WorkspacePermissionAuthorizationError::Unauthorized
            | WorkspacePermissionAuthorizationError::Forbidden
            | WorkspacePermissionAuthorizationError::NotFound,
        ) => {
            return message_response(403, UNAUTHORIZED_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, FETCH_FAILED_MESSAGE);
        }
    };

    match fetch_referral_settings(contact_data, outbound, &authorization.ws_id, request).await {
        Ok(data) => settings_data_response(data),
        Err(()) => message_response(500, FETCH_FAILED_MESSAGE),
    }
}

async fn fetch_referral_settings(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    request: BackendRequest<'_>,
) -> Result<Option<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_settings",
        &[
            ("select", "*".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let service_role_key = contact_data.service_role_key().ok_or(())?;

    // Mirror the legacy caller-scoped (RLS-active) `createClient(request)` read by
    // forwarding the caller's Supabase access token; fall back to the service-role
    // key when no forwardable caller token is present.
    let bearer_token = supabase_auth::request_access_token(request)
        .unwrap_or_else(|| service_role_key.to_owned());
    let authorization = format!("Bearer {bearer_token}");

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

    // PostgREST returns an array of rows; `maybeSingle()` yields the first row or
    // null. `ws_id` is the workspace_settings primary key, so at most one row
    // matches.
    Ok(response
        .json::<Vec<Value>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

fn settings_data_response(data: Option<Value>) -> BackendResponse {
    no_store_response(json_response(
        200,
        json!({ "data": data.unwrap_or(Value::Null) }),
    ))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn referral_settings_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(REFERRAL_SETTINGS_PATH_PREFIX)?
        .strip_suffix(REFERRAL_SETTINGS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_ws_id_from_matching_path() {
        assert_eq!(
            referral_settings_ws_id(
                "/api/v1/workspaces/11111111-1111-4111-8111-111111111111/promotions/referral-settings"
            ),
            Some("11111111-1111-4111-8111-111111111111")
        );
        assert_eq!(
            referral_settings_ws_id("/api/v1/workspaces/personal/promotions/referral-settings"),
            Some("personal")
        );
    }

    #[test]
    fn rejects_non_matching_paths() {
        // Wrong suffix.
        assert_eq!(
            referral_settings_ws_id("/api/v1/workspaces/ws-1/promotions/count"),
            None
        );
        // Missing `v1` segment.
        assert_eq!(
            referral_settings_ws_id("/api/workspaces/ws-1/promotions/referral-settings"),
            None
        );
        // Empty workspace id.
        assert_eq!(
            referral_settings_ws_id("/api/v1/workspaces//promotions/referral-settings"),
            None
        );
        // Nested segment inside the workspace id slot.
        assert_eq!(
            referral_settings_ws_id(
                "/api/v1/workspaces/ws-1/extra/promotions/referral-settings"
            ),
            None
        );
    }

    #[test]
    fn wraps_present_row_under_data_key() {
        let response = settings_data_response(Some(json!({
            "ws_id": "ws-1",
            "referral_count_cap": 5,
            "referral_reward_type": "BOTH",
        })));

        assert_eq!(response.status, 200);
        assert_eq!(
            response.body,
            json!({
                "data": {
                    "ws_id": "ws-1",
                    "referral_count_cap": 5,
                    "referral_reward_type": "BOTH",
                }
            })
        );
    }

    #[test]
    fn wraps_missing_row_as_null_data() {
        let response = settings_data_response(None);

        assert_eq!(response.status, 200);
        assert_eq!(response.body, json!({ "data": Value::Null }));
    }

    #[test]
    fn message_response_shapes_error_body() {
        let response = message_response(403, UNAUTHORIZED_MESSAGE);
        assert_eq!(response.status, 403);
        assert_eq!(response.body, json!({ "message": "Unauthorized" }));

        let response = message_response(500, FETCH_FAILED_MESSAGE);
        assert_eq!(response.status, 500);
        assert_eq!(
            response.body,
            json!({ "message": "Failed to fetch referral settings" })
        );
    }
}
