//! Handler for `GET /api/v1/workspaces/:wsId/roles`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/roles/route.ts` (GET only).
//!
//! The legacy GET handler:
//!   1. authorizes via `getPermissions({ wsId, request })`, requiring the
//!      `manage_workspace_roles` workspace permission. A `null` permission
//!      context (unauthenticated / unresolved workspace) AND a missing
//!      permission both return `403 { "message": "Workspace role access denied" }`.
//!   2. parses `q`, `page` (default 1), `pageSize` (default 10) query params,
//!      normalizing non-finite / non-positive values to their defaults.
//!   3. reads `workspace_roles` with the admin (service-role) client, embedding
//!      `permissions:workspace_role_permissions(id:permission, enabled)` and
//!      `workspace_role_members(user_id, users:user_id(id, display_name,
//!      avatar_url, user_private_details(email)))`, ordered by `created_at`
//!      descending, ranged to the requested page, with an exact total count.
//!      An optional `name=ilike.%q%` filter is applied when `q` is non-empty.
//!   4. reshapes each row by replacing `workspace_role_members` with normalized
//!      `members` (matching `normalizeRoleMembers`) and a `user_count`, then
//!      responds with `{ data: [...roles], count }`.
//!
//! Auth mapping (this handler reuses `authorize_workspace_permission`, which
//! distinguishes more error states than the legacy `getPermissions` boolean):
//!   * Unauthorized / NotFound / Forbidden -> `403 Workspace role access denied`
//!     (the legacy route collapses all of these to a 403)
//!   * Internal (config / upstream failure during auth) -> `500` (the legacy
//!     route would throw an unhandled error -> 500)
//!   * upstream read failure -> `500 { "message": "Error fetching workspace roles" }`
//!     (matches the legacy text)
//!
//! BEHAVIOR GAP: `Number.parseInt` on absurdly large page / pageSize values
//! yields a JS float in the legacy route; here values that overflow `i64`
//! fall back to the default. This only affects pathological inputs.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission_allowing_app_sessions,
    },
};

const WORKSPACES_ROLES_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_ROLES_PATH_SUFFIX: &str = "/roles";

const WORKSPACE_ROLES_TABLE: &str = "workspace_roles";
const MANAGE_WORKSPACE_ROLES_PERMISSION: &str = "manage_workspace_roles";

const ROLES_SELECT: &str = "id, name, ws_id, permissions:workspace_role_permissions(id:permission, enabled), workspace_role_members(user_id, users:user_id(id, display_name, avatar_url, user_private_details(email))), created_at";

const ACCESS_DENIED_MESSAGE: &str = "Workspace role access denied";
const FETCH_FAILED_MESSAGE: &str = "Error fetching workspace roles";
const INTERNAL_ERROR_MESSAGE: &str = "Internal server error";

/// Parsed + normalized list query parameters.
struct RolesListQuery {
    /// `None` when `q` is absent or empty (legacy treats `''` as falsy).
    q: Option<String>,
    page: u64,
    page_size: u64,
}

#[derive(Deserialize)]
struct RawUserPrivateDetails {
    email: Option<String>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum PrivateDetails {
    One(RawUserPrivateDetails),
    Many(Vec<RawUserPrivateDetails>),
}

#[derive(Deserialize)]
struct RawRoleMemberUser {
    id: Option<String>,
    display_name: Option<String>,
    #[serde(default)]
    full_name: Option<String>,
    avatar_url: Option<String>,
    #[serde(default)]
    user_private_details: Option<PrivateDetails>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum RoleMemberUsers {
    One(Box<RawRoleMemberUser>),
    Many(Vec<RawRoleMemberUser>),
}

#[derive(Deserialize)]
struct RawRoleMemberRecord {
    user_id: String,
    #[serde(default)]
    users: Option<RoleMemberUsers>,
}

#[derive(Serialize)]
struct NormalizedRoleMember {
    id: String,
    display_name: Option<String>,
    full_name: Option<String>,
    avatar_url: Option<String>,
    email: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_roles_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_roles_ws_id(request.path)?;

    // Only GET is migrated. POST (and any other method) must fall through to the
    // still-active Next.js route by returning None (not a 405).
    Some(match request.method {
        "GET" => roles_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn roles_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let ws_id = match authorize_workspace_permission_allowing_app_sessions(
        config,
        request,
        raw_ws_id,
        MANAGE_WORKSPACE_ROLES_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization.ws_id,
        Err(error) => return auth_error_response(error),
    };

    let query = parse_roles_list_query(request.url);

    match fetch_workspace_roles(&config.contact_data, outbound, &ws_id, &query).await {
        Ok((rows, count)) => {
            let roles: Vec<Value> = rows.into_iter().map(shape_role).collect();
            no_store_response(json_response(
                200,
                json!({ "data": roles, "count": count.unwrap_or(0) }),
            ))
        }
        Err(()) => message_response(500, FETCH_FAILED_MESSAGE),
    }
}

/// Reads `workspace_roles` with the service-role key, mirroring
/// `createAdminClient()` in the legacy route (RLS bypassed, scoped by `ws_id`).
async fn fetch_workspace_roles(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &RolesListQuery,
) -> Result<(Vec<Value>, Option<u64>), ()> {
    let (start, end) = roles_range(query.page, query.page_size);
    let mut params: Vec<(&str, String)> = vec![
        ("select", ROLES_SELECT.to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "created_at.desc".to_owned()),
        ("offset", start.to_string()),
        ("limit", (end - start + 1).to_string()),
    ];

    if let Some(q) = &query.q {
        // Mirrors `.ilike('name', `%${q}%`)`.
        params.push(("name", format!("ilike.%{q}%")));
    }

    let Some(url) = contact_data.rest_url(WORKSPACE_ROLES_TABLE, &params) else {
        return Err(());
    };
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                // Reproduces `{ count: 'exact' }`.
                .with_header("Prefer", "count=exact"),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let count = parse_content_range_count(response.header("Content-Range"));
    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;

    Ok((rows, count))
}

/// Replaces `workspace_role_members` with normalized `members` + `user_count`,
/// keeping the remaining role fields (id, name, ws_id, permissions, created_at)
/// untouched. Mirrors the legacy `data.map(...)` reshape.
fn shape_role(mut role: Value) -> Value {
    let members_value = match &mut role {
        Value::Object(map) => map.remove("workspace_role_members"),
        _ => None,
    };

    // `workspace_role_members?.length ?? 0`
    let user_count = match &members_value {
        Some(Value::Array(items)) => items.len(),
        _ => 0,
    };

    let raw_members: Vec<RawRoleMemberRecord> = members_value
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default();

    let members: Vec<NormalizedRoleMember> = raw_members
        .into_iter()
        .map(normalize_role_member)
        .filter(|member| !member.id.is_empty())
        .collect();

    if let Value::Object(map) = &mut role {
        map.insert(
            "members".to_owned(),
            serde_json::to_value(members).unwrap_or_else(|_| Value::Array(Vec::new())),
        );
        map.insert("user_count".to_owned(), Value::from(user_count));
    }

    role
}

/// Mirrors `normalizeRoleMembers` -> `normalizeRoleMemberUser`.
fn normalize_role_member(record: RawRoleMemberRecord) -> NormalizedRoleMember {
    let user = record.users.and_then(|users| match users {
        RoleMemberUsers::One(user) => Some(*user),
        RoleMemberUsers::Many(mut many) => {
            if many.is_empty() {
                None
            } else {
                Some(many.swap_remove(0))
            }
        }
    });

    let email = user.as_ref().and_then(|user| {
        user.user_private_details
            .as_ref()
            .and_then(|details| match details {
                PrivateDetails::One(detail) => detail.email.clone(),
                PrivateDetails::Many(many) => many.first().and_then(|detail| detail.email.clone()),
            })
    });

    let id = user
        .as_ref()
        .and_then(|user| user.id.clone())
        .unwrap_or(record.user_id);

    NormalizedRoleMember {
        id,
        display_name: user.as_ref().and_then(|user| user.display_name.clone()),
        full_name: user.as_ref().and_then(|user| user.full_name.clone()),
        avatar_url: user.as_ref().and_then(|user| user.avatar_url.clone()),
        email,
    }
}

/// Mirrors `start = (page - 1) * pageSize; end = start + pageSize - 1`.
fn roles_range(page: u64, page_size: u64) -> (u64, u64) {
    let start = (page - 1) * page_size;
    let end = start + page_size - 1;
    (start, end)
}

/// Parses + normalizes the list query, mirroring the legacy parseInt + finite /
/// positive normalization with defaults (page=1, pageSize=10).
fn parse_roles_list_query(request_url: Option<&str>) -> RolesListQuery {
    let mut q: Option<String> = None;
    let mut page_raw: Option<String> = None;
    let mut page_size_raw: Option<String> = None;

    if let Some(request_url) = request_url
        && let Ok(parsed) = url::Url::parse(request_url)
    {
        for (key, value) in parsed.query_pairs() {
            match key.as_ref() {
                "q" => q = Some(value.into_owned()),
                "page" => page_raw = Some(value.into_owned()),
                "pageSize" => page_size_raw = Some(value.into_owned()),
                _ => {}
            }
        }
    }

    RolesListQuery {
        // `q ?? undefined` then `if (q)` -> empty string is falsy.
        q: q.filter(|value| !value.is_empty()),
        page: normalized_positive_int(page_raw.as_deref(), 1),
        page_size: normalized_positive_int(page_size_raw.as_deref(), 10),
    }
}

/// Mirrors `Number.isFinite(n) && n > 0 ? n : default` over `parseInt(raw, 10)`.
fn normalized_positive_int(value: Option<&str>, default: u64) -> u64 {
    match value.and_then(js_parse_int) {
        Some(parsed) if parsed > 0 => parsed as u64,
        _ => default,
    }
}

/// Approximates `Number.parseInt(value, 10)`: trims leading whitespace, accepts
/// an optional sign, then reads leading ASCII digits. Returns `None` when there
/// are no digits (JS `NaN`) or the integer overflows `i64`.
fn js_parse_int(value: &str) -> Option<i64> {
    let mut chars = value.trim_start().chars().peekable();
    let mut buffer = String::new();

    if let Some(&first) = chars.peek()
        && (first == '+' || first == '-')
    {
        buffer.push(first);
        chars.next();
    }

    let mut has_digit = false;
    while let Some(&character) = chars.peek() {
        if character.is_ascii_digit() {
            buffer.push(character);
            has_digit = true;
            chars.next();
        } else {
            break;
        }
    }

    if !has_digit {
        return None;
    }

    buffer.parse::<i64>().ok()
}

/// Parses the PostgREST `Content-Range` header (e.g. `0-9/42` or `*/42`),
/// returning the total count after the slash.
fn parse_content_range_count(header: Option<&str>) -> Option<u64> {
    let total = header?.split('/').nth(1)?.trim();
    if total == "*" {
        return None;
    }
    total.parse::<u64>().ok()
}

fn auth_error_response(error: WorkspacePermissionAuthorizationError) -> BackendResponse {
    match error {
        // Legacy collapses null permissions AND missing permission into a 403.
        WorkspacePermissionAuthorizationError::Unauthorized
        | WorkspacePermissionAuthorizationError::NotFound
        | WorkspacePermissionAuthorizationError::Forbidden => {
            message_response(403, ACCESS_DENIED_MESSAGE)
        }
        // Config / upstream failure during auth -> legacy throws -> 500.
        WorkspacePermissionAuthorizationError::Internal => {
            message_response(500, INTERNAL_ERROR_MESSAGE)
        }
    }
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn workspaces_roles_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_ROLES_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_ROLES_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_extracts_ws_id() {
        assert_eq!(
            workspaces_roles_ws_id("/api/v1/workspaces/ws-123/roles"),
            Some("ws-123")
        );
        assert_eq!(
            workspaces_roles_ws_id("/api/v1/workspaces/personal/roles"),
            Some("personal")
        );
    }

    #[test]
    fn path_guard_rejects_non_matching_paths() {
        // Wrong prefix (no v1).
        assert_eq!(workspaces_roles_ws_id("/api/workspaces/ws-1/roles"), None);
        // Wrong suffix.
        assert_eq!(
            workspaces_roles_ws_id("/api/v1/workspaces/ws-1/roles/role-1/members"),
            None
        );
        // Empty ws id.
        assert_eq!(workspaces_roles_ws_id("/api/v1/workspaces//roles"), None);
        // Nested ws segment.
        assert_eq!(workspaces_roles_ws_id("/api/v1/workspaces/a/b/roles"), None);
        // Unrelated route (must not panic / must return None).
        assert_eq!(workspaces_roles_ws_id("/api/v1/health"), None);
    }

    #[test]
    fn js_parse_int_matches_legacy_semantics() {
        assert_eq!(js_parse_int("5"), Some(5));
        assert_eq!(js_parse_int("  12  "), Some(12));
        assert_eq!(js_parse_int("3abc"), Some(3));
        assert_eq!(js_parse_int("-4"), Some(-4));
        assert_eq!(js_parse_int("abc"), None);
        assert_eq!(js_parse_int(""), None);
        assert_eq!(js_parse_int("+7"), Some(7));
    }

    #[test]
    fn normalized_positive_int_applies_defaults() {
        assert_eq!(normalized_positive_int(None, 1), 1);
        assert_eq!(normalized_positive_int(Some("abc"), 1), 1);
        assert_eq!(normalized_positive_int(Some("0"), 10), 10);
        assert_eq!(normalized_positive_int(Some("-3"), 10), 10);
        assert_eq!(normalized_positive_int(Some("5"), 10), 5);
    }

    #[test]
    fn parse_query_defaults_and_filters_empty_q() {
        let query = parse_roles_list_query(Some(
            "https://tuturuuu.localhost/api/v1/workspaces/ws-1/roles",
        ));
        assert_eq!(query.page, 1);
        assert_eq!(query.page_size, 10);
        assert_eq!(query.q, None);

        let query = parse_roles_list_query(Some(
            "https://tuturuuu.localhost/api/v1/workspaces/ws-1/roles?q=&page=2&pageSize=25",
        ));
        assert_eq!(query.page, 2);
        assert_eq!(query.page_size, 25);
        // Empty q is treated as no filter.
        assert_eq!(query.q, None);

        let query = parse_roles_list_query(Some(
            "https://tuturuuu.localhost/api/v1/workspaces/ws-1/roles?q=admin&page=0",
        ));
        assert_eq!(query.q.as_deref(), Some("admin"));
        // page=0 -> default 1.
        assert_eq!(query.page, 1);
    }

    #[test]
    fn roles_range_mirrors_legacy_math() {
        assert_eq!(roles_range(1, 10), (0, 9));
        assert_eq!(roles_range(2, 10), (10, 19));
        assert_eq!(roles_range(3, 25), (50, 74));
    }

    #[test]
    fn parse_content_range_count_reads_total() {
        assert_eq!(parse_content_range_count(Some("0-9/42")), Some(42));
        assert_eq!(parse_content_range_count(Some("*/7")), Some(7));
        assert_eq!(parse_content_range_count(Some("*/*")), None);
        assert_eq!(parse_content_range_count(None), None);
    }

    #[test]
    fn shape_role_normalizes_members_and_counts() {
        let role = json!({
            "id": "role-1",
            "name": "Admins",
            "ws_id": "ws-1",
            "permissions": [{ "id": "manage_workspace_roles", "enabled": true }],
            "created_at": "2024-01-01T00:00:00Z",
            "workspace_role_members": [
                {
                    "user_id": "u-1",
                    "users": {
                        "id": "u-1",
                        "display_name": "Alice",
                        "avatar_url": null,
                        "user_private_details": { "email": "alice@example.com" }
                    }
                },
                {
                    "user_id": "u-2",
                    "users": null
                }
            ]
        });

        let shaped = shape_role(role);
        let object = shaped.as_object().expect("object");

        // Original fields preserved.
        assert_eq!(object.get("id"), Some(&json!("role-1")));
        assert_eq!(object.get("name"), Some(&json!("Admins")));
        assert_eq!(object.get("ws_id"), Some(&json!("ws-1")));
        assert_eq!(
            object.get("permissions"),
            Some(&json!([{ "id": "manage_workspace_roles", "enabled": true }]))
        );
        assert_eq!(
            object.get("created_at"),
            Some(&json!("2024-01-01T00:00:00Z"))
        );

        // Raw embed removed.
        assert!(object.get("workspace_role_members").is_none());

        // user_count counts raw members (before id filtering).
        assert_eq!(object.get("user_count"), Some(&json!(2)));

        let members = object
            .get("members")
            .and_then(Value::as_array)
            .expect("members");
        // u-2 has no users -> falls back to user_id, so both are retained.
        assert_eq!(members.len(), 2);
        assert_eq!(members[0]["id"], json!("u-1"));
        assert_eq!(members[0]["display_name"], json!("Alice"));
        assert_eq!(members[0]["full_name"], Value::Null);
        assert_eq!(members[0]["email"], json!("alice@example.com"));
        assert_eq!(members[1]["id"], json!("u-2"));
        assert_eq!(members[1]["email"], Value::Null);
    }

    #[test]
    fn shape_role_handles_missing_members_embed() {
        let role = json!({ "id": "role-1", "name": "Empty" });
        let shaped = shape_role(role);
        let object = shaped.as_object().expect("object");
        assert_eq!(object.get("user_count"), Some(&json!(0)));
        assert_eq!(object.get("members"), Some(&json!([])));
    }
}
