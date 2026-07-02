//! Handler for `GET /api/v1/workspaces/:wsId/consolidate-users`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/consolidate-users/route.ts`.
//!
//! Legacy GET behavior:
//!
//!   1. `resolveAuthenticatedSessionUser` authenticates the caller. A missing
//!      or invalid session returns `401 { "error": "Unauthorized" }`.
//!   2. `verifyWorkspaceMembershipType` verifies the caller is a workspace
//!      member (any membership type). A non-member or membership-lookup
//!      failure returns `403 { "error": "Not a workspace member" }` or
//!      `500 { "error": "Failed to verify workspace membership" }`.
//!   3. Two COUNT queries fetch the total rows in `workspace_members` and
//!      `workspace_user_linked_users` (both scoped to the resolved workspace
//!      id), using the caller's session Supabase client (RLS active).
//!   4. Success: `200 { "missingCount": N, "totalMembers": N, "linkedCount": N }`.
//!   5. Any unexpected error: `500 { "error": "Internal server error" }`.
//!
//! POST is NOT ported (it performs a mutation RPC). This handler returns
//! `None` for every non-GET method so the Cloudflare Worker falls through to
//! the still-active Next.js route.
//!
//! BEHAVIOR GAPS:
//!
//! - Auth gate: The legacy route accepts any workspace member regardless of
//!   permissions. This handler delegates to
//!   `authorize_workspace_permission(… "manage_workspace_members" …)`. Members
//!   with no role assignments and no default permissions (and who are not the
//!   workspace creator) will receive a `403` where the legacy would return
//!   `200`.
//! - Data reads: The legacy uses the caller's session Supabase client (RLS
//!   active) for both COUNT queries. This handler uses the service-role key
//!   (bypasses RLS). For standard workspace RLS policies the counts are
//!   identical; workspaces with restrictive custom RLS may observe different
//!   numbers.

use serde::Deserialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/consolidate-users";

/// Permission checked for the GET handler.
///
/// NOTE: The legacy route requires only basic workspace membership, not this
/// specific permission. See BEHAVIOR GAPS in the module-level doc comment.
const CHECK_PERMISSION: &str = "manage_workspace_members";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const NOT_MEMBER_MESSAGE: &str = "Not a workspace member";
const INTERNAL_ERROR_MESSAGE: &str = "Internal server error";

#[derive(Deserialize)]
struct CountRow {
    count: Option<i64>,
}

pub(crate) async fn handle_workspaces_wsid_consolidate_users_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = consolidate_users_ws_id(request.path)?;

    Some(match request.method {
        "GET" => consolidate_users_get(config, request, raw_ws_id, outbound).await,
        // POST and all other methods fall through to the still-live Next.js
        // route so mutations continue to work.
        _ => return None,
    })
}

async fn consolidate_users_get(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let authorization = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        CHECK_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(auth) => auth,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return error_response(401, UNAUTHORIZED_MESSAGE);
        }
        Err(
            WorkspacePermissionAuthorizationError::NotFound
            | WorkspacePermissionAuthorizationError::Forbidden,
        ) => {
            return error_response(403, NOT_MEMBER_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return error_response(500, INTERNAL_ERROR_MESSAGE);
        }
    };

    match fetch_counts(&config.contact_data, outbound, &authorization.ws_id).await {
        Ok((total_members, linked_count)) => {
            let missing_count = total_members - linked_count;
            no_store_response(json_response(
                200,
                json!({
                    "missingCount": missing_count,
                    "totalMembers": total_members,
                    "linkedCount": linked_count,
                }),
            ))
        }
        Err(()) => error_response(500, INTERNAL_ERROR_MESSAGE),
    }
}

/// Fetches `(total_members, linked_count)` from Supabase using the
/// service-role key so both tables are queried with the same credentials.
async fn fetch_counts(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<(i64, i64), ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let total_members = fetch_table_count(
        contact_data,
        outbound,
        "workspace_members",
        ws_id,
        service_role_key,
        &bearer,
    )
    .await?;

    let linked_count = fetch_table_count(
        contact_data,
        outbound,
        "workspace_user_linked_users",
        ws_id,
        service_role_key,
        &bearer,
    )
    .await?;

    Ok((total_members, linked_count))
}

/// Issues a `count()` aggregate query against `table` filtered by `ws_id`.
async fn fetch_table_count(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    ws_id: &str,
    service_role_key: &str,
    bearer: &str,
) -> Result<i64, ()> {
    let url = contact_data
        .rest_url(
            table,
            &[
                ("select", "count()".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
            ],
        )
        .ok_or(())?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // PostgREST serializes `count()` as `[{ "count": N }]`.
    Ok(response
        .json::<Vec<CountRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.count)
        .unwrap_or(0))
}

/// Extracts the raw `wsId` segment from the request path, or returns `None`
/// if the path does not match
/// `/api/v1/workspaces/<wsId>/consolidate-users`.
fn consolidate_users_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── path guard ──────────────────────────────────────────────────────────

    #[test]
    fn ws_id_matches_uuid_segment() {
        assert_eq!(
            consolidate_users_ws_id(
                "/api/v1/workspaces/11111111-1111-4111-8111-111111111111/consolidate-users"
            ),
            Some("11111111-1111-4111-8111-111111111111")
        );
    }

    #[test]
    fn ws_id_matches_personal_slug() {
        assert_eq!(
            consolidate_users_ws_id("/api/v1/workspaces/personal/consolidate-users"),
            Some("personal")
        );
    }

    #[test]
    fn ws_id_rejects_extra_suffix_segment() {
        assert_eq!(
            consolidate_users_ws_id("/api/v1/workspaces/ws-1/consolidate-users/extra"),
            None
        );
    }

    #[test]
    fn ws_id_rejects_wrong_suffix() {
        assert_eq!(
            consolidate_users_ws_id("/api/v1/workspaces/ws-1/consolidate-users-other"),
            None
        );
    }

    #[test]
    fn ws_id_rejects_missing_v1_version() {
        assert_eq!(
            consolidate_users_ws_id("/api/workspaces/ws-1/consolidate-users"),
            None
        );
    }

    #[test]
    fn ws_id_rejects_empty_segment() {
        assert_eq!(
            consolidate_users_ws_id("/api/v1/workspaces//consolidate-users"),
            None
        );
    }

    #[test]
    fn ws_id_rejects_nested_slash_in_segment() {
        assert_eq!(
            consolidate_users_ws_id("/api/v1/workspaces/a/b/consolidate-users"),
            None
        );
    }

    #[test]
    fn ws_id_rejects_unrelated_path() {
        assert_eq!(consolidate_users_ws_id("/api/health"), None);
    }

    // ── error_response shape ────────────────────────────────────────────────

    #[test]
    fn error_response_401_uses_error_key() {
        let resp = error_response(401, UNAUTHORIZED_MESSAGE);
        assert_eq!(resp.status, 401);
        assert_eq!(resp.body, json!({ "error": "Unauthorized" }));
    }

    #[test]
    fn error_response_403_uses_error_key() {
        let resp = error_response(403, NOT_MEMBER_MESSAGE);
        assert_eq!(resp.status, 403);
        assert_eq!(resp.body, json!({ "error": "Not a workspace member" }));
    }

    #[test]
    fn error_response_500_uses_error_key() {
        let resp = error_response(500, INTERNAL_ERROR_MESSAGE);
        assert_eq!(resp.status, 500);
        assert_eq!(resp.body, json!({ "error": "Internal server error" }));
    }
}
