use serde_json::{Number, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    infrastructure_paginated_list::{parse_js_parse_int_prefix, total_count_from_content_range},
    infrastructure_root_auth::{RootWorkspaceReadAuthError, authorize_root_workspace_read},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

pub(crate) const ABUSE_EVENTS_PATH: &str = "/api/v1/infrastructure/abuse-events";

const ABUSE_EVENTS_TABLE: &str = "abuse_events";
const ERROR_MESSAGE: &str = "Error fetching abuse events";

#[derive(Clone, Debug, Eq, PartialEq)]
struct AbuseEventsQuery {
    event_type: Option<String>,
    ip_filter: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
    success_filter: Option<bool>,
}

pub(crate) async fn handle_abuse_events_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != ABUSE_EVENTS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => abuse_events_response(config, request, outbound).await,
        method => method_not_allowed(method, "GET"),
    })
}

async fn abuse_events_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let access_token = match authorize_root_workspace_read(config, request, outbound).await {
        Ok(access_token) => access_token,
        Err(RootWorkspaceReadAuthError::Unauthorized) => {
            return no_store_response(json_response(401, json!({ "message": "Unauthorized" })));
        }
        Err(RootWorkspaceReadAuthError::Forbidden) => {
            return no_store_response(json_response(403, json!({ "message": "Forbidden" })));
        }
    };
    let query = abuse_events_query_from_url(request.url);
    let response =
        match fetch_abuse_events(&config.contact_data, outbound, &access_token, &query).await {
            Ok(response) => response,
            Err(()) => return abuse_events_error_response(),
        };
    let count = total_count_from_content_range(&response);
    let rows = match response.json::<Vec<Value>>() {
        Ok(rows) => rows,
        Err(_) => return abuse_events_error_response(),
    };

    no_store_response(json_response(
        200,
        json!({
            "data": rows,
            "count": count_value(count),
            "page": query_number_value(query.page),
            "pageSize": query_number_value(query.page_size),
            "totalPages": total_pages_value(count, query.page_size),
        }),
    ))
}

async fn fetch_abuse_events(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
    query: &AbuseEventsQuery,
) -> Result<OutboundResponse, ()> {
    let mut params = vec![
        ("select", "*".to_owned()),
        ("order", "created_at.desc".to_owned()),
    ];

    if let Some(ip_filter) = &query.ip_filter {
        params.push(("ip_address", format!("ilike.%{ip_filter}%")));
    }
    if let Some(event_type) = &query.event_type {
        params.push(("event_type", format!("eq.{event_type}")));
    }
    if let Some(success_filter) = query.success_filter {
        params.push(("success", format!("eq.{success_filter}")));
    }

    let Some(url) = contact_data.rest_url(ABUSE_EVENTS_TABLE, &params) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {access_token}");
    let range = abuse_events_range(query);
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

    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(response)
}

fn abuse_events_query_from_url(request_url: Option<&str>) -> AbuseEventsQuery {
    let mut query = AbuseEventsQuery {
        event_type: None,
        ip_filter: None,
        page: Some(1),
        page_size: Some(50),
        success_filter: None,
    };
    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return query;
    };
    let mut saw_event_type = false;
    let mut saw_ip = false;
    let mut saw_page = false;
    let mut saw_page_size = false;
    let mut saw_success = false;

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "ip" if !saw_ip => {
                let value = value.into_owned();
                if !value.is_empty() {
                    query.ip_filter = Some(value);
                }
                saw_ip = true;
            }
            "type" if !saw_event_type => {
                let value = value.into_owned();
                if !value.is_empty() {
                    query.event_type = Some(value);
                }
                saw_event_type = true;
            }
            "success" if !saw_success => {
                query.success_filter = Some(value == "true");
                saw_success = true;
            }
            "page" if !saw_page => {
                query.page = parse_query_int_with_default(&value, 1);
                saw_page = true;
            }
            "pageSize" if !saw_page_size => {
                query.page_size = parse_query_int_with_default(&value, 50);
                saw_page_size = true;
            }
            _ => {}
        }
    }

    query
}

fn parse_query_int_with_default(value: &str, default_value: i64) -> Option<i64> {
    if value.is_empty() {
        return Some(default_value);
    }

    parse_js_parse_int_prefix(value)
}

fn abuse_events_range(query: &AbuseEventsQuery) -> String {
    let (Some(page), Some(page_size)) = (query.page, query.page_size) else {
        return "NaN-NaN".to_owned();
    };
    let Some(start) = page
        .checked_sub(1)
        .and_then(|page_index| page_index.checked_mul(page_size))
    else {
        return "NaN-NaN".to_owned();
    };
    let Some(end) = start
        .checked_add(page_size)
        .and_then(|value| value.checked_sub(1))
    else {
        return "NaN-NaN".to_owned();
    };

    format!("{start}-{end}")
}

fn count_value(count: Option<usize>) -> Value {
    count
        .and_then(|count| u64::try_from(count).ok())
        .map(|count| Value::Number(Number::from(count)))
        .unwrap_or(Value::Null)
}

fn query_number_value(value: Option<i64>) -> Value {
    value
        .map(|value| Value::Number(Number::from(value)))
        .unwrap_or(Value::Null)
}

fn total_pages_value(count: Option<usize>, page_size: Option<i64>) -> Value {
    let Some(count) = count else {
        return json!(0);
    };
    if count == 0 {
        return json!(0);
    }
    let Some(page_size) = page_size.filter(|page_size| *page_size != 0) else {
        return Value::Null;
    };

    let total_pages = (count as f64 / page_size as f64).ceil();
    if !total_pages.is_finite() {
        return Value::Null;
    }
    if total_pages >= i64::MIN as f64 && total_pages <= i64::MAX as f64 {
        return Value::Number(Number::from(total_pages as i64));
    }

    Number::from_f64(total_pages)
        .map(Value::Number)
        .unwrap_or(Value::Null)
}

fn abuse_events_error_response() -> BackendResponse {
    no_store_response(json_response(500, json!({ "message": ERROR_MESSAGE })))
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
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

    fn request(url: Option<&'static str>) -> BackendRequest<'static> {
        BackendRequest {
            authorization: Some("Bearer caller-access-token"),
            body_text: None,
            cookie: None,
            if_none_match: None,
            method: "GET",
            origin: None,
            path: ABUSE_EVENTS_PATH,
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

    fn outbound_response_with_count(
        status: u16,
        body_text: impl Into<String>,
        content_range: &str,
    ) -> OutboundResponse {
        OutboundResponse {
            body_text: body_text.into(),
            headers: vec![
                ("content-type".to_owned(), APPLICATION_JSON.to_owned()),
                ("content-range".to_owned(), content_range.to_owned()),
            ],
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
    async fn abuse_events_rejects_missing_auth() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(Vec::new());
        let mut request = request(Some(
            "https://backend.test/api/v1/infrastructure/abuse-events",
        ));
        request.authorization = None;

        let response = handle_abuse_events_route(&config, request, &outbound)
            .await
            .expect("route should handle abuse-events GET");

        assert_eq!(response.status, 401);
        assert_eq!(response.body["message"], "Unauthorized");
        assert!(outbound.calls().is_empty());
    }

    #[tokio::test]
    async fn abuse_events_rejects_non_root_membership() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(vec![
            outbound_response(200, r#"{"id":"user-1"}"#),
            outbound_response(200, r#"[]"#),
        ]);

        let response = handle_abuse_events_route(
            &config,
            request(Some(
                "https://backend.test/api/v1/infrastructure/abuse-events",
            )),
            &outbound,
        )
        .await
        .expect("route should handle abuse-events GET");

        assert_eq!(response.status, 403);
        assert_eq!(response.body["message"], "Forbidden");
        assert_eq!(outbound.calls().len(), 2);
    }

    #[tokio::test]
    async fn abuse_events_reads_filtered_paginated_rows_with_caller_token() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(vec![
            outbound_response(200, r#"{"id":"user-1"}"#),
            outbound_response(200, r#"[{"id":"link-1"}]"#),
            outbound_response_with_count(
                206,
                r#"[{"id":"event-1","event_type":"login_failure","success":false}]"#,
                "50-99/123",
            ),
        ]);

        let response = handle_abuse_events_route(
            &config,
            request(Some(
                "https://backend.test/api/v1/infrastructure/abuse-events?ip=10.0&type=login_failure&success=nope&page=2&pageSize=50",
            )),
            &outbound,
        )
        .await
        .expect("route should handle abuse-events GET");

        assert_eq!(response.status, 200);
        assert_eq!(response.body["count"], 123);
        assert_eq!(response.body["page"], 2);
        assert_eq!(response.body["pageSize"], 50);
        assert_eq!(response.body["totalPages"], 3);
        assert_eq!(response.body["data"][0]["id"], "event-1");

        let calls = outbound.calls();
        assert_eq!(calls.len(), 3);
        assert!(calls[2].url.contains("abuse_events"));
        assert!(calls[2].url.contains("order=created_at.desc"));
        assert!(calls[2].url.contains("ip_address=ilike.%2510.0%25"));
        assert!(calls[2].url.contains("event_type=eq.login_failure"));
        assert!(calls[2].url.contains("success=eq.false"));
        assert_eq!(
            recorded_header(&calls[2], "Authorization"),
            Some("Bearer caller-access-token")
        );
        assert_eq!(recorded_header(&calls[2], "Range"), Some("50-99"));
        assert_eq!(recorded_header(&calls[2], "Prefer"), Some("count=exact"));
    }

    #[test]
    fn abuse_events_preserves_parse_int_and_json_null_edges() {
        let query = abuse_events_query_from_url(Some(
            "https://backend.test/api/v1/infrastructure/abuse-events?page=abc&pageSize=0&success=",
        ));

        assert_eq!(query.page, None);
        assert_eq!(query.page_size, Some(0));
        assert_eq!(query.success_filter, Some(false));
        assert_eq!(abuse_events_range(&query), "NaN-NaN");
        assert_eq!(query_number_value(query.page), Value::Null);
        assert_eq!(total_pages_value(Some(12), query.page_size), Value::Null);
    }
}
