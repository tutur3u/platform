use base64::Engine;
use base64::engine::general_purpose::URL_SAFE;
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const AUTH_MFA_ASSURANCE_LEVEL_PATH: &str = "/api/auth/mfa/totp/assurance-level";
const AUTH_MFA_TOTP_FACTORS_PATH: &str = "/api/auth/mfa/totp/factors";
const AUTH_MFA_TOTP_FACTOR_PATH_PREFIX: &str = "/api/auth/mfa/totp/factors/";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";
const MISSING_FACTOR_ID_MESSAGE: &str = "Missing factorId";
const FACTOR_NOT_FOUND_MESSAGE: &str = "Factor not found";
const FACTOR_UNENROLLED_MESSAGE: &str = "Factor unenrolled successfully";
const SUPABASE_AUTH_API_VERSION: &str = "2024-01-01";
const SUPABASE_AUTH_USER_PATH: &str = "user";
const SUPABASE_AUTH_FACTORS_PATH: &str = "factors";
const JSON_UTF8_CONTENT_TYPE: &str = "application/json;charset=UTF-8";
const VERIFIED_FACTOR_STATUS: &str = "verified";
const FACTOR_TYPE_TOTP: &str = "totp";
const FACTOR_TYPE_PHONE: &str = "phone";
const FACTOR_TYPE_WEBAUTHN: &str = "webauthn";
const AAL2: &str = "aal2";

mod handlers;
mod logic;
mod responses;
mod supabase;

use handlers::*;
use logic::*;
use responses::*;
use supabase::*;

#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_factors;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum AuthMfaRoute<'a> {
    AssuranceLevel,
    TotpFactors,
    TotpFactor { factor_id: &'a str },
}

#[derive(Debug, Eq, PartialEq)]
enum SupabaseAuthRequestError {
    Api(String),
    Internal,
}

pub(crate) async fn handle_auth_mfa_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let route = auth_mfa_route(request.path)?;

    Some(match route {
        AuthMfaRoute::AssuranceLevel => match request.method {
            "GET" => {
                auth_mfa_assurance_level_response(&config.contact_data, request, outbound).await
            }
            method => no_store_response(method_not_allowed(method, "GET")),
        },
        AuthMfaRoute::TotpFactors => match request.method {
            "GET" => {
                auth_mfa_totp_factors_get_response(&config.contact_data, request, outbound).await
            }
            "POST" => {
                auth_mfa_totp_factors_post_response(&config.contact_data, request, outbound).await
            }
            method => no_store_response(method_not_allowed(method, "GET, POST")),
        },
        AuthMfaRoute::TotpFactor { factor_id } => match request.method {
            "GET" => {
                auth_mfa_totp_factor_get_response(
                    &config.contact_data,
                    request,
                    outbound,
                    factor_id,
                )
                .await
            }
            "DELETE" => {
                auth_mfa_totp_factor_delete_response(
                    &config.contact_data,
                    request,
                    outbound,
                    factor_id,
                )
                .await
            }
            method => no_store_response(method_not_allowed(method, "GET, DELETE")),
        },
    })
}

pub(crate) fn should_buffer_request_body(method: &str, path: &str) -> bool {
    matches!((method, path), ("POST", AUTH_MFA_TOTP_FACTORS_PATH))
}

fn auth_mfa_route(path: &str) -> Option<AuthMfaRoute<'_>> {
    if path == AUTH_MFA_ASSURANCE_LEVEL_PATH {
        return Some(AuthMfaRoute::AssuranceLevel);
    }

    if path == AUTH_MFA_TOTP_FACTORS_PATH {
        return Some(AuthMfaRoute::TotpFactors);
    }

    let factor_id = path.strip_prefix(AUTH_MFA_TOTP_FACTOR_PATH_PREFIX)?;
    if factor_id.contains('/') {
        return None;
    }

    Some(AuthMfaRoute::TotpFactor { factor_id })
}
