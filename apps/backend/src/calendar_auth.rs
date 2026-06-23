use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const CALENDAR_AUTH_PATH: &str = "/api/v1/calendar/auth";
const CALENDAR_AUTH_APP_SESSION_TARGETS: [&str; 1] = ["calendar"];

const FORBIDDEN_MESSAGE: &str = "Forbidden";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const WS_ID_REQUIRED_MESSAGE: &str = "wsId is required";
const SERVER_MISCONFIGURED_MESSAGE: &str = "Calendar OAuth is not configured";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const GOOGLE_OAUTH_AUTHORIZE_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_CALENDAR_CALLBACK_PATH: &str = "/api/v1/calendar/auth/callback";
const DEFAULT_WEB_ORIGIN: &str = "https://tuturuuu.com";
const GOOGLE_CALENDAR_SCOPES: [&str; 3] = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
];

/// Env keys used to source the web origin when assembling the OAuth redirect
/// URI. Mirrors `resolveGoogleCalendarWebOrigin` precedence in the legacy app.
const WEB_ORIGIN_ENV_KEYS: [&str; 5] = [
    "WEB_APP_URL",
    "NEXT_PUBLIC_WEB_APP_URL",
    "NEXT_PUBLIC_APP_URL",
    "COOLIFY_URL",
    "COOLIFY_FQDN",
];

#[derive(Serialize)]
struct CalendarAuthResponse {
    #[serde(rename = "authUrl")]
    auth_url: String,
}

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum DataAuth {
    AccessToken(String),
    ServiceRole,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct Caller {
    data_auth: DataAuth,
    id: String,
}

pub(crate) async fn handle_calendar_auth_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != CALENDAR_AUTH_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => calendar_auth_get_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn calendar_auth_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(raw_ws_id) = calendar_auth_ws_id(request.url) else {
        return message_response(400, WS_ID_REQUIRED_MESSAGE);
    };

    let caller = match resolve_caller(config, request, outbound).await {
        Ok(caller) => caller,
        Err(response) => return response,
    };

    let resolved_ws_id =
        match normalize_workspace_id(&config.contact_data, outbound, &raw_ws_id, &caller).await {
            Ok(ws_id) => ws_id,
            Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
        };

    match verify_workspace_member(&config.contact_data, outbound, &resolved_ws_id, &caller).await {
        Ok(true) => {}
        Ok(false) => return message_response(403, FORBIDDEN_MESSAGE),
        Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    match build_google_auth_url(request, &resolved_ws_id) {
        Some(auth_url) => no_store_response(json_response(200, CalendarAuthResponse { auth_url })),
        None => message_response(500, SERVER_MISCONFIGURED_MESSAGE),
    }
}

async fn resolve_caller(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Result<Caller, BackendResponse> {
    if contact::request_has_app_session_token(request) {
        let identity = contact::resolve_app_session_identity(
            config,
            request,
            &CALENDAR_AUTH_APP_SESSION_TARGETS,
        )
        .map_err(|_| message_response(401, UNAUTHORIZED_MESSAGE))?;

        return Ok(Caller {
            data_auth: DataAuth::ServiceRole,
            id: identity.id,
        });
    }

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return Err(message_response(401, UNAUTHORIZED_MESSAGE));
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return Err(message_response(401, UNAUTHORIZED_MESSAGE));
    };

    Ok(Caller {
        data_auth: DataAuth::AccessToken(access_token),
        id: user_id,
    })
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    caller: &Caller,
) -> Result<String, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, caller).await;
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(resolved_ws_id);
        }

        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, caller).await?
        {
            return Ok(workspace_id);
        }
        if let Some(workspace_id) =
            workspace_id_by_handle_service_role(contact_data, outbound, &handle).await?
        {
            return Ok(workspace_id);
        }
    }

    Ok(resolved_ws_id)
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    caller: &Caller,
) -> Result<String, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id,workspace_members!inner(user_id,type)".to_owned(),
            ),
            ("personal", "eq.true".to_owned()),
            ("workspace_members.user_id", format!("eq.{}", caller.id)),
            ("workspace_members.type", "eq.MEMBER".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(contact_data, outbound, &url, &caller.data_auth).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id)
        .ok_or(())
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    caller: &Caller,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id".to_owned()),
            ("handle", format!("eq.{handle}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(contact_data, outbound, &url, &caller.data_auth).await?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn workspace_id_by_handle_service_role(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id".to_owned()),
            ("handle", format!("eq.{handle}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn verify_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    caller: &Caller,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{}", caller.id)),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(contact_data, outbound, &url, &caller.data_auth).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        == Some("MEMBER"))
}

async fn send_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    auth: &DataAuth,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = match auth {
        DataAuth::AccessToken(access_token) => format!("Bearer {access_token}"),
        DataAuth::ServiceRole => format!("Bearer {service_role_key}"),
    };

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

fn build_google_auth_url(request: BackendRequest<'_>, state: &str) -> Option<String> {
    let client_id = trimmed_env("GOOGLE_CLIENT_ID")?;
    let redirect_uri = resolve_redirect_uri(request);
    let scope = GOOGLE_CALENDAR_SCOPES.join(" ");

    let mut url = url::Url::parse(GOOGLE_OAUTH_AUTHORIZE_URL).ok()?;
    url.query_pairs_mut()
        .append_pair("access_type", "offline")
        .append_pair("client_id", &client_id)
        .append_pair("include_granted_scopes", "true")
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", &scope)
        .append_pair("state", state);

    Some(url.into())
}

fn resolve_redirect_uri(request: BackendRequest<'_>) -> String {
    if let Some(explicit) = trimmed_env("GOOGLE_REDIRECT_URI").and_then(|value| {
        url::Url::parse(value.trim())
            .ok()
            .filter(|url| matches!(url.scheme(), "http" | "https"))
            .map(|url| trim_trailing_slashes(url.as_str()))
    }) {
        return explicit;
    }

    let origin = resolve_web_origin(request);
    format!("{origin}{GOOGLE_CALENDAR_CALLBACK_PATH}")
}

fn resolve_web_origin(request: BackendRequest<'_>) -> String {
    for key in WEB_ORIGIN_ENV_KEYS {
        if let Some(origin) = trimmed_env(key).and_then(|value| normalize_origin(&value)) {
            return origin;
        }
    }

    if let Some(origin) = request.origin.and_then(normalize_origin) {
        return origin;
    }

    DEFAULT_WEB_ORIGIN.to_owned()
}

fn normalize_origin(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    let candidate = if has_scheme(trimmed) {
        trimmed.to_owned()
    } else {
        format!("https://{trimmed}")
    };

    let url = url::Url::parse(&candidate).ok()?;
    if !matches!(url.scheme(), "http" | "https") {
        return None;
    }
    let host = url.host_str()?;
    if matches!(host, "0.0.0.0" | "::" | "[::]") {
        return None;
    }

    Some(url.origin().ascii_serialization())
}

fn has_scheme(value: &str) -> bool {
    match value.find("://") {
        Some(index) if index > 0 => {
            value[..index]
                .chars()
                .enumerate()
                .all(|(position, character)| {
                    if position == 0 {
                        character.is_ascii_alphabetic()
                    } else {
                        character.is_ascii_alphanumeric() || matches!(character, '+' | '.' | '-')
                    }
                })
        }
        _ => false,
    }
}

fn trim_trailing_slashes(value: &str) -> String {
    value.trim_end_matches('/').to_owned()
}

fn trimmed_env(key: &str) -> Option<String> {
    let value = std::env::var(key).ok()?;
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_owned())
}

fn calendar_auth_ws_id(request_url: Option<&str>) -> Option<String> {
    let url = request_url.and_then(|request_url| url::Url::parse(request_url).ok())?;

    url.query_pairs().find_map(|(key, value)| {
        (key == "wsId" && !value.trim().is_empty()).then(|| value.into_owned())
    })
}

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn is_direct_workspace_lookup_identifier(identifier: &str) -> bool {
    let normalized = identifier.trim().to_lowercase();

    normalized == PERSONAL_WORKSPACE_SLUG
        || normalized == ROOT_WORKSPACE_ID
        || normalized == INTERNAL_WORKSPACE_SLUG
        || is_workspace_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

fn is_workspace_uuid_literal(value: &str) -> bool {
    value.trim().len() == 36
        && value
            .trim()
            .chars()
            .enumerate()
            .all(|(index, value)| match index {
                8 | 13 | 18 | 23 => value == '-',
                _ => value.is_ascii_hexdigit(),
            })
}

fn is_workspace_handle(value: &str) -> bool {
    let length = value.len();
    if length == 0 || length > 64 {
        return false;
    }

    value.chars().enumerate().all(|(index, character)| {
        let is_edge = index == 0 || index + 1 == length;
        character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || (!is_edge && matches!(character, '_' | '-'))
    })
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
