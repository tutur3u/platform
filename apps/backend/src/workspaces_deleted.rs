//! Handler for `GET /api/v1/workspaces/:wsId/deleted`.
//!
//! Ported from `apps/web/src/app/api/v1/workspaces/[wsId]/deleted/route.ts`.
//!
//! The legacy route is wrapped in `withApiAuth(..., { permissions: ['manage_projects'] })`,
//! which authenticates the caller using a *workspace API key* (`ttr_...` bearer
//! token) — NOT a Supabase user JWT. The authentication / permission resolution
//! flow mirrors `packages/auth/src/api-keys.ts`:
//!   1. Extract the bearer key from the `Authorization` header (or raw `ttr_`).
//!   2. Look up candidate rows in `workspace_api_keys` by `key_prefix`
//!      (the first 12 characters of the key), excluding expired keys.
//!   3. For each candidate, validate the raw key against the stored `salt:hash`
//!      value using **scrypt** key derivation (`KEY_DERIVATION_LENGTH = 64`).
//!   4. The matching row yields `{ ws_id, role_id }`.
//!   5. Permissions = union of role permissions (`workspace_role_permissions`
//!      filtered by `role_id`+`enabled`) and workspace default permissions
//!      (`workspace_default_permissions` for `member_type=MEMBER`+`enabled`).
//!      `admin` grants all permissions. The route requires `manage_projects`.
//!
//! Then the route body:
//!   - validates `wsId` is a GUID (`z.guid()`) → 400 INVALID_PARAMS otherwise;
//!   - requires `wsId == context.wsId` → 403 WORKSPACE_MISMATCH otherwise;
//!   - fetches deleted boards + deleted tasks (deleted within the last 30 days)
//!     and returns `{ boards, tasks, total }` with a per-item
//!     `days_until_permanent_deletion`.
//!
//! IMPORTANT INTEGRATOR NOTE: API-key validation requires **scrypt**, which is
//! NOT a current dependency of `apps/backend` (Cargo.toml edits are out of scope
//! for this port). `validate_api_key_hash` below therefore cannot derive the
//! scrypt hash and conservatively returns `false`, so authentication FAILS
//! CLOSED (every request → 401 INVALID_API_KEY) until the integrator adds a
//! `scrypt` crate (matching the `node:crypto` scrypt defaults: N=16384, r=8,
//! p=1, dklen=64) and implements the derivation in `validate_api_key_hash`.
//! This mirrors the existing `workspaces_2.rs` port and is why confidence is
//! reported as low. The `extract_api_key`, `validate_api_key`,
//! `validate_api_key_hash`, and `send_service_role_rest_request` helpers are
//! deliberately COPIED from `workspaces_2.rs` (file-local) rather than shared,
//! to keep this port self-contained without editing other modules.

use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const WORKSPACES_DELETED_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_DELETED_PATH_SUFFIX: &str = "/deleted";

const API_KEY_PREFIX: &str = "ttr_";
const API_KEY_LOOKUP_PREFIX_LEN: usize = 12;

const ADMIN_PERMISSION: &str = "admin";
const REQUIRED_PERMISSION: &str = "manage_projects";

const RETENTION_DAYS: i64 = 30;
const SECONDS_PER_DAY: i64 = 60 * 60 * 24;

// ---------------------------------------------------------------------------
// API key validation (copied file-local from workspaces_2.rs)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct ApiKeyRow {
    ws_id: Option<String>,
    key_hash: Option<String>,
    role_id: Option<String>,
    expires_at: Option<String>,
}

#[derive(Deserialize)]
struct PermissionRow {
    permission: Option<String>,
}

// ---------------------------------------------------------------------------
// Route data rows
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct DeletedBoardRow {
    id: Option<String>,
    name: Option<String>,
    deleted_at: Option<String>,
    created_at: Option<String>,
}

#[derive(Serialize)]
struct DeletedBoardItem {
    id: Option<String>,
    name: Option<String>,
    deleted_at: Option<String>,
    created_at: Option<String>,
    days_until_permanent_deletion: i64,
}

#[derive(Serialize)]
struct DeletedTaskItem {
    id: Option<String>,
    name: Option<String>,
    description: Option<String>,
    deleted_at: Option<String>,
    created_at: Option<String>,
    list_id: Option<String>,
    list_name: Option<String>,
    board_id: Option<String>,
    board_name: Option<String>,
    days_until_permanent_deletion: i64,
}

#[derive(Serialize)]
struct DeletedItemsResponse {
    boards: Vec<DeletedBoardItem>,
    tasks: Vec<DeletedTaskItem>,
    total: usize,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_deleted_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_deleted_ws_id(request.path)?;

    Some(match request.method {
        "GET" => workspaces_deleted_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn workspaces_deleted_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // --- Authenticate via workspace API key ---------------------------------
    let Some(api_key) = extract_api_key(request.authorization) else {
        return error_response(
            401,
            "Unauthorized",
            "Missing or invalid Authorization header. Expected: \"Authorization: Bearer <api_key>\"",
            "MISSING_API_KEY",
        );
    };

    let context = match validate_api_key(contact_data, outbound, &api_key).await {
        Ok(Some(context)) => context,
        // Both an invalid/expired key and an infrastructure failure surface as an
        // invalid key (fail closed), matching workspaces_2.rs.
        Ok(None) | Err(()) => {
            return error_response(
                401,
                "Unauthorized",
                "Invalid or expired API key",
                "INVALID_API_KEY",
            );
        }
    };

    // --- Permission gate: manage_projects -----------------------------------
    if !has_permission(&context.permissions, REQUIRED_PERMISSION) {
        return error_response(
            403,
            "Forbidden",
            "Insufficient permissions. Required: manage_projects",
            "INSUFFICIENT_PERMISSIONS",
        );
    }

    // --- Validate params (z.guid()) -----------------------------------------
    if !is_guid(raw_ws_id) {
        return error_response(400, "Bad Request", "Invalid workspace ID", "INVALID_PARAMS");
    }

    // --- Verify wsId matches the API key's workspace ------------------------
    if context.ws_id != raw_ws_id {
        return error_response(
            403,
            "Forbidden",
            "Workspace ID does not match API key workspace",
            "WORKSPACE_MISMATCH",
        );
    }

    // --- Compute the 30-day cutoff -----------------------------------------
    let Some(now_secs) = unix_now_secs() else {
        return error_response(
            500,
            "Internal Server Error",
            "An unexpected error occurred",
            "UNEXPECTED_ERROR",
        );
    };
    let cutoff_iso = iso_timestamp(now_secs - RETENTION_DAYS * SECONDS_PER_DAY);

    // --- Fetch deleted boards ----------------------------------------------
    let boards = match fetch_deleted_boards(contact_data, outbound, raw_ws_id, &cutoff_iso).await {
        Ok(boards) => boards,
        Err(()) => {
            return error_response(
                500,
                "Internal Server Error",
                "Failed to fetch deleted boards",
                "FETCH_BOARDS_ERROR",
            );
        }
    };

    // --- Fetch deleted tasks ------------------------------------------------
    let tasks = match fetch_deleted_tasks(contact_data, outbound, raw_ws_id, &cutoff_iso).await {
        Ok(tasks) => tasks,
        Err(()) => {
            return error_response(
                500,
                "Internal Server Error",
                "Failed to fetch deleted tasks",
                "FETCH_TASKS_ERROR",
            );
        }
    };

    let boards_with_days: Vec<DeletedBoardItem> = boards
        .into_iter()
        .map(|board| DeletedBoardItem {
            days_until_permanent_deletion: days_remaining(board.deleted_at.as_deref(), now_secs),
            id: board.id,
            name: board.name,
            deleted_at: board.deleted_at,
            created_at: board.created_at,
        })
        .collect();

    let tasks_with_days: Vec<DeletedTaskItem> = tasks
        .into_iter()
        .map(|task| DeletedTaskItem {
            days_until_permanent_deletion: days_remaining(task.deleted_at.as_deref(), now_secs),
            ..task
        })
        .collect();

    let total = boards_with_days.len() + tasks_with_days.len();

    no_store_response(json_response(
        200,
        DeletedItemsResponse {
            boards: boards_with_days,
            tasks: tasks_with_days,
            total,
        },
    ))
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

/// Mirrors the legacy query:
/// `workspace_boards.select('id, name, deleted_at, created_at')
///   .eq('ws_id', wsId).not('deleted_at','is',null)
///   .gte('deleted_at', cutoff).order('deleted_at', desc)`.
async fn fetch_deleted_boards(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    cutoff_iso: &str,
) -> Result<Vec<DeletedBoardRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_boards",
        &[
            ("select", "id,name,deleted_at,created_at".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("deleted_at", "not.is.null".to_owned()),
            ("deleted_at", format!("gte.{cutoff_iso}")),
            ("order", "deleted_at.desc".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<DeletedBoardRow>>().map_err(|_| ())
}

/// Mirrors the legacy query against `tasks` with an embedded
/// `task_lists!inner(id, name, workspace_boards!inner(id, name, ws_id))`,
/// filtered by `task_lists.workspace_boards.ws_id`, `deleted_at not null`, and
/// `deleted_at >= cutoff`, ordered by `deleted_at desc`. The embedded list /
/// board context is flattened into `list_name`, `board_id`, `board_name`.
async fn fetch_deleted_tasks(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    cutoff_iso: &str,
) -> Result<Vec<DeletedTaskItem>, ()> {
    let Some(url) = contact_data.rest_url(
        "tasks",
        &[
            (
                "select",
                "id,name,description,deleted_at,created_at,list_id,\
                 task_lists!inner(id,name,workspace_boards!inner(id,name,ws_id))"
                    .to_owned(),
            ),
            ("task_lists.workspace_boards.ws_id", format!("eq.{ws_id}")),
            ("deleted_at", "not.is.null".to_owned()),
            ("deleted_at", format!("gte.{cutoff_iso}")),
            ("order", "deleted_at.desc".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    Ok(rows.iter().map(transform_task).collect())
}

/// Flatten an embedded task row into the legacy response shape. PostgREST may
/// return the embedded `task_lists` / `workspace_boards` as either an object or
/// (for to-many relationships) an array; the legacy code handles both, so we
/// mirror that by taking the first element when an array is encountered.
fn transform_task(task: &Value) -> DeletedTaskItem {
    let task_list = first_embedded(task.get("task_lists"));
    let board = task_list.and_then(|list| first_embedded(list.get("workspace_boards")));

    DeletedTaskItem {
        id: string_field(task, "id"),
        name: string_field(task, "name"),
        description: string_field(task, "description"),
        deleted_at: string_field(task, "deleted_at"),
        created_at: string_field(task, "created_at"),
        list_id: string_field(task, "list_id"),
        list_name: task_list.and_then(|list| string_field(list, "name")),
        board_id: board.and_then(|board| string_field(board, "id")),
        board_name: board.and_then(|board| string_field(board, "name")),
        days_until_permanent_deletion: 0,
    }
}

/// Resolve an embedded relationship value to the underlying object. PostgREST
/// may return a to-one embed as an object or (for to-many relationships) an
/// array, so we take the first array element when an array is encountered.
/// Returns `None` when absent, null, empty, or not an object.
fn first_embedded(value: Option<&Value>) -> Option<&Value> {
    match value? {
        Value::Array(items) => items.first().filter(|item| item.is_object()),
        object @ Value::Object(_) => Some(object),
        _ => None,
    }
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_owned)
}

// ---------------------------------------------------------------------------
// API key auth (file-local copies of workspaces_2.rs helpers)
// ---------------------------------------------------------------------------

struct ApiKeyContext {
    ws_id: String,
    permissions: Vec<String>,
}

/// Extract the raw `ttr_` API key from the `Authorization` header.
/// Supports `Bearer <key>` (case-insensitive) and raw `ttr_...`.
fn extract_api_key(authorization: Option<&str>) -> Option<String> {
    let header = authorization?.trim();
    if header.is_empty() {
        return None;
    }

    if header.len() >= 7 && header[..7].eq_ignore_ascii_case("bearer ") {
        let token = header[7..].trim();
        return (!token.is_empty()).then(|| token.to_owned());
    }

    if header.starts_with(API_KEY_PREFIX) {
        return Some(header.to_owned());
    }

    None
}

/// Validate the API key and, on success, return its workspace id plus the
/// resolved permission set (role permissions ∪ workspace default permissions).
///
/// Returns `Ok(Some(context))` for a valid, unexpired key, `Ok(None)` for an
/// invalid/expired key, and `Err(())` for an infrastructure failure.
async fn validate_api_key(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    api_key: &str,
) -> Result<Option<ApiKeyContext>, ()> {
    if !api_key.starts_with(API_KEY_PREFIX) {
        return Ok(None);
    }
    if api_key.len() < API_KEY_LOOKUP_PREFIX_LEN {
        return Ok(None);
    }
    let key_prefix = &api_key[..API_KEY_LOOKUP_PREFIX_LEN];

    let Some(url) = contact_data.rest_url(
        "workspace_api_keys",
        &[
            ("select", "id,ws_id,key_hash,role_id,expires_at".to_owned()),
            ("key_prefix", format!("eq.{key_prefix}")),
            ("or", "(expires_at.is.null,expires_at.gt.now())".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<ApiKeyRow>>().map_err(|_| ())?;

    for row in rows {
        let Some(stored_hash) = row.key_hash.as_deref() else {
            continue;
        };
        if !validate_api_key_hash(api_key, stored_hash) {
            continue;
        }
        let Some(ws_id) = row.ws_id.filter(|id| !id.trim().is_empty()) else {
            return Ok(None);
        };
        let role_id = row.role_id.filter(|id| !id.trim().is_empty());

        let permissions =
            resolve_api_key_permissions(contact_data, outbound, &ws_id, role_id.as_deref()).await?;

        return Ok(Some(ApiKeyContext { ws_id, permissions }));
    }

    Ok(None)
}

/// Resolve the permission set for an API key, mirroring `validateApiKey` in
/// `packages/auth/src/api-keys.ts`: role permissions (if a role is assigned)
/// unioned with the workspace's `MEMBER` default permissions.
async fn resolve_api_key_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    role_id: Option<&str>,
) -> Result<Vec<String>, ()> {
    let mut permissions = Vec::new();

    if let Some(role_id) = role_id {
        let role_permissions =
            fetch_role_permissions(contact_data, outbound, ws_id, role_id).await?;
        for permission in role_permissions {
            permissions.push(permission);
        }
    }

    let default_permissions = fetch_default_permissions(contact_data, outbound, ws_id).await?;
    for permission in default_permissions {
        if !permissions.iter().any(|value| value == &permission) {
            permissions.push(permission);
        }
    }

    Ok(permissions)
}

async fn fetch_role_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    role_id: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_role_permissions",
        &[
            ("select", "permission".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("role_id", format!("eq.{role_id}")),
            ("enabled", "eq.true".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<PermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
}

async fn fetch_default_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_default_permissions",
        &[
            ("select", "permission".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("member_type", "eq.MEMBER".to_owned()),
            ("enabled", "eq.true".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<PermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
}

/// `admin` grants every permission; otherwise the permission must be present.
/// Mirrors `hasPermission` / `hasAllPermissions` in `packages/auth/src/api-keys.ts`.
fn has_permission(permissions: &[String], required: &str) -> bool {
    permissions.iter().any(|value| value == ADMIN_PERMISSION)
        || permissions.iter().any(|value| value == required)
}

/// Validate a raw API key against a stored `salt:hash` value using scrypt.
///
/// MUST mirror `validateApiKeyHash` in `packages/auth/src/api-keys.ts`:
///   - split `stored_hash` on ':' into (salt, hash_hex)
///   - derive = scrypt(key, salt /* raw ascii, NOT decoded */,
///     N=16384, r=8, p=1, dklen=64)  // node:crypto default params
///   - constant-time compare derive == hex_decode(hash_hex)
///
/// NOTE: `scrypt` is not a current dependency of `apps/backend` and Cargo.toml
/// edits are out of scope for this port, so this implementation cannot derive
/// the hash and FAILS CLOSED (returns `false`). The integrator must add a
/// `scrypt` crate and implement the derivation here for the route to work.
/// (Identical to the stub in `workspaces_2.rs`.)
fn validate_api_key_hash(_api_key: &str, stored_hash: &str) -> bool {
    let mut parts = stored_hash.splitn(2, ':');
    let (Some(salt), Some(hash)) = (parts.next(), parts.next()) else {
        return false;
    };
    if salt.is_empty() || hash.is_empty() {
        return false;
    }

    // TODO(integrator): implement scrypt derivation (N=16384, r=8, p=1, dklen=64)
    // and constant-time compare against hex_decode(hash). Until then, fail closed.
    false
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

// ---------------------------------------------------------------------------
// Time / formatting helpers
// ---------------------------------------------------------------------------

fn unix_now_secs() -> Option<i64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_secs() as i64)
}

/// Format a unix-second timestamp as an ISO-8601 UTC string with millisecond
/// precision (e.g. `2026-06-24T12:00:00.000Z`), matching the legacy
/// `Date.toISOString()` cutoff format expected by PostgREST.
fn iso_timestamp(secs: i64) -> String {
    let (year, month, day, hour, minute, second) = civil_from_unix(secs);
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.000Z")
}

/// Days remaining until permanent deletion: `max(0, floor((deleted_at + 30d -
/// now) / day))`. Mirrors the legacy `calculateDaysRemaining`: a missing or
/// unparseable timestamp yields 0.
fn days_remaining(deleted_at: Option<&str>, now_secs: i64) -> i64 {
    let Some(deleted_at) = deleted_at else {
        return 0;
    };
    let Some(deleted_secs) = parse_iso_to_unix_secs(deleted_at) else {
        return 0;
    };

    let auto_delete = deleted_secs + RETENTION_DAYS * SECONDS_PER_DAY;
    let remaining = (auto_delete - now_secs).div_euclid(SECONDS_PER_DAY);
    remaining.max(0)
}

/// Parse a subset of ISO-8601 timestamps (`YYYY-MM-DDTHH:MM:SS[.fff][Z|+oo:oo]`)
/// into unix seconds. PostgreSQL returns timestamps in this form. Returns `None`
/// for anything we cannot parse so the caller can fall back to 0 days.
fn parse_iso_to_unix_secs(value: &str) -> Option<i64> {
    let bytes = value.as_bytes();
    if bytes.len() < 19 {
        return None;
    }
    // Expect `YYYY-MM-DDTHH:MM:SS`; the date/time separator may be 'T' or ' '.
    if !(bytes[10] == b'T' || bytes[10] == b' ') {
        return None;
    }
    if bytes[4] != b'-' || bytes[7] != b'-' || bytes[13] != b':' || bytes[16] != b':' {
        return None;
    }

    let year: i64 = value.get(0..4)?.parse().ok()?;
    let month: i64 = value.get(5..7)?.parse().ok()?;
    let day: i64 = value.get(8..10)?.parse().ok()?;
    let hour: i64 = value.get(11..13)?.parse().ok()?;
    let minute: i64 = value.get(14..16)?.parse().ok()?;
    let second: i64 = value.get(17..19)?.parse().ok()?;

    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    let base = unix_from_civil(year, month, day) + hour * 3600 + minute * 60 + second;

    // Apply a trailing timezone offset if present (default: UTC).
    let offset_secs = parse_trailing_offset_secs(&value[19..]);
    Some(base - offset_secs)
}

/// Parse a trailing timezone offset such as `+07:00`, `-0530`, or `Z`. Any
/// leading fractional-seconds portion (`.123`) is skipped. Returns the offset in
/// seconds to SUBTRACT from local time to reach UTC (so `+07:00` → 25200).
fn parse_trailing_offset_secs(tail: &str) -> i64 {
    let mut rest = tail;
    if let Some(stripped) = rest.strip_prefix('.') {
        let digits_end = stripped
            .find(|c: char| !c.is_ascii_digit())
            .unwrap_or(stripped.len());
        rest = &stripped[digits_end..];
    }

    let rest = rest.trim();
    if rest.is_empty() || rest == "Z" || rest == "z" {
        return 0;
    }

    let (sign, body) = match rest.as_bytes().first() {
        Some(b'+') => (1, &rest[1..]),
        Some(b'-') => (-1, &rest[1..]),
        _ => return 0,
    };

    let digits: Vec<char> = body.chars().filter(|c| c.is_ascii_digit()).collect();
    let (offset_hours, offset_minutes) = match digits.len() {
        2 => (digit_pair(&digits, 0), 0),
        4 => (digit_pair(&digits, 0), digit_pair(&digits, 2)),
        _ => (0, 0),
    };

    sign * (offset_hours * 3600 + offset_minutes * 60)
}

fn digit_pair(digits: &[char], start: usize) -> i64 {
    let tens = digits.get(start).and_then(|c| c.to_digit(10)).unwrap_or(0) as i64;
    let ones = digits
        .get(start + 1)
        .and_then(|c| c.to_digit(10))
        .unwrap_or(0) as i64;
    tens * 10 + ones
}

/// Days since the Unix epoch for a proleptic-Gregorian civil date.
/// Based on Howard Hinnant's `days_from_civil` algorithm.
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn unix_from_civil(year: i64, month: i64, day: i64) -> i64 {
    days_from_civil(year, month, day) * SECONDS_PER_DAY
}

/// Inverse of `days_from_civil`, returning `(year, month, day, hour, min, sec)`.
fn civil_from_unix(secs: i64) -> (i64, i64, i64, i64, i64, i64) {
    let days = secs.div_euclid(SECONDS_PER_DAY);
    let rem = secs.rem_euclid(SECONDS_PER_DAY);
    let hour = rem / 3600;
    let minute = (rem % 3600) / 60;
    let second = rem % 60;

    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { y + 1 } else { y };

    (year, month, day, hour, minute, second)
}

// ---------------------------------------------------------------------------
// Path matching / GUID validation / error helpers
// ---------------------------------------------------------------------------

/// Match `/api/v1/workspaces/:wsId/deleted`: a single dynamic segment followed
/// by `/deleted` and nothing else.
fn workspaces_deleted_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_DELETED_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_DELETED_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

/// Validate a value against `z.guid()`: a canonical 8-4-4-4-12 hex UUID with
/// dashes (case-insensitive). `z.guid()` does not enforce RFC version/variant
/// bits, so neither do we.
fn is_guid(value: &str) -> bool {
    value.len() == 36
        && value
            .chars()
            .enumerate()
            .all(|(index, character)| match index {
                8 | 13 | 18 | 23 => character == '-',
                _ => character.is_ascii_hexdigit(),
            })
}

fn error_response(status: u16, error: &str, message: &str, code: &str) -> BackendResponse {
    no_store_response(json_response(
        status,
        json!({
            "error": error,
            "message": message,
            "code": code,
        }),
    ))
}
