//! Handler for `GET /api/v1/workspaces/:wsId/templates/:templateId/shares`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/templates/[templateId]/shares/route.ts`.
//!
//! **Auth model**: pure Supabase session (Bearer access token or auth cookie).
//! No app-session token or workspace permission check is performed. The legacy
//! handler uses `resolveAuthenticatedSessionUser` directly, then verifies that
//! the caller is the template owner before returning the share list.
//!
//! **GET behavior reproduced exactly**:
//!
//!   1. Validate `wsId` and `templateId` as UUID literals (400 on failure).
//!   2. Resolve the authenticated user via access token -> `/auth/v1/user`
//!      (401 on failure).
//!   3. Fetch `board_templates` by `templateId` with the caller token (RLS
//!      active). Return 404 if not found; 403 if the caller is not the owner.
//!   4. Fetch `board_template_shares` filtered by `template_id` using the
//!      caller token (RLS active), ordered by `created_at` descending.
//!   5. Return `{ "shares": [...], "count": N }`.
//!
//! **Status codes / response shapes**:
//!
//!   * invalid `wsId` or `templateId`          -> `400 { "error": "Invalid workspace ID or template ID" }`
//!   * missing or invalid session               -> `401 { "error": "Please sign in to view shares" }`
//!   * template not found                       -> `404 { "error": "Template not found" }`
//!   * caller is not the template owner         -> `403 { "error": "Only the template owner can view shares" }`
//!   * upstream read failure / misconfiguration -> `500 { "error": "Failed to fetch shares" }`
//!   * success                                  -> `200 { "shares": [...], "count": N }`
//!
//! **Cache**: the legacy route sets no explicit cache header; all responses are
//! wrapped with `no_store_response`.
//!
//! **GET only**: every non-GET method returns `None` so the still-live Next.js
//! route continues to serve `POST` and `DELETE`.
//!
//! **Behavior gap**: the legacy route validates `wsId` and `templateId` with
//! the npm `uuid` package's `validate()` function, which accepts any RFC 4122
//! UUID variant/version. This handler reproduces that check with a local
//! UUID-literal detector that matches the same canonical 8-4-4-4-12 hex format.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// ---------------------------------------------------------------------------
// Path constants
// ---------------------------------------------------------------------------

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const TEMPLATES_SEGMENT: &str = "/templates/";
const SHARES_SUFFIX: &str = "/shares";

// ---------------------------------------------------------------------------
// Response message constants (must match legacy exactly)
// ---------------------------------------------------------------------------

const INVALID_IDS_MESSAGE: &str = "Invalid workspace ID or template ID";
const SIGN_IN_MESSAGE: &str = "Please sign in to view shares";
const TEMPLATE_NOT_FOUND_MESSAGE: &str = "Template not found";
const OWNER_ONLY_MESSAGE: &str = "Only the template owner can view shares";
const FETCH_FAILED_MESSAGE: &str = "Failed to fetch shares";

// ---------------------------------------------------------------------------
// Deserialize helpers
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct BoardTemplateRow {
    id: Option<String>,
    created_by: Option<String>,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_templates_templateid_shares_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (raw_ws_id, raw_template_id) = extract_route_parts(request.path)?;

    if !config.contact_data.configured() {
        return None;
    }

    Some(match request.method {
        "GET" => get_response(config, request, raw_ws_id, raw_template_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    raw_template_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Validate path parameters as UUIDs (mirrors legacy uuid.validate()).
    if !is_uuid(raw_ws_id) || !is_uuid(raw_template_id) {
        return error_response(400, INVALID_IDS_MESSAGE);
    }

    // 1. Authenticate via Supabase session (access token or cookie).
    let access_token = match supabase_auth::request_access_token(request) {
        Some(token) => token,
        None => return error_response(401, SIGN_IN_MESSAGE),
    };
    let user = match supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
        .await
    {
        Some(u) => u,
        None => return error_response(401, SIGN_IN_MESSAGE),
    };
    let user_id = match user.id.as_deref().filter(|id| !id.trim().is_empty()) {
        Some(id) => id.to_owned(),
        None => return error_response(401, SIGN_IN_MESSAGE),
    };

    // 2. Fetch the board template to verify ownership. Uses caller token (RLS active).
    let template =
        match fetch_board_template(contact_data, outbound, raw_template_id, &access_token).await {
            Ok(Some(t)) => t,
            Ok(None) => return error_response(404, TEMPLATE_NOT_FOUND_MESSAGE),
            Err(()) => return error_response(500, FETCH_FAILED_MESSAGE),
        };

    // The template id field must be non-null to confirm the row was found.
    if template.id.is_none() {
        return error_response(404, TEMPLATE_NOT_FOUND_MESSAGE);
    }

    let template_owner = template.created_by.as_deref().unwrap_or("");
    if template_owner != user_id {
        return error_response(403, OWNER_ONLY_MESSAGE);
    }

    // 3. Fetch shares. Uses caller token (RLS active), ordered newest first.
    match fetch_shares(contact_data, outbound, raw_template_id, &access_token).await {
        Ok(shares) => {
            let count = shares.len();
            no_store_response(json_response(
                200,
                json!({ "shares": shares, "count": count }),
            ))
        }
        Err(()) => error_response(500, FETCH_FAILED_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// Supabase reads (caller token, RLS active)
// ---------------------------------------------------------------------------

async fn fetch_board_template(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    template_id: &str,
    access_token: &str,
) -> Result<Option<BoardTemplateRow>, ()> {
    let url = contact_data
        .rest_url(
            "board_templates",
            &[
                ("select", "id,created_by".to_owned()),
                ("id", format!("eq.{template_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = send_caller_get(contact_data, outbound, &url, access_token).await?;

    if !is_success_status(resp.status) {
        return Err(());
    }

    resp.json::<Vec<BoardTemplateRow>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

async fn fetch_shares(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    template_id: &str,
    access_token: &str,
) -> Result<Vec<Value>, ()> {
    let url = contact_data
        .rest_url(
            "board_template_shares",
            &[
                (
                    "select",
                    "id,user_id,email,permission,created_by,created_at".to_owned(),
                ),
                ("template_id", format!("eq.{template_id}")),
                ("order", "created_at.desc".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = send_caller_get(contact_data, outbound, &url, access_token).await?;

    if !is_success_status(resp.status) {
        return Err(());
    }

    resp.json::<Vec<Value>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// HTTP helper (caller token, RLS active)
// ---------------------------------------------------------------------------

/// Issue a GET request forwarding the caller's access token as the Bearer
/// credential. The `apikey` header carries the service-role key (PostgREST
/// requires it even for caller-scoped reads).
async fn send_caller_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/// Extract `(raw_ws_id, raw_template_id)` from a path that exactly matches
/// `/api/v1/workspaces/<wsId>/templates/<templateId>/shares`.
///
/// Returns `None` for any path that does not match this exact shape (wrong
/// prefix, missing or extra segments, empty dynamic parts).
fn extract_route_parts(path: &str) -> Option<(&str, &str)> {
    // Strip leading "/api/v1/workspaces/".
    let rest = path.strip_prefix(PATH_PREFIX)?;

    // Find the first '/' to isolate wsId.
    let slash_pos = rest.find('/')?;
    let ws_id = &rest[..slash_pos];
    let after_ws = &rest[slash_pos..];

    // Strip "/templates/" to reach templateId.
    let after_templates = after_ws.strip_prefix(TEMPLATES_SEGMENT)?;

    // Find the next '/' to isolate templateId.
    let slash_pos2 = after_templates.find('/')?;
    let template_id = &after_templates[..slash_pos2];
    let after_template = &after_templates[slash_pos2..];

    // Strip "/shares" and ensure nothing follows.
    let after_shares = after_template.strip_prefix(SHARES_SUFFIX)?;

    if ws_id.is_empty() || template_id.is_empty() || !after_shares.is_empty() {
        return None;
    }

    Some((ws_id, template_id))
}

/// Return `true` if `value` looks like a canonical RFC 4122 UUID in the form
/// `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` (8-4-4-4-12 lowercase or uppercase
/// hex digits, matching the npm `uuid` package's `validate()` behaviour).
fn is_uuid(value: &str) -> bool {
    value.len() == 36
        && value.chars().enumerate().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        })
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn error_response(status: u16, error: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": error })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // extract_route_parts
    // -----------------------------------------------------------------------

    #[test]
    fn extract_route_parts_matches_exact_path() {
        let ws = "11111111-1111-4111-8111-111111111111";
        let tmpl = "22222222-2222-4222-8222-222222222222";
        let path = format!("/api/v1/workspaces/{ws}/templates/{tmpl}/shares");
        assert_eq!(extract_route_parts(&path), Some((ws, tmpl)));
    }

    #[test]
    fn extract_route_parts_rejects_wrong_prefix() {
        assert_eq!(
            extract_route_parts("/api/workspaces/abc/templates/def/shares"),
            None
        );
    }

    #[test]
    fn extract_route_parts_rejects_missing_shares_suffix() {
        assert_eq!(
            extract_route_parts("/api/v1/workspaces/abc/templates/def"),
            None
        );
    }

    #[test]
    fn extract_route_parts_rejects_trailing_segment() {
        assert_eq!(
            extract_route_parts("/api/v1/workspaces/abc/templates/def/shares/extra"),
            None
        );
    }

    #[test]
    fn extract_route_parts_rejects_empty_ws_id() {
        assert_eq!(
            extract_route_parts("/api/v1/workspaces//templates/def/shares"),
            None
        );
    }

    #[test]
    fn extract_route_parts_rejects_empty_template_id() {
        assert_eq!(
            extract_route_parts("/api/v1/workspaces/abc/templates//shares"),
            None
        );
    }

    #[test]
    fn extract_route_parts_rejects_wrong_middle_segment() {
        assert_eq!(
            extract_route_parts("/api/v1/workspaces/abc/boards/def/shares"),
            None
        );
    }

    // -----------------------------------------------------------------------
    // is_uuid
    // -----------------------------------------------------------------------

    #[test]
    fn is_uuid_accepts_canonical_uuids() {
        assert!(is_uuid("11111111-1111-4111-8111-111111111111"));
        assert!(is_uuid("00000000-0000-0000-0000-000000000000"));
        assert!(is_uuid("FFFFFFFF-FFFF-4FFF-8FFF-FFFFFFFFFFFF"));
    }

    #[test]
    fn is_uuid_rejects_invalid_values() {
        assert!(!is_uuid("not-a-uuid"));
        assert!(!is_uuid("personal"));
        assert!(!is_uuid(""));
        // Missing dashes.
        assert!(!is_uuid("11111111111141118111111111111111"));
        // Too short.
        assert!(!is_uuid("11111111-1111-4111-8111-11111111111"));
    }

    // -----------------------------------------------------------------------
    // error_response
    // -----------------------------------------------------------------------

    #[test]
    fn error_response_shape_401() {
        let resp = error_response(401, SIGN_IN_MESSAGE);
        assert_eq!(resp.status, 401);
        assert_eq!(resp.body, json!({ "error": SIGN_IN_MESSAGE }));
    }

    #[test]
    fn error_response_shape_403() {
        let resp = error_response(403, OWNER_ONLY_MESSAGE);
        assert_eq!(resp.status, 403);
        assert_eq!(resp.body, json!({ "error": OWNER_ONLY_MESSAGE }));
    }

    #[test]
    fn error_response_shape_404() {
        let resp = error_response(404, TEMPLATE_NOT_FOUND_MESSAGE);
        assert_eq!(resp.status, 404);
    }

    #[test]
    fn error_response_shape_500() {
        let resp = error_response(500, FETCH_FAILED_MESSAGE);
        assert_eq!(resp.status, 500);
    }

    #[test]
    fn error_response_shape_400() {
        let resp = error_response(400, INVALID_IDS_MESSAGE);
        assert_eq!(resp.status, 400);
        assert_eq!(resp.body, json!({ "error": INVALID_IDS_MESSAGE }));
    }
}
