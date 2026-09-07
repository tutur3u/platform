use super::{ConnectionRow, DashboardRow};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Failure {
    connection_id: String,
    calendar_name: String,
    code: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Diagnostics {
    version: u8,
    failed_calendars: Vec<Failure>,
}

// Only expose versioned, typed diagnostics. Never expose arbitrary stack traces.
pub(super) fn failed_calendars(runs: &[DashboardRow], connections: &[ConnectionRow]) -> Value {
    let parsed = runs
        .first()
        .and_then(|run| run.error_stack_trace.as_deref())
        .and_then(|raw| serde_json::from_str::<Diagnostics>(raw).ok())
        .filter(|data| data.version == 1);
    let Some(data) = parsed else {
        return json!([]);
    };
    json!(
        data.failed_calendars
            .into_iter()
            .filter(|failure| connections.iter().any(|connection| connection
                .id
                .as_ref()
                .and_then(Value::as_str)
                == Some(failure.connection_id.as_str())
                && connection.is_enabled == Some(true)
                && connection.sync_inbound_enabled != Some(false)))
            .collect::<Vec<_>>()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_returns_enabled_failures_and_typed_fields() {
        let run: DashboardRow = serde_json::from_value(json!({"error_stack_trace": json!({
            "version": 1, "failedCalendars": [
                {"connectionId": "a", "calendarName": "Active", "code": "not_found", "secret": "hidden"},
                {"connectionId": "b", "calendarName": "Paused", "code": "unknown"}
            ]}).to_string()})).unwrap();
        let connections: Vec<ConnectionRow> = serde_json::from_value(json!([
            {"id": "a", "is_enabled": true},
            {"id": "b", "is_enabled": true, "sync_inbound_enabled": false}
        ]))
        .unwrap();
        assert_eq!(
            failed_calendars(&[run], &connections),
            json!([
                {"connectionId": "a", "calendarName": "Active", "code": "not_found"}
            ])
        );
    }

    #[test]
    fn rejects_unstructured_diagnostics() {
        let run: DashboardRow =
            serde_json::from_value(json!({"error_stack_trace": "private error stack"})).unwrap();
        assert_eq!(failed_calendars(&[run], &[]), json!([]));
    }
}
