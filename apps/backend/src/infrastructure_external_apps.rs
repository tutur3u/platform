use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const EXTERNAL_APPS_PATH: &str = "/api/v1/infrastructure/external-apps";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

/// `EXTERNAL_APP_SECRET_PREFIX` from external-apps-utils.ts.
const EXTERNAL_APP_SECRET_PREFIX: &str = "EXTERNAL_APP_REGISTRY";

/// `DEFAULT_ALLOWED_SCOPES` from external-apps-utils.ts (`normalizeScopes` fallback).
const DEFAULT_ALLOWED_SCOPES: &[&str] = &["external-projects:*"];

/// Permissions accepted by requireExternalAppRegistryAdmin (legacy access.ts).
const MANAGE_WORKSPACE_SECRETS: &str = "manage_workspace_secrets";
const MANAGE_WORKSPACE_ROLES: &str = "manage_workspace_roles";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const LIST_FAILURE_MESSAGE: &str = "Failed to list external apps";

/// Secret field names (`FIELD_NAMES` in external-apps-utils.ts). `parseAppFieldKey`
/// only accepts rows whose field segment is one of these.
const FIELD_NAMES: &[&str] = &[
    "allowedScopes",
    "createdAt",
    "createdBy",
    "displayName",
    "enabled",
    "origins",
    "secretHash",
    "secretIssuedAt",
    "secretLastFour",
    "updatedAt",
    "updatedBy",
];

#[derive(Deserialize)]
struct SecretRow {
    name: Option<String>,
    value: Option<String>,
}

/// Mirrors `ExternalAppRegistration` JSON shape. Field order matches the object
/// literal returned by `buildExternalAppRegistrations` so the serialized JSON is
/// byte-compatible with the legacy `NextResponse.json({ apps })`.
#[derive(Serialize)]
struct ExternalAppRegistration {
    #[serde(rename = "allowedScopes")]
    allowed_scopes: Vec<String>,
    #[serde(rename = "createdAt")]
    created_at: Option<String>,
    #[serde(rename = "createdBy")]
    created_by: Option<String>,
    #[serde(rename = "displayName")]
    display_name: String,
    enabled: bool,
    id: String,
    origins: Vec<String>,
    #[serde(rename = "secretIssuedAt")]
    secret_issued_at: Option<String>,
    #[serde(rename = "secretLastFour")]
    secret_last_four: Option<String>,
    #[serde(rename = "updatedAt")]
    updated_at: Option<String>,
    #[serde(rename = "updatedBy")]
    updated_by: Option<String>,
}

#[derive(Serialize)]
struct ListExternalAppsResponse {
    apps: Vec<ExternalAppRegistration>,
}

pub(crate) async fn handle_infrastructure_external_apps_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != EXTERNAL_APPS_PATH {
        return None;
    }

    // Only GET is migrated. Return None for every other method (POST, etc.) so the
    // Cloudflare worker falls through to the still-active Next.js route.
    Some(match request.method {
        "GET" => list_apps_response(config, request, outbound).await,
        _ => return None,
    })
}

async fn list_apps_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // requireExternalAppRegistryAdmin: authenticated user with
    // manage_workspace_secrets OR manage_workspace_roles on the ROOT workspace.
    match authorize_external_app_registry_admin(&config.contact_data, request, outbound).await {
        Ok(()) => {}
        Err(AdminAccessError::Unauthorized) => return error_response(401, UNAUTHORIZED_MESSAGE),
        Err(AdminAccessError::Forbidden) => return error_response(403, FORBIDDEN_MESSAGE),
        // Legacy access.ts never surfaces a 500 from the access check itself; an
        // internal failure there would bubble as a thrown error -> 500. Match that.
        Err(AdminAccessError::Internal) => return error_response(500, LIST_FAILURE_MESSAGE),
    }

    match list_external_apps(&config.contact_data, outbound).await {
        Ok(apps) => no_store_response(json_response(200, ListExternalAppsResponse { apps })),
        Err(()) => error_response(500, LIST_FAILURE_MESSAGE),
    }
}

enum AdminAccessError {
    Unauthorized,
    Forbidden,
    Internal,
}

/// Mirrors `requireExternalAppRegistryAdmin`: authenticated, with
/// `manage_workspace_secrets` OR `manage_workspace_roles` on ROOT. The shared
/// authorizer resolves the workspace, verifies membership, and aggregates role +
/// default permissions (admin/creator grant everything) like `getPermissions`.
async fn authorize_external_app_registry_admin(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Result<(), AdminAccessError> {
    match authorize_workspace_permission(
        contact_data,
        request,
        ROOT_WORKSPACE_ID,
        MANAGE_WORKSPACE_SECRETS,
        outbound,
    )
    .await
    {
        Ok(_) => return Ok(()),
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return Err(AdminAccessError::Unauthorized);
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return Err(AdminAccessError::Internal);
        }
        // Forbidden / NotFound: authenticated but lacking this permission (or no
        // permission context on ROOT). Fall through to the secondary permission
        // before denying, matching the legacy `||` check.
        Err(WorkspacePermissionAuthorizationError::Forbidden)
        | Err(WorkspacePermissionAuthorizationError::NotFound) => {}
    }

    match authorize_workspace_permission(
        contact_data,
        request,
        ROOT_WORKSPACE_ID,
        MANAGE_WORKSPACE_ROLES,
        outbound,
    )
    .await
    {
        Ok(_) => Ok(()),
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            Err(AdminAccessError::Unauthorized)
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => Err(AdminAccessError::Internal),
        Err(WorkspacePermissionAuthorizationError::Forbidden)
        | Err(WorkspacePermissionAuthorizationError::NotFound) => Err(AdminAccessError::Forbidden),
    }
}

/// Mirrors `listExternalApps` -> `readExternalAppSecretRows` + `buildExternalAppRegistrations`.
async fn list_external_apps(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<ExternalAppRegistration>, ()> {
    let rows = read_external_app_secret_rows(contact_data, outbound).await?;
    Ok(build_external_app_registrations(rows))
}

/// `readExternalAppSecretRows`: select name,value from workspace_secrets where
/// ws_id = ROOT and name LIKE 'EXTERNAL_APP_REGISTRY:%'.
async fn read_external_app_secret_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<SecretRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "name,value".to_owned()),
            ("ws_id", format!("eq.{ROOT_WORKSPACE_ID}")),
            ("name", format!("like.{EXTERNAL_APP_SECRET_PREFIX}:%")),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<SecretRow>>().map_err(|_| ())
}

/// Mirrors `buildExternalAppRegistrations`: group rows by appId, derive each
/// registration field, then sort by id (`localeCompare`).
fn build_external_app_registrations(rows: Vec<SecretRow>) -> Vec<ExternalAppRegistration> {
    // BTreeMap keeps insertion-independent ordering; final sort is by id anyway.
    let mut grouped: BTreeMap<String, BTreeMap<String, String>> = BTreeMap::new();

    for row in rows {
        let Some(name) = row.name.as_deref() else {
            continue;
        };
        let Some((app_id, field)) = parse_app_field_key(name) else {
            continue;
        };

        grouped
            .entry(app_id.to_owned())
            .or_default()
            .insert(field.to_owned(), row.value.unwrap_or_default());
    }

    let mut registrations: Vec<ExternalAppRegistration> = grouped
        .into_iter()
        .map(|(id, values)| {
            // displayName: values.displayName?.trim() || id
            let display_name = values
                .get("displayName")
                .map(|value| value.trim())
                .filter(|value| !value.is_empty())
                .map(str::to_owned)
                .unwrap_or_else(|| id.clone());

            let origins = normalize_origins(parse_json_string_array(values.get("origins")));
            let allowed_scopes =
                normalize_scopes_with_default(parse_json_string_array(values.get("allowedScopes")));

            ExternalAppRegistration {
                allowed_scopes,
                // values.createdAt || null  (empty string is falsy -> null)
                created_at: non_empty(values.get("createdAt")),
                created_by: non_empty(values.get("createdBy")),
                display_name,
                // values.enabled !== 'false'
                enabled: values.get("enabled").map(String::as_str) != Some("false"),
                id,
                origins,
                secret_issued_at: non_empty(values.get("secretIssuedAt")),
                secret_last_four: non_empty(values.get("secretLastFour")),
                updated_at: non_empty(values.get("updatedAt")),
                updated_by: non_empty(values.get("updatedBy")),
            }
        })
        .collect();

    // .sort((a, b) => a.id.localeCompare(b.id)) — approximated by byte ordering.
    registrations.sort_by(|a, b| a.id.cmp(&b.id));
    registrations
}

/// Mirrors `parseAppFieldKey`. Splits on ':' and takes the appId (segment 1) and
/// field (segment 2), validating the prefix and that the field is known.
fn parse_app_field_key(name: &str) -> Option<(&str, &str)> {
    let prefix = format!("{EXTERNAL_APP_SECRET_PREFIX}:");
    if !name.starts_with(&prefix) {
        return None;
    }

    // JS: const [, appId, field] = name.split(':'); only first three segments used.
    let mut parts = name.split(':');
    parts.next(); // prefix segment
    let app_id = parts.next().filter(|segment| !segment.is_empty())?;
    let field = parts.next()?;

    if !FIELD_NAMES.contains(&field) {
        return None;
    }

    Some((app_id, field))
}

/// `values.<field> || null`: treat missing or empty-string as None.
fn non_empty(value: Option<&String>) -> Option<String> {
    value
        .filter(|value| !value.is_empty())
        .map(|value| value.to_owned())
}

/// Mirrors `parseJsonStringArray`: parse JSON, keep only string entries; any
/// failure or non-array yields an empty list.
fn parse_json_string_array(value: Option<&String>) -> Vec<String> {
    let Some(value) = value else {
        return Vec::new();
    };
    if value.is_empty() {
        return Vec::new();
    }

    let Ok(parsed) = serde_json::from_str::<Value>(value) else {
        return Vec::new();
    };
    let Some(array) = parsed.as_array() else {
        return Vec::new();
    };

    array
        .iter()
        .filter_map(|entry| entry.as_str().map(str::to_owned))
        .collect()
}

/// Mirrors `normalizeOrigins`: normalize each value, drop invalids, dedupe, sort.
fn normalize_origins(values: Vec<String>) -> Vec<String> {
    let mut origins: Vec<String> = values
        .iter()
        .filter_map(|value| normalize_origin(value))
        .collect();
    origins.sort();
    origins.dedup();
    origins
}

/// Mirrors `normalizeOrigin`: trim, parse as URL, require http(s), return origin.
fn normalize_origin(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    parse_origin(trimmed)
}

/// Minimal URL-origin extractor matching `new URL(value).origin` for http(s).
/// Returns `scheme://host[:port]`. Default ports (80/443) are dropped to match
/// the WHATWG URL `.origin` behavior.
fn parse_origin(value: &str) -> Option<String> {
    let (scheme, rest) = if let Some(rest) = value.strip_prefix("https://") {
        ("https", rest)
    } else {
        ("http", value.strip_prefix("http://")?)
    };

    // Authority ends at the first '/', '?' or '#'.
    let authority_end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let authority = &rest[..authority_end];

    // Strip userinfo.
    let host_port = authority.rsplit('@').next().unwrap_or(authority);
    if host_port.is_empty() {
        return None;
    }

    // Split host and optional port. Handles IPv6 literals in brackets.
    let (host, port) = if let Some(rest) = host_port.strip_prefix('[') {
        let close = rest.find(']')?;
        let host = &host_port[..close + 2]; // include the brackets
        let after = &rest[close + 1..];
        let port = after.strip_prefix(':');
        (host, port)
    } else if let Some(colon) = host_port.rfind(':') {
        (&host_port[..colon], Some(&host_port[colon + 1..]))
    } else {
        (host_port, None)
    };

    if host.is_empty() {
        return None;
    }

    let lowercase_host = host.to_lowercase();

    match port {
        None => Some(format!("{scheme}://{lowercase_host}")),
        Some("") => Some(format!("{scheme}://{lowercase_host}")),
        Some(port) => {
            // Drop default ports to match URL.origin.
            let is_default =
                (scheme == "http" && port == "80") || (scheme == "https" && port == "443");
            if is_default {
                Some(format!("{scheme}://{lowercase_host}"))
            } else {
                Some(format!("{scheme}://{lowercase_host}:{port}"))
            }
        }
    }
}

/// Mirrors `normalizeScopes(values)` with the default fallback used by
/// `buildExternalAppRegistrations`: if `values` is empty, fall back to
/// `DEFAULT_ALLOWED_SCOPES`; trim, validate against `^[a-z0-9:*._-]{1,80}$`,
/// dedupe, sort.
fn normalize_scopes_with_default(values: Vec<String>) -> Vec<String> {
    let source: Vec<String> = if values.is_empty() {
        DEFAULT_ALLOWED_SCOPES
            .iter()
            .map(|scope| (*scope).to_owned())
            .collect()
    } else {
        values
    };

    let mut scopes: Vec<String> = source
        .iter()
        .map(|scope| scope.trim().to_owned())
        .filter(|scope| is_valid_scope(scope))
        .collect();
    scopes.sort();
    scopes.dedup();
    scopes
}

/// `^[a-z0-9:*._-]{1,80}$`
fn is_valid_scope(scope: &str) -> bool {
    let length = scope.chars().count();
    if length == 0 || length > 80 {
        return false;
    }

    scope.chars().all(|character| {
        character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || matches!(character, ':' | '*' | '.' | '_' | '-')
    })
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

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
