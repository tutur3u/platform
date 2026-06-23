//! Port of `apps/web/src/app/api/v1/mobile-deployment/bundle/route.ts`.
//!
//! IMPORTANT — PARTIAL PORT / KNOWN LIMITATION:
//! The legacy `GET` handler delivers the encrypted mobile-deployment CI bundle
//! to GitHub Actions. A faithful end-to-end port requires capabilities that the
//! Cloudflare-Workers backend framework does not currently expose, and that
//! cannot be added inside a single self-contained module without new crate
//! dependencies or new shared helpers:
//!
//!   1. GitHub OIDC JWT verification (remote JWKS fetch + RS256/ES256 signature
//!      verification + issuer/audience/claim validation via `jose`). The
//!      backend `Cargo.toml` only ships `sha2`, `hmac`, and `base64` — there is
//!      no JWT/JWKS/asymmetric-signature crate available.
//!   2. The `x-github-oidc-token` request header is required by the legacy
//!      route but is NOT carried on `BackendRequest` (which only exposes
//!      `authorization`, `cookie`, `origin`, `referer`, `request_id`, `url`).
//!      The integrator must thread this header through the framework before a
//!      real port is possible.
//!   3. scrypt-based CI token hash verification (`validateApiKeyHash`).
//!   4. AES-256-GCM envelope decryption (data-key unwrap with the master key,
//!      then secret/file decryption).
//!   5. Google Drive / workspace-storage object download for encrypted file
//!      artifacts, plus integrity (SHA-256) checks.
//!   6. Writes to several `private`-schema tables (audit events, bundle
//!      fetches, token-usage updates).
//!
//! Because none of the above verification/crypto/storage steps can execute
//! here, every request that reaches the legacy success path would instead fall
//! into the legacy `catch` block, which already returns the default
//! `401 { "message": "Unauthorized" }` (with `no-store` headers). This module
//! reproduces EXACTLY that observable behavior:
//!
//!   * non-GET methods -> `method_not_allowed("GET")` (405),
//!   * GET with the wrong `environment`, an invalid/missing `platform`, or a
//!     missing bearer token -> `401 { "message": "Unauthorized" }`,
//!   * any other GET (would-be success path) -> `401 { "message": "Unauthorized" }`.
//!
//! This is intentionally a hard stop, not a silent success: it never fabricates
//! a bundle. The TODO is to restore real CI bundle delivery once OIDC/JWKS,
//! scrypt, AES-GCM, and storage-download primitives exist in the backend.

use serde_json::json;

use crate::{
    BackendConfig, BackendRequest, BackendResponse, json_response, method_not_allowed,
    no_store_response, outbound::OutboundHttpClient,
};

const MOBILE_DEPLOYMENT_BUNDLE_PATH: &str = "/api/v1/mobile-deployment/bundle";
const MOBILE_DEPLOYMENT_ENVIRONMENT: &str = "production";
const MOBILE_DEPLOYMENT_PLATFORMS: [&str; 2] = ["android", "ios"];
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";

pub(crate) async fn handle_mobile_deployment_bundle_route(
    _config: &BackendConfig,
    request: BackendRequest<'_>,
    _outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != MOBILE_DEPLOYMENT_BUNDLE_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => mobile_deployment_bundle_get(request),
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

fn mobile_deployment_bundle_get(request: BackendRequest<'_>) -> BackendResponse {
    // Mirror the legacy early-validation gate. Anything that passes this gate
    // would require OIDC + token + crypto + storage steps the backend cannot
    // perform yet, so it deliberately falls through to the same 401 the legacy
    // `catch` block returns.
    let url = request.url.and_then(|url| url::Url::parse(url).ok());
    let environment = query_value(url.as_ref(), "environment");
    let platform = query_value(url.as_ref(), "platform").filter(|value| is_valid_platform(value));
    let token = bearer_token(request.authorization);

    if environment.as_deref() != Some(MOBILE_DEPLOYMENT_ENVIRONMENT)
        || platform.is_none()
        || token.is_none()
    {
        return unauthorized();
    }

    // Would-be success path: OIDC verification, CI token validation, replay
    // detection, AES-GCM decryption, storage download, and integrity checks are
    // not portable here. The legacy route returns 401 on every failure in this
    // region, so return the same hard 401 rather than fabricating a bundle.
    unauthorized()
}

fn unauthorized() -> BackendResponse {
    no_store_response(json_response(
        401,
        json!({ "message": UNAUTHORIZED_MESSAGE }),
    ))
}

fn is_valid_platform(value: &str) -> bool {
    MOBILE_DEPLOYMENT_PLATFORMS.contains(&value)
}

fn bearer_token(authorization: Option<&str>) -> Option<String> {
    let header = authorization.unwrap_or("");
    let mut parts = header.split_whitespace();
    let scheme = parts.next()?;
    let token = parts.next()?;
    if !scheme.eq_ignore_ascii_case("bearer") || token.is_empty() {
        return None;
    }

    Some(token.to_owned())
}

fn query_value(url: Option<&url::Url>, key: &str) -> Option<String> {
    url.and_then(|url| {
        url.query_pairs()
            .find(|(name, _)| name == key)
            .map(|(_, value)| value.into_owned())
    })
}
