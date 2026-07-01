use super::*;

// ---------------------------------------------------------------------------
// Column / header / row / CSV building (mirrors the legacy route body).
// ---------------------------------------------------------------------------

pub(super) fn build_columns(
    definition: &FormDefinition,
    _records: &[ResponseRecord],
) -> Vec<ExportColumn> {
    // knownColumns: answerable questions, keyed by question id, labelled by normalized title.
    let known_columns: Vec<ExportColumn> = definition
        .sections
        .iter()
        .flat_map(|section| section.questions.iter())
        .filter(|question| ANSWERABLE_TYPES.contains(&question.type_.as_str()))
        .map(|question| {
            let label = normalize_markdown_to_text(&question.title);
            let label = if label.trim().is_empty() {
                question.id.clone()
            } else {
                label
            };
            ExportColumn {
                key: question.id.clone(),
                label,
            }
        })
        .collect();

    // extraAnswerKeys: unique answer keys across records, in first-seen order.
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut extra_keys: Vec<String> = Vec::new();
    for record in _records {
        for key in record.answers.keys() {
            if seen.insert(key.clone()) {
                extra_keys.push(key.clone());
            }
        }
    }

    let known_keys: std::collections::HashSet<String> =
        known_columns.iter().map(|c| c.key.clone()).collect();

    let mut columns = known_columns;
    for answer_key in extra_keys {
        if !known_keys.contains(answer_key.as_str()) {
            columns.push(ExportColumn {
                key: answer_key.clone(),
                label: answer_key,
            });
        }
    }

    columns
}

pub(super) fn build_header(columns: &[ExportColumn]) -> Vec<String> {
    let mut header = vec!["Submitted at".to_owned(), "Responder".to_owned()];
    header.extend(columns.iter().map(|column| column.label.clone()));
    header
}

pub(super) fn build_rows(records: &[ResponseRecord], columns: &[ExportColumn]) -> Vec<Vec<String>> {
    records
        .iter()
        .map(|record| {
            let mut row = vec![record.submitted_at.clone(), record.responder.clone()];
            for column in columns {
                row.push(record.answers.get(&column.key).cloned().unwrap_or_default());
            }
            row
        })
        .collect()
}

pub(super) fn build_csv(header: &[String], rows: &[Vec<String>]) -> String {
    let mut lines: Vec<String> = Vec::with_capacity(rows.len() + 1);
    lines.push(csv_line(header));
    for row in rows {
        lines.push(csv_line(row));
    }
    lines.join("\n")
}

pub(super) fn csv_line(values: &[String]) -> String {
    values
        .iter()
        .map(|value| format!("\"{}\"", value.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(",")
}

// ---------------------------------------------------------------------------
// Response builders + small helpers.
// ---------------------------------------------------------------------------

pub(super) fn csv_response(form_id: &str, csv: String) -> BackendResponse {
    BackendResponse {
        allow: None,
        body: Value::Null,
        body_empty: false,
        body_text: Some(csv),
        cache_control: None,
        content_type: Some("text/csv; charset=utf-8"),
        headers: vec![(
            "Content-Disposition",
            format!("attachment; filename=\"form-{form_id}-responses.csv\""),
        )],
        status: 200,
    }
}

pub(super) fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

pub(super) fn first_id(response: &OutboundResponse) -> Option<String> {
    response
        .json::<Vec<Value>>()
        .ok()?
        .into_iter()
        .next()
        .and_then(|row| row.get("id").and_then(Value::as_str).map(str::to_owned))
}
