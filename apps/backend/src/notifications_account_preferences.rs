use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const NOTIFICATIONS_ACCOUNT_PREFERENCES_PATH: &str = "/api/v1/notifications/account-preferences";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FETCH_FAILED_MESSAGE: &str = "Failed to fetch preferences";
const INTERNAL_ERROR_MESSAGE: &str = "Internal server error";

/// GET /api/v1/notifications/account-preferences
///
/// Mirrors `apps/web/src/app/api/v1/notifications/account-preferences/route.ts`.
/// Only the GET method is migrated here; every other method returns `None`
/// so the Cloudflare worker falls through to the still-active Next.js route
/// (which still serves PUT for this path).
pub(crate) async fn handle_notifications_account_preferences_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != NOTIFICATIONS_ACCOUNT_PREFERENCES_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => account_preferences_response(config, request, outbound).await,
        // Do NOT 405 here: PUT (and any future methods) are still owned by the
        // legacy Next.js route, so fall through by returning None.
        _ => return None,
    })
}

async fn account_preferences_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };

    match fetch_account_preferences(&config.contact_data, outbound, &user_id, &access_token).await {
        Ok(preferences) => {
            no_store_response(json_response(200, json!({ "preferences": preferences })))
        }
        Err(()) => error_response(500, FETCH_FAILED_MESSAGE),
    }
}

/// Reads account-level (`ws_id IS NULL`) notification preferences for the
/// authenticated user. The legacy route uses the RLS-scoped caller client and
/// `select('*')`, so this issues a caller-token request and preserves every
/// column by deserializing into a raw JSON array.
async fn fetch_account_preferences(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "notification_preferences",
        &[
            ("select", "*".to_owned()),
            ("ws_id", "is.null".to_owned()),
            ("user_id", format!("eq.{user_id}")),
        ],
    ) else {
        return Err(());
    };

    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

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
    let _ = INTERNAL_ERROR_MESSAGE;
    no_store_response(json_response(status, json!({ "error": message })))
}
