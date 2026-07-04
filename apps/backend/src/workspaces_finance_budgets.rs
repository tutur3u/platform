use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorizationError, authorize_finance_permission},
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const BUDGETS_ERROR_MESSAGE: &str = "Error fetching budgets";
const BUDGETS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const BUDGETS_PATH_SUFFIX: &str = "/finance/budgets";
const MANAGE_FINANCE_PERMISSION: &str = "manage_finance";

pub(crate) async fn handle_workspaces_finance_budgets_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = budgets_ws_id(request.path)?;

    Some(match request.method {
        "GET" => budgets_response(config, request, ws_id, outbound).await,
        // Other methods (POST, etc.) are NOT migrated yet. Return None so the
        // Cloudflare worker falls through to the still-active Next.js route.
        _ => return None,
    })
}

async fn budgets_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
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
        Err(FinanceAuthorizationError::Unauthorized | FinanceAuthorizationError::NotFound) => {
            return unauthorized_response();
        }
        Err(FinanceAuthorizationError::Forbidden) => return insufficient_permissions_response(),
        Err(FinanceAuthorizationError::Internal) => return budgets_error_response(),
    };

    match fetch_budgets(&config.contact_data, outbound, &authorization.ws_id).await {
        Ok(rows) => no_store_response(json_response(200, rows)),
        Err(()) => budgets_error_response(),
    }
}

async fn fetch_budgets(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<Value>, ()> {
    // Mirror the legacy sbAdmin query:
    //   .from('finance_budgets').select('*')
    //     .eq('ws_id', wsId).eq('is_active', true)
    //     .order('created_at', { ascending: false })
    let Some(url) = contact_data.rest_url(
        "finance_budgets",
        &[
            ("select", "*".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("is_active", "eq.true".to_owned()),
            ("order", "created_at.desc".to_owned()),
        ],
    ) else {
        return Err(());
    };
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

    // PostgREST returns a JSON array; default to [] when null/empty
    // to match `data ?? []` in the legacy route.
    response.json::<Vec<Value>>().map_err(|_| ())
}

fn budgets_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(BUDGETS_PATH_PREFIX)?
        .strip_suffix(BUDGETS_PATH_SUFFIX)?;

    // Reject empty or nested segments. This also excludes the sibling
    // `/finance/budgets/status` route (handled by finance_budget_status),
    // because stripping the `/finance/budgets` suffix would not match.
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(401, json!({ "message": "Unauthorized" })))
}

fn insufficient_permissions_response() -> BackendResponse {
    no_store_response(json_response(
        403,
        json!({ "message": "Insufficient permissions" }),
    ))
}

fn budgets_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": BUDGETS_ERROR_MESSAGE }),
    ))
}
