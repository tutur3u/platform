//! Port of `PUT` and `DELETE /api/v1/infrastructure/cron/whitelist/domain/:domain`.
//!
//! Legacy source:
//! `apps/web/src/app/api/v1/infrastructure/cron/whitelist/domain/[domain]/route.ts`.
//!
//! ## Auth
//!
//! Both methods call `getManagedCronAdminUser(request)` which:
//!
//! - Resolves the session user from a bearer token or cookie.
//! - Returns `null` (→ 403) if the user's email is not an exact `@tuturuuu.com`
//!   address (via `isExactTuturuuuDotComEmail`).
//!
//! This port reproduces the check with `supabase_auth::request_access_token`,
//! `supabase_auth::fetch_supabase_auth_user`, and
//! `supabase_auth::is_exact_tuturuuu_dot_com_email`.
//!
//! ## PUT — update the `enabled` flag for a whitelisted domain
//!
//! Request body (JSON): `{ "enabled": <boolean> }`
//!
//! - `400 { "message": "Invalid whitelist domain payload" }` — body is valid
//!   JSON but `enabled` is missing or not a boolean (mirrors `ZodError` path).
//! - `500 { "message": "Failed to update managed cron whitelist domain" }` —
//!   body is not parseable JSON (mirrors `request.json()` throw), or the
//!   downstream RPC fails.
//! - `200 { "success": true }` — on success.
//!
//! Calls the private-schema RPC
//! `update_managed_cron_whitelisted_domain_enabled` with
//! `{ p_actor_id, p_domain, p_enabled }` using the service-role key (mirrors
//! `createAdminClient` / `callManagedCronRpc`).
//!
//! ## DELETE — remove a whitelisted domain
//!
//! - `500 { "message": "Failed to delete managed cron whitelist domain" }` —
//!   RPC error.
//! - `200 { "success": true }` — on success.
//!
//! Calls the private-schema RPC `delete_managed_cron_whitelisted_domain` with
//! `{ p_domain }` using the service-role key.
//!
//! ## Domain normalisation
//!
//! The legacy `normalizeManagedCronDomain` trims and lower-cases the input
//! (stripping a leading `scheme://` prefix if present, removing a trailing dot,
//! and validating label structure). Since the `:domain` path segment is the
//! stored normalized form, this port applies trim + lowercase, which is the
//! behaviour-preserving subset for well-formed stored domains. Any deeper
//! invalidity surfaces as an RPC error → 500.
//!
//! ## Body Buffering
//!
//! `PUT` requires a request body. This module exports
//! `should_buffer_request_body` so that `lib.rs` can include it in the
//! body-buffering gate.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/infrastructure/cron/whitelist/domain/";
const PRIVATE_SCHEMA: &str = "private";
const UPDATE_DOMAIN_RPC: &str = "update_managed_cron_whitelisted_domain_enabled";
const DELETE_DOMAIN_RPC: &str = "delete_managed_cron_whitelisted_domain";

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_infrastructure_cron_whitelist_domain_domain_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let domain = domain_segment(request.path)?;

    Some(match request.method {
        "PUT" => put_domain_response(config, request, domain, outbound).await,
        "DELETE" => delete_domain_response(config, request, domain, outbound).await,
        _ => return None,
    })
}

/// Hook for the body-buffering gate in `lib.rs`.
///
/// Returns `true` for `PUT` requests to this route so the worker buffers the
/// request body before calling the handler.
pub(crate) fn should_buffer_request_body(method: &str, path: &str) -> bool {
    method == "PUT" && domain_segment(path).is_some()
}

// ---------------------------------------------------------------------------
// Path guard
// ---------------------------------------------------------------------------

/// Extract the `:domain` path segment.
///
/// Returns `None` if the path does not start with the expected prefix, if the
/// segment is empty, or if it contains a `/` (nested sub-path).
fn domain_segment(path: &str) -> Option<&str> {
    let segment = path.strip_prefix(PATH_PREFIX)?;
    (!segment.is_empty() && !segment.contains('/')).then_some(segment)
}

// ---------------------------------------------------------------------------
// Auth helper — mirrors getManagedCronAdminUser
// ---------------------------------------------------------------------------

/// Returns the authenticated user's ID if the caller is a managed-cron admin
/// (`@tuturuuu.com` e-mail), or `None` otherwise.
///
/// `None` should be translated into a 403 Forbidden response by the caller.
async fn managed_cron_admin_user_id(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<String> {
    let access_token = supabase_auth::request_access_token(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await?;
    if !supabase_auth::is_exact_tuturuuu_dot_com_email(user.email.as_deref()) {
        return None;
    }
    user.id.filter(|id| !id.trim().is_empty())
}

// ---------------------------------------------------------------------------
// PUT handler
// ---------------------------------------------------------------------------

async fn put_domain_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    domain: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return forbidden_response();
    }

    let Some(actor_id) = managed_cron_admin_user_id(contact_data, request, outbound).await else {
        return forbidden_response();
    };

    // Parse body: if body_text is missing or not valid JSON → 500 (mirrors the
    // non-ZodError branch from request.json() throwing a SyntaxError).
    let body_value = serde_json::from_str::<Value>(request.body_text.unwrap_or_default());
    let enabled = match body_value {
        Err(_) => {
            return no_store_response(json_response(
                500,
                json!({ "message": "Failed to update managed cron whitelist domain" }),
            ));
        }
        Ok(body) => match body.get("enabled").and_then(Value::as_bool) {
            Some(v) => v,
            // `enabled` missing or wrong type → ZodError path → 400
            None => {
                return no_store_response(json_response(
                    400,
                    json!({ "message": "Invalid whitelist domain payload" }),
                ));
            }
        },
    };

    let normalized_domain = normalize_domain(domain);

    match call_private_rpc(
        contact_data,
        outbound,
        UPDATE_DOMAIN_RPC,
        json!({
            "p_actor_id": actor_id,
            "p_domain": normalized_domain,
            "p_enabled": enabled,
        }),
    )
    .await
    {
        Ok(()) => no_store_response(json_response(200, json!({ "success": true }))),
        Err(()) => no_store_response(json_response(
            500,
            json!({ "message": "Failed to update managed cron whitelist domain" }),
        )),
    }
}

// ---------------------------------------------------------------------------
// DELETE handler
// ---------------------------------------------------------------------------

async fn delete_domain_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    domain: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return forbidden_response();
    }

    if managed_cron_admin_user_id(contact_data, request, outbound)
        .await
        .is_none()
    {
        return forbidden_response();
    }

    let normalized_domain = normalize_domain(domain);

    match call_private_rpc(
        contact_data,
        outbound,
        DELETE_DOMAIN_RPC,
        json!({ "p_domain": normalized_domain }),
    )
    .await
    {
        Ok(()) => no_store_response(json_response(200, json!({ "success": true }))),
        Err(()) => no_store_response(json_response(
            500,
            json!({ "message": "Failed to delete managed cron whitelist domain" }),
        )),
    }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/// Lightweight domain normalisation: trim whitespace + lowercase.
///
/// This covers the behaviour-preserving subset of the full legacy
/// `normalizeManagedCronDomain` for well-formed stored path segments.
fn normalize_domain(domain: &str) -> String {
    domain.trim().to_lowercase()
}

/// Call a PostgREST RPC function in the `private` Supabase schema using the
/// service-role key (mirrors `createAdminClient` + `client.schema('private').rpc`).
async fn call_private_rpc(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    rpc_name: &str,
    args: Value,
) -> Result<(), ()> {
    let rpc_url = contact_data.rpc_url(rpc_name).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body_str = args.to_string();

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_body(&body_str),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(())
}

fn forbidden_response() -> BackendResponse {
    no_store_response(json_response(
        403,
        json!({ "message": "You are not allowed to perform this action" }),
    ))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // ---- path guard --------------------------------------------------------

    #[test]
    fn domain_segment_valid_simple_domain() {
        assert_eq!(
            domain_segment("/api/v1/infrastructure/cron/whitelist/domain/example.com"),
            Some("example.com")
        );
    }

    #[test]
    fn domain_segment_valid_subdomain() {
        assert_eq!(
            domain_segment("/api/v1/infrastructure/cron/whitelist/domain/sub.example.com"),
            Some("sub.example.com")
        );
    }

    #[test]
    fn domain_segment_missing_prefix_returns_none() {
        assert_eq!(
            domain_segment("/api/v1/infrastructure/cron/whitelist/domains"),
            None
        );
    }

    #[test]
    fn domain_segment_empty_segment_returns_none() {
        assert_eq!(
            domain_segment("/api/v1/infrastructure/cron/whitelist/domain/"),
            None
        );
    }

    #[test]
    fn domain_segment_nested_path_returns_none() {
        assert_eq!(
            domain_segment("/api/v1/infrastructure/cron/whitelist/domain/example.com/extra"),
            None
        );
    }

    // ---- should_buffer_request_body ----------------------------------------

    #[test]
    fn buffer_put_on_valid_domain_path() {
        assert!(should_buffer_request_body(
            "PUT",
            "/api/v1/infrastructure/cron/whitelist/domain/example.com"
        ));
    }

    #[test]
    fn no_buffer_delete_on_valid_domain_path() {
        assert!(!should_buffer_request_body(
            "DELETE",
            "/api/v1/infrastructure/cron/whitelist/domain/example.com"
        ));
    }

    #[test]
    fn no_buffer_put_on_collection_path() {
        assert!(!should_buffer_request_body(
            "PUT",
            "/api/v1/infrastructure/cron/whitelist/domains"
        ));
    }

    #[test]
    fn no_buffer_put_on_empty_segment() {
        assert!(!should_buffer_request_body(
            "PUT",
            "/api/v1/infrastructure/cron/whitelist/domain/"
        ));
    }

    // ---- normalize_domain --------------------------------------------------

    #[test]
    fn normalize_trims_and_lowercases() {
        assert_eq!(normalize_domain("  Example.COM  "), "example.com");
    }

    // ---- response shapes ---------------------------------------------------

    #[test]
    fn forbidden_response_has_status_403() {
        let resp = forbidden_response();
        assert_eq!(resp.status, 403);
    }

    // ---- body validation ---------------------------------------------------

    #[test]
    fn enabled_true_parsed_correctly() {
        let body: Value = serde_json::from_str(r#"{"enabled":true}"#).unwrap();
        assert_eq!(body.get("enabled").and_then(Value::as_bool), Some(true));
    }

    #[test]
    fn missing_enabled_field_is_none() {
        let body: Value = serde_json::from_str(r#"{}"#).unwrap();
        assert_eq!(body.get("enabled").and_then(Value::as_bool), None);
    }

    #[test]
    fn enabled_as_string_is_none() {
        let body: Value = serde_json::from_str(r#"{"enabled":"true"}"#).unwrap();
        assert_eq!(body.get("enabled").and_then(Value::as_bool), None);
    }

    #[test]
    fn invalid_json_body_does_not_parse() {
        assert!(serde_json::from_str::<Value>("").is_err());
        assert!(serde_json::from_str::<Value>("not json").is_err());
    }
}
