use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FETCH_ERROR_MESSAGE: &str = "Error fetching workspace datasets";

/// Handles `GET /api/v1/workspaces/:wsId/datasets`.
///
/// Returns `None` when the request path does not match this route (so the
/// caller can keep dispatching), or when the HTTP method is one that has not
/// been migrated yet (e.g. `POST`), so the Cloudflare worker falls through to
/// the still-active Next.js route for those mutations. Only the migrated `GET`
/// method produces `Some(...)`.
pub(crate) async fn handle_workspaces_datasets_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = workspace_datasets_ws_id(request.path)?;

    Some(match request.method {
        "GET" => datasets_response(config, request, ws_id, outbound).await,
        // POST (and any other method) is NOT migrated yet. Returning None lets
        // the worker fall through to the still-active Next.js route instead of
        // 405-ing a valid mutation.
        _ => return None,
    })
}

async fn datasets_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // NOTE: the legacy route also supports an `API_KEY` header that selects the
    // admin (service-role) client and returns `{ data, count }`. `BackendRequest`
    // does not expose arbitrary request headers, so this port implements only the
    // authenticated session path (`createClient()` + RLS), which returns the bare
    // dataset array (`data || []`). This mirrors the sibling
    // `workspaces_datasets_full` port, which also drops the API_KEY branch.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(_user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    match fetch_workspace_datasets(&config.contact_data, outbound, ws_id, &access_token).await {
        // Legacy `getDataFromSession` returns `data || []` directly (a bare array).
        Ok(data) => no_store_response(json_response(200, data)),
        Err(()) => message_response(500, FETCH_ERROR_MESSAGE),
    }
}

async fn fetch_workspace_datasets(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    access_token: &str,
) -> Result<Value, ()> {
    // Mirror `supabase.from('workspace_datasets').select('*').eq('ws_id', wsId)`.
    // The caller's access token is forwarded so PostgREST enforces RLS exactly
    // like the legacy `createClient()` session path.
    let Some(url) = contact_data.rest_url(
        "workspace_datasets",
        &[("select", "*".to_owned()), ("ws_id", format!("eq.{ws_id}"))],
    ) else {
        return Err(());
    };
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");

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

    response.json::<Value>().map_err(|_| ())
}

/// Matches `/api/v1/workspaces/:wsId/datasets` exactly (no trailing dynamic
/// segments) and extracts the `wsId` dynamic segment. Paths with extra
/// segments such as `/datasets/:datasetId/full` are intentionally NOT matched
/// so they continue routing to their own handlers.
fn workspace_datasets_ws_id(path: &str) -> Option<&str> {
    let path = path.split('?').next().unwrap_or(path);
    let segments: Vec<&str> = path
        .trim_start_matches('/')
        .trim_end_matches('/')
        .split('/')
        .collect();

    if segments.len() == 5
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && !segments[3].is_empty()
        && segments[4] == "datasets"
    {
        Some(segments[3])
    } else {
        None
    }
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
