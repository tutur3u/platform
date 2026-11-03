use super::*;
use crate::outbound::{OutboundFuture, OutboundResponse};
use serde_json::Value;

const FIXTURES: &str =
    include_str!("../../../../packages/internal-api/src/__fixtures__/tutoring-queue-parity.json");

struct FixtureClient(Value);
impl OutboundHttpClient for FixtureClient {
    fn send<'a>(&'a self, request: OutboundRequest<'a>) -> OutboundFuture<'a> {
        Box::pin(async move {
            let mut saved = json!({"preset": self.0["preset"]});
            if let Some(rules) = self.0.get("rules") {
                saved["groupExclusions"] = rules.clone();
            }
            let url = url::Url::parse(request.url).unwrap();
            let params: BTreeMap<_, _> = url.query_pairs().into_owned().collect();
            let table = url.path_segments().unwrap().next_back().unwrap();
            if table != "workspace_configs" {
                assert_eq!(params.get("limit").map(String::as_str), Some("1000"));
                assert_eq!(params.get("offset").map(String::as_str), Some("0"));
                let rows = if table == "workspace_user_groups_users" {
                    assert_eq!(params["group.ws_id"], "eq.fixture-workspace");
                    assert_eq!(params["user.archived"], "eq.false");
                    assert_eq!(params["or"], "(role.is.null,role.neq.TEACHER)");
                    assert_eq!(params["order"], "group_id.asc,user_id.asc");
                    if self.0["current"] == true
                        && self.0["role"] != "TEACHER"
                        && self.0["archived"] != true
                    {
                        json!([{"group_id":"class","user_id":"learner"}])
                    } else {
                        json!([])
                    }
                } else {
                    assert_eq!(table, "workspace_user_group_tag_groups");
                    assert_eq!(params["tag.ws_id"], "eq.fixture-workspace");
                    assert_eq!(params["order"], "group_id.asc,tag_id.asc");
                    Value::Array(
                        self.0["tags"]
                            .as_array()
                            .unwrap()
                            .iter()
                            .map(|name| json!({"group_id":"class","tag":{"name":name}}))
                            .collect(),
                    )
                };
                return Ok(OutboundResponse {
                    status: 200,
                    headers: vec![],
                    body_text: rows.to_string(),
                });
            }
            assert_eq!(params["ws_id"], "eq.fixture-workspace");
            Ok(OutboundResponse {
                status: 200,
                headers: vec![],
                body_text: json!([{"id":"TUTORING_POLICY", "value":saved.to_string()}]).to_string(),
            })
        })
    }
}

async fn run_category(category: &str) {
    let fixtures: Vec<Value> = serde_json::from_str(FIXTURES).unwrap();
    let contact = contact::ContactDataConfig::new("https://fixture.invalid/", "synthetic-key");
    let mut failures = Vec::new();
    for fixture in fixtures.iter().filter(|f| f["category"] == category) {
        let client = FixtureClient(fixture.clone());
        let policy = load_queue_policy(&contact, &client, "fixture-workspace")
            .await
            .unwrap();
        let query = TutoringQueueQuery {
            page: 1,
            page_size: 20,
            ..Default::default()
        };
        let context = load_queue_context(&contact, &client, "fixture-workspace", &query, &policy)
            .await
            .unwrap();
        let attendance = if fixture["absence"] == true {
            vec![serde_json::from_value(json!({"date":"2026-09-20","group_id":"class","user_id":"learner","group":{"name":fixture["groupName"]}})).unwrap()]
        } else {
            vec![]
        };
        let feedback = if fixture["feedback"] == true {
            vec![serde_json::from_value(json!({"id":"feedback","created_at":"2026-09-20","content":"Needs help","group_id":"class","user_id":"learner","group":{"name":fixture["groupName"]}})).unwrap()]
        } else {
            vec![]
        };
        let result = build_queue_response(
            &TutoringQueueQuery {
                page: 1,
                page_size: 20,
                ..Default::default()
            },
            attendance,
            vec![],
            feedback,
            &policy,
            &context,
            iso_day("2026-09-27").unwrap(),
        );
        let actual = result
            .data
            .first()
            .map(|row| Value::String(row.reason_type.clone()))
            .unwrap_or(Value::Null);
        if actual != fixture["expected"] {
            failures.push(format!(
                "{}: expected {}, got {}",
                fixture["name"], fixture["expected"], actual
            ));
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[tokio::test]
async fn shared_golden_tag_rules() {
    run_category("tags").await;
}
#[tokio::test]
async fn shared_golden_defaults() {
    run_category("defaults").await;
}
#[tokio::test]
async fn shared_golden_current_membership() {
    run_category("membership").await;
}
