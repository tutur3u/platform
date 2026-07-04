use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const EDUCATION_ACCESS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const EDUCATION_ACCESS_PATH_SUFFIX: &str = "/education/access";
const EDUCATION_PERMISSION: &str = "ai_lab";
const ENABLE_EDUCATION_SECRET: &str = "ENABLE_EDUCATION";
const WORKSPACE_SECRETS_TABLE: &str = "workspace_secrets";

#[derive(Serialize)]
struct WorkspaceEducationAccessResponse {
    enabled: bool,
}

#[derive(Deserialize)]
struct WorkspaceSecretRow {
    value: Option<String>,
}

pub(crate) async fn handle_workspace_education_access_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = workspace_education_access_ws_id(request.path)?;

    Some(match request.method {
        "GET" => workspace_education_access_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn workspace_education_access_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if supabase_auth::request_access_token(request).is_none() {
        return unauthorized_response();
    }

    let authorization = match authorize_workspace_permission(
        &config.contact_data,
        request,
        ws_id,
        EDUCATION_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => return unauthorized_response(),
        Err(
            WorkspacePermissionAuthorizationError::Forbidden
            | WorkspacePermissionAuthorizationError::Internal
            | WorkspacePermissionAuthorizationError::NotFound,
        ) => return education_access_response(false),
    };

    education_access_response(
        education_workspace_enabled(&config.contact_data, outbound, &authorization.ws_id)
            .await
            .unwrap_or(false),
    )
}

async fn education_workspace_enabled(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        WORKSPACE_SECRETS_TABLE,
        &[
            ("select", "value".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("name", format!("eq.{ENABLE_EDUCATION_SECRET}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceSecretRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.value)
        .is_some_and(|value| value.trim().eq_ignore_ascii_case("true")))
}

fn workspace_education_access_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(EDUCATION_ACCESS_PATH_PREFIX)?
        .strip_suffix(EDUCATION_ACCESS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn education_access_response(enabled: bool) -> BackendResponse {
    no_store_response(json_response(
        200,
        WorkspaceEducationAccessResponse { enabled },
    ))
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(401, json!({ "error": "Unauthorized" })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::outbound::{
        OutboundError, OutboundFuture, OutboundHeader, OutboundRequest, OutboundResponse,
    };
    use crate::{BackendRequest, handle_backend_request};
    use serde_json::Value;
    use std::{cell::RefCell, collections::VecDeque};

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

    fn outbound_response(status: u16, body_text: &'static str) -> OutboundResponse {
        OutboundResponse {
            body_text: body_text.to_owned(),
            headers: Vec::new(),
            status,
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
            path: leaked_test_str(format!(
                "/api/v1/workspaces/{WORKSPACE_ID}/education/access"
            )),
            referer: None,
            request_id: None,
            url: Some(leaked_test_str(format!(
                "https://tuturuuu.localhost/api/v1/workspaces/{WORKSPACE_ID}/education/access"
            ))),
        }
    }

    fn authorized_request(method: &'static str) -> BackendRequest<'static> {
        BackendRequest {
            authorization: Some("Bearer user-access-token"),
            ..request(method)
        }
    }

    fn leaked_test_str(value: String) -> &'static str {
        Box::leak(value.into_boxed_str())
    }

    fn successful_member_responses(secret_body: &'static str) -> Vec<OutboundResponse> {
        vec![
            outbound_response(200, r#"{"id":"user-1"}"#),
            outbound_response(200, r#"[{"type":"MEMBER"}]"#),
            outbound_response(200, r#"[{"creator_id":"owner-1"}]"#),
            outbound_response(
                200,
                r#"[{"workspace_roles":{"workspace_role_permissions":[{"permission":"ai_lab"}]}}]"#,
            ),
            outbound_response(200, r#"[]"#),
            outbound_response(200, secret_body),
        ]
    }

    fn assert_access_response(response: &BackendResponse, enabled: bool) {
        assert_eq!(response.status, 200);
        assert_eq!(response.body, json!({ "enabled": enabled }));
    }

    #[tokio::test]
    async fn workspace_education_access_requires_auth() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::default();

        let response = handle_backend_request(&config, request("GET"), &outbound).await;

        assert_eq!(response.status, 401);
        assert_eq!(response.body, json!({ "error": "Unauthorized" }));
        assert_eq!(outbound.calls().len(), 0);
    }

    #[tokio::test]
    async fn workspace_education_access_returns_enabled_for_feature_and_permission() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(successful_member_responses(
            r#"[{"value":"true"}]"#,
        ));

        let response = handle_backend_request(&config, authorized_request("GET"), &outbound).await;

        assert_access_response(&response, true);

        let calls = outbound.calls();
        assert_eq!(calls.len(), 6);
        assert_eq!(calls[0].method, OutboundMethod::Get);
        assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
        assert_eq!(
            recorded_header(&calls[0], "Authorization"),
            Some("Bearer user-access-token")
        );
        assert!(
            calls[5]
                .url
                .starts_with("https://project-ref.supabase.co/rest/v1/workspace_secrets?")
        );
        assert!(calls[5].url.contains(&format!("ws_id=eq.{WORKSPACE_ID}")));
        assert!(calls[5].url.contains("name=eq.ENABLE_EDUCATION"));
        assert_eq!(
            recorded_header(&calls[5], "Authorization"),
            Some("Bearer test-service-role-secret")
        );
    }

    #[tokio::test]
    async fn workspace_education_access_returns_disabled_when_secret_is_not_true() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(successful_member_responses(
            r#"[{"value":"false"}]"#,
        ));

        let response = handle_backend_request(&config, authorized_request("GET"), &outbound).await;

        assert_access_response(&response, false);
    }

    #[tokio::test]
    async fn workspace_education_access_collapses_permission_failures_to_false() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(vec![
            outbound_response(200, r#"{"id":"user-1"}"#),
            outbound_response(200, r#"[{"type":"MEMBER"}]"#),
            outbound_response(200, r#"[{"creator_id":"owner-1"}]"#),
            outbound_response(200, r#"[]"#),
            outbound_response(200, r#"[]"#),
        ]);

        let response = handle_backend_request(&config, authorized_request("GET"), &outbound).await;

        assert_access_response(&response, false);
        assert_eq!(outbound.calls().len(), 5);
    }

    #[tokio::test]
    async fn workspace_education_access_collapses_secret_failures_to_false() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(successful_member_responses(
            r#"{"message":"bad"}"#,
        ));

        let response = handle_backend_request(&config, authorized_request("GET"), &outbound).await;

        assert_access_response(&response, false);
    }

    #[tokio::test]
    async fn workspace_education_access_rejects_invalid_auth() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(vec![outbound_response(
            401,
            r#"{"message":"JWT expired"}"#,
        )]);

        let response = handle_backend_request(&config, authorized_request("GET"), &outbound).await;

        assert_eq!(response.status, 401);
        assert_eq!(response.body, json!({ "error": "Unauthorized" }));
        assert_eq!(outbound.calls().len(), 1);
    }

    #[tokio::test]
    async fn workspace_education_access_rejects_unsupported_methods() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::default();

        let response = handle_backend_request(&config, request("POST"), &outbound).await;

        assert_eq!(response.status, 405);
        assert_eq!(response.allow, Some("GET"));
        assert_eq!(outbound.calls().len(), 0);
    }

    #[test]
    fn workspace_education_access_response_is_camel_case_stable() {
        let response = education_access_response(true);

        assert_eq!(
            serde_json::to_value(WorkspaceEducationAccessResponse { enabled: true })
                .expect("education access response serializes"),
            Value::Object(
                [("enabled".to_owned(), Value::Bool(true))]
                    .into_iter()
                    .collect()
            )
        );
        assert_eq!(response.body, json!({ "enabled": true }));
    }
}
