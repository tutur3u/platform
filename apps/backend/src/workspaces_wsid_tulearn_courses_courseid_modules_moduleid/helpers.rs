use super::*;

// ---------------------------------------------------------------------------
// REST helpers
// ---------------------------------------------------------------------------

pub(super) async fn service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    schema: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let mut req = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);
    if let Some(schema) = schema {
        req = req.with_header("Accept-Profile", schema);
    }
    outbound.send(req).await.map_err(|_| ())
}

pub(super) async fn caller_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

pub(super) fn student_id_from_url(request_url: Option<&str>) -> Option<String> {
    let url = request_url.and_then(|u| url::Url::parse(u).ok())?;
    url.query_pairs().find_map(|(key, value)| {
        (key == "studentId" && !value.trim().is_empty()).then(|| value.into_owned())
    })
}

pub(super) fn in_list(ids: &[String]) -> String {
    let inner = ids
        .iter()
        .map(|id| format!("\"{}\"", id.replace('"', "")))
        .collect::<Vec<_>>()
        .join(",");
    format!("({inner})")
}

/// Extracts the first embedded object from a PostgREST one-to-one or
/// one-to-many embed (which may be returned as an object or a single-element
/// array).
pub(super) fn first_embed(value: Option<Value>) -> Option<Value> {
    match value? {
        Value::Array(arr) => arr.into_iter().next(),
        obj @ Value::Object(_) => Some(obj),
        _ => None,
    }
}

pub(super) fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
