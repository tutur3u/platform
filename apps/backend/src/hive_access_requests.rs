use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, hive_access,
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const HIVE_ACCESS_REQUESTS_PATH: &str = "/api/v1/hive/access-requests";
const HIVE_ACCESS_REQUESTS_TABLE: &str = "hive_access_requests";
const PENDING_STATUS: &str = "pending";
const HIVE_APP_SESSION_TARGETS: &[&str] = &["hive"];

#[derive(Deserialize)]
struct HiveAccessRequestRow {
    created_at: Option<String>,
    email: Option<String>,
    id: Option<String>,
    note: Option<String>,
    requested_at: Option<String>,
    resolution_note: Option<String>,
    resolved_at: Option<String>,
    resolved_by: Option<String>,
    status: Option<String>,
    updated_at: Option<String>,
    user_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MappedHiveAccessRequest {
    created_at: Option<String>,
    email: Option<String>,
    id: Option<String>,
    note: Option<String>,
    requested_at: Option<String>,
    resolution_note: Option<String>,
    resolved_at: Option<String>,
    resolved_by: Option<String>,
    status: Option<String>,
    updated_at: Option<String>,
    user_id: Option<String>,
}

impl From<HiveAccessRequestRow> for MappedHiveAccessRequest {
    fn from(row: HiveAccessRequestRow) -> Self {
        Self {
            created_at: row.created_at,
            email: row.email,
            id: row.id,
            note: row.note,
            requested_at: row.requested_at,
            resolution_note: row.resolution_note,
            resolved_at: row.resolved_at,
            resolved_by: row.resolved_by,
            status: row.status,
            updated_at: row.updated_at,
            user_id: row.user_id,
        }
    }
}

pub(crate) async fn handle_hive_access_requests_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != HIVE_ACCESS_REQUESTS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => hive_access_requests_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn hive_access_requests_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let user =
        match hive_access::authenticated_user(config, request, HIVE_APP_SESSION_TARGETS, outbound)
            .await
        {
            Ok(user) => user,
            Err(()) => return error_response(401, "Unauthorized"),
        };

    let access =
        match hive_access::resolve_hive_access(&config.contact_data, &user.id, outbound).await {
            Ok(access) => access,
            Err(()) => return error_response(500, "Failed to resolve Hive access"),
        };

    if !access.has_access() {
        return error_response(403, "Hive access required");
    }

    if !access.is_admin {
        return error_response(403, "Hive admin access required");
    }

    match list_pending_access_requests(&config.contact_data, outbound).await {
        Ok(requests) => {
            let mapped: Vec<MappedHiveAccessRequest> = requests
                .into_iter()
                .map(MappedHiveAccessRequest::from)
                .collect();
            no_store_response(json_response(200, json!({ "requests": mapped })))
        }
        Err(()) => error_response(500, "Failed to list Hive access requests"),
    }
}

async fn list_pending_access_requests(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<HiveAccessRequestRow>, ()> {
    let Some(url) = contact_data.rest_url(
        HIVE_ACCESS_REQUESTS_TABLE,
        &[
            (
                "select",
                "id,user_id,email,note,status,requested_at,resolved_at,resolved_by,resolution_note,created_at,updated_at"
                    .to_owned(),
            ),
            ("status", format!("eq.{PENDING_STATUS}")),
            ("order", "requested_at.desc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<HiveAccessRequestRow>>().map_err(|_| ())
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
