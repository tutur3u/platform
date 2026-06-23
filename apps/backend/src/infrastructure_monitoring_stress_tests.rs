use std::time::{SystemTime, UNIX_EPOCH};

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    infrastructure_root_auth::{RootWorkspaceReadAuthError, authorize_root_workspace_read},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const PRIVATE_SCHEMA: &str = "private";
const STRESS_TEST_RUNS_TABLE: &str = "infrastructure_stress_test_runs";
const PATH_PREFIX: &str = "/api/v1/infrastructure/monitoring/stress-tests/";
const NOT_FOUND_MESSAGE: &str = "Stress test run not found";
const LOAD_ERROR_MESSAGE: &str = "Failed to load stress test run";

/// Mirrors the `StressRunRow` shape persisted in `private.infrastructure_stress_test_runs`.
/// `samples` are never persisted on the row (the legacy `rowToRun` always emits `samples: []`),
/// and the Cloudflare Workers runtime has no filesystem, so the runtime/sample-file branch of
/// `readStressTestRun` is unreachable here; only the persisted-DB branch is ported.
#[derive(Deserialize)]
struct StressRunRow {
    #[serde(default)]
    abort_reason: Option<String>,
    #[serde(default)]
    abort_requested_at: Option<String>,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    ended_at: Option<String>,
    #[serde(default)]
    error_message: Option<String>,
    id: String,
    #[serde(default)]
    profile: Value,
    #[serde(default)]
    queued_at: Option<String>,
    #[serde(default)]
    requested_by: Option<String>,
    #[serde(default)]
    requested_by_email: Option<String>,
    #[serde(default)]
    resource_spikes: Value,
    #[serde(default)]
    result_notes: Option<String>,
    #[serde(default)]
    started_at: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    summary: Value,
    #[serde(default)]
    target_id: Option<String>,
    #[serde(default)]
    target_label: Option<String>,
    #[serde(default)]
    target_url: Option<String>,
    #[serde(default)]
    updated_at: Option<String>,
}

pub(crate) async fn handle_infrastructure_monitoring_stress_tests_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let run_id = stress_test_run_id(request.path)?;

    Some(match request.method {
        "GET" => stress_test_run_response(config, request, run_id, outbound).await,
        method => method_not_allowed(method, "GET"),
    })
}

fn stress_test_run_id(path: &str) -> Option<&str> {
    let run_id = path.strip_prefix(PATH_PREFIX)?;
    (!run_id.is_empty() && !run_id.contains('/')).then_some(run_id)
}

async fn stress_test_run_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    run_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let access_token = match authorize_root_workspace_read(config, request, outbound).await {
        Ok(access_token) => access_token,
        Err(RootWorkspaceReadAuthError::Unauthorized) => {
            return no_store_response(json_response(401, json!({ "message": "Unauthorized" })));
        }
        Err(RootWorkspaceReadAuthError::Forbidden) => {
            return no_store_response(json_response(403, json!({ "message": "Forbidden" })));
        }
    };

    let row = match fetch_persisted_run(&config.contact_data, outbound, &access_token, run_id).await
    {
        Ok(Some(row)) => row,
        Ok(None) => {
            return no_store_response(json_response(404, json!({ "message": NOT_FOUND_MESSAGE })));
        }
        Err(()) => {
            return error_response();
        }
    };

    match row_to_run(&row) {
        Some(run) => no_store_response(json_response(200, run)),
        // `rowToRun` throws when `target_url` is not a valid URL; the legacy route catches that and
        // returns a 500 with the load-error message.
        None => error_response(),
    }
}

async fn fetch_persisted_run(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
    run_id: &str,
) -> Result<Option<StressRunRow>, ()> {
    let Some(url) = contact_data.rest_url(
        STRESS_TEST_RUNS_TABLE,
        &[
            ("select", "*".to_owned()),
            ("id", format!("eq.{run_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {access_token}");
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

    let rows = decode_rows(&response)?;
    Ok(rows.into_iter().next())
}

fn decode_rows(response: &OutboundResponse) -> Result<Vec<StressRunRow>, ()> {
    response.json::<Vec<StressRunRow>>().map_err(|_| ())
}

/// Port of `rowToRun(row)` followed by `syncRuntimeRun`/`normalizeStressTestRun` for the
/// persisted-DB path. Returns `None` when `target_url` cannot be parsed (legacy throws -> 500).
fn row_to_run(row: &StressRunRow) -> Option<Value> {
    let target_url = row.target_url.as_deref().unwrap_or_default();
    let parsed = url::Url::parse(target_url).ok()?;
    let origin = parsed.origin().ascii_serialization();
    let pathname = parsed.path().to_owned();

    let created_at = to_ms(row.created_at.as_deref()).unwrap_or_else(now_ms);
    let queued_at = to_ms(row.queued_at.as_deref()).unwrap_or_else(now_ms);
    let started_at = to_ms(row.started_at.as_deref());
    let ended_at = to_ms(row.ended_at.as_deref());
    let updated_at = to_ms(row.updated_at.as_deref()).unwrap_or_else(now_ms);

    let status = row.status.clone().unwrap_or_else(|| "queued".to_owned());

    // `normalizeStressTestRun`: keep the stored summary when it reports work
    // (`totalRequests > 0`); samples are always empty here so the recompute path produces the
    // default summary.
    let summary = if summary_total_requests(&row.summary) > 0 {
        row.summary.clone()
    } else {
        default_summary()
    };

    // `normalizeStressTestRun`: keep stored resource spikes when present; otherwise compute the
    // empty-sample spikes.
    let resource_spikes = if resource_spikes_non_empty(&row.resource_spikes) {
        row.resource_spikes.clone()
    } else {
        empty_resource_spikes(started_at)
    };

    let profile = if row.profile.is_null() {
        Value::Null
    } else {
        row.profile.clone()
    };

    Some(json!({
        "abortReason": string_or_null(row.abort_reason.as_deref()),
        "abortRequestedAt": ms_or_null(to_ms(row.abort_requested_at.as_deref())),
        "createdAt": created_at,
        "endedAt": ms_or_null(ended_at),
        "errorMessage": string_or_null(row.error_message.as_deref()),
        "id": row.id,
        "profile": profile,
        "queuedAt": queued_at,
        "requestedBy": string_or_null(row.requested_by.as_deref()),
        "requestedByEmail": string_or_null(row.requested_by_email.as_deref()),
        "resourceSpikes": resource_spikes,
        "resultNotes": string_or_null(row.result_notes.as_deref()),
        "samples": Value::Array(Vec::new()),
        "startedAt": ms_or_null(started_at),
        "status": status,
        "summary": summary,
        "target": json!({
            "baseUrl": origin,
            "defaultPath": pathname,
            "description": Value::Null,
            "id": string_or_null(row.target_id.as_deref()),
            "label": string_or_null(row.target_label.as_deref()),
        }),
        "updatedAt": updated_at,
    }))
}

fn summary_total_requests(summary: &Value) -> i64 {
    summary
        .get("totalRequests")
        .and_then(Value::as_i64)
        .unwrap_or(0)
}

fn resource_spikes_non_empty(spikes: &Value) -> bool {
    spikes.as_array().is_some_and(|spikes| !spikes.is_empty())
}

fn default_summary() -> Value {
    json!({
        "averageRequestsPerSecond": Value::Null,
        "capacityJudgement": Value::Null,
        "errorRate": Value::Null,
        "estimatedSteadyUsers": Value::Null,
        "failureMode": Value::Null,
        "latency": { "p50Ms": Value::Null, "p95Ms": Value::Null, "p99Ms": Value::Null },
        "peakRequestsPerSecond": Value::Null,
        "safeRequestsPerSecond": Value::Null,
        "saturationPoint": Value::Null,
        "totalRequests": 0,
    })
}

/// `computeStressTestResourceSpikes([], startedAt, endedAt)` with no samples: every metric has
/// null baseline/delta/peak/recovery; `timeToPeakMs` is 0 when `startedAt` is present, else null.
fn empty_resource_spikes(started_at: Option<i64>) -> Value {
    let time_to_peak = ms_or_null(started_at.map(|_| 0));
    let spike = |metric: &str, unit: &str| {
        json!({
            "baseline": Value::Null,
            "delta": Value::Null,
            "metric": metric,
            "peak": Value::Null,
            "recoveryMs": Value::Null,
            "timeToPeakMs": time_to_peak,
            "unit": unit,
        })
    };

    json!([
        spike("cpu", "percent"),
        spike("memory", "bytes"),
        spike("rx", "bytes"),
        spike("tx", "bytes"),
    ])
}

fn string_or_null(value: Option<&str>) -> Value {
    match value {
        Some(value) => Value::String(value.to_owned()),
        None => Value::Null,
    }
}

fn ms_or_null(value: Option<i64>) -> Value {
    match value {
        Some(value) => json!(value),
        None => Value::Null,
    }
}

/// Port of `toStressTestMs` for the string inputs that arrive from PostgREST: a trimmed,
/// non-empty timestamp string parsed to epoch milliseconds, else `null`.
fn to_ms(value: Option<&str>) -> Option<i64> {
    let value = value?.trim();
    if value.is_empty() {
        return None;
    }
    iso8601_to_millis(value)
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn iso8601_to_millis(value: &str) -> Option<i64> {
    let normalized = value.replace(' ', "T");
    let bytes = normalized.as_bytes();
    if bytes.len() < 19 {
        return None;
    }

    let year: i64 = normalized.get(0..4)?.parse().ok()?;
    let month: i64 = normalized.get(5..7)?.parse().ok()?;
    let day: i64 = normalized.get(8..10)?.parse().ok()?;
    let hour: i64 = normalized.get(11..13)?.parse().ok()?;
    let minute: i64 = normalized.get(14..16)?.parse().ok()?;
    let second: i64 = normalized.get(17..19)?.parse().ok()?;

    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    let tail = &normalized[19..];
    let mut millis_fraction: i64 = 0;
    if let Some(stripped) = tail.strip_prefix('.') {
        let frac_digits: String = stripped
            .chars()
            .take_while(|c| c.is_ascii_digit())
            .collect();
        let mut frac = frac_digits;
        frac.truncate(3);
        while frac.len() < 3 {
            frac.push('0');
        }
        millis_fraction = frac.parse().unwrap_or(0);
    }

    let tz_offset_seconds = parse_tz_offset(tail);

    let days = days_from_civil(year, month, day);
    let epoch_seconds = days * 86_400 + hour * 3_600 + minute * 60 + second - tz_offset_seconds;

    Some(epoch_seconds * 1_000 + millis_fraction)
}

fn parse_tz_offset(tail: &str) -> i64 {
    let tail = if let Some(stripped) = tail.strip_prefix('.') {
        let digits = stripped.chars().take_while(|c| c.is_ascii_digit()).count();
        &stripped[digits..]
    } else {
        tail
    };

    let tail = tail.trim();
    if tail.is_empty() || tail.eq_ignore_ascii_case("Z") {
        return 0;
    }

    let (sign, rest) = if let Some(rest) = tail.strip_prefix('+') {
        (1, rest)
    } else if let Some(rest) = tail.strip_prefix('-') {
        (-1, rest)
    } else {
        return 0;
    };

    let digits: String = rest.chars().filter(|c| c.is_ascii_digit()).collect();
    let (hours, minutes): (i64, i64) = match digits.len() {
        2 => (digits.parse().unwrap_or(0), 0),
        4 => (
            digits[0..2].parse().unwrap_or(0),
            digits[2..4].parse().unwrap_or(0),
        ),
        _ => (0, 0),
    };

    sign * (hours * 3_600 + minutes * 60)
}

fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let yoe = year - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn error_response() -> BackendResponse {
    no_store_response(json_response(500, json!({ "message": LOAD_ERROR_MESSAGE })))
}
