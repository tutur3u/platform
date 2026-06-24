use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// NOTE: This module intentionally copies the authentication / workspace
// normalization / membership / permission resolution machinery that already
// lives (as private fns) in `workspaces_inventory_access.rs`. Those helpers are
// not exported, and the porting contract forbids editing other modules, so the
// shared pieces are duplicated here as file-local fns. If these are ever
// promoted to a shared module, this file should switch to the shared helpers.

const ADMIN_PERMISSION: &str = "admin";
const DEFAULT_POLAR_PRODUCT_NAME: &str = "Tuturuuu Inventory Checkout";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const FAILED_TO_LOAD_MESSAGE: &str = "Failed to load Polar settings";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const INVENTORY_APP_SESSION_TARGETS: [&str; 1] = ["inventory"];
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const NOT_FOUND_MESSAGE: &str = "Not found";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const PRIVATE_SCHEMA: &str = "private";
const PRODUCTION_ENVIRONMENT: &str = "production";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const SANDBOX_ENVIRONMENT: &str = "sandbox";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const WORKSPACES_INVENTORY_POLAR_SETTINGS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_INVENTORY_POLAR_SETTINGS_PATH_SUFFIX: &str = "/inventory/polar-settings";

// `canManageInventorySetup`: any of these permission ids grants access. `admin`
// is handled separately via the `has_all_permissions` shortcut (mirrors the
// legacy `containsPermission` behavior for workspace creators / admins).
const MANAGE_INVENTORY_SETUP_PERMISSIONS: [&str; 4] = [
    "manage_inventory_setup",
    "create_inventory",
    "update_inventory",
    "delete_inventory",
];

#[derive(Serialize)]
struct PolarSettingsResponse {
    #[serde(rename = "wsId")]
    ws_id: String,
    #[serde(rename = "testingEnvironment")]
    testing_environment: String,
    #[serde(rename = "productionEnvironment")]
    production_environment: String,
    integrations: Vec<PolarIntegrationResponse>,
}

#[derive(Serialize)]
struct PolarIntegrationResponse {
    environment: String,
    #[serde(rename = "accessTokenLast4")]
    access_token_last4: Option<String>,
    #[serde(rename = "accessTokenFingerprint")]
    access_token_fingerprint: Option<String>,
    #[serde(rename = "polarProductId")]
    polar_product_id: Option<String>,
    #[serde(rename = "polarProductName")]
    polar_product_name: String,
    status: String,
    #[serde(rename = "lastValidatedAt")]
    last_validated_at: Option<String>,
    #[serde(rename = "lastError")]
    last_error: Option<String>,
    #[serde(rename = "updatedAt")]
    updated_at: Option<String>,
    #[serde(rename = "webhookSecretLast4")]
    webhook_secret_last4: Option<String>,
}

#[derive(Deserialize)]
struct PolarSettingsRow {
    testing_environment: Option<String>,
    production_environment: Option<String>,
}

#[derive(Deserialize)]
struct PolarIntegrationRow {
    environment: Option<String>,
    access_token_last4: Option<String>,
    access_token_fingerprint: Option<String>,
    polar_product_id: Option<String>,
    polar_product_name: Option<String>,
    status: Option<String>,
    last_validated_at: Option<String>,
    last_error: Option<String>,
    updated_at: Option<String>,
    webhook_secret_last4: Option<String>,
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
struct InventoryPolarUser {
    access_token: Option<String>,
    id: String,
}

enum DataAuth<'a> {
    AccessToken(&'a str),
    ServiceRole,
}

pub(crate) async fn handle_workspaces_inventory_polar_settings_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_inventory_polar_settings_ws_id(request.path)?;

    Some(match request.method {
        "GET" => {
            workspaces_inventory_polar_settings_response(config, request, raw_ws_id, outbound).await
        }
        // PUT (and any future methods) are NOT migrated yet; fall through to the
        // still-active Next.js route by returning None.
        _ => return None,
    })
}

async fn workspaces_inventory_polar_settings_response(
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
            Ok(None) => return error_response(404, NOT_FOUND_MESSAGE),
            Err(()) => return error_response(404, NOT_FOUND_MESSAGE),
        };

    // `verifyWorkspaceMembershipType` (default requiredType = MEMBER).
    match member_membership_check(&config.contact_data, outbound, &resolved_ws_id, &user).await {
        Ok(MembershipCheck::Member) => {}
        Ok(MembershipCheck::NotMember) => return message_response(403, FORBIDDEN_MESSAGE),
        Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    // `getPermissions` returns null when the caller has no resolvable
    // permissions, which the legacy auth helper surfaces as 404
    // `{ error: "Not found" }`.
    let permissions =
        match effective_permissions(&config.contact_data, outbound, &resolved_ws_id, &user).await {
            Ok(Some(permissions)) => permissions,
            Ok(None) => return error_response(404, NOT_FOUND_MESSAGE),
            Err(()) => return error_response(404, NOT_FOUND_MESSAGE),
        };

    // `canManageInventorySetup(authorization.value.permissions)`.
    let can_manage = permissions.has_all_permissions
        || permissions
            .permissions
            .iter()
            .any(|value| MANAGE_INVENTORY_SETUP_PERMISSIONS.contains(&value.as_str()));
    if !can_manage {
        return message_response(403, FORBIDDEN_MESSAGE);
    }

    // `getInventoryPolarSettings(authorization.value.wsId)`.
    match load_polar_settings(&config.contact_data, outbound, &resolved_ws_id).await {
        Ok(settings) => no_store_response(json_response(200, settings)),
        Err(()) => message_response(500, FAILED_TO_LOAD_MESSAGE),
    }
}

async fn load_polar_settings(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<PolarSettingsResponse, ()> {
    // inventory_polar_settings (.maybeSingle()).
    let settings_row = polar_settings_row(contact_data, outbound, ws_id).await?;

    // inventory_polar_integrations ordered by environment ascending.
    let integration_rows = polar_integration_rows(contact_data, outbound, ws_id).await?;

    let integrations = integration_rows
        .into_iter()
        .map(map_integration)
        .collect::<Vec<_>>();

    Ok(PolarSettingsResponse {
        ws_id: ws_id.to_owned(),
        testing_environment: settings_row
            .as_ref()
            .and_then(|row| row.testing_environment.clone())
            .unwrap_or_else(|| SANDBOX_ENVIRONMENT.to_owned()),
        production_environment: settings_row
            .as_ref()
            .and_then(|row| row.production_environment.clone())
            .unwrap_or_else(|| PRODUCTION_ENVIRONMENT.to_owned()),
        integrations,
    })
}

fn map_integration(row: PolarIntegrationRow) -> PolarIntegrationResponse {
    PolarIntegrationResponse {
        environment: row.environment.unwrap_or_default(),
        access_token_last4: row.access_token_last4,
        access_token_fingerprint: row.access_token_fingerprint,
        polar_product_id: row.polar_product_id,
        // Legacy `row.polar_product_name ?? 'Tuturuuu Inventory Checkout'`:
        // only a NULL column value falls back to the default.
        polar_product_name: row
            .polar_product_name
            .unwrap_or_else(|| DEFAULT_POLAR_PRODUCT_NAME.to_owned()),
        status: row.status.unwrap_or_default(),
        last_validated_at: row.last_validated_at,
        last_error: row.last_error,
        updated_at: row.updated_at,
        webhook_secret_last4: row.webhook_secret_last4,
    }
}

async fn polar_settings_row(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Option<PolarSettingsRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "inventory_polar_settings",
        &[
            (
                "select",
                "testing_environment,production_environment".to_owned(),
            ),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_private_service_role_get(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    decode_first_row::<PolarSettingsRow>(&response)
}

async fn polar_integration_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<PolarIntegrationRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "inventory_polar_integrations",
        &[
            (
                "select",
                "ws_id,environment,access_token_fingerprint,access_token_last4,polar_product_id,polar_product_name,status,last_validated_at,last_error,updated_at,webhook_secret_last4".to_owned(),
            ),
            ("ws_id", format!("eq.{ws_id}")),
            ("order", "environment.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_private_service_role_get(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<PolarIntegrationRow>>().map_err(|_| ())
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

async fn authenticated_inventory_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<InventoryPolarUser> {
    if contact::request_has_app_session_token(request) {
        let identity =
            contact::resolve_app_session_identity(config, request, &INVENTORY_APP_SESSION_TARGETS)
                .ok()?;

        return non_empty_user_id(identity.id).map(|id| InventoryPolarUser {
            access_token: None,
            id,
        });
    }

    let access_token = supabase_auth::request_access_token(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;
    let id = non_empty_user_id(user.id?)?;

    Some(InventoryPolarUser {
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
    user: &InventoryPolarUser,
) -> Result<MembershipCheck, ()> {
    let Some(membership_type) =
        workspace_membership_type(contact_data, outbound, ws_id, user).await?
    else {
        // No membership row -> `membership_missing` -> Forbidden.
        return Ok(MembershipCheck::NotMember);
    };

    if membership_type == "MEMBER" {
        Ok(MembershipCheck::Member)
    } else {
        // Membership type mismatch (e.g. GUEST) -> Forbidden.
        Ok(MembershipCheck::NotMember)
    }
}

async fn effective_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user: &InventoryPolarUser,
) -> Result<Option<EffectivePermissions>, ()> {
    // `getPermissions` resolves membership independently with requiredType ANY.
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
    user: &InventoryPolarUser,
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
    user: &InventoryPolarUser,
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
    user: &InventoryPolarUser,
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

async fn send_private_service_role_get(
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
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
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

fn workspaces_inventory_polar_settings_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_INVENTORY_POLAR_SETTINGS_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_INVENTORY_POLAR_SETTINGS_PATH_SUFFIX)?;

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
