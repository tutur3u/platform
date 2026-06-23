use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const PRIVATE_SCHEMA: &str = "private";
const REPORT_LOGS_PERMISSION: &str = "view_user_groups_reports";
const REPORT_LOGS_VIEW: &str = "external_user_monthly_report_logs_workspace_view";

/// Matches `/api/v1/workspaces/:wsId/users/reports/:reportId/logs`.
///
/// Returns `(raw_ws_id, report_id)` when the path shape matches this route.
fn report_logs_segments(path: &str) -> Option<(&str, &str)> {
    let segments = path_segments(path);

    if segments.len() == 8
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && !segments[3].is_empty()
        && segments[4] == "users"
        && segments[5] == "reports"
        && !segments[6].is_empty()
        && segments[7] == "logs"
    {
        Some((segments[3], segments[6]))
    } else {
        None
    }
}

fn path_segments(path: &str) -> Vec<&str> {
    path.trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect()
}

pub(crate) async fn handle_workspaces_users_reports_logs_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, report_id) = report_logs_segments(request.path)?;

    Some(match request.method {
        "GET" => report_logs_response(config, request, raw_ws_id, report_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn report_logs_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    report_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let authorization = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        REPORT_LOGS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(error) => return report_logs_authorization_error_response(error),
    };

    match fetch_report_logs(
        &config.contact_data,
        outbound,
        &authorization.ws_id,
        report_id,
    )
    .await
    {
        Ok(logs) => no_store_response(json_response(200, Value::Array(logs))),
        Err(()) => no_store_response(json_response(
            500,
            json!({ "message": "Error fetching report logs" }),
        )),
    }
}

/// Legacy `getPermissions` returns `null` (→ 404 `{ "error": "Not found" }`) when
/// the caller has no valid session or no access to the workspace, and a 403
/// `{ "message": "Unauthorized" }` when the permission is missing.
fn report_logs_authorization_error_response(
    error: WorkspacePermissionAuthorizationError,
) -> BackendResponse {
    match error {
        WorkspacePermissionAuthorizationError::Unauthorized
        | WorkspacePermissionAuthorizationError::NotFound => {
            no_store_response(json_response(404, json!({ "error": "Not found" })))
        }
        WorkspacePermissionAuthorizationError::Forbidden => {
            no_store_response(json_response(403, json!({ "message": "Unauthorized" })))
        }
        WorkspacePermissionAuthorizationError::Internal => no_store_response(json_response(
            500,
            json!({ "message": "Failed to verify workspace access" }),
        )),
    }
}

async fn fetch_report_logs(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    report_id: &str,
) -> Result<Vec<Value>, ()> {
    let url = contact_data
        .rest_url(
            REPORT_LOGS_VIEW,
            &[
                ("select", "*".to_owned()),
                ("report_id", format!("eq.{report_id}")),
                ("user_ws_id", format!("eq.{ws_id}")),
                ("order", "created_at.desc".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_private_service_role_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;

    Ok(rows.into_iter().map(map_report_log).collect())
}

/// Mirrors the legacy mapping that exposes a `creator_name` derived from the
/// creator's display name (falling back to the full name).
fn map_report_log(row: Value) -> Value {
    let Value::Object(mut row) = row else {
        return row;
    };

    let creator_name = row
        .get("creator_display_name")
        .and_then(non_empty_string)
        .or_else(|| row.get("creator_full_name").and_then(non_empty_string))
        .map(Value::String)
        .unwrap_or(Value::Null);

    row.insert("creator_name".to_owned(), creator_name);
    Value::Object(row)
}

fn non_empty_string(value: &Value) -> Option<String> {
    value
        .as_str()
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
}

async fn send_private_service_role_request(
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
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}
