//! Public delivery endpoint for workspace external projects.
//!
//! Ports `apps/web/src/app/api/v1/workspaces/[wsId]/external-projects/delivery/route.ts`.
//!
//! Only the public (non-`preview`) GET path is ported here. The `?preview=true`
//! branch in the legacy route requires `requireWorkspaceExternalProjectAccess`
//! (app-session JWTs, app-coordination tokens, and the workspace permissions
//! engine), which is not available in this backend framework. For that branch
//! we return `None` so the request falls through to the legacy Next.js app.
//!
//! The public path uses the service-role REST credentials exclusively (the
//! legacy route uses `createAdminClient()` with no caller auth), so there is no
//! membership/permission check here — delivery is public for enabled
//! workspaces.

use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

mod loading;
#[cfg(test)]
mod tests;

use loading::{as_json_object_value, build_loading_data};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/external-projects/delivery";

const EXTERNAL_PROJECT_ENABLED_SECRET: &str = "EXTERNAL_PROJECT_ENABLED";
const EXTERNAL_PROJECT_CANONICAL_ID_SECRET: &str = "EXTERNAL_PROJECT_CANONICAL_ID";

const UNAVAILABLE_MESSAGE: &str = "External project delivery unavailable for this workspace";
const FAILURE_MESSAGE: &str = "Failed to build external project delivery payload";
const PUBLIC_DELIVERY_CACHE_CONTROL: &str =
    "public, max-age=0, s-maxage=86400, stale-while-revalidate=43200";

pub(crate) async fn handle_workspaces_external_projects_delivery_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = delivery_ws_id(request.path)?;

    // `?preview=true` is not portable (requires the permissions engine + app
    // tokens). Fall through to the legacy Next.js app for previews.
    if preview_requested(request.url) {
        return None;
    }

    Some(match request.method {
        "GET" => delivery_response(config, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn delivery_response(
    config: &BackendConfig,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    let binding = match resolve_binding(contact_data, outbound, ws_id).await {
        Ok(binding) => binding,
        Err(()) => return error_response(500, FAILURE_MESSAGE),
    };

    // Mirror `if (!binding.enabled || !binding.canonical_project)`.
    if !binding.enabled || binding.canonical_project.is_none() {
        return error_response(404, UNAVAILABLE_MESSAGE);
    }

    match build_delivery_payload(contact_data, outbound, ws_id, &binding).await {
        Ok(payload) => public_delivery_response(payload, ws_id),
        Err(()) => error_response(500, FAILURE_MESSAGE),
    }
}

// --- Binding resolution ------------------------------------------------------

struct ResolvedBinding {
    enabled: bool,
    canonical_id: Option<String>,
    /// Adapter copied from the canonical project row (`null` when missing).
    adapter: Option<String>,
    /// The canonical project row as a raw JSON object, present only when
    /// `enabled && canonical_project.is_active` (mirrors the legacy gating).
    canonical_project: Option<Value>,
}

async fn resolve_binding(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<ResolvedBinding, ()> {
    let (canonical_id, enabled) = read_binding_state(contact_data, outbound, ws_id).await?;

    let mut adapter: Option<String> = None;
    let mut canonical_project_row: Option<Value> = None;

    if let Some(canonical_id) = canonical_id.as_deref()
        && let Some(row) = fetch_canonical_project(contact_data, outbound, canonical_id).await
    {
        adapter = row
            .get("adapter")
            .and_then(Value::as_str)
            .map(str::to_owned);
        canonical_project_row = Some(row);
    }

    let is_active = canonical_project_row
        .as_ref()
        .and_then(|row| row.get("is_active"))
        .and_then(Value::as_bool)
        .unwrap_or(false);

    // `canonical_project: enabled && canonical_project?.is_active ? row : null`.
    let canonical_project = if enabled && is_active {
        canonical_project_row
    } else {
        None
    };

    // `enabled: enabled && Boolean(canonicalId) && Boolean(is_active)`.
    let resolved_enabled = enabled && canonical_id.is_some() && is_active;

    Ok(ResolvedBinding {
        enabled: resolved_enabled,
        canonical_id,
        adapter,
        canonical_project,
    })
}

/// Dual-read: prefer `workspace_external_project_bindings`, fall back to
/// `workspace_secrets`. Returns `(canonicalId, enabled)`.
async fn read_binding_state(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<(Option<String>, bool), ()> {
    // First-class binding table (may not exist yet -> treat errors as "no row").
    if let Some(url) = contact_data.rest_url(
        "workspace_external_project_bindings",
        &[
            ("select", "canonical_project_id,is_enabled".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) && let Ok(response) = send_service_role_get(contact_data, outbound, &url).await
        && (200..300).contains(&response.status)
        && let Ok(rows) = response.json::<Vec<Value>>()
        && let Some(row) = rows.into_iter().next()
    {
        let canonical_id = row
            .get("canonical_project_id")
            .and_then(Value::as_str)
            .map(str::to_owned);
        let enabled = row
            .get("is_enabled")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        return Ok((canonical_id, enabled));
    }
    // Any error / no row -> fall through to secrets.

    // Legacy secrets fallback.
    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "name,value".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            (
                "name",
                format!(
                    "in.({EXTERNAL_PROJECT_ENABLED_SECRET},{EXTERNAL_PROJECT_CANONICAL_ID_SECRET})"
                ),
            ),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    let mut canonical_id: Option<String> = None;
    let mut enabled = false;

    for row in &rows {
        let name = row.get("name").and_then(Value::as_str);
        let value = row.get("value").and_then(Value::as_str);
        match name {
            Some(EXTERNAL_PROJECT_CANONICAL_ID_SECRET) if canonical_id.is_none() => {
                canonical_id = value.map(str::to_owned);
            }
            Some(EXTERNAL_PROJECT_ENABLED_SECRET) if value == Some("true") => {
                enabled = true;
            }
            _ => {}
        }
    }

    Ok((canonical_id, enabled))
}

async fn fetch_canonical_project(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    canonical_id: &str,
) -> Option<Value> {
    // Mirror the legacy `const { data } = await admin...maybeSingle()` which
    // swallows lookup errors and treats them as "no canonical project".
    let url = contact_data.rest_url(
        "canonical_external_projects",
        &[
            ("select", "*".to_owned()),
            ("id", format!("eq.{canonical_id}")),
            ("limit", "1".to_owned()),
        ],
    )?;

    let response = send_service_role_get(contact_data, outbound, &url)
        .await
        .ok()?;
    if !(200..300).contains(&response.status) {
        return None;
    }

    response
        .json::<Vec<Value>>()
        .unwrap_or_default()
        .into_iter()
        .next()
}

// --- Payload builder ---------------------------------------------------------

async fn build_delivery_payload(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    binding: &ResolvedBinding,
) -> Result<Value, ()> {
    // `if (!binding.canonical_id || !binding.adapter) throw`.
    let (Some(canonical_id), Some(adapter)) =
        (binding.canonical_id.as_deref(), binding.adapter.as_deref())
    else {
        return Err(());
    };

    // profileData: prefer canonical_project.delivery_profile, else fixtures.
    // Fixtures are not ported (1891 LOC, adapter-specific); when
    // delivery_profile is null we emit `{}`. See module docs / notes.
    let profile_data = binding
        .canonical_project
        .as_ref()
        .and_then(|row| row.get("delivery_profile"))
        .filter(|value| !value.is_null())
        .map(as_json_object_value)
        .unwrap_or_else(|| Value::Object(Map::new()));

    let collections = list_collections(contact_data, outbound, ws_id).await?;
    let entries = list_entries(contact_data, outbound, ws_id).await?;

    let entry_ids: Vec<String> = entries
        .iter()
        .filter_map(|entry| entry.get("id").and_then(Value::as_str).map(str::to_owned))
        .collect();

    let blocks = list_blocks(contact_data, outbound, ws_id, &entry_ids).await?;
    let assets = list_assets(contact_data, outbound, ws_id, &entry_ids).await?;
    let relations = list_relations(contact_data, outbound, ws_id).await?;
    let relation_definitions = list_relation_definitions(contact_data, outbound, ws_id).await?;

    let collections_payload = build_collections_payload(
        ws_id,
        &collections,
        &entries,
        &blocks,
        &assets,
        &relations,
        &relation_definitions,
    );
    let loading_data = build_loading_data(adapter, &collections_payload);
    let latest_update = latest_delivery_update(
        &collections,
        &entries,
        &assets,
        &relations,
        &relation_definitions,
    );
    let revision = latest_update
        .as_deref()
        .map(digits_only)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "empty".to_owned());

    Ok(json!({
        "adapter": adapter,
        "canonicalProjectId": canonical_id,
        "collections": collections_payload,
        "generatedAt": latest_update.unwrap_or_else(|| "1970-01-01T00:00:00.000Z".to_owned()),
        "loadingData": loading_data,
        "profileData": profile_data,
        "revision": revision,
        "workspaceId": ws_id,
    }))
}

fn build_collections_payload(
    ws_id: &str,
    collections: &[Value],
    entries: &[Value],
    blocks: &[Value],
    assets: &[Value],
    relations: &[Value],
    relation_definitions: &[Value],
) -> Vec<Value> {
    let published_entry_ids: std::collections::HashSet<&str> = entries
        .iter()
        .filter_map(|entry| entry.get("id").and_then(Value::as_str))
        .collect();
    collections
        .iter()
        .map(|collection| {
            let collection_id = collection.get("id").and_then(Value::as_str);

            let collection_entries: Vec<Value> = entries
                .iter()
                .filter(|entry| entry.get("collection_id").and_then(Value::as_str) == collection_id)
                .map(|entry| {
                    let entry_id = entry.get("id").and_then(Value::as_str);

                    let entry_assets: Vec<Value> = assets
                        .iter()
                        .filter(|asset| asset.get("entry_id").and_then(Value::as_str) == entry_id)
                        .map(|asset| build_delivery_asset(ws_id, asset))
                        .collect();

                    let entry_blocks: Vec<Value> = blocks
                        .iter()
                        .filter(|block| block.get("entry_id").and_then(Value::as_str) == entry_id)
                        .cloned()
                        .collect();
                    let entry_relations: Vec<Value> = relations
                        .iter()
                        .filter(|relation| {
                            relation.get("from_entry_id").and_then(Value::as_str) == entry_id
                                && relation
                                    .get("to_entry_id")
                                    .and_then(Value::as_str)
                                    .is_some_and(|id| published_entry_ids.contains(id))
                        })
                        .filter_map(|relation| {
                            let definition_id = relation
                                .get("relation_definition_id")
                                .and_then(Value::as_str)?;
                            let definition = relation_definitions.iter().find(|definition| {
                                definition.get("id").and_then(Value::as_str) == Some(definition_id)
                            })?;
                            Some(json!({
                                "definitionId": definition_id,
                                "id": relation.get("id").cloned().unwrap_or(Value::Null),
                                "key": definition.get("key").cloned().unwrap_or(Value::Null),
                                "metadata": relation.get("metadata").cloned().unwrap_or_else(|| json!({})),
                                "to_entry_id": relation.get("to_entry_id").cloned().unwrap_or(Value::Null),
                            }))
                        })
                        .collect();

                    // `{ ...entry, assets, blocks }` (full entry row preserved).
                    let mut obj = as_object(entry);
                    obj.insert("assets".to_owned(), Value::Array(entry_assets));
                    obj.insert("blocks".to_owned(), Value::Array(entry_blocks));
                    obj.insert("relations".to_owned(), Value::Array(entry_relations));
                    Value::Object(obj)
                })
                .collect();

            // `{ ...collection, entries }` (full collection row preserved).
            let mut obj = as_object(collection);
            obj.insert("entries".to_owned(), Value::Array(collection_entries));
            Value::Object(obj)
        })
        .collect()
}

/// Mirror the `assets.map(...)` projection plus `buildDeliveryAssetUrl`.
fn build_delivery_asset(ws_id: &str, asset: &Value) -> Value {
    let id = asset.get("id").and_then(Value::as_str);
    let asset_revision = asset
        .get("updated_at")
        .and_then(Value::as_str)
        .map(digits_only)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "0".to_owned());
    let asset_url = id.map(|id| {
        format!("/api/v1/workspaces/{ws_id}/external-projects/assets/{id}?v={asset_revision}")
    });

    json!({
        "alt_text": asset.get("alt_text").cloned().unwrap_or(Value::Null),
        "asset_type": asset.get("asset_type").cloned().unwrap_or(Value::Null),
        "assetUrl": asset_url,
        "assetRevision": asset_revision,
        "block_id": asset.get("block_id").cloned().unwrap_or(Value::Null),
        "entry_id": asset.get("entry_id").cloned().unwrap_or(Value::Null),
        "id": asset.get("id").cloned().unwrap_or(Value::Null),
        "metadata": asset.get("metadata").cloned().unwrap_or(Value::Null),
        "sort_order": asset.get("sort_order").cloned().unwrap_or(Value::Null),
        "source_url": asset.get("source_url").cloned().unwrap_or(Value::Null),
        "storage_path": asset.get("storage_path").cloned().unwrap_or(Value::Null),
        "updated_at": asset.get("updated_at").cloned().unwrap_or(Value::Null),
    })
}

// --- Supabase reads ----------------------------------------------------------

async fn list_collections(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_external_project_collections",
        &[
            ("select", "*".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("order", "title.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    fetch_rows(contact_data, outbound, &url).await
}

async fn list_entries(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<Value>, ()> {
    // Non-preview delivery: includeDrafts === false -> status = published.
    let Some(url) = contact_data.rest_url(
        "workspace_external_project_entries",
        &[
            ("select", "*".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("status", "eq.published".to_owned()),
            ("order", "sort_order.asc,created_at.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    fetch_rows(contact_data, outbound, &url).await
}

async fn list_blocks(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    entry_ids: &[String],
) -> Result<Vec<Value>, ()> {
    if entry_ids.is_empty() {
        return Ok(Vec::new());
    }
    let Some(url) = contact_data.rest_url(
        "workspace_external_project_blocks",
        &[
            ("select", "*".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("entry_id", format!("in.({})", entry_ids.join(","))),
            ("order", "sort_order.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    fetch_rows(contact_data, outbound, &url).await
}

async fn list_assets(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    entry_ids: &[String],
) -> Result<Vec<Value>, ()> {
    if entry_ids.is_empty() {
        return Ok(Vec::new());
    }
    let Some(url) = contact_data.rest_url(
        "workspace_external_project_assets",
        &[
            ("select", "*".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("entry_id", format!("in.({})", entry_ids.join(","))),
            ("order", "sort_order.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    fetch_rows(contact_data, outbound, &url).await
}

async fn list_relations(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_external_project_entry_relations",
        &[
            ("select", "*".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("order", "sort_order.asc,created_at.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    fetch_rows(contact_data, outbound, &url).await
}

async fn list_relation_definitions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_external_project_relation_definitions",
        &[("select", "*".to_owned()), ("ws_id", format!("eq.{ws_id}"))],
    ) else {
        return Err(());
    };
    fetch_rows(contact_data, outbound, &url).await
}

async fn fetch_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<Vec<Value>, ()> {
    let response = send_service_role_get(contact_data, outbound, url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    response.json::<Vec<Value>>().map_err(|_| ())
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

// --- Small value helpers (mirror the TS helpers) -----------------------------

fn as_object(value: &Value) -> Map<String, Value> {
    value.as_object().cloned().unwrap_or_default()
}

fn digits_only(value: &str) -> String {
    value.chars().filter(char::is_ascii_digit).collect()
}

fn latest_delivery_update(
    collections: &[Value],
    entries: &[Value],
    assets: &[Value],
    relations: &[Value],
    definitions: &[Value],
) -> Option<String> {
    collections
        .iter()
        .chain(entries)
        .chain(assets)
        .chain(relations)
        .chain(definitions)
        .filter_map(|row| {
            row.get("updated_at")
                .or_else(|| row.get("created_at"))
                .and_then(Value::as_str)
        })
        .max()
        .map(str::to_owned)
}

fn public_delivery_response(payload: Value, ws_id: &str) -> BackendResponse {
    let revision = payload
        .get("revision")
        .and_then(Value::as_str)
        .unwrap_or("empty")
        .to_owned();
    let mut cache_tags = vec![format!("external-project-workspace-{ws_id}")];
    if let Some(collections) = payload.get("collections").and_then(Value::as_array) {
        for collection in collections {
            if let Some(entries) = collection.get("entries").and_then(Value::as_array) {
                for entry in entries {
                    if let Some(assets) = entry.get("assets").and_then(Value::as_array) {
                        for asset in assets {
                            if let Some(id) = asset.get("id").and_then(Value::as_str) {
                                cache_tags.push(format!("external-project-asset-{id}"));
                            }
                        }
                    }
                }
            }
        }
    }
    cache_tags.sort();
    cache_tags.dedup();

    let mut response = json_response(200, payload);
    response.cache_control = Some(PUBLIC_DELIVERY_CACHE_CONTROL);
    response.headers.push(("etag", format!("W/\"{revision}\"")));
    response.headers.push((
        "vercel-cdn-cache-control",
        "max-age=86400, stale-while-revalidate=43200".to_owned(),
    ));
    response
        .headers
        .push(("vercel-cache-tag", cache_tags.join(",")));
    response
}

fn delivery_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn preview_requested(request_url: Option<&str>) -> bool {
    let Some(url) = request_url.and_then(|url| url::Url::parse(url).ok()) else {
        return false;
    };
    url.query_pairs()
        .any(|(name, value)| name == "preview" && value == "true")
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
