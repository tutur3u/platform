use super::*;

pub(super) fn is_reserved_username(value: &str) -> bool {
    static POLICY: std::sync::OnceLock<serde_json::Value> = std::sync::OnceLock::new();
    let policy = POLICY.get_or_init(|| {
        serde_json::from_str(include_str!(
            "../../../../packages/utils/src/username-policy.json"
        ))
        .expect("Canonical username policy is valid JSON")
    });
    let normalized = value.to_lowercase().replace('_', "");
    ["common", "brands"].iter().any(|category| {
        policy[*category].as_array().is_some_and(|names| {
            names.iter().any(|name| {
                let Some(base) = name.as_str() else {
                    return false;
                };
                [
                    normalized.as_str(),
                    normalized.strip_prefix("official").unwrap_or(&normalized),
                ]
                .iter()
                .any(|candidate| {
                    let Some(suffix) = candidate.strip_prefix(base) else {
                        return false;
                    };
                    matches!(suffix, "" | "official" | "support" | "admin" | "team")
                        || suffix.bytes().all(|c| c.is_ascii_digit())
                })
            })
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

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn quota_timing_is_bounded_without_private_error_details() {
        for (details, expected) in [
            ("120", 120),
            ("-1", 14 * 86400),
            ("999999999999", 14 * 86400),
        ] {
            let response = OutboundResponse { status: 429, headers: vec![], body_text: json!({ "details": details, "message": "private data", "hint": "display_name_change_limit" }).to_string() };
            let result = profile_change_limit_response(&response);
            assert_eq!(result.status, 429);
            assert_eq!(
                result.body,
                json!({"message":"Profile change limit reached","code":"display_name_change_limit","retryAfter":expected})
            );
            assert!(result
                .headers
                .iter()
                .any(|(k, v)| k.eq_ignore_ascii_case("Retry-After") && v == &expected.to_string()));
        }
    }
    #[test]
    fn common_service_variants_match_sql_and_typescript() {
        for name in [
            "admin123",
            "supportteam",
            "official_admin",
            "s_u_p_p_o_r_t123",
            "official",
            "official123",
        ] {
            assert!(is_reserved_username(name));
        }
        for name in ["pineapple", "my_supportteam"] {
            assert!(!is_reserved_username(name));
        }
    }
}
