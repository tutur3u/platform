//! Handler for `GET /api/v1/infrastructure/rate-limits/workspace-secrets`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/infrastructure/rate-limits/workspace-secrets/route.ts`.
//!
//! The legacy route authorizes the caller with `authorizeAbuseIntelligenceRequest`
//! (default `view_infrastructure` permission against the root workspace), then
//! reads rows from the `workspace_secrets` table using the admin (service-role)
//! Supabase client filtered by `ws_id` and the set of managed rate-limit secret
//! names, and returns:
//!
//! ```json
//! { "managedNames": [...], "secrets": { "<name>": "<value>" }, "wsId": "..." }
//! ```
//!
//! Auth mirrors the sibling `infrastructure_rate_limits_live_usage` /
//! `infrastructure_rate_limit_subjects` handlers using
//! `authorize_workspace_permission` against `ROOT_WORKSPACE_ID`:
//!
//! - missing session token / unauthorized   -> `401 { "message": "Unauthorized" }`
//! - authenticated caller lacking permission -> `403 { "message": "Forbidden" }`
//! - config / auth internal failure          -> `500 { "message": "Failed to load workspace rate-limit secrets" }`
//!
//! BEHAVIOR GAPS vs legacy:
//!
//! - The legacy route has no explicit `Cache-Control` header; this handler wraps
//!   all responses with `no_store_response`, consistent with sibling
//!   infrastructure handlers.
//! - PUT (and all non-GET methods) return `None`, falling through to the
//!   still-live Next.js route. The legacy PUT mutates `workspace_secrets` via the
//!   admin client; that mutation path is intentionally not ported here.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    infrastructure_root_auth::ROOT_WORKSPACE_ID,
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

pub(crate) const WORKSPACE_SECRETS_PATH: &str =
    "/api/v1/infrastructure/rate-limits/workspace-secrets";

/// The canonical set of rate-limit secret names managed by this route.
///
/// Mirrors `Object.values(RATE_LIMIT_SECRET_NAMES)` from
/// `apps/web/src/lib/rate-limit.ts`.
const MANAGED_SECRET_NAMES: &[&str] = &[
    "RATE_LIMIT_WINDOW_MS",
    "RATE_LIMIT_MAX_REQUESTS",
    "RATE_LIMIT_UPLOAD_MAX_REQUESTS",
    "RATE_LIMIT_DOWNLOAD_MAX_REQUESTS",
    "RATE_LIMIT_UPLOAD_URL_MAX_REQUESTS",
];

const VIEW_INFRASTRUCTURE_PERMISSION: &str = "view_infrastructure";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const ERROR_MESSAGE: &str = "Failed to load workspace rate-limit secrets";
const WORKSPACE_SECRETS_TABLE: &str = "workspace_secrets";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum SecretsAuthError {
    Forbidden,
    Internal,
    Unauthorized,
}

pub(crate) async fn handle_infrastructure_rate_limits_workspace_secrets_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    if request.path != WORKSPACE_SECRETS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => workspace_secrets_response(config, request, outbound).await,
        // PUT and all other non-GET methods fall through to the live Next.js route.
        _ => return None,
    })
}

async fn workspace_secrets_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if let Err(error) = authorize_secrets(config, request, outbound).await {
        return match error {
            SecretsAuthError::Unauthorized => message_response(401, UNAUTHORIZED_MESSAGE),
            SecretsAuthError::Forbidden => message_response(403, FORBIDDEN_MESSAGE),
            SecretsAuthError::Internal => error_response(),
        };
    }

    let ws_id = match ws_id_from_url(request.url) {
        Some(id) => id,
        None => {
            return no_store_response(json_response(
                400,
                json!({ "message": "A valid wsId is required" }),
            ));
        }
    };

    let rows = match fetch_workspace_secrets(&config.contact_data, outbound, &ws_id).await {
        Ok(rows) => rows,
        Err(()) => return error_response(),
    };

    let mut secrets = serde_json::Map::new();
    for row in &rows {
        if let (Some(name), Some(value)) = (
            row.get("name").and_then(Value::as_str),
            row.get("value").and_then(Value::as_str),
        ) {
            secrets.insert(name.to_owned(), Value::String(value.to_owned()));
        }
    }

    let managed_names: Vec<Value> = MANAGED_SECRET_NAMES
        .iter()
        .map(|name| Value::String((*name).to_owned()))
        .collect();

    no_store_response(json_response(
        200,
        json!({
            "managedNames": managed_names,
            "secrets": secrets,
            "wsId": ws_id,
        }),
    ))
}

async fn authorize_secrets(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Result<(), SecretsAuthError> {
    if supabase_auth::request_access_token(request).is_none() {
        return Err(SecretsAuthError::Unauthorized);
    }

    match authorize_workspace_permission(
        &config.contact_data,
        request,
        ROOT_WORKSPACE_ID,
        VIEW_INFRASTRUCTURE_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(_) => Ok(()),
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            Err(SecretsAuthError::Unauthorized)
        }
        Err(
            WorkspacePermissionAuthorizationError::Forbidden
            | WorkspacePermissionAuthorizationError::NotFound,
        ) => Err(SecretsAuthError::Forbidden),
        Err(WorkspacePermissionAuthorizationError::Internal) => Err(SecretsAuthError::Internal),
    }
}

/// Reads `workspace_secrets` rows filtered by `ws_id` and the managed name set,
/// using the service-role key (mirrors legacy `sbAdmin.from(...).select(...)`).
///
/// Returns `Err(())` only on a config failure (unconfigured contact data or
/// missing service-role key); a non-2xx Supabase response is treated as an
/// error too. Row-level failures are propagated as `Err(())` so the handler
/// returns a 500 rather than silently swallowing them, matching the legacy
/// `if (error) { return 500 }` branch.
async fn fetch_workspace_secrets(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<Value>, ()> {
    if !contact_data.configured() {
        return Err(());
    }

    let in_filter = format!("in.({})", MANAGED_SECRET_NAMES.join(","));

    let url = contact_data
        .rest_url(
            WORKSPACE_SECRETS_TABLE,
            &[
                ("select", "name,value".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("name", in_filter),
            ],
        )
        .ok_or(())?;

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

/// Extracts and validates the `wsId` query parameter.
///
/// Mirrors `new URL(request.url).searchParams.get('wsId')?.trim()` followed by
/// the `UUID_PATTERN` test in the legacy route.
fn ws_id_from_url(request_url: Option<&str>) -> Option<String> {
    let url = request_url.and_then(|u| url::Url::parse(u).ok())?;
    let ws_id = url
        .query_pairs()
        .find_map(|(key, value)| (key == "wsId").then(|| value.into_owned()))?;
    let ws_id = ws_id.trim().to_owned();
    is_uuid(&ws_id).then_some(ws_id)
}

/// Returns `true` when `value` is a valid lowercase-or-uppercase UUID v4 string.
///
/// Mirrors the `UUID_PATTERN` regex in the legacy route:
/// `/^[0-9a-fA-F]{8}-...-[0-9a-fA-F]{12}$/`.
fn is_uuid(value: &str) -> bool {
    if value.len() != 36 {
        return false;
    }
    value.chars().enumerate().all(|(index, ch)| match index {
        8 | 13 | 18 | 23 => ch == '-',
        _ => ch.is_ascii_hexdigit(),
    })
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response() -> BackendResponse {
    message_response(500, ERROR_MESSAGE)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(query: &str) -> String {
        format!("https://backend.test{WORKSPACE_SECRETS_PATH}?{query}")
    }

    // --- ws_id_from_url ---

    #[test]
    fn ws_id_accepts_valid_uuid() {
        let ws_id = ws_id_from_url(Some(&url("wsId=123e4567-e89b-12d3-a456-426614174000")));
        assert_eq!(
            ws_id.as_deref(),
            Some("123e4567-e89b-12d3-a456-426614174000")
        );
    }

    #[test]
    fn ws_id_trims_whitespace() {
        let ws_id = ws_id_from_url(Some(&url(
            "wsId=%20123e4567-e89b-12d3-a456-426614174000%20",
        )));
        assert_eq!(
            ws_id.as_deref(),
            Some("123e4567-e89b-12d3-a456-426614174000")
        );
    }

    #[test]
    fn ws_id_rejects_missing_param() {
        assert!(ws_id_from_url(Some(&url(""))).is_none());
    }

    #[test]
    fn ws_id_rejects_empty_string() {
        assert!(ws_id_from_url(Some(&url("wsId="))).is_none());
    }

    #[test]
    fn ws_id_rejects_non_uuid() {
        assert!(ws_id_from_url(Some(&url("wsId=not-a-uuid"))).is_none());
        assert!(ws_id_from_url(Some(&url("wsId=123e4567e89b12d3a456426614174000"))).is_none());
    }

    #[test]
    fn ws_id_rejects_none_url() {
        assert!(ws_id_from_url(None).is_none());
    }

    // --- is_uuid ---

    #[test]
    fn uuid_accepts_all_hex_cases() {
        assert!(is_uuid("123e4567-e89b-12d3-a456-426614174000"));
        assert!(is_uuid("AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE"));
        assert!(is_uuid("00000000-0000-0000-0000-000000000000"));
    }

    #[test]
    fn uuid_rejects_wrong_length() {
        assert!(!is_uuid("123e4567-e89b-12d3-a456-42661417400"));
        assert!(!is_uuid("123e4567-e89b-12d3-a456-4266141740000"));
    }

    #[test]
    fn uuid_rejects_wrong_dash_positions() {
        assert!(!is_uuid("123e456-7e89b-12d3-a456-426614174000"));
    }

    #[test]
    fn uuid_rejects_non_hex_chars() {
        assert!(!is_uuid("123e4567-e89b-12d3-a456-42661417400g"));
    }

    // --- managed secret names ---

    #[test]
    fn managed_secret_names_contains_expected_entries() {
        assert!(MANAGED_SECRET_NAMES.contains(&"RATE_LIMIT_WINDOW_MS"));
        assert!(MANAGED_SECRET_NAMES.contains(&"RATE_LIMIT_MAX_REQUESTS"));
        assert!(MANAGED_SECRET_NAMES.contains(&"RATE_LIMIT_UPLOAD_MAX_REQUESTS"));
        assert!(MANAGED_SECRET_NAMES.contains(&"RATE_LIMIT_DOWNLOAD_MAX_REQUESTS"));
        assert!(MANAGED_SECRET_NAMES.contains(&"RATE_LIMIT_UPLOAD_URL_MAX_REQUESTS"));
        assert_eq!(MANAGED_SECRET_NAMES.len(), 5);
    }

    // --- path constant ---

    #[test]
    fn path_matches_expected_route() {
        assert_eq!(
            WORKSPACE_SECRETS_PATH,
            "/api/v1/infrastructure/rate-limits/workspace-secrets"
        );
    }
}
