use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const ERROR_MESSAGE: &str = "Error fetching referral discounts";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const PRIVATE_SCHEMA: &str = "private";
const REFERRAL_DISCOUNTS_VIEW: &str = "v_user_referral_discounts";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

/// Extracts the `(wsId, userId)` dynamic segments from a path matching
/// `/api/v1/workspaces/{wsId}/users/{userId}/referral-discounts`.
fn referral_discounts_segments(path: &str) -> Option<(&str, &str)> {
    let segments: Vec<&str> = path
        .trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();

    if segments.len() == 7
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && !segments[3].is_empty()
        && segments[4] == "users"
        && !segments[5].is_empty()
        && segments[6] == "referral-discounts"
    {
        Some((segments[3], segments[5]))
    } else {
        None
    }
}

pub(crate) async fn handle_workspaces_users_referral_discounts_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, user_id) = referral_discounts_segments(request.path)?;

    Some(match request.method {
        "GET" => referral_discounts_response(config, request, raw_ws_id, user_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn referral_discounts_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    target_user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !config.contact_data.configured() {
        return error_response();
    }

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(caller_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    let resolved_ws_id = match normalize_workspace_id(
        &config.contact_data,
        outbound,
        raw_ws_id,
        &caller_id,
        &access_token,
    )
    .await
    {
        Ok(ws_id) => ws_id,
        Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    };

    match verify_workspace_member(&config.contact_data, outbound, &resolved_ws_id, &caller_id).await
    {
        Ok(true) => {}
        Ok(false) => return message_response(403, FORBIDDEN_MESSAGE),
        Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    match fetch_referral_discounts(
        &config.contact_data,
        outbound,
        &resolved_ws_id,
        target_user_id,
    )
    .await
    {
        Ok(rows) => no_store_response(json_response(200, rows)),
        Err(()) => error_response(),
    }
}

async fn fetch_referral_discounts(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    target_user_id: &str,
) -> Result<Value, ()> {
    let Some(url) = contact_data.rest_url(
        REFERRAL_DISCOUNTS_VIEW,
        &[
            ("select", "promo_id,calculated_discount_value".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{target_user_id}")),
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

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Value>().map_err(|_| ())?;
    if rows.is_array() { Ok(rows) } else { Err(()) }
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(resolved_ws_id);
        }

        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, Some(access_token)).await?
        {
            return Ok(workspace_id);
        }
        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, None).await?
        {
            return Ok(workspace_id);
        }
    }

    Ok(resolved_ws_id)
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id,workspace_members!inner(user_id,type)".to_owned(),
            ),
            ("personal", "eq.true".to_owned()),
            ("workspace_members.user_id", format!("eq.{user_id}")),
            ("workspace_members.type", "eq.MEMBER".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(contact_data, outbound, &url, Some(access_token)).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id)
        .ok_or(())
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    access_token: Option<&str>,
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
    let response = send_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn verify_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(contact_data, outbound, &url, None).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        .is_some())
}

async fn send_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = match access_token {
        Some(access_token) => format!("Bearer {access_token}"),
        None => format!("Bearer {service_role_key}"),
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

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn is_direct_workspace_lookup_identifier(identifier: &str) -> bool {
    let normalized = identifier.trim().to_lowercase();

    normalized == PERSONAL_WORKSPACE_SLUG
        || normalized == ROOT_WORKSPACE_ID
        || normalized == INTERNAL_WORKSPACE_SLUG
        || is_workspace_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

fn is_workspace_uuid_literal(value: &str) -> bool {
    value.trim().len() == 36
        && value
            .trim()
            .chars()
            .enumerate()
            .all(|(index, value)| match index {
                8 | 13 | 18 | 23 => value == '-',
                _ => value.is_ascii_hexdigit(),
            })
}

fn is_workspace_handle(value: &str) -> bool {
    let length = value.len();
    if length == 0 || length > 64 {
        return false;
    }

    value.chars().enumerate().all(|(index, character)| {
        let is_edge = index == 0 || index + 1 == length;
        character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || (!is_edge && matches!(character, '_' | '-'))
    })
}

fn error_response() -> BackendResponse {
    no_store_response(json_response(500, json!({ "message": ERROR_MESSAGE })))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
