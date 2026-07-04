//! Handler for `GET /api/email/unsubscribe`.
//!
//! Ports the GET branch of the legacy Next.js route at
//! `apps/web/src/app/api/email/unsubscribe/route.ts`.
//!
//! The GET handler is unauthenticated.  It reads a `token` query parameter,
//! verifies its HMAC-SHA256 signature against available secret candidates,
//! and returns an HTML confirmation page (200) or an error page (400).  No
//! database access is performed during GET.
//!
//! ## Token format
//!
//! ```text
//! <base64url-encoded-json-claims>.<base64url-hmac-sha256-signature>
//! ```
//!
//! Claims JSON shape:
//!
//! ```json
//! { "email": "...", "iat": 1234567890, "jti": "<uuid>",
//!   "typ": "global_email_unsubscribe", "v": 1 }
//! ```
//!
//! ## Behavior gaps vs. legacy
//!
//! The legacy `verifyEmailUnsubscribeToken` function tries these secret
//! candidates in order:
//!
//! - `TUTURUUU_EMAIL_UNSUBSCRIBE_SECRET`
//! - `EMAIL_UNSUBSCRIBE_SECRET`
//! - `TUTURUUU_APP_COORDINATION_SECRET`
//! - `NEXTAUTH_SECRET`
//! - `SUPABASE_SECRET_KEY`
//! - `SUPABASE_SERVICE_ROLE_KEY`
//! - `SUPABASE_SERVICE_KEY`
//!
//! `BackendConfig` does not surface all of those.  This handler uses:
//!
//! - `config.app_coordination_secrets` (mirrors `TUTURUUU_APP_COORDINATION_SECRET`)
//! - `config.contact_data.service_role_key()` (mirrors `SUPABASE_SERVICE_ROLE_KEY`)
//!
//! Tokens signed exclusively with `TUTURUUU_EMAIL_UNSUBSCRIBE_SECRET`,
//! `EMAIL_UNSUBSCRIBE_SECRET`, `NEXTAUTH_SECRET`, `SUPABASE_SECRET_KEY`, or
//! `SUPABASE_SERVICE_KEY` will fail verification here.  To close the gap,
//! expose those environment variables in `BackendConfig` and add them to
//! `email_unsubscribe_secrets()` below.
//!
//! The POST handler (which writes to `email_blacklist`) is not ported.
//! Non-GET methods return `None` so they fall through to the Next.js route.

use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use hmac::{Hmac, KeyInit, Mac as _};
use serde::Deserialize;

use crate::{
    BackendConfig, BackendRequest, BackendResponse, outbound::OutboundHttpClient, text_response,
};

type HmacSha256 = Hmac<sha2::Sha256>;

const EMAIL_UNSUBSCRIBE_PATH: &str = "/api/email/unsubscribe";
const TOKEN_TYPE: &str = "global_email_unsubscribe";
const TOKEN_VERSION: u64 = 1;
const HTML_CONTENT_TYPE: &str = "text/html; charset=utf-8";

/// Deserialized claims embedded in the unsubscribe token.
#[derive(Deserialize)]
struct UnsubscribeClaims {
    email: String,
    #[allow(dead_code)]
    iat: i64,
    #[allow(dead_code)]
    jti: String,
    typ: String,
    v: u64,
}

// ---------------------------------------------------------------------------
// Public handler
// ---------------------------------------------------------------------------

pub(crate) async fn handle_email_unsubscribe_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    _outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != EMAIL_UNSUBSCRIBE_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => email_unsubscribe_get_response(config, request),
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET response
// ---------------------------------------------------------------------------

fn email_unsubscribe_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
) -> BackendResponse {
    let token = extract_token_from_url(request.url);

    match verify_token(config, token.as_deref()) {
        Err(_) => text_response(
            400,
            render_page(RenderParams {
                title: "Invalid unsubscribe link",
                message: "This unsubscribe link is invalid or incomplete.",
                email: None,
                token: None,
            }),
            HTML_CONTENT_TYPE,
        ),
        Ok(email) => text_response(
            200,
            render_page(RenderParams {
                title: "Unsubscribe from Tuturuuu emails",
                message: "Confirm that you want to stop receiving Tuturuuu system emails at",
                email: Some(&email),
                token: token.as_deref(),
            }),
            HTML_CONTENT_TYPE,
        ),
    }
}

// ---------------------------------------------------------------------------
// Token extraction
// ---------------------------------------------------------------------------

fn extract_token_from_url(raw_url: Option<&str>) -> Option<String> {
    let url = url::Url::parse(raw_url?).ok()?;
    url.query_pairs()
        .find(|(k, _)| k == "token")
        .map(|(_, v)| v.into_owned())
}

// ---------------------------------------------------------------------------
// Token verification
// ---------------------------------------------------------------------------

/// Returns the normalized email on success, or an error string on failure.
fn verify_token(config: &BackendConfig, token: Option<&str>) -> Result<String, &'static str> {
    let token = token.ok_or("missing_token")?;

    let (encoded_claims, signature) = split_token(token).ok_or("malformed_token")?;

    let secrets = email_unsubscribe_secrets(config);
    let valid_sig = secrets
        .iter()
        .any(|secret| verify_signature(secret, encoded_claims, signature));

    if !valid_sig {
        return Err("invalid_signature");
    }

    let claims = decode_claims(encoded_claims).ok_or("invalid_claims")?;

    if claims.typ != TOKEN_TYPE || claims.v != TOKEN_VERSION {
        return Err("invalid_claims");
    }

    let normalized = claims.email.trim().to_lowercase();
    if normalized.is_empty() {
        return Err("invalid_email");
    }

    Ok(normalized)
}

/// Splits `"<claims>.<signature>"` into `(&claims, &signature)`.
/// Returns `None` if there are not exactly two dot-separated parts.
fn split_token(token: &str) -> Option<(&str, &str)> {
    let mut parts = token.splitn(3, '.');
    let claims = parts.next()?;
    let sig = parts.next()?;
    if parts.next().is_some() {
        // Extra segments — treat as malformed.
        return None;
    }
    if claims.is_empty() || sig.is_empty() {
        return None;
    }
    Some((claims, sig))
}

/// Decodes base64url `encoded_claims` and deserializes the JSON.
fn decode_claims(encoded_claims: &str) -> Option<UnsubscribeClaims> {
    let json_bytes = URL_SAFE_NO_PAD.decode(encoded_claims).ok()?;
    serde_json::from_slice(&json_bytes).ok()
}

/// Timing-safe HMAC-SHA256 signature check.
///
/// Returns `true` when `HMAC-SHA256(secret, encoded_claims)` matches
/// `signature` (both in base64url-no-pad encoding).
fn verify_signature(secret: &str, encoded_claims: &str, signature: &str) -> bool {
    let sig_bytes = match URL_SAFE_NO_PAD.decode(signature) {
        Ok(b) => b,
        Err(_) => return false,
    };
    let Ok(mut mac) = HmacSha256::new_from_slice(secret.as_bytes()) else {
        return false;
    };
    mac.update(encoded_claims.as_bytes());
    mac.verify_slice(&sig_bytes).is_ok()
}

/// Collects the secret candidates available in `BackendConfig`.
///
/// Order mirrors the legacy priority list as closely as possible given the
/// fields exposed by `BackendConfig`.
fn email_unsubscribe_secrets(config: &BackendConfig) -> Vec<String> {
    let mut secrets: Vec<String> = config.app_coordination_secrets.clone();
    if let Some(key) = config.contact_data.service_role_key() {
        let key_owned = key.to_owned();
        if !secrets.contains(&key_owned) {
            secrets.push(key_owned);
        }
    }
    secrets
}

// ---------------------------------------------------------------------------
// HTML rendering  (mirrors renderPage() / htmlResponse() in the legacy route)
// ---------------------------------------------------------------------------

struct RenderParams<'a> {
    title: &'a str,
    message: &'a str,
    /// Already-normalized email address; `None` on the error page.
    email: Option<&'a str>,
    /// Raw token value; `None` on the error page.
    token: Option<&'a str>,
}

fn render_page(params: RenderParams<'_>) -> String {
    let escaped_email = params.email.map(escape_html_text).unwrap_or_default();
    let escaped_token = params.token.map(escape_html_attr).unwrap_or_default();

    let email_span = if escaped_email.is_empty() {
        String::new()
    } else {
        format!(" <span class=\"email\">{escaped_email}</span>")
    };

    let form_html = if escaped_token.is_empty() {
        String::new()
    } else {
        format!(
            "<form method=\"post\"><input type=\"hidden\" name=\"token\" value=\"{escaped_token}\" /><button type=\"submit\">Unsubscribe</button></form>"
        )
    };

    let title = params.title;
    let message = params.message;

    format!(
        r#"<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <style>
      body {{ margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; color: #0f172a; }}
      main {{ min-height: 100vh; display: grid; place-items: center; padding: 24px; }}
      section {{ width: min(100%, 440px); border: 1px solid #e2e8f0; border-radius: 8px; background: white; padding: 28px; box-shadow: 0 12px 30px rgb(15 23 42 / 0.08); }}
      h1 {{ margin: 0 0 12px; font-size: 24px; line-height: 1.2; }}
      p {{ margin: 0 0 18px; color: #475569; line-height: 1.55; }}
      .email {{ color: #0f172a; font-weight: 600; overflow-wrap: anywhere; }}
      button {{ border: 0; border-radius: 6px; background: #0f172a; color: white; cursor: pointer; font: inherit; font-weight: 600; padding: 10px 14px; }}
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>{title}</h1>
        <p>{message}{email_span}</p>
        {form_html}
      </section>
    </main>
  </body>
</html>"#
    )
}

/// Escapes `&` and `<` for use inside HTML text content.
fn escape_html_text(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;")
}

/// Escapes `&` and `"` for use inside an HTML attribute value.
fn escape_html_attr(s: &str) -> String {
    s.replace('&', "&amp;").replace('"', "&quot;")
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- Path guard ----------------------------------------------------------

    #[test]
    fn path_guard_is_exact() {
        assert_eq!(EMAIL_UNSUBSCRIBE_PATH, "/api/email/unsubscribe");
    }

    // -- split_token ---------------------------------------------------------

    #[test]
    fn split_token_valid_and_invalid() {
        // Valid: exactly two non-empty parts.
        let (claims, sig) = split_token("abc.def").unwrap();
        assert_eq!(claims, "abc");
        assert_eq!(sig, "def");
        // Invalid: one part, three parts, empty segments.
        assert!(split_token("abc").is_none());
        assert!(split_token("abc.def.ghi").is_none());
        assert!(split_token(".sig").is_none());
        assert!(split_token("claims.").is_none());
    }

    // -- HTML escaping -------------------------------------------------------

    #[test]
    fn html_escaping_rules() {
        // Text content: escape & and < only.
        assert_eq!(escape_html_text("a&b<c\"d"), "a&amp;b&lt;c\"d");
        // Attribute value: escape & and " only.
        assert_eq!(escape_html_attr("a&b\"c<d"), "a&amp;b&quot;c<d");
    }

    // -- render_page ---------------------------------------------------------

    #[test]
    fn render_page_error_has_no_form() {
        let html = render_page(RenderParams {
            title: "Invalid unsubscribe link",
            message: "This unsubscribe link is invalid or incomplete.",
            email: None,
            token: None,
        });
        assert!(html.contains("Invalid unsubscribe link"));
        assert!(!html.contains("<form"));
    }

    #[test]
    fn render_page_success_has_form_and_escapes() {
        // Form present, email and token are correctly HTML-escaped.
        let html = render_page(RenderParams {
            title: "T",
            message: "M",
            email: Some("a&b<c@example.com"),
            token: Some("tok&\"sig"),
        });
        assert!(html.contains("<form"));
        assert!(html.contains("a&amp;b&lt;c@example.com"));
        assert!(html.contains("value=\"tok&amp;&quot;sig\""));
    }

    // -- HMAC signature round-trip -------------------------------------------

    fn make_sig(secret: &str, encoded_claims: &str) -> String {
        let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(encoded_claims.as_bytes());
        URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
    }

    #[test]
    fn verify_signature_round_trip() {
        let sig = make_sig("secret", "claims");
        assert!(verify_signature("secret", "claims", &sig));
        assert!(!verify_signature("wrong", "claims", &sig));
        assert!(!verify_signature("secret", "claims", "not!base64url$$$"));
    }

    // -- extract_token_from_url ----------------------------------------------

    #[test]
    fn extract_token_returns_value_for_present_param() {
        let token = extract_token_from_url(Some(
            "https://example.com/api/email/unsubscribe?token=abc.def",
        ));
        assert_eq!(token.as_deref(), Some("abc.def"));
    }

    #[test]
    fn extract_token_returns_none_for_missing_param() {
        let token = extract_token_from_url(Some("https://example.com/api/email/unsubscribe"));
        assert!(token.is_none());
    }

    #[test]
    fn extract_token_returns_none_for_missing_url() {
        assert!(extract_token_from_url(None).is_none());
    }
}
