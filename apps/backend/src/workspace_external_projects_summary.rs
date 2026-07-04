use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const ADMIN_PERMISSION: &str = "admin";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const ENABLED_SECRET: &str = "EXTERNAL_PROJECT_ENABLED";
const CANONICAL_ID_SECRET: &str = "EXTERNAL_PROJECT_CANONICAL_ID";

const UNAVAILABLE_MESSAGE: &str = "External project studio unavailable for this workspace";
const SUMMARY_FAILED_MESSAGE: &str = "Failed to load external project summary";

const WORKSPACE_EXTERNAL_PROJECTS_SUMMARY_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACE_EXTERNAL_PROJECTS_SUMMARY_PATH_SUFFIX: &str = "/external-projects/summary";

const SCHEDULED_SOON_HORIZON_MS: i64 = 7 * 24 * 60 * 60 * 1000;
const ATTENTION_QUEUE_LIMIT: usize = 6;
const RECENT_ACTIVITY_LIMIT: usize = 5;

// ---------------------------------------------------------------------------
// Row models
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
struct WorkspaceRow {
    creator_id: Option<String>,
}

#[derive(Deserialize)]
struct PermissionRow {
    permission: Option<String>,
}

#[derive(Deserialize)]
struct BindingRow {
    canonical_project_id: Option<String>,
    is_enabled: Option<bool>,
}

#[derive(Deserialize)]
struct SecretRow {
    name: Option<String>,
    value: Option<String>,
}

#[derive(Deserialize)]
struct CanonicalProjectRow {
    adapter: Option<String>,
    is_active: Option<bool>,
}

#[derive(Deserialize)]
struct CollectionRow {
    id: String,
    slug: Option<String>,
    title: Option<String>,
    is_enabled: Option<bool>,
    config: Option<Value>,
}

#[derive(Deserialize)]
struct EntryRow {
    id: String,
    collection_id: Option<String>,
    status: Option<String>,
    scheduled_for: Option<String>,
    slug: Option<String>,
    summary: Option<String>,
    title: Option<String>,
    created_at: Option<String>,
}

#[derive(Deserialize)]
struct AssetRow {
    entry_id: Option<String>,
    asset_type: Option<String>,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspace_external_projects_summary_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspace_external_projects_summary_ws_id(request.path)?;

    Some(match request.method {
        "GET" => summary_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn summary_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return message_response(500, SUMMARY_FAILED_MESSAGE);
    }

    // Auth: Supabase user session (cookie or bearer). App-session / app-coordination
    // token flows from the legacy route are not supported here (see notes).
    let Some(access_token) = request_access_token(request) else {
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
            Err(()) => return message_response(500, SUMMARY_FAILED_MESSAGE),
        };

    let canonical_project = match canonical_id.as_deref() {
        Some(id) => match canonical_project_row(contact_data, outbound, id).await {
            Ok(project) => project,
            Err(()) => return message_response(500, SUMMARY_FAILED_MESSAGE),
        },
        None => None,
    };

    let canonical_active = canonical_project.as_ref().and_then(|p| p.is_active) == Some(true);
    let binding_enabled = enabled && canonical_id.is_some() && canonical_active;
    let adapter = if binding_enabled {
        canonical_project.as_ref().and_then(|p| p.adapter.clone())
    } else {
        None
    };

    // Mirror legacy access ordering: binding must be enabled with an active
    // canonical project (404) before permission errors surface for this surface.
    if !binding_enabled {
        return error_response(404, UNAVAILABLE_MESSAGE);
    }

    // Permission: read mode allowed when workspace has manage/publish external
    // projects, OR root workspace has manage_external_projects/manage_workspace_roles.
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
        Err(()) => return message_response(500, SUMMARY_FAILED_MESSAGE),
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
            Err(()) => return message_response(500, SUMMARY_FAILED_MESSAGE),
        };
        permission_set_allows(
            &root_permissions,
            &["manage_external_projects", "manage_workspace_roles"],
        )
    };

    if !allowed {
        return error_response(403, "Forbidden");
    }

    // Load studio data needed for the summary.
    let collections = match list_collections(contact_data, outbound, &resolved_ws_id).await {
        Ok(rows) => rows,
        Err(()) => return message_response(500, SUMMARY_FAILED_MESSAGE),
    };
    let entries = match list_entries(contact_data, outbound, &resolved_ws_id).await {
        Ok(rows) => rows,
        Err(()) => return message_response(500, SUMMARY_FAILED_MESSAGE),
    };
    let assets = match list_assets(contact_data, outbound, &resolved_ws_id).await {
        Ok(rows) => rows,
        Err(()) => return message_response(500, SUMMARY_FAILED_MESSAGE),
    };
    let import_jobs = match list_recent_rows(
        contact_data,
        outbound,
        "workspace_external_project_import_jobs",
        &resolved_ws_id,
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return message_response(500, SUMMARY_FAILED_MESSAGE),
    };
    let publish_events = match list_recent_rows(
        contact_data,
        outbound,
        "workspace_external_project_publish_events",
        &resolved_ws_id,
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return message_response(500, SUMMARY_FAILED_MESSAGE),
    };

    let summary = build_summary(BuildSummaryInput {
        adapter,
        canonical_project_id: canonical_id,
        workspace_id: &resolved_ws_id,
        collections,
        entries,
        assets,
        import_jobs,
        publish_events,
    });

    json_response(200, summary)
}

// ---------------------------------------------------------------------------
// Summary builder (mirrors buildExternalProjectSummary)
// ---------------------------------------------------------------------------

struct BuildSummaryInput<'a> {
    adapter: Option<String>,
    canonical_project_id: Option<String>,
    workspace_id: &'a str,
    collections: Vec<CollectionRow>,
    entries: Vec<EntryRow>,
    assets: Vec<AssetRow>,
    import_jobs: Vec<Value>,
    publish_events: Vec<Value>,
}

fn build_summary(input: BuildSummaryInput<'_>) -> Value {
    let BuildSummaryInput {
        adapter,
        canonical_project_id,
        workspace_id,
        collections,
        entries,
        assets,
        import_jobs,
        publish_events,
    } = input;

    let counts = json!({
        "archived": entries.iter().filter(|e| status_of(e) == "archived").count(),
        "collections": collections.len(),
        "drafts": entries.iter().filter(|e| status_of(e) == "draft").count(),
        "entries": entries.len(),
        "published": entries.iter().filter(|e| status_of(e) == "published").count(),
        "scheduled": entries.iter().filter(|e| status_of(e) == "scheduled").count(),
    });

    let collection_summaries: Vec<Value> = collections
        .iter()
        .map(|collection| {
            let collection_entries: Vec<&EntryRow> = entries
                .iter()
                .filter(|entry| entry.collection_id.as_deref() == Some(collection.id.as_str()))
                .collect();

            json!({
                "archivedEntries": collection_entries
                    .iter()
                    .filter(|e| status_of(e) == "archived")
                    .count(),
                "draftEntries": collection_entries
                    .iter()
                    .filter(|e| status_of(e) == "draft")
                    .count(),
                "id": collection.id,
                "isEnabled": collection.is_enabled.unwrap_or(false),
                "publishedEntries": collection_entries
                    .iter()
                    .filter(|e| status_of(e) == "published")
                    .count(),
                "scheduledEntries": collection_entries
                    .iter()
                    .filter(|e| status_of(e) == "scheduled")
                    .count(),
                "slug": collection.slug,
                "title": collection.title,
                "totalEntries": collection_entries.len(),
            })
        })
        .collect();

    let collection_by_id = |id: Option<&str>| -> Option<&CollectionRow> {
        id.and_then(|id| collections.iter().find(|c| c.id == id))
    };

    // scheduledSoon: scheduled entries with scheduled_for within the next 7 days,
    // sorted ascending by scheduled_for string, first 6.
    let scheduled_cutoff = now_millis().map(|now| now + SCHEDULED_SOON_HORIZON_MS);
    let mut scheduled_candidates: Vec<&EntryRow> = entries
        .iter()
        .filter(|entry| {
            status_of(entry) == "scheduled"
                && entry
                    .scheduled_for
                    .as_deref()
                    .map(|value| !value.is_empty())
                    .unwrap_or(false)
                && match (scheduled_cutoff, entry.scheduled_for.as_deref()) {
                    (Some(cutoff), Some(value)) => parse_date_millis(value)
                        .map(|millis| millis <= cutoff)
                        .unwrap_or(false),
                    _ => false,
                }
        })
        .collect();
    scheduled_candidates.sort_by(|a, b| {
        a.scheduled_for
            .as_deref()
            .unwrap_or_default()
            .cmp(b.scheduled_for.as_deref().unwrap_or_default())
    });
    let scheduled_soon: Vec<Value> = scheduled_candidates
        .into_iter()
        .take(ATTENTION_QUEUE_LIMIT)
        .map(|entry| {
            attention_item(
                entry,
                collection_by_id(entry.collection_id.as_deref()),
                format!(
                    "Scheduled for {}",
                    format_attention_date(entry.scheduled_for.as_deref())
                ),
                "scheduled_soon",
            )
        })
        .collect();

    // draftsMissingMedia: non-archived entries missing required asset types.
    let drafts_missing_media: Vec<Value> = entries
        .iter()
        .filter(|entry| status_of(entry) != "archived")
        .filter_map(|entry| {
            let collection = collection_by_id(entry.collection_id.as_deref());
            let required = required_collection_asset_types(collection);
            let missing: Vec<String> = required
                .into_iter()
                .filter(|asset_type| {
                    !assets.iter().any(|asset| {
                        asset.entry_id.as_deref() == Some(entry.id.as_str())
                            && asset.asset_type.as_deref() == Some(asset_type.as_str())
                    })
                })
                .collect();
            if missing.is_empty() {
                None
            } else {
                Some((entry, collection, missing))
            }
        })
        .take(ATTENTION_QUEUE_LIMIT)
        .map(|(entry, collection, missing)| {
            attention_item(
                entry,
                collection,
                format_missing_media_reason(&missing),
                "missing_media",
            )
        })
        .collect();

    // recentlyImportedUnpublished: non-published entries created at/after latest import.
    let latest_import = import_jobs
        .first()
        .and_then(|job| job.get("created_at"))
        .and_then(Value::as_str)
        .and_then(parse_date_millis);
    let recently_imported_unpublished: Vec<Value> = entries
        .iter()
        .filter(|entry| status_of(entry) != "published")
        .filter(|entry| match (latest_import, entry.created_at.as_deref()) {
            (Some(latest), Some(created_at)) => parse_date_millis(created_at)
                .map(|created| created >= latest)
                .unwrap_or(false),
            _ => false,
        })
        .take(ATTENTION_QUEUE_LIMIT)
        .map(|entry| {
            attention_item(
                entry,
                collection_by_id(entry.collection_id.as_deref()),
                "Imported recently but still not published".to_owned(),
                "recently_imported_unpublished",
            )
        })
        .collect();

    // archivedBacklog: archived entries, first 6.
    let archived_backlog: Vec<Value> = entries
        .iter()
        .filter(|entry| status_of(entry) == "archived")
        .take(ATTENTION_QUEUE_LIMIT)
        .map(|entry| {
            attention_item(
                entry,
                collection_by_id(entry.collection_id.as_deref()),
                "Archived and available for recovery or cleanup".to_owned(),
                "archived_backlog",
            )
        })
        .collect();

    let recent_import_jobs: Vec<Value> = import_jobs
        .into_iter()
        .take(RECENT_ACTIVITY_LIMIT)
        .collect();
    let recent_publish_events: Vec<Value> = publish_events
        .into_iter()
        .take(RECENT_ACTIVITY_LIMIT)
        .collect();

    json!({
        "adapter": adapter,
        "canonicalProjectId": canonical_project_id,
        "collections": collection_summaries,
        "counts": counts,
        "queues": {
            "archivedBacklog": archived_backlog,
            "draftsMissingMedia": drafts_missing_media,
            "recentlyImportedUnpublished": recently_imported_unpublished,
            "scheduledSoon": scheduled_soon,
        },
        "recentActivity": {
            "importJobs": recent_import_jobs,
            "publishEvents": recent_publish_events,
        },
        "workspaceId": workspace_id,
    })
}

fn status_of(entry: &EntryRow) -> &str {
    entry.status.as_deref().unwrap_or_default()
}

fn attention_item(
    entry: &EntryRow,
    collection: Option<&CollectionRow>,
    detail: String,
    kind: &str,
) -> Value {
    json!({
        "collectionId": entry.collection_id,
        "collectionTitle": collection
            .and_then(|c| c.title.clone())
            .unwrap_or_else(|| "Unknown collection".to_owned()),
        "detail": detail,
        "entryId": entry.id,
        "kind": kind,
        "scheduledFor": entry.scheduled_for,
        "slug": entry.slug,
        "status": entry.status,
        "summary": entry.summary,
        "title": entry.title,
    })
}

/// Mirrors getRequiredCollectionAssetTypes: reads collection.config.schema.assetTypes.
/// No schema or missing assetTypes key => ["image"]. Array => supported subset.
/// Non-array => [].
fn required_collection_asset_types(collection: Option<&CollectionRow>) -> Vec<String> {
    let Some(schema) = collection
        .and_then(|c| c.config.as_ref())
        .and_then(|config| config.get("schema"))
        .filter(|schema| schema.is_object())
    else {
        return vec!["image".to_owned()];
    };

    match schema.get("assetTypes") {
        None => vec!["image".to_owned()],
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(Value::as_str)
            .filter(|value| *value == "image" || *value == "audio")
            .map(|value| value.to_owned())
            .collect(),
        Some(_) => Vec::new(),
    }
}

fn format_missing_media_reason(asset_types: &[String]) -> String {
    if asset_types.len() == 1 && asset_types[0] == "audio" {
        return "Missing an audio asset".to_owned();
    }
    if asset_types.len() == 1 && asset_types[0] == "image" {
        return "Missing a primary image asset".to_owned();
    }
    format!("Missing required {} assets", asset_types.join(" and "))
}

// ---------------------------------------------------------------------------
// Binding / studio data queries
// ---------------------------------------------------------------------------

async fn read_binding_state(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<(Option<String>, bool), ()> {
    // Prefer first-class bindings table.
    if let Some(url) = contact_data.rest_url(
        "workspace_external_project_bindings",
        &[
            ("select", "canonical_project_id,is_enabled".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) && let Ok(response) = send_service_role_request(contact_data, outbound, &url).await
        && is_success(response.status)
        && let Ok(Some(row)) = decode_first_row::<BindingRow>(&response)
    {
        return Ok((row.canonical_project_id, row.is_enabled == Some(true)));
    }
    // Any binding-table failure falls through to the secrets dual-read.

    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "name,value".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            (
                "name",
                format!("in.({ENABLED_SECRET},{CANONICAL_ID_SECRET})"),
            ),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<SecretRow>>().map_err(|_| ())?;
    let canonical_id = rows
        .iter()
        .find(|row| row.name.as_deref() == Some(CANONICAL_ID_SECRET))
        .and_then(|row| row.value.clone());
    let enabled = rows.iter().any(|row| {
        row.name.as_deref() == Some(ENABLED_SECRET) && row.value.as_deref() == Some("true")
    });

    Ok((canonical_id, enabled))
}

async fn canonical_project_row(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    canonical_id: &str,
) -> Result<Option<CanonicalProjectRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "canonical_external_projects",
        &[
            ("select", "adapter,is_active".to_owned()),
            ("id", format!("eq.{canonical_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    decode_first_row::<CanonicalProjectRow>(&response)
}

async fn list_collections(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<CollectionRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_external_project_collections",
        &[
            ("select", "id,slug,title,is_enabled,config".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("order", "title.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response.json::<Vec<CollectionRow>>().map_err(|_| ())
}

async fn list_entries(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<EntryRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_external_project_entries",
        &[
            (
                "select",
                "id,collection_id,status,scheduled_for,slug,summary,title,created_at".to_owned(),
            ),
            ("ws_id", format!("eq.{ws_id}")),
            ("order", "sort_order.asc,created_at.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response.json::<Vec<EntryRow>>().map_err(|_| ())
}

async fn list_assets(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<AssetRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_external_project_assets",
        &[
            ("select", "entry_id,asset_type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response.json::<Vec<AssetRow>>().map_err(|_| ())
}

async fn list_recent_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    ws_id: &str,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        table,
        &[
            ("select", "*".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("order", "created_at.desc".to_owned()),
            ("limit", "10".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response.json::<Vec<Value>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Permissions (mirrors getPermissions composition used by access.ts)
// ---------------------------------------------------------------------------

struct EffectivePermissions {
    has_all_permissions: bool,
    permissions: Vec<String>,
}

fn permission_set_allows(permissions: &EffectivePermissions, wanted: &[&str]) -> bool {
    permissions.has_all_permissions
        || wanted
            .iter()
            .any(|wanted| permissions.permissions.iter().any(|value| value == wanted))
}

async fn effective_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<EffectivePermissions, ()> {
    let membership_type =
        workspace_membership_type(contact_data, outbound, ws_id, user_id, access_token)
            .await?
            .unwrap_or_default();

    if membership_type.is_empty() {
        return Ok(EffectivePermissions {
            has_all_permissions: false,
            permissions: Vec::new(),
        });
    }

    let workspace = workspace_row(contact_data, outbound, ws_id).await?;
    let is_creator = membership_type == "MEMBER"
        && workspace.as_ref().and_then(|row| row.creator_id.as_deref()) == Some(user_id);

    let role_permissions = if membership_type == "MEMBER" {
        workspace_role_permissions(contact_data, outbound, ws_id, user_id).await?
    } else {
        Vec::new()
    };
    let default_permissions =
        workspace_default_permissions(contact_data, outbound, ws_id, &membership_type).await?;

    let mut permissions = Vec::new();
    extend_unique(&mut permissions, role_permissions);
    extend_unique(&mut permissions, default_permissions);

    Ok(EffectivePermissions {
        has_all_permissions: is_creator
            || permissions.iter().any(|value| value == ADMIN_PERMISSION),
        permissions,
    })
}

async fn workspace_membership_type(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
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
    let response = send_caller_request(contact_data, outbound, &url, access_token).await?;
    if !is_success(response.status) {
        return Ok(None);
    }
    Ok(decode_first_row::<WorkspaceMembershipRow>(&response)?
        .map(|row| row.membership_type.unwrap_or_else(|| "MEMBER".to_owned())))
}

async fn workspace_row(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Option<WorkspaceRow>, ()> {
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
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Ok(None);
    }
    decode_first_row::<WorkspaceRow>(&response)
}

async fn workspace_role_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_role_members",
        &[
            (
                "select",
                "workspace_roles!inner(workspace_role_permissions(permission))".to_owned(),
            ),
            ("user_id", format!("eq.{user_id}")),
            ("workspace_roles.ws_id", format!("eq.{ws_id}")),
            (
                "workspace_roles.workspace_role_permissions.enabled",
                "eq.true".to_owned(),
            ),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Ok(Vec::new());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    let mut permissions = Vec::new();
    for row in &rows {
        collect_role_permissions(row, &mut permissions);
    }
    Ok(permissions)
}

async fn workspace_default_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    membership_type: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_default_permissions",
        &[
            ("select", "permission".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("member_type", format!("eq.{membership_type}")),
            ("enabled", "eq.true".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Ok(Vec::new());
    }
    Ok(response
        .json::<Vec<PermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
}

fn collect_role_permissions(value: &Value, permissions: &mut Vec<String>) {
    match value {
        Value::Array(items) => {
            for item in items {
                collect_role_permissions(item, permissions);
            }
        }
        Value::Object(map) => {
            if let Some(permission) = map.get("permission").and_then(Value::as_str) {
                permissions.push(permission.to_owned());
            }
            if let Some(role_permissions) = map.get("workspace_role_permissions") {
                collect_role_permissions(role_permissions, permissions);
            }
            if let Some(workspace_roles) = map.get("workspace_roles") {
                collect_role_permissions(workspace_roles, permissions);
            }
        }
        _ => {}
    }
}

fn extend_unique(permissions: &mut Vec<String>, values: Vec<String>) {
    for permission in values {
        if !permissions.iter().any(|value| value == &permission) {
            permissions.push(permission);
        }
    }
}

// ---------------------------------------------------------------------------
// Workspace id normalization
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
        if !is_workspace_handle_candidate(&handle) {
            return Ok(resolved_ws_id);
        }

        if let Some(workspace_id) = workspace_id_by_handle(contact_data, outbound, &handle).await? {
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
    let response = send_caller_request(contact_data, outbound, &url, access_token).await?;
    if !is_success(response.status) {
        return Err(());
    }
    decode_first_row::<WorkspaceIdRow>(&response)?
        .and_then(|row| row.id)
        .ok_or(())
}

async fn workspace_id_by_handle(
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
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Ok(None);
    }
    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async fn send_caller_request(
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

async fn send_service_role_request(
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

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

fn request_access_token(request: BackendRequest<'_>) -> Option<String> {
    supabase_auth::request_access_token(request)
}

fn workspace_external_projects_summary_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACE_EXTERNAL_PROJECTS_SUMMARY_PATH_PREFIX)?
        .strip_suffix(WORKSPACE_EXTERNAL_PROJECTS_SUMMARY_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
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

fn is_workspace_handle_candidate(value: &str) -> bool {
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

fn decode_first_row<T: for<'de> Deserialize<'de>>(
    response: &OutboundResponse,
) -> Result<Option<T>, ()> {
    response
        .json::<Vec<T>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

/// Parse an ISO-8601 / RFC3339-ish timestamp into epoch milliseconds (UTC).
/// Used only for relative ordering, so a best-effort parser is sufficient.
fn parse_date_millis(value: &str) -> Option<i64> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }

    let bytes = value.as_bytes();
    let take =
        |range: std::ops::Range<usize>| -> Option<i64> { value.get(range)?.parse::<i64>().ok() };

    if bytes.len() < 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return None;
    }

    let year = take(0..4)?;
    let month = take(5..7)?;
    let day = take(8..10)?;

    let (mut hour, mut minute, mut second, mut millis) = (0i64, 0i64, 0i64, 0i64);
    if bytes.len() >= 19 && (bytes[10] == b'T' || bytes[10] == b' ') {
        hour = take(11..13)?;
        minute = take(14..16)?;
        second = take(17..19)?;
        if bytes.len() >= 23
            && bytes[19] == b'.'
            && let Some(frac) = value.get(20..23)
            && let Ok(parsed) = frac.parse::<i64>()
        {
            millis = parsed;
        }
    }

    let days = days_from_civil(year, month, day);
    Some(((days * 86_400 + hour * 3600 + minute * 60 + second) * 1000) + millis)
}

/// Days from 1970-01-01 (Howard Hinnant's days_from_civil algorithm).
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn now_millis() -> Option<i64> {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as i64)
}

/// Mirrors formatAttentionDate: legacy uses toLocaleString('en-US', {month:'short',
/// day:'2-digit', hour:'2-digit', minute:'2-digit'}). We render a stable,
/// locale-independent approximation since Workers have no ICU locale data.
fn format_attention_date(value: Option<&str>) -> String {
    match value {
        None => "No schedule".to_owned(),
        Some(value) if value.trim().is_empty() => "No schedule".to_owned(),
        Some(value) => value.to_owned(),
    }
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    json_response(status, json!({ "error": message }))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    json_response(status, json!({ "error": message }))
}
