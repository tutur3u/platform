//! Source color hydration parity for the Calendar satellite's event GET.
//! This future backend handler is not deployed; actor/account binding matches TS.
use super::*;

pub(super) async fn hydrate_source_colors(
    config: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    events: &mut [Value],
) -> Result<(), ()> {
    if !events.iter().any(|event| event["provider"] == "google") {
        return Ok(());
    }
    let tokens = admin_rows(
        config,
        outbound,
        "calendar_auth_tokens",
        &[
            ("select", "id".into()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("provider", "eq.google".into()),
            ("is_active", "eq.true".into()),
        ],
    )
    .await?;
    let ids: Vec<&str> = tokens
        .iter()
        .filter_map(|token| token["id"].as_str())
        .collect();
    if ids.is_empty() {
        return Ok(());
    }
    let connections = admin_rows(
        config,
        outbound,
        "calendar_connections",
        &[
            ("select", "calendar_id,workspace_calendar_id,color".into()),
            ("ws_id", format!("eq.{ws_id}")),
            ("provider", "eq.google".into()),
            ("is_enabled", "eq.true".into()),
            ("auth_token_id", format!("in.({})", ids.join(","))),
        ],
    )
    .await?;
    apply_source_colors(events, &connections);
    Ok(())
}

async fn admin_rows(
    config: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    filters: &[(&str, String)],
) -> Result<Vec<Value>, ()> {
    let url = config.rest_url(table, filters).ok_or(())?;
    let key = config.service_role_key().ok_or(())?;
    let response = send_caller_get(config, outbound, &url, key).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    response.json::<Vec<Value>>().map_err(|_| ())
}

fn opaque_rgb(value: &Value) -> Option<String> {
    let rgb = value.as_str()?;
    (rgb.len() == 7
        && rgb.starts_with('#')
        && rgb[1..].bytes().all(|byte| byte.is_ascii_hexdigit()))
    .then(|| rgb.to_ascii_lowercase())
}

fn apply_source_colors(events: &mut [Value], connections: &[Value]) {
    for event in events {
        if event["provider"] != "google" {
            continue;
        }
        let calendar = event["external_calendar_id"]
            .as_str()
            .or(event["google_calendar_id"].as_str());
        let source_id = event["source_calendar_id"].as_str();
        let matches: Vec<&Value> = connections
            .iter()
            .filter(|source| {
                calendar.is_some()
                    && source["calendar_id"].as_str() == calendar
                    && source_id
                        .is_none_or(|id| source["workspace_calendar_id"].as_str() == Some(id))
            })
            .collect();
        if matches.len() == 1 {
            if let Some(rgb) = opaque_rgb(&matches[0]["color"]) {
                if let Some(object) = event.as_object_mut() {
                    object.insert("_calendarColor".into(), Value::String(rgb));
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hydrates_only_unambiguous_matching_google_source_with_opaque_rgb() {
        let mut events = vec![
            json!({"provider":"google","external_calendar_id":"source","source_calendar_id":"native"}),
            json!({"provider":"tuturuuu","color":"GREEN"}),
            json!({"provider":"google","external_calendar_id":"other"}),
        ];
        apply_source_colors(
            &mut events,
            &[json!({"calendar_id":"source","workspace_calendar_id":"native","color":"#D06B64"})],
        );
        assert_eq!(events[0]["_calendarColor"], "#d06b64");
        assert!(events[1].get("_calendarColor").is_none());
        assert!(events[2].get("_calendarColor").is_none());
    }
    #[test]
    fn rejects_ambiguous_sources_and_alpha_or_native_names() {
        let mut events = vec![json!({"provider":"google","external_calendar_id":"source"})];
        apply_source_colors(
            &mut events,
            &[
                json!({"calendar_id":"source","color":"#ffffff"}),
                json!({"calendar_id":"source","color":"#000000"}),
            ],
        );
        assert!(events[0].get("_calendarColor").is_none());
        assert!(opaque_rgb(&json!("#ffffff80")).is_none());
        assert!(opaque_rgb(&json!("BLUE")).is_none());
    }
}
