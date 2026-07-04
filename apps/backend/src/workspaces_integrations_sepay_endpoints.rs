//! GET /api/v1/workspaces/:wsId/integrations/sepay/endpoints
//!
//! Ports the GET method of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/integrations/sepay/endpoints/route.ts`.
//!
//! Behavior mirrored from the legacy route + its `shared.ts`/`feature-flag.ts`:
//!   1. `requireSepayAccess`: authenticate the caller, normalize the workspace
//!      id (slug/handle/personal/internal), and require the `manage_finance`
//!      permission. This is exactly what `finance_auth::authorize_finance_permission`
//!      provides, so we reuse it.
//!   2. `requireSepayFeatureEnabled`: the `ENABLE_SEPAY_INTEGRATION` workspace
//!      secret must be truthy (`1`/`true`/`yes`/`on`, case-insensitive). The
//!      legacy code reads this with the admin (service-role) client, so we do
//!      too. A read error surfaces as a 500; a disabled flag surfaces as a 403.
//!   3. List `sepay_webhook_endpoints` rows for the workspace where
//!      `active = true` and `deleted_at IS NULL`, ordered by `created_at desc`,
//!      returning the legacy `endpointSelectColumns`. The legacy code uses the
//!      admin (service-role) client for this read, so we use service role too.
//!
//! The POST method of the legacy route is NOT migrated; this handler returns
//! `None` for every non-GET method so the Cloudflare worker falls through to the
//! still-active Next.js route for those mutations.
//!
//! NOTE FOR INTEGRATOR: the legacy `requireSepayAccess` distinguishes a Supabase
//! `authError` (401 "Failed to authenticate request") from a missing user (401
//! "Unauthorized"). `authorize_finance_permission` collapses both into
//! `Unauthorized`, so we always emit 401 "Unauthorized" for the unauthenticated
//! case (same status code; message differs only on the auth-error edge case).
//! Likewise a workspace-normalization failure maps to 500 here. The select
//! columns are returned verbatim as JSON `Value` rows to preserve the exact
//! response shape (`data ?? []`).

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorizationError, authorize_finance_permission},
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const SEPAY_ENDPOINTS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const SEPAY_ENDPOINTS_PATH_SUFFIX: &str = "/integrations/sepay/endpoints";

const MANAGE_FINANCE_PERMISSION: &str = "manage_finance";
const SEPAY_FEATURE_FLAG_SECRET: &str = "ENABLE_SEPAY_INTEGRATION";

const ENDPOINT_SELECT_COLUMNS: &str = "id, ws_id, wallet_id, token_prefix, active, sepay_webhook_id, created_at, rotated_at, last_used_at";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient permissions";
const RESOLVE_WORKSPACE_ERROR_MESSAGE: &str = "Failed to resolve workspace";
const FEATURE_DISABLED_MESSAGE: &str = "SePay integration is disabled for this workspace";
const FEATURE_RESOLVE_ERROR_MESSAGE: &str = "Failed to resolve SePay integration availability";
const LIST_ERROR_MESSAGE: &str = "Error fetching SePay endpoints";

#[derive(Deserialize)]
struct WorkspaceSecretValueRow {
    value: Option<String>,
}

pub(crate) async fn handle_workspaces_integrations_sepay_endpoints_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = sepay_endpoints_ws_id(request.path)?;

    Some(match request.method {
        "GET" => sepay_endpoints_response(config, request, ws_id, outbound).await,
        // POST (and any other method) is not migrated yet; return None so the
        // Cloudflare worker falls through to the still-active Next.js route.
        _ => return None,
    })
}

async fn sepay_endpoints_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // requireSepayAccess: authenticate + normalize workspace + manage_finance.
    let authorization = match authorize_finance_permission(
        config,
        request,
        raw_ws_id,
        MANAGE_FINANCE_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(FinanceAuthorizationError::Unauthorized) => {
            return message_response(401, UNAUTHORIZED_MESSAGE);
        }
        Err(FinanceAuthorizationError::Forbidden) => {
            return message_response(403, INSUFFICIENT_PERMISSIONS_MESSAGE);
        }
        Err(FinanceAuthorizationError::NotFound | FinanceAuthorizationError::Internal) => {
            return message_response(500, RESOLVE_WORKSPACE_ERROR_MESSAGE);
        }
    };

    // requireSepayFeatureEnabled: ENABLE_SEPAY_INTEGRATION secret must be truthy.
    match sepay_integration_enabled(&config.contact_data, outbound, &authorization.ws_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(403, FEATURE_DISABLED_MESSAGE),
        Err(()) => return message_response(500, FEATURE_RESOLVE_ERROR_MESSAGE),
    }

    // List sepay_webhook_endpoints (active, not soft-deleted), newest first.
    match list_sepay_endpoints(&config.contact_data, outbound, &authorization.ws_id).await {
        Ok(rows) => no_store_response(json_response(200, rows)),
        Err(()) => message_response(500, LIST_ERROR_MESSAGE),
    }
}

async fn sepay_integration_enabled(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "value".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("name", format!("eq.{SEPAY_FEATURE_FLAG_SECRET}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let value = response
        .json::<Vec<WorkspaceSecretValueRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.value);

    Ok(is_truthy_secret(value.as_deref()))
}

async fn list_sepay_endpoints(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "sepay_webhook_endpoints",
        &[
            ("select", ENDPOINT_SELECT_COLUMNS.to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("active", "eq.true".to_owned()),
            ("deleted_at", "is.null".to_owned()),
            ("order", "created_at.desc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;

    if !is_success_status(response.status) {
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

fn sepay_endpoints_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(SEPAY_ENDPOINTS_PATH_PREFIX)?
        .strip_suffix(SEPAY_ENDPOINTS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn is_truthy_secret(value: Option<&str>) -> bool {
    let Some(value) = value else {
        return false;
    };
    let normalized = value.trim().to_lowercase();
    matches!(normalized.as_str(), "1" | "true" | "yes" | "on")
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
