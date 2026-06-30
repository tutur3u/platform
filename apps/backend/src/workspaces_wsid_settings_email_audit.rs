//! Handler for `GET /api/v1/workspaces/:wsId/settings/email-audit`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/settings/email-audit/route.ts`.
//!
//! Legacy behavior:
//!   1. Resolves workspace permissions via `getPermissions({ wsId })` and requires
//!      the `view_infrastructure` permission; otherwise returns
//!      `403 { "message": "Forbidden" }`.
//!   2. Reads aggregate email stats through the `get_email_stats` RPC
//!      (`filter_ws_id = wsId`, `start_date`/`end_date` undefined). On RPC error
//!      the legacy route logs and falls back to all-zero stats (it does NOT fail
//!      the request), so this handler mirrors that fallback.
//!   3. Reads the latest 25 `email_audit` rows ordered by `created_at` desc with
//!      an exact total count, selecting
//!      `id, subject, status, provider, template_type, source_email, created_at`.
//!      NOTE: the legacy query does NOT scope `email_audit` by `ws_id` — it is a
//!      global infrastructure read gated solely by the `view_infrastructure`
//!      permission (a root-workspace permission). This handler preserves that
//!      (unscoped) behavior verbatim.
//!   4. On `email_audit` read failure returns
//!      `500 { "message": "Failed to load email audit rows" }`.
//!   5. On success returns `200 { count, data, stats }`.
//!
//! Both reads use the admin (service-role) client in the legacy route, so RLS is
//! bypassed; this handler reads with the service-role key to match.
//!
//! BEHAVIOR GAP: the legacy permission gate returns `403 { "message": "Forbidden" }`
//! only for the missing-permission case; an unauthenticated caller surfaces as a
//! thrown error in `getPermissions`. To stay faithful to the single explicit
//! status the route documents, every authorization failure here
//! (`Unauthorized | Forbidden | NotFound`) maps to `403 { "message": "Forbidden" }`,
//! and configuration/upstream failures map to `500`.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const EMAIL_AUDIT_PATH_PREFIX: &str = "/api/v1/workspaces/";
const EMAIL_AUDIT_PATH_SUFFIX: &str = "/settings/email-audit";
const VIEW_INFRASTRUCTURE_PERMISSION: &str = "view_infrastructure";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
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
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return message_response(500, INTERNAL_ERROR_MESSAGE);
    }

    let ws_id = match authorize_workspace_permission(
        contact_data,
        request,
        raw_ws_id,
        VIEW_INFRASTRUCTURE_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization.ws_id,
        Err(
            WorkspacePermissionAuthorizationError::Unauthorized
            | WorkspacePermissionAuthorizationError::Forbidden
            | WorkspacePermissionAuthorizationError::NotFound,
        ) => {
            return message_response(403, FORBIDDEN_MESSAGE);
        }
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
