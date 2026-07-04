use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const DEVBOXES_RUNS_PATH_PREFIX: &str = "/api/v1/devboxes/runs/";
const DEVBOX_RUNS_TABLE: &str = "devbox_runs";
const DEVBOX_RUN_EVENTS_TABLE: &str = "devbox_run_events";
const PRIVATE_SCHEMA: &str = "private";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const WORKSPACE_MEMBERS_TABLE: &str = "workspace_members";
const POSTGREST_SINGLE_JSON: &str = "application/vnd.pgrst.object+json";
const RUN_EVENTS_LIMIT: &str = "1000";

#[derive(Deserialize)]
struct WorkspaceMemberRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

// The legacy `select` also fetches `created_at` and `runner_id`, but the
// response never surfaces them, so they are intentionally omitted here (serde
// ignores unknown columns).
#[derive(Deserialize)]
struct DevboxRunRow {
    command: Option<Value>,
    exit_code: Option<Value>,
    id: Option<Value>,
    lease_id: Option<Value>,
    status: Option<Value>,
}

#[derive(Deserialize)]
struct DevboxRunEventRow {
    message: Option<Value>,
}

pub(crate) async fn handle_devboxes_runs_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let run_id = devboxes_runs_run_id(request.path)?;

    Some(match request.method {
        "GET" => devboxes_runs_get_response(config, request, run_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn devboxes_runs_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    run_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let actor_id = match authorize_devbox_root_member(config, request, outbound).await {
        Ok(actor_id) => actor_id,
        Err(response) => return response,
    };

    let run = match fetch_devbox_run(&config.contact_data, run_id, &actor_id, outbound).await {
        Ok(Some(run)) => run,
        Ok(None) => {
            return no_store_response(json_response(
                404,
                json!({ "message": "Devbox run not found." }),
            ));
        }
        Err(()) => return store_error_response(),
    };

    let logs = match fetch_devbox_run_logs(&config.contact_data, run_id, outbound).await {
        Ok(logs) => logs,
        Err(()) => return store_error_response(),
    };

    no_store_response(json_response(
        200,
        json!({
            "logs": logs,
            "run": {
                "command": as_string_array(run.command.as_ref()),
                "exitCode": as_optional_number(run.exit_code.as_ref()),
                "id": as_string(run.id.as_ref()),
                "leaseId": as_string(run.lease_id.as_ref()),
                "status": as_string(run.status.as_ref()),
            },
        }),
    ))
}

// ---------------------------------------------------------------------------
// Authorization (mirrors devbox_cache::authorize_devbox_root_member)
// ---------------------------------------------------------------------------

async fn authorize_devbox_root_member(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Result<String, BackendResponse> {
    let Some(user_id) = devbox_request_user_id(config, request, outbound).await else {
        return Err(no_store_response(json_response(
            401,
            json!({ "message": "Unauthorized" }),
        )));
    };

    if !config.contact_data.configured() {
        return Err(contact_data_layer_not_ready_response(request));
    }

    if !has_root_workspace_member(&config.contact_data, &user_id, outbound).await {
        return Err(no_store_response(json_response(
            403,
            json!({ "message": "Forbidden" }),
        )));
    }

    Ok(user_id)
}

async fn devbox_request_user_id(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<String> {
    if contact::request_has_app_session_token(request) {
        return contact::resolve_cli_app_session_identity(config, request)
            .ok()
            .map(|identity| identity.id);
    }

    let access_token = supabase_auth::request_access_token(request)?;
    if !config.contact_data.configured() {
        return None;
    }
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;

    user.id.filter(|id| !id.trim().is_empty())
}

async fn has_root_workspace_member(
    contact_data: &contact::ContactDataConfig,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> bool {
    let Some(url) = contact_data.rest_url(
        WORKSPACE_MEMBERS_TABLE,
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ROOT_WORKSPACE_ID}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return false;
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return false;
    };
    let authorization = format!("Bearer {service_role_key}");
    let Ok(response) = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", POSTGREST_SINGLE_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
    else {
        return false;
    };

    if !(200..300).contains(&response.status) {
        return false;
    }

    response
        .json::<WorkspaceMemberRow>()
        .ok()
        .and_then(|row| row.membership_type)
        .is_some_and(|membership_type| membership_type == "MEMBER")
}

// ---------------------------------------------------------------------------
// Devbox run reads (private schema, service role)
// ---------------------------------------------------------------------------

async fn fetch_devbox_run(
    contact_data: &contact::ContactDataConfig,
    run_id: &str,
    actor_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<DevboxRunRow>, ()> {
    let Some(url) = contact_data.rest_url(
        DEVBOX_RUNS_TABLE,
        &[
            (
                "select",
                "id,status,command,exit_code,created_at,lease_id,runner_id".to_owned(),
            ),
            ("id", format!("eq.{run_id}")),
            ("actor_id", format!("eq.{actor_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_private_get(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<DevboxRunRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn fetch_devbox_run_logs(
    contact_data: &contact::ContactDataConfig,
    run_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        DEVBOX_RUN_EVENTS_TABLE,
        &[
            ("select", "message".to_owned()),
            ("run_id", format!("eq.{run_id}")),
            ("order", "created_at.asc".to_owned()),
            ("limit", RUN_EVENTS_LIMIT.to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_private_get(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<DevboxRunEventRow>>()
        .map_err(|_| ())?
        .into_iter()
        .map(|row| message_to_string(row.message.as_ref()))
        .filter(|message| !message.is_empty())
        .collect())
}

async fn send_private_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<crate::outbound::OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Value coercion (mirrors agent-store.ts asString / asStringArray / etc.)
// ---------------------------------------------------------------------------

fn as_string(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(text)) => text.clone(),
        _ => String::new(),
    }
}

fn as_string_array(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|item| match item {
                Value::String(text) => Some(text.clone()),
                _ => None,
            })
            .collect(),
        _ => Vec::new(),
    }
}

fn as_optional_number(value: Option<&Value>) -> Value {
    match value {
        Some(Value::Number(number)) if number.as_f64().is_some_and(f64::is_finite) => {
            Value::Number(number.clone())
        }
        _ => Value::Null,
    }
}

fn message_to_string(value: Option<&Value>) -> String {
    // Legacy: String(row.message ?? '') -> coerce any non-null JSON value.
    match value {
        None | Some(Value::Null) => String::new(),
        Some(Value::String(text)) => text.clone(),
        Some(Value::Bool(flag)) => flag.to_string(),
        Some(Value::Number(number)) => number.to_string(),
        Some(other) => other.to_string(),
    }
}

// ---------------------------------------------------------------------------
// Path matching / shared responses
// ---------------------------------------------------------------------------

fn devboxes_runs_run_id(path: &str) -> Option<&str> {
    let run_id = path.strip_prefix(DEVBOXES_RUNS_PATH_PREFIX)?;

    (!run_id.is_empty() && !run_id.contains('/')).then_some(run_id)
}

fn store_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": "Failed to get devbox run" }),
    ))
}

fn contact_data_layer_not_ready_response(request: BackendRequest<'_>) -> BackendResponse {
    no_store_response(json_response(
        503,
        json!({
            "code": "CONTACT_DATA_LAYER_NOT_READY",
            "message": contact::CONTACT_DATA_LAYER_NOT_READY_MESSAGE,
            "requestId": request.request_id.unwrap_or("unknown"),
        }),
    ))
}
