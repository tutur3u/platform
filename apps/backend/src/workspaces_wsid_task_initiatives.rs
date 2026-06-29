//! Handler for `GET /api/v1/workspaces/:wsId/task-initiatives`.
//!
//! Ports the GET method of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/task-initiatives/route.ts`.
//! (The legacy route also exposes `POST`; that mutation is intentionally NOT
//! migrated here — this handler returns `None` for every non-`GET` method so the
//! worker falls through to the still-live Next.js route.)
//!
//! Auth model (legacy GET): authenticate the Supabase session user, normalize the
//! workspace id (`internal`/`personal` slug, handle, or UUID), then require
//! **workspace membership of type `MEMBER`** via `verifyWorkspaceMembershipType`
//! (its default `requiredType`). There is no specific permission gate, so this
//! port reproduces the membership-only check directly (token -> user ->
//! `workspace_members` lookup with the caller token) rather than using
//! `authorize_workspace_permission`, which would over-restrict members.
//!
//! Legacy status codes preserved:
//!   * no authenticated user                  -> `401 { "error": "Unauthorized" }`
//!   * membership lookup transport/query error -> `500 { "error": "Failed to verify workspace access" }`
//!   * not a `MEMBER` (missing / type mismatch) -> `403 { "error": "Forbidden" }`
//!   * initiative read failure                 -> `500 { "error": "Failed to fetch initiatives" }`
//!   * configuration / unexpected error        -> `500 { "error": "Internal server error" }`
//!   * success                                 -> `200` with the serialized array
//!
//! The legacy route reads `task_initiatives` with the admin (service-role) client,
//! so RLS is bypassed and the read is scoped purely by the `ws_id` filter, ordered
//! by `created_at` descending. Each row is reshaped to
//! `{ id, name, description, status, created_at, creator, projectsCount,
//! linkedProjects }`, mirroring `serializeInitiatives`.
//!
//! BEHAVIOR GAP: `NextResponse.json` does not set a `Cache-Control` header on the
//! legacy success response. This port emits `no-store` (the backend read
//! convention) to prevent any intermediary caching of authenticated data; the
//! JSON body is byte-for-byte equivalent.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/task-initiatives";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";

const INITIATIVE_SELECT: &str = "*,creator:users!task_initiatives_creator_id_fkey(id,display_name,avatar_url),task_project_initiatives(project_id,project:task_projects(id,name,status))";

#[derive(Clone, Copy)]
enum MembershipError {
    Unauthorized,
    LookupFailed,
    Forbidden,
}

#[derive(Deserialize)]
struct IdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct MembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_task_initiatives_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = initiatives_ws_id(request.path)?;

    Some(match request.method {
        "GET" => initiatives_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

fn initiatives_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

async fn initiatives_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        return error_response(500, "Internal server error");
    }

    let ws_id = match authorize_membership(contact_data, request, raw_ws_id, outbound).await {
        Ok(ws_id) => ws_id,
        Err(MembershipError::Unauthorized) => return error_response(401, "Unauthorized"),
        Err(MembershipError::LookupFailed) => {
            return error_response(500, "Failed to verify workspace access");
        }
        Err(MembershipError::Forbidden) => return error_response(403, "Forbidden"),
    };

    match fetch_initiatives(contact_data, outbound, &ws_id).await {
        Ok(rows) => no_store_response(json_response(200, serialize_initiatives(rows))),
        Err(()) => error_response(500, "Failed to fetch initiatives"),
    }
}

// ---------------------------------------------------------------------------
// Membership authorization (mirror of verifyWorkspaceMembershipType, MEMBER)
// ---------------------------------------------------------------------------

async fn authorize_membership(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<String, MembershipError> {
    let access_token =
        supabase_auth::request_access_token(request).ok_or(MembershipError::Unauthorized)?;
    let user = supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
        .await
        .ok_or(MembershipError::Unauthorized)?;
    let user_id = user
        .id
        .filter(|id| !id.trim().is_empty())
        .ok_or(MembershipError::Unauthorized)?;

    let ws_id = normalize_ws_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
        .await
        .map_err(|_| MembershipError::LookupFailed)?;

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
    let response = caller_get(contact_data, outbound, &url, &access_token)
        .await
        .map_err(|_| MembershipError::LookupFailed)?;
    if !is_success(response.status) {
        return Err(MembershipError::LookupFailed);
    }

    let membership = response
        .json::<Vec<MembershipRow>>()
        .map_err(|_| MembershipError::LookupFailed)?
        .into_iter()
        .next()
        .ok_or(MembershipError::Forbidden)?;

    if membership.membership_type.as_deref() == Some("MEMBER") {
        Ok(ws_id)
    } else {
        Err(MembershipError::Forbidden)
    }
}

async fn normalize_ws_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let resolved = if raw_ws_id.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        raw_ws_id.to_owned()
    };

    if resolved == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id.trim().eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG) {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_uuid_literal(&resolved) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_lookup_identifier(&handle) {
            return Ok(resolved);
        }
        if let Some(id) =
            workspace_id_by_handle(contact_data, outbound, &handle, Some(access_token)).await?
        {
            return Ok(id);
        }
        if let Some(id) = workspace_id_by_handle(contact_data, outbound, &handle, None).await? {
            return Ok(id);
        }
    }

    Ok(resolved)
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let url = contact_data
        .rest_url(
            "workspaces",
            &[
                ("select", "id,workspace_members!inner(user_id,type)".to_owned()),
                ("personal", "eq.true".to_owned()),
                ("workspace_members.user_id", format!("eq.{user_id}")),
                ("workspace_members.type", "eq.MEMBER".to_owned()),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = caller_get(contact_data, outbound, &url, access_token).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response
        .json::<Vec<IdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id)
        .ok_or(())
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    access_token: Option<&str>,
) -> Result<Option<String>, ()> {
    let url = contact_data
        .rest_url(
            "workspaces",
            &[
                ("select", "id".to_owned()),
                ("handle", format!("eq.{handle}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = match access_token {
        Some(token) => caller_get(contact_data, outbound, &url, token).await?,
        None => service_get(contact_data, outbound, &url).await?,
    };
    if !is_success(response.status) {
        return Ok(None);
    }
    Ok(response
        .json::<Vec<IdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

// ---------------------------------------------------------------------------
// Data fetch + serialization
// ---------------------------------------------------------------------------

async fn fetch_initiatives(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<Value>, ()> {
    // The legacy route reads with the admin (service-role) client.
    let url = contact_data
        .rest_url(
            "task_initiatives",
            &[
                ("select", INITIATIVE_SELECT.to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("order", "created_at.desc".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = service_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response.json::<Vec<Value>>().map_err(|_| ())
}

/// Mirror of `serializeInitiatives`: pick the exposed scalar columns, pass the
/// embedded `creator` through verbatim, and derive `projectsCount` /
/// `linkedProjects` from the `task_project_initiatives` join rows.
fn serialize_initiatives(rows: Vec<Value>) -> Value {
    Value::Array(rows.iter().map(serialize_initiative).collect())
}

fn serialize_initiative(initiative: &Value) -> Value {
    let links = initiative.get("task_project_initiatives");
    let link_array = links.and_then(Value::as_array);

    let projects_count = link_array.map(|array| array.len()).unwrap_or(0);
    let linked_projects: Vec<Value> = link_array
        .map(|array| {
            array
                .iter()
                .filter_map(|link| match link.get("project") {
                    Some(project) if !project.is_null() => Some(project.clone()),
                    _ => None,
                })
                .collect()
        })
        .unwrap_or_default();

    json!({
        "id": field(initiative, "id"),
        "name": field(initiative, "name"),
        "description": field(initiative, "description"),
        "status": field(initiative, "status"),
        "created_at": field(initiative, "created_at"),
        "creator": field(initiative, "creator"),
        "projectsCount": projects_count,
        "linkedProjects": linked_projects,
    })
}

fn field(value: &Value, key: &str) -> Value {
    value.get(key).cloned().unwrap_or(Value::Null)
}

// ---------------------------------------------------------------------------
// Outbound helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Misc helpers / responses
// ---------------------------------------------------------------------------

fn is_uuid_literal(value: &str) -> bool {
    let value = value.trim();
    value.len() == 36
        && value.chars().enumerate().all(|(index, character)| match index {
            8 | 13 | 18 | 23 => character == '-',
            _ => character.is_ascii_hexdigit(),
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

fn is_direct_lookup_identifier(value: &str) -> bool {
    let normalized = value.trim().to_lowercase();
    normalized == PERSONAL_WORKSPACE_SLUG
        || normalized == ROOT_WORKSPACE_ID
        || normalized == INTERNAL_WORKSPACE_SLUG
        || is_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
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
            initiatives_ws_id("/api/v1/workspaces/abc/task-initiatives"),
            Some("abc")
        );
        assert_eq!(
            initiatives_ws_id("/api/v1/workspaces/personal/task-initiatives"),
            Some("personal")
        );
    }

    #[test]
    fn path_guard_rejects_foreign_and_short_paths() {
        assert_eq!(initiatives_ws_id("/api/v1/workspaces//task-initiatives"), None);
        assert_eq!(
            initiatives_ws_id("/api/v1/workspaces/abc/def/task-initiatives"),
            None
        );
        assert_eq!(initiatives_ws_id("/api/v1/workspaces/abc"), None);
        // No `/api/...` (non-v1) or other route should match.
        assert_eq!(initiatives_ws_id("/api/workspaces/abc/task-initiatives"), None);
        assert_eq!(initiatives_ws_id("/totally/unrelated"), None);
    }

    #[test]
    fn serialize_initiative_reshapes_row_with_links() {
        let row = json!({
            "id": "init-1",
            "name": "Initiative One",
            "description": "desc",
            "status": "active",
            "created_at": "2026-01-01T00:00:00Z",
            "ws_id": "ws-1",
            "creator_id": "user-1",
            "creator": {
                "id": "user-1",
                "display_name": "Alice",
                "avatar_url": null
            },
            "task_project_initiatives": [
                { "project_id": "p1", "project": { "id": "p1", "name": "Proj 1", "status": "active" } },
                { "project_id": "p2", "project": null },
                { "project_id": "p3", "project": { "id": "p3", "name": "Proj 3", "status": null } }
            ]
        });

        let serialized = serialize_initiative(&row);

        assert_eq!(serialized["id"], json!("init-1"));
        assert_eq!(serialized["name"], json!("Initiative One"));
        assert_eq!(serialized["description"], json!("desc"));
        assert_eq!(serialized["status"], json!("active"));
        assert_eq!(serialized["created_at"], json!("2026-01-01T00:00:00Z"));
        assert_eq!(
            serialized["creator"],
            json!({ "id": "user-1", "display_name": "Alice", "avatar_url": null })
        );
        // Count includes every link row; linkedProjects drops null projects.
        assert_eq!(serialized["projectsCount"], json!(3));
        assert_eq!(
            serialized["linkedProjects"],
            json!([
                { "id": "p1", "name": "Proj 1", "status": "active" },
                { "id": "p3", "name": "Proj 3", "status": null }
            ])
        );
        // Non-exposed columns are dropped.
        assert!(serialized.get("ws_id").is_none());
        assert!(serialized.get("creator_id").is_none());
    }

    #[test]
    fn serialize_initiative_handles_missing_links_and_creator() {
        let row = json!({
            "id": "init-2",
            "name": "No links",
            "description": null,
            "status": null,
            "created_at": "2026-02-02T00:00:00Z"
        });

        let serialized = serialize_initiative(&row);

        assert_eq!(serialized["creator"], Value::Null);
        assert_eq!(serialized["description"], Value::Null);
        assert_eq!(serialized["status"], Value::Null);
        assert_eq!(serialized["projectsCount"], json!(0));
        assert_eq!(serialized["linkedProjects"], json!([]));
    }

    #[test]
    fn serialize_initiatives_preserves_order() {
        let rows = vec![
            json!({ "id": "a", "task_project_initiatives": [] }),
            json!({ "id": "b", "task_project_initiatives": [] }),
        ];
        let serialized = serialize_initiatives(rows);
        let array = serialized.as_array().unwrap();
        assert_eq!(array.len(), 2);
        assert_eq!(array[0]["id"], json!("a"));
        assert_eq!(array[1]["id"], json!("b"));
    }

    #[test]
    fn is_uuid_literal_validates_shape() {
        assert!(is_uuid_literal("11111111-1111-4111-8111-111111111111"));
        assert!(!is_uuid_literal("personal"));
        assert!(!is_uuid_literal("not-a-uuid"));
    }

    #[test]
    fn is_direct_lookup_identifier_accepts_slugs_handles_uuids() {
        assert!(is_direct_lookup_identifier("personal"));
        assert!(is_direct_lookup_identifier("internal"));
        assert!(is_direct_lookup_identifier("my-handle"));
        assert!(is_direct_lookup_identifier(
            "11111111-1111-4111-8111-111111111111"
        ));
        assert!(!is_direct_lookup_identifier("Has Spaces"));
    }
}
