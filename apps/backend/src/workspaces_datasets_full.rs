use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FETCH_ERROR_MESSAGE: &str = "Error fetching dataset rows";

/// Handles `GET /api/v1/workspaces/:wsId/datasets/:datasetId/full`.
///
/// Returns `None` when the request path does not match this route, so the
/// caller can continue dispatching. Otherwise returns `Some(response)`.
pub(crate) async fn handle_workspaces_datasets_full_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (_ws_id, dataset_id) = workspace_dataset_full_segments(request.path)?;

    Some(match request.method {
        "GET" => dataset_full_response(config, request, dataset_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn dataset_full_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    dataset_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // NOTE: the legacy route also supports an `API_KEY` header that selects the
    // admin (service-role) client. `BackendRequest` does not expose arbitrary
    // request headers, so this port implements only the authenticated session
    // path, mirroring `createClient()` + RLS in the legacy route.
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

    let query = dataset_full_query_from_url(request.url);

    match fetch_dataset_rows(
        &config.contact_data,
        outbound,
        dataset_id,
        &access_token,
        &query,
    )
    .await
    {
        Ok(data) => no_store_response(json_response(200, json!({ "data": data }))),
        Err(()) => message_response(500, FETCH_ERROR_MESSAGE),
    }
}

#[derive(Default)]
struct DatasetFullQuery {
    from: Option<i64>,
    to: Option<i64>,
    limit: Option<i64>,
}

fn dataset_full_query_from_url(request_url: Option<&str>) -> DatasetFullQuery {
    let mut query = DatasetFullQuery::default();
    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return query;
    };

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "from" if query.from.is_none() => query.from = value.trim().parse::<i64>().ok(),
            "to" if query.to.is_none() => query.to = value.trim().parse::<i64>().ok(),
            "limit" if query.limit.is_none() => query.limit = value.trim().parse::<i64>().ok(),
            _ => {}
        }
    }

    query
}

async fn fetch_dataset_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    dataset_id: &str,
    access_token: &str,
    query: &DatasetFullQuery,
) -> Result<Value, ()> {
    let mut params: Vec<(&str, String)> = vec![
        ("select", "row_id,cells".to_owned()),
        ("dataset_id", format!("eq.{dataset_id}")),
    ];

    // supabase-js `.limit(n)` maps to the PostgREST `limit` query parameter.
    if let Some(limit) = query.limit {
        params.push(("limit", limit.to_string()));
    }

    let Some(url) = contact_data.rest_url("workspace_dataset_row_cells", &params) else {
        return Err(());
    };
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");

    let mut outbound_request = OutboundRequest::new(OutboundMethod::Get, &url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    // supabase-js `.range(from, to)` is an inclusive, offset-based range that
    // PostgREST expects via the `Range` header (e.g. `Range: 0-9`). Only apply
    // it when both bounds are present, matching the legacy `if (from && to)`.
    let range_header;
    if let (Some(from), Some(to)) = (query.from, query.to) {
        range_header = format!("{from}-{to}");
        outbound_request = outbound_request
            .with_header("Range-Unit", "items")
            .with_header("Range", &range_header);
    }

    let response = outbound.send(outbound_request).await.map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // `cells` is a JSON column, so rows are passed through verbatim.
    response.json::<Value>().map_err(|_| ())
}

/// Matches `/api/v1/workspaces/:wsId/datasets/:datasetId/full` and extracts the
/// `wsId` and `datasetId` dynamic segments.
fn workspace_dataset_full_segments(path: &str) -> Option<(&str, &str)> {
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
        && segments[6] == "full"
    {
        Some((segments[3], segments[5]))
    } else {
        None
    }
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
