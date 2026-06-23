//! Handler for `GET /api/v1/workspaces/:wsId/forms/:formId/responses/export`.
//!
//! Ports
//! `apps/web/src/app/api/v1/workspaces/[wsId]/forms/[formId]/responses/export/route.ts`.
//!
//! Behavior mirrored from the legacy route:
//! - GET only (other methods => 405).
//! - 401 `{ "error": "Unauthorized" }` when there is no authenticated Supabase user.
//! - 403 `{ "error": "Forbidden" }` when the caller is not a workspace MEMBER, or
//!   lacks BOTH `manage_forms` AND `view_form_analytics` permissions.
//! - 404 `{ "error": "Form not found" }` when the form does not exist or belongs to a
//!   different workspace than the resolved `wsId`.
//! - 500 `{ "error": "<message>" }` for internal failures (mirrors the legacy catch-all,
//!   which surfaces `Invalid workspace ID` / `Invalid form ID` / `Internal server error`).
//! - 200 returns a downloadable spreadsheet (CSV by default) with a
//!   `Content-Disposition: attachment; filename="form-<formId>-responses.csv"` header and
//!   `Content-Type: text/csv; charset=utf-8`.
//!
//! Query params (read from the request URL):
//! - `q`: free-text search forwarded to the response-page RPC.
//! - `format`: `excel` or `xlsx` selects the spreadsheet branch; anything else => CSV.
//!
//! KNOWN DIVERGENCE (see notes in the structured result):
//! - The legacy `xlsx`/`excel` branch builds a real `.xlsx` workbook with the JS `XLSX`
//!   library. The backend has no spreadsheet-writer crate available, and adding a
//!   dependency is out of scope for this port. When `format=xlsx|excel` is requested this
//!   handler returns 500 `{ "error": "XLSX export is not supported by this backend" }`
//!   rather than silently emitting a CSV with the wrong content type. The integrator must
//!   decide whether to keep the legacy JS route for xlsx or add an xlsx crate.
//! - The legacy answer-formatting pipeline (`createStoredAnswerQuestionResolver` +
//!   `formatAnswerForQuestion` + option matching/markdown stripping) is reproduced here in
//!   Rust. The markdown stripper is a best-effort port of `stripMarkdownToText`; the JS
//!   version relies on regex semantics that are approximated, so exotic markdown may format
//!   slightly differently. Plain-text titles/answers (the common case) match exactly.

use std::collections::HashMap;

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PRIVATE_SCHEMA: &str = "private";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const FORM_NOT_FOUND_MESSAGE: &str = "Form not found";
const INVALID_WORKSPACE_ID_MESSAGE: &str = "Invalid workspace ID";
const INVALID_FORM_ID_MESSAGE: &str = "Invalid form ID";
const INTERNAL_ERROR_MESSAGE: &str = "Internal server error";
const XLSX_UNSUPPORTED_MESSAGE: &str = "XLSX export is not supported by this backend";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";
const MANAGE_FORMS_PERMISSION: &str = "manage_forms";
const VIEW_FORM_ANALYTICS_PERMISSION: &str = "view_form_analytics";

const RESPONSE_PAGE_RPC: &str = "get_form_response_page";
const MATCHED_RESPONSE_IDS_RPC: &str = "get_form_matched_response_ids";

const EXPORT_PAGE_SIZE: i64 = 5000;
const CHUNK_SIZE: usize = 500;

const ANSWERABLE_TYPES: &[&str] = &[
    "short_text",
    "long_text",
    "single_choice",
    "multiple_choice",
    "dropdown",
    "linear_scale",
    "rating",
    "date",
    "time",
];

const WORKSPACE_RESPONSES_EXPORT_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACE_RESPONSES_EXPORT_PATH_SUFFIX: &str = "/responses/export";
const WORKSPACE_RESPONSES_EXPORT_INFIX: &str = "/forms/";

pub(crate) async fn handle_workspaces_forms_responses_export_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, raw_form_id) = workspace_responses_export_segments(request.path)?;

    Some(match request.method {
        "GET" => {
            workspace_responses_export_response(config, request, raw_ws_id, raw_form_id, outbound)
                .await
        }
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn workspace_responses_export_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    raw_form_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Auth: resolve the Supabase user from the bearer/cookie access token.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };

    // Resolve the workspace id (slug/handle/personal/internal) into a canonical UUID.
    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(Some(ws_id)) if is_workspace_uuid_literal(&ws_id) => ws_id,
            Ok(_) => return error_response(500, INVALID_WORKSPACE_ID_MESSAGE),
            Err(()) => return error_response(500, INTERNAL_ERROR_MESSAGE),
        };

    // Authorization: workspace membership AND (manage_forms OR view_form_analytics).
    let is_member =
        match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &user_id).await {
            Ok(value) => value,
            Err(()) => return error_response(500, INTERNAL_ERROR_MESSAGE),
        };
    if !is_member {
        return error_response(403, FORBIDDEN_MESSAGE);
    }

    let can_manage_forms = has_workspace_permission(
        contact_data,
        outbound,
        &resolved_ws_id,
        &user_id,
        MANAGE_FORMS_PERMISSION,
    )
    .await
    .unwrap_or(false);
    let can_view_analytics = has_workspace_permission(
        contact_data,
        outbound,
        &resolved_ws_id,
        &user_id,
        VIEW_FORM_ANALYTICS_PERMISSION,
    )
    .await
    .unwrap_or(false);
    if !can_manage_forms && !can_view_analytics {
        return error_response(403, FORBIDDEN_MESSAGE);
    }

    // Validate the form id shape (canonical UUID) before reading.
    if !is_workspace_uuid_literal(raw_form_id) {
        return error_response(500, INVALID_FORM_ID_MESSAGE);
    }

    // Fetch the form definition from the `private` schema.
    let definition = match fetch_form_definition(contact_data, outbound, raw_form_id).await {
        Ok(Some(definition)) => definition,
        Ok(None) => return error_response(404, FORM_NOT_FOUND_MESSAGE),
        Err(()) => return error_response(500, INTERNAL_ERROR_MESSAGE),
    };

    if definition.ws_id.as_deref() != Some(resolved_ws_id.as_str()) {
        return error_response(404, FORM_NOT_FOUND_MESSAGE);
    }

    let query = query_param(request.url, "q");
    let format = query_param(request.url, "format");
    let resolved_xlsx = matches!(format.as_deref(), Some("excel") | Some("xlsx"));

    // Fetch the response records (paged page 1, 5000 page size) plus their answers.
    let records = match load_response_records(
        contact_data,
        outbound,
        &definition,
        raw_form_id,
        query.as_deref(),
    )
    .await
    {
        Ok(records) => records,
        Err(()) => return error_response(500, INTERNAL_ERROR_MESSAGE),
    };

    // Build the column set (knownColumns then extra answer keys) exactly like the legacy
    // route, including its quirk that knownColumns are keyed by question id while the
    // answers map is keyed by normalized question title.
    let columns = build_columns(&definition, &records);
    let header = build_header(&columns);
    let rows = build_rows(&records, &columns);

    if resolved_xlsx {
        // No xlsx writer is available in this backend; see module-level KNOWN DIVERGENCE.
        return error_response(500, XLSX_UNSUPPORTED_MESSAGE);
    }

    let csv = build_csv(&header, &rows);
    csv_response(raw_form_id, csv)
}

// ---------------------------------------------------------------------------
// Response record loading (RPC page + chunked answer/metadata fetch).
// ---------------------------------------------------------------------------

struct ResponseRecord {
    submitted_at: String,
    responder: String,
    /// answers keyed by normalized question title (mirrors `listFormResponses`).
    answers: HashMap<String, String>,
}

async fn load_response_records(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    definition: &FormDefinition,
    form_id: &str,
    query: Option<&str>,
) -> Result<Vec<ResponseRecord>, ()> {
    // get_form_response_page (page 1, pageSize 5000) -> the visible rows.
    let page_rows = call_rpc(
        contact_data,
        outbound,
        RESPONSE_PAGE_RPC,
        &json!({
            "p_form_id": form_id,
            "p_query": query,
            "p_page_size": EXPORT_PAGE_SIZE,
            "p_page": 1,
        }),
    )
    .await?;

    // get_form_matched_response_ids -> ALL matched ids (used to fetch answers/metadata).
    let matched_rows = call_rpc(
        contact_data,
        outbound,
        MATCHED_RESPONSE_IDS_RPC,
        &json!({
            "p_form_id": form_id,
            "p_query": query,
        }),
    )
    .await?;

    let matched_ids: Vec<String> = matched_rows
        .iter()
        .filter_map(|row| {
            row.get("response_id")
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .collect();

    // Fetch the answer rows for every matched response in chunks of 500.
    //
    // NOTE: the legacy route additionally fetches response metadata (email/user id) via
    // `fetchResponseMetadataByIds`, but only consumes it for the summary/analytics return
    // fields. The export rows take the responder column straight from the page RPC rows
    // (which already carry `respondent_email` / `respondent_user_id`), so the metadata
    // fetch is intentionally omitted here.
    let answer_rows = fetch_response_answers(contact_data, outbound, &matched_ids).await?;

    // answers grouped by response id.
    let mut answers_by_response: HashMap<String, Vec<&Value>> = HashMap::new();
    for row in &answer_rows {
        if let Some(response_id) = row.get("response_id").and_then(Value::as_str) {
            answers_by_response
                .entry(response_id.to_owned())
                .or_default()
                .push(row);
        }
    }

    let resolver = StoredAnswerResolver::new(definition);

    let records = page_rows
        .iter()
        .map(|response| {
            let id = response.get("id").and_then(Value::as_str).unwrap_or("");
            let submitted_at = response
                .get("submitted_at")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned();

            // Responder column metadata comes from the page row directly (legacy maps it
            // onto the record from the same RPC row).
            let respondent_email = response
                .get("respondent_email")
                .and_then(Value::as_str)
                .filter(|value| !value.is_empty());
            let respondent_user_id = response
                .get("respondent_user_id")
                .and_then(Value::as_str)
                .filter(|value| !value.is_empty());
            let responder = respondent_email
                .or(respondent_user_id)
                .map(str::to_owned)
                .unwrap_or_else(|| "Anonymous".to_owned());

            let mut answers: HashMap<String, String> = HashMap::new();
            if let Some(rows) = answers_by_response.get(id) {
                for answer in rows {
                    let question = resolver.resolve(answer);
                    let raw_value = extract_stored_answer_value(answer);
                    let formatted = format_answer_for_question(question, &raw_value);

                    let question_title = question
                        .map(|q| q.title.as_str())
                        .filter(|t| !t.is_empty())
                        .or_else(|| {
                            answer
                                .get("question_title")
                                .and_then(Value::as_str)
                                .filter(|t| !t.is_empty())
                        });
                    let key_source = question_title.unwrap_or("");
                    let normalized = normalize_markdown_to_text(key_source);
                    let key = if normalized.is_empty() {
                        "Untitled question".to_owned()
                    } else {
                        normalized
                    };

                    answers.insert(key, formatted);
                }
            }

            ResponseRecord {
                submitted_at,
                responder,
                answers,
            }
        })
        .collect();

    Ok(records)
}

async fn fetch_response_answers(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    response_ids: &[String],
) -> Result<Vec<Value>, ()> {
    let mut out = Vec::new();
    for chunk in response_ids.chunks(CHUNK_SIZE) {
        if chunk.is_empty() {
            continue;
        }
        let in_filter = format!("in.({})", chunk.join(","));
        let rows = private_get(
            contact_data,
            outbound,
            "form_response_answers",
            &[("select", "*".to_owned()), ("response_id", in_filter)],
        )
        .await?;
        out.extend(rows);
    }
    Ok(out)
}

// ---------------------------------------------------------------------------
// Column / header / row / CSV building (mirrors the legacy route body).
// ---------------------------------------------------------------------------

struct ExportColumn {
    key: String,
    label: String,
}

fn build_columns(definition: &FormDefinition, _records: &[ResponseRecord]) -> Vec<ExportColumn> {
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

fn build_header(columns: &[ExportColumn]) -> Vec<String> {
    let mut header = vec!["Submitted at".to_owned(), "Responder".to_owned()];
    header.extend(columns.iter().map(|column| column.label.clone()));
    header
}

fn build_rows(records: &[ResponseRecord], columns: &[ExportColumn]) -> Vec<Vec<String>> {
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

fn build_csv(header: &[String], rows: &[Vec<String>]) -> String {
    let mut lines: Vec<String> = Vec::with_capacity(rows.len() + 1);
    lines.push(csv_line(header));
    for row in rows {
        lines.push(csv_line(row));
    }
    lines.join("\n")
}

fn csv_line(values: &[String]) -> String {
    values
        .iter()
        .map(|value| format!("\"{}\"", value.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(",")
}

// ---------------------------------------------------------------------------
// Stored answer formatting (mirrors answer-utils.ts).
// ---------------------------------------------------------------------------

#[derive(Clone)]
struct DefinitionQuestion {
    id: String,
    type_: String,
    title: String,
    options: Vec<DefinitionOption>,
}

#[derive(Clone)]
struct DefinitionOption {
    label: String,
    value: String,
}

struct DefinitionSection {
    questions: Vec<DefinitionQuestion>,
}

struct StoredAnswerResolver<'a> {
    by_id: HashMap<&'a str, &'a DefinitionQuestion>,
    by_title_and_type: HashMap<String, Vec<&'a DefinitionQuestion>>,
}

impl<'a> StoredAnswerResolver<'a> {
    fn new(definition: &'a FormDefinition) -> Self {
        let mut by_id: HashMap<&str, &DefinitionQuestion> = HashMap::new();
        let mut by_title_and_type: HashMap<String, Vec<&DefinitionQuestion>> = HashMap::new();

        for section in &definition.sections {
            for question in &section.questions {
                by_id.insert(question.id.as_str(), question);
                let key = format!(
                    "{}::{}",
                    question.type_,
                    normalize_stored_question_title(&question.title)
                );
                by_title_and_type.entry(key).or_default().push(question);
            }
        }

        Self {
            by_id,
            by_title_and_type,
        }
    }

    fn resolve(&self, answer: &Value) -> Option<&'a DefinitionQuestion> {
        if let Some(question_id) = answer
            .get("question_id")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
        {
            if let Some(question) = self.by_id.get(question_id) {
                return Some(*question);
            }
        }

        let title_key = normalize_stored_question_title(
            answer
                .get("question_title")
                .and_then(Value::as_str)
                .unwrap_or(""),
        );
        let question_type = answer.get("question_type").and_then(Value::as_str);
        let Some(question_type) = question_type.filter(|value| !value.is_empty()) else {
            return None;
        };
        if title_key.is_empty() {
            return None;
        }

        let lookup_key = format!("{question_type}::{title_key}");
        match self.by_title_and_type.get(&lookup_key) {
            Some(matches) if matches.len() == 1 => Some(matches[0]),
            _ => None,
        }
    }
}

/// Mirrors `extractStoredAnswerValue`: text wins; else number; else string array.
enum StoredAnswerValue {
    None,
    Text(String),
    Number(f64),
    List(Vec<String>),
}

fn extract_stored_answer_value(answer: &Value) -> StoredAnswerValue {
    if let Some(text) = answer.get("answer_text").and_then(Value::as_str) {
        if !text.trim().is_empty() {
            return StoredAnswerValue::Text(text.to_owned());
        }
    }

    if let Some(json_value) = answer.get("answer_json") {
        if let Some(array) = json_value.as_array() {
            let strings: Vec<String> = array
                .iter()
                .filter_map(|entry| entry.as_str().map(str::to_owned))
                .collect();
            return StoredAnswerValue::List(strings);
        }
        if let Some(number) = json_value.as_f64() {
            if json_value.is_number() {
                return StoredAnswerValue::Number(number);
            }
        }
    }

    StoredAnswerValue::None
}

/// Mirrors `formatAnswerForQuestion(question, value).value`.
fn format_answer_for_question(
    question: Option<&DefinitionQuestion>,
    value: &StoredAnswerValue,
) -> String {
    match value {
        StoredAnswerValue::None => "—".to_owned(),
        StoredAnswerValue::Text(text) => {
            if text.is_empty() {
                return "—".to_owned();
            }
            match find_matching_option(question, text) {
                Some(option) if question.is_some() => {
                    format_matched_option_label(question.expect("checked"), option)
                }
                _ => text.clone(),
            }
        }
        StoredAnswerValue::Number(number) => stringify_number(*number),
        StoredAnswerValue::List(entries) => {
            let mut resolved: Vec<String> = Vec::new();
            let mut unresolved: Vec<String> = Vec::new();

            for entry in entries {
                match find_matching_option(question, entry) {
                    Some(option) if question.is_some() => {
                        resolved.push(format_matched_option_label(
                            question.expect("checked"),
                            option,
                        ));
                    }
                    _ => unresolved.push(entry.clone()),
                }
            }

            let mut all_values = resolved;
            all_values.extend(unresolved);

            if all_values.is_empty() {
                "—".to_owned()
            } else {
                all_values.join(", ")
            }
        }
    }
}

fn find_matching_option<'a>(
    question: Option<&'a DefinitionQuestion>,
    candidate: &str,
) -> Option<&'a DefinitionOption> {
    let question = question?;
    if candidate.trim().is_empty() {
        return None;
    }

    let normalized_candidate = normalize_text(candidate);
    let derived_candidate = derive_option_value(candidate);

    if let Some(option) = question.options.iter().find(|o| o.value == candidate) {
        return Some(option);
    }
    if let Some(option) = question
        .options
        .iter()
        .find(|o| normalize_text(&o.label) == normalized_candidate)
    {
        return Some(option);
    }
    if let Some(option) = question.options.iter().find(|o| {
        derive_option_value(&o.label) == derived_candidate || o.value == derived_candidate
    }) {
        return Some(option);
    }

    if let Some(index) = legacy_option_index(candidate) {
        return question.options.get(index);
    }

    None
}

fn format_matched_option_label(question: &DefinitionQuestion, option: &DefinitionOption) -> String {
    let plain_text_label = normalize_markdown_to_text(&option.label);

    if (question.type_ == "linear_scale" || question.type_ == "rating")
        && plain_text_label.trim() != option.value.trim()
    {
        return format!("{plain_text_label} ({})", option.value);
    }

    plain_text_label
}

/// Mirrors `getLegacyOptionIndex`: parses `option-<n>` / `option_<n>` shaped candidates.
fn legacy_option_index(candidate: &str) -> Option<usize> {
    let trimmed = candidate.trim();
    let rest = trimmed
        .strip_prefix("option-")
        .or_else(|| trimmed.strip_prefix("option_"))?;
    rest.parse::<usize>().ok()
}

/// Mirrors `deriveOptionValue`: lowercases, trims, collapses non-alphanumerics to `-`.
fn derive_option_value(label: &str) -> String {
    let lowered = normalize_markdown_to_text(label).to_lowercase();
    let mut out = String::new();
    let mut last_dash = false;
    for ch in lowered.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            last_dash = false;
        } else if !last_dash {
            out.push('-');
            last_dash = true;
        }
    }
    out.trim_matches('-').to_owned()
}

/// Mirrors `normalizeText`: lowercased + whitespace-collapsed plain text.
fn normalize_text(value: &str) -> String {
    normalize_markdown_to_text(value).to_lowercase()
}

/// Mirrors `normalizeStoredQuestionTitle`: normalized markdown text lowercased.
fn normalize_stored_question_title(value: &str) -> String {
    normalize_markdown_to_text(value).to_lowercase()
}

fn stringify_number(number: f64) -> String {
    if number.fract() == 0.0 && number.is_finite() {
        format!("{}", number as i64)
    } else {
        format!("{number}")
    }
}

// ---------------------------------------------------------------------------
// Markdown stripping (best-effort port of `stripMarkdownToText`).
// ---------------------------------------------------------------------------

/// Best-effort port of `stripMarkdownToText`. The JS original applies a chain of regex
/// replacements; this strips the most common markdown markers, HTML tags, and collapses
/// whitespace. Plain text passes through unchanged (the common case for titles/labels).
fn normalize_markdown_to_text(value: &str) -> String {
    let mut text = value.to_owned();

    // Drop HTML tags.
    text = strip_html_tags(&text);
    // Replace &nbsp; entities.
    text = text.replace("&nbsp;", " ").replace("&NBSP;", " ");
    // Strip common inline emphasis / heading / quote / list markers and code ticks.
    text = strip_inline_markers(&text);
    // Collapse whitespace runs to single spaces and trim.
    collapse_whitespace(&text)
}

fn strip_html_tags(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut in_tag = false;
    for ch in value.chars() {
        match ch {
            '<' => {
                in_tag = true;
                out.push(' ');
            }
            '>' if in_tag => in_tag = false,
            _ if in_tag => {}
            _ => out.push(ch),
        }
    }
    out
}

fn strip_inline_markers(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for line in value.split('\n') {
        let mut line_str = line.to_owned();
        // Heading markers at line start: `#{1,6}␠`.
        line_str = strip_line_prefix_hashes(&line_str);
        // Blockquote `>` at line start.
        let trimmed = line_str.trim_start();
        if let Some(rest) = trimmed.strip_prefix('>') {
            line_str = rest.trim_start().to_owned();
        }
        // List markers `- `, `* `, `+ `, `1. ` at line start.
        line_str = strip_list_marker(&line_str);
        // Emphasis markers `*`, `_`, `~`.
        line_str = line_str.replace(['*', '_', '~'], "");
        // Inline code backticks.
        line_str = line_str.replace('`', "");
        out.push_str(&line_str);
        out.push('\n');
    }
    out
}

fn strip_line_prefix_hashes(line: &str) -> String {
    let trimmed_start = line.trim_start();
    let hashes = trimmed_start.chars().take_while(|c| *c == '#').count();
    if (1..=6).contains(&hashes) {
        let rest = &trimmed_start[hashes..];
        if rest.starts_with(' ') || rest.starts_with('\t') {
            return rest.trim_start().to_owned();
        }
    }
    line.to_owned()
}

fn strip_list_marker(line: &str) -> String {
    let trimmed = line.trim_start();
    // Unordered list markers.
    for marker in ['-', '*', '+'] {
        if let Some(rest) = trimmed.strip_prefix(marker) {
            if rest.starts_with(' ') {
                return rest.trim_start().to_owned();
            }
        }
    }
    // Ordered list marker `\d+. `.
    let digits = trimmed.chars().take_while(|c| c.is_ascii_digit()).count();
    if digits > 0 {
        let rest = &trimmed[digits..];
        if let Some(after_dot) = rest.strip_prefix(". ") {
            return after_dot.trim_start().to_owned();
        }
        if let Some(after_dot) = rest.strip_prefix(".\t") {
            return after_dot.trim_start().to_owned();
        }
    }
    line.to_owned()
}

fn collapse_whitespace(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut in_ws = false;
    for ch in value.chars() {
        if ch.is_whitespace() {
            if !in_ws {
                out.push(' ');
                in_ws = true;
            }
        } else {
            out.push(ch);
            in_ws = false;
        }
    }
    out.trim().to_owned()
}

// ---------------------------------------------------------------------------
// Form definition fetch (private schema) -- mirrors workspaces_forms_export.rs.
// ---------------------------------------------------------------------------

struct FormDefinition {
    ws_id: Option<String>,
    sections: Vec<DefinitionSection>,
}

async fn fetch_form_definition(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    form_id: &str,
) -> Result<Option<FormDefinition>, ()> {
    let form_rows = private_get(
        contact_data,
        outbound,
        "forms",
        &[
            ("select", "ws_id".to_owned()),
            ("id", format!("eq.{form_id}")),
            ("limit", "1".to_owned()),
        ],
    )
    .await?;
    let Some(form) = form_rows.into_iter().next() else {
        return Ok(None);
    };
    let ws_id = form.get("ws_id").and_then(Value::as_str).map(str::to_owned);

    let sections_raw = private_get(
        contact_data,
        outbound,
        "form_sections",
        &[
            ("select", "id, position".to_owned()),
            ("form_id", format!("eq.{form_id}")),
        ],
    )
    .await?;
    let questions_raw = private_get(
        contact_data,
        outbound,
        "form_questions",
        &[
            ("select", "id, section_id, type, title, position".to_owned()),
            ("form_id", format!("eq.{form_id}")),
        ],
    )
    .await?;

    let question_ids: Vec<String> = questions_raw
        .iter()
        .filter_map(|q| q.get("id").and_then(Value::as_str).map(str::to_owned))
        .collect();
    let options_raw = if question_ids.is_empty() {
        Vec::new()
    } else {
        let in_filter = format!("in.({})", question_ids.join(","));
        private_get(
            contact_data,
            outbound,
            "form_question_options",
            &[
                ("select", "question_id, label, value, position".to_owned()),
                ("question_id", in_filter),
            ],
        )
        .await?
    };

    // options keyed by question id, sorted by position.
    let mut options_by_question: HashMap<String, Vec<(i64, DefinitionOption)>> = HashMap::new();
    for option in &options_raw {
        let Some(question_id) = option.get("question_id").and_then(Value::as_str) else {
            continue;
        };
        let position = option.get("position").and_then(Value::as_i64).unwrap_or(0);
        options_by_question
            .entry(question_id.to_owned())
            .or_default()
            .push((
                position,
                DefinitionOption {
                    label: option
                        .get("label")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_owned(),
                    value: option
                        .get("value")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_owned(),
                },
            ));
    }

    // questions keyed by section id, sorted by position.
    let mut questions_by_section: HashMap<String, Vec<(i64, DefinitionQuestion)>> = HashMap::new();
    for question in &questions_raw {
        let Some(section_id) = question.get("section_id").and_then(Value::as_str) else {
            continue;
        };
        let id = question
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned();
        let position = question
            .get("position")
            .and_then(Value::as_i64)
            .unwrap_or(0);
        let mut options = options_by_question.remove(&id).unwrap_or_default();
        options.sort_by_key(|(position, _)| *position);
        let options: Vec<DefinitionOption> =
            options.into_iter().map(|(_, option)| option).collect();

        questions_by_section
            .entry(section_id.to_owned())
            .or_default()
            .push((
                position,
                DefinitionQuestion {
                    id,
                    type_: question
                        .get("type")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_owned(),
                    title: question
                        .get("title")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_owned(),
                    options,
                },
            ));
    }

    // sections sorted by position.
    let mut sections: Vec<(i64, DefinitionSection)> = sections_raw
        .iter()
        .map(|section| {
            let id = section.get("id").and_then(Value::as_str).unwrap_or("");
            let position = section.get("position").and_then(Value::as_i64).unwrap_or(0);
            let mut questions = questions_by_section.remove(id).unwrap_or_default();
            questions.sort_by_key(|(position, _)| *position);
            let questions: Vec<DefinitionQuestion> = questions
                .into_iter()
                .map(|(_, question)| question)
                .collect();
            (position, DefinitionSection { questions })
        })
        .collect();
    sections.sort_by_key(|(position, _)| *position);
    let sections: Vec<DefinitionSection> =
        sections.into_iter().map(|(_, section)| section).collect();

    Ok(Some(FormDefinition { ws_id, sections }))
}

// ---------------------------------------------------------------------------
// Workspace id normalization / membership (mirrors workspaces_forms_export.rs).
// ---------------------------------------------------------------------------

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let trimmed = raw_ws_id.trim();

    if trimmed.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
    }

    if trimmed.eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG) {
        return personal_workspace_id(contact_data, outbound, user_id, access_token)
            .await
            .map(Some);
    }

    if is_workspace_uuid_literal(trimmed) {
        return Ok(Some(trimmed.to_owned()));
    }

    let handle = trimmed.to_lowercase();
    if !is_workspace_handle(&handle) {
        return Ok(Some(trimmed.to_owned()));
    }

    if let Some(workspace_id) =
        workspace_id_by_handle(contact_data, outbound, &handle, Some(access_token)).await?
    {
        return Ok(Some(workspace_id));
    }
    if let Some(workspace_id) =
        workspace_id_by_handle(contact_data, outbound, &handle, None).await?
    {
        return Ok(Some(workspace_id));
    }

    Ok(Some(trimmed.to_owned()))
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id,workspace_members!inner(user_id,type)".to_owned(),
            ),
            ("personal", "eq.true".to_owned()),
            ("workspace_members.user_id", format!("eq.{user_id}")),
            ("workspace_members.type", "eq.MEMBER".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_get(contact_data, outbound, &url, Some(access_token), None).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    first_id(&response).ok_or(())
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    access_token: Option<&str>,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id".to_owned()),
            ("handle", format!("eq.{handle}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_get(contact_data, outbound, &url, access_token, None).await?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(first_id(&response))
}

async fn verify_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_get(contact_data, outbound, &url, None, None).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    Ok(rows
        .first()
        .and_then(|row| row.get("type"))
        .and_then(Value::as_str)
        == Some("MEMBER"))
}

async fn has_workspace_permission(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    permission: &str,
) -> Result<bool, ()> {
    let Some(rpc_url) = contact_data.rpc_url(HAS_WORKSPACE_PERMISSION_RPC) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let Ok(body) = serde_json::to_string(&json!({
        "p_user_id": user_id,
        "p_ws_id": ws_id,
        "p_permission": permission,
    })) else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response.json::<bool>().unwrap_or(false))
}

/// Calls a `private`-schema PostgREST RPC and returns the JSON array result.
async fn call_rpc(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    function: &str,
    payload: &Value,
) -> Result<Vec<Value>, ()> {
    let Some(rpc_url) = contact_data.rpc_url(function) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let Ok(body) = serde_json::to_string(payload) else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

async fn private_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    params: &[(&str, String)],
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(table, params) else {
        return Err(());
    };
    let response = send_rest_get(contact_data, outbound, &url, None, Some(PRIVATE_SCHEMA)).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

async fn send_rest_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: Option<&str>,
    schema: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = match access_token {
        Some(token) => format!("Bearer {token}"),
        None => format!("Bearer {service_role_key}"),
    };

    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);
    if let Some(schema) = schema {
        request = request.with_header("Accept-Profile", schema);
    }

    outbound.send(request).await.map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Response builders + small helpers.
// ---------------------------------------------------------------------------

fn csv_response(form_id: &str, csv: String) -> BackendResponse {
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

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

fn first_id(response: &OutboundResponse) -> Option<String> {
    response
        .json::<Vec<Value>>()
        .ok()?
        .into_iter()
        .next()
        .and_then(|row| row.get("id").and_then(Value::as_str).map(str::to_owned))
}

/// Extracts a single query-param value from the request URL (first occurrence).
fn query_param(url: Option<&str>, name: &str) -> Option<String> {
    let url = url?;
    let query = url.split_once('?').map(|(_, query)| query)?;
    for pair in query.split('&') {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        if key == name {
            return Some(percent_decode(value));
        }
    }
    None
}

/// Minimal application/x-www-form-urlencoded value decoder (`+` -> space, `%XX`).
fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'+' => {
                out.push(b' ');
                index += 1;
            }
            b'%' if index + 2 < bytes.len() => {
                let high = (bytes[index + 1] as char).to_digit(16);
                let low = (bytes[index + 2] as char).to_digit(16);
                match (high, low) {
                    (Some(high), Some(low)) => {
                        out.push((high * 16 + low) as u8);
                        index += 3;
                    }
                    _ => {
                        out.push(bytes[index]);
                        index += 1;
                    }
                }
            }
            byte => {
                out.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

// ---------------------------------------------------------------------------
// Path matching + UUID/handle validation.
// ---------------------------------------------------------------------------

/// Matches `/api/v1/workspaces/{wsId}/forms/{formId}/responses/export` and returns
/// `(raw_ws_id, raw_form_id)`. Returns None when the path shape does not match.
fn workspace_responses_export_segments(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(WORKSPACE_RESPONSES_EXPORT_PATH_PREFIX)?;
    let rest = rest.strip_suffix(WORKSPACE_RESPONSES_EXPORT_PATH_SUFFIX)?;
    let (ws_id, form_id) = rest.split_once(WORKSPACE_RESPONSES_EXPORT_INFIX)?;

    if ws_id.is_empty() || ws_id.contains('/') || form_id.is_empty() || form_id.contains('/') {
        return None;
    }

    Some((ws_id, form_id))
}

fn is_workspace_uuid_literal(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.len() == 36
        && trimmed.chars().enumerate().all(|(index, c)| match index {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        })
}

fn is_workspace_handle(value: &str) -> bool {
    let length = value.len();
    if length == 0 || length > 64 {
        return false;
    }

    value.chars().enumerate().all(|(index, character)| {
        let is_edge = index == 0 || index + 1 == length;
        character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || (!is_edge && matches!(character, '_' | '-'))
    })
}
