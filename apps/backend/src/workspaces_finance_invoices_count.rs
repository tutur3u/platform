//! Handler for `GET /api/v1/workspaces/:wsId/finance/invoices/count`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/finance/invoices/count/route.ts`.
//!
//! The legacy route exposes two code paths:
//!   1. an `API_KEY` header path that validates a workspace API key and reads
//!      `finance_invoices` with the admin (service-role) client; and
//!   2. a session path that resolves the finance route auth context, requires the
//!      `view_invoices` workspace permission, and reads `finance_invoices` with
//!      the admin (service-role) client.
//!
//! NOTE: `BackendRequest` does not surface the raw `API_KEY` header, so the
//! legacy API-key path cannot be reproduced here. This handler implements the
//! session path (the common case) and reuses `finance_auth::authorize_finance_permission`
//! for authentication, workspace-id normalization, and the `view_invoices`
//! permission check, matching the legacy status codes:
//!   * missing/invalid session or unresolved workspace -> `401 Unauthorized`
//!   * authenticated caller lacking `view_invoices`     -> `403 Unauthorized`
//!   * configuration / upstream read failure            -> `500` with
//!     `{ "message": "Error fetching workspace users" }` (matches legacy text)
//!
//! On success the legacy route returns the bare invoice count as JSON
//! (`data?.count || 0`), so this handler responds with a bare JSON number.

use serde::Deserialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorization, FinanceAuthorizationError, authorize_finance_permission},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const INVOICES_COUNT_PATH_PREFIX: &str = "/api/v1/workspaces/";
const INVOICES_COUNT_PATH_SUFFIX: &str = "/finance/invoices/count";
const VIEW_INVOICES_PERMISSION: &str = "view_invoices";
const INVOICES_COUNT_ERROR_MESSAGE: &str = "Error fetching workspace users";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";

#[derive(Deserialize)]
struct InvoiceCountRow {
    count: Option<i64>,
}

pub(crate) async fn handle_workspaces_finance_invoices_count_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = invoices_count_ws_id(request.path)?;

    Some(match request.method {
        "GET" => invoices_count_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn invoices_count_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let authorization = match authorize_finance_permission(
        config,
        request,
        raw_ws_id,
        VIEW_INVOICES_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(FinanceAuthorizationError::Unauthorized | FinanceAuthorizationError::NotFound) => {
            return message_response(401, UNAUTHORIZED_MESSAGE);
        }
        Err(FinanceAuthorizationError::Forbidden) => {
            return message_response(403, UNAUTHORIZED_MESSAGE);
        }
        Err(FinanceAuthorizationError::Internal) => {
            return error_response();
        }
    };

    match fetch_invoices_count(&config.contact_data, outbound, &authorization).await {
        Ok(count) => no_store_response(json_response(200, count)),
        Err(()) => error_response(),
    }
}

async fn fetch_invoices_count(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
) -> Result<i64, ()> {
    // The legacy route reads with the admin (service-role) client, so RLS is
    // bypassed and the read is scoped purely by the `ws_id` filter.
    let url = contact_data
        .rest_url(
            "finance_invoices",
            &[
                ("select", "count()".to_owned()),
                ("ws_id", format!("eq.{}", authorization.ws_id)),
            ],
        )
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // PostgREST serializes a `count()` aggregate select as `[{ "count": N }]`.
    // Mirror the legacy `data?.count || 0` fallback.
    Ok(response
        .json::<Vec<InvoiceCountRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.count)
        .unwrap_or(0))
}

fn invoices_count_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(INVOICES_COUNT_PATH_PREFIX)?
        .strip_suffix(INVOICES_COUNT_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response() -> BackendResponse {
    message_response(500, INVOICES_COUNT_ERROR_MESSAGE)
}
