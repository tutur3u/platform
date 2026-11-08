use super::*;
use crate::outbound::OutboundFuture;
use std::sync::Mutex;

#[derive(Default)]
struct Client {
    fail_table: Option<&'static str>,
    malformed: bool,
    endless: bool,
    calls: Mutex<Vec<(String, usize)>>,
}

impl OutboundHttpClient for Client {
    fn send<'a>(&'a self, request: OutboundRequest<'a>) -> OutboundFuture<'a> {
        Box::pin(async move {
            let url = url::Url::parse(request.url).unwrap();
            let params: BTreeMap<_, _> = url.query_pairs().into_owned().collect();
            let table = url.path_segments().unwrap().next_back().unwrap();
            let offset: usize = params["offset"].parse().unwrap();
            self.calls.lock().unwrap().push((table.to_owned(), offset));
            assert_eq!(params["limit"], "1000");
            if table == "workspace_user_groups_users" {
                assert_eq!(params["group.ws_id"], "eq.fixture-workspace");
                assert_eq!(params["group_id"], "eq.class");
                assert_eq!(params["user_id"], "eq.learner");
                assert_eq!(params["user.archived"], "eq.false");
                assert_eq!(params["or"], "(role.is.null,role.neq.TEACHER)");
                assert_eq!(params["order"], "group_id.asc,user_id.asc");
            } else {
                assert_eq!(table, "workspace_user_group_tag_groups");
                assert_eq!(params["tag.ws_id"], "eq.fixture-workspace");
                assert_eq!(params["order"], "group_id.asc,tag_id.asc");
            }
            if self.fail_table == Some(table) && offset > 0 {
                return Ok(OutboundResponse {
                    status: if self.malformed { 200 } else { 503 },
                    headers: vec![],
                    body_text: "{bad json".to_owned(),
                });
            }
            let count = if offset == 0 || self.endless { 1000 } else { 1 };
            let rows: Vec<_> = (0..count).map(|i| {
                if table == "workspace_user_groups_users" {
                    json!({"group_id":"class", "user_id":format!("learner-{}",offset+i)})
                } else {
                    json!({"group_id":"class", "tag":{"name":if offset > 0 {"last-tag"} else {"first-tag"}}})
                }
            }).collect();
            Ok(OutboundResponse {
                status: 200,
                headers: vec![],
                body_text: serde_json::to_string(&rows).unwrap(),
            })
        })
    }
}

fn query() -> TutoringQueueQuery {
    TutoringQueueQuery {
        group_id: Some("class".to_owned()),
        student_user_id: Some("learner".to_owned()),
        ..Default::default()
    }
}

fn policy(tags: bool) -> QueuePolicy {
    QueuePolicy {
        reassessment_days: 14,
        absence_lookback_days: 28,
        weak_content_review_days: 0,
        group_exclusions: if tags {
            vec![
                serde_json::from_value(
                    json!({"scope":"all","match":"exact","value":"last-tag","target":"tag"}),
                )
                .unwrap(),
            ]
        } else {
            vec![]
        },
    }
}

#[tokio::test]
async fn context_reads_all_membership_and_tag_pages_with_scoped_filters() {
    let client = Client::default();
    let contact = contact::ContactDataConfig::new("https://fixture.invalid/", "synthetic-key");
    let context = load_queue_context(
        &contact,
        &client,
        "fixture-workspace",
        &query(),
        &policy(true),
    )
    .await
    .unwrap();
    assert_eq!(context.current_keys.len(), 1001);
    assert!(context.current_keys.contains("class:learner-1000"));
    assert_eq!(context.tags["class"].len(), 1001);
    assert_eq!(context.tags["class"].last().unwrap(), "last-tag");
    assert!(group_excluded(
        &policy(true),
        "Class",
        "make_up",
        &context.tags["class"]
    ));
    assert_eq!(client.calls.lock().unwrap().len(), 4);
}

#[tokio::test]
async fn context_skips_tags_without_tag_rules() {
    let client = Client::default();
    let contact = contact::ContactDataConfig::new("https://fixture.invalid/", "synthetic-key");
    let context = load_queue_context(
        &contact,
        &client,
        "fixture-workspace",
        &query(),
        &policy(false),
    )
    .await
    .unwrap();
    assert!(context.tags.is_empty());
    assert_eq!(client.calls.lock().unwrap().len(), 2);
}

#[tokio::test]
async fn context_fails_closed_on_later_membership_or_tag_page_errors() {
    let contact = contact::ContactDataConfig::new("https://fixture.invalid/", "synthetic-key");
    for table in [
        "workspace_user_groups_users",
        "workspace_user_group_tag_groups",
    ] {
        for malformed in [false, true] {
            let client = Client {
                fail_table: Some(table),
                malformed,
                ..Default::default()
            };
            assert!(
                load_queue_context(
                    &contact,
                    &client,
                    "fixture-workspace",
                    &query(),
                    &policy(true)
                )
                .await
                .is_err(),
                "{table}, malformed={malformed}"
            );
        }
    }
}

#[tokio::test]
async fn context_fails_closed_at_page_limit() {
    let contact = contact::ContactDataConfig::new("https://fixture.invalid/", "synthetic-key");
    let client = Client {
        endless: true,
        ..Default::default()
    };
    assert!(
        load_queue_context(
            &contact,
            &client,
            "fixture-workspace",
            &query(),
            &policy(false)
        )
        .await
        .is_err()
    );
    assert_eq!(client.calls.lock().unwrap().len(), 200);
}
