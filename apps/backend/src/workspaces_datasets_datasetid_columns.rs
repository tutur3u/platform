use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FETCH_ERROR_MESSAGE: &str = "Error fetching columns";

/// Handles `GET /api/v1/workspaces/:wsId/datasets/:datasetId/columns`.
///
/// Only the `GET` method is migrated. The legacy route also defines `POST` and
/// `DELETE`; those are intentionally left to the still-active Next.js route, so
/// this handler returns `None` for every non-`GET` method (the worker then
/// falls through to Next.js) rather than emitting a 405.
///
/// Returns `None` when the request path does not match this route, so the
/// caller can continue dispatching. Otherwise returns `Some(response)` for the
/// migrated `GET` method.
pub(crate) async fn handle_workspaces_datasets_datasetid_columns_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (_ws_id, dataset_id) = workspace_dataset_columns_segments(request.path)?;

    Some(match request.method {
        "GET" => dataset_columns_response(config, request, dataset_id, outbound).await,
        // Non-migrated methods (POST/DELETE) must fall through to the legacy
        // Next.js route. Return None so the worker keeps dispatching.
        _ => return None,
    })
}

async fn dataset_columns_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    dataset_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // The legacy route uses `createClient()` (the authenticated session client)
    // and relies on RLS. Mirror that by requiring a valid Supabase session and
    // forwarding the caller's access token to PostgREST.
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

    match fetch_dataset_columns(&config.contact_data, outbound, dataset_id, &access_token).await {
        // Legacy returns the raw array verbatim (NextResponse.json(data)).
        Ok(data) => no_store_response(json_response(200, data)),
        Err(()) => message_response(500, FETCH_ERROR_MESSAGE),
    }
}

async fn fetch_dataset_columns(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    dataset_id: &str,
    access_token: &str,
) -> Result<Value, ()> {
    // Legacy query:
    //   .from('workspace_dataset_columns')
    //   .select('*')
    //   .eq('dataset_id', datasetId)
    //   .order('created_at', { ascending: true })
    let params: Vec<(&str, String)> = vec![
        ("select", "*".to_owned()),
        ("dataset_id", format!("eq.{dataset_id}")),
        ("order", "created_at.asc".to_owned()),
    ];

    let Some(url) = contact_data.rest_url("workspace_dataset_columns", &params) else {
        return Err(());
    };
    // RLS is enforced because we send the caller's access token as the bearer,
    // with the service-role key only as the PostgREST `apikey`. This mirrors the
    // authenticated-session pattern used by the `/datasets/:id/full` port.
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

/// Matches `/api/v1/workspaces/:wsId/datasets/:datasetId/columns` and extracts
/// the `wsId` and `datasetId` dynamic segments.
fn workspace_dataset_columns_segments(path: &str) -> Option<(&str, &str)> {
    let path = path.split('?').next().unwrap_or(path);
    let segments: Vec<&str> = path
        .trim_start_matches('/')
        .trim_end_matches('/')
        .split('/')
        .collect();

    if segments.len() == 7
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && !segments[3].is_empty()
        && segments[4] == "datasets"
        && !segments[5].is_empty()
        && segments[6] == "columns"
    {
        Some((segments[3], segments[5]))
    } else {
        None
    }
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
