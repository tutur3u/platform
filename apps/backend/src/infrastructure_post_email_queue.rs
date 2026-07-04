use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    infrastructure_root_auth::{RootWorkspaceReadAuthError, authorize_root_workspace_read},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

pub(crate) const POST_EMAIL_QUEUE_PATH: &str = "/api/v1/infrastructure/post-email-queue";

const ERROR_MESSAGE: &str = "Error fetching post email queue";
const POST_EMAIL_QUEUE_TABLE: &str = "post_email_queue";

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq)]
struct QueueStatusRow {
    status: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq)]
struct QueueWorkspaceRow {
    status: Option<String>,
    ws_id: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq)]
struct QueueBatchRow {
    batch_id: Option<String>,
    last_attempt_at: Option<String>,
    status: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, Eq, PartialEq)]
struct QueueSummary {
    queued: usize,
    processing: usize,
    sent: usize,
    failed: usize,
    blocked: usize,
    cancelled: usize,
    total: usize,
}

#[derive(Clone, Debug, Serialize, Eq, PartialEq)]
struct WorkspaceSummary {
    ws_id: String,
    queued: usize,
    processing: usize,
    sent: usize,
    failed: usize,
    blocked: usize,
    cancelled: usize,
    total: usize,
}

#[derive(Clone, Debug, Serialize, Eq, PartialEq)]
struct BatchSummary {
    batch_id: String,
    claimed: usize,
    sent: usize,
    failed: usize,
    last_attempt_at: Option<String>,
}

pub(crate) async fn handle_post_email_queue_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != POST_EMAIL_QUEUE_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => post_email_queue_response(config, request, outbound).await,
        method => method_not_allowed(method, "GET"),
    })
}

async fn post_email_queue_response(
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

    let summary_rows = match fetch_post_email_queue_rows::<QueueStatusRow>(
        &config.contact_data,
        outbound,
        &[("select", "status".to_owned())],
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return post_email_queue_error_response(),
    };
    let workspace_rows = fetch_post_email_queue_rows::<QueueWorkspaceRow>(
        &config.contact_data,
        outbound,
        &[
            ("select", "ws_id,status".to_owned()),
            ("order", "created_at.desc".to_owned()),
        ],
    )
    .await
    .unwrap_or_default();
    let batch_rows = fetch_post_email_queue_rows::<QueueBatchRow>(
        &config.contact_data,
        outbound,
        &[
            (
                "select",
                "batch_id,status,last_attempt_at,created_at".to_owned(),
            ),
            ("batch_id", "not.is.null".to_owned()),
            ("order", "last_attempt_at.desc".to_owned()),
            ("limit", "100".to_owned()),
        ],
    )
    .await
    .unwrap_or_default();

    no_store_response(json_response(
        200,
        json!({
            "summary": summarize_queue_statuses(&summary_rows),
            "byWorkspace": summarize_by_workspace(&workspace_rows),
            "recentBatches": summarize_recent_batches(&batch_rows),
        }),
    ))
}

async fn fetch_post_email_queue_rows<T: for<'de> Deserialize<'de>>(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    params: &[(&str, String)],
) -> Result<Vec<T>, ()> {
    let Some(url) = contact_data.rest_url(POST_EMAIL_QUEUE_TABLE, params) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<T>>().map_err(|_| ())
}

async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
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

fn summarize_queue_statuses(rows: &[QueueStatusRow]) -> QueueSummary {
    let mut summary = QueueSummary {
        total: rows.len(),
        ..QueueSummary::default()
    };

    for row in rows {
        increment_status(&mut summary, row.status.as_deref());
    }

    summary
}

fn summarize_by_workspace(rows: &[QueueWorkspaceRow]) -> Vec<WorkspaceSummary> {
    let mut summaries: Vec<WorkspaceSummary> = Vec::new();

    for row in rows {
        let Some(ws_id) = row
            .ws_id
            .as_deref()
            .filter(|ws_id| !ws_id.trim().is_empty())
        else {
            continue;
        };
        let index = match summaries.iter().position(|summary| summary.ws_id == ws_id) {
            Some(index) => index,
            None => {
                summaries.push(WorkspaceSummary {
                    ws_id: ws_id.to_owned(),
                    queued: 0,
                    processing: 0,
                    sent: 0,
                    failed: 0,
                    blocked: 0,
                    cancelled: 0,
                    total: 0,
                });
                summaries.len() - 1
            }
        };
        let summary = &mut summaries[index];
        summary.total += 1;
        increment_workspace_status(summary, row.status.as_deref());
    }

    summaries.sort_by(|left, right| {
        let left_active = left.queued + left.processing;
        let right_active = right.queued + right.processing;

        right_active.cmp(&left_active)
    });
    summaries.truncate(20);

    summaries
}

fn summarize_recent_batches(rows: &[QueueBatchRow]) -> Vec<BatchSummary> {
    let mut summaries: Vec<BatchSummary> = Vec::new();

    for row in rows {
        let Some(batch_id) = row
            .batch_id
            .as_deref()
            .filter(|batch_id| !batch_id.trim().is_empty())
        else {
            continue;
        };
        let index = match summaries
            .iter()
            .position(|summary| summary.batch_id == batch_id)
        {
            Some(index) => index,
            None => {
                summaries.push(BatchSummary {
                    batch_id: batch_id.to_owned(),
                    claimed: 0,
                    sent: 0,
                    failed: 0,
                    last_attempt_at: row.last_attempt_at.clone(),
                });
                summaries.len() - 1
            }
        };
        let summary = &mut summaries[index];
        summary.claimed += 1;
        match row.status.as_deref() {
            Some("sent") => summary.sent += 1,
            Some("failed") => summary.failed += 1,
            _ => {}
        }
    }

    summaries.sort_by(|left, right| {
        right
            .last_attempt_at
            .as_deref()
            .unwrap_or("")
            .cmp(left.last_attempt_at.as_deref().unwrap_or(""))
    });
    summaries.truncate(10);

    summaries
}

fn increment_status(summary: &mut QueueSummary, status: Option<&str>) {
    match status {
        Some("queued") => summary.queued += 1,
        Some("processing") => summary.processing += 1,
        Some("sent") => summary.sent += 1,
        Some("failed") => summary.failed += 1,
        Some("blocked") => summary.blocked += 1,
        Some("cancelled") => summary.cancelled += 1,
        _ => {}
    }
}

fn increment_workspace_status(summary: &mut WorkspaceSummary, status: Option<&str>) {
    match status {
        Some("queued") => summary.queued += 1,
        Some("processing") => summary.processing += 1,
        Some("sent") => summary.sent += 1,
        Some("failed") => summary.failed += 1,
        Some("blocked") => summary.blocked += 1,
        Some("cancelled") => summary.cancelled += 1,
        _ => {}
    }
}

fn post_email_queue_error_response() -> BackendResponse {
    no_store_response(json_response(500, json!({ "message": ERROR_MESSAGE })))
}
