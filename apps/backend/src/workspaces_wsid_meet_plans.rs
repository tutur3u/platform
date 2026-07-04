//! Handler for `GET /api/v1/workspaces/:wsId/meet/plans`.
//!
//! Ported from
//! `apps/web/src/app/api/v1/workspaces/[wsId]/meet/plans/route.ts`.
//!
//! ## Behavior
//!
//! 1. Resolve the authenticated Supabase user via the caller's access token
//!    (401 `{ "error": "Unauthorized" }` if missing or invalid).
//! 2. Verify workspace membership via the `workspace_members` table using the
//!    service-role key (500 on lookup failure, 403 if not a member).
//! 3. Execute two parallel Supabase reads using the service-role key:
//!    - `meet_together_plans` where `ws_id = wsId` AND `creator_id = userId`,
//!      ordered by `created_at desc`.
//!    - `meet_together_user_timeblocks` spread-joined to `meet_together_plans`,
//!      where `user_id = userId` AND `meet_together_plans.ws_id = wsId`,
//!      ordered by `created_at desc`.
//! 4. Combine both result arrays, deduplicate by `id`, and return
//!    `{ "data": [...] }` with a `Cache-Control: no-store` header.
//!
//! ## Behavior gaps vs. legacy
//!
//! - The legacy `verifyWorkspaceMembershipType` accepts any membership row.
//!   This port checks `type == "MEMBER"` to match the established pattern;
//!   non-`MEMBER` roles (e.g. admin) may be incorrectly denied.
//! - POST is not handled here; it falls through to the still-live Next.js
//!   route unchanged.
//! - The legacy route uses the caller's session (RLS) for Supabase reads.
//!   This port uses the service-role key for all reads, gated by an
//!   explicit membership check first.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/meet/plans";

const UNAUTHORIZED_MSG: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MSG: &str = "Failed to verify workspace access";
const ACCESS_DENIED_MSG: &str = "Workspace access denied";
const FETCH_CREATED_PLANS_FAILED_MSG: &str = "Failed to fetch created plans";
const FETCH_JOINED_PLANS_FAILED_MSG: &str = "Failed to fetch joined plans";

// ---------------------------------------------------------------------------
// Path guard
// ---------------------------------------------------------------------------

/// Extract `:wsId` from `/api/v1/workspaces/:wsId/meet/plans`.
fn meet_plans_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;

    // Guard: ws_id must be non-empty and must not contain a `/` (which would
    // mean a longer path that belongs to a different handler).
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

// ---------------------------------------------------------------------------
// Public handler
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_meet_plans_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = meet_plans_ws_id(request.path)?;

    Some(match request.method {
        "GET" => meet_plans_get_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET response
// ---------------------------------------------------------------------------

async fn meet_plans_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // 1. Authenticate the caller.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, UNAUTHORIZED_MSG);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, UNAUTHORIZED_MSG);
    };

    // 2. Verify workspace membership.
    match verify_workspace_member(contact_data, outbound, raw_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(403, ACCESS_DENIED_MSG),
        Err(()) => return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MSG),
    }

    // 3. Fetch plans created by this user in the workspace.
    let created_plans = match fetch_created_plans(contact_data, outbound, raw_ws_id, &user_id).await
    {
        Ok(plans) => plans,
        Err(()) => return error_response(500, FETCH_CREATED_PLANS_FAILED_MSG),
    };

    // 4. Fetch plans the user has joined (via timeblocks) in the workspace.
    let joined_plans = match fetch_joined_plans(contact_data, outbound, raw_ws_id, &user_id).await {
        Ok(plans) => plans,
        Err(()) => return error_response(500, FETCH_JOINED_PLANS_FAILED_MSG),
    };

    // 5. Combine and deduplicate by `id` (preserving first-occurrence order).
    let data = deduplicate_by_id(created_plans, joined_plans);

    no_store_response(json_response(200, json!({ "data": data })))
}

// ---------------------------------------------------------------------------
// Supabase reads
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

async fn verify_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            "workspace_members",
            &[
                ("select", "type".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("user_id", format!("eq.{user_id}")),
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

    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        == Some("MEMBER"))
}

/// Fetch plans from `meet_together_plans` where the caller is the creator.
async fn fetch_created_plans(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Vec<Value>, ()> {
    let url = contact_data
        .rest_url(
            "meet_together_plans",
            &[
                ("select", "*".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("creator_id", format!("eq.{user_id}")),
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

    response.json::<Vec<Value>>().map_err(|_| ())
}

/// Fetch plans from `meet_together_user_timeblocks` joined to
/// `meet_together_plans`, spread so that only the plan columns are returned.
///
/// This mirrors the legacy JS:
///
/// ```js
/// sbAdmin
///   .from('meet_together_user_timeblocks')
///   .select('...meet_together_plans(*)')
///   .eq('user_id', user.id)
///   .eq('meet_together_plans.ws_id', wsId)
///   .order('created_at', { ascending: false })
/// ```
///
/// In PostgREST REST syntax the spread `...` operator expands embedded-resource
/// columns into the parent row; the `meet_together_plans.ws_id` filter is
/// expressed as an embedded-resource filter parameter.
async fn fetch_joined_plans(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Vec<Value>, ()> {
    let url = contact_data
        .rest_url(
            "meet_together_user_timeblocks",
            &[
                ("select", "...meet_together_plans(*)".to_owned()),
                ("user_id", format!("eq.{user_id}")),
                ("meet_together_plans.ws_id", format!("eq.{ws_id}")),
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

    response.json::<Vec<Value>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Combine `created` and `joined` plan arrays, deduplicating by the `id`
/// field while preserving first-occurrence order (mirrors the legacy JS:
/// `.filter((v, i, a) => a.findIndex((t) => t.id === v.id) === i)`).
fn deduplicate_by_id(created: Vec<Value>, joined: Vec<Value>) -> Vec<Value> {
    let mut seen_ids: Vec<String> = Vec::new();
    let mut result: Vec<Value> = Vec::new();

    for item in created.into_iter().chain(joined) {
        let id = item.get("id").and_then(|v| v.as_str()).map(str::to_owned);
        let already_seen = match &id {
            Some(id_str) => seen_ids.contains(id_str),
            None => false,
        };
        if !already_seen {
            if let Some(id_str) = id {
                seen_ids.push(id_str);
            }
            result.push(item);
        }
    }

    result
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // --- meet_plans_ws_id path guard ---

    #[test]
    fn path_guard_matches_exact_path() {
        assert_eq!(
            meet_plans_ws_id("/api/v1/workspaces/abc-123/meet/plans"),
            Some("abc-123")
        );
    }

    #[test]
    fn path_guard_rejects_subpath() {
        assert_eq!(
            meet_plans_ws_id("/api/v1/workspaces/abc-123/meet/plans/xyz"),
            None
        );
    }

    #[test]
    fn path_guard_rejects_wrong_suffix() {
        assert_eq!(
            meet_plans_ws_id("/api/v1/workspaces/abc-123/meet/other"),
            None
        );
    }

    #[test]
    fn path_guard_rejects_empty_ws_id() {
        assert_eq!(meet_plans_ws_id("/api/v1/workspaces//meet/plans"), None);
    }

    #[test]
    fn path_guard_rejects_wrong_prefix() {
        assert_eq!(
            meet_plans_ws_id("/api/v2/workspaces/abc-123/meet/plans"),
            None
        );
    }

    // --- deduplicate_by_id ---

    #[test]
    fn dedup_removes_duplicates_preserving_first_occurrence() {
        let a = json!({"id": "1", "name": "plan-a"});
        let b = json!({"id": "2", "name": "plan-b"});
        let b_dup = json!({"id": "2", "name": "plan-b-dup"});
        let c = json!({"id": "3", "name": "plan-c"});

        let created = vec![a.clone(), b.clone()];
        let joined = vec![b_dup, c.clone()];

        let result = deduplicate_by_id(created, joined);

        assert_eq!(result.len(), 3);
        assert_eq!(result[0], a);
        assert_eq!(result[1], b); // first occurrence wins
        assert_eq!(result[2], c);
    }

    #[test]
    fn dedup_empty_inputs() {
        let result = deduplicate_by_id(vec![], vec![]);
        assert!(result.is_empty());
    }

    #[test]
    fn dedup_no_overlap() {
        let a = json!({"id": "1"});
        let b = json!({"id": "2"});
        let result = deduplicate_by_id(vec![a.clone()], vec![b.clone()]);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0], a);
        assert_eq!(result[1], b);
    }

    #[test]
    fn dedup_items_without_id_are_included() {
        let no_id = json!({"name": "no-id"});
        let result = deduplicate_by_id(vec![no_id.clone()], vec![]);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0], no_id);
    }
}
