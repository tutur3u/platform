//! Handler for `GET /api/v1/hive/access-requests/me`.
//!
//! Ports the GET path of the legacy Next.js route at
//! `apps/web/src/app/api/v1/hive/access-requests/me/route.ts`.
//!
//! Legacy auth model (`resolveHiveRequestUser` in
//! `apps/web/src/app/api/v1/hive/_shared.ts`):
//!
//!   1. A Hive app-session token (`targetApp: 'hive'`) is accepted; otherwise
//!      the Supabase auth user is resolved from the Bearer token.
//!   2. No resolved user -> `401 { "error": "Unauthorized" }`.
//!
//! Unlike other Hive handlers, the GET handler does NOT call
//! `requireHiveAccess`/`requireHiveAdmin`; any authenticated user may query
//! their own access state.
//!
//! Response shape (200):
//!
//! ```json
//! {
//!   "hasAccess": bool,
//!   "member": MappedHiveMember | null,
//!   "request": MappedHiveAccessRequest | null,
//!   "status": "approved" | <access-request-status> | "none"
//! }
//! ```
//!
//! where `hasAccess = member.enabled == true` and
//! `status = if hasAccess { "approved" } else { request.status ?? "none" }`.
//!
//! BEHAVIOR GAPS:
//!
//!   * The legacy `getHiveMemberByUserId` and `getHiveAccessRequestByUserId`
//!     read the dedicated Hive Postgres database (`HIVE_DATABASE_URL`), not
//!     Supabase. This port reads both tables through the Supabase REST API with
//!     the service-role key (no RLS), matching the convention used by all other
//!     migrated Hive handlers. If the two stores diverge, results may differ from
//!     the legacy source of truth.
//!   * The legacy route sets no explicit `Cache-Control` header on the response.
//!     This handler emits `no-store` on every response, consistent with the Hive
//!     handler convention for dynamic, user-scoped reads.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    hive_access::authenticated_user,
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const HIVE_ACCESS_REQUESTS_ME_PATH: &str = "/api/v1/hive/access-requests/me";
const HIVE_MEMBERS_TABLE: &str = "hive_members";
const HIVE_ACCESS_REQUESTS_TABLE: &str = "hive_access_requests";
const HIVE_MEMBERS_SELECT: &str = "id,user_id,enabled,notes,created_at";
const HIVE_ACCESS_REQUESTS_SELECT: &str = "id,user_id,email,note,status,requested_at,resolved_at,resolved_by,resolution_note,created_at,updated_at";

/// Only `hive` app-session tokens are accepted, matching `resolveHiveRequestUser`
/// which calls `verifyAppSessionToken` with `targetApp: 'hive'`.
const HIVE_APP_SESSION_TARGETS: &[&str] = &["hive"];

#[derive(Deserialize)]
struct HiveMemberRow {
    id: String,
    user_id: String,
    enabled: Option<bool>,
    notes: Option<String>,
    created_at: Option<String>,
}

#[derive(Deserialize)]
struct HiveAccessRequestRow {
    id: String,
    user_id: String,
    email: Option<String>,
    note: Option<String>,
    status: Option<String>,
    requested_at: Option<String>,
    resolved_at: Option<String>,
    resolved_by: Option<String>,
    resolution_note: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

pub(crate) async fn handle_hive_access_requests_me_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    if !path_matches(request.path) {
        return None;
    }

    Some(match request.method {
        "GET" => get_response(config, request, outbound).await,
        _ => return None,
    })
}

async fn get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let user = match authenticated_user(config, request, HIVE_APP_SESSION_TARGETS, outbound).await {
        Ok(user) => user,
        Err(()) => return error_response(401, "Unauthorized"),
    };

    let member_result = fetch_member_by_user_id(&config.contact_data, &user.id, outbound).await;
    let access_request_result =
        fetch_access_request_by_user_id(&config.contact_data, &user.id, outbound).await;

    let member = match member_result {
        Ok(m) => m,
        Err(()) => return error_response(500, "Failed to fetch Hive member"),
    };

    let access_request = match access_request_result {
        Ok(r) => r,
        Err(()) => return error_response(500, "Failed to fetch Hive access request"),
    };

    let has_access = member.as_ref().and_then(|m| m.enabled).unwrap_or(false);

    let status: Value = if has_access {
        json!("approved")
    } else {
        match &access_request {
            Some(r) => match &r.status {
                Some(s) => json!(s),
                None => json!("none"),
            },
            None => json!("none"),
        }
    };

    let mapped_member: Value = match &member {
        Some(m) => map_hive_member(m),
        None => Value::Null,
    };

    let mapped_request: Value = match &access_request {
        Some(r) => map_hive_access_request(r),
        None => Value::Null,
    };

    no_store_response(json_response(
        200,
        json!({
            "hasAccess": has_access,
            "member": mapped_member,
            "request": mapped_request,
            "status": status,
        }),
    ))
}

/// Fetch the caller's `hive_members` row (at most one, unique on `user_id`).
async fn fetch_member_by_user_id(
    contact_data: &contact::ContactDataConfig,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<HiveMemberRow>, ()> {
    let Some(url) = contact_data.rest_url(
        HIVE_MEMBERS_TABLE,
        &[
            ("select", HIVE_MEMBERS_SELECT.to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
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
    Ok(rows.into_iter().next())
}

/// Fetch the caller's `hive_access_requests` row (at most one, unique on `user_id`).
async fn fetch_access_request_by_user_id(
    contact_data: &contact::ContactDataConfig,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<HiveAccessRequestRow>, ()> {
    let Some(url) = contact_data.rest_url(
        HIVE_ACCESS_REQUESTS_TABLE,
        &[
            ("select", HIVE_ACCESS_REQUESTS_SELECT.to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
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

    let rows = response
        .json::<Vec<HiveAccessRequestRow>>()
        .map_err(|_| ())?;
    Ok(rows.into_iter().next())
}

/// Mirrors `mapHiveMember` from `apps/web/src/app/api/v1/hive/_shared.ts`.
fn map_hive_member(row: &HiveMemberRow) -> Value {
    json!({
        "createdAt": row.created_at,
        "enabled": row.enabled,
        "id": row.id,
        "notes": row.notes,
        "userId": row.user_id,
    })
}

/// Mirrors `mapHiveAccessRequest` from `apps/web/src/app/api/v1/hive/_shared.ts`.
fn map_hive_access_request(row: &HiveAccessRequestRow) -> Value {
    json!({
        "createdAt": row.created_at,
        "email": row.email,
        "id": row.id,
        "note": row.note,
        "requestedAt": row.requested_at,
        "resolutionNote": row.resolution_note,
        "resolvedAt": row.resolved_at,
        "resolvedBy": row.resolved_by,
        "status": row.status,
        "updatedAt": row.updated_at,
        "userId": row.user_id,
    })
}

fn path_matches(path: &str) -> bool {
    path == HIVE_ACCESS_REQUESTS_ME_PATH
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_matches_exact_route_only() {
        assert!(path_matches("/api/v1/hive/access-requests/me"));
        assert!(!path_matches("/api/v1/hive/access-requests/me/"));
        assert!(!path_matches("/api/v1/hive/access-requests"));
        assert!(!path_matches("/api/v1/hive/access-requests/other"));
        assert!(!path_matches("/api/hive/access-requests/me"));
        assert!(!path_matches(""));
    }

    #[test]
    fn map_hive_member_matches_legacy_shape() {
        let row = HiveMemberRow {
            id: "mbr-1".to_owned(),
            user_id: "usr-1".to_owned(),
            enabled: Some(true),
            notes: Some("early adopter".to_owned()),
            created_at: Some("2026-06-29T00:00:00Z".to_owned()),
        };
        let mapped = map_hive_member(&row);
        assert_eq!(mapped["id"], json!("mbr-1"));
        assert_eq!(mapped["userId"], json!("usr-1"));
        assert_eq!(mapped["enabled"], json!(true));
        assert_eq!(mapped["notes"], json!("early adopter"));
        assert_eq!(mapped["createdAt"], json!("2026-06-29T00:00:00Z"));
        assert_eq!(mapped.as_object().map(|o| o.len()), Some(5));
    }

    #[test]
    fn map_hive_member_null_fields() {
        let row = HiveMemberRow {
            id: "mbr-2".to_owned(),
            user_id: "usr-2".to_owned(),
            enabled: None,
            notes: None,
            created_at: None,
        };
        let mapped = map_hive_member(&row);
        assert_eq!(mapped["enabled"], Value::Null);
        assert_eq!(mapped["notes"], Value::Null);
        assert_eq!(mapped["createdAt"], Value::Null);
    }

    #[test]
    fn map_hive_access_request_matches_legacy_shape() {
        let row = HiveAccessRequestRow {
            id: "req-1".to_owned(),
            user_id: "usr-1".to_owned(),
            email: Some("user@example.com".to_owned()),
            note: Some("please let me in".to_owned()),
            status: Some("pending".to_owned()),
            requested_at: Some("2026-06-28T10:00:00Z".to_owned()),
            resolved_at: None,
            resolved_by: None,
            resolution_note: None,
            created_at: Some("2026-06-28T10:00:00Z".to_owned()),
            updated_at: Some("2026-06-28T10:00:00Z".to_owned()),
        };
        let mapped = map_hive_access_request(&row);
        assert_eq!(mapped["id"], json!("req-1"));
        assert_eq!(mapped["userId"], json!("usr-1"));
        assert_eq!(mapped["email"], json!("user@example.com"));
        assert_eq!(mapped["note"], json!("please let me in"));
        assert_eq!(mapped["status"], json!("pending"));
        assert_eq!(mapped["requestedAt"], json!("2026-06-28T10:00:00Z"));
        assert_eq!(mapped["resolvedAt"], Value::Null);
        assert_eq!(mapped["resolvedBy"], Value::Null);
        assert_eq!(mapped["resolutionNote"], Value::Null);
        assert_eq!(mapped.as_object().map(|o| o.len()), Some(11));
    }

    #[test]
    #[allow(clippy::unnecessary_literal_unwrap)]
    fn has_access_logic_approved_when_enabled() {
        // Simulate: member.enabled = true => hasAccess and status = "approved"
        let enabled = Some(true);
        let has_access = enabled.unwrap_or(false);
        let status: Value = if has_access {
            json!("approved")
        } else {
            json!("none")
        };
        assert!(has_access);
        assert_eq!(status, json!("approved"));
    }

    #[test]
    #[allow(clippy::unnecessary_literal_unwrap)]
    fn has_access_logic_none_when_no_request() {
        // Simulate: no member, no request => hasAccess=false, status="none"
        let enabled: Option<bool> = None;
        let has_access = enabled.unwrap_or(false);
        let request_status: Option<&str> = None;
        let status: Value = if has_access {
            json!("approved")
        } else {
            match request_status {
                Some(s) => json!(s),
                None => json!("none"),
            }
        };
        assert!(!has_access);
        assert_eq!(status, json!("none"));
    }

    #[test]
    #[allow(clippy::unnecessary_literal_unwrap)]
    fn has_access_logic_pending_when_request_exists() {
        // Simulate: no member, pending request => hasAccess=false, status="pending"
        let enabled: Option<bool> = None;
        let has_access = enabled.unwrap_or(false);
        let request_status: Option<&str> = Some("pending");
        let status: Value = if has_access {
            json!("approved")
        } else {
            match request_status {
                Some(s) => json!(s),
                None => json!("none"),
            }
        };
        assert!(!has_access);
        assert_eq!(status, json!("pending"));
    }
}
