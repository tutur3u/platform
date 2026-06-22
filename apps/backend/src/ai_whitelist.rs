use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse,
    ai_whitelist_delete::handle_ai_whitelist_delete_route,
    contact,
    infrastructure_paginated_list::{parse_js_parse_int_prefix, total_count_from_content_range},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth, text_response,
};

const AI_WHITELIST_ME_PATH: &str = "/api/v1/ai/whitelist/me";
const AI_WHITELIST_EMAILS_TABLE: &str = "ai_whitelisted_emails";
const AI_WHITELIST_DOMAINS_TABLE: &str = "ai_whitelisted_domains";
const INFRASTRUCTURE_AI_WHITELIST_DOMAINS_PATH: &str =
    "/api/v1/infrastructure/ai/whitelist/domains";
const INFRASTRUCTURE_AI_WHITELIST_EMAILS_PATH: &str = "/api/v1/infrastructure/ai/whitelist/emails";
const PRIVATE_SCHEMA: &str = "private";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";
const INTERNAL_SERVER_ERROR_TEXT: &str = "Internal Server Error";
const AI_WHITELIST_ACCESS_DOMAIN: &str = "@tuturuuu.com";
const FORBIDDEN_ACTION_MESSAGE: &str = "You are not allowed to perform this action";
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

#[derive(Clone, Debug, Eq, PartialEq)]
struct AiWhitelistListQuery {
    page: i64,
    page_size: i64,
    q: Option<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct AiWhitelistListSpec {
    search_column: &'static str,
    select: &'static str,
    table: &'static str,
}

const AI_WHITELIST_DOMAINS_LIST_SPEC: AiWhitelistListSpec = AiWhitelistListSpec {
    search_column: "domain",
    select: "domain,description,enabled,created_at",
    table: AI_WHITELIST_DOMAINS_TABLE,
};

const AI_WHITELIST_EMAILS_LIST_SPEC: AiWhitelistListSpec = AiWhitelistListSpec {
    search_column: "email",
    select: "email,enabled,created_at",
    table: AI_WHITELIST_EMAILS_TABLE,
};

pub(crate) async fn handle_ai_whitelist_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if let Some(response) = handle_ai_whitelist_delete_route(config, request, outbound).await {
        return Some(response);
    }

    match (request.method, request.path) {
        ("GET", AI_WHITELIST_ME_PATH) => {
            Some(ai_whitelist_me_response(config, request, outbound).await)
        }
        (method, AI_WHITELIST_ME_PATH) => Some(method_not_allowed(method, "GET")),
        ("GET", INFRASTRUCTURE_AI_WHITELIST_DOMAINS_PATH) => Some(
            ai_whitelist_list_response(config, request, outbound, AI_WHITELIST_DOMAINS_LIST_SPEC)
                .await,
        ),
        ("GET", INFRASTRUCTURE_AI_WHITELIST_EMAILS_PATH) => Some(
            ai_whitelist_list_response(config, request, outbound, AI_WHITELIST_EMAILS_LIST_SPEC)
                .await,
        ),
        _ => None,
    }
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

async fn ai_whitelist_list_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
    spec: AiWhitelistListSpec,
) -> BackendResponse {
    if authorize_ai_whitelist_infrastructure_access(config, request, outbound)
        .await
        .is_err()
    {
        return forbidden_response();
    }

    let query = ai_whitelist_list_query_from_url(request.url);
    let response = match fetch_ai_whitelist_list(&config.contact_data, outbound, &query, spec).await
    {
        Ok(response) => response,
        Err(()) => return internal_server_error_text_response(),
    };
    let count = total_count_from_content_range(&response).unwrap_or(0);
    let rows = match response.json::<Vec<Value>>() {
        Ok(rows) => rows,
        Err(_) => return internal_server_error_text_response(),
    };

    no_store_response(json_response(
        200,
        json!({
            "data": rows,
            "count": count,
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

pub(crate) async fn authorize_ai_whitelist_infrastructure_access(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Result<(), ()> {
    let access_token = supabase_auth::request_access_token(request).ok_or(())?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .ok_or(())?;
    let email = user.email.ok_or(())?;

    email
        .ends_with(AI_WHITELIST_ACCESS_DOMAIN)
        .then_some(())
        .ok_or(())
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

async fn fetch_ai_whitelist_list(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    query: &AiWhitelistListQuery,
    spec: AiWhitelistListSpec,
) -> Result<OutboundResponse, ()> {
    let mut params = vec![
        ("select", spec.select.to_owned()),
        ("order", "created_at.desc".to_owned()),
    ];

    if let Some(search) = &query.q {
        params.push((spec.search_column, format!("ilike.%{search}%")));
    }

    let Some(url) = contact_data.rest_url(spec.table, &params) else {
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
                .with_header("apikey", service_role_key)
                .with_header("Range-Unit", "items")
                .with_header("Range", &ai_whitelist_list_range(query))
                .with_header("Prefer", "count=exact"),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response)
}

fn ai_whitelist_list_query_from_url(request_url: Option<&str>) -> AiWhitelistListQuery {
    let mut query = AiWhitelistListQuery {
        page: 1,
        page_size: 10,
        q: None,
    };
    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return query;
    };
    let mut saw_page = false;
    let mut saw_page_size = false;
    let mut saw_q = false;

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "page" if !saw_page => {
                query.page = parse_positive_integer_with_default(&value, 1);
                saw_page = true;
            }
            "pageSize" if !saw_page_size => {
                query.page_size = parse_positive_integer_with_default(&value, 10);
                saw_page_size = true;
            }
            "q" if !saw_q => {
                let normalized = value.trim().to_owned();
                if !normalized.is_empty() {
                    query.q = Some(normalized);
                }
                saw_q = true;
            }
            _ => {}
        }
    }

    query
}

fn parse_positive_integer_with_default(value: &str, fallback: i64) -> i64 {
    let parsed = parse_js_parse_int_prefix(value);

    parsed.filter(|value| *value > 0).unwrap_or(fallback)
}

fn ai_whitelist_list_range(query: &AiWhitelistListQuery) -> String {
    let offset = (query.page - 1) * query.page_size;

    format!("{offset}-{}", offset + query.page_size - 1)
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(
        401,
        json!({
            "error": "Unauthorized",
        }),
    ))
}

fn forbidden_response() -> BackendResponse {
    no_store_response(json_response(
        403,
        json!({
            "message": FORBIDDEN_ACTION_MESSAGE,
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

fn internal_server_error_text_response() -> BackendResponse {
    no_store_response(text_response(
        500,
        INTERNAL_SERVER_ERROR_TEXT,
        "text/plain;charset=UTF-8",
    ))
}
