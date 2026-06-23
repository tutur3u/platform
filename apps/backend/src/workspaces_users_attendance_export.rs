//! Port of `/api/v1/workspaces/[wsId]/users/attendance/export` (GET only).
//!
//! Mirrors the legacy Next.js route:
//! - Resolves the workspace from the dynamic `:wsId` segment (slug/handle/uuid),
//!   returning 404 when it cannot be resolved (legacy `getWorkspace` -> null).
//! - Computes the caller's effective workspace permissions (role + default
//!   permissions, plus implicit `admin`/creator handling), mirroring
//!   `getPermissions` + `containsPermission`.
//! - Requires `check_user_attendance` (403 otherwise) and gates
//!   `view_users_private_info` for the email column.
//! - Validates `startDate`/`endDate` (YYYY-MM-DD, start <= end) and
//!   `offset`/`limit` search params (400 on invalid input).
//! - Reads `user_group_attendance` (service role / admin client, like the
//!   legacy `createAdminClient`) with embedded `user`/`group`, ranged by
//!   `offset..offset+limit`, and returns `{ data, count, nextOffset }`.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const WORKSPACE_NOT_FOUND_MESSAGE: &str = "Workspace not found";
const NOT_FOUND_MESSAGE: &str = "Not found";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient permissions to export attendance";
const INVALID_SEARCH_PARAMS_MESSAGE: &str = "Invalid search params";
const EXPORT_ERROR_MESSAGE: &str = "Error exporting attendance";

const CHECK_USER_ATTENDANCE_PERMISSION: &str = "check_user_attendance";
const VIEW_USERS_PRIVATE_INFO_PERMISSION: &str = "view_users_private_info";

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/users/attendance/export";

const DEFAULT_OFFSET: i64 = 0;
const DEFAULT_LIMIT: i64 = 500;
const MIN_LIMIT: i64 = 1;
const MAX_LIMIT: i64 = 1000;

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
struct WorkspaceCreatorRow {
    creator_id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceDefaultPermissionRow {
    permission: Option<String>,
}

struct AuthenticatedUser {
    access_token: Option<String>,
    id: String,
}

enum DataAuth<'a> {
    AccessToken(&'a str),
    ServiceRole,
}

struct ExportQuery {
    start_date: String,
    end_date: String,
    offset: i64,
    limit: i64,
}

#[derive(Serialize)]
struct AttendanceExportRow {
    date: Option<String>,
    status: Option<String>,
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
    notes: String,
    #[serde(rename = "userId")]
    user_id: String,
    #[serde(rename = "userName")]
    user_name: String,
    #[serde(rename = "userDisplayName")]
    user_display_name: Option<String>,
    #[serde(rename = "userFullName")]
    user_full_name: Option<String>,
    #[serde(rename = "userEmail")]
    user_email: Option<String>,
    #[serde(rename = "groupId")]
    group_id: String,
    #[serde(rename = "groupName")]
    group_name: Option<String>,
}

pub(crate) async fn handle_workspaces_users_attendance_export_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = export_ws_id(request.path)?;

    Some(match request.method {
        "GET" => export_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn export_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(user) = authenticated_user(config, request, outbound).await else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };

    // getWorkspace -> null => 404 "Workspace not found".
    let resolved_ws_id =
        match normalize_workspace_id(&config.contact_data, outbound, raw_ws_id, &user).await {
            Ok(Some(ws_id)) => ws_id,
            Ok(None) | Err(()) => return error_response(404, WORKSPACE_NOT_FOUND_MESSAGE),
        };

    // getPermissions(...) -> null => 404 "Not found". This happens when the
    // workspace cannot be loaded for the caller (no membership row resolved).
    let Some(permissions) =
        resolve_permissions(&config.contact_data, outbound, &resolved_ws_id, &user).await
    else {
        return error_response(404, NOT_FOUND_MESSAGE);
    };

    if !contains_permission(&permissions, CHECK_USER_ATTENDANCE_PERMISSION) {
        return message_response(403, INSUFFICIENT_PERMISSIONS_MESSAGE);
    }

    let query = match parse_export_query(request.url) {
        Ok(query) => query,
        Err(issues) => {
            return no_store_response(json_response(
                400,
                json!({
                    "message": INVALID_SEARCH_PARAMS_MESSAGE,
                    "issues": issues,
                }),
            ));
        }
    };

    let can_view_private_info =
        contains_permission(&permissions, VIEW_USERS_PRIVATE_INFO_PERMISSION);

    match fetch_attendance(
        &config.contact_data,
        outbound,
        &resolved_ws_id,
        &query,
        can_view_private_info,
    )
    .await
    {
        Ok((rows, count)) => {
            let next_offset = if !rows.is_empty() && query.offset + (rows.len() as i64) < count {
                Some(query.offset + rows.len() as i64)
            } else {
                None
            };

            // Mirror legacy `nextOffset?: number` shape: the key is omitted
            // entirely (rather than serialized as null) when there is no next
            // page, matching `JSON.stringify` dropping `undefined` values.
            let mut payload = serde_json::Map::new();
            payload.insert(
                "data".to_owned(),
                serde_json::to_value(&rows).unwrap_or(Value::Null),
            );
            payload.insert("count".to_owned(), json!(count));
            if let Some(next_offset) = next_offset {
                payload.insert("nextOffset".to_owned(), json!(next_offset));
            }

            no_store_response(json_response(200, Value::Object(payload)))
        }
        Err(()) => message_response(500, EXPORT_ERROR_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

async fn authenticated_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<AuthenticatedUser> {
    let access_token = supabase_auth::request_access_token(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;
    let id = non_empty_user_id(user.id?)?;

    Some(AuthenticatedUser {
        access_token: Some(access_token),
        id,
    })
}

fn non_empty_user_id(user_id: String) -> Option<String> {
    (!user_id.trim().is_empty()).then_some(user_id)
}

// ---------------------------------------------------------------------------
// Permissions (mirrors getPermissions + containsPermission)
// ---------------------------------------------------------------------------

/// Returns the caller's effective permission set, or `None` when the workspace
/// cannot be resolved for the caller (mirroring `getPermissions` -> null).
async fn resolve_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user: &AuthenticatedUser,
) -> Option<Vec<String>> {
    let membership_type = workspace_membership_type(contact_data, outbound, ws_id, user)
        .await
        .ok()??;

    let creator = workspace_creator(contact_data, outbound, ws_id)
        .await
        .ok()??;

    let role_permissions = if membership_type == "MEMBER" {
        workspace_role_permissions(contact_data, outbound, ws_id, &user.id)
            .await
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    let default_permissions =
        workspace_default_permissions(contact_data, outbound, ws_id, &membership_type)
            .await
            .unwrap_or_default();
    let is_creator = membership_type == "MEMBER" && creator.as_deref() == Some(&user.id);

    let mut permissions = Vec::new();
    extend_unique_permissions(&mut permissions, role_permissions);
    extend_unique_permissions(&mut permissions, default_permissions);

    if is_creator && !permissions.iter().any(|value| value == "admin") {
        permissions.push("admin".to_owned());
    }

    Some(permissions)
}

/// `containsPermission(p)` returns true when the permission set includes `admin`
/// or the requested permission.
fn contains_permission(permissions: &[String], permission: &str) -> bool {
    permissions.iter().any(|value| value == "admin")
        || permissions.iter().any(|value| value == permission)
}

// ---------------------------------------------------------------------------
// Workspace resolution
// ---------------------------------------------------------------------------

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user: &AuthenticatedUser,
) -> Result<Option<String>, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user).await;
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(Some(resolved_ws_id));
        }

        if let Some(access_token) = user.access_token.as_deref()
            && let Some(workspace_id) = workspace_id_by_handle(
                contact_data,
                outbound,
                &handle,
                &DataAuth::AccessToken(access_token),
            )
            .await?
        {
            return Ok(Some(workspace_id));
        }

        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, &DataAuth::ServiceRole).await?
        {
            return Ok(Some(workspace_id));
        }
    }

    Ok(Some(resolved_ws_id))
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user: &AuthenticatedUser,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id,workspace_members!inner(user_id,type)".to_owned(),
            ),
            ("personal", "eq.true".to_owned()),
            ("workspace_members.user_id", format!("eq.{}", user.id)),
            ("workspace_members.type", "eq.MEMBER".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let auth = user
        .access_token
        .as_deref()
        .map_or(DataAuth::ServiceRole, DataAuth::AccessToken);
    let response = send_rest_request(contact_data, outbound, &url, &auth).await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    decode_first_row::<WorkspaceIdRow>(&response).map(|row| row.and_then(|row| row.id))
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    auth: &DataAuth<'_>,
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
    let response = send_rest_request(contact_data, outbound, &url, auth).await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    decode_first_row::<WorkspaceIdRow>(&response).map(|row| row.and_then(|row| row.id))
}

async fn workspace_membership_type(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user: &AuthenticatedUser,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{}", user.id)),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let auth = user
        .access_token
        .as_deref()
        .map_or(DataAuth::ServiceRole, DataAuth::AccessToken);
    let response = send_rest_request(contact_data, outbound, &url, &auth).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    decode_first_row::<WorkspaceMembershipRow>(&response)
        .map(|row| row.map(|row| row.membership_type.unwrap_or_else(|| "MEMBER".to_owned())))
}

async fn workspace_creator(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Option<Option<String>>, ()> {
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
    let response = send_rest_request(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    decode_first_row::<WorkspaceCreatorRow>(&response).map(|row| row.map(|row| row.creator_id))
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
    let response = send_rest_request(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;

    if !is_success_status(response.status) {
        return Ok(Vec::new());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    let mut permissions = Vec::new();
    for row in rows {
        collect_role_permissions(&row, &mut permissions);
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
    let response = send_rest_request(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;

    if !is_success_status(response.status) {
        return Ok(Vec::new());
    }

    Ok(response
        .json::<Vec<WorkspaceDefaultPermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
}

// ---------------------------------------------------------------------------
// Attendance export query
// ---------------------------------------------------------------------------

async fn fetch_attendance(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &ExportQuery,
    can_view_private_info: bool,
) -> Result<(Vec<AttendanceExportRow>, i64), ()> {
    let user_fields = if can_view_private_info {
        "id, display_name, full_name, email"
    } else {
        "id, display_name, full_name"
    };

    let select = format!(
        "date,session_id,status,notes,\
         user:workspace_users!user_group_attendance_user_id_fkey!inner({user_fields}),\
         group:workspace_user_groups!user_group_attendance_group_id_fkey!inner(id, name)"
    );

    let Some(url) = contact_data.rest_url(
        "user_group_attendance",
        &[
            ("select", select),
            ("group.ws_id", format!("eq.{ws_id}")),
            ("user.ws_id", format!("eq.{ws_id}")),
            ("date", format!("gte.{}", query.start_date)),
            ("date", format!("lte.{}", query.end_date)),
            ("order", "date.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let start = query.offset;
    let end = query.offset + query.limit - 1;
    let range = format!("{start}-{end}");

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Range-Unit", "items")
                .with_header("Range", &range)
                .with_header("Prefer", "count=exact"),
        )
        .await
        .map_err(|_| ())?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let count = total_count_from_content_range(&response).unwrap_or(0);
    let raw_rows = response.json::<Vec<Value>>().map_err(|_| ())?;

    let rows = raw_rows
        .into_iter()
        .map(|row| map_attendance_row(&row, can_view_private_info))
        .collect();

    Ok((rows, count))
}

fn map_attendance_row(row: &Value, can_view_private_info: bool) -> AttendanceExportRow {
    let user = row.get("user");
    let group = row.get("group");

    let user_id = user
        .and_then(|user| user.get("id"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned();
    let display_name = string_field(user, "display_name");
    let full_name = string_field(user, "full_name");
    let email = string_field(user, "email");

    // userName: full_name || display_name || email || id || ''
    let user_name = trimmed_non_empty(full_name.as_deref())
        .or_else(|| trimmed_non_empty(display_name.as_deref()))
        .or_else(|| trimmed_non_empty(email.as_deref()))
        .unwrap_or_else(|| {
            if user_id.is_empty() {
                String::new()
            } else {
                user_id.clone()
            }
        });

    AttendanceExportRow {
        date: string_field(Some(row), "date"),
        status: string_field(Some(row), "status"),
        session_id: string_field(Some(row), "session_id"),
        notes: string_field(Some(row), "notes").unwrap_or_default(),
        user_id,
        user_name,
        user_display_name: display_name,
        user_full_name: full_name,
        user_email: if can_view_private_info { email } else { None },
        group_id: group
            .and_then(|group| group.get("id"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned(),
        group_name: string_field(group, "name"),
    }
}

fn string_field(value: Option<&Value>, key: &str) -> Option<String> {
    value
        .and_then(|value| value.get(key))
        .and_then(Value::as_str)
        .map(str::to_owned)
}

fn trimmed_non_empty(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

// ---------------------------------------------------------------------------
// Search-params validation (mirrors SearchParamsSchema)
// ---------------------------------------------------------------------------

fn parse_export_query(request_url: Option<&str>) -> Result<ExportQuery, Vec<Value>> {
    let url = request_url.and_then(|url| url::Url::parse(url).ok());
    let mut issues = Vec::new();

    let start_date = query_value(url.as_ref(), "startDate").unwrap_or_default();
    let end_date = query_value(url.as_ref(), "endDate").unwrap_or_default();

    if !is_iso_date(&start_date) {
        issues.push(json!({
            "code": "invalid_string",
            "path": ["startDate"],
            "message": "Invalid",
        }));
    }
    if !is_iso_date(&end_date) {
        issues.push(json!({
            "code": "invalid_string",
            "path": ["endDate"],
            "message": "Invalid",
        }));
    }

    let offset = match parse_bounded_int(query_value(url.as_ref(), "offset"), DEFAULT_OFFSET) {
        Some(value) if value >= 0 => Some(value),
        Some(_) => {
            issues.push(json!({
                "code": "too_small",
                "path": ["offset"],
                "message": "Number must be greater than or equal to 0",
            }));
            None
        }
        None => {
            issues.push(json!({
                "code": "invalid_type",
                "path": ["offset"],
                "message": "Expected number",
            }));
            None
        }
    };

    let limit = match parse_bounded_int(query_value(url.as_ref(), "limit"), DEFAULT_LIMIT) {
        Some(value) if (MIN_LIMIT..=MAX_LIMIT).contains(&value) => Some(value),
        Some(_) => {
            issues.push(json!({
                "code": "too_small",
                "path": ["limit"],
                "message": "Number must be between 1 and 1000",
            }));
            None
        }
        None => {
            issues.push(json!({
                "code": "invalid_type",
                "path": ["limit"],
                "message": "Expected number",
            }));
            None
        }
    };

    // start <= end refinement.
    if issues.is_empty() && start_date > end_date {
        issues.push(json!({
            "code": "custom",
            "path": ["endDate"],
            "message": "Start date must be before or equal to end date",
        }));
    }

    if !issues.is_empty() {
        return Err(issues);
    }

    Ok(ExportQuery {
        start_date,
        end_date,
        offset: offset.unwrap_or(DEFAULT_OFFSET),
        limit: limit.unwrap_or(DEFAULT_LIMIT),
    })
}

/// Mirrors `z.coerce.number().int()` for query strings: empty/absent -> default,
/// otherwise parse and floor; non-numeric returns `None` (invalid type).
fn parse_bounded_int(value: Option<String>, default: i64) -> Option<i64> {
    match value {
        None => Some(default),
        Some(value) if value.trim().is_empty() => Some(0),
        Some(value) => value
            .trim()
            .parse::<f64>()
            .ok()
            .filter(|parsed| parsed.is_finite())
            .map(|parsed| parsed.trunc() as i64),
    }
}

fn is_iso_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes.iter().enumerate().all(|(index, byte)| match index {
            4 | 7 => *byte == b'-',
            _ => byte.is_ascii_digit(),
        })
}

// ---------------------------------------------------------------------------
// Shared REST helpers
// ---------------------------------------------------------------------------

async fn send_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    auth: &DataAuth<'_>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = match auth {
        DataAuth::AccessToken(access_token) => format!("Bearer {access_token}"),
        DataAuth::ServiceRole => format!("Bearer {service_role_key}"),
    };

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

fn total_count_from_content_range(response: &OutboundResponse) -> Option<i64> {
    let header = response.header("content-range")?;
    let (_, total) = header.rsplit_once('/')?;

    total.trim().parse::<i64>().ok()
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

fn extend_unique_permissions(permissions: &mut Vec<String>, values: Vec<String>) {
    for permission in values {
        if !permissions.iter().any(|value| value == &permission) {
            permissions.push(permission);
        }
    }
}

fn query_value(url: Option<&url::Url>, key: &str) -> Option<String> {
    url?.query_pairs()
        .find_map(|(name, value)| (name == key).then(|| value.into_owned()))
}

// ---------------------------------------------------------------------------
// Path matching + workspace-id normalization helpers
// ---------------------------------------------------------------------------

fn export_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
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
            .all(|(index, value)| match index {
                8 | 13 | 18 | 23 => value == '-',
                _ => value.is_ascii_hexdigit(),
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

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn decode_first_row<T: for<'de> Deserialize<'de>>(
    response: &OutboundResponse,
) -> Result<Option<T>, ()> {
    response
        .json::<Vec<T>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
