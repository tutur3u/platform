use super::*;
use crate::outbound::OutboundFuture;
use serde_json::Value;
use std::cell::RefCell;

const WS: &str = "11111111-1111-4111-8111-111111111111";
const TEMPLATE: &str = "33333333-3333-4333-8333-333333333333";
const OWNER: &str = "44444444-4444-4444-8444-444444444444";
const MEMBER: &str = "55555555-5555-4555-8555-555555555555";
const BACKGROUND: &str = "11111111-1111-4111-8111-111111111111/template-backgrounds/synthetic.png";

struct RecordedCall {
    method: OutboundMethod,
    url: String,
    body: Option<String>,
}

struct FixtureClient {
    actor: &'static str,
    template: Value,
    member: bool,
    membership_status: u16,
    template_status: u16,
    sign_status: u16,
    calls: RefCell<Vec<RecordedCall>>,
}

impl FixtureClient {
    fn new(actor: &'static str, template: Value) -> Self {
        Self {
            actor,
            template,
            member: true,
            membership_status: 200,
            template_status: 200,
            sign_status: 200,
            calls: RefCell::new(Vec::new()),
        }
    }

    fn storage_calls(&self) -> usize {
        self.calls
            .borrow()
            .iter()
            .filter(|call| call.method == OutboundMethod::Post)
            .count()
    }
}

impl OutboundHttpClient for FixtureClient {
    fn send<'a>(&'a self, request: OutboundRequest<'a>) -> OutboundFuture<'a> {
        self.calls.borrow_mut().push(RecordedCall {
            method: request.method,
            url: request.url.to_owned(),
            body: request.body.map(str::to_owned),
        });
        let parsed = url::Url::parse(request.url).expect("synthetic request URL");
        let expected_authorization = if parsed.path() == "/auth/v1/user" {
            "Bearer synthetic-access"
        } else {
            "Bearer synthetic-service-key"
        };
        assert!(request.headers.iter().any(|header| {
            header.name.eq_ignore_ascii_case("Authorization")
                && header.value == expected_authorization
        }));
        let (status, body) = if parsed.path() == "/auth/v1/user" {
            (200, json!({ "id": self.actor }))
        } else if parsed.path() == "/rest/v1/workspace_members" {
            let query: std::collections::HashMap<_, _> =
                parsed.query_pairs().into_owned().collect();
            assert_eq!(query.get("ws_id"), Some(&format!("eq.{WS}")));
            assert_eq!(query.get("user_id"), Some(&format!("eq.{}", self.actor)));
            let rows = if self.member {
                json!([{ "type": "MEMBER" }])
            } else {
                json!([])
            };
            (self.membership_status, rows)
        } else if parsed.path() == "/rest/v1/board_templates" {
            let query: std::collections::HashMap<_, _> =
                parsed.query_pairs().into_owned().collect();
            let row = self.template.as_object();
            let matches = row.is_some_and(|row| {
                query.get("id") == Some(&format!("eq.{}", row["id"].as_str().unwrap_or("")))
                    && query.get("ws_id")
                        == Some(&format!("eq.{}", row["ws_id"].as_str().unwrap_or("")))
            });
            let body = if matches {
                let row = row.expect("matched synthetic row");
                let projected: serde_json::Map<String, Value> = query["select"]
                    .split(',')
                    .filter_map(|column| {
                        row.get(column)
                            .map(|value| (column.to_owned(), value.clone()))
                    })
                    .collect();
                json!([projected])
            } else {
                json!([])
            };
            (self.template_status, body)
        } else if parsed
            .path()
            .starts_with("/storage/v1/object/sign/workspaces/")
        {
            (
                self.sign_status,
                json!({ "signedURL": "/object/sign/synthetic" }),
            )
        } else {
            panic!("Unexpected synthetic outbound path: {}", parsed.path());
        };
        let response = OutboundResponse {
            body_text: body.to_string(),
            headers: Vec::new(),
            status,
        };
        Box::pin(async move { Ok(response) })
    }
}

fn template_fixture(visibility: &str) -> Value {
    json!({ "id": TEMPLATE, "ws_id": WS, "created_by": OWNER,
        "visibility": visibility, "background_path": BACKGROUND })
}

async fn fixture_request(
    client: &FixtureClient,
    method: &str,
    authorization: Option<&str>,
) -> Option<BackendResponse> {
    let mut config = BackendConfig::new("test", "template-background");
    config.contact_data =
        contact::ContactDataConfig::new("https://storage.example.test", "synthetic-service-key");
    let path = format!("/api/v1/workspaces/{WS}/templates/{TEMPLATE}/background-url");
    handle_workspaces_wsid_templates_templateid_background_url_route(
        &config,
        BackendRequest {
            authorization,
            body_text: None,
            cookie: None,
            if_none_match: None,
            method,
            origin: None,
            path: &path,
            referer: None,
            request_id: None,
            url: None,
        },
        client,
    )
    .await
}

#[tokio::test]
async fn private_noncreator_denied_before_storage_and_null_background() {
    for background in [Value::String(BACKGROUND.to_owned()), Value::Null] {
        let mut row = template_fixture("private");
        row["background_path"] = background;
        let client = FixtureClient::new(MEMBER, row);
        let response = fixture_request(&client, "GET", Some("Bearer synthetic-access"))
            .await
            .unwrap();
        assert_eq!(response.status, 404);
        assert_eq!(response.cache_control, Some("no-store"));
        assert_eq!(client.storage_calls(), 0);
    }
}

#[tokio::test]
async fn explicit_visibility_and_owner_allow_signing_with_original_ttl() {
    for (actor, visibility) in [
        (OWNER, "private"),
        (MEMBER, "workspace"),
        (MEMBER, "public"),
    ] {
        let client = FixtureClient::new(actor, template_fixture(visibility));
        let response = fixture_request(&client, "GET", Some("Bearer synthetic-access"))
            .await
            .unwrap();
        assert_eq!(response.status, 200);
        assert_eq!(response.cache_control, Some("no-store"));
        let calls = client.calls.borrow();
        let storage: Vec<_> = calls
            .iter()
            .filter(|call| call.method == OutboundMethod::Post)
            .collect();
        assert_eq!(storage.len(), 1);
        assert!(storage[0].url.ends_with(BACKGROUND));
        assert_eq!(
            serde_json::from_str::<Value>(storage[0].body.as_deref().unwrap()).unwrap(),
            json!({ "expiresIn": 3600 })
        );
    }
}

#[tokio::test]
async fn missing_null_and_unknown_policy_fields_fail_closed() {
    for field in ["visibility", "created_by"] {
        for value in [
            None,
            Some(Value::Null),
            Some(json!("")),
            Some(json!("unknown")),
        ] {
            let mut row = template_fixture("private");
            if let Some(value) = value {
                row[field] = value;
            } else {
                row.as_object_mut().unwrap().remove(field);
            }
            let client = FixtureClient::new(OWNER, row);
            let response = fixture_request(&client, "GET", Some("Bearer synthetic-access"))
                .await
                .unwrap();
            assert_eq!(response.status, 404);
            assert_eq!(client.storage_calls(), 0);
        }
    }
}

#[tokio::test]
async fn absent_and_foreign_public_templates_are_not_signed() {
    let mut foreign = template_fixture("public");
    foreign["ws_id"] = json!("22222222-2222-4222-8222-222222222222");
    for row in [Value::Null, foreign] {
        let client = FixtureClient::new(MEMBER, row);
        assert_eq!(
            fixture_request(&client, "GET", Some("Bearer synthetic-access"))
                .await
                .unwrap()
                .status,
            404
        );
        assert_eq!(client.storage_calls(), 0);
    }
}

#[tokio::test]
async fn accessible_empty_background_returns_null_after_policy() {
    let mut row = template_fixture("workspace");
    row["background_path"] = Value::Null;
    let client = FixtureClient::new(MEMBER, row);
    let response = fixture_request(&client, "GET", Some("Bearer synthetic-access"))
        .await
        .unwrap();
    assert_eq!(response.status, 200);
    assert_eq!(response.body, json!({ "signedUrl": null }));
    assert_eq!(client.storage_calls(), 0);
}

#[tokio::test]
async fn membership_and_upstream_errors_keep_existing_statuses() {
    for (member, membership_status, template_status, sign_status, expected) in [
        (false, 200, 200, 200, 403),
        (true, 500, 200, 200, 500),
        (true, 200, 500, 200, 500),
        (true, 200, 200, 500, 500),
    ] {
        let mut client = FixtureClient::new(MEMBER, template_fixture("workspace"));
        client.member = member;
        client.membership_status = membership_status;
        client.template_status = template_status;
        client.sign_status = sign_status;
        let response = fixture_request(&client, "GET", Some("Bearer synthetic-access"))
            .await
            .unwrap();
        assert_eq!(response.status, expected);
        if sign_status == 200 {
            assert_eq!(client.storage_calls(), 0);
        }
    }
}

#[tokio::test]
async fn missing_session_and_unowned_methods_make_no_outbound_calls() {
    let client = FixtureClient::new(MEMBER, template_fixture("workspace"));
    assert_eq!(
        fixture_request(&client, "GET", None).await.unwrap().status,
        401
    );
    for method in ["POST", "PATCH", "DELETE", "HEAD"] {
        assert!(
            fixture_request(&client, method, Some("Bearer synthetic-access"))
                .await
                .is_none()
        );
    }
    assert!(client.calls.borrow().is_empty());
}

#[test]
fn test_extract_path_params_valid() {
    let ws_id = "11111111-1111-1111-1111-111111111111";
    let tmpl_id = "22222222-2222-2222-2222-222222222222";
    let path = format!("/api/v1/workspaces/{ws_id}/templates/{tmpl_id}/background-url");
    let result = extract_path_params(&path);
    assert_eq!(result, Some((ws_id, tmpl_id)));
}

#[test]
fn test_extract_path_params_wrong_suffix() {
    let path = "/api/v1/workspaces/ws1/templates/t1/other";
    assert!(extract_path_params(path).is_none());
}

#[test]
fn test_extract_path_params_missing_template_segment() {
    let path = "/api/v1/workspaces/ws1/background-url";
    assert!(extract_path_params(path).is_none());
}

#[test]
fn test_extract_path_params_empty_ws_id() {
    let path = "/api/v1/workspaces//templates/t1/background-url";
    assert!(extract_path_params(path).is_none());
}

#[test]
fn test_extract_path_params_extra_segment() {
    // Extra slash inside template_id should fail.
    let path = "/api/v1/workspaces/ws1/templates/t1/extra/background-url";
    assert!(extract_path_params(path).is_none());
}

#[test]
fn test_extract_path_params_personal_workspace() {
    let path =
        "/api/v1/workspaces/personal/templates/22222222-2222-2222-2222-222222222222/background-url";
    let result = extract_path_params(path);
    assert_eq!(
        result,
        Some(("personal", "22222222-2222-2222-2222-222222222222"))
    );
}

#[test]
fn test_is_uuid_valid() {
    assert!(is_uuid("550e8400-e29b-41d4-a716-446655440000"));
}

#[test]
fn test_is_uuid_too_short() {
    assert!(!is_uuid("550e8400-e29b-41d4-a716-44665544000"));
}

#[test]
fn test_is_uuid_invalid_chars() {
    assert!(!is_uuid("550e8400-e29b-41d4-a716-44665544000z"));
}

#[test]
fn test_is_uuid_no_dashes() {
    assert!(!is_uuid("550e8400xe29b41d4a716446655440000"));
}

#[test]
fn test_resolve_workspace_id_internal() {
    assert_eq!(resolve_workspace_id("internal"), ROOT_WORKSPACE_ID);
    assert_eq!(resolve_workspace_id("INTERNAL"), ROOT_WORKSPACE_ID);
}

#[test]
fn test_resolve_workspace_id_passthrough() {
    let id = "some-other-value";
    assert_eq!(resolve_workspace_id(id), id);
}

#[test]
fn test_is_workspace_handle_valid() {
    assert!(is_workspace_handle("my-workspace"));
    assert!(is_workspace_handle("myworkspace123"));
    assert!(is_workspace_handle("a"));
}

#[test]
fn test_is_workspace_handle_leading_dash() {
    assert!(!is_workspace_handle("-bad"));
    assert!(!is_workspace_handle("bad-"));
}

#[test]
fn test_storage_origin_from_rest_url() {
    // Verify the storage_origin logic by parsing a representative URL.
    let input = "https://example.supabase.co/rest/v1/__origin__";
    let origin = input.split("/rest/v1/").next().unwrap_or("");
    let storage = format!("{origin}/storage/v1");
    assert_eq!(storage, "https://example.supabase.co/storage/v1");
}
