//! Handler for `GET /api/v1/workspaces/:wsId/forms/:formId/responses`.
//!
//! Ports the GET method of
//! `apps/web/src/app/api/v1/workspaces/[wsId]/forms/[formId]/responses/route.ts`.
//!
//! The legacy route file ALSO defines a `DELETE` method that is NOT migrated here.
//! Per the migration contract this handler returns `None` for every non-GET method so
//! the Cloudflare worker falls through to the still-active Next.js route for `DELETE`.
//! (Concretely: `Some(match request.method { "GET" => ..., _ => return None })`.)
//!
//! Behavior mirrored from the legacy GET handler:
//! - 401 `{ "error": "Unauthorized" }` when there is no authenticated Supabase user.
//! - 403 `{ "error": "Forbidden" }` when the caller is not a workspace MEMBER, or
//!   lacks BOTH `manage_forms` AND `view_form_analytics` permissions.
//! - 404 `{ "error": "Form not found" }` when the form does not exist or belongs to a
//!   different workspace than the resolved `wsId`.
//! - 500 `{ "error": "<message>" }` for internal/validation failures (mirrors the legacy
//!   catch-all which surfaces `Invalid form ID` / `Invalid workspace ID` style messages).
//! - 200 returns `{ total, records, summary, questionAnalytics }` exactly like
//!   `listFormResponses(...)`.
//!
//! Query params (legacy `request.nextUrl.searchParams`):
//! - `page`   -> `Number(... ?? '1')`   (NaN propagates to the RPC, matching JS).
//! - `pageSize` -> `Number(... ?? '10')`.
//! - `q`      -> string or `undefined` (=> SQL `null`).
//!
//! Data flow (mirrors `features/forms/server.ts#listFormResponses`):
//! 1. `fetchFormDefinition` reads forms/sections/questions/options/logic/share-link from
//!    the `private` schema (service-role).
//! 2. Two `private`-schema RPCs run: `get_form_response_page` (the paged rows) and
//!    `get_form_matched_response_ids` (all matched ids for total + summary + analytics).
//! 3. `form_responses` metadata + `form_response_answers` are fetched for matched ids.
//! 4. Records, summary, and per-question analytics are assembled in Rust, reproducing
//!    `answer-utils.ts` / `response-analytics.ts` / `content.ts` semantics.
//!
//! NOTE ON HELPERS: this module is fully self-contained. The workspace-id normalization /
//! membership / permission helpers are intentionally COPIED from `workspaces_forms_export.rs`
//! (which itself mirrors `workspace_habits_access.rs`) rather than shared, per the
//! one-file-only constraint of this migration. The markdown/answer/analytics helpers are
//! faithful Rust ports of the corresponding TypeScript modules.
//!
//! KNOWN DIVERGENCE (flagged in the structured result): the legacy `fetchFormDefinition`
//! resolves Supabase Storage signed URLs for media. Media does not affect the
//! `/responses` payload (only titles/options/values are used for matching/formatting),
//! so media signing is intentionally omitted here with no observable effect on the JSON.

use std::collections::BTreeMap;

use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
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

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";
const MANAGE_FORMS_PERMISSION: &str = "manage_forms";
const VIEW_FORM_ANALYTICS_PERMISSION: &str = "view_form_analytics";

const RESPONSES_PATH_PREFIX: &str = "/api/v1/workspaces/";
const RESPONSES_PATH_SUFFIX: &str = "/responses";
const FORMS_INFIX: &str = "/forms/";

const DEFAULT_PAGE: f64 = 1.0;
const DEFAULT_PAGE_SIZE: f64 = 10.0;

pub(crate) async fn handle_workspaces_forms_formid_responses_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, raw_form_id) = responses_segments(request.path)?;

    Some(match request.method {
        "GET" => responses_response(config, request, raw_ws_id, raw_form_id, outbound).await,
        // DELETE (and any other method) is NOT migrated: fall through to the live
        // Next.js route by returning None.
        _ => return None,
    })
}

async fn responses_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    raw_form_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

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

    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(Some(ws_id)) if is_uuid_literal(&ws_id) => ws_id,
            Ok(_) => return error_response(500, INVALID_WORKSPACE_ID_MESSAGE),
            Err(()) => return error_response(500, INTERNAL_ERROR_MESSAGE),
        };

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

    // `parseFormIdParam` validates the canonical UUID shape.
    if !is_uuid_literal(raw_form_id) {
        return error_response(500, INVALID_FORM_ID_MESSAGE);
    }

    let definition = match fetch_form_definition(contact_data, outbound, raw_form_id).await {
        Ok(Some(definition)) => definition,
        Ok(None) => return error_response(404, FORM_NOT_FOUND_MESSAGE),
        Err(()) => return error_response(500, INTERNAL_ERROR_MESSAGE),
    };

    if definition.ws_id.as_deref() != Some(resolved_ws_id.as_str()) {
        return error_response(404, FORM_NOT_FOUND_MESSAGE);
    }

    // Query params.
    let page = number_param(request.url, "page", DEFAULT_PAGE);
    let page_size = number_param(request.url, "pageSize", DEFAULT_PAGE_SIZE);
    let query = string_param(request.url, "q");

    match list_form_responses(
        contact_data,
        outbound,
        &definition,
        query.as_deref(),
        page,
        page_size,
    )
    .await
    {
        Ok(payload) => no_store_response(json_response(200, payload)),
        Err(()) => error_response(500, INTERNAL_ERROR_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// listFormResponses port.
// ---------------------------------------------------------------------------

async fn list_form_responses(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    definition: &FormDefinition,
    query: Option<&str>,
    page: f64,
    page_size: f64,
) -> Result<Value, ()> {
    let response_page = rpc_get_form_response_page(
        contact_data,
        outbound,
        &definition.id,
        query,
        page_size,
        page,
    )
    .await?;
    let matched =
        rpc_get_form_matched_response_ids(contact_data, outbound, &definition.id, query).await?;

    let matched_response_ids: Vec<String> = matched
        .into_iter()
        .filter_map(|item| {
            item.get("response_id")
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .collect();

    let matched_responses =
        fetch_response_metadata_by_ids(contact_data, outbound, &matched_response_ids).await?;
    let answer_rows =
        fetch_response_answers_by_ids(contact_data, outbound, &matched_response_ids).await?;

    // Group answers by response_id.
    let mut answer_map: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    for answer in &answer_rows {
        if let Some(response_id) = answer.get("response_id").and_then(Value::as_str) {
            answer_map
                .entry(response_id.to_owned())
                .or_default()
                .push(answer.clone());
        }
    }

    let resolver = StoredAnswerQuestionResolver::new(definition);

    let records: Vec<Value> = response_page
        .iter()
        .map(|response| {
            let id = response
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let empty = Vec::new();
            let answers = answer_map.get(id).unwrap_or(&empty);

            // Object.fromEntries(...) — later keys overwrite earlier ones.
            let mut answers_obj = Map::new();
            for answer in answers {
                let question = resolver.resolve(answer);
                let raw_value = extract_stored_answer_value(answer);
                let formatted = format_answer_for_question(question, raw_value.as_ref());

                let question_title = question
                    .and_then(|q| q.title.as_deref())
                    .filter(|t| !t.is_empty())
                    .map(normalize_markdown_to_text)
                    .filter(|t| !t.is_empty())
                    .or_else(|| {
                        answer
                            .get("question_title")
                            .and_then(Value::as_str)
                            .map(normalize_markdown_to_text)
                    })
                    .filter(|t| !t.is_empty())
                    .unwrap_or_else(|| "Untitled question".to_owned());

                answers_obj.insert(question_title, Value::String(formatted.value));
            }

            json!({
                "id": response.get("id").cloned().unwrap_or(Value::Null),
                "sessionId": response.get("session_id").cloned().unwrap_or(Value::Null),
                "createdAt": response.get("created_at").cloned().unwrap_or(Value::Null),
                "submittedAt": response.get("submitted_at").cloned().unwrap_or(Value::Null),
                "respondentEmail": response.get("respondent_email").cloned().unwrap_or(Value::Null),
                "respondentUserId": response.get("respondent_user_id").cloned().unwrap_or(Value::Null),
                "answers": Value::Object(answers_obj),
            })
        })
        .collect();

    let total = matched_response_ids.len();
    let summary = build_response_summary(&matched_responses);
    let question_analytics = build_question_analytics(definition, &answer_rows);

    Ok(json!({
        "total": total,
        "records": records,
        "summary": summary,
        "questionAnalytics": question_analytics,
    }))
}

async fn fetch_response_metadata_by_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    response_ids: &[String],
) -> Result<Vec<Value>, ()> {
    let mut out = Vec::new();
    for chunk in response_ids.chunks(500) {
        if chunk.is_empty() {
            continue;
        }
        let in_filter = format!("in.({})", chunk.join(","));
        let rows = private_get(
            contact_data,
            outbound,
            "form_responses",
            &[
                (
                    "select",
                    "id, respondent_email, respondent_user_id".to_owned(),
                ),
                ("id", in_filter),
            ],
        )
        .await?;
        out.extend(rows);
    }
    Ok(out)
}

async fn fetch_response_answers_by_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    response_ids: &[String],
) -> Result<Vec<Value>, ()> {
    let mut out = Vec::new();
    for chunk in response_ids.chunks(500) {
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
// Private-schema RPCs.
// ---------------------------------------------------------------------------

async fn rpc_get_form_response_page(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    form_id: &str,
    query: Option<&str>,
    page_size: f64,
    page: f64,
) -> Result<Vec<Value>, ()> {
    let body = json!({
        "p_form_id": form_id,
        "p_query": query_value(query),
        "p_page_size": number_to_json(page_size),
        "p_page": number_to_json(page),
    });
    private_rpc(contact_data, outbound, "get_form_response_page", &body).await
}

async fn rpc_get_form_matched_response_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    form_id: &str,
    query: Option<&str>,
) -> Result<Vec<Value>, ()> {
    let body = json!({
        "p_form_id": form_id,
        "p_query": query_value(query),
    });
    private_rpc(
        contact_data,
        outbound,
        "get_form_matched_response_ids",
        &body,
    )
    .await
}

/// `options.query ?? null` semantics for the RPC arg.
fn query_value(query: Option<&str>) -> Value {
    match query {
        Some(value) => Value::String(value.to_owned()),
        None => Value::Null,
    }
}

/// Mirrors JS `Number(...)`: integral values serialize as integers, NaN as null
/// (PostgREST coerces a JSON null integer arg; the legacy code passes the raw
/// `Number(...)` which is NaN -> serialized by supabase-js as null).
fn number_to_json(value: f64) -> Value {
    if value.is_nan() {
        return Value::Null;
    }
    if value.fract() == 0.0 && value.is_finite() {
        return json!(value as i64);
    }
    serde_json::Number::from_f64(value)
        .map(Value::Number)
        .unwrap_or(Value::Null)
}

async fn private_rpc(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    function: &str,
    body: &Value,
) -> Result<Vec<Value>, ()> {
    let Some(rpc_url) = contact_data.rpc_url(function) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let Ok(body_text) = serde_json::to_string(body) else {
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
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_body(&body_text),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // RPC returning SETOF rows yields a JSON array.
    response.json::<Vec<Value>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// extractStoredAnswerValue port.
// ---------------------------------------------------------------------------

/// Mirrors `FormAnswerValue | null`: a string, a list of strings, or a number.
enum AnswerValue {
    Text(String),
    List(Vec<String>),
    Number(f64),
}

fn extract_stored_answer_value(answer: &Value) -> Option<AnswerValue> {
    if let Some(text) = answer.get("answer_text").and_then(Value::as_str) {
        if !text.trim().is_empty() {
            return Some(AnswerValue::Text(text.to_owned()));
        }
    }

    let answer_json = answer.get("answer_json");
    if let Some(array) = answer_json.and_then(Value::as_array) {
        let strings: Vec<String> = array
            .iter()
            .filter_map(|entry| entry.as_str().map(str::to_owned))
            .collect();
        return Some(AnswerValue::List(strings));
    }

    if let Some(number) = answer_json.and_then(Value::as_f64) {
        // serde treats integers/floats both as numbers; JS `typeof === 'number'`.
        if answer_json.map(Value::is_number).unwrap_or(false) {
            return Some(AnswerValue::Number(number));
        }
    }

    None
}

fn has_answer_value(value: Option<&AnswerValue>) -> bool {
    match value {
        Some(AnswerValue::List(values)) => !values.is_empty(),
        Some(AnswerValue::Text(text)) => !text.trim().is_empty(),
        Some(AnswerValue::Number(_)) => true,
        None => false,
    }
}

// ---------------------------------------------------------------------------
// answer-utils.ts port (option matching + formatting + restoring).
// ---------------------------------------------------------------------------

#[derive(Clone)]
struct DefOption {
    label: String,
    value: String,
}

#[derive(Clone)]
struct DefQuestion {
    id: String,
    title: Option<String>,
    question_type: String,
    options: Vec<DefOption>,
}

fn derive_option_value(label: &str) -> String {
    let lower = normalize_markdown_to_text(label).to_lowercase();
    // replace([^a-z0-9]+, '-')
    let mut replaced = String::new();
    let mut prev_dash = false;
    for c in lower.chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            replaced.push(c);
            prev_dash = false;
        } else if !prev_dash {
            replaced.push('-');
            prev_dash = true;
        }
    }
    // replace(/^-+|-+$/g, '')
    let trimmed = replaced.trim_matches('-');
    if trimmed.is_empty() {
        "option".to_owned()
    } else {
        trimmed.to_owned()
    }
}

fn legacy_option_index(candidate: &str) -> Option<usize> {
    let trimmed = candidate.trim();
    let rest = trimmed
        .strip_prefix("option-")
        .or_else(|| trimmed.strip_prefix("OPTION-"))
        .or_else(|| {
            // case-insensitive prefix "option-"
            if trimmed.len() >= 7 && trimmed[..7].eq_ignore_ascii_case("option-") {
                Some(&trimmed[7..])
            } else {
                None
            }
        })?;
    if rest.is_empty() || !rest.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let n: i64 = rest.parse().ok()?;
    let index = n - 1;
    if index < 0 {
        None
    } else {
        Some(index as usize)
    }
}

fn find_matching_option<'a>(
    question: Option<&'a DefQuestion>,
    candidate: &str,
) -> Option<&'a DefOption> {
    let question = question?;
    if candidate.trim().is_empty() {
        return None;
    }

    let normalized_candidate = normalize_markdown_for_comparison(candidate);
    let derived_candidate = derive_option_value(candidate);

    if let Some(exact) = question.options.iter().find(|o| o.value == candidate) {
        return Some(exact);
    }

    if let Some(label_match) = question
        .options
        .iter()
        .find(|o| normalize_markdown_for_comparison(&o.label) == normalized_candidate)
    {
        return Some(label_match);
    }

    if let Some(derived_match) = question.options.iter().find(|o| {
        derive_option_value(&o.label) == derived_candidate || o.value == derived_candidate
    }) {
        return Some(derived_match);
    }

    legacy_option_index(candidate).and_then(|index| question.options.get(index))
}

fn is_scale_type(question_type: &str) -> bool {
    matches!(question_type, "linear_scale" | "rating")
}

fn format_matched_option_label(question: &DefQuestion, option: &DefOption) -> String {
    let plain = normalize_markdown_to_text(&option.label);
    if is_scale_type(&question.question_type) && plain.trim() != option.value.trim() {
        format!("{plain} ({})", option.value)
    } else {
        plain
    }
}

struct FormattedAnswer {
    value: String,
    unresolved_values: Vec<String>,
}

fn format_answer_for_question(
    question: Option<&DefQuestion>,
    answer: Option<&AnswerValue>,
) -> FormattedAnswer {
    // answer == null || answer === ''
    let empty = FormattedAnswer {
        value: "\u{2014}".to_owned(),
        unresolved_values: Vec::new(),
    };
    let Some(answer) = answer else {
        return empty;
    };
    match answer {
        AnswerValue::Text(text) => {
            if text.is_empty() {
                return empty;
            }
            if let Some(matched) = find_matching_option(question, text) {
                if let Some(q) = question {
                    return FormattedAnswer {
                        value: format_matched_option_label(q, matched),
                        unresolved_values: Vec::new(),
                    };
                }
            }
            let unresolved = match question {
                Some(q) if is_choice_or_scale_type(&q.question_type) => vec![text.clone()],
                _ => Vec::new(),
            };
            FormattedAnswer {
                value: text.clone(),
                unresolved_values: unresolved,
            }
        }
        AnswerValue::Number(number) => FormattedAnswer {
            value: stringify_number(*number),
            unresolved_values: Vec::new(),
        },
        AnswerValue::List(entries) => {
            let mut resolved_values: Vec<String> = Vec::new();
            let mut unresolved_values: Vec<String> = Vec::new();
            for entry in entries {
                match find_matching_option(question, entry) {
                    Some(matched) if question.is_some() => {
                        resolved_values.push(format_matched_option_label(
                            question.expect("question present"),
                            matched,
                        ));
                    }
                    _ => unresolved_values.push(entry.clone()),
                }
            }
            let mut all_values = resolved_values;
            all_values.extend(unresolved_values.iter().cloned());
            let value = if all_values.is_empty() {
                "\u{2014}".to_owned()
            } else {
                all_values.join(", ")
            };
            FormattedAnswer {
                value,
                unresolved_values,
            }
        }
    }
}

fn is_choice_or_scale_type(question_type: &str) -> bool {
    matches!(
        question_type,
        "single_choice" | "multiple_choice" | "dropdown" | "linear_scale" | "rating"
    )
}

/// JS `String(number)` for the numeric forms produced here (integers + simple decimals).
fn stringify_number(number: f64) -> String {
    if number.fract() == 0.0 && number.is_finite() {
        format!("{}", number as i64)
    } else {
        let mut s = format!("{number}");
        if s.contains('e') || s.contains('E') {
            s = number.to_string();
        }
        s
    }
}

/// Output of `restoreAnswerForQuestion`.
enum RestoredValue {
    Undefined,
    Text(String),
    List(Vec<String>),
}

struct Restored {
    value: RestoredValue,
    unresolved_values: Vec<String>,
}

fn restore_answer_for_question(question: Option<&DefQuestion>, answer: &AnswerValue) -> Restored {
    let none = Restored {
        value: RestoredValue::Undefined,
        unresolved_values: Vec::new(),
    };
    let Some(question) = question else {
        return none;
    };
    // answer == null || answer === '' — an empty Text counts as ''.
    if let AnswerValue::Text(text) = answer {
        if text.is_empty() {
            return none;
        }
    }

    if question.question_type == "multiple_choice" {
        let raw_values: Vec<String> = match answer {
            AnswerValue::List(values) => values.clone(),
            AnswerValue::Text(text) => vec![text.clone()],
            AnswerValue::Number(_) => Vec::new(),
        };
        let mut resolved_values: Vec<String> = Vec::new();
        let mut unresolved_values: Vec<String> = Vec::new();
        for entry in &raw_values {
            match find_matching_option(Some(question), entry) {
                Some(matched) => resolved_values.push(matched.value.clone()),
                None => unresolved_values.push(entry.clone()),
            }
        }
        return Restored {
            value: if resolved_values.is_empty() {
                RestoredValue::Undefined
            } else {
                RestoredValue::List(resolved_values)
            },
            unresolved_values,
        };
    }

    if matches!(
        question.question_type.as_str(),
        "single_choice" | "dropdown" | "linear_scale" | "rating"
    ) {
        let raw_value = match answer {
            AnswerValue::Number(number) => stringify_number(*number),
            AnswerValue::Text(text) => text.clone(),
            AnswerValue::List(_) => String::new(),
        };
        match find_matching_option(Some(question), &raw_value) {
            Some(matched) => Restored {
                value: RestoredValue::Text(matched.value.clone()),
                unresolved_values: Vec::new(),
            },
            None => Restored {
                value: if is_scale_type(&question.question_type) {
                    RestoredValue::Text(raw_value.clone())
                } else {
                    RestoredValue::Undefined
                },
                unresolved_values: if raw_value.is_empty() {
                    Vec::new()
                } else {
                    vec![raw_value]
                },
            },
        }
    } else {
        // `return { value: answer, ... }`. For text questions the scalar string is kept.
        let value = match answer {
            AnswerValue::Text(text) => RestoredValue::Text(text.clone()),
            AnswerValue::Number(number) => RestoredValue::Text(stringify_number(*number)),
            AnswerValue::List(values) => RestoredValue::List(values.clone()),
        };
        Restored {
            value,
            unresolved_values: Vec::new(),
        }
    }
}

// ---------------------------------------------------------------------------
// createStoredAnswerQuestionResolver port.
// ---------------------------------------------------------------------------

struct StoredAnswerQuestionResolver<'a> {
    by_id: BTreeMap<String, &'a DefQuestion>,
    by_title_and_type: BTreeMap<String, Vec<&'a DefQuestion>>,
}

impl<'a> StoredAnswerQuestionResolver<'a> {
    fn new(definition: &'a FormDefinition) -> Self {
        let mut by_id = BTreeMap::new();
        let mut by_title_and_type: BTreeMap<String, Vec<&'a DefQuestion>> = BTreeMap::new();
        for question in &definition.questions_flat {
            by_id.insert(question.id.clone(), question);
            let key = format!(
                "{}::{}",
                question.question_type,
                normalize_stored_question_title(question.title.as_deref())
            );
            by_title_and_type.entry(key).or_default().push(question);
        }
        Self {
            by_id,
            by_title_and_type,
        }
    }

    fn resolve(&self, answer: &Value) -> Option<&'a DefQuestion> {
        if let Some(question_id) = answer.get("question_id").and_then(Value::as_str) {
            if !question_id.is_empty() {
                if let Some(matched) = self.by_id.get(question_id) {
                    return Some(*matched);
                }
            }
        }

        let title_key =
            normalize_stored_question_title(answer.get("question_title").and_then(Value::as_str));
        let question_type = answer.get("question_type").and_then(Value::as_str);
        if title_key.is_empty() || question_type.is_none() {
            return None;
        }
        let question_type = question_type.expect("checked");
        if question_type.is_empty() {
            return None;
        }

        let key = format!("{question_type}::{title_key}");
        match self.by_title_and_type.get(&key) {
            Some(matches) if matches.len() == 1 => Some(matches[0]),
            _ => None,
        }
    }
}

fn normalize_stored_question_title(title: Option<&str>) -> String {
    normalize_markdown_for_comparison(title.unwrap_or(""))
}

// ---------------------------------------------------------------------------
// buildResponseSummary port.
// ---------------------------------------------------------------------------

fn build_response_summary(responses: &[Value]) -> Value {
    use std::collections::BTreeSet;
    let mut responder_keys: BTreeSet<String> = BTreeSet::new();
    let mut authenticated_responders: BTreeSet<String> = BTreeSet::new();
    let mut duplicate_counts: BTreeMap<String, i64> = BTreeMap::new();
    let mut anonymous_submissions: i64 = 0;

    for response in responses {
        let respondent_user_id = response
            .get("respondent_user_id")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty());
        if let Some(user_id) = respondent_user_id {
            responder_keys.insert(format!("user:{user_id}"));
            authenticated_responders.insert(user_id.to_owned());
            *duplicate_counts.entry(user_id.to_owned()).or_insert(0) += 1;
            continue;
        }

        let respondent_email = response.get("respondent_email").and_then(Value::as_str);
        if let Some(email) = respondent_email {
            if !email.trim().is_empty() {
                responder_keys.insert(format!("email:{}", email.trim().to_lowercase()));
                continue;
            }
        }

        anonymous_submissions += 1;
        let id = response
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        responder_keys.insert(format!("anon:{id}"));
    }

    let duplicate_entries: Vec<i64> = duplicate_counts
        .values()
        .copied()
        .filter(|count| *count > 1)
        .collect();

    json!({
        "totalSubmissions": responses.len(),
        "totalResponders": responder_keys.len(),
        "authenticatedResponders": authenticated_responders.len(),
        "anonymousSubmissions": anonymous_submissions,
        "duplicateAuthenticatedResponders": duplicate_entries.len(),
        "duplicateAuthenticatedSubmissions": duplicate_entries.iter().sum::<i64>(),
        "hasMultipleSubmissionsByUser": !duplicate_entries.is_empty(),
    })
}

// ---------------------------------------------------------------------------
// buildQuestionAnalytics port.
// ---------------------------------------------------------------------------

fn to_percentage(count: i64, total: i64) -> i64 {
    if total == 0 {
        0
    } else {
        // Math.round((count * 100) / total)
        ((count as f64 * 100.0) / total as f64).round() as i64
    }
}

struct QuestionAccumulator {
    total_answers: i64,
    counts: BTreeMap<String, i64>,
    unmatched_counts: BTreeMap<String, i64>,
    text_counts: Vec<TextCount>, // preserves first-seen insertion order
    numeric_scores: Vec<f64>,
}

struct TextCount {
    normalized: String,
    value: String,
    count: i64,
}

impl QuestionAccumulator {
    fn new() -> Self {
        Self {
            total_answers: 0,
            counts: BTreeMap::new(),
            unmatched_counts: BTreeMap::new(),
            text_counts: Vec::new(),
            numeric_scores: Vec::new(),
        }
    }

    fn increment_text(&mut self, value: &str) {
        let normalized = value.trim().to_lowercase();
        if let Some(existing) = self
            .text_counts
            .iter_mut()
            .find(|t| t.normalized == normalized)
        {
            existing.count += 1;
            return;
        }
        self.text_counts.push(TextCount {
            normalized,
            value: value.to_owned(),
            count: 1,
        });
    }
}

fn increment(counts: &mut BTreeMap<String, i64>, key: &str) {
    *counts.entry(key.to_owned()).or_insert(0) += 1;
}

fn build_question_analytics(definition: &FormDefinition, answer_rows: &[Value]) -> Value {
    // questions = answerable questions, in section/question order.
    let answerable: Vec<&DefQuestion> = definition
        .questions_flat
        .iter()
        .filter(|q| is_answerable_question_type(&q.question_type))
        .collect();

    // accumulator keyed by question id.
    let mut accumulators: BTreeMap<String, QuestionAccumulator> = BTreeMap::new();
    for question in &answerable {
        accumulators.insert(question.id.clone(), QuestionAccumulator::new());
    }

    let resolver = StoredAnswerQuestionResolver::new(definition);

    for answer in answer_rows {
        let Some(question) = resolver.resolve(answer) else {
            continue;
        };
        if !accumulators.contains_key(&question.id) {
            continue;
        }

        let raw_value = extract_stored_answer_value(answer);
        if !has_answer_value(raw_value.as_ref()) {
            continue;
        }
        let raw_value = raw_value.expect("checked");

        let restored = restore_answer_for_question(Some(question), &raw_value);

        let acc = accumulators
            .get_mut(&question.id)
            .expect("accumulator present");
        acc.total_answers += 1;

        match question.question_type.as_str() {
            "multiple_choice" => {
                let resolved_values = match &restored.value {
                    RestoredValue::List(values) => values.clone(),
                    _ => Vec::new(),
                };
                for value in &resolved_values {
                    increment(&mut acc.counts, value);
                }
                for value in &restored.unresolved_values {
                    increment(&mut acc.unmatched_counts, value);
                }
            }
            "short_text" | "long_text" => {
                if let AnswerValue::Text(text) = &raw_value {
                    if !text.trim().is_empty() {
                        acc.increment_text(text.trim());
                    }
                }
            }
            "single_choice" | "dropdown" => {
                let resolved_scalar = restored_scalar(&restored.value);
                if let Some(scalar) = &resolved_scalar {
                    increment(&mut acc.counts, scalar);
                }
                for value in &restored.unresolved_values {
                    increment(&mut acc.unmatched_counts, value);
                }
            }
            "rating" | "linear_scale" => {
                let resolved_scalar = restored_scalar(&restored.value);
                let has_matching_scale_option = resolved_scalar
                    .as_ref()
                    .map(|scalar| question.options.iter().any(|o| &o.value == scalar))
                    .unwrap_or(false);

                if let Some(scalar) = &resolved_scalar {
                    if has_matching_scale_option {
                        increment(&mut acc.counts, scalar);
                    } else {
                        increment(&mut acc.unmatched_counts, scalar);
                    }
                    if let Ok(numeric) = scalar.parse::<f64>() {
                        if !numeric.is_nan() {
                            acc.numeric_scores.push(numeric);
                        }
                    }
                }

                for value in &restored.unresolved_values {
                    if resolved_scalar.as_deref() != Some(value.as_str()) {
                        increment(&mut acc.unmatched_counts, value);
                    }
                }
            }
            _ => {}
        }
    }

    let analytics: Vec<Value> = answerable
        .iter()
        .map(|question| {
            let acc = accumulators.get(&question.id);
            let total_answers = acc.map(|a| a.total_answers).unwrap_or(0);

            let mut obj = Map::new();
            obj.insert("questionId".to_owned(), json!(question.id));
            obj.insert(
                "title".to_owned(),
                json!(normalize_markdown_to_text(
                    question.title.as_deref().unwrap_or("")
                )),
            );
            obj.insert("type".to_owned(), json!(question.question_type));
            obj.insert("totalAnswers".to_owned(), json!(total_answers));

            if matches!(
                question.question_type.as_str(),
                "single_choice" | "multiple_choice" | "dropdown"
            ) {
                let choices: Vec<Value> = question
                    .options
                    .iter()
                    .map(|option| {
                        let count = acc
                            .and_then(|a| a.counts.get(&option.value).copied())
                            .unwrap_or(0);
                        json!({
                            "label": normalize_markdown_to_text(&option.label),
                            "value": option.value,
                            "count": count,
                            "percentage": to_percentage(count, total_answers),
                        })
                    })
                    .collect();
                obj.insert("choices".to_owned(), Value::Array(choices));
            }

            if is_scale_type(&question.question_type) {
                let scale: Vec<Value> = question
                    .options
                    .iter()
                    .map(|option| {
                        let count = acc
                            .and_then(|a| a.counts.get(&option.value).copied())
                            .unwrap_or(0);
                        json!({
                            "score": option.value,
                            "label": normalize_markdown_to_text(&option.label),
                            "count": count,
                            "percentage": to_percentage(count, total_answers),
                        })
                    })
                    .collect();
                obj.insert("scale".to_owned(), Value::Array(scale));

                let numeric_scores = acc.map(|a| a.numeric_scores.as_slice()).unwrap_or(&[]);
                if !numeric_scores.is_empty() {
                    let total_score: f64 = numeric_scores.iter().sum();
                    let mean = total_score / numeric_scores.len() as f64;
                    obj.insert("meanScore".to_owned(), round_one_decimal(mean));
                }
            }

            if let Some(acc) = acc {
                if !acc.unmatched_counts.is_empty() {
                    obj.insert(
                        "unmatchedAnswers".to_owned(),
                        sort_unmatched_answers(&acc.unmatched_counts, total_answers),
                    );
                }
                if !acc.text_counts.is_empty() {
                    obj.insert(
                        "textResponses".to_owned(),
                        sort_text_responses(&acc.text_counts, total_answers),
                    );
                }
            }

            Value::Object(obj)
        })
        .collect();

    Value::Array(analytics)
}

fn restored_scalar(value: &RestoredValue) -> Option<String> {
    match value {
        RestoredValue::Text(text) => Some(text.clone()),
        _ => None,
    }
}

/// `Number((value).toFixed(1))` — rounds to one decimal, drops a trailing `.0`.
fn round_one_decimal(value: f64) -> Value {
    let rounded = (value * 10.0).round() / 10.0;
    if rounded.fract() == 0.0 && rounded.is_finite() {
        json!(rounded as i64)
    } else {
        serde_json::Number::from_f64(rounded)
            .map(Value::Number)
            .unwrap_or(Value::Null)
    }
}

fn sort_unmatched_answers(counts: &BTreeMap<String, i64>, total: i64) -> Value {
    // sort by count desc, then key asc (localeCompare ~ byte order for our keys).
    let mut entries: Vec<(&String, &i64)> = counts.iter().collect();
    entries.sort_by(|left, right| right.1.cmp(left.1).then_with(|| left.0.cmp(right.0)));
    let out: Vec<Value> = entries
        .into_iter()
        .map(|(value, count)| {
            json!({
                "value": value,
                "count": count,
                "percentage": to_percentage(*count, total),
            })
        })
        .collect();
    Value::Array(out)
}

fn sort_text_responses(counts: &[TextCount], total: i64) -> Value {
    // sort by count desc, then value asc.
    let mut entries: Vec<&TextCount> = counts.iter().collect();
    entries.sort_by(|left, right| {
        right
            .count
            .cmp(&left.count)
            .then_with(|| left.value.cmp(&right.value))
    });
    let out: Vec<Value> = entries
        .into_iter()
        .map(|entry| {
            json!({
                "value": entry.value,
                "count": entry.count,
                "percentage": to_percentage(entry.count, total),
            })
        })
        .collect();
    Value::Array(out)
}

fn is_answerable_question_type(question_type: &str) -> bool {
    matches!(
        question_type,
        "short_text"
            | "long_text"
            | "single_choice"
            | "multiple_choice"
            | "dropdown"
            | "linear_scale"
            | "rating"
            | "date"
            | "time"
    )
}

// ---------------------------------------------------------------------------
// content.ts port (stripMarkdownToText / normalize).
// ---------------------------------------------------------------------------

/// Faithful port of `stripMarkdownToText` from `features/forms/content.ts`. The order of
/// transformations matches the legacy `.replace(...)` chain so outputs stay identical.
fn strip_markdown_to_text(value: &str) -> String {
    let mut s = value.to_owned();
    // ![alt](url) -> alt
    s = replace_image_links(&s);
    // [text](url) -> text
    s = replace_text_links(&s);
    // ```...``` (triple backtick fenced) -> ' '
    s = replace_fenced_code(&s);
    // `code` -> code
    s = replace_inline_code(&s);
    // ^#{1,6}\s+ (multiline) -> ''
    s = strip_line_prefix_heading(&s);
    // ^\s*>\s? (multiline) -> ''
    s = strip_line_prefix_blockquote(&s);
    // ^\s*([-*+]|\d+\.)\s+ (multiline) -> ''
    s = strip_line_prefix_list(&s);
    // [*_~]+ -> ''
    s = remove_emphasis_chars(&s);
    // <\/?[^>]+> -> ' '
    s = strip_html_tags(&s);
    // &nbsp; -> ' '
    s = s.replace("&nbsp;", " ").replace("&NBSP;", " ");
    // case-insensitive &nbsp;
    s = replace_case_insensitive(&s, "&nbsp;", " ");
    // \s+ -> ' '
    s = collapse_whitespace(&s);
    s.trim().to_owned()
}

fn normalize_markdown_to_text(value: &str) -> String {
    strip_markdown_to_text(value)
}

fn normalize_markdown_for_comparison(value: &str) -> String {
    normalize_markdown_to_text(value).to_lowercase()
}

// --- regex-free implementations of each markdown transform ---

/// `!\[([^\]]*)\]\([^)]+\)` -> `$1`
fn replace_image_links(input: &str) -> String {
    let chars: Vec<char> = input.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '!' && i + 1 < chars.len() && chars[i + 1] == '[' {
            if let Some((alt, consumed)) = parse_link_at(&chars, i + 1) {
                out.push_str(&alt);
                i += 1 + consumed;
                continue;
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

/// `\[([^\]]+)\]\([^)]+\)` -> `$1`. Note the label requires at least one char here.
fn replace_text_links(input: &str) -> String {
    let chars: Vec<char> = input.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '[' {
            if let Some((label, consumed)) = parse_link_at(&chars, i) {
                if !label.is_empty() {
                    out.push_str(&label);
                    i += consumed;
                    continue;
                }
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

/// Parses `[label](url)` starting at `[` (index `start`). Returns `(label, chars_consumed)`.
/// `label` is `[^\]]*`, `url` is `[^)]+` (at least one char).
fn parse_link_at(chars: &[char], start: usize) -> Option<(String, usize)> {
    if start >= chars.len() || chars[start] != '[' {
        return None;
    }
    let mut i = start + 1;
    let mut label = String::new();
    while i < chars.len() && chars[i] != ']' {
        label.push(chars[i]);
        i += 1;
    }
    if i >= chars.len() || chars[i] != ']' {
        return None;
    }
    i += 1; // consume ]
    if i >= chars.len() || chars[i] != '(' {
        return None;
    }
    i += 1; // consume (
    let url_start = i;
    while i < chars.len() && chars[i] != ')' {
        i += 1;
    }
    if i >= chars.len() || chars[i] != ')' || i == url_start {
        // url must be at least one char ([^)]+)
        return None;
    }
    i += 1; // consume )
    Some((label, i - start))
}

/// `` `{3}[\s\S]*?`{3} `` -> ` ` (non-greedy fenced code).
fn replace_fenced_code(input: &str) -> String {
    let mut out = String::new();
    let mut rest = input;
    while let Some(open) = rest.find("```") {
        out.push_str(&rest[..open]);
        let after_open = &rest[open + 3..];
        if let Some(close) = after_open.find("```") {
            out.push(' ');
            rest = &after_open[close + 3..];
        } else {
            // No closing fence: leave the opener as-is.
            out.push_str(&rest[open..]);
            rest = "";
        }
    }
    out.push_str(rest);
    out
}

/// `` `([^`]*)` `` -> `$1` (single backtick spans).
fn replace_inline_code(input: &str) -> String {
    let chars: Vec<char> = input.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '`' {
            // find next backtick
            if let Some(end) = chars[i + 1..].iter().position(|c| *c == '`') {
                let inner: String = chars[i + 1..i + 1 + end].iter().collect();
                out.push_str(&inner);
                i = i + 1 + end + 1;
                continue;
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

fn for_each_line<F: Fn(&str) -> String>(input: &str, f: F) -> String {
    // JS multiline `^` matches after every `\n`. Preserve original line separators.
    let mut out = String::new();
    let mut first = true;
    for line in input.split('\n') {
        if !first {
            out.push('\n');
        }
        first = false;
        out.push_str(&f(line));
    }
    out
}

/// `^#{1,6}\s+` per line -> ''
fn strip_line_prefix_heading(input: &str) -> String {
    for_each_line(input, |line| {
        let chars: Vec<char> = line.chars().collect();
        let mut hashes = 0;
        while hashes < chars.len() && chars[hashes] == '#' {
            hashes += 1;
        }
        if (1..=6).contains(&hashes) && hashes < chars.len() && chars[hashes].is_whitespace() {
            let mut i = hashes;
            while i < chars.len() && chars[i].is_whitespace() {
                i += 1;
            }
            chars[i..].iter().collect()
        } else {
            line.to_owned()
        }
    })
}

/// `^\s*>\s?` per line -> ''
fn strip_line_prefix_blockquote(input: &str) -> String {
    for_each_line(input, |line| {
        let chars: Vec<char> = line.chars().collect();
        let mut i = 0;
        while i < chars.len() && chars[i].is_whitespace() {
            i += 1;
        }
        if i < chars.len() && chars[i] == '>' {
            i += 1;
            if i < chars.len() && chars[i].is_whitespace() {
                i += 1; // \s? optional single whitespace
            }
            chars[i..].iter().collect()
        } else {
            line.to_owned()
        }
    })
}

/// `^\s*([-*+]|\d+\.)\s+` per line -> ''
fn strip_line_prefix_list(input: &str) -> String {
    for_each_line(input, |line| {
        let chars: Vec<char> = line.chars().collect();
        let mut i = 0;
        while i < chars.len() && chars[i].is_whitespace() {
            i += 1;
        }
        let marker_start = i;
        let mut matched_marker = false;
        if i < chars.len() && matches!(chars[i], '-' | '*' | '+') {
            i += 1;
            matched_marker = true;
        } else {
            let digit_start = i;
            while i < chars.len() && chars[i].is_ascii_digit() {
                i += 1;
            }
            if i > digit_start && i < chars.len() && chars[i] == '.' {
                i += 1;
                matched_marker = true;
            } else {
                i = marker_start;
            }
        }
        if matched_marker && i < chars.len() && chars[i].is_whitespace() {
            while i < chars.len() && chars[i].is_whitespace() {
                i += 1;
            }
            chars[i..].iter().collect()
        } else {
            line.to_owned()
        }
    })
}

/// `[*_~]+` -> ''
fn remove_emphasis_chars(input: &str) -> String {
    input
        .chars()
        .filter(|c| !matches!(c, '*' | '_' | '~'))
        .collect()
}

/// `<\/?[^>]+>` -> ' '
fn strip_html_tags(input: &str) -> String {
    let chars: Vec<char> = input.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '<' {
            // optional '/'
            let mut j = i + 1;
            if j < chars.len() && chars[j] == '/' {
                j += 1;
            }
            // [^>]+ requires at least one non-'>' char
            let content_start = j;
            while j < chars.len() && chars[j] != '>' {
                j += 1;
            }
            if j < chars.len() && chars[j] == '>' && j > content_start {
                out.push(' ');
                i = j + 1;
                continue;
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

fn replace_case_insensitive(input: &str, needle: &str, replacement: &str) -> String {
    if needle.is_empty() {
        return input.to_owned();
    }
    let lower_input = input.to_lowercase();
    let lower_needle = needle.to_lowercase();
    let mut out = String::new();
    let mut last = 0;
    let bytes_input: Vec<char> = input.chars().collect();
    // operate on char indices via lowercase string match positions; rebuild using char map
    // Simpler: byte-based since &nbsp; is ASCII.
    let _ = bytes_input;
    let mut search_from = 0;
    while let Some(pos) = lower_input[search_from..].find(&lower_needle) {
        let abs = search_from + pos;
        out.push_str(&input[last..abs]);
        out.push_str(replacement);
        last = abs + needle.len();
        search_from = last;
    }
    out.push_str(&input[last..]);
    out
}

/// `\s+` -> ' '
fn collapse_whitespace(input: &str) -> String {
    let mut out = String::new();
    let mut in_ws = false;
    for c in input.chars() {
        if c.is_whitespace() {
            if !in_ws {
                out.push(' ');
                in_ws = true;
            }
        } else {
            out.push(c);
            in_ws = false;
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Form definition fetch (private schema). Mirrors fetchFormDefinition, but only
// keeps the fields the /responses payload depends on.
// ---------------------------------------------------------------------------

struct FormDefinition {
    id: String,
    ws_id: Option<String>,
    /// Flat list of all questions across sections, in section-order then question-order,
    /// matching `form.sections.flatMap(s => s.questions)`.
    questions_flat: Vec<DefQuestion>,
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
            ("select", "*".to_owned()),
            ("id", format!("eq.{form_id}")),
            ("limit", "1".to_owned()),
        ],
    )
    .await?;
    let Some(form) = form_rows.into_iter().next() else {
        return Ok(None);
    };
    let ws_id = form.get("ws_id").and_then(Value::as_str).map(str::to_owned);

    let sections = private_get(
        contact_data,
        outbound,
        "form_sections",
        &[
            ("select", "*".to_owned()),
            ("form_id", format!("eq.{form_id}")),
        ],
    )
    .await?;
    let questions = private_get(
        contact_data,
        outbound,
        "form_questions",
        &[
            ("select", "*".to_owned()),
            ("form_id", format!("eq.{form_id}")),
        ],
    )
    .await?;

    let question_ids: Vec<String> = questions
        .iter()
        .filter_map(|q| q.get("id").and_then(Value::as_str).map(str::to_owned))
        .collect();
    let options = if question_ids.is_empty() {
        Vec::new()
    } else {
        let in_filter = format!("in.({})", question_ids.join(","));
        private_get(
            contact_data,
            outbound,
            "form_question_options",
            &[
                (
                    "select",
                    "id, question_id, label, value, image, position".to_owned(),
                ),
                ("question_id", in_filter),
            ],
        )
        .await?
    };

    let questions_flat = build_questions_flat(&sections, &questions, &options);

    Ok(Some(FormDefinition {
        id: form
            .get("id")
            .and_then(Value::as_str)
            .map(str::to_owned)
            .unwrap_or_else(|| form_id.to_owned()),
        ws_id,
        questions_flat,
    }))
}

/// Builds the flattened question list in the same order as `buildFormDefinition`:
/// sections sorted by `position`, questions within a section sorted by `position`,
/// options sorted by `position`.
fn build_questions_flat(
    sections: &[Value],
    questions: &[Value],
    options: &[Value],
) -> Vec<DefQuestion> {
    let mut sorted_sections: Vec<&Value> = sections.iter().collect();
    sorted_sections.sort_by_key(|s| s.get("position").and_then(Value::as_i64).unwrap_or(0));

    let mut out = Vec::new();
    for section in sorted_sections {
        let section_id = section
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let mut section_questions: Vec<&Value> = questions
            .iter()
            .filter(|q| q.get("section_id").and_then(Value::as_str) == Some(section_id))
            .collect();
        section_questions.sort_by_key(|q| q.get("position").and_then(Value::as_i64).unwrap_or(0));

        for question in section_questions {
            let question_id = question
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let mut question_options: Vec<&Value> = options
                .iter()
                .filter(|o| o.get("question_id").and_then(Value::as_str) == Some(question_id))
                .collect();
            question_options
                .sort_by_key(|o| o.get("position").and_then(Value::as_i64).unwrap_or(0));

            let def_options: Vec<DefOption> = question_options
                .into_iter()
                .map(|o| DefOption {
                    label: o
                        .get("label")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_owned(),
                    value: o
                        .get("value")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_owned(),
                })
                .collect();

            out.push(DefQuestion {
                id: question_id.to_owned(),
                title: question
                    .get("title")
                    .and_then(Value::as_str)
                    .map(str::to_owned),
                question_type: question
                    .get("type")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_owned(),
                options: def_options,
            });
        }
    }
    out
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

// ---------------------------------------------------------------------------
// Workspace id normalization / membership / permission (copied from
// workspaces_forms_export.rs per the one-file constraint).
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

    if is_uuid_literal(trimmed) {
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

fn first_id(response: &OutboundResponse) -> Option<String> {
    response
        .json::<Vec<Value>>()
        .ok()?
        .into_iter()
        .next()
        .and_then(|row| row.get("id").and_then(Value::as_str).map(str::to_owned))
}

// ---------------------------------------------------------------------------
// Query-param + path helpers.
// ---------------------------------------------------------------------------

/// `Number(searchParams.get(key) ?? default_str)` semantics: missing -> default,
/// present-but-non-numeric -> NaN.
fn number_param(request_url: Option<&str>, key: &str, default: f64) -> f64 {
    let Some(url) = request_url.and_then(|u| url::Url::parse(u).ok()) else {
        return default;
    };
    match url
        .query_pairs()
        .find_map(|(k, v)| (k == key).then(|| v.into_owned()))
    {
        None => default,
        Some(raw) => js_number(&raw),
    }
}

/// JS `Number(string)`: empty/whitespace string -> 0, valid numeric -> value, else NaN.
fn js_number(raw: &str) -> f64 {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return 0.0;
    }
    trimmed.parse::<f64>().unwrap_or(f64::NAN)
}

/// `searchParams.get('q') ?? undefined` — returns the raw string when present.
fn string_param(request_url: Option<&str>, key: &str) -> Option<String> {
    let url = request_url.and_then(|u| url::Url::parse(u).ok())?;
    url.query_pairs()
        .find_map(|(k, v)| (k == key).then(|| v.into_owned()))
}

/// Matches `/api/v1/workspaces/{wsId}/forms/{formId}/responses` and returns
/// `(raw_ws_id, raw_form_id)`. Returns None when the path shape does not match.
fn responses_segments(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(RESPONSES_PATH_PREFIX)?;
    let rest = rest.strip_suffix(RESPONSES_PATH_SUFFIX)?;
    let (ws_id, form_id) = rest.split_once(FORMS_INFIX)?;

    if ws_id.is_empty() || ws_id.contains('/') || form_id.is_empty() || form_id.contains('/') {
        return None;
    }

    Some((ws_id, form_id))
}

fn is_uuid_literal(value: &str) -> bool {
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

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
