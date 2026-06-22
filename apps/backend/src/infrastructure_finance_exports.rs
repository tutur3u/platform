use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const MISSING_WS_ID_MESSAGE: &str = "Missing ws_id parameter";
const PAYMENT_METHODS_PATH: &str = "/api/v1/infrastructure/payment-methods";
const PRIVATE_SCHEMA: &str = "private";
const VIEW_TRANSACTIONS_PERMISSION: &str = "view_transactions";
const WALLETS_PATH: &str = "/api/v1/infrastructure/wallets";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct FinanceExportSpec {
    error_message: &'static str,
    path: &'static str,
    table: &'static str,
    workspace_filter_column: &'static str,
}

const FINANCE_EXPORT_SPECS: [FinanceExportSpec; 2] = [
    FinanceExportSpec {
        error_message: "Error fetching workspace_wallets",
        path: PAYMENT_METHODS_PATH,
        table: "workspace_wallets",
        workspace_filter_column: "ws_id",
    },
    FinanceExportSpec {
        error_message: "Error fetching workspace_wallets",
        path: WALLETS_PATH,
        table: "workspace_wallets",
        workspace_filter_column: "ws_id",
    },
];

#[derive(Clone, Debug, Eq, PartialEq)]
struct FinanceExportQuery {
    limit: Option<i64>,
    offset: Option<i64>,
    ws_id: Option<String>,
}

pub(crate) async fn handle_finance_export_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    for spec in FINANCE_EXPORT_SPECS {
        if request.path == spec.path {
            return Some(match request.method {
                "GET" => finance_export_response(config, request, outbound, spec).await,
                method => no_store_response(method_not_allowed(method, "GET")),
            });
        }
    }

    None
}

async fn finance_export_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
    spec: FinanceExportSpec,
) -> BackendResponse {
    let query = finance_export_query_from_url(request.url);
    let Some(raw_ws_id) = query.ws_id.as_deref().filter(|ws_id| !ws_id.is_empty()) else {
        return no_store_response(json_response(
            400,
            json!({ "message": MISSING_WS_ID_MESSAGE }),
        ));
    };

    let authorization = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        VIEW_TRANSACTIONS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(error) => return finance_export_auth_error_response(error, spec),
    };

    let response = match fetch_finance_export_rows(
        &config.contact_data,
        outbound,
        &authorization.ws_id,
        &query,
        spec,
    )
    .await
    {
        Ok(response) => response,
        Err(()) => return finance_export_error_response(spec.error_message),
    };
    let count = total_count_from_content_range(&response).unwrap_or(0);
    let rows = match response.json::<Vec<Value>>() {
        Ok(rows) => rows,
        Err(_) => return finance_export_error_response(spec.error_message),
    };

    no_store_response(json_response(
        200,
        json!({
            "data": rows,
            "count": count,
        }),
    ))
}

async fn fetch_finance_export_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &FinanceExportQuery,
    spec: FinanceExportSpec,
) -> Result<OutboundResponse, ()> {
    let Some(url) = contact_data.rest_url(
        spec.table,
        &[
            ("select", "*".to_owned()),
            (spec.workspace_filter_column, format!("eq.{ws_id}")),
        ],
    ) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");
    let range = finance_export_range(query);
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Range-Unit", "items")
                .with_header("Range", &range)
                .with_header("Prefer", "count=exact"),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response)
}

fn finance_export_query_from_url(request_url: Option<&str>) -> FinanceExportQuery {
    let mut query = FinanceExportQuery {
        limit: Some(1000),
        offset: Some(0),
        ws_id: None,
    };
    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return query;
    };
    let mut saw_limit = false;
    let mut saw_offset = false;

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "ws_id" if query.ws_id.is_none() => query.ws_id = Some(value.into_owned()),
            "limit" if !saw_limit => {
                query.limit = parse_js_parse_int_prefix(&value);
                saw_limit = true;
            }
            "offset" if !saw_offset => {
                query.offset = parse_js_parse_int_prefix(&value);
                saw_offset = true;
            }
            _ => {}
        }
    }

    query
}

fn finance_export_range(query: &FinanceExportQuery) -> String {
    let (Some(offset), Some(limit)) = (query.offset, query.limit) else {
        return "NaN-NaN".to_owned();
    };

    format!("{offset}-{}", offset + limit - 1)
}

fn parse_js_parse_int_prefix(value: &str) -> Option<i64> {
    let trimmed = value.trim_start();
    let mut chars = trimmed.char_indices().peekable();
    let mut sign = 1_i64;

    if let Some((_, first)) = chars.peek().copied() {
        match first {
            '-' => {
                sign = -1;
                chars.next();
            }
            '+' => {
                chars.next();
            }
            _ => {}
        }
    }

    let mut digits = String::new();
    while let Some((_, character)) = chars.peek().copied() {
        if !character.is_ascii_digit() {
            break;
        }
        digits.push(character);
        chars.next();
    }

    if digits.is_empty() {
        return None;
    }

    digits.parse::<i64>().ok().map(|value| sign * value)
}

fn total_count_from_content_range(response: &OutboundResponse) -> Option<usize> {
    let header = response.header("content-range")?;
    let (_, total) = header.rsplit_once('/')?;

    total.parse::<usize>().ok()
}

fn finance_export_auth_error_response(
    error: WorkspacePermissionAuthorizationError,
    spec: FinanceExportSpec,
) -> BackendResponse {
    match error {
        WorkspacePermissionAuthorizationError::Unauthorized => {
            no_store_response(json_response(401, json!({ "message": "Unauthorized" })))
        }
        WorkspacePermissionAuthorizationError::NotFound => {
            no_store_response(json_response(404, json!({ "message": "Not found" })))
        }
        WorkspacePermissionAuthorizationError::Forbidden => {
            no_store_response(json_response(403, json!({ "message": "Forbidden" })))
        }
        WorkspacePermissionAuthorizationError::Internal => {
            finance_export_error_response(spec.error_message)
        }
    }
}

fn finance_export_error_response(message: &'static str) -> BackendResponse {
    no_store_response(json_response(500, json!({ "message": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finance_export_specs_preserve_legacy_route_contracts() {
        let expected = [
            (PAYMENT_METHODS_PATH, "workspace_wallets"),
            (WALLETS_PATH, "workspace_wallets"),
        ];

        for (index, (path, table)) in expected.iter().enumerate() {
            let spec = FINANCE_EXPORT_SPECS[index];
            assert_eq!(spec.path, *path);
            assert_eq!(spec.table, *table);
            assert_eq!(spec.workspace_filter_column, "ws_id");
            assert_eq!(spec.error_message, "Error fetching workspace_wallets");
        }
    }

    #[test]
    fn finance_export_range_preserves_legacy_parse_int_semantics() {
        let query = finance_export_query_from_url(Some(
            "https://backend.example.test/api/v1/infrastructure/wallets?ws_id=workspace-1&limit=25px&offset=50rows",
        ));

        assert_eq!(query.ws_id.as_deref(), Some("workspace-1"));
        assert_eq!(query.limit, Some(25));
        assert_eq!(query.offset, Some(50));
        assert_eq!(finance_export_range(&query), "50-74");
    }

    #[test]
    fn finance_export_range_matches_legacy_nan_when_parse_int_fails() {
        let query = finance_export_query_from_url(Some(
            "https://backend.example.test/api/v1/infrastructure/wallets?ws_id=workspace-1&limit=bad&offset=still-bad",
        ));

        assert_eq!(query.limit, None);
        assert_eq!(query.offset, None);
        assert_eq!(finance_export_range(&query), "NaN-NaN");
    }
}
