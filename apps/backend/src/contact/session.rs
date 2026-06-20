use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use hmac::{Hmac, KeyInit, Mac};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::{BackendConfig, BackendRequest, BackendResponse, constant_time_eq, json_response};

type HmacSha256 = Hmac<sha2::Sha256>;

pub(crate) const LOCAL_DEVELOPMENT_APP_COORDINATION_SECRET: &str =
    "tuturuuu-local-development-app-coordination-secret";
pub(crate) const APP_COORDINATION_SECRET_KEYS: [&str; 5] = [
    "TUTURUUU_APP_COORDINATION_SECRET",
    "APP_COORDINATION_TOKEN_SECRET",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_KEY",
];
const APP_COORDINATION_TOKEN_PREFIX: &str = "ttr_app_";
const APP_COORDINATION_TOKEN_ISSUER: &str = "tuturuuu";
const APP_COORDINATION_TOKEN_AUDIENCE: &str = "tuturuuu-api";
pub(crate) const APP_SESSION_SCOPE: &str = "internal-app:session";
pub(crate) const APP_SESSION_COOKIE_NAME: &str = "tuturuuu_app_session";
const WEB_APP_SESSION_COOKIE_NAME: &str = "tuturuuu_web_app_session";

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
pub(crate) struct AppCoordinationClaims {
    pub(crate) aud: String,
    pub(crate) email: Option<String>,
    pub(crate) exp: u64,
    pub(crate) iat: u64,
    pub(crate) iss: String,
    pub(crate) jti: String,
    pub(crate) origin_app: String,
    pub(crate) scopes: Vec<String>,
    pub(crate) sub: String,
    pub(crate) target_app: String,
    pub(crate) typ: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum AppSessionAuthSource {
    Bearer,
    Cookie,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct AppSessionActor {
    pub(super) claims: AppCoordinationClaims,
    pub(super) source: AppSessionAuthSource,
}

pub(super) fn resolve_app_session(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    expected_targets: &[&str],
) -> Result<AppSessionActor, Box<BackendResponse>> {
    let candidates = app_session_token_candidates(request);

    if candidates.is_empty() {
        return Err(Box::new(json_response(
            401,
            json!({ "message": "Unauthorized" }),
        )));
    }

    if config.app_coordination_secrets.is_empty() {
        return Err(Box::new(json_response(
            503,
            json!({
                "message": "App coordination secret is not configured",
            }),
        )));
    }

    let now_seconds = current_unix_seconds();
    let mut last_error = "Invalid app session".to_owned();

    for (token, source) in candidates {
        match verify_app_session_token(
            token,
            &config.app_coordination_secrets,
            expected_targets,
            now_seconds,
        ) {
            Ok(claims) => return Ok(AppSessionActor { claims, source }),
            Err(error) => last_error = error,
        }
    }

    Err(Box::new(json_response(
        401,
        json!({ "message": last_error }),
    )))
}

#[cfg(feature = "native")]
pub(crate) fn app_coordination_secrets_from_env(environment: &str) -> Vec<String> {
    let mut secrets = Vec::new();

    for key in APP_COORDINATION_SECRET_KEYS {
        let Ok(value) = std::env::var(key) else {
            continue;
        };
        let value = value.trim();
        if !value.is_empty() && !secrets.iter().any(|secret| secret == value) {
            secrets.push(value.to_owned());
        }
    }

    if secrets.is_empty() && !environment.trim().eq_ignore_ascii_case("production") {
        secrets.push(LOCAL_DEVELOPMENT_APP_COORDINATION_SECRET.to_owned());
    }

    secrets
}

fn app_session_token_candidates(request: BackendRequest<'_>) -> Vec<(&str, AppSessionAuthSource)> {
    let mut candidates = Vec::new();

    if let Some(token) = bearer_app_coordination_token(request.authorization) {
        push_unique_app_session_candidate(&mut candidates, token, AppSessionAuthSource::Bearer);
    }

    for cookie_name in [WEB_APP_SESSION_COOKIE_NAME, APP_SESSION_COOKIE_NAME] {
        if let Some(token) = cookie_value(request.cookie, cookie_name)
            && is_app_coordination_token(token)
        {
            push_unique_app_session_candidate(&mut candidates, token, AppSessionAuthSource::Cookie);
        }
    }

    candidates
}

fn push_unique_app_session_candidate<'a>(
    candidates: &mut Vec<(&'a str, AppSessionAuthSource)>,
    token: &'a str,
    source: AppSessionAuthSource,
) {
    if candidates
        .iter()
        .any(|(candidate, _source)| *candidate == token)
    {
        return;
    }

    candidates.push((token, source));
}

fn bearer_app_coordination_token(authorization: Option<&str>) -> Option<&str> {
    let authorization = authorization?.trim();
    let token = authorization
        .strip_prefix("Bearer ")
        .or_else(|| authorization.strip_prefix("bearer "))?
        .trim();

    is_app_coordination_token(token).then_some(token)
}

fn is_app_coordination_token(token: &str) -> bool {
    token.starts_with(APP_COORDINATION_TOKEN_PREFIX)
}

fn cookie_value<'a>(cookie_header: Option<&'a str>, name: &str) -> Option<&'a str> {
    cookie_header?
        .split(';')
        .filter_map(|cookie| cookie.trim().split_once('='))
        .find_map(|(cookie_name, value)| (cookie_name.trim() == name).then_some(value.trim()))
}

pub(crate) fn verify_app_session_token(
    token: &str,
    secrets: &[String],
    expected_targets: &[&str],
    now_seconds: u64,
) -> Result<AppCoordinationClaims, String> {
    let without_prefix = token
        .strip_prefix(APP_COORDINATION_TOKEN_PREFIX)
        .ok_or_else(|| "Invalid token type".to_owned())?;
    let parts: Vec<_> = without_prefix.split('.').collect();

    if parts.len() != 3 || parts.iter().any(|part| part.is_empty()) {
        return Err("Invalid token format".to_owned());
    }

    let unsigned = format!("{}.{}", parts[0], parts[1]);
    let signature = parts[2];
    let signature_matches = secrets.iter().any(|secret| {
        sign_app_coordination_content(&unsigned, secret)
            .is_some_and(|expected| constant_time_eq(signature.as_bytes(), expected.as_bytes()))
    });

    if !signature_matches {
        return Err("Invalid token signature".to_owned());
    }

    let payload = URL_SAFE_NO_PAD
        .decode(parts[1])
        .map_err(|_| "Invalid token payload".to_owned())?;
    let claims: AppCoordinationClaims =
        serde_json::from_slice(&payload).map_err(|_| "Invalid token claims".to_owned())?;

    validate_app_session_claims(&claims, expected_targets, now_seconds)?;

    Ok(claims)
}

pub(crate) fn sign_app_coordination_content(content: &str, secret: &str) -> Option<String> {
    let mut hmac = HmacSha256::new_from_slice(secret.as_bytes()).ok()?;
    hmac.update(content.as_bytes());
    Some(URL_SAFE_NO_PAD.encode(hmac.finalize().into_bytes()))
}

fn validate_app_session_claims(
    claims: &AppCoordinationClaims,
    expected_targets: &[&str],
    now_seconds: u64,
) -> Result<(), String> {
    if claims.typ != "app_coordination"
        || claims.iss != APP_COORDINATION_TOKEN_ISSUER
        || claims.aud != APP_COORDINATION_TOKEN_AUDIENCE
        || claims.sub.is_empty()
        || claims.target_app.is_empty()
        || claims.origin_app.is_empty()
        || claims.jti.is_empty()
    {
        return Err("Invalid token claims".to_owned());
    }

    if claims.exp <= now_seconds {
        return Err("Token expired".to_owned());
    }

    if !expected_targets.contains(&claims.target_app.as_str()) {
        return Err("App session target mismatch".to_owned());
    }

    if !claims.scopes.iter().any(|scope| scope == APP_SESSION_SCOPE) {
        return Err("App session missing required scope".to_owned());
    }

    Ok(())
}

fn current_unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

#[cfg(test)]
pub(crate) fn app_coordination_token_prefix() -> &'static str {
    APP_COORDINATION_TOKEN_PREFIX
}

#[cfg(test)]
pub(crate) fn app_coordination_token_issuer() -> &'static str {
    APP_COORDINATION_TOKEN_ISSUER
}

#[cfg(test)]
pub(crate) fn app_coordination_token_audience() -> &'static str {
    APP_COORDINATION_TOKEN_AUDIENCE
}

#[cfg(test)]
pub(crate) fn encode_app_session_part(value: impl AsRef<[u8]>) -> String {
    URL_SAFE_NO_PAD.encode(value)
}
