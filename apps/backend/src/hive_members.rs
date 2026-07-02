//! Handler for `GET /api/v1/hive/members`.
//!
//! Ports the GET path of the legacy Next.js route at
//! `apps/web/src/app/api/v1/hive/members/route.ts`.
//!
//! Legacy auth model (`requireHiveAdmin` in `apps/web/src/app/api/v1/hive/_shared.ts`):
//!   1. Resolve the caller. A Hive app-session token (`targetApp: 'hive'`) is
//!      accepted; otherwise the Supabase auth user is resolved from the request.
//!      No user -> `401 { "error": "Unauthorized" }`.
//!   2. Resolve Hive access (`resolveWebHiveAccess`): `isMember` (an enabled
//!      `hive_members` row) and `isAdmin` (an enabled `platform_user_roles` row
//!      with `allow_role_management`). A resolution failure ->
//!      `500 { "error": "Failed to resolve Hive access" }`.
//!   3. Neither member nor admin -> `403 { "error": "Hive access required" }`.
//!   4. Member but not admin -> `403 { "error": "Hive admin access required" }`.
//!
//! On success the legacy route lists all `hive_members` ordered by
//! `created_at desc` and returns `{ "members": [...] }`, each mapped via
//! `mapHiveMember` to `{ createdAt, enabled, id, notes, userId }`. A read
//! failure -> `500 { "error": "Failed to list Hive members" }`.
//!
//! This handler reuses the already-migrated `hive_access` auth/access helpers
//! (`authenticated_user`, `resolve_hive_access`) for an exact match of the
//! legacy auth model and status codes.
//!
//! BEHAVIOR GAPS:
//!   * The legacy `listHiveMembers` reads the dedicated Hive Postgres database
//!     (`getHiveSql`), while `hive_members` writes are mirrored into Supabase
//!     via `syncSupabaseHiveMember`. This port reads the Supabase `hive_members`
//!     table with the service-role client (mirroring the sibling `hive_access`
//!     handler). If the two stores diverge, the listed rows may differ from the
//!     legacy source of truth.
//!   * The legacy route sets no explicit `Cache-Control` header. This handler
//!     emits `no-store` on every response, matching the convention used by the
//!     sibling Hive handlers for dynamic, admin-gated reads.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    BackendConfig, BackendRequest, BackendResponse, contact,
    hive_access::{authenticated_user, resolve_hive_access},
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const HIVE_MEMBERS_PATH: &str = "/api/v1/hive/members";
const HIVE_MEMBERS_TABLE: &str = "hive_members";
const HIVE_MEMBERS_SELECT: &str = "id,user_id,enabled,notes,created_at";
const APPLICATION_JSON: &str = "application/json";

/// Legacy `resolveHiveRequestUser` verifies app-session tokens with
/// `targetApp: 'hive'`, so only the `hive` app-session target is accepted.
const HIVE_APP_SESSION_TARGETS: &[&str] = &["hive"];

#[derive(Deserialize)]
struct HiveMemberRow {
    id: String,
    user_id: String,
    enabled: Option<bool>,
    notes: Option<String>,
    created_at: Option<String>,
}

pub(crate) async fn handle_hive_members_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if !hive_members_path_matches(request.path) {
        return None;
    }

    Some(match request.method {
        "GET" => hive_members_response(config, request, outbound).await,
        // Non-GET methods (e.g. POST) fall through to the still-live Next.js route.
        _ => return None,
    })
}

async fn hive_members_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let user = match authenticated_user(config, request, HIVE_APP_SESSION_TARGETS, outbound).await {
        Ok(user) => user,
        Err(()) => return error_response(401, "Unauthorized"),
    };

    let access = match resolve_hive_access(&config.contact_data, &user.id, outbound).await {
        Ok(access) => access,
        Err(()) => return error_response(500, "Failed to resolve Hive access"),
    };

    if !access.has_access() {
        return error_response(403, "Hive access required");
    }

    if !access.is_admin {
        return error_response(403, "Hive admin access required");
    }

    match fetch_hive_members(&config.contact_data, outbound).await {
        Ok(members) => no_store_response(json_response(200, json!({ "members": members }))),
        Err(()) => error_response(500, "Failed to list Hive members"),
    }
}

async fn fetch_hive_members(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<Value>, ()> {
    // The legacy route reads with an admin client, so RLS is bypassed; mirror
    // the `order by created_at desc` ordering of `listHiveMembers`.
    let Some(url) = contact_data.rest_url(
        HIVE_MEMBERS_TABLE,
        &[
            ("select", HIVE_MEMBERS_SELECT.to_owned()),
            ("order", "created_at.desc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");

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

    let rows = response.json::<Vec<HiveMemberRow>>().map_err(|_| ())?;
    Ok(rows.iter().map(map_hive_member).collect())
}

/// Mirrors `mapHiveMember` from the legacy `_shared.ts`.
fn map_hive_member(row: &HiveMemberRow) -> Value {
    json!({
        "createdAt": row.created_at,
        "enabled": row.enabled,
        "id": row.id,
        "notes": row.notes,
        "userId": row.user_id,
    })
}

fn hive_members_path_matches(path: &str) -> bool {
    path == HIVE_MEMBERS_PATH
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_matches_exact_route_only() {
        assert!(hive_members_path_matches("/api/v1/hive/members"));
        assert!(!hive_members_path_matches("/api/v1/hive/members/"));
        assert!(!hive_members_path_matches("/api/v1/hive/members/123"));
        assert!(!hive_members_path_matches("/api/hive/members"));
        assert!(!hive_members_path_matches("/api/v1/hive"));
        assert!(!hive_members_path_matches(""));
    }

    #[test]
    fn map_hive_member_matches_legacy_shape() {
        let row = HiveMemberRow {
            id: "member-1".to_owned(),
            user_id: "user-1".to_owned(),
            enabled: Some(true),
            notes: Some("vip".to_owned()),
            created_at: Some("2026-06-29T00:00:00Z".to_owned()),
        };

        let mapped = map_hive_member(&row);

        assert_eq!(mapped["id"], json!("member-1"));
        assert_eq!(mapped["userId"], json!("user-1"));
        assert_eq!(mapped["enabled"], json!(true));
        assert_eq!(mapped["notes"], json!("vip"));
        assert_eq!(mapped["createdAt"], json!("2026-06-29T00:00:00Z"));
        // Only the five legacy keys are present.
        assert_eq!(mapped.as_object().map(|o| o.len()), Some(5));
    }

    #[test]
    fn map_hive_member_preserves_null_notes() {
        let row = HiveMemberRow {
            id: "member-2".to_owned(),
            user_id: "user-2".to_owned(),
            enabled: Some(false),
            notes: None,
            created_at: None,
        };

        let mapped = map_hive_member(&row);

        assert_eq!(mapped["notes"], Value::Null);
        assert_eq!(mapped["createdAt"], Value::Null);
        assert_eq!(mapped["enabled"], json!(false));
    }
}
