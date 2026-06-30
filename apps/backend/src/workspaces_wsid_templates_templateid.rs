//! Handler for `GET /api/v1/workspaces/:wsId/templates/:templateId`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/templates/[templateId]/route.ts`.
//!
//! # Legacy GET behavior
//!
//! 1. Validates that `templateId` is a UUID; returns `400` if not.
//! 2. Resolves the authenticated user from the Supabase session cookie/bearer
//!    token; returns `401 { "error": "Please sign in to view templates" }` if
//!    the user cannot be resolved.
//! 3. Normalizes `wsId` (handles `personal`/`internal`/handle aliases).
//! 4. Verifies workspace membership via `verifyWorkspaceMembershipType`
//!    (requires `MEMBER` type):
//!    - membership lookup failure → `500 { "error": "Failed to verify workspace membership" }`
//!    - not a member → `403 { "error": "Access denied to workspace" }`
//! 5. Fetches the single `board_templates` row by `id` using the service-role
//!    (admin) client.
//! 6. Applies access-control guards:
//!    - template exists but its `ws_id` ≠ `wsId` and it is not `public`
//!      → `404 { "error": "Access Denied" }`
//!    - template is `private` and `created_by` ≠ caller → `404 { "error": "Access Denied" }`
//!    - template not found / DB error → `404 { "error": "Template not found or access denied" }`
//! 7. Computes `stats` (lists / tasks / labels) from the JSONB `content` column.
//! 8. Returns `200 { "template": { id, wsId, createdBy, sourceBoardId, name,
//!    description, visibility, content, backgroundPath, createdAt, updatedAt,
//!    isOwner, stats } }` with no-store cache headers.
//!
//! # Behavior gaps
//!
//! - PATCH and DELETE remain on the legacy Next.js route; this handler returns
//!   `None` for every non-GET method so the worker falls through.
//! - The legacy list handler (`workspaces_templates.rs`) also generates a signed
//!   `backgroundUrl`; the individual GET handler in the legacy route does NOT
//!   include a `backgroundUrl`, so none is included here either.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_MID: &str = "/templates/";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct BoardTemplateRow {
    id: Option<Value>,
    ws_id: Option<String>,
    created_by: Option<String>,
    source_board_id: Option<Value>,
    name: Option<Value>,
    description: Option<Value>,
    visibility: Option<String>,
    background_path: Option<Value>,
    content: Option<Value>,
    created_at: Option<Value>,
    updated_at: Option<Value>,
}

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct TemplateStats {
    lists: u64,
    tasks: u64,
    labels: u64,
}

#[derive(Serialize)]
struct SerializedTemplate {
    id: Value,
    #[serde(rename = "wsId")]
    ws_id: Value,
    #[serde(rename = "createdBy")]
    created_by: Value,
    #[serde(rename = "sourceBoardId")]
    source_board_id: Value,
    name: Value,
    description: Value,
    visibility: Value,
    content: Value,
    #[serde(rename = "backgroundPath")]
    background_path: Value,
    #[serde(rename = "createdAt")]
    created_at: Value,
    #[serde(rename = "updatedAt")]
    updated_at: Value,
    #[serde(rename = "isOwner")]
    is_owner: bool,
    stats: TemplateStats,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_templates_templateid_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (raw_ws_id, template_id) = extract_path_params(request.path)?;

    // Owned method is GET only; PATCH and DELETE fall through to Next.js.
    Some(match request.method {
        "GET" => get_response(config, request, raw_ws_id, template_id, outbound).await,
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
    template_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Validate that templateId is a UUID before doing anything else.
    if !is_uuid_literal(template_id) {
        return error_response(400, "Invalid template ID");
    }

    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        return internal_server_error_response();
    }

    // Authenticate caller.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, "Please sign in to view templates");
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, "Please sign in to view templates");
    };

    // Resolve workspace ID (handles personal / internal / handle aliases).
    let ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(id) => id,
            Err(()) => return internal_server_error_response(),
        };

    // Verify caller is a workspace member.
    match verify_workspace_member(contact_data, outbound, &ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(403, "Access denied to workspace"),
        Err(()) => return error_response(500, "Failed to verify workspace membership"),
    }

    // Fetch the template row with service-role (mirrors createAdminClient in legacy).
    let template = match fetch_board_template(contact_data, outbound, template_id).await {
        Ok(Some(row)) => row,
        Ok(None) => {
            return error_response(404, "Template not found or access denied");
        }
        Err(()) => {
            return error_response(404, "Template not found or access denied");
        }
    };

    // Access-control guards (mirror legacy order).
    let visibility = template.visibility.as_deref().unwrap_or("");
    let template_ws_id = template.ws_id.as_deref().unwrap_or("");
    let created_by = template.created_by.as_deref().unwrap_or("");

    if visibility != "public" && template_ws_id != ws_id {
        return error_response(404, "Access Denied");
    }
    if visibility == "private" && created_by != user_id {
        return error_response(404, "Access Denied");
    }

    let is_owner = created_by == user_id;
    let stats = compute_stats(template.content.as_ref());

    let serialized = SerializedTemplate {
        id: template.id.unwrap_or(Value::Null),
        ws_id: template.ws_id.map(Value::String).unwrap_or(Value::Null),
        created_by: template
            .created_by
            .map(Value::String)
            .unwrap_or(Value::Null),
        source_board_id: template.source_board_id.unwrap_or(Value::Null),
        name: template.name.unwrap_or(Value::Null),
        description: template.description.unwrap_or(Value::Null),
        visibility: template
            .visibility
            .map(Value::String)
            .unwrap_or(Value::Null),
        content: template.content.unwrap_or(Value::Null),
        background_path: template.background_path.unwrap_or(Value::Null),
        created_at: template.created_at.unwrap_or(Value::Null),
        updated_at: template.updated_at.unwrap_or(Value::Null),
        is_owner,
        stats,
    };

    no_store_response(json_response(200, json!({ "template": serialized })))
}

// ---------------------------------------------------------------------------
// Supabase data access
// ---------------------------------------------------------------------------

async fn fetch_board_template(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    template_id: &str,
) -> Result<Option<BoardTemplateRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "board_templates",
        &[
            (
                "select",
                "id,ws_id,created_by,source_board_id,name,description,visibility,background_path,content,created_at,updated_at"
                    .to_owned(),
            ),
            ("id", format!("eq.{template_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<BoardTemplateRow>>().map_err(|_| ())?;
    Ok(rows.into_iter().next())
}

async fn verify_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
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
    let response = send_service_role_get(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?;
    Ok(rows.first().and_then(|row| row.membership_type.as_deref()) == Some("MEMBER"))
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if is_direct_workspace_lookup_identifier(&handle) {
            if let Some(wid) =
                workspace_id_by_handle_caller(contact_data, outbound, &handle, access_token).await?
            {
                return Ok(wid);
            }
            if let Some(wid) =
                workspace_id_by_handle_service_role(contact_data, outbound, &handle).await?
            {
                return Ok(wid);
            }
        }
    }

    Ok(resolved_ws_id)
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
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
    let response = send_caller_get(contact_data, outbound, &url, access_token).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id)
        .ok_or(())
}

async fn workspace_id_by_handle_caller(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    access_token: &str,
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
    let response = send_caller_get(contact_data, outbound, &url, access_token).await?;
    if !(200..300).contains(&response.status) {
        return Ok(None);
    }
    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn workspace_id_by_handle_service_role(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
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
    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Ok(None);
    }
    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
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

/// Extracts `(raw_ws_id, template_id)` from
/// `/api/v1/workspaces/{wsId}/templates/{templateId}`.
///
/// Returns `None` when:
///
/// - the prefix does not match,
/// - `wsId` is empty or contains `/`,
/// - `templateId` is empty or contains `/`.
fn extract_path_params(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let mid_pos = rest.find(PATH_MID)?;
    let raw_ws_id = &rest[..mid_pos];
    let template_id = &rest[mid_pos + PATH_MID.len()..];

    if raw_ws_id.is_empty() || raw_ws_id.contains('/') {
        return None;
    }
    if template_id.is_empty() || template_id.contains('/') {
        return None;
    }

    Some((raw_ws_id, template_id))
}

/// Returns `true` when `value` is a 36-character UUID (8-4-4-4-12 hex).
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

fn compute_stats(content: Option<&Value>) -> TemplateStats {
    let Some(Value::Object(map)) = content else {
        return TemplateStats {
            lists: 0,
            tasks: 0,
            labels: 0,
        };
    };

    let lists_array = map.get("lists").and_then(Value::as_array);
    let lists = lists_array.map(|a| a.len() as u64).unwrap_or(0);
    let tasks = lists_array
        .map(|a| {
            a.iter()
                .map(|list| {
                    list.get("tasks")
                        .and_then(Value::as_array)
                        .map(|t| t.len() as u64)
                        .unwrap_or(0)
                })
                .sum()
        })
        .unwrap_or(0);
    let labels = map
        .get("labels")
        .and_then(Value::as_array)
        .map(|a| a.len() as u64)
        .unwrap_or(0);

    TemplateStats {
        lists,
        tasks,
        labels,
    }
}

// ---------------------------------------------------------------------------
// Response builders
// ---------------------------------------------------------------------------

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

fn internal_server_error_response() -> BackendResponse {
    error_response(500, "Internal server error")
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
        let result = extract_path_params(
            "/api/v1/workspaces/ws-abc/templates/550e8400-e29b-41d4-a716-446655440000",
        );
        assert_eq!(
            result,
            Some(("ws-abc", "550e8400-e29b-41d4-a716-446655440000"))
        );
    }

    #[test]
    fn extract_path_params_uuid_ws_id() {
        let result = extract_path_params(
            "/api/v1/workspaces/00000000-0000-0000-0000-000000000001/templates/00000000-0000-0000-0000-000000000002",
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
        assert_eq!(extract_path_params("/api/workspaces/ws/templates/id"), None);
        assert_eq!(
            extract_path_params("/api/v2/workspaces/ws/templates/id"),
            None
        );
    }

    #[test]
    fn extract_path_params_rejects_collection_path() {
        assert_eq!(extract_path_params("/api/v1/workspaces/ws/templates"), None);
        assert_eq!(
            extract_path_params("/api/v1/workspaces/ws/templates/"),
            None
        );
    }

    #[test]
    fn extract_path_params_rejects_sub_resource() {
        assert_eq!(
            extract_path_params("/api/v1/workspaces/ws/templates/id/extra"),
            None
        );
    }

    #[test]
    fn extract_path_params_rejects_empty_ws_id() {
        assert_eq!(
            extract_path_params("/api/v1/workspaces//templates/id"),
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
        assert!(!is_uuid_literal("my-template"));
        assert!(!is_uuid_literal(""));
        assert!(!is_uuid_literal("550e8400e29b41d4a716446655440000"));
    }

    // -- compute_stats --

    #[test]
    fn compute_stats_with_full_content() {
        use serde_json::json;

        let content = json!({
            "lists": [
                { "tasks": [1, 2, 3] },
                { "tasks": [4, 5] },
                {}
            ],
            "labels": ["l1", "l2"]
        });
        let stats = compute_stats(Some(&content));
        assert_eq!(stats.lists, 3);
        assert_eq!(stats.tasks, 5);
        assert_eq!(stats.labels, 2);
    }

    #[test]
    fn compute_stats_with_null_content() {
        let stats = compute_stats(None);
        assert_eq!(stats.lists, 0);
        assert_eq!(stats.tasks, 0);
        assert_eq!(stats.labels, 0);
    }

    #[test]
    fn compute_stats_with_empty_object() {
        use serde_json::json;

        let content = json!({});
        let stats = compute_stats(Some(&content));
        assert_eq!(stats.lists, 0);
        assert_eq!(stats.tasks, 0);
        assert_eq!(stats.labels, 0);
    }

    // -- response builders --

    #[test]
    fn error_response_status_and_body() {
        use serde_json::json;

        let resp = error_response(400, "Invalid template ID");
        assert_eq!(resp.status, 400);
        assert_eq!(resp.body, json!({ "error": "Invalid template ID" }));

        let resp = error_response(401, "Please sign in to view templates");
        assert_eq!(resp.status, 401);

        let resp = error_response(403, "Access denied to workspace");
        assert_eq!(resp.status, 403);

        let resp = error_response(404, "Template not found or access denied");
        assert_eq!(resp.status, 404);

        let resp = internal_server_error_response();
        assert_eq!(resp.status, 500);
        assert_eq!(resp.body, json!({ "error": "Internal server error" }));
    }

    // -- is_workspace_handle --

    #[test]
    fn is_workspace_handle_valid() {
        assert!(is_workspace_handle("my-workspace"));
        assert!(is_workspace_handle("ws123"));
        assert!(is_workspace_handle("a"));
    }

    #[test]
    fn is_workspace_handle_invalid() {
        assert!(!is_workspace_handle(""));
        assert!(!is_workspace_handle("-leading-dash"));
        assert!(!is_workspace_handle("trailing-dash-"));
    }
}
