use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    infrastructure_root_auth::ROOT_WORKSPACE_ID,
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

pub(crate) const RATE_LIMITS_LIVE_USAGE_PATH: &str =
    "/api/v1/infrastructure/rate-limits/live-usage";

const ADMIN_LIST_RATE_LIMIT_COUNTERS_RPC: &str = "admin_list_rate_limit_counters";
const RATE_LIMIT_COUNTERS_LIMIT: i64 = 100;
const VIEW_INFRASTRUCTURE_PERMISSION: &str = "view_infrastructure";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const ERROR_MESSAGE: &str = "Failed to load rate-limit counters";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum LiveUsageAuthError {
    Forbidden,
    Internal,
    Unauthorized,
}

pub(crate) async fn handle_infrastructure_rate_limits_live_usage_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != RATE_LIMITS_LIVE_USAGE_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => live_usage_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn live_usage_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Mirrors `authorizeAbuseIntelligenceRequest` (default 'view_infrastructure'
    // permission against the root workspace).
    if let Err(error) = authorize_live_usage(config, request, outbound).await {
        return match error {
            LiveUsageAuthError::Unauthorized => message_response(401, UNAUTHORIZED_MESSAGE),
            LiveUsageAuthError::Forbidden => message_response(403, FORBIDDEN_MESSAGE),
            LiveUsageAuthError::Internal => error_response(),
        };
    }

    let bucket_prefix = bucket_prefix_from_url(request.url);

    // Legacy runs the RPC and the edge Redis scan in parallel. The Cloudflare
    // Workers backend has no Upstash/Redis client wired up, so the edge bucket
    // scan resolves to its "unavailable" branch exactly like the legacy code
    // does when Upstash env is missing (available: false, cursor: "0", no keys).
    let counters =
        match fetch_rate_limit_counters(&config.contact_data, outbound, bucket_prefix.as_deref())
            .await
        {
            Ok(counters) => counters,
            Err(()) => return error_response(),
        };

    no_store_response(json_response(
        200,
        json!({
            "mutateBuckets": unavailable_edge_buckets(),
            "readBuckets": unavailable_edge_buckets(),
            "writeCounters": counters,
        }),
    ))
}

async fn authorize_live_usage(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Result<(), LiveUsageAuthError> {
    if supabase_auth::request_access_token(request).is_none() {
        return Err(LiveUsageAuthError::Unauthorized);
    }

    match authorize_workspace_permission(
        &config.contact_data,
        request,
        ROOT_WORKSPACE_ID,
        VIEW_INFRASTRUCTURE_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(_) => Ok(()),
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            Err(LiveUsageAuthError::Unauthorized)
        }
        Err(
            WorkspacePermissionAuthorizationError::Forbidden
            | WorkspacePermissionAuthorizationError::NotFound,
        ) => Err(LiveUsageAuthError::Forbidden),
        Err(WorkspacePermissionAuthorizationError::Internal) => Err(LiveUsageAuthError::Internal),
    }
}

/// Resolves the optional `bucketPrefix` query value, mirroring
/// `url.searchParams.get('bucketPrefix')?.trim() || undefined`.
fn bucket_prefix_from_url(request_url: Option<&str>) -> Option<String> {
    let url = request_url.and_then(|request_url| url::Url::parse(request_url).ok())?;

    url.query_pairs()
        .find_map(|(key, value)| (key == "bucketPrefix").then(|| value.into_owned()))
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

/// Calls the `admin_list_rate_limit_counters` RPC with the service role,
/// matching the legacy `sbAdmin.rpc(...)` call. Returns the RPC payload
/// verbatim (or `[]` when the RPC yields null) so `writeCounters` matches the
/// legacy shape exactly.
async fn fetch_rate_limit_counters(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    bucket_prefix: Option<&str>,
) -> Result<Value, ()> {
    let rpc_url = contact_data
        .rpc_url(ADMIN_LIST_RATE_LIMIT_COUNTERS_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    // Only include `p_bucket_prefix` when a value is present, mirroring the
    // legacy `|| undefined` (an absent arg lets the RPC use its default).
    let body = match bucket_prefix {
        Some(prefix) => json!({
            "p_bucket_prefix": prefix,
            "p_limit": RATE_LIMIT_COUNTERS_LIMIT,
        }),
        None => json!({
            "p_limit": RATE_LIMIT_COUNTERS_LIMIT,
        }),
    }
    .to_string();

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

    // `counters ?? []` — null/absent payload becomes an empty array.
    match response.json::<Value>() {
        Ok(Value::Null) => Ok(Value::Array(Vec::new())),
        Ok(value) => Ok(value),
        Err(_) => Err(()),
    }
}

/// The edge-bucket payload as observed when the Redis SCAN is unavailable
/// (`scanReadUsageKeys` returns `{ available: false, cursor: '0', keys: [] }`).
fn unavailable_edge_buckets() -> Value {
    json!({
        "available": false,
        "buckets": [],
        "cursor": "0",
        "keys": [],
    })
}

fn error_response() -> BackendResponse {
    message_response(500, ERROR_MESSAGE)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
