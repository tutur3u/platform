use super::*;

pub(crate) async fn handle_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = pending_summary_ws_id(request.path)?;
    if !["GET", "HEAD"].contains(&request.method) {
        return None;
    }
    let is_head = request.method == "HEAD";
    let get_request = BackendRequest {
        method: "GET",
        ..request
    };
    let mut response = pending_summary_response(config, get_request, raw_ws_id, outbound).await;
    if is_head {
        response.body_empty = true;
        response.body_text = None;
        response.body = serde_json::Value::Null;
    }
    Some(response)
}
