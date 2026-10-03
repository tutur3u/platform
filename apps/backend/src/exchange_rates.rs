use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const EXCHANGE_RATES_PATH: &str = "/api/v1/exchange-rates";
const BASE_CURRENCY: &str = "USD";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FETCH_RATES_FAILED_MESSAGE: &str = "Failed to fetch rates";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

#[derive(Deserialize)]
struct LatestDateRow {
    date: Option<String>,
}

#[derive(Deserialize, Serialize)]
struct ExchangeRateRow {
    base_currency: Option<String>,
    target_currency: Option<String>,
    rate: Option<f64>,
    date: Option<String>,
}

pub(crate) async fn handle_exchange_rates_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != EXCHANGE_RATES_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => exchange_rates_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn exchange_rates_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Verified satellite sessions have no Supabase JWT. Currency rates are
    // global reference data; only this branch may use the server read client.
    let access_token = if contact::request_has_app_session_token(request) {
        let Ok(identity) = contact::resolve_app_session_identity(
            config,
            request,
            contact::current_user_app_session_targets(),
        ) else {
            return error_response(401, UNAUTHORIZED_MESSAGE);
        };
        if let Some(response) = suspended_app_session_response(config, &identity.id, outbound).await
        {
            return response;
        }
        let Some(key) = config.contact_data.service_role_key() else {
            return error_response(500, INTERNAL_SERVER_ERROR_MESSAGE);
        };
        key.to_owned()
    } else {
        let Some(token) = supabase_auth::request_access_token(request) else {
            return error_response(401, UNAUTHORIZED_MESSAGE);
        };
        if supabase_auth::fetch_supabase_auth_user(&config.contact_data, &token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
            .is_none()
        {
            return error_response(401, UNAUTHORIZED_MESSAGE);
        }
        token
    };

    // Get the latest date's exchange rates for the USD base currency.
    let latest_date =
        match latest_exchange_rate_date(&config.contact_data, outbound, &access_token).await {
            Ok(date) => date,
            Err(()) => return error_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
        };

    // If no rates exist yet, the legacy route triggers a cron endpoint to seed
    // initial data. That internal HTTP seeding hop is not available in the
    // Workers backend, so we mirror the legacy "no seeded data" terminal branch
    // and return an empty payload. See module notes.
    let Some(date) = latest_date else {
        return no_store_response(json_response(
            200,
            json!({ "data": [], "date": serde_json::Value::Null }),
        ));
    };

    match exchange_rates_for_date(&config.contact_data, outbound, &access_token, &date).await {
        Ok(rates) => no_store_response(json_response(
            200,
            json!({
                "data": rates,
                "date": date,
            }),
        )),
        Err(()) => error_response(500, FETCH_RATES_FAILED_MESSAGE),
    }
}

// Match the live session middleware: deny an active suspension before rate
// reads, and preserve its documented fail-open behavior on policy-store errors.
async fn suspended_app_session_response(
    config: &BackendConfig,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let url = config.contact_data.rest_url(
        "user_suspensions",
        &[
            ("select", "id,reason,expires_at".to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("lifted_at", "is.null".to_owned()),
            ("or", "(expires_at.is.null,expires_at.gt.now())".to_owned()),
            ("order", "suspended_at.desc".to_owned()),
            ("limit", "1".to_owned()),
        ],
    )?;
    let key = config.contact_data.service_role_key()?;
    let response = send_caller_rest_request(&config.contact_data, outbound, &url, key)
        .await
        .ok()?;
    if !(200..300).contains(&response.status) {
        return None;
    }
    let rows = response.json::<Vec<serde_json::Value>>().ok()?;
    let suspension = rows.first()?;
    Some(no_store_response(json_response(
        403,
        json!({
            "error": "Forbidden",
            "message": suspension.get("reason").and_then(|value| value.as_str()).unwrap_or("Account suspended"),
        }),
    )))
}

async fn latest_exchange_rate_date(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "currency_exchange_rates",
        &[
            ("select", "date".to_owned()),
            ("base_currency", format!("eq.{BASE_CURRENCY}")),
            ("order", "date.desc".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<LatestDateRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.date))
}

async fn exchange_rates_for_date(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
    date: &str,
) -> Result<Vec<ExchangeRateRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "currency_exchange_rates",
        &[
            (
                "select",
                "base_currency,target_currency,rate,date".to_owned(),
            ),
            ("base_currency", format!("eq.{BASE_CURRENCY}")),
            ("date", format!("eq.{date}")),
            ("order", "target_currency.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<ExchangeRateRow>>().map_err(|_| ())
}

// Copied (file-local) from the caller-token REST request helper used by other
// authed read handlers (e.g. workspace_habits_access::send_caller_rest_request).
// Duplicated here to keep this module self-contained without editing shared files.
async fn send_caller_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");

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
