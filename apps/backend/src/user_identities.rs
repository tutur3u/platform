use serde::Serialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const FAILED_TO_LOAD_IDENTITIES_MESSAGE: &str = "Failed to load linked identities";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const USER_IDENTITIES_CACHE_CONTROL: &str = "private, max-age=30, stale-while-revalidate=30";
const USER_IDENTITIES_PATH: &str = "/api/v1/users/me/identities";
const SUPABASE_AUTH_USER_PATH: &str = "user";

#[derive(Debug, Eq, PartialEq)]
enum SupabaseUserIdentitiesError {
    Api(String),
    Internal,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UserIdentitiesResponse {
    identities: Vec<Value>,
    can_unlink: bool,
}

pub(crate) async fn handle_user_identities_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != USER_IDENTITIES_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => user_identities_response(&config.contact_data, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn user_identities_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, "error", UNAUTHORIZED_MESSAGE);
    };

    let user = match fetch_supabase_auth_user_value(contact_data, &access_token, outbound).await {
        Ok(user) => user,
        Err(SupabaseUserIdentitiesError::Api(message)) => {
            return error_response(400, "message", &message);
        }
        Err(SupabaseUserIdentitiesError::Internal) => {
            return error_response(500, "message", INTERNAL_SERVER_ERROR_MESSAGE);
        }
    };

    let identities = user
        .get("identities")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let can_unlink = identities.len() >= 2;

    private_cached_response(json_response(
        200,
        UserIdentitiesResponse {
            identities,
            can_unlink,
        },
    ))
}

async fn fetch_supabase_auth_user_value(
    contact_data: &contact::ContactDataConfig,
    access_token: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Value, SupabaseUserIdentitiesError> {
    let user_url = contact_data
        .auth_url(SUPABASE_AUTH_USER_PATH)
        .ok_or(SupabaseUserIdentitiesError::Internal)?;
    let service_role_key = contact_data
        .service_role_key()
        .ok_or(SupabaseUserIdentitiesError::Internal)?;
    let authorization = format!("Bearer {access_token}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &user_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| SupabaseUserIdentitiesError::Internal)?;

    if !(200..300).contains(&response.status) {
        return Err(SupabaseUserIdentitiesError::Api(
            supabase_auth_error_message(&response.body_text),
        ));
    }

    response
        .json::<Value>()
        .map_err(|_| SupabaseUserIdentitiesError::Internal)
}

fn supabase_auth_error_message(body_text: &str) -> String {
    serde_json::from_str::<Value>(body_text)
        .ok()
        .and_then(|value| {
            value
                .get("message")
                .or_else(|| value.get("error"))
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .unwrap_or_else(|| FAILED_TO_LOAD_IDENTITIES_MESSAGE.to_owned())
}

fn private_cached_response(mut response: BackendResponse) -> BackendResponse {
    response.cache_control = Some(USER_IDENTITIES_CACHE_CONTROL);
    response
}

fn error_response(status: u16, key: &'static str, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ key: message })))
}
