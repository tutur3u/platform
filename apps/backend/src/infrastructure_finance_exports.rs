use serde::Serialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const GET_WALLET_TRANSACTIONS_WITH_PERMISSIONS_RPC: &str =
    "get_wallet_transactions_with_permissions";
const MISSING_WS_ID_MESSAGE: &str = "Missing ws_id parameter";
const PAYMENT_METHODS_PATH: &str = "/api/v1/infrastructure/payment-methods";
const PRIVATE_SCHEMA: &str = "private";
const VIEW_TRANSACTIONS_PERMISSION: &str = "view_transactions";
const WALLET_TRANSACTIONS_ERROR_MESSAGE: &str = "Error fetching wallet_transactions";
const WALLET_TRANSACTIONS_PATH: &str = "/api/v1/infrastructure/wallet-transactions";
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

#[derive(Serialize)]
struct WalletTransactionsRpcRequest<'a> {
    p_ws_id: &'a str,
    p_limit: Option<i64>,
    p_offset: Option<i64>,
    p_order_by: &'static str,
    p_order_direction: &'static str,
    p_include_count: bool,
}

pub(crate) async fn handle_finance_export_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path == WALLET_TRANSACTIONS_PATH {
        return Some(match request.method {
            "GET" => wallet_transactions_response(config, request, outbound).await,
            method => no_store_response(method_not_allowed(method, "GET")),
        });
    }

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

async fn wallet_transactions_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let query = finance_export_query_from_url(request.url);
    let Some(ws_id) = query.ws_id.as_deref().filter(|ws_id| !ws_id.is_empty()) else {
        return no_store_response(json_response(
            400,
            json!({ "message": MISSING_WS_ID_MESSAGE }),
        ));
    };
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return no_store_response(json_response(401, json!({ "message": "Unauthorized" })));
    };
    let rows = match fetch_wallet_transactions(
        &config.contact_data,
        outbound,
        &access_token,
        ws_id,
        &query,
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return finance_export_error_response(WALLET_TRANSACTIONS_ERROR_MESSAGE),
    };
    let count = wallet_transactions_count(&rows);

    no_store_response(json_response(
        200,
        json!({
            "data": rows,
            "count": count,
        }),
    ))
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

async fn fetch_wallet_transactions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
    ws_id: &str,
    query: &FinanceExportQuery,
) -> Result<Vec<Value>, ()> {
    let rpc_url = contact_data
        .rpc_url(GET_WALLET_TRANSACTIONS_WITH_PERMISSIONS_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");
    let body = serde_json::to_string(&WalletTransactionsRpcRequest {
        p_ws_id: ws_id,
        p_limit: query.limit,
        p_offset: query.offset,
        p_order_by: "taken_at",
        p_order_direction: "DESC",
        p_include_count: true,
    })
    .map_err(|_| ())?;
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
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

fn wallet_transactions_count(rows: &[Value]) -> Value {
    rows.first()
        .and_then(|row| row.get("total_count"))
        .filter(|value| !value.is_null())
        .cloned()
        .unwrap_or_else(|| json!(0))
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
    use crate::outbound::{
        OutboundError, OutboundFuture, OutboundHeader, OutboundRequest, OutboundResponse,
    };
    use std::{cell::RefCell, collections::VecDeque};

    #[derive(Clone, Debug, Eq, PartialEq)]
    struct RecordedOutboundRequest {
        body: Option<String>,
        headers: Vec<(String, String)>,
        method: OutboundMethod,
        url: String,
    }

    #[derive(Default)]
    struct RecordingOutboundClient {
        calls: RefCell<Vec<RecordedOutboundRequest>>,
        responses: RefCell<VecDeque<OutboundResponse>>,
    }

    impl RecordingOutboundClient {
        fn with_responses(responses: Vec<OutboundResponse>) -> Self {
            Self {
                calls: RefCell::new(Vec::new()),
                responses: RefCell::new(VecDeque::from(responses)),
            }
        }

        fn calls(&self) -> Vec<RecordedOutboundRequest> {
            self.calls.borrow().clone()
        }
    }

    impl OutboundHttpClient for RecordingOutboundClient {
        fn send<'a>(&'a self, request: OutboundRequest<'a>) -> OutboundFuture<'a> {
            self.calls.borrow_mut().push(RecordedOutboundRequest {
                body: request.body.map(str::to_owned),
                headers: request
                    .headers
                    .iter()
                    .map(|OutboundHeader { name, value }| (name.to_string(), value.to_string()))
                    .collect(),
                method: request.method,
                url: request.url.to_owned(),
            });
            let response = self
                .responses
                .borrow_mut()
                .pop_front()
                .unwrap_or_else(|| outbound_response(200, r#"[]"#));

            Box::pin(async move { Ok::<OutboundResponse, OutboundError>(response) })
        }
    }

    fn backend_config_with_contact_data() -> BackendConfig {
        let mut config = BackendConfig::new("test", "backend-test");
        config.contact_data = contact::ContactDataConfig::new(
            "https://project-ref.supabase.co",
            "test-service-role-secret",
        );
        config
    }

    fn request(path: &'static str, url: Option<&'static str>) -> BackendRequest<'static> {
        BackendRequest {
            authorization: Some("Bearer caller-access-token"),
            body_text: None,
            cookie: None,
            method: "GET",
            origin: None,
            path,
            referer: None,
            request_id: None,
            url,
        }
    }

    fn outbound_response(status: u16, body_text: impl Into<String>) -> OutboundResponse {
        OutboundResponse {
            body_text: body_text.into(),
            headers: vec![("content-type".to_owned(), APPLICATION_JSON.to_owned())],
            status,
        }
    }

    fn recorded_header<'a>(request: &'a RecordedOutboundRequest, header: &str) -> Option<&'a str> {
        request
            .headers
            .iter()
            .find(|(name, _)| name.eq_ignore_ascii_case(header))
            .map(|(_, value)| value.as_str())
    }

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

    #[tokio::test]
    async fn wallet_transactions_requires_ws_id_before_auth_or_rpc() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::default();

        let response = handle_finance_export_route(
            &config,
            request(
                WALLET_TRANSACTIONS_PATH,
                Some("https://backend.test/api/v1/infrastructure/wallet-transactions"),
            ),
            &outbound,
        )
        .await
        .expect("wallet transactions route should be handled");

        assert_eq!(response.status, 400);
        assert_eq!(response.body["message"], MISSING_WS_ID_MESSAGE);
        assert!(outbound.calls().is_empty());
    }

    #[tokio::test]
    async fn wallet_transactions_requires_supabase_caller_token() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::default();
        let response = handle_finance_export_route(
            &config,
            BackendRequest {
                authorization: None,
                ..request(
                    WALLET_TRANSACTIONS_PATH,
                    Some(
                        "https://backend.test/api/v1/infrastructure/wallet-transactions?ws_id=workspace-1",
                    ),
                )
            },
            &outbound,
        )
        .await
        .expect("wallet transactions route should be handled");

        assert_eq!(response.status, 401);
        assert_eq!(response.body["message"], "Unauthorized");
        assert!(outbound.calls().is_empty());
    }

    #[tokio::test]
    async fn wallet_transactions_calls_permission_rpc_with_caller_token() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(vec![outbound_response(
            200,
            r#"[{"id":"transaction-1","amount":1200,"total_count":42}]"#,
        )]);

        let response = handle_finance_export_route(
            &config,
            request(
                WALLET_TRANSACTIONS_PATH,
                Some(
                    "https://backend.test/api/v1/infrastructure/wallet-transactions?ws_id=workspace-1&limit=25px&offset=50rows",
                ),
            ),
            &outbound,
        )
        .await
        .expect("wallet transactions route should be handled");

        assert_eq!(response.status, 200);
        assert_eq!(response.body["data"][0]["id"], "transaction-1");
        assert_eq!(response.body["count"], 42);

        let calls = outbound.calls();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].method, OutboundMethod::Post);
        assert_eq!(
            calls[0].url,
            "https://project-ref.supabase.co/rest/v1/rpc/get_wallet_transactions_with_permissions"
        );
        assert_eq!(
            recorded_header(&calls[0], "Authorization"),
            Some("Bearer caller-access-token")
        );
        assert_eq!(
            recorded_header(&calls[0], "apikey"),
            Some("test-service-role-secret")
        );
        assert_eq!(
            recorded_header(&calls[0], "Content-Type"),
            Some(APPLICATION_JSON)
        );
        assert_eq!(
            calls[0].body.as_deref(),
            Some(
                r#"{"p_ws_id":"workspace-1","p_limit":25,"p_offset":50,"p_order_by":"taken_at","p_order_direction":"DESC","p_include_count":true}"#
            )
        );
    }

    #[tokio::test]
    async fn wallet_transactions_returns_zero_count_for_empty_rpc_rows() {
        let config = backend_config_with_contact_data();
        let outbound =
            RecordingOutboundClient::with_responses(vec![outbound_response(200, r#"[]"#)]);

        let response = handle_finance_export_route(
            &config,
            request(
                WALLET_TRANSACTIONS_PATH,
                Some(
                    "https://backend.test/api/v1/infrastructure/wallet-transactions?ws_id=workspace-1",
                ),
            ),
            &outbound,
        )
        .await
        .expect("wallet transactions route should be handled");

        assert_eq!(response.status, 200);
        assert_eq!(response.body["data"], json!([]));
        assert_eq!(response.body["count"], 0);
    }

    #[tokio::test]
    async fn wallet_transactions_preserves_legacy_rpc_failure_body() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(vec![outbound_response(
            500,
            r#"{"message":"failed"}"#,
        )]);

        let response = handle_finance_export_route(
            &config,
            request(
                WALLET_TRANSACTIONS_PATH,
                Some(
                    "https://backend.test/api/v1/infrastructure/wallet-transactions?ws_id=workspace-1",
                ),
            ),
            &outbound,
        )
        .await
        .expect("wallet transactions route should be handled");

        assert_eq!(response.status, 500);
        assert_eq!(response.body["message"], WALLET_TRANSACTIONS_ERROR_MESSAGE);
        assert_eq!(outbound.calls().len(), 1);
    }
}
