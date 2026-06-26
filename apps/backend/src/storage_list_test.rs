use crate::{
    BackendConfig, BackendRequest, contact, handle_backend_request,
    outbound::{
        OutboundError, OutboundFuture, OutboundHeader, OutboundHttpClient, OutboundMethod,
        OutboundRequest, OutboundResponse,
    },
};
use serde_json::{Value, json};
use std::{cell::RefCell, collections::VecDeque};

const API_KEY_HASH: &str = "test-plain:ttr_test_storage_key";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const SERVICE_ROLE_KEY: &str = "test-service-role-secret";
const STORAGE_LIST_PATH: &str = "/api/v1/storage/list";
const STORAGE_LIST_URL: &str = "https://tuturuuu.localhost/api/v1/storage/list";
const STORAGE_LIST_FILTERED_URL: &str = "https://tuturuuu.localhost/api/v1/storage/list?path=docs&search=Report&limit=2&offset=1&sortBy=size&sortOrder=desc";
const WORKSPACE_ID: &str = "11111111-1111-4111-8111-111111111111";

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
            responses: RefCell::new(responses.into()),
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
            headers: recorded_headers(&request.headers),
            method: request.method,
            url: request.url.to_owned(),
        });

        let response = self.responses.borrow_mut().pop_front();

        Box::pin(async move {
            response.ok_or_else(|| OutboundError::Transport("missing test response".to_owned()))
        })
    }
}

fn recorded_headers(headers: &[OutboundHeader<'_>]) -> Vec<(String, String)> {
    headers
        .iter()
        .map(|header| (header.name.to_owned(), header.value.to_owned()))
        .collect()
}

fn recorded_header<'a>(request: &'a RecordedOutboundRequest, name: &str) -> Option<&'a str> {
    request
        .headers
        .iter()
        .find(|(header_name, _)| header_name.eq_ignore_ascii_case(name))
        .map(|(_, value)| value.as_str())
}

fn query_value(request: &RecordedOutboundRequest, key: &str) -> Option<String> {
    url::Url::parse(&request.url)
        .ok()?
        .query_pairs()
        .find(|(query_key, _)| query_key == key)
        .map(|(_, value)| value.into_owned())
}

fn request_body_json(request: &RecordedOutboundRequest) -> Value {
    serde_json::from_str(request.body.as_deref().expect("request body")).expect("json body")
}

fn outbound_response(status: u16, body_text: &'static str) -> OutboundResponse {
    OutboundResponse {
        body_text: body_text.to_owned(),
        headers: Vec::new(),
        status,
    }
}

fn api_key_row_response(ws_id: &str, role_id: Option<&str>) -> OutboundResponse {
    let body = json!([
        {
            "ws_id": ws_id,
            "role_id": role_id,
            "key_hash": API_KEY_HASH,
            "expires_at": null,
        }
    ]);
    OutboundResponse {
        body_text: body.to_string(),
        headers: Vec::new(),
        status: 200,
    }
}

fn backend_config_with_contact_data() -> BackendConfig {
    let mut config = BackendConfig::new("test", "backend");
    config.contact_data =
        contact::ContactDataConfig::new("https://project-ref.supabase.co/", SERVICE_ROLE_KEY);
    config
}

fn request(method: &'static str, url: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: None,
        body_text: None,
        cookie: None,
        method,
        origin: None,
        path: STORAGE_LIST_PATH,
        referer: None,
        request_id: None,
        url: Some(url),
    }
}

fn request_with_api_key(method: &'static str, url: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some("Bearer ttr_test_storage_key"),
        ..request(method, url)
    }
}

#[tokio::test]
async fn storage_list_returns_filtered_storage_page_with_recursive_count() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        api_key_row_response(WORKSPACE_ID, Some("role-1")),
        outbound_response(200, r#"[{"permission":"comment"}]"#),
        outbound_response(200, r#"[{"permission":"manage_drive"}]"#),
        outbound_response(
            200,
            r#"[
                {"name":"Report Q1.pdf","id":"file-1","metadata":{"size":42}},
                {"name":".emptyFolderPlaceholder","id":"placeholder","metadata":{"size":0}},
                {"name":"Archive","id":null}
            ]"#,
        ),
        outbound_response(
            200,
            r#"[
                {"name":"Report Q1.pdf","id":"file-1"},
                {"name":"notes.txt","id":"file-2"},
                {"name":"Archive","id":null}
            ]"#,
        ),
        outbound_response(200, r#"[{"name":"Report Archive.pdf","id":"file-3"}]"#),
    ]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_api_key("GET", STORAGE_LIST_FILTERED_URL),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.cache_control,
        Some("no-store, no-cache, must-revalidate")
    );
    assert_eq!(
        response.body,
        json!({
            "data": [
                {"name": "Report Q1.pdf", "id": "file-1", "metadata": {"size": 42}},
                {"name": "Archive", "id": null},
            ],
            "pagination": {
                "limit": 2,
                "offset": 1,
                "total": 2,
            },
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 6);
    assert_eq!(calls[0].method, OutboundMethod::Get);
    assert!(calls[0].url.contains("/rest/v1/workspace_api_keys?"));
    assert_eq!(
        query_value(&calls[0], "key_prefix").as_deref(),
        Some("eq.ttr_test_sto")
    );
    assert_eq!(
        recorded_header(&calls[0], "Authorization"),
        Some("Bearer test-service-role-secret")
    );

    assert!(
        calls[1]
            .url
            .contains("/rest/v1/workspace_role_permissions?")
    );
    assert_eq!(
        query_value(&calls[1], "role_id").as_deref(),
        Some("eq.role-1")
    );
    assert!(
        calls[2]
            .url
            .contains("/rest/v1/workspace_default_permissions?")
    );
    assert_eq!(
        query_value(&calls[2], "member_type").as_deref(),
        Some("eq.MEMBER")
    );

    let list_body = request_body_json(&calls[3]);
    assert_eq!(calls[3].method, OutboundMethod::Post);
    assert_eq!(
        calls[3].url,
        "https://project-ref.supabase.co/storage/v1/object/list/workspaces"
    );
    assert_eq!(recorded_header(&calls[3], "apikey"), Some(SERVICE_ROLE_KEY));
    assert_eq!(list_body["prefix"], json!(format!("{WORKSPACE_ID}/docs")));
    assert_eq!(list_body["limit"], json!(2));
    assert_eq!(list_body["offset"], json!(1));
    assert_eq!(list_body["sortBy"]["column"], json!("size"));
    assert_eq!(list_body["sortBy"]["order"], json!("desc"));
    assert_eq!(list_body["search"], json!("Report"));

    let count_root_body = request_body_json(&calls[4]);
    assert_eq!(
        count_root_body["prefix"],
        json!(format!("{WORKSPACE_ID}/docs"))
    );
    assert_eq!(count_root_body["limit"], json!(1000));
    assert_eq!(count_root_body["offset"], json!(0));
    assert_eq!(count_root_body["sortBy"]["column"], json!("name"));
    assert_eq!(count_root_body["sortBy"]["order"], json!("asc"));
    assert!(count_root_body.get("search").is_none());

    let count_archive_body = request_body_json(&calls[5]);
    assert_eq!(
        count_archive_body["prefix"],
        json!(format!("{WORKSPACE_ID}/docs/Archive"))
    );
}

#[tokio::test]
async fn storage_list_rejects_reserved_mobile_deployment_paths() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        api_key_row_response(ROOT_WORKSPACE_ID, None),
        outbound_response(200, r#"[{"permission":"manage_drive"}]"#),
    ]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_api_key(
            "GET",
            "https://tuturuuu.localhost/api/v1/storage/list?path=.tuturuuu/mobile-deployment-vault",
        ),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 403);
    assert_eq!(
        response.body,
        json!({
            "error": "Forbidden",
            "message": "Mobile deployment vault files are managed by the mobile deployment API.",
            "code": "STORAGE_RESERVED_PATH",
        })
    );
    assert_eq!(outbound.calls().len(), 2);
}

#[tokio::test]
async fn storage_list_requires_api_key_and_claims_route() {
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request("GET", STORAGE_LIST_URL),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 401);
    assert_eq!(
        response.body,
        json!({
            "error": "Unauthorized",
            "message": "Missing or invalid Authorization header. Expected: \"Authorization: Bearer <api_key>\"",
            "code": "MISSING_API_KEY",
        })
    );
    assert!(outbound.calls().is_empty());
}

#[tokio::test]
async fn storage_list_rejects_unsupported_methods() {
    let outbound = RecordingOutboundClient::default();

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_api_key("POST", STORAGE_LIST_URL),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 405);
    assert_eq!(response.allow, Some("GET"));
    assert_eq!(response.body, json!({ "error": "method not allowed" }));
    assert!(outbound.calls().is_empty());
}
