//! Handler for `GET /api/v1/workspaces/:wsId/task-drafts/:draftId`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/task-drafts/[draftId]/route.ts`.
//!
//! Auth model (legacy GET, via `verifyAccess`): resolve the authenticated
//! Supabase session user (`resolveAuthenticatedSessionUser`), then require
//! workspace membership via `verifyWorkspaceMembershipType` (which defaults
//! `requiredType` to `MEMBER`). Finally read the single `task_drafts` row
//! scoped by `id = draftId`, `ws_id = wsId`, and `creator_id = user.id`.
//!
//! The legacy route does NOT normalize the `wsId` slug (no `personal`/handle
//! resolution): it passes the raw path `wsId` directly to both the membership
//! lookup and the data query, so this port also uses the raw `wsId` verbatim.
//!
//! The membership lookup uses the caller's RLS-bound client in the legacy
//! route; this port forwards the caller's access token. The draft read uses the
//! admin (service-role) client in the legacy route; this port uses the
//! service-role key, so RLS is bypassed and the read is scoped purely by the
//! `id` + `ws_id` + `creator_id` filters. The legacy `.single()` requires
//! exactly one matching row, so this port treats any other row count as a
//! "Draft not found" result.
//!
//! Legacy status codes preserved:
//!   * missing/invalid session user           -> `401 { "error": "Unauthorized" }`
//!   * membership lookup transport/query error -> `500 { "error": "Failed to verify workspace membership" }`
//!   * not a `MEMBER` of the workspace         -> `403 { "error": "Forbidden" }`
//!   * draft query failure / not exactly one   -> `404 { "error": "Draft not found" }`
//!   * unconfigured Supabase clients           -> `500 { "error": "Internal server error" }`
//!   * success                                 -> `200 { "data": {...} }`
//!
//! PUT and DELETE are left to the still-live Next.js route (this handler returns
//! `None` for every non-GET method). No behavior gaps for the GET path.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_MIDDLE_SEGMENT: &str = "task-drafts";

#[derive(Clone, Copy)]
enum MembershipError {
    LookupFailed,
    Forbidden,
}

#[derive(Deserialize)]
struct MembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_task_drafts_draftid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, draft_id) = task_draft_ids(request.path)?;

    Some(match request.method {
        "GET" => task_draft_response(config, raw_ws_id, draft_id, request, outbound).await,
        _ => return None,
    })
}

/// Parse `/api/v1/workspaces/<wsId>/task-drafts/<draftId>`, returning
/// `(wsId, draftId)`. Returns `None` for any other path so unrelated handlers
/// and the still-live Next.js route continue to run.
fn task_draft_ids(path: &str) -> Option<(&str, &str)> {
    let remainder = path.strip_prefix(PATH_PREFIX)?;
    let mut segments = remainder.split('/');

    let ws_id = segments.next()?;
    let middle = segments.next()?;
    let draft_id = segments.next()?;

    if segments.next().is_some() {
        // Extra trailing segments -> not this route.
        return None;
    }

    if ws_id.is_empty() || middle != PATH_MIDDLE_SEGMENT || draft_id.is_empty() {
        return None;
    }

    Some((ws_id, draft_id))
}

async fn task_draft_response(
    config: &BackendConfig,
    raw_ws_id: &str,
    draft_id: &str,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        // The legacy route would fail in the same internal-error class when the
        // Supabase clients cannot be constructed.
        return error_response(500, "Internal server error");
    }

    let (user_id, access_token) = match authenticate(contact_data, request, outbound).await {
        Ok(values) => values,
        Err(()) => return error_response(401, "Unauthorized"),
    };

    match verify_membership(contact_data, outbound, raw_ws_id, &user_id, &access_token).await {
        Ok(()) => {}
        Err(MembershipError::LookupFailed) => {
            return error_response(500, "Failed to verify workspace membership");
        }
        Err(MembershipError::Forbidden) => return error_response(403, "Forbidden"),
    }

    let url = match contact_data.rest_url(
        "task_drafts",
        &[
            ("select", "*".to_owned()),
            ("id", format!("eq.{draft_id}")),
            ("ws_id", format!("eq.{raw_ws_id}")),
            ("creator_id", format!("eq.{user_id}")),
            ("limit", "2".to_owned()),
        ],
    ) {
        Some(url) => url,
        None => return error_response(404, "Draft not found"),
    };

    match service_get(contact_data, outbound, &url).await {
        Ok(response) if is_success(response.status) => {
            let rows = response.json::<Vec<Value>>().unwrap_or_default();
            // Legacy `.single()` requires exactly one matching row; any other
            // count maps to the `draftError || !draft` -> 404 branch.
            match single_row(rows) {
                Some(draft) => no_store_response(json_response(200, json!({ "data": draft }))),
                None => error_response(404, "Draft not found"),
            }
        }
        _ => error_response(404, "Draft not found"),
    }
}

/// Resolve the authenticated Supabase session user, returning
/// `(user_id, access_token)`.
async fn authenticate(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Result<(String, String), ()> {
    let access_token = supabase_auth::request_access_token(request).ok_or(())?;
    let user = supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
        .await
        .ok_or(())?;
    let user_id = user.id.filter(|id| !id.trim().is_empty()).ok_or(())?;
    Ok((user_id, access_token))
}

/// Mirror of `verifyWorkspaceMembershipType` with the default `requiredType` of
/// `MEMBER`, using the caller's RLS-bound client (forwarded access token).
async fn verify_membership(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<(), MembershipError> {
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
        .ok_or(MembershipError::LookupFailed)?;
    let response = caller_get(contact_data, outbound, &url, access_token)
        .await
        .map_err(|_| MembershipError::LookupFailed)?;
    if !is_success(response.status) {
        return Err(MembershipError::LookupFailed);
    }

    let membership = response
        .json::<Vec<MembershipRow>>()
        .map_err(|_| MembershipError::LookupFailed)?
        .into_iter()
        .next();

    match membership {
        // `membership_missing` and `membership_type_mismatch` both map to the
        // legacy `!membership.ok` branch -> 403 Forbidden.
        Some(row) if row.membership_type.as_deref() == Some("MEMBER") => Ok(()),
        _ => Err(MembershipError::Forbidden),
    }
}

/// Return the sole row when exactly one row was returned, mirroring the legacy
/// PostgREST `.single()` semantics.
fn single_row(rows: Vec<Value>) -> Option<Value> {
    let mut iter = rows.into_iter();
    let first = iter.next()?;
    if iter.next().is_some() {
        return None;
    }
    Some(first)
}

async fn service_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    send_get(outbound, url, service_role_key, service_role_key).await
}

async fn caller_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    send_get(outbound, url, access_token, service_role_key).await
}

async fn send_get(
    outbound: &impl OutboundHttpClient,
    url: &str,
    bearer_token: &str,
    apikey: &str,
) -> Result<OutboundResponse, ()> {
    let authorization = format!("Bearer {bearer_token}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", apikey),
        )
        .await
        .map_err(|_| ())
}

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_extracts_ws_and_draft_ids() {
        assert_eq!(
            task_draft_ids("/api/v1/workspaces/abc/task-drafts/draft-1"),
            Some(("abc", "draft-1"))
        );
    }

    #[test]
    fn path_guard_rejects_foreign_and_malformed_paths() {
        // Missing draftId segment (this is the list route).
        assert_eq!(task_draft_ids("/api/v1/workspaces/abc/task-drafts"), None);
        // Empty wsId.
        assert_eq!(task_draft_ids("/api/v1/workspaces//task-drafts/draft-1"), None);
        // Empty draftId.
        assert_eq!(task_draft_ids("/api/v1/workspaces/abc/task-drafts/"), None);
        // Wrong middle segment.
        assert_eq!(task_draft_ids("/api/v1/workspaces/abc/task-plans/draft-1"), None);
        // Extra trailing segment.
        assert_eq!(
            task_draft_ids("/api/v1/workspaces/abc/task-drafts/draft-1/extra"),
            None
        );
        // Short / unrelated paths must not panic.
        assert_eq!(task_draft_ids("/api/v1/workspaces/abc"), None);
        assert_eq!(task_draft_ids("/totally/unrelated"), None);
        assert_eq!(task_draft_ids("/api/v1/workspaces/"), None);
    }

    #[test]
    fn single_row_returns_sole_row() {
        let rows = vec![json!({ "id": "d1" })];
        assert_eq!(single_row(rows), Some(json!({ "id": "d1" })));
    }

    #[test]
    fn single_row_rejects_empty_and_multiple() {
        assert_eq!(single_row(Vec::new()), None);
        assert_eq!(
            single_row(vec![json!({ "id": "d1" }), json!({ "id": "d2" })]),
            None
        );
    }

    #[test]
    fn error_response_shapes_legacy_error_body() {
        let response = error_response(404, "Draft not found");
        assert_eq!(response.status, 404);
        assert_eq!(response.body, json!({ "error": "Draft not found" }));
    }
}
