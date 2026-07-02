//! Handler for `GET /api/invite/:code`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/invite/[code]/route.ts` (GET only).
//!
//! The GET handler does **not** require caller authentication; it uses the
//! service-role (admin) client for all reads so that unauthenticated visitors
//! can preview workspace information before deciding to accept an invite.
//!
//! ## Behavior gaps vs. legacy
//!
//! The following two legacy behaviors are **not** reproduced here because they
//! depend on external billing services or server-side signed-URL generation
//! that the Rust worker cannot access:
//!
//! - **Seat-limit enforcement** (`enforceSeatLimit`): The legacy route queries
//!   `workspace_subscriptions` and the private `workspace_subscription_products`
//!   schema to decide whether the workspace has available seats. This handler
//!   always returns `seatLimitReached: false` and `seatStatus: null`. The Next.js
//!   POST handler still enforces seat limits on join, so clients that rely on
//!   this field for a gate will still be blocked at join time.
//!
//! - **Workspace branding signed URLs** (`resolveWorkspaceBrandingUrlsForNext`):
//!   The legacy route resolves signed storage URLs for `avatar_url` and
//!   `logo_url`. This handler returns the raw database values unchanged.
//!
//! All other status codes and JSON shapes match the legacy route exactly.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const INVITE_CODE_PATH_PREFIX: &str = "/api/invite/";

// ── path guard ────────────────────────────────────────────────────────────────

fn extract_invite_code(path: &str) -> Option<&str> {
    let code = path.strip_prefix(INVITE_CODE_PATH_PREFIX)?;
    (!code.is_empty() && !code.contains('/')).then_some(code)
}

// ── entry point ───────────────────────────────────────────────────────────────

pub(crate) async fn handle_invite_code_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let code = extract_invite_code(request.path)?;

    Some(match request.method {
        "GET" => get_invite_code_response(config, request, code, outbound).await,
        _ => return None,
    })
}

// ── GET ───────────────────────────────────────────────────────────────────────

async fn get_invite_code_response(
    config: &BackendConfig,
    _request: BackendRequest<'_>,
    code: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return error_response("INTERNAL_ERROR");
    }

    // 1. Fetch invite link with embedded workspace.
    let invite = match fetch_invite_link(contact_data, outbound, code).await {
        Ok(Some(row)) => row,
        Ok(None) => {
            return no_store_response(json_response(
                404,
                json!({ "errorCode": "INVITE_INVALID_OR_EXPIRED" }),
            ));
        }
        Err(()) => return error_response("INTERNAL_ERROR"),
    };

    // 2. Check expiry / fullness.
    if invite.is_expired == Some(true) {
        return no_store_response(json_response(410, json!({ "errorCode": "INVITE_EXPIRED" })));
    }
    if invite.is_full == Some(true) {
        return no_store_response(json_response(
            410,
            json!({ "errorCode": "INVITE_MAX_USES_REACHED" }),
        ));
    }

    let ws_id = match invite.ws_id.as_deref().filter(|s| !s.is_empty()) {
        Some(id) => id.to_owned(),
        None => {
            return no_store_response(json_response(
                500,
                json!({ "errorCode": "INVITE_INVALID_WORKSPACE" }),
            ));
        }
    };

    // 3. Block invites to personal workspaces.
    match fetch_workspace_personal(contact_data, outbound, &ws_id).await {
        Ok(true) => {
            return no_store_response(json_response(
                403,
                json!({ "errorCode": "INVITE_PERSONAL_WORKSPACE" }),
            ));
        }
        Ok(false) => {}
        Err(()) => return error_response("INTERNAL_ERROR"),
    }

    // 4. Member count.
    let member_count = fetch_member_count(contact_data, outbound, &ws_id)
        .await
        .unwrap_or(0);

    // 5. Determine memberType from stats row.
    let member_type = member_type_from_invite_row(&invite);

    // 6. Build workspace payload (branding URLs returned as-is; see gaps above).
    let workspace_payload = build_workspace_payload(&invite.workspaces);

    no_store_response(json_response(
        200,
        json!({
            "workspace": workspace_payload,
            "memberCount": member_count,
            "seatLimitReached": false,
            "seatStatus": null,
            "memberType": member_type,
        }),
    ))
}

// ── data structs ──────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct InviteLinkRow {
    ws_id: Option<String>,
    is_expired: Option<bool>,
    is_full: Option<bool>,
    member_type: Option<String>,
    #[serde(rename = "type")]
    invite_type: Option<String>,
    /// Embedded workspace object from PostgREST join.
    workspaces: Option<Value>,
}

#[derive(Deserialize)]
struct WorkspacePersonalRow {
    personal: Option<bool>,
}

#[derive(Deserialize)]
struct MemberCountRow {
    count: Option<i64>,
}

// ── fetch helpers ─────────────────────────────────────────────────────────────

async fn fetch_invite_link(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    code: &str,
) -> Result<Option<InviteLinkRow>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_invite_links_with_stats",
            &[
                (
                    "select",
                    "*,workspaces:ws_id(id,name,avatar_url,logo_url)".to_owned(),
                ),
                ("code", format!("eq.{code}")),
                ("limit", "1".to_owned()),
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

    let rows = response.json::<Vec<InviteLinkRow>>().map_err(|_| ())?;
    Ok(rows.into_iter().next())
}

async fn fetch_workspace_personal(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            "workspaces",
            &[
                ("select", "personal".to_owned()),
                ("id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
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

    let rows = response
        .json::<Vec<WorkspacePersonalRow>>()
        .map_err(|_| ())?;

    Ok(rows
        .into_iter()
        .next()
        .and_then(|row| row.personal)
        .unwrap_or(false))
}

async fn fetch_member_count(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<i64, ()> {
    let url = contact_data
        .rest_url(
            "workspace_members",
            &[
                ("select", "count()".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
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

    Ok(response
        .json::<Vec<MemberCountRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.count)
        .unwrap_or(0))
}

// ── pure helpers ──────────────────────────────────────────────────────────────

/// Mirror `memberTypeFromInviteStatsRow`: prefer `member_type`, fall back to
/// `type`; uppercase; default to `"MEMBER"` when absent or empty.
fn member_type_from_invite_row(row: &InviteLinkRow) -> String {
    let raw = row
        .member_type
        .as_deref()
        .or(row.invite_type.as_deref())
        .unwrap_or("");

    let upper = raw.trim().to_uppercase();
    if upper.is_empty() {
        "MEMBER".to_owned()
    } else {
        upper
    }
}

/// Extract the embedded workspace object from the invite row.  PostgREST
/// returns the join result either as a JSON object or as a one-element JSON
/// array when the FK is not unique-constrained on the join side.  Both shapes
/// are normalised to `Value::Object` (or `Value::Null`).
fn build_workspace_payload(workspaces: &Option<Value>) -> Value {
    match workspaces {
        None => Value::Null,
        Some(Value::Array(arr)) => arr.first().cloned().unwrap_or(Value::Null),
        Some(other) => other.clone(),
    }
}

fn error_response(error_code: &str) -> BackendResponse {
    no_store_response(json_response(500, json!({ "errorCode": error_code })))
}

// ── tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // --- extract_invite_code ---

    #[test]
    fn path_guard_matches_valid_code() {
        assert_eq!(extract_invite_code("/api/invite/abc123"), Some("abc123"));
    }

    #[test]
    fn path_guard_matches_uuid_code() {
        assert_eq!(
            extract_invite_code("/api/invite/550e8400-e29b-41d4-a716-446655440000"),
            Some("550e8400-e29b-41d4-a716-446655440000")
        );
    }

    #[test]
    fn path_guard_rejects_no_prefix() {
        assert!(extract_invite_code("/api/join/abc123").is_none());
    }

    #[test]
    fn path_guard_rejects_empty_code() {
        assert!(extract_invite_code("/api/invite/").is_none());
    }

    #[test]
    fn path_guard_rejects_nested_path() {
        assert!(extract_invite_code("/api/invite/abc/extra").is_none());
    }

    // --- member_type_from_invite_row ---

    fn make_row(member_type: Option<&str>, invite_type: Option<&str>) -> InviteLinkRow {
        InviteLinkRow {
            ws_id: None,
            is_expired: None,
            is_full: None,
            member_type: member_type.map(str::to_owned),
            invite_type: invite_type.map(str::to_owned),
            workspaces: None,
        }
    }

    #[test]
    fn member_type_defaults_to_member() {
        let row = make_row(None, None);
        assert_eq!(member_type_from_invite_row(&row), "MEMBER");
    }

    #[test]
    fn member_type_uses_member_type_field() {
        let row = make_row(Some("GUEST"), None);
        assert_eq!(member_type_from_invite_row(&row), "GUEST");
    }

    #[test]
    fn member_type_falls_back_to_type_field() {
        let row = make_row(None, Some("guest"));
        assert_eq!(member_type_from_invite_row(&row), "GUEST");
    }

    #[test]
    fn member_type_prefers_member_type_over_type() {
        let row = make_row(Some("MEMBER"), Some("GUEST"));
        assert_eq!(member_type_from_invite_row(&row), "MEMBER");
    }

    // --- build_workspace_payload ---

    #[test]
    fn workspace_payload_null_when_absent() {
        assert_eq!(build_workspace_payload(&None), Value::Null);
    }

    #[test]
    fn workspace_payload_object_passthrough() {
        let obj = json!({ "id": "ws-1", "name": "Test" });
        assert_eq!(build_workspace_payload(&Some(obj.clone())), obj);
    }

    #[test]
    fn workspace_payload_unwraps_array() {
        let obj = json!({ "id": "ws-1", "name": "Test" });
        let arr = Value::Array(vec![obj.clone()]);
        assert_eq!(build_workspace_payload(&Some(arr)), obj);
    }

    #[test]
    fn workspace_payload_empty_array_yields_null() {
        let arr = Value::Array(vec![]);
        assert_eq!(build_workspace_payload(&Some(arr)), Value::Null);
    }
}
