//! Handler for `GET /api/v1/workspaces/:wsId/notes`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/notes/route.ts`.
//!
//! ## Auth model
//!
//! The legacy route:
//!
//! 1. Resolves the authenticated session user via Supabase Auth.
//! 2. Verifies the caller holds any workspace membership (MEMBER or GUEST) via
//!    `verifyWorkspaceMembershipType`.
//! 3. Returns `401` when the session is missing/invalid and `403` when the user
//!    is not a workspace member.
//!
//! This handler reproduces that path using `supabase_auth::request_access_token`
//! to extract the caller token and a direct `workspace_members` REST look-up
//! (caller-token scoped, so RLS applies) to verify membership.
//!
//! ## Query parameters
//!
//! - `archived` — when `"1"` or `"true"` the handler returns archived notes;
//!   otherwise it returns non-archived notes (the legacy default).
//!
//! ## Response
//!
//! On success the handler returns the full notes array (possibly empty) as JSON
//! with no-store cache semantics, matching the legacy `NextResponse.json(notes || [])`.
//!
//! ## Behavior gaps
//!
//! - The legacy route uses the Supabase client directly (RLS active for reads).
//!   This handler fetches notes with the service-role key but applies an
//!   explicit `creator_id=eq.<user_id>` filter, which is functionally equivalent
//!   given the notes RLS policy scopes rows to the creator.
//! - The POST method is not ported here; `None` is returned for non-GET methods
//!   so the request falls through to the still-live Next.js route.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const NOTES_PATH_PREFIX: &str = "/api/v1/workspaces/";
const NOTES_PATH_SUFFIX: &str = "/notes";

pub(crate) async fn handle_workspaces_wsid_notes_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = notes_ws_id(request.path)?;

    Some(match request.method {
        "GET" => notes_get_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn notes_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !config.contact_data.configured() {
        return internal_error_response();
    }

    // 1. Resolve caller access token.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return unauthorized_response();
    };

    // 2. Fetch the authenticated user from Supabase Auth.
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
    else {
        return unauthorized_response();
    };
    let Some(user_id) = user.id.filter(|id| !id.trim().is_empty()) else {
        return unauthorized_response();
    };

    // 3. Verify workspace membership (any type).
    match verify_workspace_membership(
        &config.contact_data,
        outbound,
        raw_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(true) => {}
        Ok(false) => return forbidden_response(),
        Err(()) => return internal_error_response(),
    }

    // 4. Resolve archived filter from query string.
    let archived = archived_param(request.url);

    // 5. Fetch notes.
    match fetch_notes(
        &config.contact_data,
        outbound,
        raw_ws_id,
        &user_id,
        archived,
    )
    .await
    {
        Ok(notes) => no_store_response(json_response(200, notes)),
        Err(()) => internal_error_response(),
    }
}

/// Returns `true` when the caller has any membership row for the given workspace.
async fn verify_workspace_membership(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_caller_get(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // Any non-empty membership row means the user belongs to the workspace.
    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    Ok(!rows.is_empty())
}

async fn fetch_notes(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    archived: bool,
) -> Result<Value, ()> {
    let archived_filter = if archived {
        "eq.true".to_owned()
    } else {
        "eq.false".to_owned()
    };

    let Some(url) = contact_data.rest_url(
        "notes",
        &[
            ("select", "*".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("creator_id", format!("eq.{user_id}")),
            ("archived", archived_filter),
            ("order", "created_at.desc".to_owned()),
        ],
    ) else {
        return Err(());
    };

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

    // Mirror `notes || []`: return parsed array, fall back to empty array.
    let notes: Vec<Value> = response.json().unwrap_or_default();
    Ok(json!(notes))
}

/// Performs a caller-token-scoped GET request (RLS active).
async fn send_caller_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {access_token}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

/// Extracts the raw workspace ID from the request path, or returns `None` when
/// the path does not match `/api/v1/workspaces/<wsId>/notes`.
fn notes_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(NOTES_PATH_PREFIX)?
        .strip_suffix(NOTES_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

/// Parses the `archived` query parameter from the URL.
///
/// Returns `true` when the value is `"1"` or `"true"` (matching the legacy
/// route's `archivedParam === '1' || archivedParam === 'true'` check).
fn archived_param(url: Option<&str>) -> bool {
    url.and_then(|u| url::Url::parse(u).ok())
        .and_then(|parsed| {
            parsed
                .query_pairs()
                .find_map(|(key, value)| (key == "archived").then(|| value.into_owned()))
        })
        .map(|value| value == "1" || value == "true")
        .unwrap_or(false)
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(401, json!({ "error": "Unauthorized" })))
}

fn forbidden_response() -> BackendResponse {
    no_store_response(json_response(403, json!({ "error": "Forbidden" })))
}

fn internal_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "error": "Internal server error" }),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---------------------------------------------------------------------------
    // notes_ws_id — path guard extraction
    // ---------------------------------------------------------------------------

    #[test]
    fn extracts_ws_id_from_valid_path() {
        let ws_id = "11111111-1111-4111-8111-111111111111";
        let path = format!("/api/v1/workspaces/{ws_id}/notes");
        assert_eq!(notes_ws_id(&path), Some(ws_id));
    }

    #[test]
    fn returns_none_for_wrong_prefix() {
        assert!(notes_ws_id("/api/workspaces/some-id/notes").is_none());
    }

    #[test]
    fn returns_none_for_wrong_suffix() {
        assert!(notes_ws_id("/api/v1/workspaces/some-id/notes/extra").is_none());
    }

    #[test]
    fn returns_none_for_empty_ws_id() {
        assert!(notes_ws_id("/api/v1/workspaces//notes").is_none());
    }

    #[test]
    fn returns_none_when_ws_id_contains_slash() {
        assert!(notes_ws_id("/api/v1/workspaces/a/b/notes").is_none());
    }

    // ---------------------------------------------------------------------------
    // archived_param — query string parsing
    // ---------------------------------------------------------------------------

    #[test]
    fn archived_param_true_for_one() {
        assert!(archived_param(Some(
            "https://example.com/api/v1/workspaces/ws/notes?archived=1"
        )));
    }

    #[test]
    fn archived_param_true_for_true() {
        assert!(archived_param(Some(
            "https://example.com/api/v1/workspaces/ws/notes?archived=true"
        )));
    }

    #[test]
    fn archived_param_false_for_zero() {
        assert!(!archived_param(Some(
            "https://example.com/api/v1/workspaces/ws/notes?archived=0"
        )));
    }

    #[test]
    fn archived_param_false_when_missing() {
        assert!(!archived_param(Some(
            "https://example.com/api/v1/workspaces/ws/notes"
        )));
    }

    #[test]
    fn archived_param_false_for_none_url() {
        assert!(!archived_param(None));
    }
}
