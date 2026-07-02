use super::*;

/// Parses the `q` and `selectedGroupId` query parameters, mirroring the legacy
/// zod schema (`q.max(500).optional()`, `selectedGroupId.max(100).optional()`).
/// Returns `Err(response)` with the legacy `400` payload when validation fails.
#[allow(clippy::result_large_err)]
pub(super) fn parse_search_params(
    request_url: Option<&str>,
) -> Result<(Option<String>, Option<String>), BackendResponse> {
    let mut q: Option<String> = None;
    let mut selected_group_id: Option<String> = None;

    if let Some(url) = request_url.and_then(|value| url::Url::parse(value).ok()) {
        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "q" => q = Some(value.into_owned()),
                "selectedGroupId" => selected_group_id = Some(value.into_owned()),
                _ => {}
            }
        }
    }

    let mut issues = Vec::new();

    if let Some(value) = q.as_deref()
        && value.chars().count() > MAX_SEARCH_LENGTH
    {
        issues.push(too_big_issue("q", MAX_SEARCH_LENGTH));
    }

    if let Some(value) = selected_group_id.as_deref()
        && value.chars().count() > MAX_SHORT_TEXT_LENGTH
    {
        issues.push(too_big_issue("selectedGroupId", MAX_SHORT_TEXT_LENGTH));
    }

    if !issues.is_empty() {
        return Err(no_store_response(json_response(
            400,
            json!({
                "message": "Invalid query parameters",
                "issues": issues,
            }),
        )));
    }

    // Legacy code branches on JS truthiness (`if (q)` / `if (selectedGroupId)`),
    // so empty strings behave like absent values downstream.
    Ok((
        q.filter(|value| !value.is_empty()),
        selected_group_id.filter(|value| !value.is_empty()),
    ))
}

pub(super) fn too_big_issue(path: &str, maximum: usize) -> Value {
    json!({
        "code": "too_big",
        "maximum": maximum,
        "type": "string",
        "inclusive": true,
        "exact": false,
        "message": format!("String must contain at most {maximum} character(s)"),
        "path": [path],
    })
}
