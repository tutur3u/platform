use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FETCH_ERROR_MESSAGE: &str = "Error fetching cells";

/// Handles `GET /api/v1/workspaces/:wsId/datasets/:datasetId/cells`.
///
/// Returns `None` when the request path does not match this route, so the
/// caller can continue dispatching (e.g. to the still-active Next.js route for
/// the not-yet-migrated POST/PUT/DELETE methods). Otherwise returns
/// `Some(response)`.
///
/// NOTE: only the `GET` method is migrated. Every other method returns `None`
/// so the Cloudflare worker falls through to the legacy Next.js route, which
/// still owns POST/PUT/DELETE for this path.
pub(crate) async fn handle_workspaces_datasets_datasetid_cells_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (_ws_id, dataset_id) = workspace_dataset_cells_segments(request.path)?;

    Some(match request.method {
        "GET" => dataset_cells_response(config, request, dataset_id, outbound).await,
        // All other methods (POST/PUT/DELETE) are NOT migrated yet; return None
        // so the worker falls through to the still-active Next.js route.
        _ => return None,
    })
}

async fn dataset_cells_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    dataset_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // The legacy route uses `createClient()` (an authenticated session client),
    // so reads are scoped by RLS to the caller. We mirror that: require a valid
    // Supabase session, then issue the PostgREST read with the caller's access
    // token (RLS-enforced) plus the service-role key as the `apikey`.
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

    match fetch_dataset_cells(&config.contact_data, outbound, dataset_id, &access_token).await {
        // The legacy GET returns the raw PostgREST array verbatim.
        Ok(data) => no_store_response(json_response(200, data)),
        Err(()) => message_response(500, FETCH_ERROR_MESSAGE),
    }
}

async fn fetch_dataset_cells(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    dataset_id: &str,
    access_token: &str,
) -> Result<Value, ()> {
    // Mirrors:
    //   .from('workspace_dataset_cells')
    //   .select('*')
    //   .eq('dataset_id', datasetId)
    //   .order('created_at', { ascending: true })
    let Some(url) = contact_data.rest_url(
        "workspace_dataset_cells",
        &[
            ("select", "*".to_owned()),
            ("dataset_id", format!("eq.{dataset_id}")),
            ("order", "created_at.asc".to_owned()),
        ],
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

/// Matches `/api/v1/workspaces/:wsId/datasets/:datasetId/cells` and extracts the
/// `wsId` and `datasetId` dynamic segments.
fn workspace_dataset_cells_segments(path: &str) -> Option<(&str, &str)> {
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
        && segments[6] == "cells"
    {
        Some((segments[3], segments[5]))
    } else {
        None
    }
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
