//! Handler for `GET /api/v1/workspaces/:wsId`.
//!
//! Ported from `apps/web/src/app/api/v1/workspaces/[wsId]/route.ts`.
//!
//! The legacy route is wrapped in `withApiAuth`, which authenticates the caller
//! using a *workspace API key* (`ttr_...` bearer token) rather than a Supabase
//! user JWT. Validation flow (see `packages/auth/src/api-keys.ts`):
//!   1. Extract the bearer key from the `Authorization` header (or raw `ttr_`).
//!   2. Look up candidate rows in `workspace_api_keys` by `key_prefix`
//!      (the first 12 characters of the key), excluding expired keys.
//!   3. For each candidate, validate the raw key against the stored
//!      `salt:hash` value using **scrypt** key derivation
//!      (`KEY_DERIVATION_LENGTH = 64`), then re-check expiry.
//!   4. The matching row yields a `WorkspaceContext { ws_id, .. }`.
//!
//! The handler then mirrors the route body:
//!   - If `context.ws_id != path wsId` → 403 `WORKSPACE_MISMATCH`.
//!   - Otherwise fetch `workspaces(id, name, created_at)` by id (admin/service
//!     role client) and return `{ id, name, created_at }`, or 404
//!     `WORKSPACE_NOT_FOUND`.
//!
//! IMPORTANT INTEGRATOR NOTE: step 3 requires **scrypt**, which is NOT a current
//! dependency of `apps/backend` (only `hmac` + `sha2` are available, and I am not
//! permitted to edit `Cargo.toml`). `validate_api_key_hash` below therefore
//! cannot derive the scrypt hash and conservatively returns `false`, which means
//! authentication will currently FAIL CLOSED (every request → 401). To make this
//! route functional the integrator must add a `scrypt` crate (matching the JS
//! `node:crypto` scrypt defaults: N=16384, r=8, p=1, dklen=64) and implement the
//! derivation inside `validate_api_key_hash`. See that function for the exact
//! shape. This is why confidence is reported as low.

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const WORKSPACES_2_PATH_PREFIX: &str = "/api/v1/workspaces/";
const API_KEY_PREFIX: &str = "ttr_";
const API_KEY_LOOKUP_PREFIX_LEN: usize = 12;

#[derive(Serialize)]
struct WorkspaceResponse {
    id: String,
    name: Option<String>,
    created_at: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceRow {
    id: Option<String>,
    name: Option<String>,
    created_at: Option<String>,
}

#[derive(Deserialize)]
struct ApiKeyRow {
    ws_id: Option<String>,
    key_hash: Option<String>,
    expires_at: Option<String>,
}

pub(crate) async fn handle_workspaces_2_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = workspaces_2_ws_id(request.path)?;

    Some(match request.method {
        "GET" => workspaces_2_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn workspaces_2_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // --- Authenticate via workspace API key ---------------------------------
    let Some(api_key) = extract_api_key(request.authorization) else {
        return error_response(
            401,
            "Unauthorized",
            "Missing or invalid Authorization header. Expected: \"Authorization: Bearer <api_key>\"",
            "MISSING_API_KEY",
        );
    };

    let context_ws_id = match validate_api_key(&config.contact_data, outbound, &api_key).await {
        Ok(Some(ws_id)) => ws_id,
        Ok(None) => {
            return error_response(
                401,
                "Unauthorized",
                "Invalid or expired API key",
                "INVALID_API_KEY",
            );
        }
        // Treat infrastructure errors the same way the wrapper would surface a
        // failed validation: as an invalid key (fail closed).
        Err(()) => {
            return error_response(
                401,
                "Unauthorized",
                "Invalid or expired API key",
                "INVALID_API_KEY",
            );
        }
    };

    // --- Route body ---------------------------------------------------------
    if context_ws_id != raw_ws_id {
        return error_response(
            403,
            "Forbidden",
            "API key does not have access to this workspace",
            "WORKSPACE_MISMATCH",
        );
    }

    match fetch_workspace(&config.contact_data, outbound, raw_ws_id).await {
        Ok(Some(workspace)) => no_store_response(json_response(
            200,
            WorkspaceResponse {
                id: workspace.id.unwrap_or_default(),
                name: workspace.name,
                created_at: workspace.created_at,
            },
        )),
        Ok(None) | Err(()) => error_response(
            404,
            "Not Found",
            "Workspace not found",
            "WORKSPACE_NOT_FOUND",
        ),
    }
}

/// Extract the raw `ttr_` API key from the `Authorization` header.
/// Supports `Bearer <key>` (case-insensitive) and raw `ttr_...`.
fn extract_api_key(authorization: Option<&str>) -> Option<String> {
    let header = authorization?.trim();
    if header.is_empty() {
        return None;
    }

    if header.len() >= 7 && header[..7].eq_ignore_ascii_case("bearer ") {
        let token = header[7..].trim();
        return (!token.is_empty()).then(|| token.to_owned());
    }

    if header.starts_with(API_KEY_PREFIX) {
        return Some(header.to_owned());
    }

    None
}

/// Validate the API key and return its workspace id on success.
///
/// Returns `Ok(Some(ws_id))` for a valid, unexpired key, `Ok(None)` for an
/// invalid/expired key, and `Err(())` for an infrastructure failure.
async fn validate_api_key(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    api_key: &str,
) -> Result<Option<String>, ()> {
    if !api_key.starts_with(API_KEY_PREFIX) {
        return Ok(None);
    }
    if api_key.len() < API_KEY_LOOKUP_PREFIX_LEN {
        return Ok(None);
    }
    let key_prefix = &api_key[..API_KEY_LOOKUP_PREFIX_LEN];

    let Some(url) = contact_data.rest_url(
        "workspace_api_keys",
        &[
            ("select", "id,ws_id,key_hash,role_id,expires_at".to_owned()),
            ("key_prefix", format!("eq.{key_prefix}")),
            ("or", "(expires_at.is.null,expires_at.gt.now())".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<ApiKeyRow>>().map_err(|_| ())?;

    for row in rows {
        let Some(stored_hash) = row.key_hash.as_deref() else {
            // Legacy keys without a hash are skipped (matches JS behavior).
            continue;
        };
        if !validate_api_key_hash(api_key, stored_hash) {
            continue;
        }
        // Hash matched: secondary expiry guard (the JS code re-checks this even
        // though the query already filters; we keep the conservative check, but
        // since we only have an opaque timestamp string here we rely on the
        // query-level `expires_at` filter above and accept the match).
        let _ = row.expires_at;
        return Ok(row.ws_id.filter(|id| !id.trim().is_empty()));
    }

    Ok(None)
}

/// Validate a raw API key against a stored `salt:hash` value using scrypt.
///
/// MUST mirror `validateApiKeyHash` in `packages/auth/src/api-keys.ts`:
///   - split `stored_hash` on ':' into (salt_hex, hash_hex)
///   - derive = scrypt(key, salt_hex /* used as raw ascii, NOT decoded */,
///     N=16384, r=8, p=1, dklen=64)  // node:crypto default params
///   - constant-time compare derive == hex_decode(hash_hex)
///
/// NOTE: `scrypt` is not currently a dependency of `apps/backend` and Cargo.toml
/// edits are out of scope for this port, so this implementation cannot derive
/// the hash and FAILS CLOSED (returns `false`). The integrator must add a
/// `scrypt` crate and implement the derivation here for the route to work.
fn validate_api_key_hash(_api_key: &str, stored_hash: &str) -> bool {
    // Basic structural validation kept so the shape is obvious to the integrator.
    let mut parts = stored_hash.splitn(2, ':');
    let (Some(salt), Some(hash)) = (parts.next(), parts.next()) else {
        return false;
    };
    if salt.is_empty() || hash.is_empty() {
        return false;
    }

    // TODO(integrator): implement scrypt derivation (N=16384, r=8, p=1, dklen=64)
    // and constant-time compare against hex_decode(hash). Until then, fail closed.
    false
}

async fn fetch_workspace(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Option<WorkspaceRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id,name,created_at".to_owned()),
            ("id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn send_service_role_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

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

/// Match `/api/v1/workspaces/:wsId` exactly: a single non-empty dynamic segment
/// with no further path segments (so e.g. `/habits/access` is not matched here).
fn workspaces_2_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(WORKSPACES_2_PATH_PREFIX)?;
    let ws_id = ws_id.strip_suffix('/').unwrap_or(ws_id);
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn error_response(status: u16, error: &str, message: &str, code: &str) -> BackendResponse {
    no_store_response(json_response(
        status,
        json!({
            "error": error,
            "message": message,
            "code": code,
        }),
    ))
}
