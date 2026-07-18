//! Port of the legacy `GET /api/v1/workspaces/:wsId/external-projects` route.
//!
//! Legacy source:
//! `apps/web/src/app/api/v1/workspaces/[wsId]/external-projects/route.ts`
//!
//! The legacy handler composes three libraries:
//!   - `requireWorkspaceExternalProjectAccess({ mode: 'read', ... })` (access.ts)
//!   - `getWorkspaceExternalProjectStudioData(...)` (store.ts)
//!   - `getExternalProjectCmsEditorCapabilities(...)` (cms-capabilities.ts)
//!
//! and returns `{ binding, ...studio, cmsCapabilities }`.
//!
//! Auth note: the legacy access helper also supports app-coordination tokens and
//! app-session (`cms`) tokens. This port mirrors the *Supabase user session*
//! branch only (cookie or bearer), matching the approach already taken by the
//! sibling `workspace_external_projects_summary` handler. App-token / app-session
//! flows must continue to be served by the legacy Next.js route until ported.

pub(super) use serde::Deserialize;
pub(super) use serde_json::{Map, Value, json};

pub(super) use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

mod cms;
mod db;
mod delivery;
mod helpers;
mod permissions;
mod scope;

use cms::*;
use db::*;
use delivery::*;
use helpers::*;
use permissions::*;
use scope::*;

pub(super) const ADMIN_PERMISSION: &str = "admin";
pub(super) const INTERNAL_WORKSPACE_SLUG: &str = "internal";
pub(super) const PERSONAL_WORKSPACE_SLUG: &str = "personal";
pub(super) const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

pub(super) const ENABLED_SECRET: &str = "EXTERNAL_PROJECT_ENABLED";
pub(super) const CANONICAL_ID_SECRET: &str = "EXTERNAL_PROJECT_CANONICAL_ID";

const UNAVAILABLE_MESSAGE: &str = "External project studio unavailable for this workspace";
const FAILED_MESSAGE: &str = "Failed to load external project studio";

pub(super) const PATH_PREFIX: &str = "/api/v1/workspaces/";
pub(super) const PATH_SUFFIX: &str = "/external-projects";

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_external_projects_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_external_projects_ws_id(request.path)?;

    Some(match request.method {
        "GET" => studio_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn studio_response(
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

    let collection_slugs = match parse_collection_slugs(request.url) {
        Ok(slugs) => slugs,
        Err(()) => return error_response(400, "Invalid collectionSlugs query"),
    };

    // ----- Load studio data (mirrors getWorkspaceExternalProjectStudioData) ----

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

    let relation_definitions = match list_rows(
        contact_data,
        outbound,
        "workspace_external_project_relation_definitions",
        &resolved_ws_id,
        &[("order", "sort_order.asc,key.asc".to_owned())],
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return error_response(500, FAILED_MESSAGE),
    };
    let relation_definition_targets = match list_rows(
        contact_data,
        outbound,
        "workspace_external_project_relation_definition_targets",
        &resolved_ws_id,
        &[],
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return error_response(500, FAILED_MESSAGE),
    };
    let all_relations = match list_rows(
        contact_data,
        outbound,
        "workspace_external_project_entry_relations",
        &resolved_ws_id,
        &[("order", "sort_order.asc,created_at.asc".to_owned())],
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return error_response(500, FAILED_MESSAGE),
    };
    let scope = (!collection_slugs.is_empty()).then(|| {
        StudioScope::from_rows(
            &collection_slugs,
            &collections,
            &relation_definitions,
            &relation_definition_targets,
        )
    });
    let entry_scope_params = scope
        .as_ref()
        .map(|scope| vec![("collection_id", scope.collection_filter())])
        .unwrap_or_default();

    // entries: includeDrafts => no status filter; ordered sort_order asc, created_at asc.
    let entries = match list_rows(
        contact_data,
        outbound,
        "workspace_external_project_entries",
        &resolved_ws_id,
        &[
            entry_scope_params.as_slice(),
            &[("order", "sort_order.asc,created_at.asc".to_owned())],
        ]
        .concat(),
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return error_response(500, FAILED_MESSAGE),
    };

    // fieldDefinitions: includeDisabled => no is_enabled filter, no collectionId
    // option (Object.hasOwn is false). Ordered sort_order asc, created_at asc.
    let field_scope_params = scope
        .as_ref()
        .map(|scope| vec![("collection_id", scope.source_collection_filter())])
        .unwrap_or_default();
    let field_definitions = match list_rows(
        contact_data,
        outbound,
        "workspace_external_project_field_definitions",
        &resolved_ws_id,
        &[
            field_scope_params.as_slice(),
            &[("order", "sort_order.asc,created_at.asc".to_owned())],
        ]
        .concat(),
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return error_response(500, FAILED_MESSAGE),
    };

    let import_jobs = if scope.is_some() {
        Vec::new()
    } else {
        match list_recent_rows(
            contact_data,
            outbound,
            "workspace_external_project_import_jobs",
            &resolved_ws_id,
        )
        .await
        {
            Ok(rows) => rows,
            Err(()) => return error_response(500, FAILED_MESSAGE),
        }
    };
    let publish_events = if scope.is_some() {
        Vec::new()
    } else {
        match list_recent_rows(
            contact_data,
            outbound,
            "workspace_external_project_publish_events",
            &resolved_ws_id,
        )
        .await
        {
            Ok(rows) => rows,
            Err(()) => return error_response(500, FAILED_MESSAGE),
        }
    };

    let entry_ids: Vec<String> = entries
        .iter()
        .filter(|entry| {
            scope.as_ref().is_none_or(|scope| {
                entry
                    .get("collection_id")
                    .and_then(Value::as_str)
                    .is_some_and(|id| scope.source_collection_ids.contains(id))
            })
        })
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
    let raw_assets = match list_rows_by_entry_ids(
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

    // assets: clone each row and inject asset_url + preview_url.
    let assets: Vec<Value> = raw_assets
        .into_iter()
        .map(|asset| decorate_asset(&resolved_ws_id, asset))
        .collect();

    // loadingData: built from delivery collections (collection -> entries ->
    // {assets, blocks}). adapter is the first entry's source_adapter (or null).
    let response_collections: Vec<Value> = collections
        .into_iter()
        .filter(|collection| {
            scope
                .as_ref()
                .is_none_or(|scope| scope.includes_collection(collection))
        })
        .collect();
    let response_relation_definitions: Vec<Value> = relation_definitions
        .into_iter()
        .filter(|definition| {
            scope
                .as_ref()
                .is_none_or(|scope| scope.includes_definition(definition))
        })
        .collect();
    let response_relation_definition_targets: Vec<Value> = relation_definition_targets
        .into_iter()
        .filter(|target| {
            scope
                .as_ref()
                .is_none_or(|scope| scope.includes_target(target))
        })
        .collect();
    let source_entry_ids: std::collections::HashSet<&str> =
        entry_ids.iter().map(String::as_str).collect();
    let relations: Vec<Value> = all_relations
        .into_iter()
        .filter(|relation| {
            scope.as_ref().is_none_or(|_| {
                relation
                    .get("from_entry_id")
                    .and_then(Value::as_str)
                    .is_some_and(|id| source_entry_ids.contains(id))
            })
        })
        .collect();
    let first_entry_source_adapter = entries
        .first()
        .and_then(|entry| entry.get("source_adapter"))
        .and_then(Value::as_str)
        .map(str::to_owned);
    let delivery_collections =
        build_delivery_collections(&response_collections, &entries, &assets, &blocks);
    let loading_data =
        build_loading_data(first_entry_source_adapter.as_deref(), &delivery_collections);

    // cmsCapabilities: built from binding + collections + fieldDefinitions.
    let binding = json!({
        "adapter": adapter,
        "canonical_id": canonical_id,
        "canonical_project": canonical_project,
        "enabled": binding_enabled,
        "workspace_id": resolved_ws_id,
    });
    let cms_capabilities = build_cms_capabilities(&binding, &response_collections);

    // Final payload: { binding, ...studio, cmsCapabilities }.
    let body = json!({
        "binding": binding,
        "assets": assets,
        "blocks": blocks,
        "collections": response_collections,
        "entries": entries,
        "fieldDefinitions": field_definitions,
        "importJobs": import_jobs,
        "loadingData": loading_data,
        "publishEvents": publish_events,
        "relationDefinitions": response_relation_definitions,
        "relationDefinitionTargets": response_relation_definition_targets,
        "relations": relations,
        "cmsCapabilities": cms_capabilities,
    });

    json_response(200, body)
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    json_response(status, json!({ "error": message }))
}
