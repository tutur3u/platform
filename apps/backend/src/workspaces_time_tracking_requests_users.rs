use serde::Deserialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/time-tracking/requests/users";
const MANAGE_TIME_TRACKING_REQUESTS_PERMISSION: &str = "manage_time_tracking_requests";
const PRIVATE_SCHEMA: &str = "private";
const TIME_TRACKING_REQUESTS_VIEW: &str = "time_tracking_requests_with_details";
const DEFAULT_DISPLAY_NAME: &str = "Unknown";

/// One row of the `private.time_tracking_requests_with_details` view, projected
/// to the `user_id, user` columns the legacy route selects. The embedded `user`
/// JSONB column is built by the view via `jsonb_build_object(...)`.
#[derive(Deserialize)]
struct TimeTrackingRequestUserRow {
    user_id: Option<String>,
    #[serde(default)]
    user: Option<EmbeddedUser>,
}

#[derive(Deserialize)]
struct EmbeddedUser {
    #[serde(default)]
    display_name: Option<String>,
}

pub(crate) async fn handle_workspaces_time_tracking_requests_users_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = requests_users_ws_id(request.path)?;

    Some(match request.method {
        "GET" => requests_users_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn requests_users_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Mirror the legacy flow: authenticate, normalize the workspace id, verify
    // workspace membership, and require `manage_time_tracking_requests`.
    // `authorize_workspace_permission` folds normalization + membership +
    // permission into one call and returns the normalized workspace id.
    let authorization = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        MANAGE_TIME_TRACKING_REQUESTS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return error_response(401, "Unauthorized");
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return error_response(
                403,
                "You do not have permission to view time tracking request users.",
            );
        }
        Err(WorkspacePermissionAuthorizationError::NotFound) => {
            return error_response(403, "Workspace access denied");
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return error_response(500, "Failed to verify workspace access");
        }
    };

    let rows = match fetch_request_users(&config.contact_data, outbound, &authorization.ws_id).await
    {
        Ok(rows) => rows,
        Err(()) => return error_response(500, "Internal server error"),
    };

    no_store_response(json_response(200, json!(unique_users(rows))))
}

/// Read the request users for the workspace through the service role, mirroring
/// the legacy `sbAdmin.schema('private').from('time_tracking_requests_with_details')`
/// admin read. The `private` schema is selected via the PostgREST profile
/// headers, exactly like other private-schema reads in this crate.
async fn fetch_request_users(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<TimeTrackingRequestUserRow>, ()> {
    let Some(url) = contact_data.rest_url(
        TIME_TRACKING_REQUESTS_VIEW,
        &[
            ("select", "user_id,user".to_owned()),
            ("workspace_id", format!("eq.{ws_id}")),
        ],
    ) else {
        return Err(());
    };

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response
        .json::<Vec<TimeTrackingRequestUserRow>>()
        .map_err(|_| ())
}

/// Extract unique users (keyed by `user_id`), keeping only rows whose embedded
/// `user` object is present, and defaulting an empty/missing display name to
/// "Unknown". Mirrors the legacy `Array.from(new Map(...).values())`: later rows
/// overwrite earlier rows with the same `user_id`, while insertion order of
/// first-seen keys is preserved.
fn unique_users(rows: Vec<TimeTrackingRequestUserRow>) -> Vec<serde_json::Value> {
    let mut keys: Vec<Option<String>> = Vec::new();
    let mut users: Vec<serde_json::Value> = Vec::new();

    for row in rows {
        let Some(user) = row.user else {
            continue;
        };

        let display_name = match user.display_name {
            Some(name) if !name.is_empty() => name,
            _ => DEFAULT_DISPLAY_NAME.to_owned(),
        };
        let entry = json!({
            "id": row.user_id,
            "display_name": display_name,
        });

        if let Some(index) = keys.iter().position(|existing| existing == &row.user_id) {
            users[index] = entry;
        } else {
            keys.push(row.user_id);
            users.push(entry);
        }
    }

    users
}

fn requests_users_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn error_response(status: u16, error: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": error })))
}
