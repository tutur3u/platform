//! Handler for `GET /api/v1/workspaces/:wsId/group-tags/:tagId`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/group-tags/[tagId]/route.ts`.
//!
//! # Auth model
//!
//! The legacy route calls `getPermissions({ wsId, request })`, which resolves
//! the workspace ID (including `personal` / `internal` aliases) and verifies
//! that the caller is an authenticated workspace member. A missing or invalid
//! session, or an unresolvable workspace, returns `404 { "error": "Not found" }`
//! (the legacy `!permissions` branch).
//!
//! # Query
//!
//! Reads `workspace_user_group_tags` joined with
//! `workspace_user_group_tag_groups` (aliased as `group_ids`) to embed the
//! associated group IDs. The embedded column is then flattened:
//! `[{ group_id: string }]` -> `[string]` before the response is emitted.
//!
//! # Response shape
//!
//! ```json
//! { "data": { <tag fields>, "group_ids": ["<uuid>", ...] } }
//! ```
//!
//! # Behaviour gaps
//!
//! PUT and DELETE are not migrated; `None` is returned for those methods so the
//! Cloudflare worker falls through to the still-active Next.js route.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const NOT_FOUND_MESSAGE: &str = "Not found";
const FETCH_ERROR_MESSAGE: &str = "Error fetching workspace user group tag";
const TAG_NOT_FOUND_MESSAGE: &str = "Workspace user group tag not found";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_INFIX: &str = "/group-tags/";

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_group_tags_tagid_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (raw_ws_id, tag_id) = parse_path(request.path)?;

    // Only GET is migrated. Return None for every other method so the Cloudflare
    // worker falls through to the still-active Next.js route (PUT/DELETE).
    Some(match request.method {
        "GET" => group_tag_response(config, request, raw_ws_id, tag_id, outbound).await,
        _ => return None,
    })
}

async fn group_tag_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    tag_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // getPermissions => requires an authenticated user that is a workspace member.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return not_found_response();
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return not_found_response();
    };

    let resolved_ws_id = match normalize_workspace_id(
        &config.contact_data,
        outbound,
        raw_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(ws_id) => ws_id,
        // getPermissions returns null on lookup failure -> treated as Not found.
        Err(()) => return not_found_response(),
    };

    match verify_workspace_member(&config.contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) | Err(()) => return not_found_response(),
    }

    match fetch_group_tag(&config.contact_data, outbound, &resolved_ws_id, tag_id).await {
        Ok(Some(tag)) => no_store_response(json_response(200, json!({ "data": tag }))),
        Ok(None) => no_store_response(json_response(
            404,
            json!({ "message": TAG_NOT_FOUND_MESSAGE }),
        )),
        Err(()) => fetch_error_response(),
    }
}

async fn fetch_group_tag(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    tag_id: &str,
) -> Result<Option<Value>, ()> {
    // Mirrors:
    //   supabase
    //     .from('workspace_user_group_tags')
    //     .select('*, group_ids:workspace_user_group_tag_groups(group_id)')
    //     .eq('ws_id', wsId)
    //     .eq('id', id)
    //     .maybeSingle()
    //
    // The embedded column is aliased as `group_ids` and PostgREST returns it as
    // an array of objects: [{ group_id: "..." }]. The legacy route flattens this
    // to [string] before responding.
    let Some(url) = contact_data.rest_url(
        "workspace_user_group_tags",
        &[
            (
                "select",
                "*,group_ids:workspace_user_group_tag_groups(group_id)".to_owned(),
            ),
            ("ws_id", format!("eq.{ws_id}")),
            ("id", format!("eq.{tag_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let mut rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    let Some(mut row) = rows.pop() else {
        return Ok(None);
    };

    // Flatten embedded group_ids: [{ group_id: "..." }] -> ["..."]
    if let Some(obj) = row.as_object_mut() {
        let flat_ids: Vec<Value> = obj
            .get("group_ids")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|entry| {
                        entry
                            .get("group_id")
                            .and_then(|v| v.as_str())
                            .map(|s| json!(s))
                    })
                    .collect()
            })
            .unwrap_or_default();
        obj.insert("group_ids".to_owned(), Value::Array(flat_ids));
    }

    Ok(Some(row))
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

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if is_direct_workspace_lookup_identifier(&handle) {
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
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let auth_header = format!("Bearer {access_token}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &auth_header)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

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
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let auth_header = format!("Bearer {access_token}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &auth_header)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

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
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let auth_header = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &auth_header)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

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
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let auth_header = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &auth_header)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        .is_some())
}

fn parse_path(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let (ws_id, after_ws) = rest.split_once(PATH_INFIX)?;
    let tag_id = after_ws;

    // Both segments must be single, non-empty path components.
    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }
    // tag_id must not have trailing path components (e.g. /user-groups handled
    // by the sibling handler).
    if tag_id.is_empty() || tag_id.contains('/') {
        return None;
    }

    Some((ws_id, tag_id))
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
        || is_workspace_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

fn is_workspace_uuid_literal(value: &str) -> bool {
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

fn not_found_response() -> BackendResponse {
    no_store_response(json_response(404, json!({ "error": NOT_FOUND_MESSAGE })))
}

fn fetch_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": FETCH_ERROR_MESSAGE }),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_path_valid() {
        let ws = "aaaaaaaa-0000-0000-0000-000000000001";
        let tag = "bbbbbbbb-0000-0000-0000-000000000002";
        let path = format!("/api/v1/workspaces/{ws}/group-tags/{tag}");
        let result = parse_path(&path);
        assert_eq!(result, Some((ws, tag)));
    }

    #[test]
    fn parse_path_rejects_sub_path() {
        // The /user-groups sibling must not be claimed by this handler.
        let path = "/api/v1/workspaces/ws-id/group-tags/tag-id/user-groups";
        assert!(parse_path(path).is_none());
    }

    #[test]
    fn parse_path_rejects_empty_ws() {
        let path = "/api/v1/workspaces//group-tags/tag-id";
        assert!(parse_path(path).is_none());
    }

    #[test]
    fn parse_path_rejects_empty_tag() {
        let path = "/api/v1/workspaces/ws-id/group-tags/";
        assert!(parse_path(path).is_none());
    }

    #[test]
    fn parse_path_rejects_wrong_prefix() {
        let path = "/api/workspaces/ws-id/group-tags/tag-id";
        assert!(parse_path(path).is_none());
    }

    #[test]
    fn resolve_workspace_id_internal() {
        assert_eq!(resolve_workspace_id("internal"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("INTERNAL"), ROOT_WORKSPACE_ID);
    }

    #[test]
    fn resolve_workspace_id_passthrough() {
        let id = "aaaaaaaa-0000-0000-0000-000000000001";
        assert_eq!(resolve_workspace_id(id), id);
    }

    #[test]
    fn is_workspace_uuid_literal_valid() {
        assert!(is_workspace_uuid_literal(
            "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
        ));
    }

    #[test]
    fn is_workspace_uuid_literal_invalid() {
        assert!(!is_workspace_uuid_literal("not-a-uuid"));
        assert!(!is_workspace_uuid_literal(""));
    }
}
