use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const NOT_FOUND_MESSAGE: &str = "Current workspace user not found";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const WORKSPACE_USERS_ME_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACE_USERS_ME_PATH_SUFFIX: &str = "/users/me";
const ENSURE_LINK_RPC: &str = "ensure_workspace_user_link";
const LINKED_USERS_SELECT: &str =
    "platform_user_id, virtual_user_id, ws_id, created_at, workspace_users!virtual_user_id(*)";

/// Row returned by the `workspace_user_linked_users` REST read. The embedded
/// `workspace_users` relationship can deserialize as either a single object or
/// `null` depending on whether a linked virtual user exists.
#[derive(Deserialize)]
struct LinkedUserRow {
    platform_user_id: Option<String>,
    virtual_user_id: Option<String>,
    ws_id: Option<String>,
    created_at: Option<String>,
    #[serde(default)]
    workspace_users: Option<Value>,
}

#[derive(Deserialize)]
struct MembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

pub(crate) async fn handle_workspace_users_me_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspace_users_me_ws_id(request.path)?;

    Some(match request.method {
        "GET" => workspace_users_me_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn workspace_users_me_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Mirror the legacy helper: a missing caller session resolves to a `null`
    // workspace user, which the route surfaces as a 404 (not a 401).
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return not_found_response();
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return not_found_response();
    };

    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    // First attempt: caller-scoped (RLS-respecting) read of the existing link.
    match fetch_linked_user(
        &config.contact_data,
        outbound,
        &resolved_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(Some(row)) => return data_response(row),
        Ok(None) => {}
        Err(()) => return not_found_response(),
    }

    // Not found yet: auto-repair only for confirmed MEMBERs (RLS-scoped check).
    match verify_workspace_member(
        &config.contact_data,
        outbound,
        &resolved_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(true) => {}
        Ok(false) | Err(()) => return not_found_response(),
    }

    // Repair the missing link via the service-role RPC.
    if ensure_workspace_user_link(&config.contact_data, outbound, &resolved_ws_id, &user_id)
        .await
        .is_err()
    {
        return not_found_response();
    }

    // Fetch the newly created link with the caller-scoped client.
    match fetch_linked_user(
        &config.contact_data,
        outbound,
        &resolved_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(Some(row)) => data_response(row),
        Ok(None) | Err(()) => not_found_response(),
    }
}

async fn fetch_linked_user(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Option<LinkedUserRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_user_linked_users",
        &[
            ("select", LINKED_USERS_SELECT.to_owned()),
            ("platform_user_id", format!("eq.{user_id}")),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<LinkedUserRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn verify_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
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
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<MembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        == Some("MEMBER"))
}

async fn ensure_workspace_user_link(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<(), ()> {
    let Some(url) = contact_data.rpc_url(ENSURE_LINK_RPC) else {
        return Err(());
    };
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = json!({
        "target_user_id": user_id,
        "target_ws_id": ws_id,
    })
    .to_string();

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if (200..300).contains(&response.status) {
        Ok(())
    } else {
        Err(())
    }
}

async fn send_caller_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");

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

fn workspace_users_me_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACE_USERS_ME_PATH_PREFIX)?
        .strip_suffix(WORKSPACE_USERS_ME_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

/// Builds the `{ data: workspaceUser }` payload, spreading the embedded
/// `workspace_users` object only when it is present (matching the legacy
/// helper, which omits the key on a null relationship).
fn data_response(row: LinkedUserRow) -> BackendResponse {
    let mut data = json!({
        "platform_user_id": row.platform_user_id,
        "virtual_user_id": row.virtual_user_id,
        "ws_id": row.ws_id,
        "created_at": row.created_at,
    });

    if let Some(workspace_users) = row.workspace_users.filter(|value| !value.is_null()) {
        if let Some(object) = data.as_object_mut() {
            object.insert("workspace_users".to_owned(), workspace_users);
        }
    }

    no_store_response(json_response(200, json!({ "data": data })))
}

fn not_found_response() -> BackendResponse {
    no_store_response(json_response(404, json!({ "message": NOT_FOUND_MESSAGE })))
}
