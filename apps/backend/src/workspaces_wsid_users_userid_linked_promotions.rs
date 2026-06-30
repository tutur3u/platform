//! Handler for `GET /api/v1/workspaces/:wsId/users/:userId/linked-promotions`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/users/[userId]/linked-promotions/route.ts`.
//!
//! Legacy GET behavior:
//!   1. Authenticates via `getFinanceRouteContext` + `resolveFinanceRouteAuthContext`,
//!      accepting a finance/platform app-session token, a CLI access token, or a
//!      regular Supabase session. Normalises `:wsId` to a UUID.
//!   2. **No explicit permission check** for GET — any authenticated workspace member
//!      may call this endpoint.
//!   3. Reads `private.user_linked_promotions` filtered by `user_id = :userId`,
//!      selecting `promo_id`.
//!   4. Deduplicates the promo IDs. If none, returns `[]`.
//!   5. Reads `private.workspace_promotions` filtered by `ws_id = normalizedWsId`
//!      and `id IN (promo_ids)`, selecting
//!      `id,name,description,code,value,use_ratio,promo_type,max_uses,current_uses,ws_id`.
//!   6. Returns a JSON array of `{ promo_id, workspace_promotions }` objects for
//!      links whose promotion exists in the workspace; unmatched links are filtered out.
//!
//! Behavior gaps vs. legacy:
//!   * The legacy GET has **no** workspace-permission gate beyond authentication and
//!     membership. This port delegates to `finance_auth::authorize_finance_permission`
//!     with `"view_promotions"`, which is more restrictive: callers must hold that
//!     explicit permission. Accept this gap or replace with a membership-only check if
//!     unrestricted member access is required.
//!   * Only GET is migrated. POST and DELETE return `None` so the worker falls through
//!     to the still-active Next.js route; we never emit 405.
//!   * Both tables live in the `private` Postgres schema. Reads use the service-role
//!     key with `Accept-Profile: private` and `Content-Profile: private` headers.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorizationError, authorize_finance_permission},
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    path_segments,
};

const VIEW_PROMOTIONS_PERMISSION: &str = "view_promotions";
const PRIVATE_SCHEMA: &str = "private";
const FETCH_ERROR_MESSAGE: &str = "Error fetching linked promotions";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const PROMOTIONS_SELECT: &str =
    "id,name,description,code,value,use_ratio,promo_type,max_uses,current_uses,ws_id";

#[derive(Deserialize)]
struct LinkedPromotionRow {
    promo_id: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_users_userid_linked_promotions_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, user_id) = linked_promotions_path_ids(request.path)?;

    Some(match request.method {
        "GET" => linked_promotions_response(config, request, raw_ws_id, user_id, outbound).await,
        _ => return None,
    })
}

async fn linked_promotions_response(
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
        VIEW_PROMOTIONS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(FinanceAuthorizationError::Unauthorized | FinanceAuthorizationError::NotFound) => {
            return message_response(401, UNAUTHORIZED_MESSAGE);
        }
        Err(FinanceAuthorizationError::Forbidden) => {
            return message_response(403, UNAUTHORIZED_MESSAGE);
        }
        Err(FinanceAuthorizationError::Internal) => {
            return message_response(500, FETCH_ERROR_MESSAGE);
        }
    };

    // Fetch all link rows for this user from private.user_linked_promotions.
    let links = match fetch_user_linked_promotions(&config.contact_data, outbound, user_id).await {
        Ok(links) => links,
        Err(()) => return message_response(500, FETCH_ERROR_MESSAGE),
    };

    // Deduplicate promo IDs — mirrors `new Set((links ?? []).map(l => l.promo_id))`.
    let mut seen = std::collections::HashSet::new();
    let promo_ids: Vec<String> = links
        .iter()
        .filter_map(|row| row.promo_id.clone())
        .filter(|id| seen.insert(id.clone()))
        .collect();

    if promo_ids.is_empty() {
        return no_store_response(json_response(200, Value::Array(vec![])));
    }

    // Fetch the matching promotions from private.workspace_promotions.
    let promotions = match fetch_workspace_promotions(
        &config.contact_data,
        outbound,
        &authorization.ws_id,
        &promo_ids,
    )
    .await
    {
        Ok(promotions) => promotions,
        Err(()) => return message_response(500, FETCH_ERROR_MESSAGE),
    };

    // Build a promo_id -> promotion map to join the two result sets.
    let promotions_by_id: std::collections::HashMap<String, Value> = promotions
        .into_iter()
        .filter_map(|p| {
            let id = p.get("id")?.as_str()?.to_owned();
            Some((id, p))
        })
        .collect();

    // Build the response — filter out links with no matching workspace promotion,
    // mirroring `.filter((link) => link.workspace_promotions)`.
    let result: Vec<Value> = links
        .into_iter()
        .filter_map(|row| {
            let promo_id = row.promo_id?;
            let workspace_promo = promotions_by_id.get(&promo_id)?;
            Some(json!({
                "promo_id": promo_id,
                "workspace_promotions": workspace_promo,
            }))
        })
        .collect();

    no_store_response(json_response(200, Value::Array(result)))
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async fn fetch_user_linked_promotions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Vec<LinkedPromotionRow>, ()> {
    let url = contact_data
        .rest_url(
            "user_linked_promotions",
            &[
                ("select", "promo_id".to_owned()),
                ("user_id", format!("eq.{user_id}")),
            ],
        )
        .ok_or(())?;

    let response = send_private_schema_get(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<LinkedPromotionRow>>().map_err(|_| ())
}

async fn fetch_workspace_promotions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    promo_ids: &[String],
) -> Result<Vec<Value>, ()> {
    let promo_ids_param = format!("in.({})", promo_ids.join(","));
    let url = contact_data
        .rest_url(
            "workspace_promotions",
            &[
                ("select", PROMOTIONS_SELECT.to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("id", promo_ids_param),
            ],
        )
        .ok_or(())?;

    let response = send_private_schema_get(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

async fn send_private_schema_get(
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
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Path parsing
// ---------------------------------------------------------------------------

fn linked_promotions_path_ids(path: &str) -> Option<(&str, &str)> {
    let segments = path_segments(path);
    match segments.as_slice() {
        [
            "api",
            "v1",
            "workspaces",
            ws_id,
            "users",
            user_id,
            "linked-promotions",
        ] if !ws_id.is_empty() && !user_id.is_empty() => Some((ws_id, user_id)),
        _ => None,
    }
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_extracts_ws_id_and_user_id() {
        assert_eq!(
            linked_promotions_path_ids(
                "/api/v1/workspaces/ws-123/users/user-456/linked-promotions"
            ),
            Some(("ws-123", "user-456"))
        );
        // Trailing slash is stripped by path_segments.
        assert_eq!(
            linked_promotions_path_ids(
                "/api/v1/workspaces/ws-123/users/user-456/linked-promotions/"
            ),
            Some(("ws-123", "user-456"))
        );
    }

    #[test]
    fn path_rejects_missing_or_empty_segments() {
        // Empty ws_id.
        assert_eq!(
            linked_promotions_path_ids("/api/v1/workspaces//users/user-456/linked-promotions"),
            None
        );
        // Empty user_id.
        assert_eq!(
            linked_promotions_path_ids("/api/v1/workspaces/ws-123/users//linked-promotions"),
            None
        );
        // Extra trailing segment.
        assert_eq!(
            linked_promotions_path_ids(
                "/api/v1/workspaces/ws-123/users/user-456/linked-promotions/extra"
            ),
            None
        );
        // Wrong prefix (no v1).
        assert_eq!(
            linked_promotions_path_ids("/api/workspaces/ws-123/users/user-456/linked-promotions"),
            None
        );
        // Wrong suffix.
        assert_eq!(
            linked_promotions_path_ids("/api/v1/workspaces/ws-123/users/user-456/promotions"),
            None
        );
        // Too short.
        assert_eq!(
            linked_promotions_path_ids("/api/v1/workspaces/ws-123/promotions"),
            None
        );
        assert_eq!(linked_promotions_path_ids("/"), None);
    }

    #[test]
    fn path_accepts_uuid_style_ids() {
        let ws = "00000000-0000-0000-0000-000000000001";
        let uid = "00000000-0000-0000-0000-000000000002";
        let path = format!("/api/v1/workspaces/{ws}/users/{uid}/linked-promotions");
        assert_eq!(linked_promotions_path_ids(&path), Some((ws, uid)));
    }
}
