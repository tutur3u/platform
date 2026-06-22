use serde::Serialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

pub(crate) const SUSPENSIONS_PATH: &str = "/api/v1/infrastructure/suspensions";

const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";
const MANAGE_WORKSPACE_ROLES_PERMISSION: &str = "manage_workspace_roles";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const SUSPENSIONS_TABLE: &str = "user_suspensions";
const SUSPENSIONS_LOAD_ERROR: &str = "Failed to fetch suspensions";

#[derive(Serialize)]
struct HasWorkspacePermissionRequest<'a> {
    p_permission: &'a str,
    p_user_id: &'a str,
    p_ws_id: &'a str,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct AuthenticatedUser {
    access_token: String,
    id: String,
}

pub(crate) async fn handle_suspensions_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != SUSPENSIONS_PATH || request.method != "GET" {
        return None;
    }

    Some(suspensions_response(config, request, outbound).await)
}

async fn suspensions_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(user) = authenticated_user(config, request, outbound).await else {
        return no_store_response(json_response(401, json!({ "error": "Unauthorized" })));
    };

    if !has_root_workspace_permission(&config.contact_data, outbound, &user).await {
        return no_store_response(json_response(403, json!({ "error": "Forbidden" })));
    }

    match fetch_active_suspensions(&config.contact_data, outbound).await {
        Ok(rows) => no_store_response(json_response(200, rows)),
        Err(()) => suspensions_load_error_response(),
    }
}

async fn authenticated_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<AuthenticatedUser> {
    let access_token = supabase_auth::request_access_token(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;
    let id = user.id.filter(|id| !id.trim().is_empty())?;

    Some(AuthenticatedUser { access_token, id })
}

async fn has_root_workspace_permission(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user: &AuthenticatedUser,
) -> bool {
    has_root_workspace_permission_result(contact_data, outbound, user)
        .await
        .unwrap_or(false)
}

async fn has_root_workspace_permission_result(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user: &AuthenticatedUser,
) -> Result<bool, ()> {
    let rpc_url = contact_data
        .rpc_url(HAS_WORKSPACE_PERMISSION_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let body = serde_json::to_string(&HasWorkspacePermissionRequest {
        p_permission: MANAGE_WORKSPACE_ROLES_PERMISSION,
        p_user_id: &user.id,
        p_ws_id: ROOT_WORKSPACE_ID,
    })
    .map_err(|_| ())?;
    let authorization = format!("Bearer {}", user.access_token);
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

    if !is_success_status(response.status) {
        return Ok(false);
    }

    response.json::<bool>().map_err(|_| ())
}

async fn fetch_active_suspensions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Value, ()> {
    let Some(url) = contact_data.rest_url(
        SUSPENSIONS_TABLE,
        &[
            ("select", "*".to_owned()),
            ("lifted_at", "is.null".to_owned()),
            ("or", "(expires_at.is.null,expires_at.gt.now())".to_owned()),
            ("order", "suspended_at.desc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
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

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Value>().map_err(|_| ())
}

fn suspensions_load_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "error": SUSPENSIONS_LOAD_ERROR }),
    ))
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        BackendConfig,
        outbound::{OutboundFuture, OutboundHeader, OutboundResponse},
    };
    use std::cell::RefCell;
    use std::collections::VecDeque;

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

    fn request() -> BackendRequest<'static> {
        BackendRequest {
            authorization: Some("Bearer caller-access-token"),
            body_text: None,
            cookie: None,
            method: "GET",
            origin: None,
            path: SUSPENSIONS_PATH,
            referer: None,
            request_id: None,
            url: Some("https://backend.test/api/v1/infrastructure/suspensions"),
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

    #[tokio::test]
    async fn suspensions_rejects_missing_auth() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(Vec::new());
        let mut request = request();
        request.authorization = None;

        let response = handle_suspensions_route(&config, request, &outbound)
            .await
            .expect("route should handle suspensions GET");

        assert_eq!(response.status, 401);
        assert_eq!(response.body["error"], "Unauthorized");
        assert!(outbound.calls().is_empty());
    }

    #[tokio::test]
    async fn suspensions_rejects_missing_permission() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(vec![
            outbound_response(200, r#"{"id":"user-1"}"#),
            outbound_response(200, "false"),
        ]);

        let response = handle_suspensions_route(&config, request(), &outbound)
            .await
            .expect("route should handle suspensions GET");

        assert_eq!(response.status, 403);
        assert_eq!(response.body["error"], "Forbidden");

        let calls = outbound.calls();
        assert_eq!(calls.len(), 2);
        assert!(calls[0].url.ends_with("/auth/v1/user"));
        assert!(
            calls[1]
                .url
                .ends_with("/rest/v1/rpc/has_workspace_permission")
        );
        assert_eq!(calls[1].method, OutboundMethod::Post);
        assert_eq!(
            recorded_header(&calls[1], "Authorization"),
            Some("Bearer caller-access-token")
        );
        assert_eq!(
            recorded_header(&calls[1], "apikey"),
            Some("test-service-role-secret")
        );
        assert_eq!(
            calls[1].body.as_deref(),
            Some(
                r#"{"p_permission":"manage_workspace_roles","p_user_id":"user-1","p_ws_id":"00000000-0000-0000-0000-000000000000"}"#
            )
        );
    }

    #[tokio::test]
    async fn suspensions_treats_permission_rpc_error_as_forbidden() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(vec![
            outbound_response(200, r#"{"id":"user-1"}"#),
            outbound_response(500, r#"{"message":"rpc failed"}"#),
        ]);

        let response = handle_suspensions_route(&config, request(), &outbound)
            .await
            .expect("route should handle suspensions GET");

        assert_eq!(response.status, 403);
        assert_eq!(response.body["error"], "Forbidden");
        assert_eq!(outbound.calls().len(), 2);
    }

    #[tokio::test]
    async fn suspensions_reads_active_rows_with_service_role() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(vec![
            outbound_response(200, r#"{"id":"user-1"}"#),
            outbound_response(200, "true"),
            outbound_response(
                200,
                r#"[{"id":"suspension-1","user_id":"user-2","lifted_at":null}]"#,
            ),
        ]);

        let response = handle_suspensions_route(&config, request(), &outbound)
            .await
            .expect("route should handle suspensions GET");

        assert_eq!(response.status, 200);
        assert_eq!(response.body[0]["id"], "suspension-1");

        let calls = outbound.calls();
        assert_eq!(calls.len(), 3);
        assert!(calls[2].url.contains("user_suspensions"));
        assert!(calls[2].url.contains("select=*"));
        assert!(calls[2].url.contains("lifted_at=is.null"));
        assert!(
            calls[2]
                .url
                .contains("or=%28expires_at.is.null%2Cexpires_at.gt.now%28%29%29")
        );
        assert!(calls[2].url.contains("order=suspended_at.desc"));
        assert_eq!(
            recorded_header(&calls[2], "Authorization"),
            Some("Bearer test-service-role-secret")
        );
    }

    #[tokio::test]
    async fn suspensions_maps_row_load_failure_to_legacy_error() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(vec![
            outbound_response(200, r#"{"id":"user-1"}"#),
            outbound_response(200, "true"),
            outbound_response(500, r#"{"message":"failed"}"#),
        ]);

        let response = handle_suspensions_route(&config, request(), &outbound)
            .await
            .expect("route should handle suspensions GET");

        assert_eq!(response.status, 500);
        assert_eq!(response.body["error"], SUSPENSIONS_LOAD_ERROR);
    }
}
