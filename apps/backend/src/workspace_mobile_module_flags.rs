use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const EXPERIMENTAL_MODULE_IDS: [&str; 7] = [
    "cms",
    "crm",
    "documents",
    "drive",
    "education",
    "inventory",
    "meet",
];
const HIDDEN_MODULES_SECRET: &str = "MOBILE_HIDDEN_MODULES";
const HIDE_EXPERIMENTAL_MODULES_SECRET: &str = "MOBILE_HIDE_EXPERIMENTAL_MODULES";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const MODULE_FLAGS_CACHE_CONTROL: &str = "private, max-age=60, stale-while-revalidate=60";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const WORKSPACE_MOBILE_MODULE_FLAGS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACE_MOBILE_MODULE_FLAGS_PATH_SUFFIX: &str = "/mobile/module-flags";
const WORKSPACE_SECRETS_TABLE: &str = "workspace_secrets";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceMobileModuleFlagsResponse {
    hidden_module_ids: Vec<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    ws_id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceSecretRow {
    name: Option<String>,
    value: Option<String>,
}

pub(crate) async fn handle_workspace_mobile_module_flags_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = workspace_mobile_module_flags_ws_id(request.path)?;

    Some(match request.method {
        "GET" => workspace_mobile_module_flags_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn workspace_mobile_module_flags_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, "Unauthorized");
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, "Unauthorized");
    };

    let resolved_ws_id = resolve_workspace_id(ws_id);

    match verify_workspace_membership(
        &config.contact_data,
        outbound,
        &resolved_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(true) => {}
        Ok(false) => return error_response(403, "You don't have access to this workspace"),
        Err(()) => return error_response(500, "Failed to verify workspace membership"),
    }

    let values =
        match workspace_module_secret_values(&config.contact_data, outbound, &resolved_ws_id).await
        {
            Ok(values) => values,
            Err(()) => return error_response(500, "Failed to load mobile module flags"),
        };

    private_cached_response(json_response(
        200,
        WorkspaceMobileModuleFlagsResponse {
            hidden_module_ids: hidden_module_ids(&values),
        },
    ))
}

async fn verify_workspace_membership(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "ws_id".to_owned()),
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
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.ws_id.as_deref())
        .is_some())
}

async fn workspace_module_secret_values(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<BTreeMap<String, Option<String>>, ()> {
    let Some(url) = contact_data.rest_url(
        WORKSPACE_SECRETS_TABLE,
        &[
            ("select", "name,value".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            (
                "name",
                format!("in.({HIDE_EXPERIMENTAL_MODULES_SECRET},{HIDDEN_MODULES_SECRET})"),
            ),
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
        .filter_map(|row| row.name.map(|name| (name, row.value)))
        .collect())
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

fn hidden_module_ids(values: &BTreeMap<String, Option<String>>) -> Vec<String> {
    let mut ids = BTreeSet::<String>::new();

    ids.extend(parse_module_ids(
        values.get(HIDDEN_MODULES_SECRET).and_then(Option::as_deref),
    ));

    if is_truthy_flag(
        values
            .get(HIDE_EXPERIMENTAL_MODULES_SECRET)
            .and_then(Option::as_deref),
    ) {
        ids.extend(EXPERIMENTAL_MODULE_IDS.into_iter().map(str::to_owned));
    }

    ids.into_iter().collect()
}

fn parse_module_ids(value: Option<&str>) -> Vec<String> {
    let Some(trimmed) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Vec::new();
    };

    if let Ok(Value::Array(items)) = serde_json::from_str::<Value>(trimmed) {
        return items
            .into_iter()
            .filter_map(|item| item.as_str().map(str::to_owned))
            .collect();
    }

    trimmed
        .split(',')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(str::to_owned)
        .collect()
}

fn is_truthy_flag(value: Option<&str>) -> bool {
    matches!(
        value.map(str::trim).map(str::to_lowercase).as_deref(),
        Some("1" | "true" | "yes" | "on")
    )
}

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn workspace_mobile_module_flags_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACE_MOBILE_MODULE_FLAGS_PATH_PREFIX)?
        .strip_suffix(WORKSPACE_MOBILE_MODULE_FLAGS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn private_cached_response(mut response: BackendResponse) -> BackendResponse {
    response.cache_control = Some(MODULE_FLAGS_CACHE_CONTROL);
    response
}

fn error_response(status: u16, error: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": error })))
}
