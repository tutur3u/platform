use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, empty_response,
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

// Mirrors AUTH_OAUTH_PROVIDERS in
// apps/web/src/lib/auth/oauth-providers.ts. None of these providers configure a
// `scopes` option there, so the linking authorize call never sends `scopes`.
const SUPPORTED_PROVIDERS: [&str; 3] = ["apple", "google", "github"];

const IDENTITY_LINK_PATH_PREFIX: &str = "/api/v1/users/me/identities/link/";
const SUPABASE_IDENTITIES_AUTHORIZE_PATH: &str = "user/identities/authorize";

const UNSUPPORTED_PROVIDER_MESSAGE: &str = "Unsupported provider";
const FAILED_TO_START_MESSAGE: &str = "Failed to start identity linking";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";

#[derive(Deserialize)]
struct LinkIdentityAuthorizeResponse {
    url: Option<String>,
}

pub(crate) async fn handle_users_me_identity_link_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_provider = identity_link_provider(request.path)?;

    Some(match request.method {
        "GET" => {
            identity_link_response(&config.contact_data, request, raw_provider, outbound).await
        }
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn identity_link_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_provider: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(provider) = supported_provider(raw_provider) else {
        return message_response(400, UNSUPPORTED_PROVIDER_MESSAGE);
    };

    // The legacy route is wrapped in `withSessionAuth`, which rejects requests
    // without a Supabase session before the handler runs.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    let Some(service_role_key) = contact_data.service_role_key() else {
        return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE);
    };
    // Build the authorize URL in a dedicated synchronous scope so no
    // `url`/`form_urlencoded` temporaries (which are not `Send`) are held across
    // the outbound `.await` below.
    let Some(authorize_url) = build_authorize_url(contact_data, request.url, provider) else {
        return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE);
    };

    let authorization = format!("Bearer {access_token}");
    let response = match outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &authorize_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
    {
        Ok(response) => response,
        Err(_) => return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    };

    if !(200..300).contains(&response.status) {
        return message_response(400, &supabase_auth_error_message(&response.body_text));
    }

    let Some(target_url) = response
        .json::<LinkIdentityAuthorizeResponse>()
        .ok()
        .and_then(|body| body.url)
        .filter(|url| !url.trim().is_empty())
    else {
        return message_response(400, FAILED_TO_START_MESSAGE);
    };

    redirect_response(&target_url)
}

fn build_authorize_url(
    contact_data: &contact::ContactDataConfig,
    request_url: Option<&str>,
    provider: &str,
) -> Option<String> {
    let mut authorize_url = contact_data.auth_url(SUPABASE_IDENTITIES_AUTHORIZE_PATH)?;
    let redirect_to = build_return_url(request_url, provider);

    let mut query = url::form_urlencoded::Serializer::new(String::new());
    query.append_pair("provider", provider);
    if let Some(redirect_to) = redirect_to.as_deref() {
        query.append_pair("redirect_to", redirect_to);
    }
    query.append_pair("skip_http_redirect", "true");

    authorize_url.push('?');
    authorize_url.push_str(&query.finish());

    Some(authorize_url)
}

fn supported_provider(raw_provider: &str) -> Option<&'static str> {
    SUPPORTED_PROVIDERS
        .into_iter()
        .find(|candidate| *candidate == raw_provider)
}

// Mirrors buildReturnUrl in the legacy route: resolve the `returnTo` query
// param relative to the request origin, fall back to the origin root if it is
// missing or cross-origin, then attach the settings-dialog query params. When
// the inbound request URL cannot be parsed, returns None so the authorize call
// omits `redirect_to` (matching Supabase falling back to its default).
fn build_return_url(request_url: Option<&str>, provider: &str) -> Option<String> {
    let request_url = url::Url::parse(request_url?).ok()?;
    let request_origin = request_url.origin();

    // The legacy route resolves `returnTo` relative to the request *origin*
    // (scheme + host + port), not the full request path, and falls back to the
    // origin root for missing or cross-origin values.
    let mut origin_root = request_url.clone();
    origin_root.set_path("/");
    origin_root.set_query(None);
    origin_root.set_fragment(None);

    let raw_return_to = request_url
        .query_pairs()
        .find(|(key, _)| key == "returnTo")
        .map(|(_, value)| value.into_owned());

    let fallback = origin_root.to_string();

    let mut candidate = match raw_return_to {
        Some(return_to) => match origin_root.join(&return_to) {
            Ok(url) => url,
            Err(_) => return Some(fallback),
        },
        None => origin_root,
    };

    if candidate.origin() != request_origin {
        return Some(fallback);
    }

    candidate.set_fragment(None);
    Some(decorate_return_url(candidate, provider))
}

fn decorate_return_url(mut url: url::Url, provider: &str) -> String {
    let existing: Vec<(String, String)> = url
        .query_pairs()
        .filter(|(key, _)| {
            key != "settingsDialog" && key != "settingsTab" && key != "settingsLinkedProvider"
        })
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect();

    {
        let mut serializer = url.query_pairs_mut();
        serializer.clear();
        for (key, value) in &existing {
            serializer.append_pair(key, value);
        }
        serializer.append_pair("settingsDialog", "open");
        serializer.append_pair("settingsTab", "security");
        serializer.append_pair("settingsLinkedProvider", provider);
    }

    url.to_string()
}

fn supabase_auth_error_message(body_text: &str) -> String {
    serde_json::from_str::<Value>(body_text)
        .ok()
        .and_then(|value| {
            value
                .get("msg")
                .or_else(|| value.get("message"))
                .or_else(|| value.get("error_description"))
                .or_else(|| value.get("error"))
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .filter(|message| !message.trim().is_empty())
        .unwrap_or_else(|| FAILED_TO_START_MESSAGE.to_owned())
}

fn redirect_response(location: &str) -> BackendResponse {
    // NextResponse.redirect defaults to a 307 redirect, matching the existing
    // browser-state-recovery redirect handling in this backend.
    let mut response = no_store_response(empty_response(307));
    response.headers.push(("location", location.to_owned()));
    response
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn identity_link_provider(path: &str) -> Option<&str> {
    let provider = path.strip_prefix(IDENTITY_LINK_PATH_PREFIX)?;

    (!provider.is_empty() && !provider.contains('/')).then_some(provider)
}
