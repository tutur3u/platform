use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

// Static route — dispatch on exact ("METHOD", path) equality.
const DEVBOXES_AGENTS_POLL_PATH: &str = "/api/v1/devboxes/agents/poll";

const PRIVATE_SCHEMA: &str = "private";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const DEVBOX_RUNNER_TOKENS_TABLE: &str = "devbox_runner_tokens";
const DEVBOX_RUNNERS_TABLE: &str = "devbox_runners";
const WORKSPACE_MEMBERS_TABLE: &str = "workspace_members";
const CLAIM_NEXT_DEVBOX_RUN_RPC: &str = "claim_next_devbox_run";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const CLAIM_FAILED_MESSAGE: &str = "Failed to claim devbox run";
const INVALID_CLAIM_PAYLOAD_MESSAGE: &str = "Invalid claimed devbox run payload.";
// Mirrors store-utils.ts DEVBOX_READINESS_MESSAGE.
const DEVBOX_READINESS_MESSAGE: &str = "Remote devboxes are not ready: Supabase is missing private devbox tables or PostgREST schema cache has not refreshed. Apply migration 20260603171600_create_private_devboxes.sql, then run notify pgrst, 'reload schema' if the table already exists.";

#[derive(Deserialize)]
struct DevboxRunnerTokenRow {
    runner_id: Option<Value>,
}

#[derive(Deserialize)]
struct DevboxRunnerRow {
    actor_id: Option<Value>,
    status: Option<Value>,
}

#[derive(Deserialize)]
struct WorkspaceMemberRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

// Mirrors agent-store.ts DevboxClaimedRunRow / toClaimedJob.
#[derive(Deserialize)]
struct DevboxClaimedRunRow {
    command: Option<Value>,
    created_at: Option<Value>,
    env: Option<Value>,
    env_files: Option<Value>,
    id: Option<Value>,
    lease_id: Option<Value>,
    preview_ports: Option<Value>,
    timeout_seconds: Option<Value>,
    updated_at: Option<Value>,
}

pub(crate) async fn handle_devboxes_agents_poll_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != DEVBOXES_AGENTS_POLL_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => devboxes_agents_poll_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn devboxes_agents_poll_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // authorizeDevboxAgent: pull the runner token from the Authorization
    // bearer header. The legacy route ALSO accepts an `x-devbox-runner-token`
    // header, but the backend framework does not expose arbitrary request
    // headers (only authorization/cookie/etc.), so only the bearer path is
    // supported here. See notes.
    let Some(token) = runner_bearer_token(request.authorization) else {
        return unauthorized_response();
    };

    // verifyDevboxRunnerToken({ requireOnline: true }). Any storage error is
    // caught by authorizeDevboxAgent and collapses into a 401, so we treat
    // every failure below as "unauthorized".
    let runner_id = match verify_devbox_runner_token(&config.contact_data, &token, outbound).await {
        Ok(Some(runner_id)) => runner_id,
        Ok(None) | Err(()) => return unauthorized_response(),
    };

    // claimNextDevboxRun — RPC errors propagate to the route try/catch and map
    // to 503 (readiness) / 500 via createDevboxRouteErrorResponse.
    match claim_next_devbox_run(&config.contact_data, &runner_id, outbound).await {
        Ok(jobs) => no_store_response(json_response(200, json!({ "jobs": jobs }))),
        Err(error) => devbox_store_error_response(error),
    }
}

// ---------------------------------------------------------------------------
// Runner token verification (private schema, service role)
// ---------------------------------------------------------------------------

async fn verify_devbox_runner_token(
    contact_data: &contact::ContactDataConfig,
    token: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<String>, ()> {
    let token_hash = sha256_hex(token);

    // devbox_runner_tokens: select runner_id where token_hash = hash and
    // revoked_at is null, order created_at desc, limit 1.
    let Some(tokens_url) = contact_data.rest_url(
        DEVBOX_RUNNER_TOKENS_TABLE,
        &[
            ("select", "runner_id".to_owned()),
            ("token_hash", format!("eq.{token_hash}")),
            ("revoked_at", "is.null".to_owned()),
            ("order", "created_at.desc".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let tokens_response = send_private_get(contact_data, outbound, &tokens_url).await?;
    if !(200..300).contains(&tokens_response.status) {
        return Err(());
    }

    let Some(runner_id) = tokens_response
        .json::<Vec<DevboxRunnerTokenRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .map(|row| value_to_string(row.runner_id.as_ref()))
        .filter(|runner_id| !runner_id.is_empty())
    else {
        // No matching token row -> verifyDevboxRunnerToken returns null.
        return Ok(None);
    };

    // devbox_runners: select id, actor_id, status where id = runner_id,
    // order updated_at desc, limit 1.
    let Some(runners_url) = contact_data.rest_url(
        DEVBOX_RUNNERS_TABLE,
        &[
            ("select", "id,actor_id,status".to_owned()),
            ("id", format!("eq.{runner_id}")),
            ("order", "updated_at.desc".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let runners_response = send_private_get(contact_data, outbound, &runners_url).await?;
    if !(200..300).contains(&runners_response.status) {
        return Err(());
    }

    let Some(runner) = runners_response
        .json::<Vec<DevboxRunnerRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
    else {
        return Ok(None);
    };

    let actor_id = value_to_string(runner.actor_id.as_ref());
    let status = value_to_string(runner.status.as_ref());

    // requireOnline: true -> status must equal "online". actor_id required.
    if actor_id.is_empty() || status != "online" {
        return Ok(None);
    }

    // verifyWorkspaceMembershipType requiredType MEMBER on ROOT workspace.
    if !root_workspace_member(contact_data, &actor_id, outbound).await? {
        return Ok(None);
    }

    Ok(Some(runner_id))
}

async fn root_workspace_member(
    contact_data: &contact::ContactDataConfig,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<bool, ()> {
    // workspace_members lives in the public schema (service role read).
    let Some(url) = contact_data.rest_url(
        WORKSPACE_MEMBERS_TABLE,
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ROOT_WORKSPACE_ID}")),
            ("user_id", format!("eq.{user_id}")),
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
        .json::<Vec<WorkspaceMemberRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.membership_type)
        .as_deref()
        == Some("MEMBER"))
}

// ---------------------------------------------------------------------------
// Claim next devbox run (private schema RPC, service role)
// ---------------------------------------------------------------------------

async fn claim_next_devbox_run(
    contact_data: &contact::ContactDataConfig,
    runner_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<Value>, DevboxStoreError> {
    let url = contact_data
        .rpc_url(CLAIM_NEXT_DEVBOX_RUN_RPC)
        .ok_or(DevboxStoreError::Generic)?;
    let service_role_key = contact_data
        .service_role_key()
        .ok_or(DevboxStoreError::Generic)?;
    let authorization = format!("Bearer {service_role_key}");
    let body = json!({ "p_runner_id": runner_id }).to_string();

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_body(&body),
        )
        .await
        .map_err(|_| DevboxStoreError::Generic)?;

    if !(200..300).contains(&response.status) {
        // Mirror getDevboxStorageError: a "not ready" PostgREST error maps to
        // 503 with the readiness message; otherwise a generic 500.
        return Err(devbox_store_error_from_body(&response.body_text));
    }

    // RPC returns an array of claimed-run rows (or null/empty when nothing was
    // claimed). agent-store takes data[0] and maps it via toClaimedJob.
    let first = response
        .json::<Vec<DevboxClaimedRunRow>>()
        .map_err(|_| DevboxStoreError::Generic)?
        .into_iter()
        .next();

    let Some(row) = first else {
        return Ok(Vec::new());
    };

    let job = to_claimed_job(row)?;
    Ok(vec![job])
}

// Mirrors agent-store.ts toClaimedJob.
fn to_claimed_job(row: DevboxClaimedRunRow) -> Result<Value, DevboxStoreError> {
    let run_id = as_string(row.id.as_ref());
    let lease_id = as_string(row.lease_id.as_ref());
    let command = as_string_array(row.command.as_ref());

    if run_id.is_empty() || lease_id.is_empty() || command.is_empty() {
        return Err(DevboxStoreError::Message(
            INVALID_CLAIM_PAYLOAD_MESSAGE.to_owned(),
        ));
    }

    Ok(json!({
        "command": command,
        "createdAt": as_string(row.created_at.as_ref()),
        "env": as_string_record(row.env.as_ref()),
        "envFiles": as_string_array(row.env_files.as_ref()),
        "leaseId": lease_id,
        "previewPorts": as_number_array(row.preview_ports.as_ref()),
        "runId": run_id,
        "timeoutSeconds": as_optional_number(row.timeout_seconds.as_ref()),
        "updatedAt": as_string(row.updated_at.as_ref()),
    }))
}

// ---------------------------------------------------------------------------
// Devbox store error handling (mirrors store-utils.ts)
// ---------------------------------------------------------------------------

enum DevboxStoreError {
    // Generic transport/parse failure -> 500 with fallback message.
    Generic,
    // A DevboxStoreError carrying an explicit message + status.
    Message(String),
    Readiness,
}

fn devbox_store_error_from_body(body_text: &str) -> DevboxStoreError {
    // PostgREST returns { message, ... }; getDevboxStorageError inspects it.
    let message = serde_json::from_str::<Value>(body_text)
        .ok()
        .and_then(|value| {
            value
                .get("message")
                .and_then(Value::as_str)
                .map(str::to_owned)
        });

    match message {
        Some(message) if is_devbox_readiness_error(&message) => DevboxStoreError::Readiness,
        Some(message) if !message.trim().is_empty() => DevboxStoreError::Message(message),
        _ => DevboxStoreError::Message("Unknown devbox storage error".to_owned()),
    }
}

// Mirrors store-utils.ts isDevboxReadinessError.
fn is_devbox_readiness_error(message: &str) -> bool {
    let normalized = message.to_lowercase();
    normalized.contains("devbox_")
        && (normalized.contains("schema cache")
            || normalized.contains("could not find the table")
            || normalized.contains("could not find the function")
            || normalized.contains("does not exist"))
}

fn devbox_store_error_response(error: DevboxStoreError) -> BackendResponse {
    let (status, message) = match error {
        // createDevboxRouteErrorResponse fallback for non-DevboxStoreError.
        DevboxStoreError::Generic => (500u16, CLAIM_FAILED_MESSAGE.to_owned()),
        DevboxStoreError::Readiness => (503u16, DEVBOX_READINESS_MESSAGE.to_owned()),
        DevboxStoreError::Message(message) => (500u16, message),
    };

    no_store_response(json_response(status, json!({ "message": message })))
}

// ---------------------------------------------------------------------------
// Shared HTTP helper (private schema, service role)
// ---------------------------------------------------------------------------

async fn send_private_get(
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
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Token extraction
// ---------------------------------------------------------------------------

// authorizeDevboxAgent getBearerToken: case-insensitive "bearer " prefix.
fn runner_bearer_token(authorization: Option<&str>) -> Option<String> {
    let authorization = authorization?.trim();
    let lowered = authorization.to_ascii_lowercase();
    if !lowered.starts_with("bearer ") {
        return None;
    }

    let token = authorization[("bearer ".len())..].trim();
    (!token.is_empty()).then(|| token.to_owned())
}

// ---------------------------------------------------------------------------
// Value coercion (mirrors agent-store.ts asString/asStringArray/etc.)
// ---------------------------------------------------------------------------

fn value_to_string(value: Option<&Value>) -> String {
    // Mirrors `String(x ?? '')` used by verifyDevboxRunnerToken.
    match value {
        None | Some(Value::Null) => String::new(),
        Some(Value::String(text)) => text.clone(),
        Some(Value::Bool(flag)) => flag.to_string(),
        Some(Value::Number(number)) => number.to_string(),
        Some(other) => other.to_string(),
    }
}

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

fn as_number_array(value: Option<&Value>) -> Vec<Value> {
    match value {
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|item| match item {
                Value::Number(number) if number.as_f64().is_some_and(f64::is_finite) => {
                    Some(Value::Number(number.clone()))
                }
                _ => None,
            })
            .collect(),
        _ => Vec::new(),
    }
}

fn as_string_record(value: Option<&Value>) -> Value {
    // Mirrors asStringRecord: keep only string-valued entries of an object.
    match value {
        Some(Value::Object(map)) => {
            let filtered: serde_json::Map<String, Value> = map
                .iter()
                .filter_map(|(key, entry)| match entry {
                    Value::String(text) => Some((key.clone(), Value::String(text.clone()))),
                    _ => None,
                })
                .collect();
            Value::Object(filtered)
        }
        _ => Value::Object(serde_json::Map::new()),
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

// Copied from auth_qr_login_challenges.rs sha256_hex (private fn there; copied
// here to avoid editing another module). See notes.
fn sha256_hex(value: &str) -> String {
    let digest = <sha2::Sha256 as sha2::Digest>::digest(value.as_bytes());
    let mut encoded = String::with_capacity(64);
    for byte in digest {
        let _ = std::fmt::Write::write_fmt(&mut encoded, format_args!("{byte:02x}"));
    }
    encoded
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(
        401,
        json!({ "message": UNAUTHORIZED_MESSAGE }),
    ))
}
