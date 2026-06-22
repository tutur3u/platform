use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

pub(crate) const EMAIL_BLACKLIST_PATH: &str = "/api/v1/infrastructure/email-blacklist";

const EMAIL_BLACKLIST_TABLE: &str = "email_blacklist";
const POSTGREST_SINGLE_JSON: &str = "application/vnd.pgrst.object+json";
const POSTGREST_SINGULAR_RESPONSE_ERROR_CODE: &str = "PGRST116";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const WORKSPACE_USER_LINKED_USERS_TABLE: &str = "workspace_user_linked_users";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum EmailBlacklistReadAuthError {
    Unauthorized,
    Forbidden,
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum EmailBlacklistRoute {
    Collection,
    Entry { entry_id: String },
}

pub(crate) async fn handle_email_blacklist_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let route = email_blacklist_route(request.path)?;

    if request.method != "GET" {
        return None;
    }

    Some(email_blacklist_get_response(config, request, outbound, route).await)
}

async fn email_blacklist_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
    route: EmailBlacklistRoute,
) -> BackendResponse {
    let auth = authorize_email_blacklist_read(config, request, outbound).await;
    let access_token = match (auth, &route) {
        (Ok(access_token), _) => access_token,
        (Err(EmailBlacklistReadAuthError::Unauthorized), _) => {
            return no_store_response(json_response(401, json!({ "message": "Unauthorized" })));
        }
        (Err(EmailBlacklistReadAuthError::Forbidden), EmailBlacklistRoute::Collection) => {
            return no_store_response(json_response(403, json!({ "message": "Forbidden" })));
        }
        (Err(EmailBlacklistReadAuthError::Forbidden), EmailBlacklistRoute::Entry { .. }) => {
            return no_store_response(json_response(401, json!({ "message": "Unauthorized" })));
        }
    };

    match route {
        EmailBlacklistRoute::Collection => {
            email_blacklist_collection_response(&config.contact_data, outbound, &access_token).await
        }
        EmailBlacklistRoute::Entry { entry_id } => {
            email_blacklist_entry_response(&config.contact_data, outbound, &access_token, &entry_id)
                .await
        }
    }
}

async fn authorize_email_blacklist_read(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Result<String, EmailBlacklistReadAuthError> {
    let contact_data = &config.contact_data;
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return Err(EmailBlacklistReadAuthError::Unauthorized);
    };
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return Err(EmailBlacklistReadAuthError::Unauthorized);
    };
    let Some(user_id) = user.id.filter(|id| !id.trim().is_empty()) else {
        return Err(EmailBlacklistReadAuthError::Unauthorized);
    };

    if has_root_workspace_membership(contact_data, outbound, &access_token, &user_id)
        .await
        .unwrap_or(false)
    {
        Ok(access_token)
    } else {
        Err(EmailBlacklistReadAuthError::Forbidden)
    }
}

async fn has_root_workspace_membership(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        WORKSPACE_USER_LINKED_USERS_TABLE,
        &[
            ("select", "*".to_owned()),
            ("platform_user_id", format!("eq.{user_id}")),
            ("ws_id", format!("eq.{ROOT_WORKSPACE_ID}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response =
        send_caller_token_get(contact_data, outbound, &url, access_token, APPLICATION_JSON).await?;

    if !is_success_status(response.status) {
        return Ok(false);
    }

    response
        .json::<Vec<Value>>()
        .map(|rows| !rows.is_empty())
        .map_err(|_| ())
}

async fn email_blacklist_collection_response(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
) -> BackendResponse {
    let Some(url) = contact_data.rest_url(
        EMAIL_BLACKLIST_TABLE,
        &[
            ("select", "*".to_owned()),
            ("order", "created_at.desc".to_owned()),
        ],
    ) else {
        return email_blacklist_error_response("Error fetching email blacklist entries");
    };
    let response =
        match send_caller_token_get(contact_data, outbound, &url, access_token, APPLICATION_JSON)
            .await
        {
            Ok(response) => response,
            Err(()) => {
                return email_blacklist_error_response("Error fetching email blacklist entries");
            }
        };

    if !is_success_status(response.status) {
        return email_blacklist_error_response("Error fetching email blacklist entries");
    }

    match response.json::<Value>() {
        Ok(body) => no_store_response(json_response(200, body)),
        Err(_) => email_blacklist_error_response("Error fetching email blacklist entries"),
    }
}

async fn email_blacklist_entry_response(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
    entry_id: &str,
) -> BackendResponse {
    let Some(url) = contact_data.rest_url(
        EMAIL_BLACKLIST_TABLE,
        &[("select", "*".to_owned()), ("id", format!("eq.{entry_id}"))],
    ) else {
        return email_blacklist_entry_error_response(500);
    };
    let response = match send_caller_token_get(
        contact_data,
        outbound,
        &url,
        access_token,
        POSTGREST_SINGLE_JSON,
    )
    .await
    {
        Ok(response) => response,
        Err(()) => return email_blacklist_entry_error_response(500),
    };

    if !is_success_status(response.status) {
        return email_blacklist_entry_error_response(if is_postgrest_single_not_found(&response) {
            404
        } else {
            500
        });
    }

    match response.json::<Value>() {
        Ok(body) => no_store_response(json_response(200, body)),
        Err(_) => email_blacklist_entry_error_response(500),
    }
}

async fn send_caller_token_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
    accept: &str,
) -> Result<OutboundResponse, ()> {
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {access_token}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", accept)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

fn email_blacklist_route(path: &str) -> Option<EmailBlacklistRoute> {
    if path == EMAIL_BLACKLIST_PATH {
        return Some(EmailBlacklistRoute::Collection);
    }

    let entry_id = path.strip_prefix(EMAIL_BLACKLIST_PATH)?.strip_prefix('/')?;
    if entry_id.is_empty() || entry_id.contains('/') {
        return None;
    }

    Some(EmailBlacklistRoute::Entry {
        entry_id: entry_id.to_owned(),
    })
}

fn email_blacklist_error_response(message: &'static str) -> BackendResponse {
    no_store_response(json_response(500, json!({ "message": message })))
}

fn email_blacklist_entry_error_response(status: u16) -> BackendResponse {
    no_store_response(json_response(
        status,
        json!({ "message": "Error fetching email blacklist entry" }),
    ))
}

fn is_postgrest_single_not_found(response: &OutboundResponse) -> bool {
    response
        .json::<Value>()
        .ok()
        .and_then(|body| body.get("code").and_then(Value::as_str).map(str::to_owned))
        .as_deref()
        == Some(POSTGREST_SINGULAR_RESPONSE_ERROR_CODE)
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

    fn request(path: &'static str) -> BackendRequest<'static> {
        BackendRequest {
            authorization: Some("Bearer caller-access-token"),
            body_text: None,
            cookie: None,
            method: "GET",
            origin: None,
            path,
            referer: None,
            request_id: None,
            url: Some("https://backend.example.test/api/v1/infrastructure/email-blacklist"),
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
    fn email_blacklist_route_matches_collection_and_entry_only() {
        assert_eq!(
            email_blacklist_route(EMAIL_BLACKLIST_PATH),
            Some(EmailBlacklistRoute::Collection)
        );
        assert_eq!(
            email_blacklist_route("/api/v1/infrastructure/email-blacklist/entry-1"),
            Some(EmailBlacklistRoute::Entry {
                entry_id: "entry-1".to_owned()
            })
        );
        assert_eq!(
            email_blacklist_route("/api/v1/infrastructure/email-blacklist/entry-1/extra"),
            None
        );
        assert_eq!(email_blacklist_route("/api/v1/infrastructure/other"), None);
    }

    #[test]
    fn postgrest_single_not_found_detects_pgrst116() {
        let response = OutboundResponse {
            body_text: r#"{"code":"PGRST116"}"#.to_owned(),
            headers: Vec::new(),
            status: 406,
        };

        assert!(is_postgrest_single_not_found(&response));
    }

    #[tokio::test]
    async fn email_blacklist_collection_reads_ordered_rows_with_caller_token() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(vec![
            outbound_response(200, r#"{"id":"user-1","email":"root@example.com"}"#),
            outbound_response(200, r#"[{"id":"link-1"}]"#),
            outbound_response(200, r#"[{"id":"entry-1","value":"blocked@example.com"}]"#),
        ]);
        let response =
            handle_email_blacklist_route(&config, request(EMAIL_BLACKLIST_PATH), &outbound)
                .await
                .expect("route should handle collection GET");

        assert_eq!(response.status, 200);
        assert_eq!(response.body[0]["id"], "entry-1");

        let calls = outbound.calls();
        assert_eq!(calls.len(), 3);
        assert!(calls[1].url.contains("workspace_user_linked_users"));
        assert!(calls[1].url.contains("platform_user_id=eq.user-1"));
        assert!(
            calls[1]
                .url
                .contains("ws_id=eq.00000000-0000-0000-0000-000000000000")
        );
        assert_eq!(
            recorded_header(&calls[1], "Authorization"),
            Some("Bearer caller-access-token")
        );
        assert!(calls[2].url.contains("email_blacklist"));
        assert!(calls[2].url.contains("order=created_at.desc"));
        assert_eq!(
            recorded_header(&calls[2], "Authorization"),
            Some("Bearer caller-access-token")
        );
    }

    #[tokio::test]
    async fn email_blacklist_entry_reads_singular_row_and_maps_missing_to_404() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(vec![
            outbound_response(200, r#"{"id":"user-1"}"#),
            outbound_response(200, r#"[{"id":"link-1"}]"#),
            outbound_response(406, r#"{"code":"PGRST116"}"#),
        ]);
        let response = handle_email_blacklist_route(
            &config,
            request("/api/v1/infrastructure/email-blacklist/entry-1"),
            &outbound,
        )
        .await
        .expect("route should handle entry GET");

        assert_eq!(response.status, 404);
        assert_eq!(
            response.body["message"],
            "Error fetching email blacklist entry"
        );

        let calls = outbound.calls();
        assert_eq!(calls.len(), 3);
        assert!(calls[2].url.contains("email_blacklist"));
        assert!(calls[2].url.contains("id=eq.entry-1"));
        assert_eq!(
            recorded_header(&calls[2], "Accept"),
            Some(POSTGREST_SINGLE_JSON)
        );
    }

    #[tokio::test]
    async fn email_blacklist_preserves_detail_non_root_unauthorized_quirk() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(vec![
            outbound_response(200, r#"{"id":"user-1"}"#),
            outbound_response(200, r#"[]"#),
        ]);
        let response = handle_email_blacklist_route(
            &config,
            request("/api/v1/infrastructure/email-blacklist/entry-1"),
            &outbound,
        )
        .await
        .expect("route should handle entry GET");

        assert_eq!(response.status, 401);
        assert_eq!(response.body["message"], "Unauthorized");
        assert_eq!(outbound.calls().len(), 2);
    }
}
