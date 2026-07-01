//! Handler for `GET /api/v1/storage/list`.
//!
//! Ported from `apps/web/src/app/api/v1/storage/list/route.ts`.
//!
//! Auth model: external SDK **workspace API key** (`Authorization: Bearer ttr_...`),
//! via `withApiAuth(..., { permissions: ['manage_drive'] })`. This is NOT Supabase
//! user auth. The API-key validation flow mirrors `storage_analytics.rs`
//! (`validateApiKey` in `packages/auth/src/api-keys.ts`):
//!   1. The key must start with `ttr_`.
//!   2. The first 12 characters form the `key_prefix`, used to fetch candidate
//!      rows from `workspace_api_keys` where `expires_at IS NULL OR
//!      expires_at > now()`.
//!   3. Each candidate's stored `key_hash` (format `salt:hex`) is verified with
//!      scrypt (Node defaults: N=16384, r=8, p=1, dkLen=64), constant-time compare.
//!   4. The matching row yields `ws_id` and `role_id`. Permissions are the union
//!      of role permissions (when `role_id` is set, enabled) and workspace default
//!      permissions (`member_type = MEMBER`, enabled). The `admin` permission is a
//!      wildcard. The route requires `hasAnyPermission(['manage_drive'])`.
//!
//! Request flow (legacy GET handler):
//!   1. `validateQueryParams(request, listQuerySchema)` — on failure returns
//!      `createErrorResponse('Bad Request','Invalid query parameters',400,
//!      'INVALID_QUERY_PARAMS')`.
//!   2. `sanitizePath(path)` — `null` => 400 `INVALID_PATH`.
//!   3. `isReservedMobileDeploymentDrivePath(wsId, trimmedPath)` => 403
//!      `STORAGE_RESERVED_PATH`.
//!   4. Supabase Storage `.list([wsId]/[path], { limit, offset, sortBy, search })`
//!      — storage error => 500 `STORAGE_LIST_ERROR`.
//!   5. Filter out `.emptyFolderPlaceholder`, then
//!      `filterReservedMobileDeploymentDriveEntries(wsId, trimmedPath, ...)`.
//!   6. `countWorkspaceStorageObjects(supabase, wsId, { path, search })` — a
//!      RECURSIVE walk of `[wsId]/[path]` counting files (entries with `id`) that
//!      are not under the reserved mobile-deployment prefix and match `search`.
//!      On error: fall back to `filteredFiles.length`.
//!   7. Respond `{ data: filteredFiles, pagination: { limit, offset, total } }`,
//!      status 200.
//!
//! Error shapes (`createErrorResponse(error, message, status, code)`):
//!   - 401 `MISSING_API_KEY` / `INVALID_API_KEY`
//!   - 403 `INSUFFICIENT_PERMISSIONS` / `STORAGE_RESERVED_PATH`
//!   - 400 `INVALID_QUERY_PARAMS` / `INVALID_PATH`
//!   - 500 `STORAGE_LIST_ERROR` / `UNEXPECTED_ERROR`
//!
//! Storage fidelity: the legacy route uses the Supabase Storage `.list()` API
//! directly (it does NOT branch to an R2 provider, unlike
//! `getWorkspaceStorageOverview`). This module reproduces that Supabase path
//! exactly. The recursive count mirrors `countWorkspaceStorageObjects`.
//!
//! No new shared helpers are added: all API-key validation, scrypt, sanitizePath,
//! and reserved-path helpers are copied file-local (the originals are private fns
//! in `storage_analytics.rs` / `workspaces_storage_list.rs`).

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendResponse, contact, json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

pub(super) const STORAGE_LIST_PATH: &str = "/api/v1/storage/list";

pub(super) const API_KEY_PREFIX: &str = "ttr_";
pub(super) const KEY_PREFIX_LEN: usize = 12;

pub(super) const MANAGE_DRIVE_PERMISSION: &str = "manage_drive";
pub(super) const ADMIN_PERMISSION: &str = "admin";

pub(super) const STORAGE_BUCKET: &str = "workspaces";
pub(super) const STORAGE_LIST_PAGE_SIZE: i64 = 1000;
pub(super) const EMPTY_FOLDER_PLACEHOLDER_NAME: &str = ".emptyFolderPlaceholder";

pub(super) const INTERNAL_WORKSPACE_SLUG: &str = "internal";
pub(super) const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

// mobile-deployment/constants.ts: MOBILE_DEPLOYMENT_DRIVE_PREFIX.
pub(super) const MOBILE_DEPLOYMENT_DRIVE_PREFIX: &str = ".tuturuuu/mobile-deployment-vault";
// filterReservedMobileDeploymentDriveEntries drops the `.tuturuuu` root entry.
pub(super) const RESERVED_FOLDER_ENTRY_NAME: &str = ".tuturuuu";

// Zod listQuerySchema bounds (constants.ts).
pub(super) const MAX_MEDIUM_TEXT_LENGTH: usize = 1000; // path
pub(super) const MAX_SEARCH_LENGTH: usize = 500; // search
pub(super) const MAX_SHORT_TEXT_LENGTH: i64 = 100; // limit max
pub(super) const DEFAULT_LIMIT: i64 = 50;
pub(super) const DEFAULT_OFFSET: i64 = 0;

// ---------------------------------------------------------------------------
// Parsed query params (zod listQuerySchema).
// ---------------------------------------------------------------------------

pub(super) struct ListQuery {
    pub(super) path: String,
    pub(super) search: Option<String>,
    pub(super) limit: i64,
    pub(super) offset: i64,
    pub(super) sort_by: String,
    pub(super) sort_order: String,
}

// ---------------------------------------------------------------------------
// Deserialization rows.
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub(super) struct ApiKeyRow {
    pub(super) ws_id: Option<String>,
    pub(super) role_id: Option<String>,
    pub(super) key_hash: Option<String>,
    pub(super) expires_at: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct PermissionRow {
    pub(super) permission: Option<String>,
}

/// Supabase Storage list entry. We keep the raw JSON value so we can
/// re-serialize each entry verbatim (matching the legacy `StorageObject[]`
/// response shape) while still inspecting `name`/`id` for filtering.
pub(super) struct StorageListEntry {
    pub(super) raw: Value,
}

impl StorageListEntry {
    pub(super) fn name(&self) -> Option<&str> {
        self.raw.get("name").and_then(Value::as_str)
    }

    pub(super) fn is_file(&self) -> bool {
        // `id` is non-null for files and null for "folders" in the list API.
        matches!(self.raw.get("id"), Some(value) if !value.is_null())
    }
}

pub(super) struct ApiKeyContext {
    pub(super) ws_id: String,
    pub(super) role_id: Option<String>,
}

// ---------------------------------------------------------------------------
// Shared outbound helpers (used across multiple submodules).
// ---------------------------------------------------------------------------

pub(super) fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

pub(super) async fn service_role_get(
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

pub(super) fn error_response(
    status: u16,
    error: &str,
    message: &str,
    code: Option<&str>,
) -> BackendResponse {
    let body = match code {
        Some(code) => json!({ "error": error, "message": message, "code": code }),
        None => json!({ "error": error, "message": message }),
    };
    no_store_response(json_response(status, body))
}

// ---------------------------------------------------------------------------
// Submodules.
// ---------------------------------------------------------------------------

mod auth;
mod crypto;
mod handler;
mod path;
mod query;
mod storage;

pub(crate) use handler::handle_storage_list_route;
