//! Handler for `GET /api/workspaces/:wsId/members`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/workspaces/[wsId]/members/route.ts`, which normalizes
//! the workspace id (`@/lib/workspace-helper`'s `normalizeWorkspaceId`) and then
//! delegates `GET` to `packages/apis/src/members/route.ts` (`GET`). The inner
//! handler re-normalizes the (already-normalized) id and reads the workspace
//! creator + members.
//!
//! Behavior reproduced (GET only):
//!   * Resolve a Supabase cookie/bearer session to a user id; missing/invalid
//!     session -> `401 { "message": "Unauthorized" }`.
//!   * `normalizeWorkspaceId(id)`: resolve `internal`/`personal`/handle aliases
//!     to a workspace UUID and require the caller to be a `MEMBER`. When the
//!     workspace cannot be resolved or the caller is not a member -> `401
//!     { "message": "Unauthorized" }` (matches the legacy `null` -> 401 path,
//!     applied by BOTH the outer route and the inner apis route).
//!   * Read `workspaces.creator_id` and the `workspace_members` rows (with the
//!     embedded `users!inner(...)` + `...user_private_details(email)` select)
//!     and return `200 { "members": [...] }`. Each member is flattened to
//!     `{ id, user_id, display_name, email, avatar_url, is_creator }`.
//!   * A failed members read -> `500 { "message": "Error fetching workspace
//!     members" }` (matches the legacy text).
//!
//! Every non-GET method (the legacy route also defines `DELETE`) returns `None`
//! so the worker falls through to the still-active Next.js route. The `DELETE`
//! path is intentionally NOT migrated.
//!
//! NOTE / GAPS: app-session / app-coordination-token auth modes are not
//! reproduced here (only the standard Supabase cookie/bearer session is), in
//! parity with the sibling `workspaces_members.rs` (`/api/v1/...`) port. The
//! legacy reads run through RLS via the user's Supabase client; this port
//! reproduces the resolved rows using a service-role read scoped purely by the
//! verified `ws_id` filter after independently confirming membership, matching
//! the observable response shape.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/workspaces/";
const PATH_SUFFIX: &str = "/members";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FETCH_ERROR_MESSAGE: &str = "Error fetching workspace members";

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceCreatorRow {
    creator_id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

// Mirrors the legacy GET select:
//   user_id,
//   users!inner(
//     id, display_name, avatar_url,
//     ...user_private_details(email)
//   )
#[derive(Deserialize)]
struct MemberRow {
    user_id: Option<String>,
    users: Option<MemberUserRow>,
}

#[derive(Deserialize)]
struct MemberUserRow {
    id: Option<String>,
    display_name: Option<String>,
    avatar_url: Option<String>,
    // Spread embedding (`...user_private_details(email)`) flattens the email
    // onto the user object in the legacy PostgREST response, so it lives here.
    email: Option<String>,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_members_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = match_path(request.path)?;

    Some(match request.method {
        "GET" => members_response(config, request, raw_ws_id, outbound).await,
        // Every other method (e.g. DELETE) is not migrated yet — return None so
        // the worker falls through to the still-active Next.js route.
        _ => return None,
    })
}

fn match_path(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

async fn members_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Auth: standard Supabase cookie/bearer session. App-session /
    // app-coordination-token auth modes are not supported here, in parity with
    // the other migrated workspace routes.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    // normalizeWorkspaceId(id): resolve slug/handle/personal/internal to a
    // workspace UUID, then require the caller to be a MEMBER. The legacy helper
    // returns null (-> 401 Unauthorized) when the workspace cannot be resolved
    // or the caller is not a member.
    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(()) => return message_response(401, UNAUTHORIZED_MESSAGE),
        };

    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(401, UNAUTHORIZED_MESSAGE),
        Err(()) => return message_response(401, UNAUTHORIZED_MESSAGE),
    }

    let creator_id: Option<String> = workspace_creator_id(contact_data, outbound, &resolved_ws_id)
        .await
        .unwrap_or_default();

    match fetch_members(contact_data, outbound, &resolved_ws_id).await {
        Ok(member_rows) => {
            let members: Vec<Value> = member_rows
                .into_iter()
                .filter_map(|member| build_member(member, creator_id.as_deref()))
                .collect();

            no_store_response(json_response(200, json!({ "members": members })))
        }
        Err(()) => message_response(500, FETCH_ERROR_MESSAGE),
    }
}

// Transform a member row to the legacy GET shape. `users!inner(...)` guarantees
// a user object in the legacy query, so rows without one are dropped.
fn build_member(member: MemberRow, creator_id: Option<&str>) -> Option<Value> {
    let users = member.users?;
    let is_creator = match (users.id.as_deref(), creator_id) {
        (Some(id), Some(creator_id)) => id == creator_id,
        _ => false,
    };

    Some(json!({
        "id": users.id,
        "user_id": member.user_id,
        "display_name": users.display_name,
        "email": users.email,
        "avatar_url": users.avatar_url,
        "is_creator": is_creator,
    }))
}

// ---------------------------------------------------------------------------
// Supabase reads
// ---------------------------------------------------------------------------

async fn fetch_members(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<MemberRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            (
                "select",
                "user_id,users!inner(id,display_name,avatar_url,...user_private_details(email))"
                    .to_owned(),
            ),
            ("ws_id", format!("eq.{ws_id}")),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    ensure_ok(&response)?;

    response.json::<Vec<MemberRow>>().map_err(|_| ())
}

async fn workspace_creator_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "creator_id".to_owned()),
            ("id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    ensure_ok(&response)?;

    Ok(response
        .json::<Vec<WorkspaceCreatorRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.creator_id))
}

// ---------------------------------------------------------------------------
// Workspace-id normalization + membership verification
//
// Copied (file-local) from the private helpers in workspace_habits_access.rs to
// avoid editing that module. They mirror the legacy normalizeWorkspaceId flow:
// resolve internal/personal/handle aliases to a workspace UUID, then confirm
// the caller is a MEMBER.
// ---------------------------------------------------------------------------

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

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(resolved_ws_id);
        }

        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, access_token).await?
        {
            return Ok(workspace_id);
        }
        if let Some(workspace_id) =
            workspace_id_by_handle_service_role(contact_data, outbound, &handle).await?
        {
            return Ok(workspace_id);
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
    let response = caller_get(contact_data, outbound, &url, access_token).await?;
    ensure_ok(&response)?;

    response
        .json::<Vec<WorkspaceIdRow>>()
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
    let response = caller_get(contact_data, outbound, &url, access_token).await?;

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
    let response = service_role_get(contact_data, outbound, &url).await?;

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
    let response = service_role_get(contact_data, outbound, &url).await?;
    ensure_ok(&response)?;

    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        == Some("MEMBER"))
}

// ---------------------------------------------------------------------------
// Outbound helpers (file-local copies)
// ---------------------------------------------------------------------------

async fn service_role_get(
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

async fn caller_get(
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

fn ensure_ok(response: &OutboundResponse) -> Result<(), ()> {
    if (200..300).contains(&response.status) {
        Ok(())
    } else {
        Err(())
    }
}

// ---------------------------------------------------------------------------
// Pure helpers (file-local copies)
// ---------------------------------------------------------------------------

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
        || is_workspace_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

fn is_workspace_uuid_literal(value: &str) -> bool {
    value.trim().len() == 36
        && value
            .trim()
            .chars()
            .enumerate()
            .all(|(index, value)| match index {
                8 | 13 | 18 | 23 => value == '-',
                _ => value.is_ascii_hexdigit(),
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

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

// ---------------------------------------------------------------------------
// Tests (pure/sync helpers only)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn match_path_accepts_exact_members_path() {
        assert_eq!(match_path("/api/workspaces/abc/members"), Some("abc"));
        assert_eq!(
            match_path("/api/workspaces/00000000-0000-0000-0000-000000000000/members"),
            Some("00000000-0000-0000-0000-000000000000")
        );
    }

    #[test]
    fn match_path_rejects_non_matching_paths() {
        // v1 variant is owned by a different handler.
        assert_eq!(match_path("/api/v1/workspaces/abc/members"), None);
        // Missing ws id segment.
        assert_eq!(match_path("/api/workspaces//members"), None);
        // Extra nested segment.
        assert_eq!(match_path("/api/workspaces/abc/members/extra"), None);
        assert_eq!(match_path("/api/workspaces/abc/extra/members"), None);
        // Unrelated paths.
        assert_eq!(match_path("/api/workspaces/abc/users"), None);
        assert_eq!(match_path("/health"), None);
        assert_eq!(match_path(""), None);
    }

    #[test]
    fn resolve_workspace_id_maps_internal_to_root() {
        assert_eq!(resolve_workspace_id("internal"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("INTERNAL"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("my-handle"), "my-handle");
    }

    #[test]
    fn is_workspace_uuid_literal_validates_shape() {
        assert!(is_workspace_uuid_literal(
            "00000000-0000-0000-0000-000000000000"
        ));
        assert!(!is_workspace_uuid_literal("not-a-uuid"));
        assert!(!is_workspace_uuid_literal("0000000000000000"));
    }

    #[test]
    fn is_workspace_handle_validates_shape() {
        assert!(is_workspace_handle("acme"));
        assert!(is_workspace_handle("acme-team_1"));
        assert!(!is_workspace_handle("-acme"));
        assert!(!is_workspace_handle("acme-"));
        assert!(!is_workspace_handle(""));
        assert!(!is_workspace_handle("UPPER"));
    }

    #[test]
    fn build_member_flattens_user_and_flags_creator() {
        let row = MemberRow {
            user_id: Some("u-1".to_owned()),
            users: Some(MemberUserRow {
                id: Some("u-1".to_owned()),
                display_name: Some("Alice".to_owned()),
                avatar_url: Some("https://example.com/a.png".to_owned()),
                email: Some("alice@example.com".to_owned()),
            }),
        };

        let value = build_member(row, Some("u-1")).expect("member should build");
        assert_eq!(value["id"], json!("u-1"));
        assert_eq!(value["user_id"], json!("u-1"));
        assert_eq!(value["display_name"], json!("Alice"));
        assert_eq!(value["email"], json!("alice@example.com"));
        assert_eq!(value["avatar_url"], json!("https://example.com/a.png"));
        assert_eq!(value["is_creator"], json!(true));
    }

    #[test]
    fn build_member_marks_non_creator_and_drops_userless_rows() {
        let row = MemberRow {
            user_id: Some("u-2".to_owned()),
            users: Some(MemberUserRow {
                id: Some("u-2".to_owned()),
                display_name: None,
                avatar_url: None,
                email: None,
            }),
        };
        let value = build_member(row, Some("u-1")).expect("member should build");
        assert_eq!(value["is_creator"], json!(false));
        assert_eq!(value["display_name"], Value::Null);

        let userless = MemberRow {
            user_id: Some("u-3".to_owned()),
            users: None,
        };
        assert!(build_member(userless, Some("u-1")).is_none());
    }
}
