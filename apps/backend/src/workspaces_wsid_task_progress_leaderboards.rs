//! Handler for `GET /api/v1/workspaces/:wsId/task-progress/leaderboards`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/task-progress/leaderboards/route.ts`.
//!
//! GET only; `POST` (create leaderboard) returns `None` so the worker falls
//! through to the still-live Next.js route.
//!
//! Auth: Supabase session (bearer token or cookie) → user-id → workspace
//! membership check (`type = 'MEMBER'` only, matching the legacy
//! `verifyWorkspaceMembershipType` default). Membership is verified via the
//! service-role client rather than the caller's RLS client (same result for a
//! workspace member).
//!
//! BEHAVIOR GAPS vs legacy:
//!
//!   * Workspace-id normalization is omitted: the raw path segment is used as
//!     the UUID directly; `personal`/`internal`/handle resolution is not
//!     implemented.
//!   * Leaderboard hydration (`hydrateLeaderboards`) — which attaches active
//!     `members`, `teams`, ranked `rankings`, and `teamTotals` computed from
//!     `task_progress_entries` — is not ported due to the 400-LOC budget. Each
//!     returned leaderboard object omits those four fields. Callers that need
//!     rankings should continue to rely on the legacy Next.js route.
//!   * Schema-unavailability detection checks PostgREST error codes
//!     (`42P01`, `42703`, `PGRST204`, `PGRST205`) and keyword heuristics.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/task-progress/leaderboards";

const LEADERBOARD_SELECT: &str = concat!(
    "id,ws_id,metric_id,name,description,period_start,period_end,",
    "join_code,status,starred,visibility,created_by,created_at,",
    "updated_at,archived_at,metric:task_progress_metrics(*)"
);

const SCHEMA_UNAVAILABLE_MESSAGE: &str =
    "Task progress is not available until the latest database migration is applied.";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_ERROR_MESSAGE: &str = "Failed to verify workspace membership";
const WORKSPACE_DENIED_MESSAGE: &str = "Workspace access denied";
const FETCH_ERROR_MESSAGE: &str = "Failed to list task leaderboards";

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

// --- Public handler ---

pub(crate) async fn handle_workspaces_wsid_task_progress_leaderboards_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = leaderboards_ws_id(request.path)?;
    Some(match request.method {
        "GET" => leaderboards_get(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

// --- GET ---

async fn leaderboards_get(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Step 1: resolve Supabase access token.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return err_response(401, UNAUTHORIZED_MESSAGE);
    };

    // Step 2: verify session user.
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|u| u.id.filter(|id| !id.trim().is_empty()))
    else {
        return err_response(401, UNAUTHORIZED_MESSAGE);
    };

    // Step 3: workspace membership check (MEMBER type only, mirrors legacy default).
    match verify_membership(contact_data, outbound, raw_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return err_response(403, WORKSPACE_DENIED_MESSAGE),
        Err(()) => return err_response(500, MEMBERSHIP_ERROR_MESSAGE),
    }

    // Step 4: optional ?status filter.
    let status_filter = request
        .url
        .and_then(|u| url::Url::parse(u).ok())
        .and_then(|parsed| {
            parsed
                .query_pairs()
                .find(|(k, _)| k == "status")
                .map(|(_, v)| v.into_owned())
        });

    // Step 5: fetch leaderboards.
    match fetch_leaderboards(contact_data, outbound, raw_ws_id, status_filter.as_deref()).await {
        Ok(leaderboards) => no_store_response(json_response(
            200,
            json!({ "ok": true, "schemaAvailable": true, "leaderboards": leaderboards }),
        )),
        Err(true) => no_store_response(json_response(
            200,
            json!({
                "ok": false,
                "code": "schema_unavailable",
                "schemaAvailable": false,
                "message": SCHEMA_UNAVAILABLE_MESSAGE,
                "leaderboards": [],
            }),
        )),
        Err(false) => err_response(500, FETCH_ERROR_MESSAGE),
    }
}

// --- Leaderboard query ---

/// Fetches `task_leaderboards` with service-role auth.
///
/// Returns `Err(true)` when the PostgREST error indicates the task-progress
/// schema is not yet applied, `Err(false)` for other upstream failures.
async fn fetch_leaderboards(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    status: Option<&str>,
) -> Result<Vec<Value>, bool> {
    let mut params = vec![
        ("select", LEADERBOARD_SELECT.to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("archived_at", "is.null".to_owned()),
        ("order", "starred.desc,period_start.desc".to_owned()),
    ];
    if let Some(s) = status {
        params.push(("status", format!("eq.{s}")));
    }

    let url = contact_data
        .rest_url("task_leaderboards", &params)
        .ok_or(false)?;
    let service_role_key = contact_data.service_role_key().ok_or(false)?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| false)?;

    if !(200..300).contains(&response.status) {
        return Err(is_schema_unavailable_error(&response));
    }

    response.json::<Vec<Value>>().map_err(|_| false)
}

/// Detects PostgREST schema-unavailability errors matching the legacy
/// `isTaskProgressSchemaUnavailableError` heuristic.
fn is_schema_unavailable_error(response: &OutboundResponse) -> bool {
    let body = response.json::<Value>().unwrap_or(Value::Null);
    let code = body.get("code").and_then(Value::as_str).unwrap_or("");
    if matches!(code, "42P01" | "42703" | "PGRST204" | "PGRST205") {
        return true;
    }
    let combined = format!(
        "{} {}",
        body.get("message").and_then(Value::as_str).unwrap_or(""),
        body.get("details").and_then(Value::as_str).unwrap_or(""),
    )
    .to_lowercase();
    let mentions = combined.contains("task_progress_") || combined.contains("task_leaderboard");
    let looks_missing = combined.contains("schema cache")
        || combined.contains("could not find")
        || combined.contains("does not exist")
        || combined.contains("column")
        || combined.contains("relation");
    mentions && looks_missing
}

// --- Workspace membership check ---

/// Verifies the caller is a `MEMBER`-type member of the workspace.
///
/// Uses the service-role client (RLS bypassed), matching the effective result
/// of the legacy `verifyWorkspaceMembershipType` call.
async fn verify_membership(
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

    // `verifyWorkspaceMembershipType` default `requiredType = 'MEMBER'`:
    // only an exact `type === 'MEMBER'` row grants access; OWNER/ADMIN are denied.
    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|r| r.membership_type.as_deref())
        == Some("MEMBER"))
}

// --- Path extraction and response builders ---

fn leaderboards_ws_id(path: &str) -> Option<&str> {
    let inner = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!inner.is_empty() && !inner.contains('/')).then_some(inner)
}

fn err_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// --- Tests ---

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_ws_id() {
        assert_eq!(
            leaderboards_ws_id("/api/v1/workspaces/abc-123/task-progress/leaderboards"),
            Some("abc-123")
        );
        // UUID-shaped segment.
        assert_eq!(
            leaderboards_ws_id(
                "/api/v1/workspaces/00000000-0000-0000-0000-000000000001/task-progress/leaderboards"
            ),
            Some("00000000-0000-0000-0000-000000000001")
        );
    }

    #[test]
    fn rejects_non_matching_paths() {
        // Extra trailing segment.
        assert_eq!(
            leaderboards_ws_id("/api/v1/workspaces/abc/task-progress/leaderboards/extra"),
            None
        );
        // Empty ws_id.
        assert_eq!(
            leaderboards_ws_id("/api/v1/workspaces//task-progress/leaderboards"),
            None
        );
        // Missing /v1/.
        assert_eq!(
            leaderboards_ws_id("/api/workspaces/abc/task-progress/leaderboards"),
            None
        );
        // Nested ws_id with extra slash.
        assert_eq!(
            leaderboards_ws_id("/api/v1/workspaces/a/b/task-progress/leaderboards"),
            None
        );
    }

    #[test]
    fn err_response_has_correct_shape() {
        let r = err_response(401, UNAUTHORIZED_MESSAGE);
        assert_eq!(r.status, 401);
        assert_eq!(r.body, json!({ "error": UNAUTHORIZED_MESSAGE }));
    }
}
