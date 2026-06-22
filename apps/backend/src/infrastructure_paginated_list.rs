use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendRequest, BackendResponse, contact, json_response, method_not_allowed,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct CallerTokenPaginatedListSpec {
    pub(crate) error_message: &'static str,
    pub(crate) missing_ws_id_message: &'static str,
    pub(crate) path: &'static str,
    pub(crate) table: &'static str,
    pub(crate) workspace_filter_column: &'static str,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct CallerTokenPaginatedListQuery {
    limit: Option<i64>,
    offset: Option<i64>,
    ws_id: Option<String>,
}

pub(crate) async fn handle_caller_token_paginated_list_route(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
    spec: CallerTokenPaginatedListSpec,
) -> Option<BackendResponse> {
    if request.path != spec.path {
        return None;
    }

    Some(match request.method {
        "GET" => caller_token_paginated_list_response(contact_data, request, outbound, spec).await,
        method => method_not_allowed(method, "GET"),
    })
}

async fn caller_token_paginated_list_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
    spec: CallerTokenPaginatedListSpec,
) -> BackendResponse {
    if !contact_data.configured() {
        return paginated_list_error_response(spec.error_message);
    }

    let query = paginated_list_query_from_url(request.url);
    let Some(ws_id) = query.ws_id.as_deref().filter(|ws_id| !ws_id.is_empty()) else {
        return no_store_response(json_response(
            400,
            json!({ "message": spec.missing_ws_id_message }),
        ));
    };
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return no_store_response(json_response(401, json!({ "message": "Unauthorized" })));
    };

    let response = match fetch_paginated_list(
        contact_data,
        outbound,
        ws_id,
        &access_token,
        &query,
        spec,
    )
    .await
    {
        Ok(response) => response,
        Err(()) => return paginated_list_error_response(spec.error_message),
    };
    let count = total_count_from_content_range(&response).unwrap_or(0);
    let rows = match response.json::<Vec<Value>>() {
        Ok(rows) => rows,
        Err(_) => return paginated_list_error_response(spec.error_message),
    };

    no_store_response(json_response(
        200,
        json!({
            "data": rows,
            "count": count,
        }),
    ))
}

async fn fetch_paginated_list(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    access_token: &str,
    query: &CallerTokenPaginatedListQuery,
    spec: CallerTokenPaginatedListSpec,
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
    let authorization = format!("Bearer {access_token}");
    let range = paginated_list_range(query);
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
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

fn paginated_list_query_from_url(request_url: Option<&str>) -> CallerTokenPaginatedListQuery {
    let mut query = CallerTokenPaginatedListQuery {
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

fn paginated_list_range(query: &CallerTokenPaginatedListQuery) -> String {
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

fn paginated_list_error_response(message: &'static str) -> BackendResponse {
    no_store_response(json_response(500, json!({ "message": message })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        BackendConfig,
        outbound::{OutboundFuture, OutboundHeader},
    };
    use std::cell::RefCell;
    use std::collections::VecDeque;

    const TEST_PATH: &str = "/api/v1/infrastructure/test-list";
    const TEST_SPEC: CallerTokenPaginatedListSpec = CallerTokenPaginatedListSpec {
        error_message: "Error fetching test rows",
        missing_ws_id_message: "Missing ws_id parameter",
        path: TEST_PATH,
        table: "test_rows",
        workspace_filter_column: "ws_id",
    };

    #[derive(Clone, Debug, Eq, PartialEq)]
    struct RecordedOutboundRequest {
        headers: Vec<(String, String)>,
        method: OutboundMethod,
        url: String,
    }

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

    impl Default for RecordingOutboundClient {
        fn default() -> Self {
            Self::with_responses(vec![outbound_response(200, r#"[]"#)])
        }
    }

    impl OutboundHttpClient for RecordingOutboundClient {
        fn send<'a>(&'a self, request: OutboundRequest<'a>) -> OutboundFuture<'a> {
            self.calls.borrow_mut().push(RecordedOutboundRequest {
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

            Box::pin(async move { Ok(response) })
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

    fn request(url: &'static str) -> BackendRequest<'static> {
        BackendRequest {
            authorization: Some("Bearer caller-access-token"),
            body_text: None,
            cookie: None,
            method: "GET",
            origin: None,
            path: TEST_PATH,
            referer: None,
            request_id: None,
            url: Some(url),
        }
    }

    fn outbound_response(status: u16, body_text: impl Into<String>) -> OutboundResponse {
        outbound_response_with_headers(status, body_text, Vec::new())
    }

    fn outbound_response_with_headers(
        status: u16,
        body_text: impl Into<String>,
        headers: Vec<(String, String)>,
    ) -> OutboundResponse {
        let mut response_headers = vec![("content-type".to_owned(), APPLICATION_JSON.to_owned())];
        response_headers.extend(headers);

        OutboundResponse {
            body_text: body_text.into(),
            headers: response_headers,
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

    #[tokio::test]
    async fn caller_token_paginated_list_requires_ws_id() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::default();
        let response = handle_caller_token_paginated_list_route(
            &config.contact_data,
            request("https://backend.example.test/api/v1/infrastructure/test-list"),
            &outbound,
            TEST_SPEC,
        )
        .await
        .expect("route should handle path");

        assert_eq!(response.status, 400);
        assert_eq!(response.body["message"], TEST_SPEC.missing_ws_id_message);
        assert_eq!(outbound.calls().len(), 0);
    }

    #[tokio::test]
    async fn caller_token_paginated_list_requires_supabase_session_token() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::default();
        let response = handle_caller_token_paginated_list_route(
            &config.contact_data,
            BackendRequest {
                authorization: None,
                ..request("https://backend.example.test/api/v1/infrastructure/test-list?ws_id=workspace-1")
            },
            &outbound,
            TEST_SPEC,
        )
        .await
        .expect("route should handle path");

        assert_eq!(response.status, 401);
        assert_eq!(response.body["message"], "Unauthorized");
        assert_eq!(outbound.calls().len(), 0);
    }

    #[tokio::test]
    async fn caller_token_paginated_list_reads_rows_with_exact_count() {
        let config = backend_config_with_contact_data();
        let outbound =
            RecordingOutboundClient::with_responses(vec![outbound_response_with_headers(
                200,
                r#"[{"id":"row-1","ws_id":"workspace-1"}]"#,
                vec![("Content-Range".to_owned(), "50-74/321".to_owned())],
            )]);
        let response = handle_caller_token_paginated_list_route(
            &config.contact_data,
            request(
                "https://backend.example.test/api/v1/infrastructure/test-list?ws_id=workspace-1&limit=25&offset=50",
            ),
            &outbound,
            TEST_SPEC,
        )
        .await
        .expect("route should handle path");

        assert_eq!(response.status, 200);
        assert_eq!(response.body["data"][0]["id"], "row-1");
        assert_eq!(response.body["count"], 321);

        let calls = outbound.calls();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].method, OutboundMethod::Get);
        assert_eq!(
            calls[0].url,
            "https://project-ref.supabase.co/rest/v1/test_rows?select=*&ws_id=eq.workspace-1"
        );
        assert_eq!(recorded_header(&calls[0], "Accept"), Some(APPLICATION_JSON));
        assert_eq!(
            recorded_header(&calls[0], "Authorization"),
            Some("Bearer caller-access-token")
        );
        assert_eq!(
            recorded_header(&calls[0], "apikey"),
            Some("test-service-role-secret")
        );
        assert_eq!(recorded_header(&calls[0], "Range-Unit"), Some("items"));
        assert_eq!(recorded_header(&calls[0], "Range"), Some("50-74"));
        assert_eq!(recorded_header(&calls[0], "Prefer"), Some("count=exact"));
    }

    #[tokio::test]
    async fn caller_token_paginated_list_preserves_parse_int_style_range_values() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::default();
        let response = handle_caller_token_paginated_list_route(
            &config.contact_data,
            request(
                "https://backend.example.test/api/v1/infrastructure/test-list?ws_id=workspace-1&limit=25px&offset=bad",
            ),
            &outbound,
            TEST_SPEC,
        )
        .await
        .expect("route should handle path");

        assert_eq!(response.status, 200);

        let calls = outbound.calls();
        assert_eq!(recorded_header(&calls[0], "Range"), Some("NaN-NaN"));
    }

    #[tokio::test]
    async fn caller_token_paginated_list_returns_legacy_error_on_supabase_failure() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(vec![outbound_response(
            500,
            r#"{"message":"failed"}"#,
        )]);
        let response = handle_caller_token_paginated_list_route(
            &config.contact_data,
            request(
                "https://backend.example.test/api/v1/infrastructure/test-list?ws_id=workspace-1",
            ),
            &outbound,
            TEST_SPEC,
        )
        .await
        .expect("route should handle path");

        assert_eq!(response.status, 500);
        assert_eq!(response.body["message"], TEST_SPEC.error_message);
    }
}
