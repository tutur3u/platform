use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const ADMIN_PERMISSION: &str = "admin";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const INVENTORY_APP_SESSION_TARGETS: [&str; 1] = ["inventory"];
const LOAD_FAILED_MESSAGE: &str = "Failed to load Polar sync summary";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const NOT_FOUND_MESSAGE: &str = "Not found";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const PRIVATE_SCHEMA: &str = "private";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const WORKSPACES_INVENTORY_POLAR_PRODUCT_SYNC_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_INVENTORY_POLAR_PRODUCT_SYNC_PATH_SUFFIX: &str = "/inventory/polar-product-sync";

// `canViewInventoryDashboard` permission set: any of these grant view access.
const VIEW_INVENTORY_DASHBOARD_PERMISSIONS: [&str; 2] =
    ["view_inventory_dashboard", "view_inventory"];

const MAX_ERRORS: usize = 8;

#[derive(Default, Serialize)]
struct PolarSyncStatusCounts {
    synced: u64,
    pending: u64,
    error: u64,
    disabled: u64,
    total: u64,
}

#[derive(Serialize)]
struct PolarSyncErrorEntry {
    kind: &'static str,
    name: String,
    error: String,
    #[serde(rename = "syncedAt")]
    synced_at: Option<String>,
}

#[derive(Serialize)]
struct PolarProductSyncSummary {
    listings: PolarSyncStatusCounts,
    bundles: PolarSyncStatusCounts,
    errors: Vec<PolarSyncErrorEntry>,
    #[serde(rename = "lastSyncedAt")]
    last_synced_at: Option<String>,
}

#[derive(Deserialize)]
struct ListingSyncRow {
    title: Option<String>,
    polar_sync_status: Option<String>,
    polar_synced_at: Option<String>,
    polar_last_error: Option<String>,
}

#[derive(Deserialize)]
struct BundleSyncRow {
    name: Option<String>,
    polar_sync_status: Option<String>,
    polar_synced_at: Option<String>,
    polar_last_error: Option<String>,
}

#[derive(Deserialize)]
struct PermissionRow {
    permission: Option<String>,
}

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

#[derive(Clone, Debug, Eq, PartialEq)]
struct InventoryUser {
    access_token: Option<String>,
    id: String,
}

enum DataAuth<'a> {
    AccessToken(&'a str),
    ServiceRole,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum MembershipCheck {
    Member,
    NotMember,
}

struct EffectivePermissions {
    has_all_permissions: bool,
    permissions: Vec<String>,
}

pub(crate) async fn handle_workspaces_inventory_polar_product_sync_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_inventory_polar_product_sync_ws_id(request.path)?;

    Some(match request.method {
        "GET" => polar_product_sync_response(config, request, raw_ws_id, outbound).await,
        // Other methods (e.g. POST) are still served by the live Next.js route;
        // fall through by returning None for everything we have not migrated.
        _ => return None,
    })
}

async fn polar_product_sync_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !config.contact_data.configured() {
        return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE);
    }

    let Some(user) = authenticated_inventory_user(config, request, outbound).await else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };

    let resolved_ws_id =
        match normalize_workspace_id(&config.contact_data, outbound, raw_ws_id, &user).await {
            Ok(Some(ws_id)) => ws_id,
            // `normalizeWorkspaceId` throwing maps to 404 `{ error: "Not found" }`.
            Ok(None) | Err(()) => return error_response(404, NOT_FOUND_MESSAGE),
        };

    // `verifyWorkspaceMembershipType` (default requiredType = MEMBER).
    match member_membership_check(&config.contact_data, outbound, &resolved_ws_id, &user).await {
        Ok(MembershipCheck::Member) => {}
        Ok(MembershipCheck::NotMember) => return message_response(403, FORBIDDEN_MESSAGE),
        Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    // `getPermissions` returns null when the caller has no resolvable
    // permissions, which the legacy route surfaces as 404 `{ error: "Not found" }`.
    let permissions =
        match effective_permissions(&config.contact_data, outbound, &resolved_ws_id, &user).await {
            Ok(Some(permissions)) => permissions,
            Ok(None) | Err(()) => return error_response(404, NOT_FOUND_MESSAGE),
        };

    // `canViewInventoryDashboard` gate -> 403 `{ message: "Forbidden" }`.
    let can_view = permissions.has_all_permissions
        || permissions
            .permissions
            .iter()
            .any(|value| VIEW_INVENTORY_DASHBOARD_PERMISSIONS.contains(&value.as_str()));
    if !can_view {
        return message_response(403, FORBIDDEN_MESSAGE);
    }

    // Any failure to read the sync summary maps to the legacy catch ->
    // 500 `{ message: "Failed to load Polar sync summary" }`.
    match polar_product_sync_summary(&config.contact_data, outbound, &resolved_ws_id).await {
        Ok(summary) => no_store_response(json_response(200, summary)),
        Err(()) => message_response(500, LOAD_FAILED_MESSAGE),
    }
}

async fn polar_product_sync_summary(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<PolarProductSyncSummary, ()> {
    let mut listings = PolarSyncStatusCounts::default();
    let mut bundles = PolarSyncStatusCounts::default();
    let mut errors: Vec<PolarSyncErrorEntry> = Vec::new();
    let mut last_synced_at: Option<String> = None;

    let listing_rows = fetch_listing_sync_rows(contact_data, outbound, ws_id).await?;
    for row in listing_rows {
        tally(
            &mut listings,
            &mut errors,
            &mut last_synced_at,
            "listing",
            row.title.unwrap_or_default(),
            row.polar_sync_status,
            row.polar_synced_at,
            row.polar_last_error,
        );
    }

    let bundle_rows = fetch_bundle_sync_rows(contact_data, outbound, ws_id).await?;
    for row in bundle_rows {
        tally(
            &mut bundles,
            &mut errors,
            &mut last_synced_at,
            "bundle",
            row.name.unwrap_or_default(),
            row.polar_sync_status,
            row.polar_synced_at,
            row.polar_last_error,
        );
    }

    errors.truncate(MAX_ERRORS);

    Ok(PolarProductSyncSummary {
        listings,
        bundles,
        errors,
        last_synced_at,
    })
}

#[allow(clippy::too_many_arguments)]
fn tally(
    counts: &mut PolarSyncStatusCounts,
    errors: &mut Vec<PolarSyncErrorEntry>,
    last_synced_at: &mut Option<String>,
    kind: &'static str,
    name: String,
    polar_sync_status: Option<String>,
    polar_synced_at: Option<String>,
    polar_last_error: Option<String>,
) {
    counts.total += 1;

    // Legacy: `status = polar_sync_status ?? 'pending'`, then only counts when
    // it is one of the known statuses.
    let status = polar_sync_status
        .as_deref()
        .filter(|value| !value.is_empty())
        .unwrap_or("pending");
    match status {
        "synced" => counts.synced += 1,
        "pending" => counts.pending += 1,
        "error" => counts.error += 1,
        "disabled" => counts.disabled += 1,
        _ => {}
    }

    if let Some(synced_at) = polar_synced_at.as_deref() {
        let newer = last_synced_at
            .as_deref()
            .is_none_or(|current| synced_at > current);
        if newer {
            *last_synced_at = Some(synced_at.to_owned());
        }
    }

    // Legacy: pushes an error entry only when the raw status is exactly "error"
    // and `polar_last_error` is truthy.
    if polar_sync_status.as_deref() == Some("error") {
        if let Some(error) = polar_last_error.filter(|value| !value.is_empty()) {
            errors.push(PolarSyncErrorEntry {
                kind,
                name,
                error,
                synced_at: polar_synced_at,
            });
        }
    }
}

async fn fetch_listing_sync_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<ListingSyncRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "inventory_storefront_listings",
        &[
            (
                "select",
                "title,polar_sync_status,polar_synced_at,polar_last_error".to_owned(),
            ),
            ("ws_id", format!("eq.{ws_id}")),
            ("status", "neq.archived".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_private_service_role_request(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<ListingSyncRow>>().map_err(|_| ())
}

async fn fetch_bundle_sync_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<BundleSyncRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "inventory_bundles",
        &[
            (
                "select",
                "name,polar_sync_status,polar_synced_at,polar_last_error".to_owned(),
            ),
            ("ws_id", format!("eq.{ws_id}")),
            ("status", "neq.archived".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_private_service_role_request(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<BundleSyncRow>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Auth + workspace resolution helpers (copied from the inventory-access route's
// private fns so this module stays self-contained; see notes).
// ---------------------------------------------------------------------------

async fn authenticated_inventory_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<InventoryUser> {
    if contact::request_has_app_session_token(request) {
        let identity =
            contact::resolve_app_session_identity(config, request, &INVENTORY_APP_SESSION_TARGETS)
                .ok()?;

        return non_empty_user_id(identity.id).map(|id| InventoryUser {
            access_token: None,
            id,
        });
    }

    let access_token = supabase_auth::request_access_token(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;
    let id = non_empty_user_id(user.id?)?;

    Some(InventoryUser {
        access_token: Some(access_token),
        id,
    })
}

fn non_empty_user_id(user_id: String) -> Option<String> {
    (!user_id.trim().is_empty()).then_some(user_id)
}

async fn member_membership_check(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user: &InventoryUser,
) -> Result<MembershipCheck, ()> {
    let Some(membership_type) =
        workspace_membership_type(contact_data, outbound, ws_id, user).await?
    else {
        return Ok(MembershipCheck::NotMember);
    };

    if membership_type == "MEMBER" {
        Ok(MembershipCheck::Member)
    } else {
        Ok(MembershipCheck::NotMember)
    }
}

async fn effective_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user: &InventoryUser,
) -> Result<Option<EffectivePermissions>, ()> {
    let Some(membership_type) =
        workspace_membership_type(contact_data, outbound, ws_id, user).await?
    else {
        return Ok(None);
    };
    let Some(workspace) = workspace_row(contact_data, outbound, ws_id).await? else {
        return Ok(None);
    };

    let role_permissions = if membership_type == "MEMBER" {
        workspace_role_permissions(contact_data, outbound, ws_id, &user.id).await?
    } else {
        Vec::new()
    };
    let default_permissions =
        workspace_default_permissions(contact_data, outbound, ws_id, &membership_type).await?;
    let is_creator =
        membership_type == "MEMBER" && workspace.creator_id.as_deref() == Some(user.id.as_str());

    if !is_creator && role_permissions.is_empty() && default_permissions.is_empty() {
        return Ok(None);
    }

    let mut permissions = Vec::new();
    extend_unique_permissions(&mut permissions, role_permissions);
    extend_unique_permissions(&mut permissions, default_permissions);

    Ok(Some(EffectivePermissions {
        has_all_permissions: is_creator
            || permissions.iter().any(|value| value == ADMIN_PERMISSION),
        permissions,
    }))
}

async fn workspace_membership_type(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user: &InventoryUser,
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
    let response =
        send_rest_request(contact_data, outbound, OutboundMethod::Get, &url, &auth).await?;

    if !is_success_status(response.status) {
        return Err(());
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
    let response =
        send_service_role_rest_request(contact_data, outbound, OutboundMethod::Get, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
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
    let response =
        send_service_role_rest_request(contact_data, outbound, OutboundMethod::Get, &url).await?;

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
    let response =
        send_service_role_rest_request(contact_data, outbound, OutboundMethod::Get, &url).await?;

    if !is_success_status(response.status) {
        return Ok(Vec::new());
    }

    Ok(response
        .json::<Vec<PermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user: &InventoryUser,
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
    user: &InventoryUser,
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
    let response =
        send_rest_request(contact_data, outbound, OutboundMethod::Get, &url, &auth).await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
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
    let response =
        send_rest_request(contact_data, outbound, OutboundMethod::Get, &url, auth).await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}

async fn send_private_service_role_request(
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
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA),
        )
        .await
        .map_err(|_| ())
}

async fn send_service_role_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
) -> Result<OutboundResponse, ()> {
    send_rest_request(contact_data, outbound, method, url, &DataAuth::ServiceRole).await
}

async fn send_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
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
            OutboundRequest::new(method, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
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

fn workspaces_inventory_polar_product_sync_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_INVENTORY_POLAR_PRODUCT_SYNC_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_INVENTORY_POLAR_PRODUCT_SYNC_PATH_SUFFIX)?;

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

fn decode_first_row<T: for<'de> Deserialize<'de>>(
    response: &OutboundResponse,
) -> Result<Option<T>, ()> {
    response
        .json::<Vec<T>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
