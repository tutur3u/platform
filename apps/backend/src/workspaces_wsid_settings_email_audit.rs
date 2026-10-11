//! Handler for `GET /api/v1/workspaces/:wsId/settings/email-audit`.
//!
//! Global audit access accepts only the ROOT workspace ID or the case-insensitive
//! `internal` alias. Verify the current actor and require ROOT
//! `view_infrastructure` before either service-role audit or stats read.
//! Missing actors return 401; missing permissions return 403; internal errors
//! return 500. App sessions must target Infrastructure.
//! Audit projection/count/25-row ordering and zero-stats fallback match the
//! live Infrastructure route. This Rust handler is a future migration target.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    infrastructure_root_auth::ROOT_WORKSPACE_ID,
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
        authorize_workspace_permission_allowing_app_sessions,
    },
};

const EMAIL_AUDIT_PATH_PREFIX: &str = "/api/v1/workspaces/";
const EMAIL_AUDIT_PATH_SUFFIX: &str = "/settings/email-audit";
const VIEW_INFRASTRUCTURE_PERMISSION: &str = "view_infrastructure";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const AUDIT_LOAD_ERROR_MESSAGE: &str = "Failed to load email audit rows";
const INTERNAL_ERROR_MESSAGE: &str = "Internal server error";
const EMAIL_STATS_RPC: &str = "get_email_stats";
const EMAIL_AUDIT_TABLE: &str = "email_audit";
const EMAIL_AUDIT_SELECT: &str = "id,subject,status,provider,template_type,source_email,created_at";
const EMAIL_AUDIT_LIMIT: &str = "25";

pub(crate) async fn handle_workspaces_wsid_settings_email_audit_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = email_audit_ws_id(request.path)?;

    Some(match request.method {
        "GET" => email_audit_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn email_audit_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if raw_ws_id != ROOT_WORKSPACE_ID && !raw_ws_id.eq_ignore_ascii_case("internal") {
        return message_response(403, FORBIDDEN_MESSAGE);
    }

    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return message_response(500, INTERNAL_ERROR_MESSAGE);
    }

    let authorization = if contact::request_has_app_session_token(request) {
        match contact::resolve_app_session_identity(config, request, &["infra"]) {
            Ok(identity) if !identity.id.trim().is_empty() => {}
            _ => return message_response(401, UNAUTHORIZED_MESSAGE),
        }
        authorize_workspace_permission_allowing_app_sessions(
            config,
            request,
            ROOT_WORKSPACE_ID,
            VIEW_INFRASTRUCTURE_PERMISSION,
            outbound,
        )
        .await
    } else {
        authorize_workspace_permission(
            contact_data,
            request,
            ROOT_WORKSPACE_ID,
            VIEW_INFRASTRUCTURE_PERMISSION,
            outbound,
        )
        .await
    };
    let ws_id = match authorization {
        Ok(authorization) => authorization.ws_id,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return message_response(401, UNAUTHORIZED_MESSAGE);
        }
        Err(
            WorkspacePermissionAuthorizationError::Forbidden
            | WorkspacePermissionAuthorizationError::NotFound,
        ) => return message_response(403, FORBIDDEN_MESSAGE),
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, INTERNAL_ERROR_MESSAGE);
        }
    };

    // Stats: legacy logs and falls back to zeros on RPC error (request still 200).
    let stats_rows = fetch_email_stats(contact_data, outbound, &ws_id)
        .await
        .unwrap_or_default();
    let stats = stats_from_rows(stats_rows.first());

    // Audit rows: legacy returns 500 on read error.
    let (count, data) = match fetch_email_audit(contact_data, outbound).await {
        Ok(result) => result,
        Err(()) => return message_response(500, AUDIT_LOAD_ERROR_MESSAGE),
    };

    no_store_response(json_response(
        200,
        json!({
            "count": count,
            "data": data,
            "stats": stats,
        }),
    ))
}

async fn fetch_email_stats(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<Value>, ()> {
    let url = contact_data.rpc_url(EMAIL_STATS_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");
    // Legacy passes `start_date`/`end_date` as undefined and `filter_ws_id = wsId`.
    let body = json!({
        "end_date": null,
        "filter_ws_id": ws_id,
        "start_date": null,
    })
    .to_string();

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    match response.json::<Value>().map_err(|_| ())? {
        Value::Array(rows) => Ok(rows),
        Value::Null => Ok(Vec::new()),
        other => Ok(vec![other]),
    }
}

async fn fetch_email_audit(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<(i64, Value), ()> {
    // Mirror the legacy query: no `ws_id` filter, newest first, limit 25, exact
    // total count requested via the `Prefer: count=exact` header (PostgREST
    // returns the total in the `Content-Range` response header).
    let url = contact_data
        .rest_url(
            EMAIL_AUDIT_TABLE,
            &[
                ("select", EMAIL_AUDIT_SELECT.to_owned()),
                ("order", "created_at.desc".to_owned()),
                ("limit", EMAIL_AUDIT_LIMIT.to_owned()),
            ],
        )
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key)
                .with_header("Prefer", "count=exact"),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // `OutboundResponse::header` matches case-insensitively.
    let count = parse_content_range_total(response.header("content-range"));
    let data = match response.json::<Value>().map_err(|_| ())? {
        Value::Array(rows) => Value::Array(rows),
        Value::Null => Value::Array(Vec::new()),
        other => Value::Array(vec![other]),
    };

    Ok((count, data))
}

// --- Pure helpers ---

fn email_audit_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(EMAIL_AUDIT_PATH_PREFIX)?
        .strip_suffix(EMAIL_AUDIT_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

/// Parse the PostgREST `Content-Range` total (`"0-24/123"` -> `123`).
/// Falls back to `0` for `"*"` totals or unparsable headers, matching the
/// legacy `auditResult.count ?? 0` fallback.
fn parse_content_range_total(header: Option<&str>) -> i64 {
    header
        .and_then(|value| value.rsplit('/').next())
        .and_then(|total| total.trim().parse::<i64>().ok())
        .unwrap_or(0)
}

/// Coerce a JSON value to an integer count, mirroring the legacy
/// `Number(value || 0)` semantics for the stats fields.
fn coerce_count(value: Option<&Value>) -> i64 {
    match value {
        Some(Value::Number(number)) => number
            .as_i64()
            .or_else(|| number.as_f64().map(|float| float as i64))
            .unwrap_or(0),
        Some(Value::String(text)) => text
            .trim()
            .parse::<f64>()
            .map(|float| float as i64)
            .unwrap_or(0),
        _ => 0,
    }
}

/// Build the `stats` object from the first RPC row, matching the legacy field
/// mapping (`sent_count` -> `sent`, etc.).
fn stats_from_rows(row: Option<&Value>) -> Value {
    json!({
        "failed": coerce_count(row.and_then(|row| row.get("failed_count"))),
        "rateLimited": coerce_count(row.and_then(|row| row.get("rate_limited_count"))),
        "sent": coerce_count(row.and_then(|row| row.get("sent_count"))),
        "total": coerce_count(row.and_then(|row| row.get("total_count"))),
    })
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_ws_id_from_matching_path() {
        assert_eq!(
            email_audit_ws_id("/api/v1/workspaces/abc/settings/email-audit"),
            Some("abc")
        );
    }

    #[test]
    fn rejects_non_matching_paths() {
        assert_eq!(
            email_audit_ws_id("/api/workspaces/abc/settings/email-audit"),
            None
        );
        assert_eq!(
            email_audit_ws_id("/api/v1/workspaces/abc/settings/other"),
            None
        );
        assert_eq!(
            email_audit_ws_id("/api/v1/workspaces//settings/email-audit"),
            None
        );
        assert_eq!(
            email_audit_ws_id("/api/v1/workspaces/abc/extra/settings/email-audit"),
            None
        );
    }

    #[test]
    fn parses_content_range_total() {
        assert_eq!(parse_content_range_total(Some("0-24/123")), 123);
        assert_eq!(parse_content_range_total(Some("*/57")), 57);
        assert_eq!(parse_content_range_total(Some("0-24/*")), 0);
        assert_eq!(parse_content_range_total(None), 0);
        assert_eq!(parse_content_range_total(Some("garbage")), 0);
    }

    #[test]
    fn coerces_counts_from_numbers_and_strings() {
        assert_eq!(coerce_count(Some(&json!(42))), 42);
        assert_eq!(coerce_count(Some(&json!("17"))), 17);
        assert_eq!(coerce_count(Some(&json!(null))), 0);
        assert_eq!(coerce_count(None), 0);
        assert_eq!(coerce_count(Some(&json!("nan"))), 0);
    }

    #[test]
    fn builds_stats_with_legacy_field_mapping() {
        let row = json!({
            "failed_count": 1,
            "rate_limited_count": "2",
            "sent_count": 3,
            "total_count": 6,
        });
        assert_eq!(
            stats_from_rows(Some(&row)),
            json!({ "failed": 1, "rateLimited": 2, "sent": 3, "total": 6 })
        );
    }

    #[test]
    fn builds_zeroed_stats_when_row_missing() {
        assert_eq!(
            stats_from_rows(None),
            json!({ "failed": 0, "rateLimited": 0, "sent": 0, "total": 0 })
        );
    }
}
