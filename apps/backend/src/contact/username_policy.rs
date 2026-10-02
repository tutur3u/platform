use super::*;

pub(super) fn is_reserved_username(value: &str) -> bool {
    let policy: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../packages/utils/src/username-policy.json"
    ))
    .expect("Canonical username policy is valid JSON");
    let normalized = value.to_lowercase().replace('_', "");
    if policy["common"].as_array().is_some_and(|names| {
        names
            .iter()
            .any(|name| name.as_str() == Some(normalized.as_str()))
    }) {
        return true;
    }
    policy["brands"].as_array().is_some_and(|names| {
        names.iter().any(|name| {
            let Some(brand) = name.as_str() else {
                return false;
            };
            let candidate = normalized.strip_prefix("official").unwrap_or(&normalized);
            let Some(suffix) = candidate.strip_prefix(brand) else {
                return false;
            };
            matches!(suffix, "" | "official" | "support" | "admin" | "team")
                || suffix.bytes().all(|c| c.is_ascii_digit())
        })
    })
}

pub(super) fn profile_change_limit_response(response: &OutboundResponse) -> BackendResponse {
    let body = serde_json::from_str::<serde_json::Value>(&response.body_text).unwrap_or_default();
    let code = if body["hint"].as_str() == Some("username_change_cooldown") {
        "username_change_cooldown"
    } else {
        "display_name_change_limit"
    };
    let retry_after = body["details"]
        .as_str()
        .and_then(|value| value.parse::<u32>().ok())
        .filter(|seconds| *seconds > 0)
        .unwrap_or(14 * 86400)
        .min(14 * 86400);
    let mut response = no_store_response(json_response(
        429,
        json!({
            "message": "Profile change limit reached", "code": code, "retryAfter": retry_after
        }),
    ));
    response
        .headers
        .push(("retry-after", retry_after.to_string()));
    response
}
