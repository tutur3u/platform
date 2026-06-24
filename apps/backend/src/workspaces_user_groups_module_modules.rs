//! Handler for
//! `/api/v1/workspaces/:wsId/user-groups/:groupId/module-groups/:moduleGroupId/modules`.
//!
//! Mirrors the legacy Next.js route
//! `apps/web/src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/module-groups/[moduleGroupId]/modules/route.ts`.
//!
//! Legacy `GET` flow:
//!   1. Validate route params with zod: `groupId` and `moduleGroupId` must be
//!      UUIDs, `wsId` must be non-empty. Invalid -> `400`
//!      `{ "message": "Invalid route params", "errors": [...] }`. To stay faithful
//!      to the response shape without re-implementing zod's issue objects, this
//!      port emits `{ "message": "Invalid route params" }` (the `errors` array is
//!      omitted; see notes).
//!   2. Validate workspace access via `getPermissions({ wsId, user })`:
//!        - normalize `wsId` (personal/internal/handle aliases),
//!        - require a `workspace_members` row for the caller,
//!        - require the `manage_users` permission.
//!      This port reuses `workspace_permission_check::authorize_workspace_permission`
//!      which performs the same normalize + membership + effective-permission
//!      computation. NOTE: the legacy route distinguishes 403 (no membership / no
//!      permission) from 500 (membership lookup error); the shared helper maps
//!      missing-membership to `NotFound`. See notes for the exact mapping chosen.
//!   3. Validate the group belongs to the workspace
//!      (`workspace_user_groups` where `id = groupId AND ws_id = wsId`). Missing ->
//!      `404 { "message": "Group not found" }`, REST error -> `500`.
//!   4. Validate the module group belongs to the group
//!      (`workspace_course_module_groups` where `id = moduleGroupId AND
//!      group_id = groupId`). Missing -> `404 { "message": "Module group not found" }`,
//!      REST error -> `500`.
//!   5. Fetch `workspace_course_modules` where `group_id = groupId AND
//!      module_group_id = moduleGroupId`, ordered by `sort_key` (ascending, nulls
//!      last) then `created_at` (ascending). Returns the raw row array on `200`,
//!      REST error -> `500 { "message": "Error fetching workspace course modules" }`.
//!
//! Steps 3-5 use the Supabase service-role key, matching the legacy `sbAdmin`
//! (admin) client.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const MANAGE_USERS_PERMISSION: &str = "manage_users";

#[derive(Deserialize)]
struct IdRow {
    #[allow(dead_code)]
    id: Option<String>,
}

/// Matches
/// `/api/v1/workspaces/:wsId/user-groups/:groupId/module-groups/:moduleGroupId/modules`.
///
/// Returns `(raw_ws_id, group_id, module_group_id)` when the path shape matches.
fn module_modules_segments(path: &str) -> Option<(&str, &str, &str)> {
    let segments = path_segments(path);

    if segments.len() == 9
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && !segments[3].is_empty()
        && segments[4] == "user-groups"
        && !segments[5].is_empty()
        && segments[6] == "module-groups"
        && !segments[7].is_empty()
        && segments[8] == "modules"
    {
        Some((segments[3], segments[5], segments[7]))
    } else {
        None
    }
}

fn path_segments(path: &str) -> Vec<&str> {
    path.trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect()
}

pub(crate) async fn handle_workspaces_user_groups_module_modules_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, group_id, module_group_id) = module_modules_segments(request.path)?;

    Some(match request.method {
        "GET" => {
            module_modules_response(
                config,
                request,
                raw_ws_id,
                group_id,
                module_group_id,
                outbound,
            )
            .await
        }
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn module_modules_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    group_id: &str,
    module_group_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Step 1: validate route params (zod). `groupId`/`moduleGroupId` must be
    // UUIDs; `wsId` non-empty (guaranteed by the path matcher).
    if raw_ws_id.trim().is_empty()
        || !is_uuid_literal(group_id)
        || !is_uuid_literal(module_group_id)
    {
        return invalid_route_params_response();
    }

    // Step 2: validate workspace access + `manage_users` permission. The shared
    // helper handles ws normalization, membership, and effective permissions.
    let resolved_ws_id = match authorize_workspace_permission(
        contact_data,
        request,
        raw_ws_id,
        MANAGE_USERS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization.ws_id,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            // No session / invalid token. Legacy `withSessionAuth` rejects this
            // with `401` before the handler body runs.
            return message_response(401, "Unauthorized");
        }
        Err(WorkspacePermissionAuthorizationError::NotFound) => {
            // Helper returns NotFound when the caller has no membership (legacy:
            // 403 "You don't have access to this workspace") or the workspace
            // cannot be resolved. Map to 403 to match the dominant legacy path.
            return message_response(403, "You don't have access to this workspace");
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            // Member but missing `manage_users` permission.
            return message_response(403, "Insufficient permissions");
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, "Failed to verify workspace access");
        }
    };

    // Step 3: validate the group belongs to the workspace (service role).
    match service_role_single_id(
        contact_data,
        outbound,
        "workspace_user_groups",
        &[
            ("select", "id".to_owned()),
            ("id", format!("eq.{group_id}")),
            ("ws_id", format!("eq.{resolved_ws_id}")),
            ("limit", "1".to_owned()),
        ],
    )
    .await
    {
        Ok(true) => {}
        Ok(false) => return message_response(404, "Group not found"),
        Err(()) => return message_response(500, "Failed to validate group"),
    }

    // Step 4: validate the module group belongs to the group (service role).
    match service_role_single_id(
        contact_data,
        outbound,
        "workspace_course_module_groups",
        &[
            ("select", "id".to_owned()),
            ("id", format!("eq.{module_group_id}")),
            ("group_id", format!("eq.{group_id}")),
            ("limit", "1".to_owned()),
        ],
    )
    .await
    {
        Ok(true) => {}
        Ok(false) => return message_response(404, "Module group not found"),
        Err(()) => return message_response(500, "Failed to validate module group"),
    }

    // Step 5: fetch modules ordered by sort_key (nulls last) then created_at.
    match fetch_course_modules(contact_data, outbound, group_id, module_group_id).await {
        Ok(modules) => no_store_response(json_response(200, Value::Array(modules))),
        Err(()) => message_response(500, "Error fetching workspace course modules"),
    }
}

/// Returns `Ok(true)` when at least one row matches, `Ok(false)` when none, and
/// `Err(())` on REST/transport/decode failure (mapped to `500` by the caller).
async fn service_role_single_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    query: &[(&str, String)],
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(table, query) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(!response.json::<Vec<IdRow>>().map_err(|_| ())?.is_empty())
}

/// Fetches all columns of `workspace_course_modules` rows scoped to the group +
/// module group, ordered to match the legacy query. Returns the raw row objects.
async fn fetch_course_modules(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    group_id: &str,
    module_group_id: &str,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_course_modules",
        &[
            ("select", "*".to_owned()),
            ("group_id", format!("eq.{group_id}")),
            ("module_group_id", format!("eq.{module_group_id}")),
            // sort_key ascending with nulls last, then created_at ascending.
            ("order", "sort_key.asc.nullslast,created_at.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

async fn send_service_role_rest_request(
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

fn is_uuid_literal(value: &str) -> bool {
    let value = value.trim();
    value.len() == 36
        && value
            .chars()
            .enumerate()
            .all(|(index, character)| match index {
                8 | 13 | 18 | 23 => character == '-',
                _ => character.is_ascii_hexdigit(),
            })
}

fn invalid_route_params_response() -> BackendResponse {
    no_store_response(json_response(
        400,
        json!({ "message": "Invalid route params" }),
    ))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
