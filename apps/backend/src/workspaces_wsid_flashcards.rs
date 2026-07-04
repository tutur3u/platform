//! Handler for `GET /api/v1/workspaces/:wsId/flashcards`.
//!
//! Ports the GET path of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/flashcards/route.ts`.
//! Only GET is migrated; POST still runs through Next.js (this handler returns
//! `None` for non-GET methods so the dispatch chain falls through).
//!
//! # Auth model
//!
//! The legacy GET uses `requireEducationWorkspaceAccess`, which:
//!
//! - Normalizes `wsId` and verifies the caller is a workspace member.
//! - Checks that the `ENABLE_EDUCATION` workspace secret equals `"true"`.
//! - Requires the `ai_lab` workspace permission.
//!
//! This handler reproduces that flow:
//!
//! 1. `authorize_workspace_permission` (normalizes ws id, checks membership +
//!    `ai_lab` permission).
//! 2. A service-role read of `workspace_secrets` to verify the education flag.
//!
//! Status mapping:
//!
//! - Missing / invalid session → `401 Unauthorized`
//! - Forbidden / not a member → `403`
//! - Education not enabled → `404 Education is not enabled for this workspace`
//! - Config / upstream error → `500`
//!
//! # Data access
//!
//! The legacy GET uses `context.supabase` (user-session / RLS). This handler
//! reads `workspace_flashcards` with the service-role key, scoped by `ws_id`,
//! which is equivalent because workspace membership has already been verified.
//!
//! # Query parameters
//!
//! - `q` – optional search string; matched case-insensitively against `front`
//!   and `back` columns via PostgREST `or=front.ilike.*q*,back.ilike.*q*`.
//! - `page` – 1-based page number (default `1`, minimum `1`).
//! - `pageSize` – rows per page (default `20`, minimum `1`, maximum `100`).
//!
//! # Response
//!
//! ```json
//! { "data": [...], "count": <total>, "page": <n>, "pageSize": <n> }
//! ```

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    education_course_module_reads_query::{
        EducationReadQuery, education_read_query_from_url, education_read_range,
        total_count_from_content_range,
    },
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const FLASHCARDS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const FLASHCARDS_PATH_SUFFIX: &str = "/flashcards";
const FLASHCARDS_PERMISSION: &str = "ai_lab";
const ENABLE_EDUCATION_SECRET: &str = "ENABLE_EDUCATION";
const WORKSPACE_SECRETS_TABLE: &str = "workspace_secrets";
const WORKSPACE_FLASHCARDS_TABLE: &str = "workspace_flashcards";
const FLASHCARDS_SELECT: &str = "id, front, back, created_at";

#[derive(Deserialize)]
struct WorkspaceSecretRow {
    value: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_flashcards_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = flashcards_ws_id(request.path)?;

    Some(match request.method {
        "GET" => flashcards_get_response(config, request, raw_ws_id, outbound).await,
        // POST and all other methods still served by Next.js; fall through.
        _ => return None,
    })
}

async fn flashcards_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Step 1 – verify session, workspace membership, and the `ai_lab`
    // permission (mirrors requireEducationWorkspaceAccess internals).
    let authorization = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        FLASHCARDS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(auth) => auth,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return message_response(401, "Unauthorized");
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return message_response(403, "Insufficient permissions");
        }
        Err(WorkspacePermissionAuthorizationError::NotFound) => {
            return message_response(403, "You don't have access to this workspace");
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, "Failed to verify workspace access");
        }
    };

    // Step 2 – check that education is enabled for this workspace.
    match education_enabled(&config.contact_data, outbound, &authorization.ws_id).await {
        Ok(true) => {}
        Ok(false) => {
            return message_response(404, "Education is not enabled for this workspace");
        }
        Err(()) => {
            return message_response(500, "Failed to verify education access");
        }
    }

    // Step 3 – parse pagination / search query.
    let query = education_read_query_from_url(request.url);

    // Step 4 – fetch workspace flashcards.
    match fetch_flashcards(&config.contact_data, outbound, &authorization.ws_id, &query).await {
        Ok((data, count)) => no_store_response(json_response(
            200,
            json!({
                "data": data,
                "count": count,
                "page": query.page,
                "pageSize": query.page_size,
            }),
        )),
        Err(()) => message_response(500, "Error fetching workspace flashcards"),
    }
}

/// Checks whether `ENABLE_EDUCATION` secret is set to `"true"` for `ws_id`.
async fn education_enabled(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            WORKSPACE_SECRETS_TABLE,
            &[
                ("select", "value".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("name", format!("eq.{ENABLE_EDUCATION_SECRET}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization_header = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization_header)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceSecretRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.value)
        .is_some_and(|v| v.trim().eq_ignore_ascii_case("true")))
}

/// Fetches a paginated (and optionally filtered) page of `workspace_flashcards`.
///
/// Returns `(rows, total_count)` on success.
async fn fetch_flashcards(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &EducationReadQuery,
) -> Result<(Vec<Value>, usize), ()> {
    let mut params: Vec<(&str, String)> = vec![
        ("select", FLASHCARDS_SELECT.to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "created_at.desc".to_owned()),
    ];

    // Mirror legacy `.or(\`front.ilike.%q%,back.ilike.%q%\`)`.
    if let Some(q) = query.q.as_deref().filter(|q| !q.is_empty()) {
        params.push(("or", format!("front.ilike.*{q}*,back.ilike.*{q}*")));
    }

    let url = contact_data
        .rest_url(WORKSPACE_FLASHCARDS_TABLE, &params)
        .ok_or(())?;

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization_header = format!("Bearer {service_role_key}");
    let range = education_read_range(query);

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization_header)
                .with_header("apikey", service_role_key)
                .with_header("Range-Unit", "items")
                .with_header("Range", &range)
                .with_header("Prefer", "count=exact"),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let count = total_count_from_content_range(&response).unwrap_or(0);
    let data = response.json::<Vec<Value>>().map_err(|_| ())?;

    Ok((data, count))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

/// Extracts the raw `wsId` segment from a flashcards path, or returns `None`
/// if the path does not match `/api/v1/workspaces/<wsId>/flashcards`.
fn flashcards_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(FLASHCARDS_PATH_PREFIX)?
        .strip_suffix(FLASHCARDS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Path extraction ────────────────────────────────────────────────────────

    #[test]
    fn ws_id_extracted_from_flashcards_path() {
        assert_eq!(
            flashcards_ws_id("/api/v1/workspaces/ws-abc/flashcards"),
            Some("ws-abc")
        );
    }

    #[test]
    fn ws_id_extracted_with_uuid() {
        assert_eq!(
            flashcards_ws_id("/api/v1/workspaces/11111111-1111-4111-8111-111111111111/flashcards"),
            Some("11111111-1111-4111-8111-111111111111")
        );
    }

    #[test]
    fn ws_id_rejects_missing_prefix() {
        assert_eq!(flashcards_ws_id("/api/workspaces/ws-abc/flashcards"), None);
    }

    #[test]
    fn ws_id_rejects_wrong_suffix() {
        assert_eq!(flashcards_ws_id("/api/v1/workspaces/ws-abc/quizzes"), None);
    }

    #[test]
    fn ws_id_rejects_extra_segment_after_suffix() {
        assert_eq!(
            flashcards_ws_id("/api/v1/workspaces/ws-abc/flashcards/extra"),
            None
        );
    }

    #[test]
    fn ws_id_rejects_empty_ws_id_segment() {
        assert_eq!(flashcards_ws_id("/api/v1/workspaces//flashcards"), None);
    }

    // ── Query parsing (delegates to education_read_query_from_url) ────────────

    #[test]
    fn query_defaults_when_no_url() {
        let query = education_read_query_from_url(None);
        assert_eq!(query.page, 1);
        assert_eq!(query.page_size, 20);
        assert_eq!(query.q, None);
    }

    #[test]
    fn query_parses_page_and_page_size() {
        let query = education_read_query_from_url(Some(
            "https://t.localhost/api/v1/workspaces/ws/flashcards?page=3&pageSize=50",
        ));
        assert_eq!(query.page, 3);
        assert_eq!(query.page_size, 50);
    }

    #[test]
    fn query_caps_page_size_at_max() {
        let query = education_read_query_from_url(Some(
            "https://t.localhost/api/v1/workspaces/ws/flashcards?pageSize=999",
        ));
        assert_eq!(query.page_size, 100);
    }

    #[test]
    fn query_trims_search_term() {
        let query = education_read_query_from_url(Some(
            "https://t.localhost/api/v1/workspaces/ws/flashcards?q=%20hello%20",
        ));
        assert_eq!(query.q.as_deref(), Some("hello"));
    }

    #[test]
    fn query_treats_empty_search_as_absent() {
        let query = education_read_query_from_url(Some(
            "https://t.localhost/api/v1/workspaces/ws/flashcards?q=%20%20",
        ));
        assert_eq!(query.q, None);
    }

    // ── Range header ──────────────────────────────────────────────────────────

    #[test]
    fn range_first_page() {
        let query = EducationReadQuery {
            page: 1,
            page_size: 20,
            q: None,
        };
        assert_eq!(education_read_range(&query), "0-19");
    }

    #[test]
    fn range_second_page() {
        let query = EducationReadQuery {
            page: 2,
            page_size: 20,
            q: None,
        };
        assert_eq!(education_read_range(&query), "20-39");
    }
}
