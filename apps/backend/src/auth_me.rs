use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const AUTH_ME_PATH: &str = "/api/auth/me";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";

pub(crate) async fn handle_auth_me_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != AUTH_ME_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => auth_me_response(&config.contact_data, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn auth_me_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return unauthorized_response();
    };

    let Some(user) = fetch_supabase_auth_user_value(contact_data, &access_token, outbound).await
    else {
        return unauthorized_response();
    };

    no_store_response(json_response(
        200,
        json!({
            "user": user,
        }),
    ))
}

async fn fetch_supabase_auth_user_value(
    contact_data: &contact::ContactDataConfig,
    access_token: &str,
    outbound: &impl OutboundHttpClient,
) -> Option<Value> {
    let user_url = contact_data.auth_url("user")?;
    let service_role_key = contact_data.service_role_key()?;
    let authorization = format!("Bearer {access_token}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &user_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .ok()?;

    if !(200..300).contains(&response.status) {
        return None;
    }

    response.json::<Value>().ok()
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(
        401,
        json!({
            "message": UNAUTHORIZED_MESSAGE,
        }),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::outbound::{OutboundFuture, OutboundResponse};
    use std::{cell::RefCell, collections::VecDeque};

    #[derive(Clone, Debug, Eq, PartialEq)]
    struct RecordedOutboundRequest {
        body: Option<String>,
        headers: Vec<(String, String)>,
        method: OutboundMethod,
        url: String,
    }

    struct RecordingOutboundClient {
        calls: RefCell<Vec<RecordedOutboundRequest>>,
        responses: RefCell<VecDeque<OutboundResponse>>,
    }

    impl RecordingOutboundClient {
        fn with_response(status: u16, body_text: impl Into<String>) -> Self {
            Self {
                calls: RefCell::new(Vec::new()),
                responses: RefCell::new(VecDeque::from([OutboundResponse {
                    body_text: body_text.into(),
                    headers: vec![("content-type".to_owned(), APPLICATION_JSON.to_owned())],
                    status,
                }])),
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
                    .map(|header| (header.name.to_owned(), header.value.to_owned()))
                    .collect(),
                method: request.method,
                url: request.url.to_owned(),
            });
            let response =
                self.responses
                    .borrow_mut()
                    .pop_front()
                    .unwrap_or_else(|| OutboundResponse {
                        body_text: r#"{"ok":true}"#.to_owned(),
                        headers: vec![("content-type".to_owned(), APPLICATION_JSON.to_owned())],
                        status: 200,
                    });

            Box::pin(async move { Ok(response) })
        }
    }

    fn backend_config_with_contact_data() -> BackendConfig {
        let mut config = BackendConfig::new("test", "backend");
        config.contact_data = contact::ContactDataConfig::new(
            "https://project-ref.supabase.co/",
            "test-service-role-secret",
        );
        config
    }

    fn request(method: &'static str) -> BackendRequest<'static> {
        BackendRequest {
            authorization: None,
            body_text: None,
            cookie: None,
            method,
            origin: None,
            path: AUTH_ME_PATH,
            referer: None,
            request_id: None,
            url: Some("https://tuturuuu.localhost/api/auth/me"),
        }
    }

    fn request_with_bearer(access_token: &'static str) -> BackendRequest<'static> {
        BackendRequest {
            authorization: Some(access_token),
            ..request("GET")
        }
    }

    fn request_with_cookie<'a>(cookie: &'a str) -> BackendRequest<'a> {
        BackendRequest {
            cookie: Some(cookie),
            ..request("GET")
        }
    }

    fn supabase_auth_cookie_header(access_token: &str) -> String {
        format!(
            "sb-project-ref-auth-token=base64-{}",
            contact::encode_app_session_part(format!(r#"{{"access_token":"{access_token}"}}"#))
        )
    }

    fn recorded_header<'a>(request: &'a RecordedOutboundRequest, name: &str) -> Option<&'a str> {
        request
            .headers
            .iter()
            .find(|(header_name, _)| header_name.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }

    fn assert_no_store_json(response: &BackendResponse) {
        assert_eq!(response.content_type, Some(APPLICATION_JSON));
        assert_eq!(
            response.cache_control,
            Some("no-store, no-cache, must-revalidate")
        );
        assert!(
            response
                .headers
                .iter()
                .any(|(name, value)| *name == "cdn-cache-control" && value == "no-store")
        );
    }

    #[tokio::test]
    async fn auth_me_requires_authenticated_supabase_session() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_response(
            200,
            r#"{"id":"user-123","email":"ada@example.com"}"#,
        );

        let response = crate::handle_backend_request(&config, request("GET"), &outbound).await;

        assert_eq!(response.status, 401);
        assert_eq!(response.body, json!({ "message": "Unauthorized" }));
        assert_no_store_json(&response);
        assert_eq!(outbound.calls().len(), 0);
    }

    #[tokio::test]
    async fn auth_me_revalidates_bearer_token_and_returns_legacy_user_shape() {
        let config = backend_config_with_contact_data();
        let supabase_user = json!({
            "app_metadata": {
                "provider": "email",
            },
            "aud": "authenticated",
            "email": "ada@example.com",
            "id": "user-123",
            "user_metadata": {
                "full_name": "Ada Lovelace",
            },
        });
        let outbound = RecordingOutboundClient::with_response(200, supabase_user.to_string());

        let response = crate::handle_backend_request(
            &config,
            request_with_bearer("Bearer supabase-access-token"),
            &outbound,
        )
        .await;

        assert_eq!(response.status, 200);
        assert_eq!(response.body, json!({ "user": supabase_user }));
        assert_no_store_json(&response);

        let calls = outbound.calls();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].method, OutboundMethod::Get);
        assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
        assert_eq!(recorded_header(&calls[0], "Accept"), Some(APPLICATION_JSON));
        assert_eq!(
            recorded_header(&calls[0], "Authorization"),
            Some("Bearer supabase-access-token")
        );
        assert_eq!(
            recorded_header(&calls[0], "apikey"),
            Some("test-service-role-secret")
        );
    }

    #[tokio::test]
    async fn auth_me_revalidates_supabase_auth_cookie() {
        let config = backend_config_with_contact_data();
        let cookie = supabase_auth_cookie_header("browser-access-token");
        let outbound = RecordingOutboundClient::with_response(
            200,
            r#"{"id":"user-123","email":"ada@example.com"}"#,
        );

        let response =
            crate::handle_backend_request(&config, request_with_cookie(&cookie), &outbound).await;

        assert_eq!(response.status, 200);
        assert_eq!(response.body["user"]["id"], "user-123");
        assert_no_store_json(&response);

        let calls = outbound.calls();
        assert_eq!(calls.len(), 1);
        assert_eq!(
            recorded_header(&calls[0], "Authorization"),
            Some("Bearer browser-access-token")
        );
    }

    #[tokio::test]
    async fn auth_me_rejects_failed_supabase_revalidation() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_response(401, r#"{"message":"JWT expired"}"#);

        let response = crate::handle_backend_request(
            &config,
            request_with_bearer("Bearer stale-access-token"),
            &outbound,
        )
        .await;

        assert_eq!(response.status, 401);
        assert_eq!(response.body, json!({ "message": "Unauthorized" }));
        assert_no_store_json(&response);
        assert_eq!(outbound.calls().len(), 1);
    }

    #[tokio::test]
    async fn auth_me_rejects_unsupported_methods_with_allow_get() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_response(
            200,
            r#"{"id":"user-123","email":"ada@example.com"}"#,
        );

        let response = crate::handle_backend_request(&config, request("POST"), &outbound).await;

        assert_eq!(response.status, 405);
        assert_eq!(response.allow, Some("GET"));
        assert_eq!(response.body, json!({ "error": "method not allowed" }));
        assert_no_store_json(&response);
        assert_eq!(outbound.calls().len(), 0);
    }
}
