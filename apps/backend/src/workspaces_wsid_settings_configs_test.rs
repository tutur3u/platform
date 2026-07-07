use crate::{
    BackendConfig, BackendRequest, contact, handle_backend_request,
    outbound::{
        OutboundError, OutboundFuture, OutboundHeader, OutboundHttpClient, OutboundMethod,
        OutboundRequest, OutboundResponse,
    },
};
use serde_json::json;
use std::{
    cell::RefCell,
    collections::{HashMap, VecDeque},
};

const SERVICE_ROLE_KEY: &str = "test-service-role-secret";
const SETTINGS_CONFIGS_PATH: &str = "/api/v1/workspaces/ws-1/settings/configs";
const SETTINGS_CONFIGS_URL: &str = "https://tuturuuu.localhost/api/v1/workspaces/ws-1/settings/configs?ids=default_wallet_id,default_category_id,DEFAULT_SUBSCRIPTION_CATEGORY_ID,DEFAULT_CURRENCY";
const TEST_APP_SESSION_SECRET: &str = "test-app-session-secret";

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

fn outbound_response(status: u16, body_text: &'static str) -> OutboundResponse {
    OutboundResponse {
        body_text: body_text.to_owned(),
        headers: Vec::new(),
        status,
    }
}

fn backend_config_with_contact_data() -> BackendConfig {
    let mut config = BackendConfig::new("test", "backend");
    config
        .app_coordination_secrets
        .push(TEST_APP_SESSION_SECRET.to_owned());
    config.contact_data =
        contact::ContactDataConfig::new("https://project-ref.supabase.co/", SERVICE_ROLE_KEY);
    config
}

fn request_with_bearer(authorization: &str) -> BackendRequest<'_> {
    BackendRequest {
        authorization: Some(authorization),
        body_text: None,
        cookie: None,
        method: "GET",
        origin: None,
        path: SETTINGS_CONFIGS_PATH,
        referer: None,
        request_id: None,
        url: Some(SETTINGS_CONFIGS_URL),
    }
}

fn app_session_token(target_app: &str, scopes: Vec<String>) -> String {
    let header = contact::encode_app_session_part(br#"{"alg":"HS256","typ":"JWT"}"#);
    let payload = contact::encode_app_session_part(
        serde_json::to_string(&contact::AppCoordinationClaims {
            aud: contact::app_coordination_token_audience().to_owned(),
            email: Some("finance@example.com".to_owned()),
            exp: 4_102_444_800,
            iat: 1_700_000_000,
            iss: contact::app_coordination_token_issuer().to_owned(),
            jti: "workspace-settings-configs-test".to_owned(),
            origin_app: "finance".to_owned(),
            scopes,
            sub: "finance-user-1".to_owned(),
            target_app: target_app.to_owned(),
            typ: "app_coordination".to_owned(),
        })
        .expect("app-session payload"),
    );
    let unsigned = format!("{header}.{payload}");
    let signature = contact::sign_app_coordination_content(&unsigned, TEST_APP_SESSION_SECRET)
        .expect("app-session signature");

    format!(
        "{}{unsigned}.{signature}",
        contact::app_coordination_token_prefix()
    )
}

fn finance_app_session_bearer() -> String {
    format!(
        "Bearer {}",
        app_session_token("finance", vec![contact::APP_SESSION_SCOPE.to_owned()])
    )
}

fn query_params(url: &str) -> HashMap<String, String> {
    url::Url::parse(url)
        .expect("request url")
        .query_pairs()
        .into_owned()
        .collect()
}

#[tokio::test]
async fn invoice_creators_can_read_invoice_defaults_with_app_session() {
    let bearer = finance_app_session_bearer();
    let outbound = RecordingOutboundClient::with_responses(vec![
        outbound_response(200, r#"[{"id":"resolved-ws"}]"#),
        outbound_response(200, "true"),
        outbound_response(
            200,
            r#"[
              {"id":"default_wallet_id","value":"wallet-1"},
              {"id":"default_category_id","value":"category-general"},
              {"id":"DEFAULT_CURRENCY","value":"VND"}
            ]"#,
        ),
    ]);

    let response = handle_backend_request(
        &backend_config_with_contact_data(),
        request_with_bearer(&bearer),
        &outbound,
    )
    .await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.body,
        json!({
            "DEFAULT_CURRENCY": "VND",
            "DEFAULT_SUBSCRIPTION_CATEGORY_ID": null,
            "default_category_id": "category-general",
            "default_wallet_id": "wallet-1"
        })
    );

    let calls = outbound.calls();
    assert_eq!(calls.len(), 3);
    assert!(calls[0].url.contains("/rest/v1/workspaces?"));
    assert_eq!(calls[1].method, OutboundMethod::Post);
    assert_eq!(
        calls[1].body.as_deref(),
        Some(
            r#"{"p_permission":"create_invoices","p_user_id":"finance-user-1","p_ws_id":"resolved-ws"}"#
        )
    );
    assert_eq!(
        recorded_header(&calls[1], "Authorization"),
        Some("Bearer test-service-role-secret")
    );
    assert!(calls[2].url.contains("/rest/v1/workspace_configs?"));

    let config_params = query_params(&calls[2].url);
    assert_eq!(
        config_params.get("id").map(String::as_str),
        Some(
            "in.(default_wallet_id,default_category_id,DEFAULT_SUBSCRIPTION_CATEGORY_ID,DEFAULT_CURRENCY)"
        )
    );
    assert_eq!(
        config_params.get("ws_id").map(String::as_str),
        Some("eq.resolved-ws")
    );
    assert_eq!(
        recorded_header(&calls[2], "Authorization"),
        Some("Bearer test-service-role-secret")
    );
}
