//! Port of the legacy
//! `GET /api/v1/workspaces/:wsId/external-projects/sync/snapshot` route.
//!
//! Legacy source:
//! `apps/web/src/app/api/v1/workspaces/[wsId]/external-projects/sync/snapshot/route.ts`
//!
//! The legacy handler composes:
//!   - `requireWorkspaceExternalProjectAccess({ mode: 'read', ... })` (access.ts)
//!   - `getWorkspaceExternalProjectSyncSnapshot({ binding, workspaceId }, admin)`
//!     (sync.ts) which itself loads `getWorkspaceExternalProjectStudioData`
//!     (store.ts) and runs `buildExternalProjectSyncSnapshot`.
//!
//! and returns the snapshot object verbatim (`NextResponse.json(snapshot)`), or
//! `{ error: 'Failed to load external project sync snapshot' }` with status 500
//! on failure.
//!
//! Auth note: the legacy access helper also supports app-coordination tokens and
//! app-session (`cms`) tokens. This port mirrors the *Supabase user session*
//! branch only (cookie or bearer), matching the approach already taken by the
//! sibling `workspaces_external_projects` handler. App-token / app-session flows
//! must continue to be served by the legacy Next.js route until ported.
//!
//! The access/normalize/binding/permission machinery is a direct copy of the
//! sibling `workspaces_external_projects.rs` handler (same route prefix, same
//! `mode: 'read'` access policy). The only behavioural difference is the body:
//! this handler emits `buildExternalProjectSyncSnapshot(...)` instead of the
//! studio payload.

pub(super) use serde::Deserialize;
pub(super) use serde_json::{Map, Value, json};

pub(super) use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

mod db;
mod permissions;
mod schema_helpers;
mod snapshot;
mod value_helpers;

use db::*;
use permissions::*;
use schema_helpers::*;
use snapshot::*;
use value_helpers::*;

pub(super) const ADMIN_PERMISSION: &str = "admin";
pub(super) const INTERNAL_WORKSPACE_SLUG: &str = "internal";
pub(super) const PERSONAL_WORKSPACE_SLUG: &str = "personal";
pub(super) const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

pub(super) const ENABLED_SECRET: &str = "EXTERNAL_PROJECT_ENABLED";
pub(super) const CANONICAL_ID_SECRET: &str = "EXTERNAL_PROJECT_CANONICAL_ID";

const UNAVAILABLE_MESSAGE: &str = "External project studio unavailable for this workspace";
const FAILED_MESSAGE: &str = "Failed to load external project sync snapshot";

pub(super) const PATH_PREFIX: &str = "/api/v1/workspaces/";
pub(super) const PATH_SUFFIX: &str = "/external-projects/sync/snapshot";

pub(super) const DEFAULT_ADAPTER: &str = "yoola";

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_external_projects_sync_snapshot_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_external_projects_sync_snapshot_ws_id(request.path)?;

    Some(match request.method {
        "GET" => snapshot_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn snapshot_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return error_response(500, FAILED_MESSAGE);
    }

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, "Unauthorized");
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, "Unauthorized");
    };

    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(()) => return error_response(401, "Unauthorized"),
        };

    // Resolve binding (dual-read: bindings table then secrets fallback).
    let (canonical_id, enabled) =
        match read_binding_state(contact_data, outbound, &resolved_ws_id).await {
            Ok(state) => state,
            Err(()) => return error_response(500, FAILED_MESSAGE),
        };

    let canonical_project = match canonical_id.as_deref() {
        Some(id) => match canonical_project_row(contact_data, outbound, id).await {
            Ok(project) => project,
            Err(()) => return error_response(500, FAILED_MESSAGE),
        },
        None => None,
    };

    let canonical_active = canonical_project
        .as_ref()
        .and_then(|p| p.get("is_active"))
        .and_then(Value::as_bool)
        == Some(true);
    let binding_enabled = enabled && canonical_id.is_some() && canonical_active;
    let adapter = if binding_enabled {
        canonical_project
            .as_ref()
            .and_then(|p| p.get("adapter"))
            .and_then(Value::as_str)
            .map(str::to_owned)
    } else {
        None
    };

    // Mirror legacy access ordering: binding must be enabled with an active
    // canonical project (404) before permission errors surface.
    if !binding_enabled {
        return error_response(404, UNAVAILABLE_MESSAGE);
    }

    // Permission: read mode allowed when workspace grants manage/publish external
    // projects, OR root workspace grants manage_external_projects /
    // manage_workspace_roles.
    let workspace_permissions = match effective_permissions(
        contact_data,
        outbound,
        &resolved_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(permissions) => permissions,
        Err(()) => return error_response(500, FAILED_MESSAGE),
    };

    let workspace_allowed = permission_set_allows(
        &workspace_permissions,
        &["manage_external_projects", "publish_external_projects"],
    );

    let allowed = if workspace_allowed {
        true
    } else {
        let root_permissions = match effective_permissions(
            contact_data,
            outbound,
            ROOT_WORKSPACE_ID,
            &user_id,
            &access_token,
        )
        .await
        {
            Ok(permissions) => permissions,
            Err(()) => return error_response(500, FAILED_MESSAGE),
        };
        permission_set_allows(
            &root_permissions,
            &["manage_external_projects", "manage_workspace_roles"],
        )
    };

    if !allowed {
        return error_response(403, "Forbidden");
    }

    // ----- Load raw studio data (mirrors getWorkspaceExternalProjectStudioData;
    // the snapshot builder consumes collections/entries/blocks/assets/
    // fieldDefinitions only, not the delivery loadingData). ----

    let collections = match list_rows(
        contact_data,
        outbound,
        "workspace_external_project_collections",
        &resolved_ws_id,
        &[("order", "title.asc".to_owned())],
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return error_response(500, FAILED_MESSAGE),
    };

    // entries: includeDrafts => no status filter; ordered sort_order asc, created_at asc.
    let entries = match list_rows(
        contact_data,
        outbound,
        "workspace_external_project_entries",
        &resolved_ws_id,
        &[("order", "sort_order.asc,created_at.asc".to_owned())],
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return error_response(500, FAILED_MESSAGE),
    };

    // fieldDefinitions: includeDisabled => no is_enabled filter, no collectionId
    // option. Ordered sort_order asc, created_at asc.
    let field_definitions = match list_rows(
        contact_data,
        outbound,
        "workspace_external_project_field_definitions",
        &resolved_ws_id,
        &[("order", "sort_order.asc,created_at.asc".to_owned())],
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return error_response(500, FAILED_MESSAGE),
    };

    let entry_ids: Vec<String> = entries
        .iter()
        .filter_map(|entry| entry.get("id").and_then(Value::as_str).map(str::to_owned))
        .collect();

    let blocks = match list_rows_by_entry_ids(
        contact_data,
        outbound,
        "workspace_external_project_blocks",
        &resolved_ws_id,
        &entry_ids,
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return error_response(500, FAILED_MESSAGE),
    };
    let assets = match list_rows_by_entry_ids(
        contact_data,
        outbound,
        "workspace_external_project_assets",
        &resolved_ws_id,
        &entry_ids,
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return error_response(500, FAILED_MESSAGE),
    };

    let binding = json!({
        "adapter": adapter,
        "canonical_id": canonical_id,
        "canonical_project": canonical_project,
        "enabled": binding_enabled,
        "workspace_id": resolved_ws_id,
    });

    let snapshot = build_external_project_sync_snapshot(
        &binding,
        &resolved_ws_id,
        &collections,
        &entries,
        &blocks,
        &assets,
        &field_definitions,
    );

    json_response(200, snapshot)
}

fn workspaces_external_projects_sync_snapshot_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    // ws_id must be a single path segment.
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    json_response(status, json!({ "error": message }))
}
