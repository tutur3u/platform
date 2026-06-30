//! Handler for `GET /api/v1/workspaces/:wsId/external-projects/storage`.
//!
//! Legacy source:
//! `apps/web/src/app/api/v1/workspaces/[wsId]/external-projects/storage/route.ts`.
//!
//! ## Behavior gaps vs. legacy
//!
//! - **App-session / coordination tokens**: only standard Supabase user
//!   tokens (Bearer JWT or `sb-*-auth-token` cookie) are accepted.
//!   App-session (`ttr_app_*`) and app-coordination tokens return 401.
//! - **Root-workspace admin bypass**: the legacy allows root-workspace
//!   members with `manage_external_projects` or `manage_workspace_roles`
//!   to access any workspace's storage. This bypass is not reproduced.
//! - **R2 storage**: only Supabase Storage is supported. R2-configured
//!   workspaces will receive a 500.
//! - **Signed-URL existence check**: `requireExists: true` is skipped;
//!   the signed URL is issued unconditionally.
//! - **`total` count**: for list responses the `total` field is a
//!   paginated count from a separate Supabase Storage list call (mirrors
//!   `countSupabaseDirectoryEntries`); at the root level it equals the
//!   filtered item count of the first page, matching the legacy shortcut.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/external-projects/storage";
const STORAGE_BUCKET: &str = "workspaces";
const SIGNED_URL_TTL_SECONDS: u64 = 900;
const EMPTY_FOLDER_PLACEHOLDER: &str = ".emptyFolderPlaceholder";
const PERMISSION_PUBLISH: &str = "publish_external_projects";
const PERMISSION_MANAGE: &str = "manage_external_projects";
const ENABLED_SECRET: &str = "EXTERNAL_PROJECT_ENABLED";
const CANONICAL_ID_SECRET: &str = "EXTERNAL_PROJECT_CANONICAL_ID";

// ─── Row models ───────────────────────────────────────────────────────────────

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

// ─── Entry point ──────────────────────────────────────────────────────────────

pub(crate) async fn handle_workspaces_wsid_external_projects_storage_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = extract_ws_id(request.path)?;

    Some(match request.method {
        "GET" => get_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

// ─── GET handler ──────────────────────────────────────────────────────────────

async fn get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let cd = &config.contact_data;
    if !cd.configured() {
        return err(500, "Failed to read external project storage");
    }

    // Auth: publish_external_projects OR manage_external_projects.
    let ws_id = match authorize_read(cd, request, raw_ws_id, outbound).await {
        Ok(id) => id,
        Err(r) => return r,
    };

    // Binding: enabled + active?
    let (binding_enabled, adapter) = match resolve_binding(cd, outbound, &ws_id).await {
        Ok(result) => result,
        Err(()) => return err(500, "Failed to read external project storage"),
    };

    if !binding_enabled {
        return err(
            404,
            "External project studio unavailable for this workspace",
        );
    }

    let prefix = format!(
        "external-projects/{}",
        adapter.as_deref().unwrap_or("shared")
    );
    let url_obj = request.url.and_then(|u| url::Url::parse(u).ok());

    // filePath => signed-URL branch.
    if let Some(file_path) = url_obj.as_ref().and_then(|u| {
        u.query_pairs()
            .find_map(|(k, v)| (k == "filePath").then(|| v.into_owned()))
    }) {
        let Some(sanitized) = sanitize_path(&file_path).filter(|p| !p.is_empty()) else {
            return err(400, "Invalid file path");
        };
        let object_path = join_storage_path(&ws_id, &prefix, &sanitized);
        return signed_url_response(cd, outbound, &object_path).await;
    }

    // List branch.
    let parsed = match parse_list_query(url_obj.as_ref()) {
        Ok(p) => p,
        Err(()) => return err(400, "Invalid storage query"),
    };
    let Some(sanitized_path) = sanitize_path(&parsed.path) else {
        return err(400, "Invalid path");
    };
    let storage_prefix = join_storage_path(&ws_id, &prefix, &sanitized_path);
    list_response(cd, outbound, &storage_prefix, &sanitized_path, &parsed).await
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async fn authorize_read(
    cd: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<String, BackendResponse> {
    use WorkspacePermissionAuthorizationError as E;

    // Try publish permission first (most common for read mode).
    match authorize_workspace_permission(cd, request, raw_ws_id, PERMISSION_PUBLISH, outbound).await
    {
        Ok(a) => return Ok(a.ws_id),
        Err(E::Unauthorized | E::NotFound) => return Err(err(401, "Unauthorized")),
        Err(E::Internal) => return Err(err(500, "Failed to read external project storage")),
        Err(E::Forbidden) => {}
    }

    // Fall back to manage permission (workspace admins).
    match authorize_workspace_permission(cd, request, raw_ws_id, PERMISSION_MANAGE, outbound).await
    {
        Ok(a) => Ok(a.ws_id),
        Err(E::Unauthorized | E::NotFound) => Err(err(401, "Unauthorized")),
        Err(E::Forbidden) => Err(err(403, "Forbidden")),
        Err(E::Internal) => Err(err(500, "Failed to read external project storage")),
    }
}

// ─── Binding resolution ───────────────────────────────────────────────────────

/// Returns `(enabled, adapter)`. Tries the `workspace_external_project_bindings`
/// table first, falls back to `workspace_secrets` on failure (migration not yet
/// applied). Adapter is `None` when the canonical project row is absent.
async fn resolve_binding(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<(bool, Option<String>), ()> {
    // --- First-class bindings table -----------------------------------------
    let (canonical_id, enabled) = {
        let primary_result = async {
            let url = cd.rest_url(
                "workspace_external_project_bindings",
                &[
                    ("select", "canonical_project_id,is_enabled".to_owned()),
                    ("ws_id", format!("eq.{ws_id}")),
                    ("limit", "1".to_owned()),
                ],
            )?;
            let resp = svc_get(cd, outbound, &url).await.ok()?;
            if !is_ok(resp.status) {
                return None;
            }
            let rows: Vec<BindingRow> = resp.json().ok()?;
            let row = rows.into_iter().next()?;
            Some((row.canonical_project_id, row.is_enabled.unwrap_or(false)))
        }
        .await;

        match primary_result {
            Some(result) => result,
            None => {
                // --- Fallback to workspace_secrets ----------------------------
                let in_clause = format!("({ENABLED_SECRET},{CANONICAL_ID_SECRET})");
                let url = cd
                    .rest_url(
                        "workspace_secrets",
                        &[
                            ("select", "name,value".to_owned()),
                            ("ws_id", format!("eq.{ws_id}")),
                            ("name", format!("in.{in_clause}")),
                        ],
                    )
                    .ok_or(())?;
                let resp = svc_get(cd, outbound, &url).await.map_err(|_| ())?;
                if !is_ok(resp.status) {
                    return Err(());
                }
                let rows: Vec<SecretRow> = resp.json().map_err(|_| ())?;
                let enabled = rows.iter().any(|r| {
                    r.name.as_deref() == Some(ENABLED_SECRET) && r.value.as_deref() == Some("true")
                });
                let canonical_id = rows
                    .iter()
                    .find_map(|r| {
                        (r.name.as_deref() == Some(CANONICAL_ID_SECRET)).then(|| r.value.clone())
                    })
                    .flatten();
                (canonical_id, enabled)
            }
        }
    };

    if !enabled {
        return Ok((false, None));
    }
    let Some(cid) = canonical_id else {
        return Ok((false, None));
    };

    // Fetch canonical project for is_active + adapter.
    let url = cd
        .rest_url(
            "canonical_external_projects",
            &[
                ("select", "adapter,is_active".to_owned()),
                ("id", format!("eq.{cid}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = svc_get(cd, outbound, &url).await.map_err(|_| ())?;
    if !is_ok(resp.status) {
        return Err(());
    }
    let rows: Vec<CanonicalProjectRow> = resp.json().map_err(|_| ())?;
    let project = rows.into_iter().next();
    let is_active = project.as_ref().and_then(|p| p.is_active).unwrap_or(false);

    if !is_active {
        return Ok((false, None));
    }
    Ok((true, project.and_then(|p| p.adapter)))
}

// ─── Signed-URL response ──────────────────────────────────────────────────────

async fn signed_url_response(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    object_path: &str,
) -> BackendResponse {
    let Some(base) = storage_base_url(cd) else {
        return err(500, "Failed to generate signed URL");
    };
    let url = format!("{base}/sign/{STORAGE_BUCKET}/{object_path}");
    let Some(key) = cd.service_role_key() else {
        return err(500, "Failed to generate signed URL");
    };
    let auth = format!("Bearer {key}");
    let body = json!({ "expiresIn": SIGNED_URL_TTL_SECONDS }).to_string();

    let resp = match outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Authorization", &auth)
                .with_header("apikey", key)
                .with_body(&body),
        )
        .await
    {
        Ok(r) => r,
        Err(_) => return err(500, "Failed to generate signed URL"),
    };

    if resp.status == 404 {
        return err(404, "Storage object not found");
    }
    if !is_ok(resp.status) {
        return err(500, "Failed to generate signed URL");
    }

    // Supabase returns { "signedURL": "https://..." }.
    let signed_url = resp.json::<Value>().ok().and_then(|v| {
        v.get("signedURL")
            .and_then(Value::as_str)
            .map(str::to_owned)
    });

    match signed_url {
        Some(signed_url) => no_store_response(json_response(
            200,
            json!({ "data": { "expiresIn": SIGNED_URL_TTL_SECONDS, "signedUrl": signed_url } }),
        )),
        None => err(500, "Failed to generate signed URL"),
    }
}

// ─── List response ────────────────────────────────────────────────────────────

struct ListQuery {
    path: String,
    search: Option<String>,
    limit: i64,
    offset: i64,
    sort_by: String,
    sort_order: String,
}

async fn list_response(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    storage_prefix: &str,
    relative_path: &str,
    q: &ListQuery,
) -> BackendResponse {
    let Some(list_url) = storage_list_url(cd) else {
        return err(500, "Failed to read external project storage");
    };

    let page = match storage_list(
        cd,
        outbound,
        &list_url,
        storage_prefix,
        q.limit,
        q.offset,
        &q.sort_by,
        &q.sort_order,
        q.search.as_deref(),
    )
    .await
    {
        Ok(p) => p,
        Err(()) => return err(500, "Failed to read external project storage"),
    };

    let filtered: Vec<Value> = page
        .into_iter()
        .filter(|e| e.get("name").and_then(Value::as_str) != Some(EMPTY_FOLDER_PLACEHOLDER))
        .collect();

    // total: paginated count for non-root paths; page length at root.
    let total: i64 = if relative_path.is_empty() {
        filtered.len() as i64
    } else {
        count_entries(cd, outbound, &list_url, storage_prefix, q.search.as_deref())
            .await
            .unwrap_or(filtered.len() as i64)
    };

    let items: Vec<Value> = filtered
        .into_iter()
        .map(|e| map_entry(relative_path, e))
        .collect();

    no_store_response(json_response(
        200,
        json!({ "data": { "items": items, "path": relative_path, "provider": "supabase", "total": total } }),
    ))
}

fn map_entry(current_path: &str, entry: Value) -> Value {
    let name = entry
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned();
    let path = if current_path.is_empty() {
        name.clone()
    } else if name.is_empty() {
        current_path.to_owned()
    } else {
        format!("{current_path}/{name}")
    };
    let is_file = matches!(entry.get("id"), Some(v) if !v.is_null());
    let meta = entry.get("metadata");
    let content_type: Value = if is_file {
        meta.and_then(|m| {
            m.get("mimetype")
                .or_else(|| m.get("mimeType"))
                .or_else(|| m.get("mediaType"))
                .or_else(|| m.get("contentType"))
        })
        .and_then(Value::as_str)
        .map(|s| Value::String(s.to_owned()))
        .unwrap_or(Value::Null)
    } else {
        Value::Null
    };
    let size: i64 = if is_file {
        meta.and_then(|m| m.get("size"))
            .and_then(Value::as_f64)
            .map(|n| n as i64)
            .unwrap_or(0)
    } else {
        0
    };
    json!({
        "contentType": content_type,
        "createdAt": entry.get("created_at").cloned().unwrap_or(Value::Null),
        "kind": if is_file { "file" } else { "folder" },
        "name": name, "path": path, "size": size,
        "updatedAt": entry.get("updated_at").cloned().unwrap_or(Value::Null),
    })
}

// ─── Supabase Storage helpers ─────────────────────────────────────────────────

#[allow(clippy::too_many_arguments)]
async fn storage_list(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    list_url: &str,
    prefix: &str,
    limit: i64,
    offset: i64,
    sort_by: &str,
    sort_order: &str,
    search: Option<&str>,
) -> Result<Vec<Value>, ()> {
    let key = cd.service_role_key().ok_or(())?;
    let auth = format!("Bearer {key}");
    let mut body = json!({
        "prefix": prefix, "limit": limit, "offset": offset,
        "sortBy": { "column": sort_by, "order": sort_order },
    });
    if let Some(s) = search.filter(|s| !s.is_empty()) {
        body["search"] = Value::String(s.to_owned());
    }
    let body_str = body.to_string();

    let resp = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, list_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Authorization", &auth)
                .with_header("apikey", key)
                .with_body(&body_str),
        )
        .await
        .map_err(|_| ())?;

    if !is_ok(resp.status) {
        return Err(());
    }
    resp.json::<Vec<Value>>().map_err(|_| ())
}

async fn count_entries(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    list_url: &str,
    prefix: &str,
    search: Option<&str>,
) -> Result<i64, ()> {
    let mut total = 0i64;
    let mut offset = 0i64;
    loop {
        let page = storage_list(
            cd, outbound, list_url, prefix, 1000, offset, "name", "asc", search,
        )
        .await?;
        let page_len = page.len() as i64;
        total += page
            .iter()
            .filter(|e| e.get("name").and_then(Value::as_str) != Some(EMPTY_FOLDER_PLACEHOLDER))
            .count() as i64;
        if page_len < 1000 {
            break;
        }
        offset += page_len;
    }
    Ok(total)
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

fn storage_base_url(cd: &contact::ContactDataConfig) -> Option<String> {
    let rest = cd.rest_url("__origin__", &[])?;
    let origin = rest.split("/rest/v1/").next().filter(|s| !s.is_empty())?;
    Some(format!("{origin}/storage/v1/object"))
}

fn storage_list_url(cd: &contact::ContactDataConfig) -> Option<String> {
    Some(format!("{}/list/{STORAGE_BUCKET}", storage_base_url(cd)?))
}

fn join_storage_path(ws_id: &str, prefix: &str, relative: &str) -> String {
    if relative.is_empty() {
        format!("{ws_id}/{prefix}")
    } else {
        format!("{ws_id}/{prefix}/{relative}")
    }
}

fn sanitize_path(path: &str) -> Option<String> {
    if path.is_empty() {
        return Some(String::new());
    }
    let normalized = path.replace('\\', "/");
    let segments: Vec<&str> = normalized
        .trim()
        .trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect();
    for s in &segments {
        if *s == ".." || *s == "." || s.contains("..") {
            return None;
        }
    }
    Some(segments.join("/"))
}

fn extract_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

async fn svc_get(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let key = cd.service_role_key().ok_or(())?;
    let auth = format!("Bearer {key}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &auth)
                .with_header("apikey", key),
        )
        .await
        .map_err(|_| ())
}

fn is_ok(status: u16) -> bool {
    (200..300).contains(&status)
}

fn err(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

fn parse_list_query(url: Option<&url::Url>) -> Result<ListQuery, ()> {
    let mut path: Option<String> = None;
    let mut search: Option<String> = None;
    let mut limit: Option<String> = None;
    let mut offset: Option<String> = None;
    let mut sort_by: Option<String> = None;
    let mut sort_order: Option<String> = None;

    if let Some(u) = url {
        for (k, v) in u.query_pairs() {
            match k.as_ref() {
                "path" => path = Some(v.into_owned()),
                "search" => search = Some(v.into_owned()),
                "limit" => limit = Some(v.into_owned()),
                "offset" => offset = Some(v.into_owned()),
                "sortBy" => sort_by = Some(v.into_owned()),
                "sortOrder" => sort_order = Some(v.into_owned()),
                _ => {}
            }
        }
    }

    let path_val = path.unwrap_or_default();
    if path_val.chars().count() > 1024 {
        return Err(());
    }
    if search
        .as_deref()
        .map(|s| s.chars().count() > 255)
        .unwrap_or(false)
    {
        return Err(());
    }

    let limit_val = match limit {
        Some(raw) => coerce_int(&raw).ok_or(())?,
        None => 50,
    };
    if !(1..=100).contains(&limit_val) {
        return Err(());
    }

    let offset_val = match offset {
        Some(raw) => coerce_int(&raw).ok_or(())?,
        None => 0,
    };
    if offset_val < 0 {
        return Err(());
    }

    let sort_by_val = sort_by.unwrap_or_else(|| "name".to_owned());
    if !matches!(
        sort_by_val.as_str(),
        "name" | "created_at" | "updated_at" | "size"
    ) {
        return Err(());
    }

    let sort_order_val = sort_order.unwrap_or_else(|| "asc".to_owned());
    if !matches!(sort_order_val.as_str(), "asc" | "desc") {
        return Err(());
    }

    Ok(ListQuery {
        path: path_val,
        search: search.filter(|s| !s.is_empty()),
        limit: limit_val,
        offset: offset_val,
        sort_by: sort_by_val,
        sort_order: sort_order_val,
    })
}

fn coerce_int(raw: &str) -> Option<i64> {
    let t = raw.trim();
    if t.is_empty() {
        return Some(0);
    }
    let n = t.parse::<f64>().ok()?;
    if !n.is_finite() || n.fract() != 0.0 {
        return None;
    }
    Some(n as i64)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_ws_id_matches_route() {
        let ws = "11111111-1111-4111-8111-111111111111";
        assert_eq!(
            extract_ws_id(&format!(
                "/api/v1/workspaces/{ws}/external-projects/storage"
            )),
            Some(ws)
        );
    }

    #[test]
    fn extract_ws_id_rejects_unrelated_paths() {
        assert!(extract_ws_id("/api/v1/workspaces/").is_none());
        assert!(extract_ws_id("/api/v1/workspaces/abc/other").is_none());
        assert!(extract_ws_id("/api/v1/workspaces/abc/external-projects/storage/extra").is_none());
        assert!(extract_ws_id("/api/v1/workspaces/a/b/external-projects/storage").is_none());
    }

    #[test]
    fn sanitize_path_empty() {
        assert_eq!(sanitize_path(""), Some(String::new()));
    }

    #[test]
    fn sanitize_path_normal() {
        assert_eq!(sanitize_path("foo/bar"), Some("foo/bar".to_owned()));
        assert_eq!(sanitize_path("/foo/bar/"), Some("foo/bar".to_owned()));
    }

    #[test]
    fn sanitize_path_rejects_traversal() {
        assert!(sanitize_path("../etc/passwd").is_none());
        assert!(sanitize_path("foo/../bar").is_none());
    }

    #[test]
    fn join_storage_path_empty_relative() {
        assert_eq!(
            join_storage_path("ws-1", "external-projects/cms", ""),
            "ws-1/external-projects/cms"
        );
    }

    #[test]
    fn join_storage_path_with_relative() {
        assert_eq!(
            join_storage_path("ws-1", "external-projects/cms", "images"),
            "ws-1/external-projects/cms/images"
        );
    }

    #[test]
    fn parse_list_query_defaults() {
        let u = url::Url::parse("https://example.com/path").unwrap();
        let q = parse_list_query(Some(&u)).unwrap();
        assert_eq!(q.path, "");
        assert_eq!(q.limit, 50);
        assert_eq!(q.offset, 0);
        assert_eq!(q.sort_by, "name");
        assert_eq!(q.sort_order, "asc");
        assert!(q.search.is_none());
    }

    #[test]
    fn parse_list_query_rejects_bad_params() {
        let u = url::Url::parse("https://example.com/?sortBy=unknown").unwrap();
        assert!(parse_list_query(Some(&u)).is_err());
        let u = url::Url::parse("https://example.com/?limit=200").unwrap();
        assert!(parse_list_query(Some(&u)).is_err());
        let u = url::Url::parse("https://example.com/?sortOrder=random").unwrap();
        assert!(parse_list_query(Some(&u)).is_err());
    }

    #[test]
    fn map_entry_file() {
        let e = json!({
            "id": "uuid", "name": "photo.jpg",
            "created_at": "2024-01-01T00:00:00Z", "updated_at": "2024-01-02T00:00:00Z",
            "metadata": { "mimetype": "image/jpeg", "size": 12345 },
        });
        let m = map_entry("albums", e);
        assert_eq!(m["kind"], "file");
        assert_eq!(m["name"], "photo.jpg");
        assert_eq!(m["path"], "albums/photo.jpg");
        assert_eq!(m["contentType"], "image/jpeg");
        assert_eq!(m["size"], 12345);
    }

    #[test]
    fn map_entry_folder() {
        let e = json!({
            "id": Value::Null, "name": "docs",
            "created_at": Value::Null, "updated_at": Value::Null, "metadata": Value::Null,
        });
        let m = map_entry("", e);
        assert_eq!(m["kind"], "folder");
        assert_eq!(m["path"], "docs");
        assert_eq!(m["contentType"], Value::Null);
        assert_eq!(m["size"], 0);
    }
}
