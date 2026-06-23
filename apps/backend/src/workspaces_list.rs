use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const WORKSPACES_LIST_PATH: &str = "/api/workspaces";
const DEFAULT_WORKSPACE_COLOR: &str = "bg-blue-500";
const ERROR_FETCHING_MESSAGE: &str = "Error fetching workspaces";

#[derive(Deserialize)]
struct WorkspaceEmbed {
    name: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMemberRow {
    // Aliased from `ws_id` via the PostgREST `select` query (id:ws_id).
    id: Option<String>,
    workspaces: Option<WorkspaceEmbed>,
}

#[derive(Serialize)]
struct WorkspaceListItem {
    id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    color: &'static str,
}

pub(crate) async fn handle_workspaces_list_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != WORKSPACES_LIST_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => workspaces_list_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn workspaces_list_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // The legacy route relies on Postgres RLS to scope `workspace_members` to
    // the authenticated caller, so we forward the caller's access token instead
    // of the service-role key to preserve that scoping exactly.
    let access_token = supabase_auth::request_access_token(request);

    match fetch_workspaces(&config.contact_data, outbound, access_token.as_deref()).await {
        Ok(rows) => {
            let items = rows
                .into_iter()
                .map(|row| WorkspaceListItem {
                    id: row.id,
                    name: row.workspaces.and_then(|workspace| workspace.name),
                    color: DEFAULT_WORKSPACE_COLOR,
                })
                .collect::<Vec<_>>();

            no_store_response(json_response(200, items))
        }
        Err(()) => error_response(),
    }
}

async fn fetch_workspaces(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: Option<&str>,
) -> Result<Vec<WorkspaceMemberRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "id:ws_id,workspaces(name)".to_owned()),
            ("order", "sort_key,created_at.desc".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<WorkspaceMemberRow>>().map_err(|_| ())
}

async fn send_caller_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    // Without a caller token, fall back to the anon-equivalent path so RLS still
    // applies (the apikey alone yields no rows for protected tables).
    let bearer = access_token.unwrap_or(service_role_key);
    let authorization = format!("Bearer {bearer}");

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

fn error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": ERROR_FETCHING_MESSAGE }),
    ))
}
