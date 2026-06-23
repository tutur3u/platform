use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const TEACH_USERS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const TEACH_USERS_PATH_SUFFIX: &str = "/teach/users";
const TEACH_USERS_PERMISSION: &str = "view_users_public_info";
const GET_WORKSPACE_USERS_RPC: &str = "get_workspace_users";
const DEFAULT_LIMIT: i64 = 30;
const MIN_LIMIT: i64 = 1;
const MAX_LIMIT: i64 = 100;

pub(crate) async fn handle_workspaces_teach_users_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = teach_users_ws_id(request.path)?;

    Some(match request.method {
        "GET" => teach_users_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn teach_users_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Mirror legacy `requireTeachWorkspaceAccess`: normalize the workspace id,
    // verify membership, and require the `view_users_public_info` permission.
    // `authorize_workspace_permission` returns the normalized workspace id.
    let authorization = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        TEACH_USERS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return message_response(401, "Unauthorized");
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return message_response(403, "Insufficient permissions");
        }
        Err(WorkspacePermissionAuthorizationError::NotFound) => {
            return message_response(403, "You don't have access to this workspace");
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, "Failed to verify workspace access");
        }
    };

    let query = TeachUsersQuery::from_url(request.url);

    match fetch_workspace_users(&config.contact_data, outbound, &authorization.ws_id, &query).await
    {
        Ok((count, data)) => {
            no_store_response(json_response(200, json!({ "count": count, "data": data })))
        }
        Err(()) => message_response(500, "Error fetching workspace users"),
    }
}

struct TeachUsersQuery {
    search: String,
    from: i64,
    limit: i64,
}

impl TeachUsersQuery {
    fn from_url(request_url: Option<&str>) -> Self {
        let mut search = String::new();
        let mut from: i64 = 0;
        let mut limit: i64 = DEFAULT_LIMIT;

        if let Some(parsed) = request_url.and_then(|raw| url::Url::parse(raw).ok()) {
            for (key, value) in parsed.query_pairs() {
                match key.as_ref() {
                    "q" => search = value.into_owned(),
                    "from" => {
                        // `Number.parseInt(... ?? '0') || 0`, clamped to >= 0.
                        let parsed_from = value.trim().parse::<i64>().unwrap_or(0);
                        from = parsed_from.max(0);
                    }
                    "limit" => {
                        // `Number.parseInt(... ?? '30') || 30`, clamped to [1, 100].
                        let parsed_limit = value.trim().parse::<i64>().unwrap_or(DEFAULT_LIMIT);
                        let parsed_limit = if parsed_limit == 0 {
                            DEFAULT_LIMIT
                        } else {
                            parsed_limit
                        };
                        limit = parsed_limit.clamp(MIN_LIMIT, MAX_LIMIT);
                    }
                    _ => {}
                }
            }
        }

        Self {
            search,
            from,
            limit,
        }
    }
}

async fn fetch_workspace_users(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &TeachUsersQuery,
) -> Result<(i64, Value), ()> {
    let Some(base_url) = contact_data.rpc_url(GET_WORKSPACE_USERS_RPC) else {
        return Err(());
    };
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    // Mirror legacy `.order('full_name', { ascending: true, nullsFirst: false })`
    // then `.order('display_name', ...)`. PostgREST applies the `order` query
    // string to the RPC result set.
    let order = "full_name.asc.nullslast,display_name.asc.nullslast";
    let request_url = format!("{base_url}?order={order}");

    // Body mirrors the RPC named arguments from the legacy route.
    let body = json!({
        "_ws_id": ws_id,
        "excluded_groups": [],
        "include_archived": false,
        "included_groups": [],
        "link_status": "all",
        "search_query": query.search,
    })
    .to_string();

    // `.range(from, from + limit - 1)` becomes a PostgREST Range header.
    let range_end = query.from + query.limit - 1;
    let range_header = format!("{}-{}", query.from, range_end);

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &request_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                // `{ count: 'exact' }` -> exact count in Content-Range.
                .with_header("Prefer", "count=exact")
                .with_header("Range-Unit", "items")
                .with_header("Range", &range_header)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    // PostgREST returns 200 (or 206 Partial Content when a Range is applied).
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let count = content_range_total(response.header("content-range")).unwrap_or(0);
    let data = response.json::<Value>().map_err(|_| ())?;
    let data = if data.is_array() { data } else { json!([]) };

    Ok((count, data))
}

/// Parses the total row count from a PostgREST `Content-Range` header value,
/// e.g. `0-29/256` -> 256, or `*/0` -> 0.
fn content_range_total(header: Option<&str>) -> Option<i64> {
    let total = header?.split('/').nth(1)?.trim();

    if total == "*" {
        return None;
    }

    total.parse::<i64>().ok()
}

fn teach_users_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(TEACH_USERS_PATH_PREFIX)?
        .strip_suffix(TEACH_USERS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
