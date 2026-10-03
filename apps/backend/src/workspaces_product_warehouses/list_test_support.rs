use crate::{
    contact,
    outbound::{OutboundFuture, OutboundHttpClient, OutboundRequest, OutboundResponse},
};
use serde_json::Value;
use std::{collections::VecDeque, sync::Mutex};

struct RecordedRequest {
    url: String,
    headers: Vec<(String, String)>,
}

pub(crate) struct ViewClient {
    calls: Mutex<Vec<RecordedRequest>>,
    responses: Mutex<VecDeque<OutboundResponse>>,
}

impl ViewClient {
    pub(crate) fn new(status: u16) -> Self {
        let body = if status == 200 {
            serde_json::json!([{ "id": "active" }])
        } else {
            serde_json::json!({ "code": "PGRST205" })
        };
        Self::with_json(vec![(status, body.clone()), (status, body)])
    }
    pub(crate) fn with_json(responses: Vec<(u16, Value)>) -> Self {
        Self {
            calls: Mutex::new(Vec::new()),
            responses: Mutex::new(
                responses
                    .into_iter()
                    .map(|(status, body)| OutboundResponse {
                        status,
                        body_text: body.to_string(),
                        headers: vec![("Content-Range".to_owned(), "1-1/4".to_owned())],
                    })
                    .collect(),
            ),
        }
    }
}

impl OutboundHttpClient for ViewClient {
    fn send<'a>(&'a self, request: OutboundRequest<'a>) -> OutboundFuture<'a> {
        self.calls.lock().unwrap().push(RecordedRequest {
            url: request.url.to_owned(),
            headers: request
                .headers
                .iter()
                .map(|h| (h.name.to_owned(), h.value.to_owned()))
                .collect(),
        });
        let response = self
            .responses
            .lock()
            .unwrap()
            .pop_front()
            .expect("Unexpected request");
        Box::pin(async move { Ok(response) })
    }
}

pub(crate) fn config() -> contact::ContactDataConfig {
    contact::ContactDataConfig::new("https://database.example.invalid", "synthetic-test-key")
}

pub(crate) fn assert_bounded_view_request(client: &ViewClient, expected_calls: usize) {
    let calls = client.calls.lock().unwrap();
    assert_eq!(calls.len(), expected_calls, "Bounded readiness calls");
    let raw_url = &calls[0].url;
    let headers = &calls[0].headers;
    assert!(raw_url.len() < 300);
    assert!(!raw_url.contains("not.in"));
    let url = url::Url::parse(raw_url).unwrap();
    assert_eq!(url.path(), "/rest/v1/inventory_active_warehouses");
    let query: std::collections::HashMap<_, _> = url.query_pairs().collect();
    assert_eq!(query.get("ws_id").map(|v| v.as_ref()), Some("eq.workspace"));
    assert_eq!(query.get("offset").map(|v| v.as_ref()), Some("1"));
    assert_eq!(query.get("limit").map(|v| v.as_ref()), Some("1"));
    assert!(!query.contains_key("id"));
    assert!(
        headers
            .iter()
            .any(|(k, v)| k == "Accept-Profile" && v == "private")
    );
    assert!(
        headers
            .iter()
            .any(|(k, v)| k == "Prefer" && v == "count=exact")
    );
}

pub(crate) fn assert_legacy_request(client: &ViewClient) {
    assert_bounded_view_request(client, 4);
    let calls = client.calls.lock().unwrap();
    assert!(
        calls
            .iter()
            .all(|r| r.url.len() < 300 && !r.url.contains("not.in"))
    );
    assert_eq!(
        url::Url::parse(&calls[1].url).unwrap().path(),
        "/rest/v1/rpc/get_inventory_product_form_options"
    );
    let legacy = url::Url::parse(&calls[2].url).unwrap();
    assert_eq!(legacy.path(), "/rest/v1/inventory_warehouses");
    let query: std::collections::HashMap<_, _> = legacy.query_pairs().collect();
    assert_eq!(query.get("ws_id").map(|v| v.as_ref()), Some("eq.workspace"));
    assert_eq!(query.get("offset").map(|v| v.as_ref()), Some("1"));
    assert_eq!(query.get("limit").map(|v| v.as_ref()), Some("1"));
}
