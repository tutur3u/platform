//! Handler for `GET /api/v1/workspaces/:wsId/storage/share`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/storage/share/route.ts`.
//!
//! The GET handler validates query params, authenticates the caller via the
//! `resolveWorkspaceStorageRouteAuth` flow (accepting `drive` and `finance`
//! app-session tokens, plus `tasks` for task images), normalizes the workspace ID, sanitizes the path,
//! enforces drive/finance-transaction permission checks, calls the Supabase
//! Storage sign API, and returns a `307 Temporary Redirect` to the signed URL.
//!
//! The POST handler is **not** ported here; returning `None` for non-GET
//! methods lets the dispatch chain fall through to the still-live Next.js
//! route.
//!
//! ## Behavior gaps vs. legacy
//!
//! - **R2 storage**: The legacy `createWorkspaceStorageSignedReadUrl` helper
//!   checks a per-workspace secret to decide between Supabase and Cloudflare
//!   R2. This handler only implements the Supabase path (the default). R2
//!   workspaces will receive a Supabase signed URL even when R2 is configured;
//!   practically those workspaces are uncommon and fall back gracefully.
//! - **requireExists**: The legacy helper does not set `requireExists` when
//!   called from the share route, so no extra existence check is performed here
//!   either.
//! - **Workspace ID normalization**: Mirrors the pattern from
//!   `workspaces_storage_object` for `personal`/`internal` slugs. Handle-based
//!   slug lookup is included for completeness.

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, empty_response,
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_SHARE_APP_SESSION_TARGETS: [&str; 2] = ["drive", "finance"];
const TASK_MEDIA_STORAGE_SHARE_APP_SESSION_TARGETS: [&str; 3] = ["drive", "finance", "tasks"];
const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";
const GET_WALLET_TRANSACTIONS_RPC: &str = "get_wallet_transactions_with_permissions";
const VIEW_DRIVE_PERMISSION: &str = "view_drive";
const MANAGE_DRIVE_TASKS_DIR_PERMISSION: &str = "manage_drive_tasks_directory";
const MOBILE_DEPLOYMENT_DRIVE_PREFIX: &str = ".tuturuuu/mobile-deployment-vault";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const WORKSPACES_BUCKET: &str = "workspaces";
const DEFAULT_EXPIRES_IN: u64 = 31_536_000;
const MAX_EXPIRES_IN: u64 = 31_536_000;
const MIN_EXPIRES_IN: u64 = 60;
const MAX_PATH_LENGTH: usize = 4096;
const MAX_DIMENSION: u64 = 2500;
const MIN_DIMENSION: u64 = 1;
const MIN_QUALITY: u64 = 20;
const MAX_QUALITY: u64 = 100;

// ── Internal structs ──────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
struct AuthenticatedUser {
    access_token: Option<String>,
    id: String,
}

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Serialize)]
struct HasWorkspacePermissionRequest<'a> {
    p_permission: &'a str,
    p_user_id: &'a str,
    p_ws_id: &'a str,
}

#[derive(Serialize)]
struct WalletTransactionsRequest<'a> {
    p_ws_id: &'a str,
    p_user_id: &'a str,
    p_transaction_ids: [&'a str; 1],
    p_limit: i64,
}

#[derive(Serialize)]
struct StorageSignRequest {
    #[serde(rename = "expiresIn")]
    expires_in: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    transform: Option<ImageTransformOptions>,
}

#[derive(Serialize)]
struct ImageTransformOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    width: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    height: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    resize: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    quality: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    format: Option<String>,
}

#[derive(Deserialize)]
struct StorageSignResponse {
    #[serde(rename = "signedURL")]
    signed_url: Option<String>,
}

enum DataAuth<'a> {
    AccessToken(&'a str),
    ServiceRole,
}

struct ShareQuery {
    path: String,
    expires_in: Option<u64>,
    width: Option<u64>,
    height: Option<u64>,
    resize: Option<String>,
    quality: Option<u64>,
    format: Option<String>,
}

// ── Public handler ────────────────────────────────────────────────────────────

pub(crate) async fn handle_workspaces_wsid_storage_share_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = storage_share_path_param(request.path)?;

    Some(match request.method {
        "GET" => storage_share_get_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

// ── GET response ──────────────────────────────────────────────────────────────

async fn storage_share_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !config.contact_data.configured() {
        return message_response(500, "Internal server error");
    }

    // Parse and validate query params.
    let parsed_url = request.url.and_then(|u| url::Url::parse(u).ok());
    let query = match parse_share_query(parsed_url.as_ref()) {
        Ok(q) => q,
        Err(msg) => return message_response(400, msg),
    };

    let Some(sanitized_path) = sanitize_path(&query.path) else {
        return message_response(400, "Invalid path");
    };
    if sanitized_path.is_empty() {
        return message_response(400, "Invalid path");
    }

    // Tasks app sessions may only request media from the task-images directory.
    let targets = storage_share_app_session_targets(&sanitized_path);
    let Some(user) = authenticated_user(config, request, outbound, targets).await else {
        return message_response(401, "Unauthorized");
    };

    // Normalize workspace ID.
    let normalized_ws_id =
        match normalize_workspace_id(&config.contact_data, outbound, raw_ws_id, &user).await {
            Ok(Some(ws_id)) => ws_id,
            Ok(None) => return message_response(401, "Unauthorized"),
            Err(()) => return message_response(500, "Internal server error"),
        };

    // Guard reserved mobile-deployment paths.
    if is_reserved_mobile_deployment_drive_path(&normalized_ws_id, &sanitized_path) {
        return message_response(403, "Forbidden");
    }

    // Permission check: view_drive OR finance-transaction access.
    let can_view_drive = match has_workspace_permission(
        &config.contact_data,
        outbound,
        &normalized_ws_id,
        VIEW_DRIVE_PERMISSION,
        &user.id,
    )
    .await
    {
        Ok(v) => v,
        Err(()) => return message_response(500, "Internal server error"),
    };

    let is_task_images_path =
        sanitized_path == "task-images" || sanitized_path.starts_with("task-images/");

    // Task media uses the same permission for reads as for uploads.
    let can_read_task_media = if is_task_images_path {
        match has_workspace_permission(
            &config.contact_data,
            outbound,
            &normalized_ws_id,
            MANAGE_DRIVE_TASKS_DIR_PERMISSION,
            &user.id,
        )
        .await
        {
            Ok(v) => v,
            Err(()) => return message_response(500, "Internal server error"),
        }
    } else {
        false
    };
    if is_task_images_path && !can_read_task_media {
        return message_response(403, "Insufficient permissions");
    }

    if !can_view_drive && !can_read_task_media {
        // Check finance-transaction access as fallback.
        let can_finance = match can_access_finance_transaction_storage_path(
            config,
            outbound,
            &normalized_ws_id,
            &sanitized_path,
            &user,
        )
        .await
        {
            Ok(v) => v,
            Err(()) => return message_response(500, "Internal server error"),
        };

        if !can_finance {
            return message_response(403, "Insufficient permissions");
        }
    }

    // Build the full storage path: {wsId}/{sanitizedPath}.
    let full_path = format!("{normalized_ws_id}/{sanitized_path}");

    // Build optional transform.
    let has_transform = query.width.is_some()
        || query.height.is_some()
        || query.resize.is_some()
        || query.quality.is_some()
        || query.format.is_some();

    let transform = has_transform.then_some(ImageTransformOptions {
        width: query.width,
        height: query.height,
        resize: query.resize,
        quality: query.quality,
        format: query.format,
    });

    // Call Supabase Storage sign API.
    match create_signed_url(
        &config.contact_data,
        outbound,
        &full_path,
        query.expires_in.unwrap_or(DEFAULT_EXPIRES_IN),
        transform,
    )
    .await
    {
        Ok(signed_url) => {
            let mut response = no_store_response(empty_response(307));
            response.headers.push(("location", signed_url));
            response
        }
        Err(()) => message_response(500, "Failed to generate signed URL"),
    }
}

// ── Supabase Storage sign API ─────────────────────────────────────────────────

async fn create_signed_url(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    full_path: &str,
    expires_in: u64,
    transform: Option<ImageTransformOptions>,
) -> Result<String, ()> {
    let Some(storage_base) = storage_base_url(contact_data) else {
        return Err(());
    };
    let sign_url = format!("{storage_base}/object/sign/{WORKSPACES_BUCKET}/{full_path}");
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let body = serde_json::to_string(&StorageSignRequest {
        expires_in,
        transform,
    })
    .map_err(|_| ())?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &sign_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let sign_resp = response.json::<StorageSignResponse>().map_err(|_| ())?;
    let relative = sign_resp.signed_url.filter(|s| !s.is_empty()).ok_or(())?;

    // The Supabase JS SDK constructs the full URL as:
    //   encodeURI(`${storageUrl}${data.signedURL}`)
    // where storageUrl = "{supabase_url}/storage/v1" and signedURL starts with "/".
    Ok(format!("{storage_base}{relative}"))
}

/// Derive the Supabase Storage base URL (`{supabase_url}/storage/v1`) from the
/// `rpc_url` helper, which returns `{supabase_url}/rest/v1/rpc/{fn}`.
fn storage_base_url(contact_data: &contact::ContactDataConfig) -> Option<String> {
    // rpc_url("_") => "{supabase_url}/rest/v1/rpc/_"
    let rpc = contact_data.rpc_url("_")?;
    let base = rpc.strip_suffix("/rest/v1/rpc/_")?;
    Some(format!("{base}/storage/v1"))
}

// ── Authentication ────────────────────────────────────────────────────────────

fn storage_share_app_session_targets(path: &str) -> &'static [&'static str] {
    if path == "task-images" || path.starts_with("task-images/") {
        &TASK_MEDIA_STORAGE_SHARE_APP_SESSION_TARGETS
    } else {
        &STORAGE_SHARE_APP_SESSION_TARGETS
    }
}

async fn authenticated_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
    targets: &[&str],
) -> Option<AuthenticatedUser> {
    if contact::request_has_app_session_token(request) {
        if let Ok(identity) = contact::resolve_app_session_identity(config, request, targets)
            && let Some(id) = non_empty(identity.id)
        {
            return Some(AuthenticatedUser {
                access_token: None,
                id,
            });
        }

        if let Ok(identity) = contact::resolve_cli_app_session_identity(config, request)
            && let Some(id) = non_empty(identity.id)
        {
            return Some(AuthenticatedUser {
                access_token: None,
                id,
            });
        }
    }

    let access_token = supabase_auth::request_access_token_allowing_app_sessions(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;
    let id = non_empty(user.id?)?;

    Some(AuthenticatedUser {
        access_token: Some(access_token),
        id,
    })
}

// ── Permission checks ─────────────────────────────────────────────────────────

async fn has_workspace_permission(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    permission: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let rpc_url = contact_data
        .rpc_url(HAS_WORKSPACE_PERMISSION_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&HasWorkspacePermissionRequest {
        p_permission: permission,
        p_user_id: user_id,
        p_ws_id: ws_id,
    })
    .map_err(|_| ())?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<bool>().map_err(|_| ())
}

async fn can_access_finance_transaction_storage_path(
    config: &BackendConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    sanitized_path: &str,
    user: &AuthenticatedUser,
) -> Result<bool, ()> {
    let Some(transaction_id) = finance_transaction_id_from_storage_path(sanitized_path) else {
        return Ok(false);
    };

    let rpc_url = config
        .contact_data
        .rpc_url(GET_WALLET_TRANSACTIONS_RPC)
        .ok_or(())?;
    let service_role_key = config.contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&WalletTransactionsRequest {
        p_ws_id: ws_id,
        p_user_id: &user.id,
        p_transaction_ids: [transaction_id],
        p_limit: 1,
    })
    .map_err(|_| ())?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Ok(false);
    }

    let rows = response.json::<Vec<serde_json::Value>>().map_err(|_| ())?;
    Ok(!rows.is_empty())
}

// ── Workspace ID normalization ────────────────────────────────────────────────

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user: &AuthenticatedUser,
) -> Result<Option<String>, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user).await;
    }

    if !is_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if is_workspace_handle(&handle) {
            if let Some(access_token) = user.access_token.as_deref()
                && let Some(ws_id) = workspace_id_by_handle(
                    contact_data,
                    outbound,
                    &handle,
                    &DataAuth::AccessToken(access_token),
                )
                .await?
            {
                return Ok(Some(ws_id));
            }

            if let Some(ws_id) =
                workspace_id_by_handle(contact_data, outbound, &handle, &DataAuth::ServiceRole)
                    .await?
            {
                return Ok(Some(ws_id));
            }
        }
    }

    Ok(Some(resolved_ws_id))
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user: &AuthenticatedUser,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id,workspace_members!inner(user_id,type)".to_owned(),
            ),
            ("personal", "eq.true".to_owned()),
            ("workspace_members.user_id", format!("eq.{}", user.id)),
            ("workspace_members.type", "eq.MEMBER".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let auth = user
        .access_token
        .as_deref()
        .map_or(DataAuth::ServiceRole, DataAuth::AccessToken);
    let response = send_rest_get(contact_data, outbound, &url, &auth).await?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    decode_first_row::<WorkspaceIdRow>(&response).map(|row| row.and_then(|r| r.id))
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    auth: &DataAuth<'_>,
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
    let response = send_rest_get(contact_data, outbound, &url, auth).await?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    decode_first_row::<WorkspaceIdRow>(&response).map(|row| row.and_then(|r| r.id))
}

async fn send_rest_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    auth: &DataAuth<'_>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = match auth {
        DataAuth::AccessToken(token) => format!("Bearer {token}"),
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

fn decode_first_row<T: for<'de> Deserialize<'de>>(
    response: &OutboundResponse,
) -> Result<Option<T>, ()> {
    response
        .json::<Vec<T>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

mod validation;
use validation::*;

#[cfg(test)]
mod tests;
