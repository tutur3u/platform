//! Microsoft OAuth initiation route (`GET /api/v1/calendar/auth/microsoft`).
//!
//! Mirrors `apps/web/src/app/api/v1/calendar/auth/microsoft/route.ts`. Validates
//! the `wsId` query parameter, authenticates the caller (Supabase access token
//! or `calendar` app session), resolves and verifies workspace membership, then
//! builds a Microsoft (Entra ID) OAuth authorization URL with PKCE and returns
//! it as `{ "authUrl": "..." }`. The PKCE code verifier is stored in an
//! HttpOnly `ms_pkce_verifier` cookie for the callback, exactly like the legacy
//! route.
//!
//! The membership/workspace-resolution flow is intentionally identical to
//! `calendar_auth.rs` (the Google equivalent); only the OAuth URL construction,
//! the PKCE cookie, and the error messages differ.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const CALENDAR_AUTH_MICROSOFT_PATH: &str = "/api/v1/calendar/auth/microsoft";
const CALENDAR_AUTH_APP_SESSION_TARGETS: [&str; 1] = ["calendar"];

const INVALID_WS_ID_MESSAGE: &str = "Missing or invalid workspace ID";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const NOT_CONFIGURED_MESSAGE: &str = "Microsoft OAuth not configured";
const AUTH_URL_FAILED_MESSAGE: &str = "Failed to generate authentication URL";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

// Mirrors `MAX_NAME_LENGTH` from `@tuturuuu/utils/constants` (z.string().max()).
const MAX_NAME_LENGTH: usize = 255;

// Microsoft calendar scopes for 2-way calendar sync. Mirrors
// `MICROSOFT_CALENDAR_SCOPES` in `@tuturuuu/microsoft`.
const MICROSOFT_CALENDAR_SCOPES: [&str; 4] = [
    "https://graph.microsoft.com/Calendars.Read",
    "https://graph.microsoft.com/Calendars.ReadWrite",
    "https://graph.microsoft.com/User.Read",
    "offline_access",
];

const PKCE_COOKIE_NAME: &str = "ms_pkce_verifier";
const PKCE_COOKIE_MAX_AGE_SECONDS: u32 = 600;

#[derive(Serialize)]
struct CalendarAuthMicrosoftResponse {
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

/// Microsoft OAuth config sourced from environment variables. Mirrors
/// `getMicrosoftOAuthConfig` in the legacy app. `tenant_id` defaults to
/// `"common"` when unset.
struct MicrosoftOAuthConfig {
    client_id: String,
    redirect_uri: String,
    tenant_id: String,
}

pub(crate) async fn handle_calendar_auth_microsoft_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != CALENDAR_AUTH_MICROSOFT_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => calendar_auth_microsoft_get_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn calendar_auth_microsoft_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // The legacy route parses the query with z.object({ wsId: z.string().max(MAX_NAME_LENGTH) }).
    // A missing wsId, an empty wsId, or one exceeding MAX_NAME_LENGTH all fail the
    // schema and produce a 400 "Missing or invalid workspace ID".
    let Some(raw_ws_id) = calendar_auth_ws_id(request.url) else {
        return message_response(400, INVALID_WS_ID_MESSAGE);
    };
    if raw_ws_id.chars().count() > MAX_NAME_LENGTH {
        return message_response(400, INVALID_WS_ID_MESSAGE);
    }

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

    let Some(oauth_config) = microsoft_oauth_config() else {
        return message_response(500, NOT_CONFIGURED_MESSAGE);
    };

    let Some(code_verifier) = generate_code_verifier() else {
        return message_response(500, AUTH_URL_FAILED_MESSAGE);
    };
    let code_challenge = generate_code_challenge(&code_verifier);

    let Some(auth_url) = build_microsoft_auth_url(&oauth_config, &resolved_ws_id, &code_challenge)
    else {
        return message_response(500, AUTH_URL_FAILED_MESSAGE);
    };

    let mut response = no_store_response(json_response(
        200,
        CalendarAuthMicrosoftResponse { auth_url },
    ));
    response
        .headers
        .push(("set-cookie", pkce_cookie(&code_verifier)));
    response
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

fn microsoft_oauth_config() -> Option<MicrosoftOAuthConfig> {
    // Mirrors getMicrosoftOAuthConfig + isMicrosoftConfigComplete: clientId,
    // clientSecret and redirectUri must all be present. The backend never uses
    // the client secret (no token exchange happens here), but its presence is
    // still required to consider the config complete, so we check it.
    let client_id = trimmed_env("MICROSOFT_CLIENT_ID")?;
    let _client_secret = trimmed_env("MICROSOFT_CLIENT_SECRET")?;
    let redirect_uri = trimmed_env("MICROSOFT_REDIRECT_URI")?;
    let tenant_id = trimmed_env("MICROSOFT_TENANT_ID").unwrap_or_else(|| "common".to_owned());

    Some(MicrosoftOAuthConfig {
        client_id,
        redirect_uri,
        tenant_id,
    })
}

fn build_microsoft_auth_url(
    config: &MicrosoftOAuthConfig,
    state: &str,
    code_challenge: &str,
) -> Option<String> {
    let authorize_endpoint = format!(
        "https://login.microsoftonline.com/{}/oauth2/v2.0/authorize",
        config.tenant_id
    );
    let scope = MICROSOFT_CALENDAR_SCOPES.join(" ");

    let mut url = url::Url::parse(&authorize_endpoint).ok()?;
    url.query_pairs_mut()
        .append_pair("client_id", &config.client_id)
        .append_pair("response_type", "code")
        .append_pair("redirect_uri", &config.redirect_uri)
        .append_pair("scope", &scope)
        .append_pair("state", state)
        .append_pair("prompt", "consent")
        .append_pair("code_challenge", code_challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("client_info", "1");

    Some(url.into())
}

/// Generate a PKCE code verifier. Mirrors the legacy
/// `crypto.randomBytes(32).toString('base64url')`.
///
/// NOTE: The Cloudflare-Workers backend has no `getrandom`/`rand` dependency,
/// so this derives 32 bytes by hashing several high-resolution `SystemTime`
/// nanosecond samples with SHA-256. This matches the established pseudo-random
/// pattern in `auth_accounts.rs`. It is NOT a cryptographically strong RNG;
/// see notes for the integrator.
fn generate_code_verifier() -> Option<String> {
    let mut material: Vec<u8> = Vec::with_capacity(64);
    for round in 0u64..4 {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        material.extend_from_slice(&nanos.to_le_bytes());
        material.extend_from_slice(&round.to_le_bytes());
    }

    let digest = <sha2::Sha256 as sha2::Digest>::digest(&material);
    Some(URL_SAFE_NO_PAD.encode(digest))
}

/// Generate the PKCE code challenge from the verifier using SHA-256, then
/// base64url-encode. Mirrors the legacy `generateCodeChallenge`.
fn generate_code_challenge(verifier: &str) -> String {
    let digest = <sha2::Sha256 as sha2::Digest>::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

fn pkce_cookie(verifier: &str) -> String {
    // Mirrors response.cookies.set('ms_pkce_verifier', ..., {
    //   httpOnly: true, secure (prod), sameSite: 'lax', path: '/', maxAge: 600 }).
    // `Secure` is always emitted here: the backend is served over HTTPS in every
    // deployed environment, matching the production behavior of the legacy route.
    format!(
        "{PKCE_COOKIE_NAME}={verifier}; Max-Age={PKCE_COOKIE_MAX_AGE_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax"
    )
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

fn trimmed_env(key: &str) -> Option<String> {
    let value = std::env::var(key).ok()?;
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_owned())
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
