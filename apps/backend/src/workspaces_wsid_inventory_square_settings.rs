//! GET handler for `/api/v1/workspaces/:wsId/inventory/square-settings`.
//!
//! Ported from:
//! `apps/web/src/app/api/v1/workspaces/[wsId]/inventory/square-settings/route.ts`
//!
//! # Auth model
//!
//! Identical to the Polar-settings handler: inventory app-session token **or**
//! Supabase access token → workspace membership check (MEMBER) → effective
//! permissions check → `canManageInventorySetup`.
//!
//! # Behaviour gaps vs legacy (GET only)
//!
//! - The readiness `webhook_signature_missing` issue is detected by checking
//!   whether `webhook_signature_key_encrypted` is non-null in the connections
//!   row.  The field is read only for presence — its encrypted bytes are never
//!   returned to the caller, matching the legacy behaviour.
//! - The `scopes_missing` readiness issue compares connection scopes against
//!   the six canonical Square OAuth scopes hard-coded in this file (mirroring
//!   the `SQUARE_OAUTH_SCOPES` constant from `square/types.ts`).
//! - PUT (and any other method) is **not** migrated; this handler returns
//!   `None` for non-GET methods so the Next.js route still handles them.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ADMIN_PERMISSION: &str = "admin";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const FAILED_TO_LOAD_MESSAGE: &str = "Failed to load Square settings";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const INVENTORY_APP_SESSION_TARGETS: [&str; 1] = ["inventory"];
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const NOT_FOUND_MESSAGE: &str = "Not found";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const PRIVATE_SCHEMA: &str = "private";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/inventory/square-settings";

/// Permissions that satisfy `canManageInventorySetup`.
///
/// `admin` is handled via `has_all_permissions` (workspace creator / admin
/// shortcut) and is not listed here.
const MANAGE_INVENTORY_SETUP_PERMISSIONS: [&str; 4] = [
    "manage_inventory_setup",
    "create_inventory",
    "update_inventory",
    "delete_inventory",
];

/// Mirrors `SQUARE_OAUTH_SCOPES` from `square/types.ts`.
const SQUARE_OAUTH_SCOPES: [&str; 6] = [
    "MERCHANT_PROFILE_READ",
    "ORDERS_READ",
    "ORDERS_WRITE",
    "PAYMENTS_READ",
    "PAYMENTS_WRITE",
    "DEVICE_CREDENTIAL_MANAGEMENT",
];

// ---------------------------------------------------------------------------
// Response types (serialised → caller)
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct SquareSettingsResponse {
    #[serde(rename = "wsId")]
    ws_id: String,
    environment: String,
    #[serde(rename = "locationId")]
    location_id: Option<String>,
    #[serde(rename = "locationName")]
    location_name: Option<String>,
    #[serde(rename = "deviceId")]
    device_id: Option<String>,
    #[serde(rename = "deviceName")]
    device_name: Option<String>,
    #[serde(rename = "sandboxDeviceId")]
    sandbox_device_id: Option<String>,
    readiness: ReadinessResponse,
    #[serde(rename = "appCredentials")]
    app_credentials: Vec<AppCredentialResponse>,
    connections: Vec<ConnectionResponse>,
}

#[derive(Serialize)]
struct ReadinessResponse {
    ready: bool,
    issues: Vec<String>,
}

#[derive(Serialize)]
struct AppCredentialResponse {
    environment: String,
    #[serde(rename = "applicationId")]
    application_id: Option<String>,
    #[serde(rename = "applicationSecretLast4")]
    application_secret_last4: Option<String>,
    #[serde(rename = "applicationSecretFingerprint")]
    application_secret_fingerprint: Option<String>,
    #[serde(rename = "oauthRedirectUrl")]
    oauth_redirect_url: Option<String>,
    #[serde(rename = "webhookNotificationUrl")]
    webhook_notification_url: Option<String>,
    #[serde(rename = "updatedAt")]
    updated_at: Option<String>,
}

#[derive(Serialize)]
struct ConnectionResponse {
    environment: String,
    #[serde(rename = "authMethod")]
    auth_method: String,
    #[serde(rename = "merchantId")]
    merchant_id: Option<String>,
    #[serde(rename = "accessTokenLast4")]
    access_token_last4: Option<String>,
    #[serde(rename = "accessTokenFingerprint")]
    access_token_fingerprint: Option<String>,
    #[serde(rename = "refreshTokenLast4")]
    refresh_token_last4: Option<String>,
    #[serde(rename = "tokenExpiresAt")]
    token_expires_at: Option<String>,
    scopes: Vec<String>,
    status: String,
    #[serde(rename = "lastValidatedAt")]
    last_validated_at: Option<String>,
    #[serde(rename = "lastError")]
    last_error: Option<String>,
    #[serde(rename = "updatedAt")]
    updated_at: Option<String>,
    #[serde(rename = "webhookSignatureKeyLast4")]
    webhook_signature_key_last4: Option<String>,
}

// ---------------------------------------------------------------------------
// Row types (deserialised ← Supabase)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct SquareSettingsRow {
    environment: Option<String>,
    location_id: Option<String>,
    location_name: Option<String>,
    device_id: Option<String>,
    device_name: Option<String>,
    sandbox_device_id: Option<String>,
}

#[derive(Deserialize)]
struct SquareConnectionRow {
    environment: Option<String>,
    auth_method: Option<String>,
    merchant_id: Option<String>,
    access_token_fingerprint: Option<String>,
    access_token_last4: Option<String>,
    refresh_token_last4: Option<String>,
    token_expires_at: Option<String>,
    scopes: Option<Vec<String>>,
    /// Used for the `webhook_signature_missing` readiness check (presence only).
    webhook_signature_key_encrypted: Option<String>,
    webhook_signature_key_last4: Option<String>,
    status: Option<String>,
    last_validated_at: Option<String>,
    last_error: Option<String>,
    updated_at: Option<String>,
}

#[derive(Deserialize)]
struct SquareAppCredentialRow {
    environment: Option<String>,
    application_id: Option<String>,
    /// Used for the `app_credentials_missing` readiness check (presence only).
    application_secret_encrypted: Option<String>,
    application_secret_fingerprint: Option<String>,
    application_secret_last4: Option<String>,
    oauth_redirect_url: Option<String>,
    webhook_notification_url: Option<String>,
    updated_at: Option<String>,
}

// ---------------------------------------------------------------------------
// Auth helpers (copied from workspaces_inventory_polar_settings pattern)
// ---------------------------------------------------------------------------

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
struct InventorySquareUser {
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

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_inventory_square_settings_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = extract_ws_id(request.path)?;

    Some(match request.method {
        "GET" => get_response(config, request, raw_ws_id, outbound).await,
        // PUT and all other methods fall through to the still-live Next.js route.
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET response
// ---------------------------------------------------------------------------

async fn get_response(
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
            Ok(None) => return error_response(404, NOT_FOUND_MESSAGE),
            Err(()) => return error_response(404, NOT_FOUND_MESSAGE),
        };

    match member_membership_check(&config.contact_data, outbound, &resolved_ws_id, &user).await {
        Ok(MembershipCheck::Member) => {}
        Ok(MembershipCheck::NotMember) => return message_response(403, FORBIDDEN_MESSAGE),
        Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    let permissions =
        match effective_permissions(&config.contact_data, outbound, &resolved_ws_id, &user).await {
            Ok(Some(permissions)) => permissions,
            Ok(None) => return error_response(404, NOT_FOUND_MESSAGE),
            Err(()) => return error_response(404, NOT_FOUND_MESSAGE),
        };

    let can_manage = permissions.has_all_permissions
        || permissions
            .permissions
            .iter()
            .any(|p| MANAGE_INVENTORY_SETUP_PERMISSIONS.contains(&p.as_str()));
    if !can_manage {
        return message_response(403, FORBIDDEN_MESSAGE);
    }

    match load_square_settings(&config.contact_data, outbound, &resolved_ws_id).await {
        Ok(settings) => no_store_response(json_response(200, settings)),
        Err(()) => message_response(500, FAILED_TO_LOAD_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async fn load_square_settings(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<SquareSettingsResponse, ()> {
    // Parallel fetch of the three private-schema tables.
    let (settings_result, connections_result, app_credentials_result) = futures_join(
        fetch_settings_row(contact_data, outbound, ws_id),
        fetch_connection_rows(contact_data, outbound, ws_id),
        fetch_app_credential_rows(contact_data, outbound, ws_id),
    )
    .await;

    let settings_row = settings_result?;
    let connection_rows = connections_result?;
    let app_credential_rows = app_credentials_result?;

    // Effective environment: defaults to "sandbox" when no row exists.
    let environment = settings_row
        .as_ref()
        .and_then(|r| r.environment.clone())
        .unwrap_or_else(|| "sandbox".to_owned());

    let readiness = compute_readiness(
        &environment,
        settings_row.as_ref(),
        &connection_rows,
        &app_credential_rows,
    );

    let connections = connection_rows.into_iter().map(map_connection).collect();
    let app_credentials = app_credential_rows
        .into_iter()
        .map(map_app_credential)
        .collect();

    Ok(SquareSettingsResponse {
        ws_id: ws_id.to_owned(),
        environment,
        location_id: settings_row.as_ref().and_then(|r| r.location_id.clone()),
        location_name: settings_row.as_ref().and_then(|r| r.location_name.clone()),
        device_id: settings_row.as_ref().and_then(|r| r.device_id.clone()),
        device_name: settings_row.as_ref().and_then(|r| r.device_name.clone()),
        sandbox_device_id: settings_row
            .as_ref()
            .and_then(|r| r.sandbox_device_id.clone()),
        readiness,
        app_credentials,
        connections,
    })
}

/// Mirrors `computeReadiness` from `square/settings.ts`.
fn compute_readiness(
    environment: &str,
    settings: Option<&SquareSettingsRow>,
    connections: &[SquareConnectionRow],
    app_credentials: &[SquareAppCredentialRow],
) -> ReadinessResponse {
    let mut issues: Vec<String> = Vec::new();

    let connection = connections
        .iter()
        .find(|c| c.environment.as_deref() == Some(environment));

    if connection.and_then(|c| c.status.as_deref()) != Some("ready") {
        issues.push("connection_missing".to_owned());
    }

    if connection.and_then(|c| c.auth_method.as_deref()) == Some("oauth") {
        let app_credential = app_credentials
            .iter()
            .find(|a| a.environment.as_deref() == Some(environment));

        let conn_scopes: Vec<&str> = connection
            .and_then(|c| c.scopes.as_ref())
            .map(|s| s.iter().map(String::as_str).collect())
            .unwrap_or_default();

        let scopes_missing = SQUARE_OAUTH_SCOPES
            .iter()
            .any(|required| !conn_scopes.contains(required));
        if scopes_missing {
            issues.push("scopes_missing".to_owned());
        }

        let has_app_credentials = app_credential
            .map(|a| a.application_id.is_some() && a.application_secret_encrypted.is_some())
            .unwrap_or(false);
        if !has_app_credentials {
            issues.push("app_credentials_missing".to_owned());
        }
    }

    let has_webhook_key = connection
        .and_then(|c| c.webhook_signature_key_encrypted.as_deref())
        .is_some();
    if !has_webhook_key {
        issues.push("webhook_signature_missing".to_owned());
    }

    let has_location = settings.and_then(|s| s.location_id.as_deref()).is_some();
    if !has_location {
        issues.push("location_missing".to_owned());
    }

    let usable_device = if environment == "sandbox" {
        settings.and_then(|s| s.sandbox_device_id.as_deref().or(s.device_id.as_deref()))
    } else {
        settings.and_then(|s| s.device_id.as_deref())
    };
    if usable_device.is_none() {
        issues.push("device_missing".to_owned());
    }

    let ready = issues.is_empty();
    ReadinessResponse { ready, issues }
}

fn map_connection(row: SquareConnectionRow) -> ConnectionResponse {
    ConnectionResponse {
        environment: row.environment.unwrap_or_default(),
        auth_method: row.auth_method.unwrap_or_default(),
        merchant_id: row.merchant_id,
        access_token_last4: row.access_token_last4,
        access_token_fingerprint: row.access_token_fingerprint,
        refresh_token_last4: row.refresh_token_last4,
        token_expires_at: row.token_expires_at,
        scopes: row.scopes.unwrap_or_default(),
        status: row.status.unwrap_or_default(),
        last_validated_at: row.last_validated_at,
        last_error: row.last_error,
        updated_at: row.updated_at,
        webhook_signature_key_last4: row.webhook_signature_key_last4,
    }
}

fn map_app_credential(row: SquareAppCredentialRow) -> AppCredentialResponse {
    AppCredentialResponse {
        environment: row.environment.unwrap_or_default(),
        application_id: row.application_id,
        application_secret_last4: row.application_secret_last4,
        application_secret_fingerprint: row.application_secret_fingerprint,
        oauth_redirect_url: row.oauth_redirect_url,
        webhook_notification_url: row.webhook_notification_url,
        updated_at: row.updated_at,
    }
}

async fn fetch_settings_row(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Option<SquareSettingsRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "inventory_square_settings",
        &[
            (
                "select",
                "environment,location_id,location_name,device_id,device_name,sandbox_device_id"
                    .to_owned(),
            ),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_private_service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    decode_first_row::<SquareSettingsRow>(&response)
}

async fn fetch_connection_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<SquareConnectionRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "inventory_square_connections",
        &[
            (
                "select",
                "environment,auth_method,merchant_id,access_token_fingerprint,access_token_last4,refresh_token_last4,token_expires_at,scopes,webhook_signature_key_encrypted,webhook_signature_key_last4,status,last_validated_at,last_error,updated_at"
                    .to_owned(),
            ),
            ("ws_id", format!("eq.{ws_id}")),
            ("order", "environment.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_private_service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response.json::<Vec<SquareConnectionRow>>().map_err(|_| ())
}

async fn fetch_app_credential_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<SquareAppCredentialRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "inventory_square_app_credentials",
        &[
            (
                "select",
                "environment,application_id,application_secret_encrypted,application_secret_fingerprint,application_secret_last4,oauth_redirect_url,webhook_notification_url,updated_at"
                    .to_owned(),
            ),
            ("ws_id", format!("eq.{ws_id}")),
            ("order", "environment.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_private_service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response
        .json::<Vec<SquareAppCredentialRow>>()
        .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Auth helpers (verbatim pattern from workspaces_inventory_polar_settings.rs)
// ---------------------------------------------------------------------------

async fn authenticated_inventory_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<InventorySquareUser> {
    if contact::request_has_app_session_token(request) {
        let identity =
            contact::resolve_app_session_identity(config, request, &INVENTORY_APP_SESSION_TARGETS)
                .ok()?;

        return non_empty_user_id(identity.id).map(|id| InventorySquareUser {
            access_token: None,
            id,
        });
    }

    let access_token = supabase_auth::request_access_token(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;
    let id = non_empty_user_id(user.id?)?;

    Some(InventorySquareUser {
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
    user: &InventorySquareUser,
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
    user: &InventorySquareUser,
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
    extend_unique(&mut permissions, role_permissions);
    extend_unique(&mut permissions, default_permissions);

    Ok(Some(EffectivePermissions {
        has_all_permissions: is_creator || permissions.iter().any(|p| p == ADMIN_PERMISSION),
        permissions,
    }))
}

async fn workspace_membership_type(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user: &InventorySquareUser,
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

    if !is_success(response.status) {
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

    if !is_success(response.status) {
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

    if !is_success(response.status) {
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

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user: &InventorySquareUser,
) -> Result<Option<String>, ()> {
    let resolved = resolve_workspace_id(raw_ws_id);

    if resolved == ROOT_WORKSPACE_ID {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user).await;
    }

    if !is_workspace_uuid_literal(&resolved) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(Some(resolved));
        }

        if let Some(access_token) = user.access_token.as_deref()
            && let Some(ws_id) = workspace_id_by_handle(
                contact_data,
                outbound,
                &handle,
                &DataAuth::AccessToken(access_token),
            )
            .await?
        {
            return Ok(Some(ws_id));
        }

        if let Some(ws_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, &DataAuth::ServiceRole).await?
        {
            return Ok(Some(ws_id));
        }
    }

    Ok(Some(resolved))
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user: &InventorySquareUser,
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

    if !is_success(response.status) {
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

    if !is_success(response.status) {
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

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
            .all(|(index, ch)| match index {
                8 | 13 | 18 | 23 => ch == '-',
                _ => ch.is_ascii_hexdigit(),
            })
}

fn is_workspace_handle(value: &str) -> bool {
    let length = value.len();
    if length == 0 || length > 64 {
        return false;
    }
    value.chars().enumerate().all(|(index, ch)| {
        let is_edge = index == 0 || index + 1 == length;
        ch.is_ascii_lowercase() || ch.is_ascii_digit() || (!is_edge && matches!(ch, '_' | '-'))
    })
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
            if let Some(rp) = map.get("workspace_role_permissions") {
                collect_role_permissions(rp, permissions);
            }
            if let Some(wr) = map.get("workspace_roles") {
                collect_role_permissions(wr, permissions);
            }
        }
        _ => {}
    }
}

fn extend_unique(permissions: &mut Vec<String>, values: Vec<String>) {
    for permission in values {
        if !permissions.iter().any(|p| p == &permission) {
            permissions.push(permission);
        }
    }
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

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

/// Tiny sequential join: runs three futures one after the other and returns
/// all three results as a tuple.  This avoids pulling in `futures` as a new
/// dependency while still allowing the call site to look like a parallel join.
///
/// # Note
///
/// For a genuine parallel fetch the crate would need `futures::join!` or
/// `tokio::join!`.  Because the porting contract forbids adding dependencies
/// and `tokio::join!` is not currently used elsewhere in this crate, the
/// three fetches run sequentially here.  The latency impact is minimal
/// compared with the auth-lookup round-trips that precede them.
async fn futures_join<A, B, C, FA, FB, FC>(fa: FA, fb: FB, fc: FC) -> (A, B, C)
where
    FA: std::future::Future<Output = A>,
    FB: std::future::Future<Output = B>,
    FC: std::future::Future<Output = C>,
{
    let a = fa.await;
    let b = fb.await;
    let c = fc.await;
    (a, b, c)
}

fn extract_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- path guard ----------------------------------------------------------

    #[test]
    fn extract_ws_id_matches_canonical_path() {
        let ws_id = extract_ws_id("/api/v1/workspaces/abc-123/inventory/square-settings").unwrap();
        assert_eq!(ws_id, "abc-123");
    }

    #[test]
    fn extract_ws_id_rejects_wrong_suffix() {
        assert!(extract_ws_id("/api/v1/workspaces/abc-123/inventory/polar-settings").is_none());
    }

    #[test]
    fn extract_ws_id_rejects_extra_segments() {
        assert!(
            extract_ws_id("/api/v1/workspaces/abc-123/inventory/square-settings/extra").is_none()
        );
    }

    #[test]
    fn extract_ws_id_rejects_empty_ws_id() {
        assert!(extract_ws_id("/api/v1/workspaces//inventory/square-settings").is_none());
    }

    // -- workspace id helpers ------------------------------------------------

    #[test]
    fn is_workspace_uuid_literal_accepts_uuid() {
        assert!(is_workspace_uuid_literal(
            "00000000-0000-0000-0000-000000000000"
        ));
        assert!(is_workspace_uuid_literal(
            "550e8400-e29b-41d4-a716-446655440000"
        ));
    }

    #[test]
    fn is_workspace_uuid_literal_rejects_non_uuid() {
        assert!(!is_workspace_uuid_literal("not-a-uuid"));
        assert!(!is_workspace_uuid_literal(""));
    }

    #[test]
    fn is_workspace_handle_accepts_valid_handles() {
        assert!(is_workspace_handle("my-workspace"));
        assert!(is_workspace_handle("workspace123"));
        assert!(is_workspace_handle("a"));
    }

    #[test]
    fn is_workspace_handle_rejects_edge_hyphens() {
        assert!(!is_workspace_handle("-bad"));
        assert!(!is_workspace_handle("bad-"));
    }

    #[test]
    fn is_workspace_handle_rejects_empty() {
        assert!(!is_workspace_handle(""));
    }

    #[test]
    fn resolve_workspace_id_maps_internal_to_root() {
        assert_eq!(resolve_workspace_id("internal"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("INTERNAL"), ROOT_WORKSPACE_ID);
    }

    #[test]
    fn resolve_workspace_id_passes_through_other_values() {
        assert_eq!(resolve_workspace_id("my-ws"), "my-ws");
    }

    // -- readiness computation -----------------------------------------------

    fn ready_connection(env: &str) -> SquareConnectionRow {
        SquareConnectionRow {
            environment: Some(env.to_owned()),
            auth_method: Some("manual".to_owned()),
            merchant_id: None,
            access_token_fingerprint: None,
            access_token_last4: None,
            refresh_token_last4: None,
            token_expires_at: None,
            scopes: Some(Vec::new()),
            webhook_signature_key_encrypted: Some("encrypted".to_owned()),
            webhook_signature_key_last4: Some("abcd".to_owned()),
            status: Some("ready".to_owned()),
            last_validated_at: None,
            last_error: None,
            updated_at: None,
        }
    }

    fn settings_with_location_and_device(env: &str) -> SquareSettingsRow {
        SquareSettingsRow {
            environment: Some(env.to_owned()),
            location_id: Some("LOC1".to_owned()),
            location_name: None,
            device_id: Some("DEV1".to_owned()),
            device_name: None,
            sandbox_device_id: None,
        }
    }

    #[test]
    fn compute_readiness_fully_ready_manual() {
        let settings = settings_with_location_and_device("production");
        let connection = ready_connection("production");
        let result = compute_readiness("production", Some(&settings), &[connection], &[]);
        assert!(result.ready);
        assert!(result.issues.is_empty());
    }

    #[test]
    fn compute_readiness_missing_connection() {
        let settings = settings_with_location_and_device("production");
        let result = compute_readiness("production", Some(&settings), &[], &[]);
        assert!(!result.ready);
        assert!(result.issues.contains(&"connection_missing".to_owned()));
        assert!(
            result
                .issues
                .contains(&"webhook_signature_missing".to_owned())
        );
    }

    #[test]
    fn compute_readiness_missing_location() {
        let settings = SquareSettingsRow {
            environment: Some("sandbox".to_owned()),
            location_id: None,
            location_name: None,
            device_id: Some("DEV1".to_owned()),
            device_name: None,
            sandbox_device_id: None,
        };
        let connection = ready_connection("sandbox");
        let result = compute_readiness("sandbox", Some(&settings), &[connection], &[]);
        assert!(!result.ready);
        assert!(result.issues.contains(&"location_missing".to_owned()));
    }

    #[test]
    fn compute_readiness_sandbox_uses_sandbox_device_id() {
        let settings = SquareSettingsRow {
            environment: Some("sandbox".to_owned()),
            location_id: Some("LOC1".to_owned()),
            location_name: None,
            device_id: None,
            device_name: None,
            sandbox_device_id: Some("SANDBOX_DEV".to_owned()),
        };
        let connection = ready_connection("sandbox");
        let result = compute_readiness("sandbox", Some(&settings), &[connection], &[]);
        assert!(
            result.ready,
            "sandbox_device_id should satisfy device check"
        );
    }

    #[test]
    fn compute_readiness_scopes_missing_for_oauth() {
        let settings = settings_with_location_and_device("production");
        let mut connection = ready_connection("production");
        connection.auth_method = Some("oauth".to_owned());
        connection.scopes = Some(vec!["MERCHANT_PROFILE_READ".to_owned()]);

        let app_credential = SquareAppCredentialRow {
            environment: Some("production".to_owned()),
            application_id: Some("app_id".to_owned()),
            application_secret_encrypted: Some("secret".to_owned()),
            application_secret_fingerprint: None,
            application_secret_last4: None,
            oauth_redirect_url: None,
            webhook_notification_url: None,
            updated_at: None,
        };

        let result = compute_readiness(
            "production",
            Some(&settings),
            &[connection],
            &[app_credential],
        );
        assert!(!result.ready);
        assert!(result.issues.contains(&"scopes_missing".to_owned()));
    }

    // -- response shaping helpers --------------------------------------------

    #[test]
    fn map_connection_defaults_empty_option_strings() {
        let row = SquareConnectionRow {
            environment: None,
            auth_method: None,
            merchant_id: None,
            access_token_fingerprint: None,
            access_token_last4: None,
            refresh_token_last4: None,
            token_expires_at: None,
            scopes: None,
            webhook_signature_key_encrypted: None,
            webhook_signature_key_last4: None,
            status: None,
            last_validated_at: None,
            last_error: None,
            updated_at: None,
        };
        let resp = map_connection(row);
        assert_eq!(resp.environment, "");
        assert_eq!(resp.scopes, Vec::<String>::new());
    }

    #[test]
    fn extend_unique_deduplicates() {
        let mut perms = vec!["a".to_owned(), "b".to_owned()];
        extend_unique(&mut perms, vec!["b".to_owned(), "c".to_owned()]);
        assert_eq!(perms, vec!["a", "b", "c"]);
    }
}
