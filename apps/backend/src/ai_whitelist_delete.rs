use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse,
    ai_whitelist::authorize_ai_whitelist_infrastructure_access,
    contact, json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    text_response,
};

const AI_WHITELIST_EMAILS_TABLE: &str = "ai_whitelisted_emails";
const AI_WHITELIST_DOMAINS_TABLE: &str = "ai_whitelisted_domains";
const INFRASTRUCTURE_AI_WHITELIST_DOMAIN_DETAIL_PREFIX: &str =
    "/api/v1/infrastructure/ai/whitelist/domain/";
const INFRASTRUCTURE_AI_WHITELIST_EMAIL_DETAIL_PREFIX: &str =
    "/api/v1/infrastructure/ai/whitelist/";
const PRIVATE_SCHEMA: &str = "private";
const INTERNAL_SERVER_ERROR_TEXT: &str = "Internal Server Error";
const FORBIDDEN_ACTION_MESSAGE: &str = "You are not allowed to perform this action";

#[derive(Clone, Debug, Eq, PartialEq)]
enum AiWhitelistDetailTarget {
    Domain(String),
    Email(String),
}

pub(crate) async fn handle_ai_whitelist_delete_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let target = ai_whitelist_detail_target(request.path)?;

    match request.method {
        "PUT" => Some(ai_whitelist_update_response(config, request, outbound, target).await),
        "DELETE" => Some(ai_whitelist_delete_response(config, request, outbound, target).await),
        _ => None,
    }
}

async fn ai_whitelist_update_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
    target: AiWhitelistDetailTarget,
) -> BackendResponse {
    if authorize_ai_whitelist_infrastructure_access(config, request, outbound)
        .await
        .is_err()
    {
        return forbidden_response();
    }

    match target {
        AiWhitelistDetailTarget::Email(email) => {
            if email.is_empty() {
                return no_store_response(json_response(
                    400,
                    json!({ "message": "Email is required" }),
                ));
            }
            let Ok(enabled) = enabled_from_body(request.body_text) else {
                return no_store_response(json_response(
                    500,
                    json!({ "message": "Error updating AI whitelist email" }),
                ));
            };

            if update_ai_whitelist_enabled(
                &config.contact_data,
                outbound,
                AI_WHITELIST_EMAILS_TABLE,
                "email",
                &email,
                enabled,
            )
            .await
            .is_err()
            {
                return no_store_response(json_response(
                    500,
                    json!({ "message": "Error updating AI whitelist email" }),
                ));
            }
        }
        AiWhitelistDetailTarget::Domain(domain) => {
            let Ok(enabled) = enabled_from_body(request.body_text) else {
                return internal_server_error_text_response();
            };

            if update_ai_whitelist_enabled(
                &config.contact_data,
                outbound,
                AI_WHITELIST_DOMAINS_TABLE,
                "domain",
                &domain,
                enabled,
            )
            .await
            .is_err()
            {
                return internal_server_error_text_response();
            }
        }
    }

    no_store_response(json_response(200, json!({ "success": true })))
}

async fn ai_whitelist_delete_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
    target: AiWhitelistDetailTarget,
) -> BackendResponse {
    if authorize_ai_whitelist_infrastructure_access(config, request, outbound)
        .await
        .is_err()
    {
        return forbidden_response();
    }

    match target {
        AiWhitelistDetailTarget::Email(email) => {
            if email.is_empty() {
                return no_store_response(json_response(
                    400,
                    json!({ "message": "Email is required" }),
                ));
            }

            if delete_ai_whitelist_row(
                &config.contact_data,
                outbound,
                AI_WHITELIST_EMAILS_TABLE,
                "email",
                &email,
            )
            .await
            .is_err()
            {
                return no_store_response(json_response(
                    500,
                    json!({ "message": "Error deleting AI whitelist email" }),
                ));
            }
        }
        AiWhitelistDetailTarget::Domain(domain) => {
            if delete_ai_whitelist_row(
                &config.contact_data,
                outbound,
                AI_WHITELIST_DOMAINS_TABLE,
                "domain",
                &domain,
            )
            .await
            .is_err()
            {
                return internal_server_error_text_response();
            }
        }
    }

    no_store_response(json_response(200, json!({ "success": true })))
}

async fn update_ai_whitelist_enabled(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    filter_column: &str,
    filter_value: &str,
    enabled: bool,
) -> Result<(), ()> {
    let Some(url) = contact_data.rest_url(table, &[(filter_column, format!("eq.{filter_value}"))])
    else {
        return Err(());
    };
    let body = json!({ "enabled": enabled }).to_string();
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Patch, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Prefer", "return=minimal")
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(())
}

async fn delete_ai_whitelist_row(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    filter_column: &str,
    filter_value: &str,
) -> Result<(), ()> {
    let Some(url) = contact_data.rest_url(table, &[(filter_column, format!("eq.{filter_value}"))])
    else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Delete, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(())
}

fn ai_whitelist_detail_target(path: &str) -> Option<AiWhitelistDetailTarget> {
    if let Some(domain) = path.strip_prefix(INFRASTRUCTURE_AI_WHITELIST_DOMAIN_DETAIL_PREFIX) {
        if domain.contains('/') {
            return None;
        }

        return Some(AiWhitelistDetailTarget::Domain(decode_path_segment(domain)));
    }

    let email = path.strip_prefix(INFRASTRUCTURE_AI_WHITELIST_EMAIL_DETAIL_PREFIX)?;
    if email.contains('/') || matches!(email, "domain" | "domains" | "emails") {
        return None;
    }

    Some(AiWhitelistDetailTarget::Email(decode_path_segment(email)))
}

fn enabled_from_body(body_text: Option<&str>) -> Result<bool, ()> {
    let body = body_text
        .and_then(|body_text| serde_json::from_str::<Value>(body_text).ok())
        .ok_or(())?;

    if body.is_null() {
        return Err(());
    }

    let value = body.get("enabled").cloned().unwrap_or(Value::Null);

    Ok(js_truthy(&value))
}

fn js_truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::Number(value) => value
            .as_f64()
            .is_none_or(|value| value != 0.0 && !value.is_nan()),
        Value::String(value) => !value.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

fn decode_path_segment(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == b'%'
            && index + 2 < bytes.len()
            && let (Some(high), Some(low)) =
                (hex_value(bytes[index + 1]), hex_value(bytes[index + 2]))
        {
            decoded.push(high * 16 + low);
            index += 3;
            continue;
        }

        decoded.push(bytes[index]);
        index += 1;
    }

    match String::from_utf8(decoded) {
        Ok(value) => value,
        Err(error) => String::from_utf8_lossy(&error.into_bytes()).into_owned(),
    }
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn forbidden_response() -> BackendResponse {
    no_store_response(json_response(
        403,
        json!({
            "message": FORBIDDEN_ACTION_MESSAGE,
        }),
    ))
}

fn internal_server_error_text_response() -> BackendResponse {
    no_store_response(text_response(
        500,
        INTERNAL_SERVER_ERROR_TEXT,
        "text/plain;charset=UTF-8",
    ))
}
