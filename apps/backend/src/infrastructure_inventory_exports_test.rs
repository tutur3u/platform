use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, contact, infrastructure_inventory_exports,
    outbound::{
        OutboundFuture, OutboundHeader, OutboundHttpClient, OutboundRequest, OutboundResponse,
    },
};
use serde_json::json;
use std::cell::RefCell;
use std::collections::VecDeque;

const PRODUCT_UNITS_PATH: &str = "/api/v1/infrastructure/product-units";
const WAREHOUSES_PATH: &str = "/api/v1/infrastructure/warehouses";
const PRIVATE_SCHEMA: &str = "private";
const SERVICE_ROLE_KEY: &str = "test-service-role-secret";

#[derive(Clone, Debug, Eq, PartialEq)]
struct RecordedOutboundRequest {
    headers: Vec<(String, String)>,
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
            url: request.url.to_owned(),
        });
        let response = self
            .responses
            .borrow_mut()
            .pop_front()
            .unwrap_or_else(|| outbound_response(200, "[]"));

        Box::pin(async move { Ok(response) })
    }
}

fn backend_config_with_contact_data() -> BackendConfig {
    let mut config = BackendConfig::new("test", "backend-test");
    config
        .app_coordination_secrets
        .push("test-app-session-secret".to_owned());
    config.contact_data =
        contact::ContactDataConfig::new("https://project-ref.supabase.co", SERVICE_ROLE_KEY);
    config
}

fn request(path: &'static str, url: &'static str) -> BackendRequest<'static> {
    BackendRequest {
        authorization: None,
        body_text: None,
        cookie: None,
        method: "GET",
        origin: None,
        path,
        referer: None,
        request_id: None,
        url: Some(url),
    }
}

fn request_with_bearer(
    path: &'static str,
    url: &'static str,
    token: String,
) -> BackendRequest<'static> {
    BackendRequest {
        authorization: Some(Box::leak(format!("Bearer {token}").into_boxed_str())),
        ..request(path, url)
    }
}

fn outbound_response(status: u16, body_text: impl Into<String>) -> OutboundResponse {
    OutboundResponse {
        body_text: body_text.into(),
        headers: vec![
            ("content-type".to_owned(), APPLICATION_JSON.to_owned()),
            ("content-range".to_owned(), "0-0/1".to_owned()),
        ],
        status,
    }
}

fn header<'a>(request: &'a RecordedOutboundRequest, name: &str) -> Option<&'a str> {
    request
        .headers
        .iter()
        .find(|(header, _)| header.eq_ignore_ascii_case(name))
        .map(|(_, value)| value.as_str())
}

fn app_session_claims(target_app: &str) -> contact::AppCoordinationClaims {
    contact::AppCoordinationClaims {
        aud: contact::app_coordination_token_audience().to_owned(),
        email: Some("inventory-app@example.com".to_owned()),
        exp: 4_102_444_800,
        iat: 0,
        iss: contact::app_coordination_token_issuer().to_owned(),
        jti: "test-jti".to_owned(),
        origin_app: "web".to_owned(),
        scopes: vec![contact::APP_SESSION_SCOPE.to_owned()],
        sub: "app-session-user-1".to_owned(),
        target_app: target_app.to_owned(),
        typ: "app_coordination".to_owned(),
    }
}

fn app_session_token(target_app: &str) -> String {
    let encoded_header = contact::encode_app_session_part(r#"{"alg":"HS256","typ":"JWT"}"#);
    let encoded_payload = contact::encode_app_session_part(
        serde_json::to_string(&app_session_claims(target_app)).unwrap(),
    );
    let unsigned = format!("{encoded_header}.{encoded_payload}");
    let signature = contact::sign_app_coordination_content(&unsigned, "test-app-session-secret")
        .expect("test app-session signature");

    format!(
        "{}{unsigned}.{signature}",
        contact::app_coordination_token_prefix()
    )
}

#[tokio::test]
async fn product_units_accepts_inventory_app_session_and_reads_private_rows() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"[{"id":"normalized-ws"}]"#),
        outbound_response(200, r#"[{"type":"MEMBER"}]"#),
        outbound_response(200, r#"[{"creator_id":"other-user"}]"#),
        outbound_response(200, r#"[]"#),
        outbound_response(200, r#"[{"permission":"manage_inventory_setup"}]"#),
        outbound_response(200, r#"[{"id":"unit-1"}]"#),
    ]);
    let response = infrastructure_inventory_exports::handle_inventory_export_route(
        &backend_config_with_contact_data(),
        request_with_bearer(
            PRODUCT_UNITS_PATH,
            "https://backend.test/api/v1/infrastructure/product-units?ws_id=personal&offset=2&limit=3",
            app_session_token("inventory"),
        ),
        &outbound,
    )
    .await
    .expect("product-units route should match");

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "count": 1,
            "data": [
                { "id": "unit-1" }
            ]
        })
    );
    let calls = outbound.calls();
    assert_eq!(calls.len(), 6);
    assert!(calls[0].url.contains("/rest/v1/workspaces?"));
    assert_eq!(
        header(&calls[0], "Authorization"),
        Some("Bearer test-service-role-secret")
    );

    let data_call = calls.last().expect("private inventory row call");
    assert!(data_call.url.contains("/rest/v1/inventory_units?"));
    assert!(data_call.url.contains("ws_id=eq.normalized-ws"));
    assert_eq!(header(data_call, "Accept-Profile"), Some(PRIVATE_SCHEMA));
    assert_eq!(header(data_call, "Content-Profile"), Some(PRIVATE_SCHEMA));
    assert_eq!(
        header(data_call, "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert_eq!(header(data_call, "Range"), Some("2-4"));
    assert_eq!(header(data_call, "Prefer"), Some("count=exact"));
}

#[tokio::test]
async fn product_units_rejects_storefront_app_session_tokens() {
    let outbound = RecordingOutboundClient::with_responses(vec![]);
    let response = infrastructure_inventory_exports::handle_inventory_export_route(
        &backend_config_with_contact_data(),
        request_with_bearer(
            PRODUCT_UNITS_PATH,
            "https://backend.test/api/v1/infrastructure/product-units?ws_id=ws-1",
            app_session_token("storefront"),
        ),
        &outbound,
    )
    .await
    .expect("product-units route should match");

    assert_eq!(response.status, 401);
    assert_eq!(response.body, json!({ "error": "Unauthorized" }));
    assert!(outbound.calls().is_empty());
}

#[tokio::test]
async fn warehouses_rejects_members_without_inventory_read_permission() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"user@example.com"}"#),
        outbound_response(200, r#"[{"type":"MEMBER"}]"#),
        outbound_response(200, r#"[{"creator_id":"other-user"}]"#),
        outbound_response(200, r#"[]"#),
        outbound_response(200, r#"[]"#),
    ]);
    let response = infrastructure_inventory_exports::handle_inventory_export_route(
        &backend_config_with_contact_data(),
        request_with_bearer(
            WAREHOUSES_PATH,
            "https://backend.test/api/v1/infrastructure/warehouses?ws_id=11111111-1111-4111-8111-111111111111",
            "browser-access-token".to_owned(),
        ),
        &outbound,
    )
    .await
    .expect("warehouses route should match");

    assert_eq!(response.status, 403);
    assert_eq!(
        response.body,
        json!({ "message": "Insufficient permissions to view inventory" })
    );
    let calls = outbound.calls();
    assert_eq!(calls.len(), 5);
    assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
    assert_eq!(
        header(&calls[0], "Authorization"),
        Some("Bearer browser-access-token")
    );
    assert!(
        !calls
            .iter()
            .any(|call| call.url.contains("/rest/v1/inventory_warehouses?"))
    );
}

#[tokio::test]
async fn warehouses_maps_private_read_failures_to_legacy_error_body() {
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"{"id":"user-1","email":"user@example.com"}"#),
        outbound_response(200, r#"[{"type":"MEMBER"}]"#),
        outbound_response(200, r#"[{"creator_id":"other-user"}]"#),
        outbound_response(
            200,
            r#"[{"workspace_roles":{"workspace_role_permissions":[{"permission":"update_inventory"}]}}]"#,
        ),
        outbound_response(200, r#"[]"#),
        outbound_response(500, r#"{"message":"database error"}"#),
    ]);
    let response = infrastructure_inventory_exports::handle_inventory_export_route(
        &backend_config_with_contact_data(),
        request_with_bearer(
            WAREHOUSES_PATH,
            "https://backend.test/api/v1/infrastructure/warehouses?ws_id=11111111-1111-4111-8111-111111111111",
            "browser-access-token".to_owned(),
        ),
        &outbound,
    )
    .await
    .expect("warehouses route should match");

    assert_eq!(response.status, 500);
    assert_eq!(
        response.body,
        json!({ "message": "Error fetching inventory_warehouses" })
    );
    let calls = outbound.calls();
    assert_eq!(calls.len(), 6);
    assert!(
        calls
            .last()
            .expect("private inventory row call")
            .url
            .contains("/rest/v1/inventory_warehouses?")
    );
}

#[tokio::test]
async fn inventory_exports_validate_ws_id_and_method_before_outbound_reads() {
    let outbound = RecordingOutboundClient::with_responses(vec![]);
    let missing_ws_response = infrastructure_inventory_exports::handle_inventory_export_route(
        &backend_config_with_contact_data(),
        request(
            PRODUCT_UNITS_PATH,
            "https://backend.test/api/v1/infrastructure/product-units",
        ),
        &outbound,
    )
    .await
    .expect("product-units route should match");

    assert_eq!(missing_ws_response.status, 400);
    assert_eq!(
        missing_ws_response.body,
        json!({ "message": "Missing ws_id parameter" })
    );

    let method_response = infrastructure_inventory_exports::handle_inventory_export_route(
        &backend_config_with_contact_data(),
        BackendRequest {
            method: "POST",
            ..request(
                WAREHOUSES_PATH,
                "https://backend.test/api/v1/infrastructure/warehouses?ws_id=ws-1",
            )
        },
        &outbound,
    )
    .await
    .expect("warehouses route should match");

    assert_eq!(method_response.status, 405);
    assert_eq!(method_response.allow, Some("GET"));
    assert_eq!(method_response.body["error"], "method not allowed");
    assert!(outbound.calls().is_empty());
}
