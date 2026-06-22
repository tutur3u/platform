use serde::Serialize;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const APPROVE_POSTS_PERMISSION: &str = "approve_posts";
const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";
const MANAGE_WORKSPACE_ROLES_PERMISSION: &str = "manage_workspace_roles";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const WORKSPACE_POST_PERMISSIONS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACE_POST_PERMISSIONS_PATH_SUFFIX: &str = "/posts/permissions";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspacePostPermissionsResponse {
    can_approve_posts: bool,
    can_force_send_posts: bool,
}

#[derive(Serialize)]
struct HasWorkspacePermissionRequest<'a> {
    p_permission: &'a str,
    p_user_id: &'a str,
    p_ws_id: &'a str,
}

pub(crate) async fn handle_workspace_post_permissions_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = workspace_post_permissions_ws_id(request.path)?;

    Some(match request.method {
        "GET" => workspace_post_permissions_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn workspace_post_permissions_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(user_id) = authenticated_user_id(&config.contact_data, request, outbound).await else {
        return permissions_response(false, false);
    };

    let can_approve_posts = match has_workspace_permission(
        &config.contact_data,
        outbound,
        &user_id,
        ws_id,
        APPROVE_POSTS_PERMISSION,
    )
    .await
    {
        Ok(value) => value,
        Err(()) => return permissions_response(false, false),
    };

    let can_force_send_posts = match has_workspace_permission(
        &config.contact_data,
        outbound,
        &user_id,
        ROOT_WORKSPACE_ID,
        MANAGE_WORKSPACE_ROLES_PERMISSION,
    )
    .await
    {
        Ok(value) => value,
        Err(()) => return permissions_response(false, false),
    };

    permissions_response(can_approve_posts, can_force_send_posts)
}

async fn authenticated_user_id(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<String> {
    let access_token = supabase_auth::request_access_token(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await?;

    user.id.filter(|id| !id.trim().is_empty())
}

async fn has_workspace_permission(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    ws_id: &str,
    permission: &str,
) -> Result<bool, ()> {
    let rpc_url = contact_data
        .rpc_url(HAS_WORKSPACE_PERMISSION_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let body = serde_json::to_string(&HasWorkspacePermissionRequest {
        p_permission: permission,
        p_user_id: user_id,
        p_ws_id: ws_id,
    })
    .map_err(|_| ())?;
    let authorization = format!("Bearer {service_role_key}");
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

    response.json::<bool>().map_err(|_| ())
}

fn workspace_post_permissions_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACE_POST_PERMISSIONS_PATH_PREFIX)?
        .strip_suffix(WORKSPACE_POST_PERMISSIONS_PATH_SUFFIX)?;

    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }

    Some(ws_id)
}

fn permissions_response(can_approve_posts: bool, can_force_send_posts: bool) -> BackendResponse {
    no_store_response(json_response(
        200,
        WorkspacePostPermissionsResponse {
            can_approve_posts,
            can_force_send_posts,
        },
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::outbound::{
        OutboundError, OutboundFuture, OutboundHeader, OutboundRequest, OutboundResponse,
    };
    use crate::{BackendRequest, handle_backend_request};
    use serde_json::json;
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
            path: "/api/v1/workspaces/ws-1/posts/permissions",
            referer: None,
            request_id: None,
            url: Some("https://tuturuuu.localhost/api/v1/workspaces/ws-1/posts/permissions"),
        }
    }

    fn authorized_request(method: &'static str) -> BackendRequest<'static> {
        BackendRequest {
            authorization: Some("Bearer user-access-token"),
            ..request(method)
        }
    }

    fn assert_permissions_response(
        response: &BackendResponse,
        can_approve_posts: bool,
        can_force_send_posts: bool,
    ) {
        assert_eq!(response.status, 200);
        assert_eq!(
            response.body,
            json!({
                "canApprovePosts": can_approve_posts,
                "canForceSendPosts": can_force_send_posts,
            })
        );
    }

    #[tokio::test]
    async fn workspace_post_permissions_returns_false_for_unauthenticated_users() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::default();

        let response = handle_backend_request(&config, request("GET"), &outbound).await;

        assert_permissions_response(&response, false, false);
        assert_eq!(outbound.calls().len(), 0);
    }

    #[tokio::test]
    async fn workspace_post_permissions_checks_workspace_and_root_permissions() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(vec![
            outbound_response(200, r#"{"id":"user-1"}"#),
            outbound_response(200, "true"),
            outbound_response(200, "true"),
        ]);

        let response = handle_backend_request(&config, authorized_request("GET"), &outbound).await;

        assert_permissions_response(&response, true, true);

        let calls = outbound.calls();
        assert_eq!(calls.len(), 3);
        assert_eq!(calls[0].method, OutboundMethod::Get);
        assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
        assert_eq!(
            recorded_header(&calls[0], "Authorization"),
            Some("Bearer user-access-token")
        );

        assert_eq!(calls[1].method, OutboundMethod::Post);
        assert_eq!(
            calls[1].url,
            "https://project-ref.supabase.co/rest/v1/rpc/has_workspace_permission"
        );
        assert_eq!(
            recorded_header(&calls[1], "Authorization"),
            Some("Bearer test-service-role-secret")
        );
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(
                calls[1].body.as_ref().expect("workspace permission body")
            )
            .expect("workspace permission JSON"),
            json!({
                "p_permission": "approve_posts",
                "p_user_id": "user-1",
                "p_ws_id": "ws-1",
            })
        );

        assert_eq!(calls[2].method, OutboundMethod::Post);
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(
                calls[2].body.as_ref().expect("root permission body")
            )
            .expect("root permission JSON"),
            json!({
                "p_permission": "manage_workspace_roles",
                "p_user_id": "user-1",
                "p_ws_id": "00000000-0000-0000-0000-000000000000",
            })
        );
    }

    #[tokio::test]
    async fn workspace_post_permissions_allows_root_force_send_without_approval_permission() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(vec![
            outbound_response(200, r#"{"id":"user-1"}"#),
            outbound_response(200, "false"),
            outbound_response(200, "true"),
        ]);

        let response = handle_backend_request(&config, authorized_request("GET"), &outbound).await;

        assert_permissions_response(&response, false, true);
    }

    #[tokio::test]
    async fn workspace_post_permissions_collapses_invalid_auth_to_false_response() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(vec![outbound_response(
            401,
            r#"{"message":"JWT expired"}"#,
        )]);

        let response = handle_backend_request(&config, authorized_request("GET"), &outbound).await;

        assert_permissions_response(&response, false, false);
        assert_eq!(outbound.calls().len(), 1);
    }

    #[tokio::test]
    async fn workspace_post_permissions_collapses_permission_failures_to_false_response() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(vec![
            outbound_response(200, r#"{"id":"user-1"}"#),
            outbound_response(500, r#"{"message":"failed"}"#),
        ]);

        let response = handle_backend_request(&config, authorized_request("GET"), &outbound).await;

        assert_permissions_response(&response, false, false);
        assert_eq!(outbound.calls().len(), 2);
    }

    #[tokio::test]
    async fn workspace_post_permissions_rejects_unsupported_methods() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::default();

        let response = handle_backend_request(&config, request("POST"), &outbound).await;

        assert_eq!(response.status, 405);
        assert_eq!(response.allow, Some("GET"));
        assert_eq!(outbound.calls().len(), 0);
    }
}
