use serde::Deserialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const AI_WHITELIST_ME_PATH: &str = "/api/v1/ai/whitelist/me";
const AI_WHITELIST_EMAILS_TABLE: &str = "ai_whitelisted_emails";
const PRIVATE_SCHEMA: &str = "private";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";
const AI_WHITELIST_APP_SESSION_TARGETS: [&str; 17] = [
    "calendar",
    "chat",
    "cms",
    "drive",
    "finance",
    "hive",
    "inventory",
    "learn",
    "mail",
    "mind",
    "mira",
    "nova",
    "rewise",
    "storefront",
    "tasks",
    "teach",
    "track",
];

#[derive(Debug)]
struct AuthenticatedAiWhitelistUser {
    email: Option<String>,
}

#[derive(Deserialize)]
struct AiWhitelistEmailRow {
    enabled: Option<bool>,
}

pub(crate) async fn handle_ai_whitelist_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != AI_WHITELIST_ME_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => ai_whitelist_me_response(config, request, outbound).await,
        method => method_not_allowed(method, "GET"),
    })
}

async fn ai_whitelist_me_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let user = match authenticated_user(config, request, outbound).await {
        Ok(user) => user,
        Err(()) => return unauthorized_response(),
    };

    let Some(email) = user.email.filter(|email| !email.trim().is_empty()) else {
        return no_store_response(json_response(
            200,
            json!({
                "email": null,
                "enabled": false,
            }),
        ));
    };

    let enabled = match ai_whitelist_email_enabled(&config.contact_data, &email, outbound).await {
        Ok(enabled) => enabled,
        Err(()) => return internal_server_error_response(),
    };

    no_store_response(json_response(
        200,
        json!({
            "email": email,
            "enabled": enabled,
        }),
    ))
}

async fn authenticated_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Result<AuthenticatedAiWhitelistUser, ()> {
    if contact::request_has_app_session_token(request) {
        let identity = contact::resolve_app_session_identity(
            config,
            request,
            &AI_WHITELIST_APP_SESSION_TARGETS,
        )?;

        return Ok(AuthenticatedAiWhitelistUser {
            email: identity.email,
        });
    }

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return Err(());
    };
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
    else {
        return Err(());
    };

    Ok(AuthenticatedAiWhitelistUser { email: user.email })
}

async fn ai_whitelist_email_enabled(
    contact_data: &contact::ContactDataConfig,
    email: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        AI_WHITELIST_EMAILS_TABLE,
        &[
            ("select", "enabled".to_owned()),
            ("email", format!("eq.{email}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
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

    let rows = response
        .json::<Vec<AiWhitelistEmailRow>>()
        .map_err(|_| ())?;

    Ok(rows.first().and_then(|row| row.enabled).unwrap_or(false))
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(
        401,
        json!({
            "error": "Unauthorized",
        }),
    ))
}

fn internal_server_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "message": INTERNAL_SERVER_ERROR_MESSAGE,
        }),
    ))
}
