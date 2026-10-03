//! Auth/actor/RPC source parity regressions; execute in backend CI.
use super::*;
use crate::outbound::{OutboundFuture, OutboundResponse};
use std::sync::Mutex;
const ACTOR: &str = "00000000-0000-4000-8000-000000000001";
const WS: &str = "00000000-0000-4000-8000-000000000010";
struct Recording {
    calls: Mutex<Vec<(String, Option<String>)>>,
    membership_status: u16,
    permissions: Vec<&'static str>,
}
impl OutboundHttpClient for Recording {
    fn send<'a>(&'a self, request: OutboundRequest<'a>) -> OutboundFuture<'a> {
        self.calls
            .lock()
            .unwrap()
            .push((request.url.into(), request.body.map(str::to_owned)));
        let mut status = 200;
        let body = if request.url.contains("/auth/v1/user") {
            json!({"id":ACTOR})
        } else if request.url.contains("/workspace_members?") {
            status = self.membership_status;
            json!([{"type":"MEMBER"}])
        } else if request.url.contains("/workspaces?") {
            json!([{"creator_id":"another"}])
        } else if request.url.contains("/workspace_role_members?") {
            json!([])
        } else if request.url.contains("/workspace_default_permissions?") {
            json!(
                self.permissions
                    .iter()
                    .map(|p| json!({"permission":p}))
                    .collect::<Vec<_>>()
            )
        } else if request
            .url
            .ends_with("/rpc/inventory_season_merge_schema_ready")
        {
            json!(true)
        } else if request.url.ends_with("/rpc/apply_inventory_season_merge") {
            json!({"merged":true,"targetId":"00000000-0000-4000-8000-000000000003","importedPriceCount":0})
        } else {
            json!(null)
        };
        Box::pin(async move {
            Ok(OutboundResponse {
                body_text: body.to_string(),
                headers: vec![],
                status,
            })
        })
    }
}
fn request<'a>(method: &'a str, path: &'a str, body: Option<&'a str>) -> BackendRequest<'a> {
    BackendRequest {
        method,
        path,
        body_text: body,
        authorization: Some("Bearer synthetic-test-token"),
        cookie: None,
        if_none_match: None,
        origin: None,
        referer: None,
        request_id: None,
        url: None,
    }
}
fn config() -> BackendConfig {
    let mut config = BackendConfig::new("test", "test");
    config.contact_data = crate::contact::ContactDataConfig::new(
        "https://supabase.test",
        "synthetic-test-service-key",
    );
    config
}
#[tokio::test]
async fn transport_stamps_authenticated_actor_and_workspace() {
    let client = Recording {
        calls: Mutex::new(vec![]),
        membership_status: 200,
        permissions: vec!["update_invoices", "delete_invoices", "update_inventory"],
    };
    let path = format!("/api/v1/workspaces/{WS}/inventory/sales-periods/merges");
    let body=json!({"sourceId":"00000000-0000-4000-8000-000000000002","targetId":"00000000-0000-4000-8000-000000000003","version":"00000000-0000-4000-8000-000000000004","descriptionPolicy":"source","rulePolicy":"target","pricePolicy":"block","actorId":"forged","wsId":"forged"}).to_string();
    let result = handle_route(&config(), request("POST", &path, Some(&body)), &client)
        .await
        .unwrap();
    assert_eq!(result.status, 200);
    assert_eq!(result.cache_control, Some("no-store"));
    let calls = client.calls.lock().unwrap();
    let (_, body) = calls
        .iter()
        .find(|(url, _)| url.ends_with("/rpc/apply_inventory_season_merge"))
        .unwrap();
    let args: Value = serde_json::from_str(body.as_deref().unwrap()).unwrap();
    assert_eq!(args["p_actor_id"], ACTOR);
    assert_eq!(args["p_ws_id"], WS);
}
#[tokio::test]
async fn membership_failure_and_missing_roles_never_reach_privileged_rpc() {
    for (membership_status, permissions, expected) in [
        (500, vec!["admin"], 500),
        (200, vec!["update_inventory"], 403),
    ] {
        let client = Recording {
            calls: Mutex::new(vec![]),
            membership_status,
            permissions,
        };
        let path = format!("/api/v1/workspaces/{WS}/inventory/sales-periods/merges");
        assert_eq!(
            handle_route(&config(), request("POST", &path, Some("{}")), &client)
                .await
                .unwrap()
                .status,
            expected
        );
        assert!(
            !client
                .calls
                .lock()
                .unwrap()
                .iter()
                .any(|(url, _)| url.contains("/rpc/"))
        );
    }
}
#[tokio::test]
async fn dispatcher_method_coverage_and_fallthrough() {
    let client = Recording {
        calls: Mutex::new(vec![]),
        membership_status: 200,
        permissions: vec![],
    };
    let config = config();
    let path = format!("/api/v1/workspaces/{WS}/inventory/sales-periods/merges");
    for method in ["GET", "POST"] {
        assert!(
            handle_route(&config, request(method, &path, None), &client)
                .await
                .is_some()
        );
    }
    for method in ["PUT", "DELETE", "PATCH"] {
        assert!(
            handle_route(&config, request(method, &path, None), &client)
                .await
                .is_none()
        );
    }
    for path in ["/", "/api", "/api/v1/workspaces/a/inventory/merges"] {
        assert!(
            handle_route(&config, request("GET", path, None), &client)
                .await
                .is_none()
        );
    }
}
