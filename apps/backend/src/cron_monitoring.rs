use serde_json::{Map, Value, json};

const DEFAULT_CRON_STATUS_STALE_MS: i64 = 120_000;
const DEFAULT_PAGE: usize = 1;
const DEFAULT_PAGE_SIZE: usize = 25;
const MAX_PAGE_SIZE: usize = 100;
const MAX_RUNS: usize = 25;

#[cfg(feature = "native")]
use std::{
    fs,
    path::{Path, PathBuf},
};

#[cfg(feature = "native")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CronMonitoringPaths {
    pub config_file: PathBuf,
    pub control_dir: PathBuf,
    pub control_file: PathBuf,
    pub execution_dir: PathBuf,
    pub run_requests_dir: PathBuf,
    pub runtime_dir: PathBuf,
    pub status_file: PathBuf,
}

#[cfg(feature = "native")]
impl CronMonitoringPaths {
    pub fn new(
        config_file: impl Into<PathBuf>,
        runtime_dir: impl Into<PathBuf>,
        control_dir: impl Into<PathBuf>,
    ) -> Self {
        let runtime_dir = runtime_dir.into();
        let control_dir = control_dir.into();

        Self {
            config_file: config_file.into(),
            control_file: control_dir.join("cron-control.json"),
            execution_dir: runtime_dir.join("executions"),
            run_requests_dir: control_dir.join("cron-run-requests"),
            status_file: runtime_dir.join("status.json"),
            runtime_dir,
            control_dir,
        }
    }
}

#[cfg(feature = "native")]
pub fn read_cron_monitoring_snapshot(paths: &CronMonitoringPaths, now_ms: i64) -> Value {
    let config_jobs = read_cron_config_jobs(paths);
    let persisted_status = read_json_object(&paths.status_file);
    let executions = read_execution_records(paths);
    let control = read_control(paths);
    let persisted_jobs = array_field(&persisted_status, "jobs");

    let jobs = config_jobs
        .into_iter()
        .map(|job| {
            let id = string_field(&job, "id").map(str::to_owned);
            merge_object(job, matching_job(&persisted_jobs, id.as_deref()))
        })
        .map(|job| effective_job(job, &control))
        .collect::<Vec<_>>();

    let persisted_runs = array_field(&persisted_status, "runs");
    let runs = merge_cron_run_records(
        read_queued_run_requests(&jobs, paths, now_ms)
            .into_iter()
            .chain(persisted_runs)
            .collect(),
    );
    let last_execution = executions
        .first()
        .cloned()
        .or_else(|| persisted_status.get("lastExecution").cloned())
        .unwrap_or(Value::Null);
    let failed_executions = executions
        .iter()
        .filter(|execution| string_field(execution, "status") != Some("success"))
        .count();
    let failed_jobs = jobs
        .iter()
        .filter(|job| number_field(job, "failureStreak").unwrap_or(0) > 0)
        .count();
    let next_run_at = jobs
        .iter()
        .filter_map(|job| number_field(job, "nextRunAt"))
        .min()
        .map(Value::from)
        .unwrap_or(Value::Null);
    let updated_at = persisted_status
        .get("updatedAt")
        .and_then(Value::as_i64)
        .map(Value::from)
        .unwrap_or(Value::Null);

    json!({
        "control": control,
        "enabled": control.get("enabled").cloned().unwrap_or(Value::Bool(true)),
        "jobs": jobs,
        "lastExecution": last_execution,
        "nextRunAt": next_run_at,
        "overview": {
            "enabledJobs": jobs.iter().filter(|job| job.get("enabled").and_then(Value::as_bool).unwrap_or(false)).count(),
            "failedExecutions": failed_executions,
            "failedJobs": failed_jobs,
            "processingRuns": runs.iter().filter(|run| string_field(run, "status") == Some("processing")).count(),
            "queuedRuns": runs.iter().filter(|run| string_field(run, "status") == Some("queued")).count(),
            "retainedExecutions": executions.len(),
            "totalJobs": jobs.len(),
        },
        "retainedExecutionCount": executions.len(),
        "runs": runs,
        "source": {
            "configAvailable": paths.config_file.exists(),
            "controlAvailable": paths.control_file.exists(),
            "runtimeDirAvailable": paths.runtime_dir.exists(),
            "statusAvailable": paths.status_file.exists(),
        },
        "status": normalize_status_health(updated_at.as_i64(), now_ms),
        "updatedAt": updated_at,
    })
}

#[cfg(feature = "native")]
pub fn read_cron_execution_archive(
    paths: &CronMonitoringPaths,
    job_id: Option<&str>,
    page: Option<usize>,
    page_size: Option<usize>,
) -> Value {
    cron_execution_archive(read_execution_records(paths), job_id, page, page_size)
}

pub fn parse_optional_positive_int(value: Option<&str>, fallback: usize) -> usize {
    let Some(value) = value else {
        return fallback;
    };
    let trimmed = value.trim_start();
    if trimmed.is_empty() || trimmed.starts_with('-') {
        return fallback;
    }

    let digits = trimmed
        .strip_prefix('+')
        .unwrap_or(trimmed)
        .chars()
        .take_while(char::is_ascii_digit)
        .collect::<String>();
    digits
        .parse::<usize>()
        .ok()
        .filter(|value| *value > 0)
        .unwrap_or(fallback)
}

fn cron_execution_archive(
    executions: Vec<Value>,
    job_id: Option<&str>,
    page: Option<usize>,
    page_size: Option<usize>,
) -> Value {
    let bounded_page = positive_or(page, DEFAULT_PAGE);
    let bounded_page_size = positive_or(page_size, DEFAULT_PAGE_SIZE).min(MAX_PAGE_SIZE);
    let executions = executions
        .into_iter()
        .filter(|execution| {
            job_id.is_none_or(|job_id| string_field(execution, "jobId") == Some(job_id))
        })
        .collect::<Vec<_>>();
    let offset = (bounded_page - 1) * bounded_page_size;
    let page_count = executions.len().div_ceil(bounded_page_size).max(1);
    let items = executions
        .iter()
        .skip(offset)
        .take(bounded_page_size)
        .cloned()
        .collect::<Vec<_>>();

    json!({
        "hasNextPage": bounded_page < page_count,
        "hasPreviousPage": bounded_page > 1,
        "items": items,
        "limit": bounded_page_size,
        "offset": offset,
        "page": bounded_page,
        "pageCount": page_count,
        "total": executions.len(),
        "window": {
            "newestAt": executions.first().and_then(|execution| execution.get("startedAt")).cloned().unwrap_or(Value::Null),
            "oldestAt": executions.last().and_then(|execution| execution.get("startedAt")).cloned().unwrap_or(Value::Null),
        },
    })
}

fn merge_cron_run_records(runs: Vec<Value>) -> Vec<Value> {
    let mut by_id = Map::new();
    for run in runs {
        let Some(id) = string_field(&run, "id") else {
            continue;
        };
        let should_replace = by_id
            .get(id)
            .and_then(|current| number_field(current, "updatedAt"))
            .is_none_or(|updated_at| {
                number_field(&run, "updatedAt").unwrap_or(i64::MIN) >= updated_at
            });
        if should_replace {
            by_id.insert(id.to_owned(), run);
        }
    }

    let mut runs = by_id.into_values().collect::<Vec<_>>();
    runs.sort_by_key(|run| std::cmp::Reverse(number_field(run, "requestedAt").unwrap_or(i64::MIN)));
    runs.truncate(MAX_RUNS);
    runs
}

fn normalize_status_health(updated_at: Option<i64>, now_ms: i64) -> &'static str {
    match updated_at {
        None => "missing",
        Some(updated_at) if now_ms - updated_at > DEFAULT_CRON_STATUS_STALE_MS => "stale",
        Some(_) => "live",
    }
}

fn positive_or(value: Option<usize>, fallback: usize) -> usize {
    value.filter(|value| *value > 0).unwrap_or(fallback)
}

#[cfg(feature = "native")]
fn read_cron_config_jobs(paths: &CronMonitoringPaths) -> Vec<Value> {
    read_json_object(&paths.config_file)
        .get("jobs")
        .and_then(Value::as_array)
        .map(|jobs| {
            jobs.iter()
                .map(|job| {
                    let enabled = job.get("enabled").and_then(Value::as_bool).unwrap_or(true);
                    json!({
                        "configuredEnabled": enabled,
                        "controlEnabled": Value::Null,
                        "description": job.get("description").map_or_else(String::new, js_string),
                        "enabled": enabled,
                        "failureStreak": 0,
                        "id": job.get("id").map_or_else(|| "undefined".to_owned(), js_string),
                        "lastExecution": Value::Null,
                        "lastScheduledAt": Value::Null,
                        "nextRunAt": Value::Null,
                        "path": job.get("path").map_or_else(|| "undefined".to_owned(), js_string),
                        "schedule": job.get("schedule").map_or_else(|| "undefined".to_owned(), js_string),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(feature = "native")]
fn read_control(paths: &CronMonitoringPaths) -> Value {
    let mut control = default_control();
    if let (Some(base), Some(parsed)) = (
        control.as_object_mut(),
        read_json_object(&paths.control_file).as_object(),
    ) {
        for (key, value) in parsed {
            base.insert(key.to_owned(), value.to_owned());
        }
    }
    if !control.get("jobs").is_some_and(Value::is_object) {
        control["jobs"] = json!({});
    }
    control
}

#[cfg(feature = "native")]
fn read_queued_run_requests(
    jobs: &[Value],
    paths: &CronMonitoringPaths,
    now_ms: i64,
) -> Vec<Value> {
    let Ok(entries) = fs::read_dir(&paths.run_requests_dir) else {
        return Vec::new();
    };
    let mut files = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .collect::<Vec<_>>();
    files.sort();

    files
        .into_iter()
        .filter(|path| path.extension().is_some_and(|extension| extension == "json"))
        .filter_map(|path| {
            let request = read_json_object(&path);
            let job_id = string_field(&request, "jobId")?;
            let job = jobs.iter().find(|job| string_field(job, "id") == Some(job_id))?;
            let requested_at = number_field(&request, "requestedAt").unwrap_or(now_ms);
            Some(json!({
                "consoleLogs": [],
                "description": job.get("description").cloned().unwrap_or(Value::String(String::new())),
                "durationMs": Value::Null,
                "endedAt": Value::Null,
                "error": Value::Null,
                "executionId": Value::Null,
                "httpStatus": Value::Null,
                "id": string_field(&request, "id")?,
                "jobId": job_id,
                "path": job.get("path").cloned().unwrap_or(Value::String(String::new())),
                "requestedAt": requested_at,
                "requestedBy": request.get("requestedBy").filter(|value| value.is_string()).cloned().unwrap_or(Value::Null),
                "requestedByEmail": request.get("requestedByEmail").filter(|value| value.is_string()).cloned().unwrap_or(Value::Null),
                "response": Value::Null,
                "schedule": job.get("schedule").cloned().unwrap_or(Value::String(String::new())),
                "source": "manual",
                "startedAt": Value::Null,
                "status": "queued",
                "updatedAt": requested_at,
            }))
        })
        .collect()
}

#[cfg(feature = "native")]
fn read_execution_records(paths: &CronMonitoringPaths) -> Vec<Value> {
    let Ok(entries) = fs::read_dir(&paths.execution_dir) else {
        return Vec::new();
    };
    let mut files = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .collect::<Vec<_>>();
    files.sort();

    let mut records = files
        .into_iter()
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "jsonl")
        })
        .filter_map(|path| fs::read_to_string(path).ok())
        .flat_map(|content| {
            content
                .lines()
                .filter_map(|line| serde_json::from_str::<Value>(line).ok())
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    records.sort_by_key(|record| {
        std::cmp::Reverse(number_field(record, "startedAt").unwrap_or(i64::MIN))
    });
    records
}

#[cfg(feature = "native")]
fn read_json_object(path: &Path) -> Value {
    fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str::<Value>(&content).ok())
        .filter(Value::is_object)
        .unwrap_or_else(|| json!({}))
}

fn effective_job(mut job: Value, control: &Value) -> Value {
    let id = string_field(&job, "id").unwrap_or_default();
    let control_enabled = control
        .get("jobs")
        .and_then(|jobs| jobs.get(id))
        .and_then(|job_control| job_control.get("enabled"))
        .and_then(Value::as_bool);
    let configured_enabled = job
        .get("configuredEnabled")
        .and_then(Value::as_bool)
        .unwrap_or_else(|| job.get("enabled").and_then(Value::as_bool).unwrap_or(true));
    let enabled = if control.get("enabled").and_then(Value::as_bool) == Some(false) {
        false
    } else {
        control_enabled
            .unwrap_or_else(|| job.get("enabled").and_then(Value::as_bool).unwrap_or(true))
    };

    if let Some(job) = job.as_object_mut() {
        job.insert(
            "configuredEnabled".to_owned(),
            Value::Bool(configured_enabled),
        );
        job.insert(
            "controlEnabled".to_owned(),
            control_enabled.map(Value::Bool).unwrap_or(Value::Null),
        );
        job.insert("enabled".to_owned(), Value::Bool(enabled));
    }
    job
}

fn default_control() -> Value {
    json!({
        "enabled": true,
        "jobs": {},
        "updatedAt": Value::Null,
        "updatedBy": Value::Null,
        "updatedByEmail": Value::Null,
    })
}

fn merge_object(base: Value, overlay: Option<&Value>) -> Value {
    let mut merged = base.as_object().cloned().unwrap_or_default();
    if let Some(overlay) = overlay.and_then(Value::as_object) {
        for (key, value) in overlay {
            merged.insert(key.to_owned(), value.to_owned());
        }
    }
    Value::Object(merged)
}

fn matching_job<'a>(jobs: &'a [Value], id: Option<&str>) -> Option<&'a Value> {
    jobs.iter().find(|job| string_field(job, "id") == id)
}

fn array_field(value: &Value, field: &str) -> Vec<Value> {
    value
        .get(field)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

fn string_field<'a>(value: &'a Value, field: &str) -> Option<&'a str> {
    value.get(field).and_then(Value::as_str)
}

fn number_field(value: &Value, field: &str) -> Option<i64> {
    value.get(field).and_then(Value::as_i64)
}

fn js_string(value: &Value) -> String {
    match value {
        Value::Null => "null".to_owned(),
        Value::Bool(value) => value.to_string(),
        Value::Number(value) => value.to_string(),
        Value::String(value) => value.to_owned(),
        Value::Array(_) | Value::Object(_) => "[object Object]".to_owned(),
    }
}
