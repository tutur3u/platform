//! Handler for `GET /api/v1/workspaces/:wsId/task-drafts`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/task-drafts/route.ts`.
//!
//! Auth model (legacy GET): resolve the authenticated Supabase session user
//! (`resolveAuthenticatedSessionUser`), then require workspace membership via
//! `verifyWorkspaceMembershipType` (which defaults `requiredType` to `MEMBER`).
//! The legacy route does NOT normalize the `wsId` slug (no `personal`/handle
//! resolution): it passes the raw path `wsId` directly to both the membership
//! lookup and the data query, so this port also uses the raw `wsId` verbatim.
//!
//! The membership lookup uses the caller's RLS-bound client in the legacy route;
//! this port forwards the caller's access token. The data read uses the admin
//! (service-role) client in the legacy route; this port uses the service-role
//! key, so RLS is bypassed and the read is scoped purely by the `ws_id` +
//! `creator_id` filters (and optional `board_id` filter).
//!
//! Legacy status codes preserved:
//!   * missing/invalid session user           -> `401 { "error": "Unauthorized" }`
//!   * membership lookup transport/query error -> `500 { "error": "Failed to verify workspace access" }`
//!   * not a `MEMBER` of the workspace         -> `403 { "error": "Forbidden" }`
//!   * draft query failure                     -> `500 { "error": "Failed to fetch drafts" }`
//!   * success                                 -> `200 { "data": [...] }`
//!
//! POST is left to the still-live Next.js route (this handler returns `None`
//! for every non-GET method). No behavior gaps for the GET path.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/task-drafts";

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

pub(crate) async fn handle_workspaces_wsid_task_drafts_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = task_drafts_ws_id(request.path)?;

    Some(match request.method {
        "GET" => task_drafts_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

fn task_drafts_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

async fn task_drafts_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        // The legacy route would fail in the same internal-error class when the
        // Supabase clients cannot be constructed.
        return error_response(500, "Internal server error");
    }

    let request_url = request.url;
    let (user_id, access_token) =
        match authenticate(contact_data, request, outbound).await {
            Ok(values) => values,
            Err(()) => return error_response(401, "Unauthorized"),
        };

    match verify_membership(contact_data, outbound, raw_ws_id, &user_id, &access_token).await {
        Ok(()) => {}
        Err(MembershipError::LookupFailed) => {
            return error_response(500, "Failed to verify workspace access");
        }
        Err(MembershipError::Forbidden) => return error_response(403, "Forbidden"),
    }

    let board_id = query_param(request_url, "boardId");
    let include_unassigned_for_board =
        query_param(request_url, "includeUnassignedForBoard").as_deref() == Some("true");

    let url = match contact_data.rest_url(
        "task_drafts",
        &draft_query_params(
            raw_ws_id,
            &user_id,
            board_id.as_deref(),
            include_unassigned_for_board,
        ),
    ) {
        Some(url) => url,
        None => return error_response(500, "Failed to fetch drafts"),
    };

    match service_get(contact_data, outbound, &url).await {
        Ok(response) if is_success(response.status) => {
            let data = response.json::<Vec<Value>>().unwrap_or_default();
            no_store_response(json_response(200, json!({ "data": data })))
        }
        _ => error_response(500, "Failed to fetch drafts"),
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

/// Build the PostgREST query parameters for the `task_drafts` read, mirroring the
/// legacy Supabase query builder chain.
fn draft_query_params(
    ws_id: &str,
    user_id: &str,
    board_id: Option<&str>,
    include_unassigned_for_board: bool,
) -> Vec<(&'static str, String)> {
    let mut params: Vec<(&'static str, String)> = vec![
        ("select", "*".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("creator_id", format!("eq.{user_id}")),
    ];

    if let Some(board_id) = board_id {
        if include_unassigned_for_board {
            params.push((
                "or",
                format!("(board_id.eq.{board_id},board_id.is.null)"),
            ));
        } else {
            params.push(("board_id", format!("eq.{board_id}")));
        }
    }

    params.push(("order", "created_at.desc".to_owned()));
    params
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

fn query_param(request_url: Option<&str>, key: &str) -> Option<String> {
    url::Url::parse(request_url?)
        .ok()?
        .query_pairs()
        .find_map(|(name, value)| (name == key && !value.is_empty()).then(|| value.into_owned()))
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
    fn path_guard_extracts_ws_id() {
        assert_eq!(
            task_drafts_ws_id("/api/v1/workspaces/abc/task-drafts"),
            Some("abc")
        );
    }

    #[test]
    fn path_guard_rejects_foreign_and_short_paths() {
        assert_eq!(task_drafts_ws_id("/api/v1/workspaces//task-drafts"), None);
        assert_eq!(
            task_drafts_ws_id("/api/v1/workspaces/abc/def/task-drafts"),
            None
        );
        assert_eq!(task_drafts_ws_id("/api/v1/workspaces/abc"), None);
        assert_eq!(
            task_drafts_ws_id("/api/v1/workspaces/abc/task-drafts/extra"),
            None
        );
        assert_eq!(task_drafts_ws_id("/totally/unrelated"), None);
    }

    #[test]
    fn draft_query_params_without_board_id() {
        let params = draft_query_params("ws-1", "user-1", None, false);
        assert_eq!(
            params,
            vec![
                ("select", "*".to_owned()),
                ("ws_id", "eq.ws-1".to_owned()),
                ("creator_id", "eq.user-1".to_owned()),
                ("order", "created_at.desc".to_owned()),
            ]
        );
    }

    #[test]
    fn draft_query_params_with_board_id_filters_by_board() {
        let params = draft_query_params("ws-1", "user-1", Some("board-9"), false);
        assert!(params.contains(&("board_id", "eq.board-9".to_owned())));
        assert!(!params.iter().any(|(key, _)| *key == "or"));
        // order is always last.
        assert_eq!(params.last(), Some(&("order", "created_at.desc".to_owned())));
    }

    #[test]
    fn draft_query_params_with_unassigned_board_uses_or_filter() {
        let params = draft_query_params("ws-1", "user-1", Some("board-9"), true);
        assert!(params.contains(&(
            "or",
            "(board_id.eq.board-9,board_id.is.null)".to_owned()
        )));
        assert!(!params.iter().any(|(key, _)| *key == "board_id"));
    }

    #[test]
    fn draft_query_params_ignores_unassigned_flag_without_board_id() {
        let params = draft_query_params("ws-1", "user-1", None, true);
        assert!(!params.iter().any(|(key, _)| *key == "or" || *key == "board_id"));
    }

    #[test]
    fn query_param_reads_first_non_empty_value() {
        let url = Some(
            "https://x.localhost/api/v1/workspaces/w/task-drafts?boardId=b1&includeUnassignedForBoard=true",
        );
        assert_eq!(query_param(url, "boardId"), Some("b1".to_owned()));
        assert_eq!(
            query_param(url, "includeUnassignedForBoard"),
            Some("true".to_owned())
        );
        assert_eq!(query_param(url, "missing"), None);
    }

    #[test]
    fn error_response_shapes_legacy_error_body() {
        let response = error_response(403, "Forbidden");
        assert_eq!(response.status, 403);
        assert_eq!(response.body, json!({ "error": "Forbidden" }));
    }
}
