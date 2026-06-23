use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const WORKSPACES_FORMS_SHARE_LINK_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_FORMS_SHARE_LINK_FORMS_SEGMENT: &str = "/forms/";
const WORKSPACES_FORMS_SHARE_LINK_PATH_SUFFIX: &str = "/share-link";

const MANAGE_FORMS_PERMISSION: &str = "manage_forms";
const PRIVATE_SCHEMA: &str = "private";
const FORM_SHARE_LINKS_TABLE: &str = "form_share_links";

const FORBIDDEN_MESSAGE: &str = "Forbidden";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";
const INVALID_FORM_ID_MESSAGE: &str = "Invalid form ID";

// Mirrors `generateFormShareCode` (apps/web/src/features/forms/server.ts).
const SHARE_CODE_ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const SHARE_CODE_LENGTH: usize = 12;

#[derive(Serialize)]
struct ShareLinkResponse {
    #[serde(rename = "shareLink")]
    share_link: FormShareLinkRow,
}

#[derive(Deserialize, Serialize)]
struct FormShareLinkRow {
    code: Option<String>,
    active: Option<bool>,
}

/// Dynamic route: `/api/v1/workspaces/:wsId/forms/:formId/share-link`.
pub(crate) async fn handle_workspaces_forms_share_link_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, raw_form_id) = workspaces_forms_share_link_params(request.path)?;

    Some(match request.method {
        "GET" => share_link_response(config, request, raw_ws_id, raw_form_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn share_link_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    raw_form_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // The legacy handler validates the form id with a canonical-UUID schema and
    // throws on failure, which the outer try/catch maps to a 500 with the
    // "Invalid form ID" message.
    let Some(form_id) = canonical_uuid(raw_form_id) else {
        return error_response(500, INVALID_FORM_ID_MESSAGE);
    };

    // Authenticate the caller and capture the user id for `created_by_user_id`.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };

    // Membership + `manage_forms` permission gate, mirroring
    // `getWorkspaceRouteContext` (isMember && canManageForms).
    match authorize_workspace_permission(
        contact_data,
        request,
        raw_ws_id,
        MANAGE_FORMS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(_) => {}
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return error_response(401, UNAUTHORIZED_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden)
        | Err(WorkspacePermissionAuthorizationError::NotFound) => {
            return error_response(403, FORBIDDEN_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return error_response(500, INTERNAL_SERVER_ERROR_MESSAGE);
        }
    }

    match existing_share_link(contact_data, outbound, &form_id).await {
        Ok(Some(row)) => {
            no_store_response(json_response(200, ShareLinkResponse { share_link: row }))
        }
        Ok(None) => match insert_share_link(contact_data, outbound, &form_id, &user_id).await {
            Ok(row) => no_store_response(json_response(201, ShareLinkResponse { share_link: row })),
            Err(()) => error_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
        },
        Err(()) => error_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    }
}

async fn existing_share_link(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    form_id: &str,
) -> Result<Option<FormShareLinkRow>, ()> {
    let Some(url) = contact_data.rest_url(
        FORM_SHARE_LINKS_TABLE,
        &[
            ("select", "code,active".to_owned()),
            ("form_id", format!("eq.{form_id}")),
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
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA),
        )
        .await
        .map_err(|_| ())?;

    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(decode_first_row(&response)?)
}

async fn insert_share_link(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    form_id: &str,
    user_id: &str,
) -> Result<FormShareLinkRow, ()> {
    let Some(url) = contact_data.rest_url(
        FORM_SHARE_LINKS_TABLE,
        &[("select", "code,active".to_owned())],
    ) else {
        return Err(());
    };

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let code = generate_form_share_code(form_id, user_id);
    let body = serde_json::to_string(&json!({
        "form_id": form_id,
        "code": code,
        "created_by_user_id": user_id,
    }))
    .map_err(|_| ())?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Prefer", "return=representation")
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !is_success_status(response.status) {
        return Err(());
    }

    decode_first_row(&response)?.ok_or(())
}

/// Generates a 12-character share code over the same alphabet as
/// `generateFormShareCode`. The Workers runtime has no `rand` crate available,
/// so entropy is derived from the current time mixed with the form and user
/// ids and expanded with SHA-256. Insertion only happens once per form (guarded
/// by the existing-link lookup), so a single derived code per request suffices.
fn generate_form_share_code(form_id: &str, user_id: &str) -> String {
    let seed = format!("{}:{form_id}:{user_id}", now_nanos());
    let mut digest = sha256_bytes(&seed);
    let mut code = String::with_capacity(SHARE_CODE_LENGTH);
    let alphabet_len = SHARE_CODE_ALPHABET.len() as u8;

    for index in 0..SHARE_CODE_LENGTH {
        // 32 SHA-256 bytes cover the 12 required characters; rehash defensively
        // if the digest were ever shorter than the code length.
        if index >= digest.len() {
            digest = sha256_bytes(&format!("{seed}:{index}"));
        }
        let byte = digest[index % digest.len()];
        let choice = (byte % alphabet_len) as usize;
        code.push(SHARE_CODE_ALPHABET[choice] as char);
    }

    code
}

fn sha256_bytes(value: &str) -> Vec<u8> {
    <sha2::Sha256 as sha2::Digest>::digest(value.as_bytes()).to_vec()
}

fn now_nanos() -> u128 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0)
}

fn decode_first_row(response: &OutboundResponse) -> Result<Option<FormShareLinkRow>, ()> {
    response
        .json::<Vec<FormShareLinkRow>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

/// Matches `/api/v1/workspaces/:wsId/forms/:formId/share-link`, returning the
/// raw `wsId` and `formId` segments. Returns `None` for any other path shape so
/// the dispatcher falls through to the next route.
fn workspaces_forms_share_link_params(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(WORKSPACES_FORMS_SHARE_LINK_PATH_PREFIX)?;
    let (ws_id, after_ws) = rest.split_once(WORKSPACES_FORMS_SHARE_LINK_FORMS_SEGMENT)?;
    let form_id = after_ws.strip_suffix(WORKSPACES_FORMS_SHARE_LINK_PATH_SUFFIX)?;

    if ws_id.is_empty() || ws_id.contains('/') || form_id.is_empty() || form_id.contains('/') {
        return None;
    }

    Some((ws_id, form_id))
}

/// Mirrors the canonical-UUID schema used by `parseFormIdParam`
/// (`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`, case
/// insensitive). Returns the lowercased canonical form on success.
fn canonical_uuid(value: &str) -> Option<String> {
    if value.len() != 36 {
        return None;
    }

    let valid = value
        .chars()
        .enumerate()
        .all(|(index, character)| match index {
            8 | 13 | 18 | 23 => character == '-',
            _ => character.is_ascii_hexdigit(),
        });

    valid.then(|| value.to_ascii_lowercase())
}
