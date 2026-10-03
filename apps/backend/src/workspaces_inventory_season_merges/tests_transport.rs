//! Auth/actor/RPC source parity regressions; execute in backend CI.
use super::*;
use crate::outbound::{OutboundFuture, OutboundResponse};
use std::sync::Mutex;
const ACTOR: &str = "00000000-0000-4000-8000-000000000001";
const WS: &str = "00000000-0000-4000-8000-000000000010";
struct Recording {
    calls: Mutex<Vec<(String, Option<String>)>>,
    membership_status: u16,
    member_type: &'static str,
    creator_id: &'static str,
    failure: Option<(&'static str, bool)>,
    permissions: Vec<&'static str>,
}
impl OutboundHttpClient for Recording {
    fn send<'a>(&'a self, request: OutboundRequest<'a>) -> OutboundFuture<'a> {
        self.calls
            .lock()
            .unwrap()
            .push((request.url.into(), request.body.map(str::to_owned)));
        if let Some((table, transport)) = self.failure {
            if request.url.contains(&format!("/{table}?")) {
                return Box::pin(async move {
                    if transport {
                        return Err(crate::outbound::OutboundError::Body(
                            "synthetic failure".into(),
                        ));
                    }
                    Ok(OutboundResponse {
                        body_text: "{}".into(),
                        headers: vec![],
                        status: 503,
                    })
                });
            }
        }
        let mut status = 200;
        let body = if request.url.contains("/auth/v1/user") {
            json!({"id":ACTOR})
        } else if request.url.contains("/workspace_members?") {
            status = self.membership_status;
            json!([{"type":self.member_type}])
        } else if request.url.contains("/workspaces?") {
            json!([{"creator_id":self.creator_id}])
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
        member_type: "MEMBER",
        creator_id: "another",
        failure: None,
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
            member_type: "MEMBER",
            creator_id: "another",
            failure: None,
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
        member_type: "MEMBER",
        creator_id: "another",
        failure: None,
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

#[tokio::test]
async fn permission_provider_failures_preserve_web_404_without_privileged_rpc() {
    for table in [
        "workspace_role_members",
        "workspace_default_permissions",
        "workspaces",
    ] {
        for transport in [false, true] {
            let client = Recording {
                calls: Mutex::new(vec![]),
                membership_status: 200,
                member_type: "MEMBER",
                creator_id: "another",
                permissions: vec!["admin"],
                failure: Some((table, transport)),
            };
            for workspace in [WS, "personal"] {
                // Personal resolution uses workspaces before role lookup.
                if workspace == "personal" && table != "workspaces" {
                    continue;
                }
                let path = format!("/api/v1/workspaces/{workspace}/inventory/sales-periods/merges");
                assert_eq!(
                    handle_route(&config(), request("POST", &path, Some("{}")), &client)
                        .await
                        .unwrap()
                        .status,
                    404
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
    }
}

#[tokio::test]
async fn non_members_never_inherit_creator_or_default_permission_merge_access() {
    let config = config();
    let path = format!("/api/v1/workspaces/{WS}/inventory/sales-periods/merges");
    let body = json!({
        "sourceId":"00000000-0000-4000-8000-000000000002",
        "targetId":"00000000-0000-4000-8000-000000000003",
        "version":"00000000-0000-4000-8000-000000000004",
        "descriptionPolicy":"source","rulePolicy":"target","pricePolicy":"block"
    })
    .to_string();
    let url = format!(
        "https://inventory.test{path}?sourceId=00000000-0000-4000-8000-000000000002&targetId=00000000-0000-4000-8000-000000000003"
    );
    for member_type in ["GUEST", "unknown"] {
        for creator_id in [ACTOR, "another"] {
            for permissions in [
                vec!["admin"],
                vec!["update_invoices", "delete_invoices", "update_inventory"],
            ] {
                for method in ["GET", "POST"] {
                    let client = Recording {
                        calls: Mutex::new(vec![]),
                        membership_status: 200,
                        member_type,
                        creator_id,
                        permissions: permissions.clone(),
                        failure: None,
                    };
                    let request = BackendRequest {
                        url: Some(&url),
                        ..request(method, &path, Some(&body))
                    };
                    let response = handle_route(&config, request, &client).await.unwrap();
                    assert_eq!(response.status, 403);
                    let calls = client.calls.lock().unwrap();
                    assert!(
                        calls
                            .iter()
                            .any(|(url, _)| url.contains("/workspace_members?"))
                    );
                    assert!(!calls.iter().any(|(url, _)| url.contains("/workspaces?")
                        || url.contains("/workspace_default_permissions?")
                        || url.contains("/rpc/")));
                }
            }
        }
    }
}
