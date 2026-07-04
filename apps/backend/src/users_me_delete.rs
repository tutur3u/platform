//! Handler for `GET /api/v1/users/me/delete`.
//!
//! Ports the legacy Next.js pre-check route at
//! `apps/web/src/app/api/v1/users/me/delete/route.ts` (GET handler only).
//!
//! Auth: `withSessionAuth` — Supabase session (Bearer token or auth cookie).
//! No workspace permission required; the caller must only be authenticated.
//!
//! The handler calls the `get_user_workspace_subscription_info` RPC with the
//! service-role key, categorizes the rows into blocking / singleMemberFree /
//! multiMember buckets, and returns:
//!
//! ```text
//! 200 {
//!   "canDelete": bool,
//!   "blockingWorkspaces": [{ "wsId", "wsName", "tier", "memberCount" }],
//!   "cleanupSummary": { "workspacesToDelete": N, "seatsToRevoke": N }
//! }
//! ```
//!
//! On any upstream error the handler responds with:
//!
//! ```text
//! 500 { "message": "Failed to check subscription status" }
//! ```
//!
//! # Behavior gaps
//!
//! - The `POST` handler (account deletion with Polar subscription cleanup) is
//!   **not** ported here; this module returns `None` for all non-GET methods so
//!   the still-live Next.js route continues to serve POST.
//! - `withSessionAuth` cross-cutting controls (IP blocks, rate limiting,
//!   suspension checks) are not reproduced.

use serde::Deserialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const USERS_ME_DELETE_PATH: &str = "/api/v1/users/me/delete";
const RPC_NAME: &str = "get_user_workspace_subscription_info";

pub(crate) async fn handle_users_me_delete_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    if request.path != USERS_ME_DELETE_PATH {
        return None;
    }
    Some(match request.method {
        "GET" => delete_precheck_response(config, request, outbound).await,
        _ => return None,
    })
}

async fn delete_precheck_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !config.contact_data.configured() {
        return error_response();
    }

    let Some(token) = supabase_auth::request_access_token(request) else {
        return unauthorized_response();
    };

    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &token, outbound).await
    else {
        return unauthorized_response();
    };

    let Some(user_id) = user.id.filter(|id| !id.trim().is_empty()) else {
        return unauthorized_response();
    };

    let Some(srk) = config.contact_data.service_role_key() else {
        return error_response();
    };

    let rows = match fetch_workspace_subscription_info(
        &config.contact_data,
        outbound,
        srk,
        &user_id,
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return error_response(),
    };

    let categorized = categorize_rows(rows);
    let can_delete = categorized.blocking.is_empty();

    let blocking_workspaces: Vec<_> = categorized
        .blocking
        .iter()
        .map(|ws| {
            json!({
                "wsId":        ws.ws_id,
                "wsName":      ws.ws_name,
                "tier":        ws.tier,
                "memberCount": ws.member_count,
            })
        })
        .collect();

    no_store_response(json_response(
        200,
        json!({
            "canDelete": can_delete,
            "blockingWorkspaces": blocking_workspaces,
            "cleanupSummary": {
                "workspacesToDelete": categorized.single_member_free.len(),
                "seatsToRevoke":      categorized.multi_member.len(),
            },
        }),
    ))
}

// ---------------------------------------------------------------------------
// Supabase RPC
// ---------------------------------------------------------------------------

/// Raw row returned by `get_user_workspace_subscription_info`.
#[derive(Deserialize)]
struct SubscriptionInfoRow {
    ws_id: Option<String>,
    ws_name: Option<String>,
    ws_personal: Option<bool>,
    subscription_tier: Option<String>,
    member_count: Option<serde_json::Value>,
    polar_subscription_id: Option<String>,
    pricing_model: Option<String>,
}

/// Processed workspace info (mirrors `WorkspaceSubscriptionInfo` in legacy).
#[allow(dead_code)]
struct WorkspaceInfo {
    ws_id: String,
    ws_name: String,
    ws_personal: bool,
    tier: String,
    member_count: i64,
    #[allow(dead_code)]
    polar_subscription_id: Option<String>,
    #[allow(dead_code)]
    pricing_model: Option<String>,
}

struct CategorizedWorkspaces {
    blocking: Vec<WorkspaceInfo>,
    single_member_free: Vec<WorkspaceInfo>,
    multi_member: Vec<WorkspaceInfo>,
}

async fn fetch_workspace_subscription_info(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    srk: &str,
    user_id: &str,
) -> Result<Vec<SubscriptionInfoRow>, ()> {
    let url = contact_data.rpc_url(RPC_NAME).ok_or(())?;
    let body = json!({ "_user_id": user_id }).to_string();
    let bearer = format!("Bearer {srk}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", srk)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<SubscriptionInfoRow>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/// Mirrors the legacy `getUserWorkspaceSubscriptionInfo` categorization logic.
fn categorize_rows(rows: Vec<SubscriptionInfoRow>) -> CategorizedWorkspaces {
    let mut result = CategorizedWorkspaces {
        blocking: Vec::new(),
        single_member_free: Vec::new(),
        multi_member: Vec::new(),
    };

    for row in rows {
        let member_count = numeric_member_count(&row.member_count);
        let is_sole_member = member_count <= 1;
        let tier = row.subscription_tier.as_deref().unwrap_or("FREE");
        let has_paid_subscription = !tier.is_empty() && tier != "FREE";
        let ws_personal = row.ws_personal.unwrap_or(false);

        let info = WorkspaceInfo {
            ws_id: row.ws_id.unwrap_or_default(),
            ws_name: row
                .ws_name
                .unwrap_or_else(|| "Unnamed Workspace".to_owned()),
            ws_personal,
            tier: tier.to_owned(),
            member_count,
            polar_subscription_id: row.polar_subscription_id,
            pricing_model: row.pricing_model,
        };

        if is_sole_member && has_paid_subscription {
            // Personal workspaces are auto-cleaned, don't block deletion.
            if ws_personal {
                result.single_member_free.push(info);
            } else {
                result.blocking.push(info);
            }
        } else if is_sole_member {
            result.single_member_free.push(info);
        } else {
            result.multi_member.push(info);
        }
    }

    result
}

/// Converts the `member_count` JSON value to `i64`.
///
/// Supabase may return numeric aggregates as either a JSON number or a quoted
/// string depending on the PostgreSQL aggregate type, so we try both.
fn numeric_member_count(value: &Option<serde_json::Value>) -> i64 {
    match value.as_ref() {
        Some(serde_json::Value::Number(n)) => n.as_i64().unwrap_or(0),
        Some(serde_json::Value::String(s)) => s.parse::<i64>().unwrap_or(0),
        _ => 0,
    }
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

fn error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": "Failed to check subscription status" }),
    ))
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(401, json!({ "message": "Unauthorized" })))
}

// ---------------------------------------------------------------------------
// Tests (pure / sync helpers only)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn make_row(
        ws_id: &str,
        ws_name: &str,
        ws_personal: bool,
        tier: Option<&str>,
        member_count: i64,
    ) -> SubscriptionInfoRow {
        SubscriptionInfoRow {
            ws_id: Some(ws_id.to_owned()),
            ws_name: Some(ws_name.to_owned()),
            ws_personal: Some(ws_personal),
            subscription_tier: tier.map(str::to_owned),
            member_count: Some(Value::Number(member_count.into())),
            polar_subscription_id: None,
            pricing_model: None,
        }
    }

    #[test]
    fn path_guard_matches_exact_path() {
        assert_eq!(USERS_ME_DELETE_PATH, "/api/v1/users/me/delete");
        assert_ne!("/api/users/me/delete", USERS_ME_DELETE_PATH);
        assert_ne!("/api/v1/users/me/delete/extra", USERS_ME_DELETE_PATH);
    }

    #[test]
    fn numeric_member_count_parses_number_and_string() {
        assert_eq!(numeric_member_count(&Some(Value::Number(3_i64.into()))), 3);
        assert_eq!(
            numeric_member_count(&Some(Value::String("5".to_owned()))),
            5
        );
        assert_eq!(numeric_member_count(&None), 0);
        assert_eq!(
            numeric_member_count(&Some(Value::String("bad".to_owned()))),
            0
        );
    }

    #[test]
    fn sole_member_paid_non_personal_is_blocking() {
        let row = make_row("ws-1", "Paid Workspace", false, Some("PRO"), 1);
        let cat = categorize_rows(vec![row]);
        assert_eq!(cat.blocking.len(), 1);
        assert_eq!(cat.single_member_free.len(), 0);
        assert_eq!(cat.multi_member.len(), 0);
        assert_eq!(cat.blocking[0].ws_id, "ws-1");
    }

    #[test]
    fn sole_member_paid_personal_is_single_member_free() {
        let row = make_row("ws-p", "My Space", true, Some("PRO"), 1);
        let cat = categorize_rows(vec![row]);
        assert_eq!(cat.blocking.len(), 0);
        assert_eq!(cat.single_member_free.len(), 1);
    }

    #[test]
    fn sole_member_free_is_single_member_free() {
        let row = make_row("ws-2", "Free Workspace", false, Some("FREE"), 1);
        let cat = categorize_rows(vec![row]);
        assert_eq!(cat.single_member_free.len(), 1);
        assert_eq!(cat.blocking.len(), 0);
    }

    #[test]
    fn sole_member_no_tier_is_single_member_free() {
        let row = make_row("ws-3", "No Tier", false, None, 1);
        let cat = categorize_rows(vec![row]);
        assert_eq!(cat.single_member_free.len(), 1);
    }

    #[test]
    fn multi_member_workspace_goes_to_multi_member() {
        let row = make_row("ws-4", "Team WS", false, Some("PRO"), 5);
        let cat = categorize_rows(vec![row]);
        assert_eq!(cat.multi_member.len(), 1);
        assert_eq!(cat.blocking.len(), 0);
    }

    #[test]
    fn can_delete_only_when_no_blocking_workspaces() {
        let blocking = make_row("ws-b", "Blocking", false, Some("PRO"), 1);
        let free = make_row("ws-f", "Free", false, None, 1);
        let cat = categorize_rows(vec![blocking, free]);
        assert!(!cat.blocking.is_empty());

        let cat2 = categorize_rows(vec![make_row("ws-f", "Free", false, None, 1)]);
        assert!(cat2.blocking.is_empty());
    }

    #[test]
    fn missing_ws_name_defaults_to_unnamed_workspace() {
        let row = SubscriptionInfoRow {
            ws_id: Some("ws-x".to_owned()),
            ws_name: None,
            ws_personal: Some(false),
            subscription_tier: None,
            member_count: Some(Value::Number(1_i64.into())),
            polar_subscription_id: None,
            pricing_model: None,
        };
        let cat = categorize_rows(vec![row]);
        assert_eq!(cat.single_member_free[0].ws_name, "Unnamed Workspace");
    }
}
