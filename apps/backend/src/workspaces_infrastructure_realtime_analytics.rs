use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/infrastructure/realtime/analytics";
const MAX_NAME_LENGTH: usize = 255;
const ERROR_FETCH_MESSAGE: &str = "Error fetching realtime analytics";
const INTERNAL_ERROR_MESSAGE: &str = "Internal server error";
const INVALID_PARAMS_MESSAGE: &str = "Invalid query parameters";

/// Mirrors the validated query params of the legacy zod schema.
struct ValidatedParams {
    workspace_id: Option<String>,
    channel_id: Option<String>,
    start_date: String,
    end_date: String,
    metric: String,
}

/// Field/message pair mirroring the legacy `{ field, message }` validation
/// error shape.
#[derive(Serialize)]
struct ValidationIssue {
    field: String,
    message: String,
}

/// Row returned from `realtime_log_aggregations`.
#[derive(Deserialize)]
struct AggregationRow {
    time_bucket: Option<serde_json::Value>,
    total_count: Option<i64>,
    user_id: Option<serde_json::Value>,
}

/// Transformed row mirroring the legacy response payload exactly.
#[derive(Serialize)]
struct TransformedRow {
    time_bucket: serde_json::Value,
    total_count: i64,
    user_id: serde_json::Value,
}

pub(crate) async fn handle_workspaces_infrastructure_realtime_analytics_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    // Match the dynamic path shape: /api/v1/workspaces/{wsId}/infrastructure/realtime/analytics
    let _ws_id = match_path(request.path)?;

    Some(match request.method {
        "GET" => analytics_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

/// Extracts the `{wsId}` dynamic segment from the path, returning `None` when
/// the path does not match this route. The legacy handler ignores the path
/// segment for filtering (it filters by the `workspaceId` query param instead),
/// but matching the shape is required for dispatch.
fn match_path(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

async fn analytics_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Parse + validate query params (mirrors `QueryParamsSchema.safeParse`).
    let params = match validate_params(request.url) {
        Ok(params) => params,
        Err(issues) => {
            return no_store_response(json_response(
                400,
                json!({
                    "message": INVALID_PARAMS_MESSAGE,
                    "errors": issues,
                }),
            ));
        }
    };

    // The legacy route uses `createClient()` (caller-scoped, RLS-enforced) and
    // performs no explicit auth/membership check, relying entirely on RLS on
    // `realtime_log_aggregations`. We forward the caller's access token so the
    // same RLS policy applies. When no token is present, the caller is
    // unauthenticated and RLS returns an empty set, matching the legacy
    // unauthenticated behavior (`{ data: [], metric }`).
    let access_token = supabase_auth::request_access_token(request);

    match fetch_aggregations(
        &config.contact_data,
        outbound,
        &params,
        access_token.as_deref(),
    )
    .await
    {
        Ok(rows) => {
            let transformed: Vec<TransformedRow> = rows
                .into_iter()
                .map(|row| TransformedRow {
                    time_bucket: row.time_bucket.unwrap_or(serde_json::Value::Null),
                    total_count: row.total_count.unwrap_or(0),
                    user_id: row.user_id.unwrap_or(serde_json::Value::Null),
                })
                .collect();

            no_store_response(json_response(
                200,
                json!({
                    "data": transformed,
                    "metric": params.metric,
                }),
            ))
        }
        Err(FetchError::Query) => message_response(500, ERROR_FETCH_MESSAGE),
        Err(FetchError::Internal) => message_response(500, INTERNAL_ERROR_MESSAGE),
    }
}

enum FetchError {
    /// Maps to the legacy `error` branch (`Error fetching realtime analytics`).
    Query,
    /// Maps to the legacy outer catch (`Internal server error`) — e.g. missing
    /// Supabase configuration / service-role key needed for the request.
    Internal,
}

async fn fetch_aggregations(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    params: &ValidatedParams,
    access_token: Option<&str>,
) -> Result<Vec<AggregationRow>, FetchError> {
    let mut query_params: Vec<(&str, String)> = vec![
        ("select", "time_bucket,total_count,user_id".to_owned()),
        ("time_bucket", format!("gte.{}", params.start_date)),
        ("time_bucket", format!("lte.{}", params.end_date)),
        ("order", "time_bucket.asc".to_owned()),
    ];

    if let Some(workspace_id) = params.workspace_id.as_deref() {
        query_params.push(("ws_id", format!("eq.{workspace_id}")));
    }
    if let Some(channel_id) = params.channel_id.as_deref() {
        query_params.push(("channel_id", format!("eq.{channel_id}")));
    }

    let url = contact_data
        .rest_url("realtime_log_aggregations", &query_params)
        .ok_or(FetchError::Internal)?;

    // RLS-enforced read via the caller's access token (apikey must be the
    // service-role/anon key per PostgREST). Mirrors `createClient()` which uses
    // the caller's session for RLS.
    let service_role_key = contact_data
        .service_role_key()
        .ok_or(FetchError::Internal)?;
    let bearer = match access_token {
        Some(token) => format!("Bearer {token}"),
        None => format!("Bearer {service_role_key}"),
    };

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| FetchError::Query)?;

    if !(200..300).contains(&response.status) {
        return Err(FetchError::Query);
    }

    response
        .json::<Vec<AggregationRow>>()
        .map_err(|_| FetchError::Query)
}

/// Validates the query parameters, mirroring `QueryParamsSchema`:
/// - `workspaceId`: optional UUID
/// - `channelId`: optional string, max 255
/// - `startDate`: required ISO datetime
/// - `endDate`: required ISO datetime
/// - `metric`: enum(['requests','users']) default 'requests'
fn validate_params(request_url: Option<&str>) -> Result<ValidatedParams, Vec<ValidationIssue>> {
    let url = request_url.and_then(|raw| url::Url::parse(raw).ok());

    let get = |key: &str| -> Option<String> {
        url.as_ref().and_then(|url| {
            url.query_pairs()
                .find_map(|(k, v)| (k == key).then(|| v.into_owned()))
        })
    };

    let mut issues: Vec<ValidationIssue> = Vec::new();

    // workspaceId: optional uuid (empty string treated as undefined).
    let workspace_id = get("workspaceId").filter(|value| !value.is_empty());
    if let Some(value) = workspace_id.as_deref() {
        if !is_uuid(value) {
            issues.push(ValidationIssue {
                field: "workspaceId".to_owned(),
                message: "Invalid UUID".to_owned(),
            });
        }
    }

    // channelId: optional string max 255 (empty string treated as undefined).
    let channel_id = get("channelId").filter(|value| !value.is_empty());
    if let Some(value) = channel_id.as_deref() {
        if value.chars().count() > MAX_NAME_LENGTH {
            issues.push(ValidationIssue {
                field: "channelId".to_owned(),
                message: format!("Too big: expected string to have <={MAX_NAME_LENGTH} characters"),
            });
        }
    }

    // startDate: required ISO datetime.
    let start_date = get("startDate");
    match start_date.as_deref() {
        Some(value) if is_iso_datetime(value) => {}
        Some(_) => issues.push(ValidationIssue {
            field: "startDate".to_owned(),
            message: "Invalid ISO datetime".to_owned(),
        }),
        None => issues.push(ValidationIssue {
            field: "startDate".to_owned(),
            message: "Invalid input: expected string, received null".to_owned(),
        }),
    }

    // endDate: required ISO datetime.
    let end_date = get("endDate");
    match end_date.as_deref() {
        Some(value) if is_iso_datetime(value) => {}
        Some(_) => issues.push(ValidationIssue {
            field: "endDate".to_owned(),
            message: "Invalid ISO datetime".to_owned(),
        }),
        None => issues.push(ValidationIssue {
            field: "endDate".to_owned(),
            message: "Invalid input: expected string, received null".to_owned(),
        }),
    }

    // metric: enum(['requests','users']) default 'requests'.
    let metric_raw = get("metric").filter(|value| !value.is_empty());
    let metric = match metric_raw.as_deref() {
        None => "requests".to_owned(),
        Some("requests") => "requests".to_owned(),
        Some("users") => "users".to_owned(),
        Some(_) => {
            issues.push(ValidationIssue {
                field: "metric".to_owned(),
                message: "Invalid option: expected one of \"requests\"|\"users\"".to_owned(),
            });
            String::new()
        }
    };

    if !issues.is_empty() {
        return Err(issues);
    }

    Ok(ValidatedParams {
        workspace_id,
        channel_id,
        start_date: start_date.unwrap_or_default(),
        end_date: end_date.unwrap_or_default(),
        metric,
    })
}

/// Lenient ISO-8601 datetime check mirroring zod's `z.iso.datetime()`
/// (requires a date and time component; offset/`Z` allowed).
fn is_iso_datetime(value: &str) -> bool {
    // Minimal shape: YYYY-MM-DDTHH:MM:SS with optional fractional seconds and
    // optional timezone designator.
    let bytes = value.as_bytes();
    if bytes.len() < 19 {
        return false;
    }

    // YYYY-MM-DD
    let date_ok = bytes[0].is_ascii_digit()
        && bytes[1].is_ascii_digit()
        && bytes[2].is_ascii_digit()
        && bytes[3].is_ascii_digit()
        && bytes[4] == b'-'
        && bytes[5].is_ascii_digit()
        && bytes[6].is_ascii_digit()
        && bytes[7] == b'-'
        && bytes[8].is_ascii_digit()
        && bytes[9].is_ascii_digit()
        && bytes[10] == b'T';

    // HH:MM:SS
    let time_ok = bytes[11].is_ascii_digit()
        && bytes[12].is_ascii_digit()
        && bytes[13] == b':'
        && bytes[14].is_ascii_digit()
        && bytes[15].is_ascii_digit()
        && bytes[16] == b':'
        && bytes[17].is_ascii_digit()
        && bytes[18].is_ascii_digit();

    date_ok && time_ok
}

/// Validates a canonical 36-character UUID literal.
fn is_uuid(value: &str) -> bool {
    value.len() == 36
        && value.chars().enumerate().all(|(index, ch)| match index {
            8 | 13 | 18 | 23 => ch == '-',
            _ => ch.is_ascii_hexdigit(),
        })
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
