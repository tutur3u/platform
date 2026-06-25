use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const APP_COORDINATION_PATH: &str = "/api/v1/infrastructure/app-coordination";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const APP_COORDINATION_SESSION_POLICY_SECRET_NAME: &str = "APP_COORDINATION_SESSION_POLICY";

// Permissions accepted by requireExternalAppRegistryAdmin (legacy access.ts).
const MANAGE_WORKSPACE_SECRETS: &str = "manage_workspace_secrets";
const MANAGE_WORKSPACE_ROLES: &str = "manage_workspace_roles";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const READ_FAILURE_MESSAGE: &str = "Failed to read app coordination policy";

// ---- Policy schema bounds (mirrors APP_COORDINATION_SESSION_POLICY_LIMITS) ----

struct IntegerLimit {
    default_value: i64,
    min: i64,
    max: i64,
}

const BROWSER_REFRESH_REPLAY_GRACE_SECONDS: IntegerLimit = IntegerLimit {
    default_value: 30,
    min: 0,
    max: 300,
};
const CLI_ACCESS_TTL_SECONDS: IntegerLimit = IntegerLimit {
    default_value: 28_800,
    min: 300,
    max: 86_400,
};
const CLI_REFRESH_TTL_SECONDS: IntegerLimit = IntegerLimit {
    default_value: 7_776_000,
    min: 86_400,
    max: 7_776_000,
};
const EXTERNAL_APP_BEARER_TTL_SECONDS: IntegerLimit = IntegerLimit {
    default_value: 28_800,
    min: 300,
    max: 86_400,
};
const EXTERNAL_APP_REFRESH_REPLAY_GRACE_SECONDS: IntegerLimit = IntegerLimit {
    default_value: 30,
    min: 0,
    max: 300,
};
const INTERNAL_APP_ACCESS_TTL_SECONDS: IntegerLimit = IntegerLimit {
    default_value: 28_800,
    min: 300,
    max: 86_400,
};
const INTERNAL_APP_REFRESH_EARLY_SECONDS: IntegerLimit = IntegerLimit {
    default_value: 900,
    min: 60,
    max: 7_200,
};
const INTERNAL_APP_REFRESH_TTL_SECONDS: IntegerLimit = IntegerLimit {
    default_value: 2_592_000,
    min: 86_400,
    max: 7_776_000,
};

/// Serialized app-coordination session policy.
///
/// Field order and camelCase rename mirror the zod object produced by
/// `appCoordinationSessionPolicySchema` (insertion order on the JS object) so
/// the JSON body matches the legacy `NextResponse.json(policy)` output.
#[derive(Serialize)]
struct AppCoordinationSessionPolicy {
    #[serde(rename = "browserRefreshReplayGraceSeconds")]
    browser_refresh_replay_grace_seconds: i64,
    #[serde(rename = "cliAccessTtlSeconds")]
    cli_access_ttl_seconds: i64,
    #[serde(rename = "cliRefreshTtlSeconds")]
    cli_refresh_ttl_seconds: i64,
    #[serde(rename = "externalAppBearerTtlSeconds")]
    external_app_bearer_ttl_seconds: i64,
    #[serde(rename = "externalAppRefreshReplayGraceSeconds")]
    external_app_refresh_replay_grace_seconds: i64,
    #[serde(rename = "internalAppAccessTtlSeconds")]
    internal_app_access_ttl_seconds: i64,
    #[serde(rename = "internalAppOverrides")]
    internal_app_overrides: BTreeMap<String, InternalAppSessionPolicyOverride>,
    #[serde(rename = "internalAppRefreshEarlySeconds")]
    internal_app_refresh_early_seconds: i64,
    #[serde(rename = "internalAppRefreshTtlSeconds")]
    internal_app_refresh_ttl_seconds: i64,
}

#[derive(Serialize)]
struct InternalAppSessionPolicyOverride {
    #[serde(
        rename = "internalAppAccessTtlSeconds",
        skip_serializing_if = "Option::is_none"
    )]
    internal_app_access_ttl_seconds: Option<i64>,
    #[serde(
        rename = "internalAppRefreshEarlySeconds",
        skip_serializing_if = "Option::is_none"
    )]
    internal_app_refresh_early_seconds: Option<i64>,
    #[serde(
        rename = "internalAppRefreshTtlSeconds",
        skip_serializing_if = "Option::is_none"
    )]
    internal_app_refresh_ttl_seconds: Option<i64>,
}

impl AppCoordinationSessionPolicy {
    fn default_policy() -> Self {
        Self {
            browser_refresh_replay_grace_seconds: BROWSER_REFRESH_REPLAY_GRACE_SECONDS
                .default_value,
            cli_access_ttl_seconds: CLI_ACCESS_TTL_SECONDS.default_value,
            cli_refresh_ttl_seconds: CLI_REFRESH_TTL_SECONDS.default_value,
            external_app_bearer_ttl_seconds: EXTERNAL_APP_BEARER_TTL_SECONDS.default_value,
            external_app_refresh_replay_grace_seconds: EXTERNAL_APP_REFRESH_REPLAY_GRACE_SECONDS
                .default_value,
            internal_app_access_ttl_seconds: INTERNAL_APP_ACCESS_TTL_SECONDS.default_value,
            internal_app_overrides: BTreeMap::new(),
            internal_app_refresh_early_seconds: INTERNAL_APP_REFRESH_EARLY_SECONDS.default_value,
            internal_app_refresh_ttl_seconds: INTERNAL_APP_REFRESH_TTL_SECONDS.default_value,
        }
    }
}

#[derive(Serialize)]
struct AppCoordinationPolicyResponse {
    policy: AppCoordinationSessionPolicy,
    source: &'static str,
}

#[derive(Deserialize)]
struct WorkspaceSecretRow {
    value: Option<String>,
}

pub(crate) async fn handle_infrastructure_app_coordination_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != APP_COORDINATION_PATH {
        return None;
    }

    // Only GET is migrated. Return None for every other method so the Cloudflare
    // worker falls through to the still-active Next.js route (PUT, etc.).
    Some(match request.method {
        "GET" => read_policy_response(config, request, outbound).await,
        _ => return None,
    })
}

async fn read_policy_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // requireExternalAppRegistryAdmin: authenticated user with
    // manage_workspace_secrets OR manage_workspace_roles on the ROOT workspace.
    match authorize_external_app_registry_admin(&config.contact_data, request, outbound).await {
        Ok(()) => {}
        Err(AdminAccessError::Unauthorized) => return message_response(401, UNAUTHORIZED_MESSAGE),
        Err(AdminAccessError::Forbidden) => return message_response(403, FORBIDDEN_MESSAGE),
        Err(AdminAccessError::Internal) => return error_response(500, READ_FAILURE_MESSAGE),
    }

    match resolve_policy_from_secret(&config.contact_data, outbound).await {
        Ok((policy, source)) => no_store_response(json_response(
            200,
            AppCoordinationPolicyResponse { policy, source },
        )),
        Err(()) => error_response(500, READ_FAILURE_MESSAGE),
    }
}

enum AdminAccessError {
    Unauthorized,
    Forbidden,
    Internal,
}

async fn authorize_external_app_registry_admin(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Result<(), AdminAccessError> {
    // First attempt the primary permission. The shared authorizer resolves the
    // ROOT workspace, verifies membership, and aggregates role + default
    // permissions (admin/creator grant everything) exactly like getPermissions.
    match authorize_workspace_permission(
        contact_data,
        request,
        ROOT_WORKSPACE_ID,
        MANAGE_WORKSPACE_SECRETS,
        outbound,
    )
    .await
    {
        Ok(_) => return Ok(()),
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return Err(AdminAccessError::Unauthorized);
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return Err(AdminAccessError::Internal);
        }
        // Forbidden / NotFound: user is authenticated but lacks this specific
        // permission (or has no permission context on ROOT). Fall through to the
        // secondary permission before denying, matching the legacy `||` check.
        Err(WorkspacePermissionAuthorizationError::Forbidden)
        | Err(WorkspacePermissionAuthorizationError::NotFound) => {}
    }

    match authorize_workspace_permission(
        contact_data,
        request,
        ROOT_WORKSPACE_ID,
        MANAGE_WORKSPACE_ROLES,
        outbound,
    )
    .await
    {
        Ok(_) => Ok(()),
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            Err(AdminAccessError::Unauthorized)
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => Err(AdminAccessError::Internal),
        Err(WorkspacePermissionAuthorizationError::Forbidden)
        | Err(WorkspacePermissionAuthorizationError::NotFound) => Err(AdminAccessError::Forbidden),
    }
}

/// Mirrors `resolvePolicyFromSecret` with `db` provided (bypassCache: true):
/// read the ROOT workspace secret, parse + validate as JSON. On a valid policy
/// return `(policy, "secret")`; otherwise fall back to defaults `(default, "default")`.
/// (The environment-variable fallback path is unavailable in the worker, so the
/// fallback source is always "default" here.)
async fn resolve_policy_from_secret(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<(AppCoordinationSessionPolicy, &'static str), ()> {
    let secret_value = read_policy_secret_value(contact_data, outbound).await?;

    if let Some(raw) = secret_value
        && let Ok(parsed_json) = serde_json::from_str::<Value>(&raw)
        && let Some(policy) = parse_policy(&parsed_json)
    {
        return Ok((policy, "secret"));
    }

    Ok((AppCoordinationSessionPolicy::default_policy(), "default"))
}

async fn read_policy_secret_value(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "value".to_owned()),
            ("ws_id", format!("eq.{ROOT_WORKSPACE_ID}")),
            (
                "name",
                format!("eq.{APP_COORDINATION_SESSION_POLICY_SECRET_NAME}"),
            ),
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
        .json::<Vec<WorkspaceSecretRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.value))
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

// ---- Schema validation (mirrors appCoordinationSessionPolicySchema.strict()) ----

/// Allowed top-level keys for the strict object. Unknown keys reject the policy.
const POLICY_KEYS: &[&str] = &[
    "browserRefreshReplayGraceSeconds",
    "cliAccessTtlSeconds",
    "cliRefreshTtlSeconds",
    "externalAppBearerTtlSeconds",
    "externalAppRefreshReplayGraceSeconds",
    "internalAppAccessTtlSeconds",
    "internalAppOverrides",
    "internalAppRefreshEarlySeconds",
    "internalAppRefreshTtlSeconds",
];

const OVERRIDE_KEYS: &[&str] = &[
    "internalAppAccessTtlSeconds",
    "internalAppRefreshEarlySeconds",
    "internalAppRefreshTtlSeconds",
];

fn parse_policy(value: &Value) -> Option<AppCoordinationSessionPolicy> {
    let object = value.as_object()?;

    // strict(): reject unknown top-level keys.
    if object
        .keys()
        .any(|key| !POLICY_KEYS.contains(&key.as_str()))
    {
        return None;
    }

    let browser_refresh_replay_grace_seconds = bounded_with_default(
        object.get("browserRefreshReplayGraceSeconds"),
        &BROWSER_REFRESH_REPLAY_GRACE_SECONDS,
    )?;
    let cli_access_ttl_seconds =
        bounded_with_default(object.get("cliAccessTtlSeconds"), &CLI_ACCESS_TTL_SECONDS)?;
    let cli_refresh_ttl_seconds =
        bounded_with_default(object.get("cliRefreshTtlSeconds"), &CLI_REFRESH_TTL_SECONDS)?;
    let external_app_bearer_ttl_seconds = bounded_with_default(
        object.get("externalAppBearerTtlSeconds"),
        &EXTERNAL_APP_BEARER_TTL_SECONDS,
    )?;
    let external_app_refresh_replay_grace_seconds = bounded_with_default(
        object.get("externalAppRefreshReplayGraceSeconds"),
        &EXTERNAL_APP_REFRESH_REPLAY_GRACE_SECONDS,
    )?;
    let internal_app_access_ttl_seconds = bounded_with_default(
        object.get("internalAppAccessTtlSeconds"),
        &INTERNAL_APP_ACCESS_TTL_SECONDS,
    )?;
    let internal_app_refresh_early_seconds = bounded_with_default(
        object.get("internalAppRefreshEarlySeconds"),
        &INTERNAL_APP_REFRESH_EARLY_SECONDS,
    )?;
    let internal_app_refresh_ttl_seconds = bounded_with_default(
        object.get("internalAppRefreshTtlSeconds"),
        &INTERNAL_APP_REFRESH_TTL_SECONDS,
    )?;
    let internal_app_overrides = parse_overrides(object.get("internalAppOverrides"))?;

    Some(AppCoordinationSessionPolicy {
        browser_refresh_replay_grace_seconds,
        cli_access_ttl_seconds,
        cli_refresh_ttl_seconds,
        external_app_bearer_ttl_seconds,
        external_app_refresh_replay_grace_seconds,
        internal_app_access_ttl_seconds,
        internal_app_overrides,
        internal_app_refresh_early_seconds,
        internal_app_refresh_ttl_seconds,
    })
}

/// `boundedIntegerSchema`: missing -> default; otherwise must be an integer in
/// [min, max]. Out-of-range / non-integer values reject the whole policy.
fn bounded_with_default(value: Option<&Value>, limit: &IntegerLimit) -> Option<i64> {
    match value {
        None | Some(Value::Null) => Some(limit.default_value),
        Some(value) => bounded_integer(value, limit),
    }
}

fn bounded_integer(value: &Value, limit: &IntegerLimit) -> Option<i64> {
    let number = integer_value(value)?;
    (number >= limit.min && number <= limit.max).then_some(number)
}

/// z.number().int(): accepts JSON integers (and integral floats) only.
fn integer_value(value: &Value) -> Option<i64> {
    let number = value.as_f64()?;
    if number.fract() != 0.0 || !number.is_finite() {
        return None;
    }
    if number < i64::MIN as f64 || number > i64::MAX as f64 {
        return None;
    }
    Some(number as i64)
}

/// `internalAppOverrides`: missing/null -> `{}`. Otherwise a record of
/// appId -> strict override object. App ids must match `^[a-z0-9_-]{1,64}$`
/// (after trim + lowercase); override fields are optional bounded integers.
fn parse_overrides(
    value: Option<&Value>,
) -> Option<BTreeMap<String, InternalAppSessionPolicyOverride>> {
    let object = match value {
        None | Some(Value::Null) => return Some(BTreeMap::new()),
        Some(Value::Object(object)) => object,
        Some(_) => return None,
    };

    let mut overrides = BTreeMap::new();

    for (raw_key, raw_value) in object {
        let key = normalize_app_id(raw_key)?;
        let override_value = parse_override(raw_value)?;
        overrides.insert(key, override_value);
    }

    Some(overrides)
}

fn normalize_app_id(raw_key: &str) -> Option<String> {
    let normalized = raw_key.trim().to_lowercase();
    let length = normalized.len();

    if length == 0 || length > 64 {
        return None;
    }

    let valid = normalized.chars().all(|character| {
        character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || matches!(character, '_' | '-')
    });

    valid.then_some(normalized)
}

fn parse_override(value: &Value) -> Option<InternalAppSessionPolicyOverride> {
    let object = value.as_object()?;

    // strict(): reject unknown override keys.
    if object
        .keys()
        .any(|key| !OVERRIDE_KEYS.contains(&key.as_str()))
    {
        return None;
    }

    Some(InternalAppSessionPolicyOverride {
        internal_app_access_ttl_seconds: optional_bounded(
            object.get("internalAppAccessTtlSeconds"),
            &INTERNAL_APP_ACCESS_TTL_SECONDS,
        )?,
        internal_app_refresh_early_seconds: optional_bounded(
            object.get("internalAppRefreshEarlySeconds"),
            &INTERNAL_APP_REFRESH_EARLY_SECONDS,
        )?,
        internal_app_refresh_ttl_seconds: optional_bounded(
            object.get("internalAppRefreshTtlSeconds"),
            &INTERNAL_APP_REFRESH_TTL_SECONDS,
        )?,
    })
}

/// `optionalBoundedIntegerSchema`: missing/null -> None; present must be a
/// bounded integer. The outer Option wraps validation success (Some(field)),
/// the inner Option is the optional field value.
fn optional_bounded(value: Option<&Value>, limit: &IntegerLimit) -> Option<Option<i64>> {
    match value {
        None | Some(Value::Null) => Some(None),
        Some(value) => bounded_integer(value, limit).map(Some),
    }
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
