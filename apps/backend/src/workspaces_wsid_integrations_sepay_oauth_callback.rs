//! Handler for `GET /api/v1/workspaces/:wsId/integrations/sepay/oauth/callback`.
//!
//! Ports the legacy Next.js OAuth callback route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/integrations/sepay/oauth/callback/route.ts`.
//!
//! # Ported behavior
//!
//! - Path + method guard; non-GET methods return `None` (fall through to Next.js).
//! - Missing `code`/`state` params → 302 redirect `?sepay=error&reason=missing_callback_params`.
//! - OAuth state cookie verification via HMAC-SHA256 (`SEPAY_OAUTH_STATE_SECRET` or
//!   `SEPAY_OAUTH_CLIENT_SECRET`). Invalid → `?sepay=error&reason=invalid_oauth_state`.
//! - Auth + `manage_finance` via `finance_auth::authorize_finance_permission`.
//!   Failure → `?sepay=error&reason=unauthorized`.
//! - `ENABLE_SEPAY_INTEGRATION` feature flag. Disabled → `?sepay=error&reason=feature_disabled`.
//! - OAuth state cookie cleared (`Max-Age=0`) in every redirect response.
//! - Redirect origin: env `WEB_APP_URL` / `NEXT_PUBLIC_WEB_APP_URL` / `NEXT_PUBLIC_APP_URL` /
//!   `COOLIFY_URL` / `COOLIFY_FQDN` → `request.origin` → `https://tuturuuu.com`.
//! - Locale prefix from `NEXT_LOCALE` cookie (`en` default, omitted for default locale).
//!
//! # Behavior gaps — always yields `?sepay=error&reason=oauth_exchange_failed`
//!
//! - **OAuth token exchange**: needs `SEPAY_OAUTH_CLIENT_ID`/`SEPAY_OAUTH_CLIENT_SECRET`
//!   (not in `BackendConfig`) and a POST to the SePay token endpoint.
//! - **Token encryption** (`encryptSepayToken`): requires AES-GCM; no such crate in `Cargo.toml`.
//! - **`sepay_connections` upsert**, **bank-account sync**, **webhook provisioning**,
//!   and **connection activation** all depend on the encrypted tokens.
//!
//! To complete the migration: add AES-GCM support, surface the SePay OAuth env vars
//! through `BackendConfig`, and implement the token-exchange POST.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use hmac::{Hmac, KeyInit, Mac};
use serde::Deserialize;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, empty_response,
    finance_auth::{FinanceAuthorizationError, authorize_finance_permission},
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

type HmacSha256 = Hmac<sha2::Sha256>;

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/integrations/sepay/oauth/callback";
const MANAGE_FINANCE_PERMISSION: &str = "manage_finance";
const SEPAY_FEATURE_FLAG_SECRET: &str = "ENABLE_SEPAY_INTEGRATION";
const SEPAY_OAUTH_STATE_COOKIE_PREFIX: &str = "sepay_oauth_state_";
const NEXT_LOCALE_COOKIE: &str = "NEXT_LOCALE";
const DEFAULT_LOCALE: &str = "en";
const SUPPORTED_LOCALES: [&str; 2] = ["en", "vi"];
const DEFAULT_WEB_ORIGIN: &str = "https://tuturuuu.com";
const WEB_APP_URL_ENV_KEYS: [&str; 5] = [
    "WEB_APP_URL",
    "NEXT_PUBLIC_WEB_APP_URL",
    "NEXT_PUBLIC_APP_URL",
    "COOLIFY_URL",
    "COOLIFY_FQDN",
];
const SEPAY_STATE_SECRET_ENV_KEYS: [&str; 2] =
    ["SEPAY_OAUTH_STATE_SECRET", "SEPAY_OAUTH_CLIENT_SECRET"];

#[derive(Deserialize)]
struct WorkspaceSecretValueRow {
    value: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_integrations_sepay_oauth_callback_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = callback_ws_id(request.path)?;
    Some(match request.method {
        "GET" => callback_get_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn callback_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // 1. Require `code` and `state` query params.
    let (code, state) = match extract_code_and_state(request.url) {
        Some(pair) => pair,
        None => {
            return redirect(request, raw_ws_id, "error", Some("missing_callback_params"));
        }
    };

    // 2. Verify OAuth state via cookie + HMAC-SHA256.
    let cookie_name = sepay_oauth_state_cookie_name(raw_ws_id);
    let expected = request.cookie.and_then(|c| cookie_value(c, &cookie_name));
    if !verify_oauth_state(&state, expected.as_deref()) {
        return redirect(request, raw_ws_id, "error", Some("invalid_oauth_state"));
    }

    // 3. requireSepayAccess: auth + manage_finance.
    let authorization = match authorize_finance_permission(
        config,
        request,
        raw_ws_id,
        MANAGE_FINANCE_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(auth) => auth,
        Err(
            FinanceAuthorizationError::Unauthorized
            | FinanceAuthorizationError::Forbidden
            | FinanceAuthorizationError::NotFound
            | FinanceAuthorizationError::Internal,
        ) => return redirect(request, raw_ws_id, "error", Some("unauthorized")),
    };

    let ws_id = &authorization.ws_id;

    // 4. requireSepayFeatureEnabled: ENABLE_SEPAY_INTEGRATION secret.
    match sepay_integration_enabled(&config.contact_data, outbound, ws_id).await {
        Ok(true) => {}
        _ => return redirect(request, ws_id, "error", Some("feature_disabled")),
    }

    // 5. OAuth exchange NOT PORTED — see module doc for details.
    let _ = code;
    redirect(request, ws_id, "error", Some("oauth_exchange_failed"))
}

// ---------------------------------------------------------------------------
// Query parsing
// ---------------------------------------------------------------------------

fn extract_code_and_state(url: Option<&str>) -> Option<(String, String)> {
    let url = url::Url::parse(url?).ok()?;
    let mut code: Option<String> = None;
    let mut state: Option<String> = None;
    for (k, v) in url.query_pairs() {
        let v = v.trim().to_owned();
        if v.is_empty() {
            continue;
        }
        match k.as_ref() {
            "code" if code.is_none() => code = Some(v),
            "state" if state.is_none() => state = Some(v),
            _ => {}
        }
    }
    Some((code?, state?))
}

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

fn cookie_value(header: &str, name: &str) -> Option<String> {
    header
        .split(';')
        .filter_map(|c| c.trim().split_once('='))
        .find(|(k, _)| k.trim() == name)
        .map(|(_, v)| v.trim().to_owned())
        .filter(|v| !v.is_empty())
}

fn locale_from_cookie(cookie: Option<&str>) -> &'static str {
    match cookie
        .and_then(|h| cookie_value(h, NEXT_LOCALE_COOKIE))
        .as_deref()
    {
        Some(l) if SUPPORTED_LOCALES.contains(&l) && l != DEFAULT_LOCALE => "vi",
        _ => DEFAULT_LOCALE,
    }
}

// ---------------------------------------------------------------------------
// OAuth state verification (mirrors verifySepayOauthState)
// ---------------------------------------------------------------------------

fn sepay_oauth_state_cookie_name(ws_id: &str) -> String {
    format!(
        "{SEPAY_OAUTH_STATE_COOKIE_PREFIX}{}",
        URL_SAFE_NO_PAD.encode(ws_id.as_bytes())
    )
}

fn constant_time_eq_bytes(a: &[u8], b: &[u8]) -> bool {
    let mut diff = a.len() ^ b.len();
    let n = a.len().max(b.len());
    for i in 0..n {
        diff |= usize::from(a.get(i).copied().unwrap_or(0) ^ b.get(i).copied().unwrap_or(0));
    }
    diff == 0
}

fn sepay_state_secret() -> Option<String> {
    SEPAY_STATE_SECRET_ENV_KEYS.iter().find_map(|k| {
        std::env::var(k)
            .ok()
            .map(|v| v.trim().to_owned())
            .filter(|v| !v.is_empty())
    })
}

fn sign_payload(payload: &str, secret: &str) -> Option<String> {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).ok()?;
    mac.update(payload.as_bytes());
    Some(URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes().as_slice()))
}

fn verify_oauth_state(state: &str, expected: Option<&str>) -> bool {
    let expected = match expected {
        Some(e) if !e.is_empty() => e,
        _ => return false,
    };
    if !constant_time_eq_bytes(state.as_bytes(), expected.as_bytes()) {
        return false;
    }
    let Some((payload, sig)) = state.split_once('.') else {
        return false;
    };
    if payload.is_empty() || sig.is_empty() || sig.contains('.') {
        return false;
    }
    let secret = match sepay_state_secret() {
        Some(s) => s,
        None => return false,
    };
    match sign_payload(payload, &secret) {
        Some(expected_sig) => constant_time_eq_bytes(sig.as_bytes(), expected_sig.as_bytes()),
        None => false,
    }
}

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

async fn sepay_integration_enabled(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    let url = cd
        .rest_url(
            "workspace_secrets",
            &[
                ("select", "value".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("name", format!("eq.{SEPAY_FEATURE_FLAG_SECRET}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let srk = cd.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {srk}");
    let resp = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", srk),
        )
        .await
        .map_err(|_| ())?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    let rows = resp
        .json::<Vec<WorkspaceSecretValueRow>>()
        .map_err(|_| ())?;
    let val = rows.into_iter().next().and_then(|r| r.value);
    Ok(is_truthy_secret(val.as_deref()))
}

fn is_truthy_secret(v: Option<&str>) -> bool {
    matches!(
        v.map(|s| s.trim().to_lowercase()).as_deref(),
        Some("1" | "true" | "yes" | "on")
    )
}

// ---------------------------------------------------------------------------
// Redirect
// ---------------------------------------------------------------------------

fn normalize_origin(value: &str) -> Option<String> {
    let t = value.trim();
    if t.is_empty() {
        return None;
    }
    let candidate = if t.contains("://") {
        t.to_owned()
    } else {
        format!("https://{t}")
    };
    let u = url::Url::parse(&candidate).ok()?;
    if !matches!(u.scheme(), "http" | "https") {
        return None;
    }
    if matches!(u.host_str()?, "0.0.0.0" | "::" | "[::]") {
        return None;
    }
    Some(u.origin().ascii_serialization())
}

fn resolve_web_origin(request: BackendRequest<'_>) -> String {
    WEB_APP_URL_ENV_KEYS
        .iter()
        .find_map(|k| std::env::var(k).ok().and_then(|v| normalize_origin(&v)))
        .or_else(|| request.origin.and_then(normalize_origin))
        .unwrap_or_else(|| DEFAULT_WEB_ORIGIN.to_owned())
}

fn redirect(
    request: BackendRequest<'_>,
    ws_id: &str,
    status: &str,
    reason: Option<&str>,
) -> BackendResponse {
    let origin = resolve_web_origin(request);
    let locale = locale_from_cookie(request.cookie);
    let path = if locale == DEFAULT_LOCALE {
        format!("/{ws_id}/integrations")
    } else {
        format!("/{locale}/{ws_id}/integrations")
    };

    let base = format!("{origin}{path}");
    let mut url = url::Url::parse(&base)
        .unwrap_or_else(|_| url::Url::parse(DEFAULT_WEB_ORIGIN).expect("constant is valid"));
    url.query_pairs_mut().append_pair("sepay", status);
    if let Some(r) = reason {
        url.query_pairs_mut().append_pair("reason", r);
    }
    let location: String = url.into();

    // Clear the OAuth state cookie (mirrors clearOauthStateCookie).
    let cookie_name = sepay_oauth_state_cookie_name(ws_id);
    let cb_path = format!("/api/v1/workspaces/{ws_id}/integrations/sepay/oauth/callback");
    let clear =
        format!("{cookie_name}=; Path={cb_path}; Max-Age=0; HttpOnly; SameSite=Lax; Secure");

    let mut resp = no_store_response(empty_response(302));
    resp.headers.push(("location", location));
    resp.headers.push(("set-cookie", clear));
    resp
}

// ---------------------------------------------------------------------------
// Path guard
// ---------------------------------------------------------------------------

fn callback_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_matches() {
        assert_eq!(
            callback_ws_id("/api/v1/workspaces/abc-123/integrations/sepay/oauth/callback"),
            Some("abc-123")
        );
    }

    #[test]
    fn path_guard_rejects_extra_segment() {
        assert!(
            callback_ws_id("/api/v1/workspaces/a/b/integrations/sepay/oauth/callback").is_none()
        );
    }

    #[test]
    fn path_guard_rejects_wrong_suffix() {
        assert!(callback_ws_id("/api/v1/workspaces/abc/integrations/sepay/endpoints").is_none());
    }

    #[test]
    fn path_guard_rejects_empty_ws_id() {
        assert!(callback_ws_id("/api/v1/workspaces//integrations/sepay/oauth/callback").is_none());
    }

    #[test]
    fn cookie_name_base64url_roundtrip() {
        let name = sepay_oauth_state_cookie_name("abc-123");
        assert!(name.starts_with("sepay_oauth_state_"));
        let suffix = &name["sepay_oauth_state_".len()..];
        let decoded = URL_SAFE_NO_PAD.decode(suffix).unwrap();
        assert_eq!(core::str::from_utf8(&decoded).unwrap(), "abc-123");
    }

    #[test]
    fn cookie_value_parses() {
        let h = "NEXT_LOCALE=vi; foo=bar; empty=";
        assert_eq!(cookie_value(h, "NEXT_LOCALE"), Some("vi".to_owned()));
        assert_eq!(cookie_value(h, "foo"), Some("bar".to_owned()));
        assert_eq!(cookie_value(h, "empty"), None);
        assert_eq!(cookie_value(h, "missing"), None);
    }

    #[test]
    fn locale_detection() {
        assert_eq!(locale_from_cookie(Some("NEXT_LOCALE=vi")), "vi");
        assert_eq!(locale_from_cookie(Some("NEXT_LOCALE=en")), "en");
        assert_eq!(locale_from_cookie(Some("NEXT_LOCALE=de")), "en");
        assert_eq!(locale_from_cookie(None), "en");
    }

    #[test]
    fn extract_code_state_ok() {
        let (c, s) =
            extract_code_and_state(Some("https://example.com/callback?code=abc&state=xyz"))
                .unwrap();
        assert_eq!((c.as_str(), s.as_str()), ("abc", "xyz"));
    }

    #[test]
    fn extract_code_state_missing() {
        assert!(extract_code_and_state(Some("https://example.com/callback?code=abc")).is_none());
        assert!(extract_code_and_state(None).is_none());
    }

    #[test]
    fn is_truthy_secret_variants() {
        for v in &["1", "true", "yes", "on", "TRUE", "Yes"] {
            assert!(is_truthy_secret(Some(v)), "{v} should be truthy");
        }
        assert!(!is_truthy_secret(Some("0")));
        assert!(!is_truthy_secret(None));
    }

    #[test]
    fn verify_state_rejects_missing_cookie() {
        assert!(!verify_oauth_state("payload.sig", None));
        assert!(!verify_oauth_state("payload.sig", Some("")));
    }

    #[test]
    fn verify_state_rejects_mismatch() {
        assert!(!verify_oauth_state("state1", Some("state2")));
    }

    #[test]
    fn verify_state_rejects_malformed() {
        assert!(!verify_oauth_state("nodot", Some("nodot")));
        assert!(!verify_oauth_state("a.b.c", Some("a.b.c")));
    }

    // NOTE: both env-secret cases live in one test because they mutate the
    // process-global `SEPAY_OAUTH_STATE_SECRET`; separate `#[test]` fns run in
    // parallel and would race on that var.
    #[test]
    fn verify_state_hmac_cases() {
        // Valid token built with the same HMAC-SHA256 algorithm is accepted.
        let secret = "test-secret-for-verify";
        let payload = URL_SAFE_NO_PAD.encode(b"test-payload");
        let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(payload.as_bytes());
        let sig = URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes().as_slice());
        let valid_state = format!("{payload}.{sig}");

        // Tampered payload (same signature) is rejected.
        let tampered = URL_SAFE_NO_PAD.encode(b"tampered");
        let tampered_state = format!("{tampered}.{sig}");

        unsafe {
            std::env::set_var("SEPAY_OAUTH_STATE_SECRET", secret);
        }
        assert!(verify_oauth_state(&valid_state, Some(&valid_state)));
        assert!(!verify_oauth_state(&tampered_state, Some(&tampered_state)));
        unsafe {
            std::env::remove_var("SEPAY_OAUTH_STATE_SECRET");
        }
    }

    #[test]
    fn constant_time_eq_bytes_works() {
        assert!(constant_time_eq_bytes(b"hello", b"hello"));
        assert!(!constant_time_eq_bytes(b"hello", b"world"));
        assert!(!constant_time_eq_bytes(b"hi", b"hello"));
    }

    #[test]
    fn normalize_origin_strips_path_and_adds_scheme() {
        assert_eq!(
            normalize_origin("https://example.com/path"),
            Some("https://example.com".to_owned())
        );
        assert_eq!(
            normalize_origin("example.com"),
            Some("https://example.com".to_owned())
        );
        assert!(normalize_origin("").is_none());
    }
}
