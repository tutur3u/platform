use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorization, FinanceAuthorizationError, authorize_finance_permission},
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const RECURRING_TRANSACTIONS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const RECURRING_TRANSACTIONS_PATH_SUFFIX: &str = "/finance/recurring-transactions";
const VIEW_TRANSACTIONS_PERMISSION: &str = "view_transactions";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FETCH_ERROR_MESSAGE: &str = "Failed to fetch recurring transactions";

pub(crate) async fn handle_workspaces_finance_recurring_transactions_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = recurring_transactions_ws_id(request.path)?;

    // Only the GET method is migrated. Every other method (e.g. POST creating a
    // recurring transaction) must fall through to the still-active Next.js
    // route, so we return None for them instead of a 405.
    Some(match request.method {
        "GET" => recurring_transactions_response(config, request, ws_id, outbound).await,
        _ => return None,
    })
}

async fn recurring_transactions_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let authorization = match authorize_finance_permission(
        config,
        request,
        raw_ws_id,
        VIEW_TRANSACTIONS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(FinanceAuthorizationError::Unauthorized | FinanceAuthorizationError::NotFound) => {
            return message_response(401, UNAUTHORIZED_MESSAGE);
        }
        // Legacy returns 403 with the message "Unauthorized" when the caller
        // lacks `view_transactions`.
        Err(FinanceAuthorizationError::Forbidden) => {
            return message_response(403, UNAUTHORIZED_MESSAGE);
        }
        Err(FinanceAuthorizationError::Internal) => {
            return message_response(500, FETCH_ERROR_MESSAGE);
        }
    };

    match fetch_recurring_transactions(&config.contact_data, outbound, &authorization).await {
        Ok(rows) => no_store_response(json_response(200, json!({ "recurringTransactions": rows }))),
        Err(()) => message_response(500, FETCH_ERROR_MESSAGE),
    }
}

async fn fetch_recurring_transactions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
) -> Result<Value, ()> {
    // Mirrors the legacy Supabase query:
    //   .from('recurring_transactions')
    //   .select('*')
    //   .eq('ws_id', normalizedWsId)
    //   .order('next_occurrence', { ascending: true })
    let Some(url) = contact_data.rest_url(
        "recurring_transactions",
        &[
            ("select", "*".to_owned()),
            ("ws_id", format!("eq.{}", authorization.ws_id)),
            ("order", "next_occurrence.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_rest_request(contact_data, outbound, &url, authorization).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // Legacy returns `data ?? []`; PostgREST always returns an array on success.
    let rows = response.json::<Value>().map_err(|_| ())?;
    if rows.is_array() {
        Ok(rows)
    } else {
        Ok(Value::Array(Vec::new()))
    }
}

// Copied from the private `send_rest_request` helper in `finance_auth.rs` to
// keep this module self-contained (per the no-shared-file-edit constraint).
// Prefers the caller's access token (mirrors the RLS-scoped supabase client in
// the legacy route) and falls back to the service role key for app-session /
// CLI callers that have no Supabase access token.
async fn send_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    authorization: &FinanceAuthorization,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = authorization.access_token.as_deref().map_or_else(
        || format!("Bearer {service_role_key}"),
        |access_token| format!("Bearer {access_token}"),
    );

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

fn recurring_transactions_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(RECURRING_TRANSACTIONS_PATH_PREFIX)?
        .strip_suffix(RECURRING_TRANSACTIONS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
