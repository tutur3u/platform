use crate::{
    contact,
    outbound::{OutboundFuture, OutboundHttpClient, OutboundRequest, OutboundResponse},
};
use std::sync::Mutex;

struct RecordedRequest {
    url: String,
    headers: Vec<(String, String)>,
}

pub(crate) struct ViewClient {
    calls: Mutex<Vec<RecordedRequest>>,
    status: u16,
}

impl ViewClient {
    pub(crate) fn new(status: u16) -> Self {
        Self {
            calls: Mutex::new(Vec::new()),
            status,
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
        let status = self.status;
        Box::pin(async move {
            Ok(OutboundResponse {
                status,
                body_text: if status == 200 {
                    "[{\"id\":\"active\"}]"
                } else {
                    "{\"code\":\"PGRST205\"}"
                }
                .to_owned(),
                headers: vec![("Content-Range".to_owned(), "1-1/4".to_owned())],
            })
        })
    }
}

pub(crate) fn config() -> contact::ContactDataConfig {
    contact::ContactDataConfig::new("https://database.example.invalid", "synthetic-test-key")
}

pub(crate) fn assert_bounded_view_request(client: &ViewClient) {
    let calls = client.calls.lock().unwrap();
    assert_eq!(calls.len(), 1, "No alias enumeration or old-table fallback");
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
