use crate::{BackendResponse, json_response, no_store_response, outbound::OutboundResponse};
use serde_json::{Value, json};

pub(super) fn update_error(response: Option<&OutboundResponse>) -> BackendResponse {
    let body = response.and_then(|r| serde_json::from_str::<Value>(&r.body_text).ok());
    if body
        .as_ref()
        .and_then(|b| b.get("code"))
        .and_then(Value::as_str)
        == Some("PT429")
    {
        let body = body.unwrap();
        let code = if body["hint"].as_str() == Some("username_change_cooldown") {
            "username_change_cooldown"
        } else {
            "display_name_change_limit"
        };
        let retry = body["details"]
            .as_str()
            .and_then(|v| v.parse::<u64>().ok())
            .filter(|v| *v > 0)
            .unwrap_or(14 * 86400)
            .min(14 * 86400);
        let mut response = no_store_response(json_response(
            429,
            json!({
                "message": "Profile change limit reached", "code": code, "retryAfter": retry,
            }),
        ));
        response
            .headers
            .push(("Retry-After".to_owned(), retry.to_string()));
        return response;
    }
    no_store_response(json_response(
        500,
        json!({"message": "Internal server error"}),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn response(body: &str) -> OutboundResponse {
        OutboundResponse {
            status: 429,
            headers: vec![],
            body_text: body.to_owned(),
        }
    }
    #[test]
    fn quota_response_preserves_bounded_timing_without_database_details() {
        let result = update_error(Some(&response(
            r#"{"code":"PT429","hint":"display_name_change_limit","details":"120","message":"private data"}"#,
        )));
        assert_eq!(result.status, 429);
        assert_eq!(
            result.body,
            json!({"message":"Profile change limit reached","code":"display_name_change_limit","retryAfter":120})
        );
        assert!(
            result
                .headers
                .iter()
                .any(|(k, v)| k == "Retry-After" && v == "120")
        );
    }
    #[test]
    fn malformed_timing_falls_back_and_other_errors_remain_generic() {
        let result = update_error(Some(&response(r#"{"code":"PT429","details":"-1"}"#)));
        assert_eq!(result.body["retryAfter"], 14 * 86400);
        assert_eq!(
            update_error(Some(&response(
                r#"{"code":"XX000","message":"private data"}"#
            )))
            .status,
            500
        );
    }
}
