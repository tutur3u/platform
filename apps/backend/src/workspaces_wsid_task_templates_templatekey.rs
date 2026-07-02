//! Handler for `GET /api/v1/workspaces/:wsId/task-templates/:templateKey`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/task-templates/[templateKey]/route.ts`.
//!
//! # Legacy GET behavior
//!
//! - `withSessionAuth(..., { allowAppSessionAuth: { targetApp: [CLI, 'tasks'] } })`
//!   resolves the caller from a Supabase session OR a CLI/`tasks` app-session
//!   token; an unresolved caller yields `401 { "error": "Unauthorized" }`.
//! - `createTaskTemplatesRouteContext`:
//!   - `normalizeWorkspaceId(rawWsId)` resolves `internal`/`personal`/handle
//!     aliases to a workspace UUID; an error yields
//!     `500 { "error": "Internal server error" }`.
//!   - `verifyWorkspaceMembershipType` with the default `MEMBER` requirement:
//!     - membership lookup DB error -> `500 { "error": "Failed to verify workspace access" }`
//!     - not a `MEMBER` -> `403 { "error": "Workspace access denied" }`
//! - `resolveTaskTemplate(context, templateKey)`:
//!   - URL-decodes `templateKey`.
//!   - If it is a UUID it queries by `id`; otherwise it normalizes to a slug
//!     and queries by `slug`.
//!   - Scoped to `ws_id` + `or(visibility.eq.workspace,created_by.eq.userId)`
//!     + `archived_at is null`, limit 10.
//!   - Prefers the caller's own template; falls back to a workspace-visible one.
//!   - DB error -> `500 { "error": "Failed to resolve task template" }`.
//!   - Not found -> `404 { "error": "Task template not found" }`.
//! - Returns `200 { "template": <serialized row + isOwner> }` (no-store).
//!
//! # Behavior gaps
//!
//! - CLI/`tasks` app-session tokens are not reproduced here. When the request
//!   carries an app-session token this handler returns `None` and the still-live
//!   Next.js GET serves it.
//! - PATCH and DELETE remain on the legacy Next.js route (this handler returns
//!   `None` for every non-GET method).

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_MID: &str = "/task-templates/";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const TASK_TEMPLATES_TABLE: &str = "task_templates";

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

enum DataAuth<'a> {
    AccessToken(&'a str),
    ServiceRole,
}

pub(crate) async fn handle_workspaces_wsid_task_templates_templatekey_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (raw_ws_id, template_key) = extract_path_params(request.path)?;

    // Owned method is GET only; every other method (PATCH, DELETE, ...) falls
    // through to the still-live Next.js route.
    if request.method != "GET" {
        return None;
    }

    // App-session callers (CLI / `tasks`) remain on the legacy Next.js GET,
    // which owns app-session identity resolution. Fall through for them.
    if contact::request_has_app_session_token(request) {
        return None;
    }

    Some(get_response(config, request, raw_ws_id, template_key, outbound).await)
}

async fn get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    template_key: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        return internal_server_error_response();
    }

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return unauthorized_response();
    };
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return unauthorized_response();
    };
    let Some(user_id) = user.id.filter(|id| !id.trim().is_empty()) else {
        return unauthorized_response();
    };

    let ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(Some(ws_id)) => ws_id,
            Ok(None) | Err(()) => return internal_server_error_response(),
        };

    match verify_member(contact_data, outbound, &ws_id, &user_id, &access_token).await {
        Ok(true) => {}
        Ok(false) => return access_denied_response(),
        Err(()) => return membership_lookup_failed_response(),
    }

    match resolve_task_template(contact_data, outbound, &ws_id, &user_id, template_key).await {
        Ok(row) => no_store_response(json_response(200, json!({ "template": row }))),
        Err(ResolveError::NotFound) => not_found_response(),
        Err(ResolveError::Internal) => resolve_failed_response(),
    }
}

enum ResolveError {
    NotFound,
    Internal,
}

/// Mirrors `resolveTaskTemplate`: URL-decodes the key, decides UUID vs. slug,
/// queries up to 10 matching rows, and picks the best match (own first, then
/// workspace-visible). Returns the serialized template row or an error.
async fn resolve_task_template(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    template_key: &str,
) -> Result<Value, ResolveError> {
    let decoded = percent_decode(template_key);
    let decoded = decoded.as_deref().unwrap_or(template_key);

    let mut params: Vec<(&str, String)> = vec![
        ("select", "*".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        (
            "or",
            format!("(visibility.eq.workspace,created_by.eq.{user_id})"),
        ),
        ("archived_at", "is.null".to_owned()),
        ("limit", "10".to_owned()),
    ];

    if is_uuid_literal(decoded) {
        params.push(("id", format!("eq.{decoded}")));
    } else {
        let slug = normalize_template_slug(decoded);
        if slug.is_empty() {
            return Err(ResolveError::NotFound);
        }
        params.push(("slug", format!("eq.{slug}")));
    }

    let Some(url) = contact_data.rest_url(TASK_TEMPLATES_TABLE, &params) else {
        return Err(ResolveError::Internal);
    };

    let service_role_key = contact_data
        .service_role_key()
        .ok_or(ResolveError::Internal)?;
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &format!("Bearer {service_role_key}"))
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ResolveError::Internal)?;

    if !is_success_status(response.status) {
        return Err(ResolveError::Internal);
    }

    let rows = response
        .json::<Vec<Value>>()
        .map_err(|_| ResolveError::Internal)?;

    let template = rows
        .iter()
        .find(|row| {
            row.get("created_by")
                .and_then(Value::as_str)
                .is_some_and(|cb| cb == user_id)
        })
        .or_else(|| {
            rows.iter().find(|row| {
                row.get("visibility")
                    .and_then(Value::as_str)
                    .is_some_and(|v| v == "workspace")
            })
        })
        .cloned();

    match template {
        Some(row) => Ok(serialize_task_template(row, user_id)),
        None => Err(ResolveError::NotFound),
    }
}

/// Mirrors `serializeTaskTemplate`: coerces array-id columns to arrays and adds
/// `isOwner = created_by === userId`.
fn serialize_task_template(row: Value, user_id: &str) -> Value {
    let mut object = match row {
        Value::Object(map) => map,
        other => return other,
    };

    for column in ["assignee_ids", "label_ids", "project_ids"] {
        let is_array = matches!(object.get(column), Some(Value::Array(_)));
        if !is_array {
            object.insert(column.to_owned(), Value::Array(Vec::new()));
        }
    }

    let is_owner = object
        .get("created_by")
        .and_then(Value::as_str)
        .is_some_and(|created_by| created_by == user_id);
    object.insert("isOwner".to_owned(), Value::Bool(is_owner));

    Value::Object(object)
}

// ---------------------------------------------------------------------------
// Auth / workspace helpers (mirrored from workspaces_wsid_task_templates.rs)
// ---------------------------------------------------------------------------

async fn verify_member(
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
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        &DataAuth::AccessToken(access_token),
    )
    .await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let membership_type =
        decode_first_row::<WorkspaceMembershipRow>(&response)?.and_then(|row| row.membership_type);

    Ok(membership_type.as_deref() == Some("MEMBER"))
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(Some(resolved_ws_id));
        }

        if let Some(workspace_id) = workspace_id_by_handle(
            contact_data,
            outbound,
            &handle,
            &DataAuth::AccessToken(access_token),
        )
        .await?
        {
            return Ok(Some(workspace_id));
        }

        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, &DataAuth::ServiceRole).await?
        {
            return Ok(Some(workspace_id));
        }
    }

    Ok(Some(resolved_ws_id))
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id,workspace_members!inner(user_id,type)".to_owned(),
            ),
            ("personal", "eq.true".to_owned()),
            ("workspace_members.user_id", format!("eq.{user_id}")),
            ("workspace_members.type", "eq.MEMBER".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        &DataAuth::AccessToken(access_token),
    )
    .await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    auth: &DataAuth<'_>,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id".to_owned()),
            ("handle", format!("eq.{handle}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response =
        send_rest_request(contact_data, outbound, OutboundMethod::Get, &url, auth).await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}

async fn send_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
    auth: &DataAuth<'_>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = match auth {
        DataAuth::AccessToken(access_token) => format!("Bearer {access_token}"),
        DataAuth::ServiceRole => format!("Bearer {service_role_key}"),
    };

    outbound
        .send(
            OutboundRequest::new(method, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

fn decode_first_row<T: for<'de> Deserialize<'de>>(
    response: &OutboundResponse,
) -> Result<Option<T>, ()> {
    response
        .json::<Vec<T>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/// Extracts `(ws_id, template_key)` from the path
/// `/api/v1/workspaces/{wsId}/task-templates/{templateKey}`.
/// Returns `None` if the path does not match the exact shape.
fn extract_path_params(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let mid_pos = rest.find(PATH_MID)?;
    let raw_ws_id = &rest[..mid_pos];
    let template_key = &rest[mid_pos + PATH_MID.len()..];

    // Guard: ws_id must be non-empty and must not itself contain `/`.
    if raw_ws_id.is_empty() || raw_ws_id.contains('/') {
        return None;
    }
    // Guard: template_key must be non-empty and must not contain another `/`
    // (no further sub-resources).
    if template_key.is_empty() || template_key.contains('/') {
        return None;
    }

    Some((raw_ws_id, template_key))
}

/// Minimal percent-decode: converts `%XX` escape sequences to their UTF-8
/// characters. Returns `None` if the input contains no `%` (fast path), or on
/// invalid escape sequences (the caller falls back to the raw key).
fn percent_decode(input: &str) -> Option<String> {
    if !input.contains('%') {
        return None;
    }
    let mut output = String::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hi = char::from(bytes[i + 1]).to_digit(16)?;
            let lo = char::from(bytes[i + 2]).to_digit(16)?;
            let byte = ((hi << 4) | lo) as u8;
            output.push(byte as char);
            i += 3;
        } else {
            output.push(bytes[i] as char);
            i += 1;
        }
    }
    Some(output)
}

/// Mirrors `slugify` + the `normalizeTemplateSlug` guard in `_lib.ts`.
/// Returns an empty string when the result would be empty (caller treats that as
/// not-found).
fn normalize_template_slug(value: &str) -> String {
    let trimmed = value.trim().to_lowercase();
    // Remove single/double quotes.
    let no_quotes: String = trimmed.chars().filter(|&c| c != '\'' && c != '"').collect();
    // Replace runs of non-alphanumeric characters with a single hyphen.
    let mut slug = String::with_capacity(no_quotes.len());
    let mut last_was_hyphen = false;
    for ch in no_quotes.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch);
            last_was_hyphen = false;
        } else if !last_was_hyphen && !slug.is_empty() {
            slug.push('-');
            last_was_hyphen = true;
        }
    }
    // Strip trailing hyphen that may have been added by the loop.
    if slug.ends_with('-') {
        slug.pop();
    }
    slug.truncate(120);
    slug
}

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn is_direct_workspace_lookup_identifier(identifier: &str) -> bool {
    let normalized = identifier.trim().to_lowercase();
    normalized == PERSONAL_WORKSPACE_SLUG
        || normalized == ROOT_WORKSPACE_ID
        || normalized == INTERNAL_WORKSPACE_SLUG
        || is_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

/// Returns `true` when `value` is a 36-character UUID string (8-4-4-4-12 hex).
fn is_uuid_literal(value: &str) -> bool {
    value.trim().len() == 36
        && value
            .trim()
            .chars()
            .enumerate()
            .all(|(index, ch)| match index {
                8 | 13 | 18 | 23 => ch == '-',
                _ => ch.is_ascii_hexdigit(),
            })
}

fn is_workspace_handle(value: &str) -> bool {
    let length = value.len();
    if length == 0 || length > 64 {
        return false;
    }
    value.chars().enumerate().all(|(index, character)| {
        let is_edge = index == 0 || index + 1 == length;
        character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || (!is_edge && matches!(character, '_' | '-'))
    })
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

// ---------------------------------------------------------------------------
// Response builders
// ---------------------------------------------------------------------------

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(401, json!({ "error": "Unauthorized" })))
}

fn access_denied_response() -> BackendResponse {
    no_store_response(json_response(
        403,
        json!({ "error": "Workspace access denied" }),
    ))
}

fn membership_lookup_failed_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "error": "Failed to verify workspace access" }),
    ))
}

fn not_found_response() -> BackendResponse {
    no_store_response(json_response(
        404,
        json!({ "error": "Task template not found" }),
    ))
}

fn resolve_failed_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "error": "Failed to resolve task template" }),
    ))
}

fn internal_server_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "error": "Internal server error" }),
    ))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- extract_path_params --

    #[test]
    fn extract_path_params_happy_path() {
        let result =
            extract_path_params("/api/v1/workspaces/ws-abc-123/task-templates/my-template-key");
        assert_eq!(result, Some(("ws-abc-123", "my-template-key")));
    }

    #[test]
    fn extract_path_params_uuid_ws_and_uuid_template() {
        let result = extract_path_params(
            "/api/v1/workspaces/00000000-0000-0000-0000-000000000001/task-templates/00000000-0000-0000-0000-000000000002",
        );
        assert_eq!(
            result,
            Some((
                "00000000-0000-0000-0000-000000000001",
                "00000000-0000-0000-0000-000000000002"
            ))
        );
    }

    #[test]
    fn extract_path_params_rejects_wrong_prefix() {
        assert_eq!(
            extract_path_params("/api/workspaces/ws/task-templates/key"),
            None
        );
        assert_eq!(
            extract_path_params("/api/v2/workspaces/ws/task-templates/key"),
            None
        );
    }

    #[test]
    fn extract_path_params_rejects_collection_path() {
        // The collection path (no templateKey segment) must not match.
        assert_eq!(
            extract_path_params("/api/v1/workspaces/ws/task-templates"),
            None
        );
        assert_eq!(
            extract_path_params("/api/v1/workspaces/ws/task-templates/"),
            None
        );
    }

    #[test]
    fn extract_path_params_rejects_sub_resource() {
        // A deeper path (templateKey containing `/`) must not match.
        assert_eq!(
            extract_path_params("/api/v1/workspaces/ws/task-templates/key/extra"),
            None
        );
    }

    #[test]
    fn extract_path_params_rejects_empty_ws_id() {
        assert_eq!(
            extract_path_params("/api/v1/workspaces//task-templates/key"),
            None
        );
    }

    // -- is_uuid_literal --

    #[test]
    fn is_uuid_literal_accepts_valid_uuid() {
        assert!(is_uuid_literal("00000000-0000-0000-0000-000000000000"));
        assert!(is_uuid_literal("550e8400-e29b-41d4-a716-446655440000"));
    }

    #[test]
    fn is_uuid_literal_rejects_non_uuid() {
        assert!(!is_uuid_literal("my-slug"));
        assert!(!is_uuid_literal(""));
        assert!(!is_uuid_literal("550e8400e29b41d4a716446655440000")); // no dashes
    }

    // -- normalize_template_slug --

    #[test]
    fn normalize_template_slug_basic() {
        assert_eq!(normalize_template_slug("Hello World"), "hello-world");
    }

    #[test]
    fn normalize_template_slug_strips_quotes() {
        assert_eq!(normalize_template_slug("it's a test"), "its-a-test");
        assert_eq!(normalize_template_slug("\"quoted\""), "quoted");
    }

    #[test]
    fn normalize_template_slug_collapses_separators() {
        assert_eq!(normalize_template_slug("a  b--c"), "a-b-c");
    }

    #[test]
    fn normalize_template_slug_empty_input() {
        assert_eq!(normalize_template_slug(""), "");
        assert_eq!(normalize_template_slug("  "), "");
        assert_eq!(normalize_template_slug("'\""), "");
    }

    #[test]
    fn normalize_template_slug_truncates_at_120() {
        let long = "a".repeat(200);
        assert_eq!(normalize_template_slug(&long).len(), 120);
    }

    // -- percent_decode --

    #[test]
    fn percent_decode_no_percent_returns_none() {
        assert_eq!(percent_decode("plain-slug"), None);
    }

    #[test]
    fn percent_decode_decodes_spaces() {
        assert_eq!(
            percent_decode("hello%20world"),
            Some("hello world".to_owned())
        );
    }

    #[test]
    fn percent_decode_handles_mixed() {
        assert_eq!(percent_decode("a%2Fb"), Some("a/b".to_owned()));
    }

    // -- serialize_task_template --

    #[test]
    fn serialize_adds_is_owner_and_normalizes_arrays() {
        use serde_json::json;

        let row = json!({
            "id": "t1",
            "created_by": "user-1",
            "assignee_ids": null,
            "label_ids": ["l1"],
            "name": "Template",
        });
        let serialized = serialize_task_template(row, "user-1");
        assert_eq!(serialized["isOwner"], json!(true));
        assert_eq!(serialized["assignee_ids"], json!([]));
        assert_eq!(serialized["label_ids"], json!(["l1"]));
        assert_eq!(serialized["project_ids"], json!([]));
        assert_eq!(serialized["name"], json!("Template"));
    }

    #[test]
    fn serialize_marks_non_owner() {
        use serde_json::json;

        let row = json!({ "created_by": "someone-else" });
        let serialized = serialize_task_template(row, "user-1");
        assert_eq!(serialized["isOwner"], json!(false));
    }

    // -- response builders --

    #[test]
    fn response_builders_have_correct_status_and_body() {
        use serde_json::json;

        let unauthorized = unauthorized_response();
        assert_eq!(unauthorized.status, 401);
        assert_eq!(unauthorized.body, json!({ "error": "Unauthorized" }));

        let denied = access_denied_response();
        assert_eq!(denied.status, 403);
        assert_eq!(denied.body, json!({ "error": "Workspace access denied" }));

        let lookup_failed = membership_lookup_failed_response();
        assert_eq!(lookup_failed.status, 500);
        assert_eq!(
            lookup_failed.body,
            json!({ "error": "Failed to verify workspace access" })
        );

        let not_found = not_found_response();
        assert_eq!(not_found.status, 404);
        assert_eq!(
            not_found.body,
            json!({ "error": "Task template not found" })
        );

        let resolve_failed = resolve_failed_response();
        assert_eq!(resolve_failed.status, 500);
        assert_eq!(
            resolve_failed.body,
            json!({ "error": "Failed to resolve task template" })
        );

        let internal = internal_server_error_response();
        assert_eq!(internal.status, 500);
        assert_eq!(internal.body, json!({ "error": "Internal server error" }));
    }
}
