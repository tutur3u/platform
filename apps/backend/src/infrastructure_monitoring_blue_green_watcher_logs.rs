use serde_json::json;

use crate::{
    BackendConfig, BackendRequest, BackendResponse,
    infrastructure_root_auth::{RootWorkspaceReadAuthError, authorize_root_workspace_read},
    json_response, method_not_allowed, no_store_response,
    outbound::OutboundHttpClient,
};

pub(crate) const WATCHER_LOGS_PATH: &str =
    "/api/v1/infrastructure/monitoring/blue-green/watcher-logs";

const DEFAULT_PAGE: usize = 1;
const DEFAULT_PAGE_SIZE: usize = 25;
#[cfg(feature = "native")]
const MAX_PAGE_SIZE: usize = 100;
#[cfg_attr(feature = "native", allow(dead_code))]
const ARCHIVE_ERROR_MESSAGE: &str = "Failed to load blue-green monitoring watcher log archive";

pub(crate) async fn handle_infrastructure_monitoring_blue_green_watcher_logs_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != WATCHER_LOGS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => watcher_logs_response(config, request, outbound).await,
        method => method_not_allowed(method, "GET"),
    })
}

async fn watcher_logs_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    match authorize_root_workspace_read(config, request, outbound).await {
        Ok(_) => {}
        Err(RootWorkspaceReadAuthError::Unauthorized) => {
            return no_store_response(json_response(401, json!({ "message": "Unauthorized" })));
        }
        Err(RootWorkspaceReadAuthError::Forbidden) => {
            return no_store_response(json_response(403, json!({ "message": "Forbidden" })));
        }
    }

    let query = WatcherLogsQuery::from_url(request.url);
    watcher_logs_archive_response(&query)
}

#[cfg(feature = "native")]
fn watcher_logs_archive_response(query: &WatcherLogsQuery) -> BackendResponse {
    let archive = read_watcher_log_archive(query.page, query.page_size);
    no_store_response(json_response(200, archive))
}

#[cfg(not(feature = "native"))]
fn watcher_logs_archive_response(_query: &WatcherLogsQuery) -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": ARCHIVE_ERROR_MESSAGE }),
    ))
}

/// Replicates `readBlueGreenMonitoringWatcherLogArchive` from
/// `apps/web/src/lib/infrastructure/blue-green-monitoring.ts`.
#[cfg(feature = "native")]
fn read_watcher_log_archive(page: usize, page_size: usize) -> serde_json::Value {
    use serde_json::Value;

    let normalized_page_size = clamp_archive_page_size(page_size);
    let all_logs = read_normalized_watcher_logs();
    let total = all_logs.len();
    let archive_page = get_archive_page(page, total, normalized_page_size);
    let end = (archive_page.offset + normalized_page_size).min(total);
    let items: Vec<Value> = all_logs
        .get(archive_page.offset..end)
        .map(<[Value]>::to_vec)
        .unwrap_or_default();

    create_archive_response(items, archive_page.page, normalized_page_size, total)
}

#[cfg(feature = "native")]
struct ArchivePage {
    offset: usize,
    page: usize,
    page_count: usize,
}

/// Replicates `getArchivePage`.
#[cfg(feature = "native")]
fn get_archive_page(page: usize, total: usize, page_size: usize) -> ArchivePage {
    let requested_page = page.max(1);
    let page_count = total.div_ceil(page_size).max(1);
    let resolved_page = requested_page.min(page_count);

    ArchivePage {
        offset: (resolved_page - 1) * page_size,
        page: resolved_page,
        page_count,
    }
}

/// Replicates `clampArchivePageSize` (default 25, capped at 100).
#[cfg(feature = "native")]
fn clamp_archive_page_size(page_size: usize) -> usize {
    let parsed = if page_size > 0 {
        page_size
    } else {
        DEFAULT_PAGE_SIZE
    };
    parsed.min(MAX_PAGE_SIZE)
}

/// Replicates `createArchiveResponse` for watcher logs.
#[cfg(feature = "native")]
fn create_archive_response(
    items: Vec<serde_json::Value>,
    page: usize,
    page_size: usize,
    total: usize,
) -> serde_json::Value {
    use serde_json::Value;

    let page_count = total.div_ceil(page_size).max(1);
    let newest_at = items
        .first()
        .and_then(|item| item.get("time").cloned())
        .unwrap_or(Value::Null);
    let oldest_at = items
        .last()
        .and_then(|item| item.get("time").cloned())
        .unwrap_or(Value::Null);

    json!({
        "hasNextPage": page < page_count,
        "hasPreviousPage": page > 1,
        "items": items,
        "limit": page_size,
        "offset": (page - 1) * page_size,
        "page": page,
        "pageCount": page_count,
        "total": total,
        "window": {
            "newestAt": newest_at,
            "oldestAt": oldest_at,
        },
    })
}

/// Replicates `resolveMonitoringDir` + `readNormalizedWatcherLogs`, reading
/// `<monitoringDir>/watch/blue-green-auto-deploy.logs.json`.
#[cfg(feature = "native")]
fn read_normalized_watcher_logs() -> Vec<serde_json::Value> {
    use serde_json::Value;

    let Some(monitoring_dir) = resolve_monitoring_dir() else {
        return Vec::new();
    };
    let logs_path = monitoring_dir
        .join("watch")
        .join("blue-green-auto-deploy.logs.json");

    let raw_entries: Vec<Value> = std::fs::read_to_string(&logs_path)
        .ok()
        .and_then(|content| serde_json::from_str::<Value>(&content).ok())
        .and_then(|value| value.as_array().cloned())
        .unwrap_or_default();

    normalize_watcher_logs(&raw_entries)
}

/// Replicates `resolveMonitoringDir`.
#[cfg(feature = "native")]
fn resolve_monitoring_dir() -> Option<std::path::PathBuf> {
    let configured = std::env::var("PLATFORM_BLUE_GREEN_MONITORING_DIR")
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .map(std::path::PathBuf::from);

    let cwd = std::env::current_dir().ok()?;
    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    if let Some(configured) = configured {
        candidates.push(configured);
    }
    candidates.push(cwd.join("tmp").join("docker-web"));
    candidates.push(cwd.join("..").join("tmp").join("docker-web"));
    candidates.push(cwd.join("..").join("..").join("tmp").join("docker-web"));

    Some(
        candidates
            .iter()
            .find(|candidate| candidate.exists())
            .cloned()
            .unwrap_or_else(|| {
                candidates
                    .into_iter()
                    .next()
                    .unwrap_or_else(|| cwd.join("tmp").join("docker-web"))
            }),
    )
}

/// Replicates `normalizeWatcherLogs`: keeps only entries with a finite `time`,
/// a string `message`, and a string `level`, then projects the watcher-log
/// fields in the legacy shape.
#[cfg(feature = "native")]
fn normalize_watcher_logs(entries: &[serde_json::Value]) -> Vec<serde_json::Value> {
    use serde_json::Value;

    entries
        .iter()
        .filter_map(|entry| {
            let record = entry.as_object()?;

            let time = record
                .get("time")
                .and_then(Value::as_f64)
                .filter(|value| value.is_finite())?;
            let message = record.get("message").and_then(Value::as_str)?;
            let level = record.get("level").and_then(Value::as_str)?;

            let string_or_null = |key: &str| -> Value {
                record
                    .get(key)
                    .and_then(Value::as_str)
                    .map_or(Value::Null, |value| Value::String(value.to_owned()))
            };

            let mut out = serde_json::Map::new();
            out.insert("activeColor".to_owned(), string_or_null("activeColor"));
            out.insert("commitHash".to_owned(), string_or_null("commitHash"));
            out.insert(
                "commitShortHash".to_owned(),
                string_or_null("commitShortHash"),
            );
            out.insert("deploymentKey".to_owned(), string_or_null("deploymentKey"));
            out.insert(
                "deploymentKind".to_owned(),
                string_or_null("deploymentKind"),
            );
            out.insert(
                "deploymentStamp".to_owned(),
                string_or_null("deploymentStamp"),
            );
            out.insert(
                "deploymentStatus".to_owned(),
                string_or_null("deploymentStatus"),
            );
            out.insert("eventId".to_owned(), string_or_null("eventId"));
            out.insert("eventType".to_owned(), string_or_null("eventType"));
            out.insert("incidentId".to_owned(), string_or_null("incidentId"));
            out.insert("level".to_owned(), Value::String(level.to_owned()));

            // `metadata` is only emitted when it is a plain object.
            if let Some(metadata) = record.get("metadata").filter(|value| value.is_object()) {
                out.insert("metadata".to_owned(), metadata.clone());
            }

            out.insert("message".to_owned(), Value::String(message.to_owned()));
            out.insert(
                "time".to_owned(),
                serde_json::Number::from_f64(time).map_or(Value::Null, Value::Number),
            );

            Some(Value::Object(out))
        })
        .collect()
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct WatcherLogsQuery {
    page: usize,
    page_size: usize,
}

impl WatcherLogsQuery {
    fn from_url(request_url: Option<&str>) -> Self {
        let mut query = Self {
            page: DEFAULT_PAGE,
            page_size: DEFAULT_PAGE_SIZE,
        };

        let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok())
        else {
            return query;
        };

        let mut saw_page = false;
        let mut saw_page_size = false;

        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "page" if !saw_page => {
                    query.page = parse_positive_int(value.as_ref(), DEFAULT_PAGE);
                    saw_page = true;
                }
                "pageSize" if !saw_page_size => {
                    query.page_size = parse_positive_int(value.as_ref(), DEFAULT_PAGE_SIZE);
                    saw_page_size = true;
                }
                _ => {}
            }
        }

        query
    }
}

/// Replicates the route-level `parsePositiveInt`.
fn parse_positive_int(value: &str, fallback: usize) -> usize {
    if value.is_empty() {
        return fallback;
    }

    match value.parse::<i64>() {
        Ok(parsed) if parsed > 0 => parsed as usize,
        _ => fallback,
    }
}
