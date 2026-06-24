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
const BULK_EXPORT_PERMISSION: &str = "view_user_groups_reports";
const BULK_EXPORT_VIEW: &str = "external_user_monthly_reports_workspace_view";

/// Matches `/api/v1/workspaces/:wsId/users/reports/groups/:groupId/bulk-export`.
///
/// Returns `(raw_ws_id, group_id)` when the path shape matches this route.
fn bulk_export_segments(path: &str) -> Option<(&str, &str)> {
    let segments = path_segments(path);

    if segments.len() == 9
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && !segments[3].is_empty()
        && segments[4] == "users"
        && segments[5] == "reports"
        && segments[6] == "groups"
        && !segments[7].is_empty()
        && segments[8] == "bulk-export"
    {
        Some((segments[3], segments[7]))
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

pub(crate) async fn handle_workspaces_users_reports_groups_bulk_export_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, group_id) = bulk_export_segments(request.path)?;

    Some(match request.method {
        "GET" => bulk_export_response(config, request, raw_ws_id, group_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

/// Mirrors the legacy `SearchParamsSchema` validation: `title` is required and
/// `status` is an optional enum (`ALL` | `APPROVED`) that defaults to `ALL`.
enum ReportStatus {
    All,
    Approved,
}

struct BulkExportParams {
    title: String,
    status: ReportStatus,
}

#[allow(clippy::result_large_err)]
fn parse_bulk_export_params(
    request_url: Option<&str>,
) -> Result<BulkExportParams, BackendResponse> {
    let parsed = request_url.and_then(|raw| url::Url::parse(raw).ok());

    let mut title: Option<String> = None;
    let mut status_raw: Option<String> = None;

    if let Some(parsed) = parsed.as_ref() {
        for (key, value) in parsed.query_pairs() {
            match key.as_ref() {
                "title" => title = Some(value.into_owned()),
                "status" => status_raw = Some(value.into_owned()),
                _ => {}
            }
        }
    }

    // `title` is a required string in the legacy Zod schema; its absence yields a
    // 400 with an `issues` array describing the missing required field.
    let Some(title) = title else {
        return Err(invalid_query_params_response(json!([{
            "code": "invalid_type",
            "expected": "string",
            "received": "undefined",
            "path": ["title"],
            "message": "Required",
        }])));
    };

    let status = match status_raw.as_deref() {
        None | Some("ALL") => ReportStatus::All,
        Some("APPROVED") => ReportStatus::Approved,
        Some(other) => {
            return Err(invalid_query_params_response(json!([{
                "received": other,
                "code": "invalid_enum_value",
                "options": ["ALL", "APPROVED"],
                "path": ["status"],
                "message": format!(
                    "Invalid enum value. Expected 'ALL' | 'APPROVED', received '{other}'"
                ),
            }])));
        }
    };

    Ok(BulkExportParams { title, status })
}

fn invalid_query_params_response(issues: Value) -> BackendResponse {
    no_store_response(json_response(
        400,
        json!({
            "message": "Invalid query parameters",
            "issues": issues,
        }),
    ))
}

async fn bulk_export_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    group_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let params = match parse_bulk_export_params(request.url) {
        Ok(params) => params,
        Err(response) => return response,
    };

    let authorization = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        BULK_EXPORT_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(error) => return bulk_export_authorization_error_response(error),
    };

    match fetch_bulk_export_reports(
        &config.contact_data,
        outbound,
        &authorization.ws_id,
        group_id,
        &params,
    )
    .await
    {
        Ok(reports) => no_store_response(json_response(200, Value::Array(reports))),
        Err(()) => no_store_response(json_response(
            500,
            json!({ "message": "Error fetching reports" }),
        )),
    }
}

/// Legacy `getPermissions` returns `null` (→ 404 `{ "error": "Not found" }`) when
/// the caller has no valid session or no access to the workspace, and a 403
/// `{ "message": "Unauthorized" }` when the permission is missing.
fn bulk_export_authorization_error_response(
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
            json!({ "message": "Internal server error" }),
        )),
    }
}

async fn fetch_bulk_export_reports(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    group_id: &str,
    params: &BulkExportParams,
) -> Result<Vec<Value>, ()> {
    let mut query = vec![
        ("select", "*".to_owned()),
        ("group_id", format!("eq.{group_id}")),
        ("user_ws_id", format!("eq.{ws_id}")),
        ("title", format!("eq.{}", params.title)),
    ];

    if matches!(params.status, ReportStatus::Approved) {
        query.push(("report_approval_status", "eq.APPROVED".to_owned()));
    }

    let url = contact_data.rest_url(BULK_EXPORT_VIEW, &query).ok_or(())?;
    let response = send_private_service_role_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;

    Ok(rows.into_iter().map(map_report).collect())
}

/// Mirrors the legacy mapping that spreads the raw row and exposes
/// `user_name`, `creator_name`, and `group_name` derived from the view columns.
fn map_report(row: Value) -> Value {
    let Value::Object(mut row) = row else {
        return row;
    };

    let user_name = row.get("user_full_name").cloned().unwrap_or(Value::Null);
    let creator_name = row.get("creator_full_name").cloned().unwrap_or(Value::Null);
    let group_name = row.get("group_name").cloned().unwrap_or(Value::Null);

    row.insert("user_name".to_owned(), user_name);
    row.insert("creator_name".to_owned(), creator_name);
    row.insert("group_name".to_owned(), group_name);

    Value::Object(row)
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
