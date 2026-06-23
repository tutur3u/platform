use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const EXTERNAL_THREADS_PATH_PREFIX: &str = "/api/v1/infrastructure/ai-agents/external-threads/";
const MESSAGES_PATH_SUFFIX: &str = "/messages";
const CHAT_APP_SESSION_TARGETS: [&str; 1] = ["chat"];
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const PRIVATE_SCHEMA: &str = "private";
const ADMIN_PERMISSION: &str = "admin";
const REQUIRED_PERMISSION: &str = "manage_workspace_secrets";
const LIST_THREAD_MESSAGES_RPC: &str = "ai_agent_external_list_thread_messages";
const DEFAULT_LIMIT: i64 = 80;

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceRow {
    creator_id: Option<String>,
}

#[derive(Deserialize)]
struct PermissionRow {
    permission: Option<String>,
}

struct EffectivePermissions {
    has_all_permissions: bool,
    permissions: Vec<String>,
}

impl EffectivePermissions {
    fn allows(&self, permission: &str) -> bool {
        self.has_all_permissions || self.permissions.iter().any(|value| value == permission)
    }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_infrastructure_ai_agents_external_threads_messages_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let thread_id = external_thread_messages_thread_id(request.path)?;

    Some(match request.method {
        "GET" => messages_response(config, request, thread_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn messages_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    thread_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        return error_response(500, "Failed to list external messages");
    }

    // requireAiAgentAdmin: resolve session (supabase session or `chat`
    // app-session), then evaluate ROOT workspace permissions.
    let Some(user_id) = resolve_user_id(config, request, outbound).await else {
        return unauthorized_response();
    };

    // getPermissions({ user, wsId: ROOT_WORKSPACE_ID }) -> null => 401.
    let permissions = match effective_root_permissions(contact_data, &user_id, outbound).await {
        Ok(Some(permissions)) => permissions,
        Ok(None) => return unauthorized_response(),
        Err(()) => return unauthorized_response(),
    };

    // withoutPermission('manage_workspace_secrets') => 403 Forbidden.
    if !permissions.allows(REQUIRED_PERMISSION) {
        return forbidden_response();
    }

    // limit = Number(searchParams.get('limit') ?? 80); fall back to 80 when NaN.
    let limit = parse_limit(request.url);

    // listAiAgentExternalThreadMessages({ limit, threadId }) via private RPC.
    match list_thread_messages(contact_data, thread_id, limit, outbound).await {
        Ok(messages) => no_store_response(json_response(200, json!({ "messages": messages }))),
        Err(()) => error_response(500, "Failed to list external messages"),
    }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

async fn resolve_user_id(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<String> {
    if contact::request_has_app_session_token(request) {
        let identity =
            contact::resolve_app_session_identity(config, request, &CHAT_APP_SESSION_TARGETS)
                .ok()?;

        return Some(identity.id).filter(|id| !id.trim().is_empty());
    }

    let access_token = supabase_auth::request_access_token(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;

    user.id.filter(|id| !id.trim().is_empty())
}

// ---------------------------------------------------------------------------
// ROOT workspace permission resolution (mirrors getPermissions for ROOT).
// All queries use the service role because the caller may be an app-session
// identity without a Supabase access token, matching the admin-client path
// used by getPermissions.
// ---------------------------------------------------------------------------

async fn effective_root_permissions(
    contact_data: &contact::ContactDataConfig,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<EffectivePermissions>, ()> {
    let Some(membership_type) = workspace_membership_type(contact_data, user_id, outbound).await?
    else {
        return Ok(None);
    };

    let Some(workspace) = workspace_row(contact_data, outbound).await? else {
        return Ok(None);
    };

    let role_permissions = if membership_type == "MEMBER" {
        workspace_role_permissions(contact_data, user_id, outbound).await?
    } else {
        Vec::new()
    };
    let default_permissions =
        workspace_default_permissions(contact_data, &membership_type, outbound).await?;
    let is_creator =
        membership_type == "MEMBER" && workspace.creator_id.as_deref() == Some(user_id);

    if !is_creator && role_permissions.is_empty() && default_permissions.is_empty() {
        return Ok(None);
    }

    let mut permissions = Vec::new();
    extend_unique(&mut permissions, role_permissions);
    extend_unique(&mut permissions, default_permissions);

    Ok(Some(EffectivePermissions {
        has_all_permissions: is_creator
            || permissions.iter().any(|value| value == ADMIN_PERMISSION),
        permissions,
    }))
}

async fn workspace_membership_type(
    contact_data: &contact::ContactDataConfig,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ROOT_WORKSPACE_ID}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let rows =
        service_role_get::<WorkspaceMembershipRow>(contact_data, &url, None, outbound).await?;
    Ok(rows
        .into_iter()
        .next()
        .map(|row| row.membership_type.unwrap_or_else(|| "MEMBER".to_owned())))
}

async fn workspace_row(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<WorkspaceRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "creator_id".to_owned()),
            ("id", format!("eq.{ROOT_WORKSPACE_ID}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let rows = service_role_get::<WorkspaceRow>(contact_data, &url, None, outbound).await?;
    Ok(rows.into_iter().next())
}

async fn workspace_role_permissions(
    contact_data: &contact::ContactDataConfig,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_role_members",
        &[
            (
                "select",
                "workspace_roles!inner(workspace_role_permissions(permission))".to_owned(),
            ),
            ("user_id", format!("eq.{user_id}")),
            ("workspace_roles.ws_id", format!("eq.{ROOT_WORKSPACE_ID}")),
            (
                "workspace_roles.workspace_role_permissions.enabled",
                "eq.true".to_owned(),
            ),
        ],
    ) else {
        return Err(());
    };

    let rows = service_role_get::<Value>(contact_data, &url, None, outbound).await?;
    let mut permissions = Vec::new();
    for row in &rows {
        collect_role_permissions(row, &mut permissions);
    }

    Ok(permissions)
}

async fn workspace_default_permissions(
    contact_data: &contact::ContactDataConfig,
    membership_type: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_default_permissions",
        &[
            ("select", "permission".to_owned()),
            ("ws_id", format!("eq.{ROOT_WORKSPACE_ID}")),
            ("member_type", format!("eq.{membership_type}")),
            ("enabled", "eq.true".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let rows = service_role_get::<PermissionRow>(contact_data, &url, None, outbound).await?;
    Ok(rows.into_iter().filter_map(|row| row.permission).collect())
}

// ---------------------------------------------------------------------------
// Thread messages RPC (private schema, service role)
// ---------------------------------------------------------------------------

async fn list_thread_messages(
    contact_data: &contact::ContactDataConfig,
    thread_id: &str,
    limit: i64,
    outbound: &impl OutboundHttpClient,
) -> Result<Value, ()> {
    let url = contact_data.rpc_url(LIST_THREAD_MESSAGES_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let body = json!({
        "p_limit": limit,
        "p_thread_id": thread_id,
    })
    .to_string();

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
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // RPC returns the messages array (legacy coalesces null/undefined to []).
    match response.json::<Value>() {
        Ok(Value::Null) => Ok(Value::Array(Vec::new())),
        Ok(value @ Value::Array(_)) => Ok(value),
        // Defensive: wrap any non-array value into an array, matching the
        // legacy `?? []` fallback on an empty/absent result.
        Ok(_) => Ok(Value::Array(Vec::new())),
        Err(_) => {
            // Empty body (e.g. 204) is treated as an empty list.
            if response.body_text.trim().is_empty() {
                Ok(Value::Array(Vec::new()))
            } else {
                Err(())
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async fn service_role_get<T: for<'de> Deserialize<'de>>(
    contact_data: &contact::ContactDataConfig,
    url: &str,
    schema: Option<&str>,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<T>, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);
    if let Some(schema) = schema {
        request = request
            .with_header("Accept-Profile", schema)
            .with_header("Content-Profile", schema);
    }

    let response: OutboundResponse = outbound.send(request).await.map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<T>>().map_err(|_| ())
}

fn collect_role_permissions(value: &Value, permissions: &mut Vec<String>) {
    match value {
        Value::Array(items) => {
            for item in items {
                collect_role_permissions(item, permissions);
            }
        }
        Value::Object(map) => {
            if let Some(permission) = map.get("permission").and_then(Value::as_str) {
                permissions.push(permission.to_owned());
            }
            if let Some(role_permissions) = map.get("workspace_role_permissions") {
                collect_role_permissions(role_permissions, permissions);
            }
            if let Some(workspace_roles) = map.get("workspace_roles") {
                collect_role_permissions(workspace_roles, permissions);
            }
        }
        _ => {}
    }
}

fn extend_unique(permissions: &mut Vec<String>, values: Vec<String>) {
    for permission in values {
        if !permissions.iter().any(|value| value == &permission) {
            permissions.push(permission);
        }
    }
}

/// limit = Number(searchParams.get('limit') ?? 80). When the query param is
/// absent or parses to a non-finite number, fall back to 80. Number() of an
/// integer string yields that integer; we mirror that with an i64 parse and
/// only fall back when the value is absent or not a finite number.
fn parse_limit(request_url: Option<&str>) -> i64 {
    let Some(raw) = query_value(request_url, "limit") else {
        return DEFAULT_LIMIT;
    };

    // Number('') === 0 in JS, and Number.isFinite(0) is true, so an empty
    // string yields 0; any non-numeric value yields NaN -> fall back to 80.
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return 0;
    }

    match trimmed.parse::<f64>() {
        Ok(value) if value.is_finite() => value.trunc() as i64,
        _ => DEFAULT_LIMIT,
    }
}

/// URLSearchParams.get(key): returns Some(value) for the first match (which may
/// be an empty string), or None when the key is absent.
fn query_value(request_url: Option<&str>, key: &str) -> Option<String> {
    let url = url::Url::parse(request_url?).ok()?;
    url.query_pairs()
        .find_map(|(name, value)| (name == key).then(|| value.into_owned()))
}

/// Matches `/api/v1/infrastructure/ai-agents/external-threads/{threadId}/messages`
/// and extracts the dynamic `threadId` segment. Returns None when the path does
/// not match this route shape (so the dispatcher falls through).
fn external_thread_messages_thread_id(path: &str) -> Option<&str> {
    let thread_id = path
        .strip_prefix(EXTERNAL_THREADS_PATH_PREFIX)?
        .strip_suffix(MESSAGES_PATH_SUFFIX)?;

    (!thread_id.is_empty() && !thread_id.contains('/')).then_some(thread_id)
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(401, json!({ "error": "Unauthorized" })))
}

fn forbidden_response() -> BackendResponse {
    no_store_response(json_response(403, json!({ "error": "Forbidden" })))
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
