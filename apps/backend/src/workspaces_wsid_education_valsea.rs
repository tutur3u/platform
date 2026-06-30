//! Handler for `GET /api/v1/workspaces/:wsId/education/valsea`.
//!
//! Ports the GET export from the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/education/valsea/route.ts`.
//!
//! # Auth model
//!
//! The legacy GET handler calls `checkEducationWorkspaceAccess`, which:
//!
//! - Resolves and normalises the workspace ID.
//! - Verifies the caller holds an active workspace membership.
//! - Checks that the `ENABLE_EDUCATION` workspace secret is set to `"true"`.
//! - Checks that the caller has the `ai_lab` workspace permission.
//!
//! This handler reproduces that flow via
//! `workspace_permission_check::authorize_workspace_permission` (membership +
//! permission) followed by a service-role read of `workspace_secrets` for the
//! education feature flag, matching the legacy status codes:
//!
//! - Missing/invalid session token → `401`
//! - Not a member or missing `ai_lab` permission → `403`
//! - Workspace not found → `404`
//! - Education feature not enabled → `404`
//! - Upstream / configuration failure → `500`
//!
//! # Response
//!
//! On success the handler returns:
//!
//! ```json
//! {
//!   "hasServerKey": <bool>,
//!   "pronunciationDefaultModel": "local-whisper-large-v3-turbo",
//!   "pronunciationModels": [...]
//! }
//! ```
//!
//! with `Cache-Control: private, no-store` (matching the legacy
//! `{ headers: { 'Cache-Control': 'private, no-store' } }` option).
//!
//! # Behavior gaps
//!
//! - `POST` (and all other non-`GET` methods) return `None` so that the
//!   request falls through to the still-live Next.js handler.
//! - `hasServerKey` is resolved from the worker process environment at
//!   request time via `std::env::var("VALSEA_API_KEY")`. In Next.js this is
//!   `process.env.VALSEA_API_KEY`; the semantics are identical.

use serde::Serialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const VALSEA_PATH_PREFIX: &str = "/api/v1/workspaces/";
const VALSEA_PATH_SUFFIX: &str = "/education/valsea";
const EDUCATION_PERMISSION: &str = "ai_lab";
const ENABLE_EDUCATION_SECRET: &str = "ENABLE_EDUCATION";
const WORKSPACE_SECRETS_TABLE: &str = "workspace_secrets";
const VALSEA_API_KEY_ENV: &str = "VALSEA_API_KEY";

const PRONUNCIATION_DEFAULT_MODEL: &str = "local-whisper-large-v3-turbo";
const PRONUNCIATION_MODELS: &[&str] = &[
    "local-whisper-large-v3-turbo",
    "local-whisper-large-v3",
    "local-whisper-medium",
    "local-whisper-small",
    "local-whisper-base",
    "local-whisper-tiny",
    "local-wav2vec2",
];

#[derive(Serialize)]
struct ValseaConfigResponse {
    #[serde(rename = "hasServerKey")]
    has_server_key: bool,
    #[serde(rename = "pronunciationDefaultModel")]
    pronunciation_default_model: &'static str,
    #[serde(rename = "pronunciationModels")]
    pronunciation_models: &'static [&'static str],
}

#[derive(serde::Deserialize)]
struct WorkspaceSecretRow {
    value: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_education_valsea_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = valsea_ws_id(request.path)?;

    Some(match request.method {
        "GET" => valsea_get_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn valsea_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if supabase_auth::request_access_token(request).is_none() {
        return message_response(401, "Unauthorized");
    }

    let authorization = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        EDUCATION_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return message_response(401, "Unauthorized");
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return message_response(403, "Insufficient permissions");
        }
        Err(WorkspacePermissionAuthorizationError::NotFound) => {
            return message_response(404, "Workspace not found");
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, "Failed to verify workspace access");
        }
    };

    match education_workspace_enabled(&config.contact_data, outbound, &authorization.ws_id).await {
        Ok(true) => {}
        Ok(false) => {
            return message_response(404, "Education is not enabled for this workspace");
        }
        Err(()) => {
            return message_response(500, "Failed to verify education access");
        }
    }

    let has_server_key = std::env::var(VALSEA_API_KEY_ENV)
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false);

    no_store_response(json_response(
        200,
        ValseaConfigResponse {
            has_server_key,
            pronunciation_default_model: PRONUNCIATION_DEFAULT_MODEL,
            pronunciation_models: PRONUNCIATION_MODELS,
        },
    ))
}

async fn education_workspace_enabled(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        WORKSPACE_SECRETS_TABLE,
        &[
            ("select", "value".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("name", format!("eq.{ENABLE_EDUCATION_SECRET}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceSecretRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.value)
        .is_some_and(|value| value.trim().eq_ignore_ascii_case("true")))
}

fn valsea_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(VALSEA_PATH_PREFIX)?
        .strip_suffix(VALSEA_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valsea_ws_id_extracts_valid_uuid() {
        let ws_id = "11111111-1111-4111-8111-111111111111";
        let path = format!("/api/v1/workspaces/{ws_id}/education/valsea");
        assert_eq!(valsea_ws_id(&path), Some(ws_id));
    }

    #[test]
    fn valsea_ws_id_rejects_wrong_prefix() {
        assert!(valsea_ws_id("/api/workspaces/abc/education/valsea").is_none());
        assert!(valsea_ws_id("/api/v2/workspaces/abc/education/valsea").is_none());
    }

    #[test]
    fn valsea_ws_id_rejects_wrong_suffix() {
        assert!(valsea_ws_id("/api/v1/workspaces/abc/education/valsea/extra").is_none());
        assert!(valsea_ws_id("/api/v1/workspaces/abc/education/").is_none());
    }

    #[test]
    fn valsea_ws_id_rejects_empty_segment() {
        assert!(valsea_ws_id("/api/v1/workspaces//education/valsea").is_none());
    }

    #[test]
    fn valsea_ws_id_rejects_nested_path_as_ws_id() {
        assert!(valsea_ws_id("/api/v1/workspaces/a/b/education/valsea").is_none());
    }

    #[test]
    fn pronunciation_models_contains_default() {
        assert!(PRONUNCIATION_MODELS.contains(&PRONUNCIATION_DEFAULT_MODEL));
    }

    #[test]
    fn pronunciation_models_has_expected_count() {
        assert_eq!(PRONUNCIATION_MODELS.len(), 7);
    }

    #[test]
    fn valsea_config_response_serializes_camel_case() {
        let resp = ValseaConfigResponse {
            has_server_key: true,
            pronunciation_default_model: PRONUNCIATION_DEFAULT_MODEL,
            pronunciation_models: PRONUNCIATION_MODELS,
        };
        let value = serde_json::to_value(&resp).expect("serializes");
        assert_eq!(value["hasServerKey"], serde_json::Value::Bool(true));
        assert_eq!(
            value["pronunciationDefaultModel"],
            serde_json::Value::String(PRONUNCIATION_DEFAULT_MODEL.to_owned())
        );
        assert!(value["pronunciationModels"].is_array());
        assert_eq!(
            value["pronunciationModels"].as_array().map(|a| a.len()),
            Some(7)
        );
    }
}
