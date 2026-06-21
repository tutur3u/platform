use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    parse_json_body, supabase_auth,
};

pub(crate) const USER_PROFILE_PATH: &str = "/api/v1/user/profile";
const MAX_DISPLAY_NAME_LENGTH: usize = 100;
const MAX_BIO_LENGTH: usize = 1000;

pub(crate) async fn handle_user_profile_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != USER_PROFILE_PATH {
        return None;
    }

    Some(match request.method {
        "PATCH" => user_profile_patch_response(&config.contact_data, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "PATCH")),
    })
}

pub(crate) fn should_buffer_request_body(method: &str, path: &str) -> bool {
    matches!((method, path), ("PATCH", USER_PROFILE_PATH))
}

async fn user_profile_patch_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(user_id) = authenticated_user_id(contact_data, request, outbound).await else {
        return message_response(401, "Not authenticated");
    };

    let updates = match profile_updates(request.body_text) {
        Ok(updates) => updates,
        Err(errors) => return invalid_request_data_response(errors),
    };

    if updates.is_empty() {
        return message_response(200, "Profile updated successfully");
    }

    let body = Value::Object(updates).to_string();
    let Some(profile_url) = contact_data.rest_url("users", &[("id", format!("eq.{user_id}"))])
    else {
        return message_response(500, "Error updating profile");
    };
    let response = match send_user_profile_update(contact_data, outbound, &profile_url, &body).await
    {
        Ok(response) => response,
        Err(()) => return message_response(500, "Error updating profile"),
    };

    if !(200..300).contains(&response.status) {
        return message_response(500, "Error updating profile");
    }

    message_response(200, "Profile updated successfully")
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

async fn send_user_profile_update(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    body: &str,
) -> Result<OutboundResponse, ()> {
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");
    let request = OutboundRequest::new(OutboundMethod::Patch, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key)
        .with_header("Content-Type", APPLICATION_JSON)
        .with_header("Prefer", "return=minimal")
        .with_body(body);

    outbound.send(request).await.map_err(|_| ())
}

fn profile_updates(body_text: Option<&str>) -> Result<Map<String, Value>, Vec<Value>> {
    let Some(body) = parse_json_body(body_text) else {
        return Err(vec![validation_issue(&[], "body must be valid JSON")]);
    };
    let Some(body) = body.as_object() else {
        return Err(vec![validation_issue(&[], "body must be a JSON object")]);
    };
    let mut updates = Map::new();
    let mut errors = Vec::new();

    if let Some(value) = body.get("display_name") {
        match value.as_str() {
            Some(display_name) => {
                validate_string_length(
                    &mut errors,
                    "display_name",
                    display_name,
                    1,
                    MAX_DISPLAY_NAME_LENGTH,
                );
                if errors.is_empty() {
                    updates.insert("display_name".to_owned(), json!(display_name));
                }
            }
            None => errors.push(validation_issue(
                &["display_name"],
                "display_name must be a string",
            )),
        }
    }

    if let Some(value) = body.get("bio") {
        if value.is_null() {
            updates.insert("bio".to_owned(), Value::Null);
        } else if let Some(bio) = value.as_str() {
            let error_count = errors.len();
            validate_string_length(&mut errors, "bio", bio, 0, MAX_BIO_LENGTH);
            if errors.len() == error_count {
                updates.insert("bio".to_owned(), json!(bio));
            }
        } else {
            errors.push(validation_issue(&["bio"], "bio must be a string or null"));
        }
    }

    if let Some(value) = body.get("avatar_url") {
        if value.is_null() {
            updates.insert("avatar_url".to_owned(), Value::Null);
        } else if let Some(avatar_url) = value.as_str() {
            if url::Url::parse(avatar_url).is_err() {
                errors.push(validation_issue(
                    &["avatar_url"],
                    "avatar_url must be a valid URL",
                ));
            } else {
                updates.insert("avatar_url".to_owned(), json!(avatar_url));
            }
        } else {
            errors.push(validation_issue(
                &["avatar_url"],
                "avatar_url must be a URL string or null",
            ));
        }
    }

    if errors.is_empty() {
        Ok(updates)
    } else {
        Err(errors)
    }
}

fn validate_string_length(
    errors: &mut Vec<Value>,
    field: &'static str,
    value: &str,
    min: usize,
    max: usize,
) {
    let length = value.encode_utf16().count();

    if length < min {
        errors.push(validation_issue(
            &[field],
            format!("{field} must be at least {min} characters"),
        ));
    }

    if length > max {
        errors.push(validation_issue(
            &[field],
            format!("{field} must be at most {max} characters"),
        ));
    }
}

fn validation_issue(path: &[&str], message: impl Into<String>) -> Value {
    json!({
        "message": message.into(),
        "path": path,
    })
}

fn invalid_request_data_response(errors: Vec<Value>) -> BackendResponse {
    no_store_response(json_response(
        400,
        json!({
            "errors": errors,
            "message": "Invalid request data",
        }),
    ))
}

fn message_response(status: u16, message: &'static str) -> BackendResponse {
    no_store_response(json_response(
        status,
        json!({
            "message": message,
        }),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::outbound::{OutboundFuture, OutboundResponse};
    use std::{cell::RefCell, collections::VecDeque};

    #[derive(Clone, Debug)]
    struct RecordedRequest {
        body: Option<String>,
        headers: Vec<(String, String)>,
        method: OutboundMethod,
        url: String,
    }

    struct Client {
        calls: RefCell<Vec<RecordedRequest>>,
        responses: RefCell<VecDeque<OutboundResponse>>,
    }

    impl Client {
        fn with(responses: Vec<(u16, String)>) -> Self {
            Self {
                calls: RefCell::new(Vec::new()),
                responses: RefCell::new(VecDeque::from(
                    responses
                        .into_iter()
                        .map(|(status, body_text)| OutboundResponse {
                            body_text,
                            headers: vec![("content-type".to_owned(), APPLICATION_JSON.to_owned())],
                            status,
                        })
                        .collect::<Vec<_>>(),
                )),
            }
        }

        fn calls(&self) -> Vec<RecordedRequest> {
            self.calls.borrow().clone()
        }
    }

    impl OutboundHttpClient for Client {
        fn send<'a>(&'a self, request: OutboundRequest<'a>) -> OutboundFuture<'a> {
            self.calls.borrow_mut().push(RecordedRequest {
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
                        body_text: r#"{"id":"user-123"}"#.to_owned(),
                        headers: vec![("content-type".to_owned(), APPLICATION_JSON.to_owned())],
                        status: 200,
                    });

            Box::pin(async move { Ok(response) })
        }
    }

    fn config() -> BackendConfig {
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
            path: USER_PROFILE_PATH,
            referer: None,
            request_id: None,
            url: Some("https://tuturuuu.localhost/api/v1/user/profile"),
        }
    }

    fn bearer(body_text: &'static str) -> BackendRequest<'static> {
        BackendRequest {
            authorization: Some("Bearer browser-access-token"),
            body_text: Some(body_text),
            ..request("PATCH")
        }
    }

    fn cookie_request<'a>(cookie: &'a str, body_text: &'static str) -> BackendRequest<'a> {
        BackendRequest {
            body_text: Some(body_text),
            cookie: Some(cookie),
            ..request("PATCH")
        }
    }

    fn supabase_auth_cookie_header(access_token: &str) -> String {
        format!(
            "sb-project-ref-auth-token=base64-{}",
            contact::encode_app_session_part(format!(r#"{{"access_token":"{access_token}"}}"#))
        )
    }

    fn header<'a>(request: &'a RecordedRequest, name: &str) -> Option<&'a str> {
        request
            .headers
            .iter()
            .find(|(header_name, _)| header_name.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }

    #[tokio::test]
    async fn user_profile_patch_requires_authenticated_supabase_session() {
        let outbound = Client::with(vec![(200, "{}".to_owned())]);

        let response = crate::handle_backend_request(&config(), request("PATCH"), &outbound).await;

        assert_eq!(response.status, 401);
        assert_eq!(response.body, json!({ "message": "Not authenticated" }));
        assert_eq!(outbound.calls().len(), 0);
    }

    #[tokio::test]
    async fn user_profile_patch_revalidates_cookie_session_and_updates_only_allowed_fields() {
        let cookie = supabase_auth_cookie_header("browser-access-token");
        let outbound = Client::with(vec![
            (
                200,
                r#"{"id":"user-123","email":"ada@example.com"}"#.to_owned(),
            ),
            (204, String::new()),
        ]);

        let response = crate::handle_backend_request(
            &config(),
            cookie_request(
                &cookie,
                r#"{"display_name":"Ada","bio":null,"avatar_url":"https://cdn.example.test/avatar.png","ignored":"value"}"#,
            ),
            &outbound,
        )
        .await;

        assert_eq!(response.status, 200);
        assert_eq!(
            response.body,
            json!({ "message": "Profile updated successfully" })
        );

        let calls = outbound.calls();
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0].method, OutboundMethod::Get);
        assert_eq!(calls[0].url, "https://project-ref.supabase.co/auth/v1/user");
        assert_eq!(
            header(&calls[0], "Authorization"),
            Some("Bearer browser-access-token")
        );
        assert_eq!(calls[1].method, OutboundMethod::Patch);
        assert_eq!(
            calls[1].url,
            "https://project-ref.supabase.co/rest/v1/users?id=eq.user-123"
        );
        assert_eq!(
            header(&calls[1], "Authorization"),
            Some("Bearer test-service-role-secret")
        );
        assert_eq!(header(&calls[1], "Prefer"), Some("return=minimal"));
        let body = serde_json::from_str::<Value>(calls[1].body.as_deref().unwrap()).unwrap();
        assert_eq!(body["display_name"], "Ada");
        assert_eq!(body["bio"], Value::Null);
        assert_eq!(body["avatar_url"], "https://cdn.example.test/avatar.png");
        assert!(body.get("ignored").is_none());
    }

    #[tokio::test]
    async fn user_profile_patch_returns_update_error_for_supabase_failure() {
        let outbound = Client::with(vec![
            (200, r#"{"id":"user-123"}"#.to_owned()),
            (500, r#"{"message":"database unavailable"}"#.to_owned()),
        ]);

        let response = crate::handle_backend_request(
            &config(),
            bearer(r#"{"display_name":"Ada"}"#),
            &outbound,
        )
        .await;

        assert_eq!(response.status, 500);
        assert_eq!(
            response.body,
            json!({ "message": "Error updating profile" })
        );
    }

    #[test]
    fn user_profile_validation_matches_legacy_optional_schema_and_limits() {
        let valid = profile_updates(Some(
            r#"{"display_name":"Ada","bio":"","avatar_url":null,"ignored":true}"#,
        ))
        .unwrap();
        assert_eq!(valid.len(), 3);
        assert!(profile_updates(Some("{}")).unwrap().is_empty());

        let long_display_name = "a".repeat(MAX_DISPLAY_NAME_LENGTH + 1);
        let long_bio = "a".repeat(MAX_BIO_LENGTH + 1);
        let invalid = Box::leak(format!(r#"{{"display_name":"{long_display_name}","bio":"{long_bio}","avatar_url":"not a url"}}"#).into_boxed_str());
        assert_eq!(profile_updates(Some(invalid)).unwrap_err().len(), 3);

        let emoji_name = "😀".repeat((MAX_DISPLAY_NAME_LENGTH / 2) + 1);
        let invalid = Box::leak(format!(r#"{{"display_name":"{emoji_name}"}}"#).into_boxed_str());
        assert_eq!(profile_updates(Some(invalid)).unwrap_err().len(), 1);
    }

    #[tokio::test]
    async fn user_profile_route_rejects_unsupported_methods() {
        let outbound = Client::with(vec![(200, "{}".to_owned())]);

        let response = crate::handle_backend_request(&config(), request("GET"), &outbound).await;

        assert_eq!(response.status, 405);
        assert_eq!(response.allow, Some("PATCH"));
        assert_eq!(response.body["error"], "method not allowed");
        assert_eq!(outbound.calls().len(), 0);
    }
}
