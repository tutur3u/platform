//! Handler for `GET /api/v1/shared/forms/:shareCode`.
//!
//! Ports the `GET` method of the legacy Next.js route at
//! `apps/web/src/app/api/v1/shared/forms/[shareCode]/route.ts`.
//!
//! Only `GET` is migrated; all other methods (e.g. `POST`) return `None` so
//! the worker falls through to the still-live Next.js route.
//!
//! ## Behavior mirrored from the legacy `GET`
//!
//! The legacy handler calls `loadSharedFormSnapshot(shareCode)`, which:
//!
//! - Resolves an active `form_share_links` row by `code`.
//! - Fetches the linked `forms` row and calls `fetchFormDefinition`.
//! - Returns:
//!   - 404 `{ "error": "Form not found" }` — share link inactive or missing.
//!   - 410 `{ "error": "This form is not currently accepting responses" }` —
//!     form not published, before `open_at`, or after `close_at`.
//!   - 401 `{ "error": "Authentication required to access this form" }` —
//!     form `access_mode` is not `anonymous` (unknown values fall back to
//!     `anonymous`, matching `resolveAccessMode` in the TypeScript source).
//!   - 500 `{ "error": "Internal server error" }` — upstream failure.
//!   - 200 `{ "form": <FormDefinition> }` (no-store) on success.
//!
//! ## Behavior gaps vs. legacy
//!
//! - **Theme / settings merging with defaults**: `parseFormTheme` and
//!   `parseFormSettings` merge stored JSONB with schema defaults. This handler
//!   passes stored values through as-is, falling back to the canonical
//!   defaults only when the column is null. Forms saved via the platform
//!   already contain merged values, so divergence is rare.
//! - **Supabase Storage signed URLs**: `resolveFormDefinitionMedia` generates
//!   signed URLs via the Supabase JS storage client. This handler replicates
//!   it via direct `POST /storage/v1/object/sign/workspaces/<path>` calls.
//!   Failures are silently ignored (same as the TypeScript fallback), leaving
//!   the `url` field empty while the `storagePath` is preserved.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendResponse, contact, json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const PATH_PREFIX: &str = "/api/v1/shared/forms/";
const PRIVATE_SCHEMA: &str = "private";
const STORAGE_SIGN_EXPIRES_IN: u64 = 3600;

// ---------------------------------------------------------------------------
// Supabase row types (private schema)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct ShareLinkRow {
    form_id: String,
    active: Option<bool>,
}

#[derive(Deserialize)]
struct FormRow {
    id: String,
    ws_id: String,
    creator_id: Option<String>,
    title: String,
    description: Option<String>,
    status: String,
    access_mode: String,
    open_at: Option<String>,
    close_at: Option<String>,
    max_responses: Option<i64>,
    created_at: Option<String>,
    updated_at: Option<String>,
    theme: Option<Value>,
    settings: Option<Value>,
}

#[derive(Deserialize)]
struct SectionRow {
    id: String,
    title: String,
    description: Option<String>,
    position: f64,
}

#[derive(Deserialize)]
struct QuestionRow {
    id: String,
    section_id: String,
    #[serde(rename = "type")]
    question_type: String,
    title: String,
    description: Option<String>,
    required: Option<bool>,
    position: f64,
    settings: Option<Value>,
    image: Option<Value>,
}

#[derive(Deserialize)]
struct LogicRuleRow {
    id: String,
    trigger_type: Option<String>,
    source_section_id: Option<String>,
    source_question_id: Option<String>,
    operator: Option<String>,
    comparison_value: Option<String>,
    action_type: Option<String>,
    target_section_id: Option<String>,
    priority: f64,
}

#[derive(Deserialize)]
struct OptionRow {
    id: String,
    question_id: String,
    label: String,
    value: Option<String>,
    image: Option<Value>,
    position: f64,
}

#[derive(Deserialize)]
struct ShareCodeRow {
    code: Option<String>,
}

#[derive(Deserialize)]
struct SignedUrlResponse {
    #[serde(rename = "signedURL")]
    signed_url: Option<String>,
}

// ---------------------------------------------------------------------------
// Public handler
// ---------------------------------------------------------------------------

pub(crate) async fn handle_shared_forms_sharecode_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let share_code = extract_share_code(request.path)?;

    Some(match request.method {
        "GET" => get_shared_form(config, share_code, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn get_shared_form(
    config: &BackendConfig,
    share_code: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let cd = &config.contact_data;
    if !cd.configured() {
        return error_response(500, "Internal server error");
    }

    // Step 1 — resolve active share link.
    let share_link = match fetch_share_link(cd, outbound, share_code).await {
        Ok(Some(sl)) if sl.active.unwrap_or(false) => sl,
        Ok(_) => return error_response(404, "Form not found"),
        Err(()) => return error_response(500, "Internal server error"),
    };

    // Step 2 — fetch the form.
    let form = match fetch_form(cd, outbound, &share_link.form_id).await {
        Ok(Some(f)) => f,
        Ok(None) => return error_response(404, "Form not found"),
        Err(()) => return error_response(500, "Internal server error"),
    };

    // Step 3 — must be accepting responses.
    if !is_form_accepting_responses(&form) {
        return error_response(410, "This form is not currently accepting responses");
    }

    // Step 4 — access mode must be anonymous (unknown modes fall back to anonymous,
    // matching `resolveAccessMode` in the TypeScript source).
    let resolved_access_mode = resolve_access_mode(&form.access_mode);
    if resolved_access_mode != "anonymous" {
        return error_response(401, "Authentication required to access this form");
    }

    // Step 5 — fetch definition data: sections, questions, logic rules, options,
    // and the share code from the share link row.
    let form_id = form.id.clone();
    let (sections, questions, logic_rules, stored_share_code, options) =
        match fetch_definition_data(cd, outbound, &form_id).await {
            Ok(data) => data,
            Err(()) => return error_response(500, "Internal server error"),
        };

    // Step 6 — build the FormDefinition.
    let mut definition = build_form_definition(
        form,
        stored_share_code,
        sections,
        questions,
        logic_rules,
        options,
    );

    // Step 7 — resolve media (signed URLs for storage paths).
    resolve_media_inplace(cd, outbound, &mut definition).await;

    no_store_response(json_response(200, json!({ "form": definition })))
}

// ---------------------------------------------------------------------------
// Data access helpers
// ---------------------------------------------------------------------------

async fn fetch_share_link(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    code: &str,
) -> Result<Option<ShareLinkRow>, ()> {
    let url = cd
        .rest_url(
            "form_share_links",
            &[
                ("select", "form_id,active".to_owned()),
                ("code", format!("eq.{code}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = private_get(cd, outbound, &url).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    resp.json::<Vec<ShareLinkRow>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

async fn fetch_form(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    form_id: &str,
) -> Result<Option<FormRow>, ()> {
    let url = cd
        .rest_url(
            "forms",
            &[
                ("select", "*".to_owned()),
                ("id", format!("eq.{form_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = private_get(cd, outbound, &url).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    resp.json::<Vec<FormRow>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

type DefinitionData = (
    Vec<SectionRow>,
    Vec<QuestionRow>,
    Vec<LogicRuleRow>,
    Option<String>,
    Vec<OptionRow>,
);

async fn fetch_definition_data(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    form_id: &str,
) -> Result<DefinitionData, ()> {
    let sections = fetch_table::<SectionRow>(cd, outbound, "form_sections", form_id).await?;
    let questions = fetch_table::<QuestionRow>(cd, outbound, "form_questions", form_id).await?;
    let logic_rules =
        fetch_table::<LogicRuleRow>(cd, outbound, "form_logic_rules", form_id).await?;

    // Share link code (to populate `shareCode` in the definition).
    let share_code = fetch_share_code(cd, outbound, form_id).await;

    // Options for all questions.
    let question_ids: Vec<String> = questions.iter().map(|q| q.id.clone()).collect();
    let options = fetch_options(cd, outbound, &question_ids).await?;

    Ok((sections, questions, logic_rules, share_code, options))
}

async fn fetch_table<T: for<'de> serde::Deserialize<'de>>(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    form_id: &str,
) -> Result<Vec<T>, ()> {
    let url = cd
        .rest_url(
            table,
            &[
                ("select", "*".to_owned()),
                ("form_id", format!("eq.{form_id}")),
            ],
        )
        .ok_or(())?;
    let resp = private_get(cd, outbound, &url).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    resp.json::<Vec<T>>().map_err(|_| ())
}

async fn fetch_share_code(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    form_id: &str,
) -> Option<String> {
    let url = cd.rest_url(
        "form_share_links",
        &[
            ("select", "code".to_owned()),
            ("form_id", format!("eq.{form_id}")),
            ("limit", "1".to_owned()),
        ],
    )?;
    let resp = private_get(cd, outbound, &url).await.ok()?;
    if !(200..300).contains(&resp.status) {
        return None;
    }
    resp.json::<Vec<ShareCodeRow>>()
        .ok()
        .and_then(|rows| rows.into_iter().next())
        .and_then(|r| r.code)
}

async fn fetch_options(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    question_ids: &[String],
) -> Result<Vec<OptionRow>, ()> {
    if question_ids.is_empty() {
        return Ok(Vec::new());
    }
    let mut all: Vec<OptionRow> = Vec::new();
    for chunk in question_ids.chunks(500) {
        let in_filter = format!("in.({})", chunk.join(","));
        let url = cd
            .rest_url(
                "form_question_options",
                &[
                    (
                        "select",
                        "id,question_id,label,value,image,position".to_owned(),
                    ),
                    ("question_id", in_filter),
                ],
            )
            .ok_or(())?;
        let resp = private_get(cd, outbound, &url).await?;
        if !(200..300).contains(&resp.status) {
            return Err(());
        }
        all.extend(resp.json::<Vec<OptionRow>>().map_err(|_| ())?);
    }
    Ok(all)
}

async fn private_get(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<crate::outbound::OutboundResponse, ()> {
    let key = cd.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {key}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA),
        )
        .await
        .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// FormDefinition builder (mirrors buildFormDefinition in forms/server.ts)
// ---------------------------------------------------------------------------

fn build_form_definition(
    form: FormRow,
    share_code: Option<String>,
    mut sections: Vec<SectionRow>,
    questions: Vec<QuestionRow>,
    mut logic_rules: Vec<LogicRuleRow>,
    mut options: Vec<OptionRow>,
) -> Value {
    // Sort by position ascending (mirrors TypeScript .sort((a,b) => a.position - b.position)).
    sections.sort_by(|a, b| {
        a.position
            .partial_cmp(&b.position)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    logic_rules.sort_by(|a, b| {
        a.priority
            .partial_cmp(&b.priority)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    options.sort_by(|a, b| {
        a.position
            .partial_cmp(&b.position)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    // Group options and questions by their parent id.
    let mut opts_by_question: std::collections::HashMap<&str, Vec<&OptionRow>> =
        std::collections::HashMap::new();
    for opt in &options {
        opts_by_question
            .entry(opt.question_id.as_str())
            .or_default()
            .push(opt);
    }

    let mut qs_by_section: std::collections::HashMap<&str, Vec<&QuestionRow>> =
        std::collections::HashMap::new();
    for q in &questions {
        qs_by_section
            .entry(q.section_id.as_str())
            .or_default()
            .push(q);
    }

    // Sort within each group (positions are per-parent).
    for qs in qs_by_section.values_mut() {
        qs.sort_by(|a, b| {
            a.position
                .partial_cmp(&b.position)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
    }

    let theme = form.theme.clone().unwrap_or_else(default_theme);

    let sections_json: Vec<Value> = sections
        .iter()
        .map(|sec| {
            // Section image from theme.sectionImages[section.id], mirrors the TypeScript.
            let sec_image = theme
                .get("sectionImages")
                .and_then(|si| si.get(&sec.id))
                .cloned();

            let sec_questions: Vec<Value> = qs_by_section
                .get(sec.id.as_str())
                .map(|qs| {
                    qs.iter()
                        .map(|q| {
                            let q_options: Vec<Value> = opts_by_question
                                .get(q.id.as_str())
                                .map(|opts| {
                                    opts.iter()
                                        .map(|opt| {
                                            json!({
                                                "id": opt.id,
                                                "label": opt.label,
                                                "value": opt.value,
                                                "image": sanitize_media(&opt.image),
                                            })
                                        })
                                        .collect()
                                })
                                .unwrap_or_default();
                            json!({
                                "id": q.id,
                                "sectionId": q.section_id,
                                "type": q.question_type,
                                "title": q.title,
                                "description": q.description.as_deref().unwrap_or(""),
                                "required": q.required.unwrap_or(false),
                                "image": sanitize_media(&q.image),
                                "settings": q.settings.clone().unwrap_or_else(|| json!({})),
                                "options": q_options,
                            })
                        })
                        .collect()
                })
                .unwrap_or_default();

            json!({
                "id": sec.id,
                "title": sec.title,
                "description": sec.description.as_deref().unwrap_or(""),
                "image": sanitize_media(&sec_image),
                "questions": sec_questions,
            })
        })
        .collect();

    let logic_json: Vec<Value> = logic_rules
        .iter()
        .map(|rule| {
            json!({
                "id": rule.id,
                "triggerType": rule.trigger_type.as_deref().unwrap_or("question"),
                "sourceSectionId": rule.source_section_id,
                "sourceQuestionId": rule.source_question_id,
                "operator": rule.operator,
                "comparisonValue": rule.comparison_value.as_deref().unwrap_or(""),
                "actionType": rule.action_type,
                "targetSectionId": rule.target_section_id,
            })
        })
        .collect();

    let settings = form.settings.unwrap_or_else(default_settings);

    json!({
        "id": form.id,
        "wsId": form.ws_id,
        "creatorId": form.creator_id,
        "title": form.title,
        "description": form.description.as_deref().unwrap_or(""),
        "status": form.status,
        "accessMode": form.access_mode,
        "openAt": form.open_at,
        "closeAt": form.close_at,
        "maxResponses": form.max_responses,
        "createdAt": form.created_at,
        "updatedAt": form.updated_at,
        "shareCode": share_code,
        "theme": theme,
        "settings": settings,
        "sections": sections_json,
        "logicRules": logic_json,
    })
}

/// Returns `{ "storagePath": ..., "url": ..., "alt": ... }`, mirroring
/// `sanitizeFormMediaForStorage`. When `storagePath` is non-empty, `url` is
/// cleared (it will be filled in by `resolve_media_inplace`).
fn sanitize_media(media: &Option<Value>) -> Value {
    let default = json!({ "storagePath": "", "url": "", "alt": "" });
    let Some(m) = media else {
        return default;
    };
    let Some(obj) = m.as_object() else {
        return default;
    };
    let storage_path = obj.get("storagePath").and_then(Value::as_str).unwrap_or("");
    let url = if storage_path.is_empty() {
        obj.get("url").and_then(Value::as_str).unwrap_or("")
    } else {
        ""
    };
    let alt = obj.get("alt").and_then(Value::as_str).unwrap_or("");
    json!({ "storagePath": storage_path, "url": url, "alt": alt })
}

fn default_theme() -> Value {
    json!({
        "presetId": "editorial-moss",
        "density": "balanced",
        "accentColor": "dynamic-green",
        "headlineFontId": "noto-serif",
        "bodyFontId": "be-vietnam-pro",
        "surfaceStyle": "paper",
        "coverHeadline": "",
        "coverImage": { "storagePath": "", "url": "", "alt": "" },
        "sectionImages": {},
        "typography": { "displaySize": "md", "headingSize": "md", "bodySize": "md" },
    })
}

fn default_settings() -> Value {
    json!({
        "showProgressBar": true,
        "allowMultipleSubmissions": true,
        "oneResponsePerUser": false,
        "requireTurnstile": true,
        "confirmationTitle": "Response received",
        "confirmationMessage": "Thanks for taking the time to respond.",
    })
}

// ---------------------------------------------------------------------------
// Media resolution — mirrors resolveFormDefinitionMedia
// ---------------------------------------------------------------------------

async fn resolve_media_inplace(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    definition: &mut Value,
) {
    // Cover image.
    if let Some(cover) = definition
        .get("theme")
        .and_then(|t| t.get("coverImage"))
        .cloned()
    {
        let resolved = resolve_single_media(cd, outbound, cover).await;
        if let Some(t) = definition.get_mut("theme").and_then(Value::as_object_mut) {
            t.insert("coverImage".to_owned(), resolved);
        }
    }

    // Section images + question images + option images.
    if let Some(sections) = definition.get_mut("sections").and_then(Value::as_array_mut) {
        for sec in sections.iter_mut() {
            if let Some(img) = sec.get("image").cloned() {
                let resolved = resolve_single_media(cd, outbound, img).await;
                if let Some(obj) = sec.as_object_mut() {
                    obj.insert("image".to_owned(), resolved);
                }
            }
            if let Some(qs) = sec.get_mut("questions").and_then(Value::as_array_mut) {
                for q in qs.iter_mut() {
                    if let Some(img) = q.get("image").cloned() {
                        let resolved = resolve_single_media(cd, outbound, img).await;
                        if let Some(obj) = q.as_object_mut() {
                            obj.insert("image".to_owned(), resolved);
                        }
                    }
                    if let Some(opts) = q.get_mut("options").and_then(Value::as_array_mut) {
                        for opt in opts.iter_mut() {
                            if let Some(img) = opt.get("image").cloned() {
                                let resolved = resolve_single_media(cd, outbound, img).await;
                                if let Some(obj) = opt.as_object_mut() {
                                    obj.insert("image".to_owned(), resolved);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

async fn resolve_single_media(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    media: Value,
) -> Value {
    let storage_path = media
        .get("storagePath")
        .and_then(Value::as_str)
        .unwrap_or("");
    if storage_path.is_empty() {
        return media;
    }
    // Derive the Supabase base URL from auth_url ("" path gives
    // "{supabase_url}/auth/v1/"); strip the trailing "/auth/v1/".
    let signed = sign_storage_url(cd, outbound, storage_path).await;
    let Some(signed_url) = signed else {
        return media; // silently ignore signing failure, matching legacy
    };
    let mut updated = media;
    if let Some(obj) = updated.as_object_mut() {
        obj.insert("url".to_owned(), Value::String(signed_url));
    }
    updated
}

async fn sign_storage_url(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    storage_path: &str,
) -> Option<String> {
    // Derive base URL: auth_url("") == "{supabase_url}/auth/v1/"
    let auth_root = cd.auth_url("")?;
    let base = auth_root.trim_end_matches('/').strip_suffix("/auth/v1")?;
    let url = format!("{base}/storage/v1/object/sign/workspaces/{storage_path}");

    let key = cd.service_role_key()?;
    let bearer = format!("Bearer {key}");
    let body = format!("{{\"expiresIn\":{STORAGE_SIGN_EXPIRES_IN}}}");

    let resp = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .ok()?;

    if !(200..300).contains(&resp.status) {
        return None;
    }
    resp.json::<SignedUrlResponse>()
        .ok()
        .and_then(|r| r.signed_url)
}

// ---------------------------------------------------------------------------
// Business-logic helpers
// ---------------------------------------------------------------------------

/// Mirrors `resolveAccessMode`: unknown values fall back to `"anonymous"`.
fn resolve_access_mode(value: &str) -> &str {
    match value {
        "anonymous" | "authenticated" | "authenticated_email" => value,
        _ => "anonymous",
    }
}

/// Mirrors `isFormAcceptingResponses` from the TypeScript source.
fn is_form_accepting_responses(form: &FormRow) -> bool {
    if form.status != "published" {
        return false;
    }
    let now = current_unix_secs();
    if let Some(open_at) = &form.open_at
        && let Some(open_secs) = parse_iso_utc_secs(open_at)
        && open_secs > now
    {
        return false;
    }
    if let Some(close_at) = &form.close_at
        && let Some(close_secs) = parse_iso_utc_secs(close_at)
        && close_secs < now
    {
        return false;
    }
    true
}

// ---------------------------------------------------------------------------
// Path extraction
// ---------------------------------------------------------------------------

fn extract_share_code(path: &str) -> Option<&str> {
    let code = path.strip_prefix(PATH_PREFIX)?;
    (!code.is_empty() && !code.contains('/')).then_some(code)
}

// ---------------------------------------------------------------------------
// Response helper
// ---------------------------------------------------------------------------

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ---------------------------------------------------------------------------
// Timestamp helpers
// ---------------------------------------------------------------------------

fn current_unix_secs() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Parses `YYYY-MM-DDTHH:MM:SS[...Z|+00:00]` to UTC Unix seconds.
/// Returns `None` on any parse failure; the caller then skips the date check.
fn parse_iso_utc_secs(s: &str) -> Option<u64> {
    let s = s.trim();
    if s.len() < 19 {
        return None;
    }
    let sep = s.as_bytes().get(10)?;
    if *sep != b'T' && *sep != b' ' {
        return None;
    }
    let year: i64 = s[0..4].parse().ok()?;
    let month: u32 = s[5..7].parse().ok()?;
    let day: u32 = s[8..10].parse().ok()?;
    let hour: u64 = s[11..13].parse().ok()?;
    let minute: u64 = s[14..16].parse().ok()?;
    let second: u64 = s[17..19].parse().ok()?;

    let days = days_from_civil(year, month, day)?;
    // Days since epoch (Unix epoch = 1970-01-01 = day 0).
    let epoch_days = days - DAYS_0001_TO_EPOCH;
    if epoch_days < 0 {
        return None;
    }
    Some(epoch_days as u64 * 86_400 + hour * 3_600 + minute * 60 + second)
}

/// Days since the proleptic Gregorian date 0001-01-01 (day 1 → returns 0).
/// Uses Howard Hinnant's algorithm.
const DAYS_0001_TO_EPOCH: i64 = 719_162; // days from 0001-01-01 to 1970-01-01

fn days_from_civil(year: i64, month: u32, day: u32) -> Option<i64> {
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    let (y, m) = if month <= 2 {
        (year - 1, month + 9)
    } else {
        (year, month - 3)
    };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400; // [0, 399]
    let doy = (153 * m as i64 + 2) / 5 + day as i64 - 1; // [0, 365]
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy; // [0, 146096]
    // Days since 0000-03-01; add offset to convert to 0001-01-01 base.
    Some(era * 146_097 + doe - 719_468 + DAYS_0001_TO_EPOCH)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_share_code_valid() {
        assert_eq!(
            extract_share_code("/api/v1/shared/forms/ABC123xYz456"),
            Some("ABC123xYz456")
        );
    }

    #[test]
    fn extract_share_code_rejects_extra_segment() {
        assert_eq!(
            extract_share_code("/api/v1/shared/forms/ABC123/extra"),
            None
        );
    }

    #[test]
    fn extract_share_code_rejects_empty_segment() {
        assert_eq!(extract_share_code("/api/v1/shared/forms/"), None);
    }

    #[test]
    fn extract_share_code_rejects_wrong_prefix() {
        assert_eq!(extract_share_code("/api/v1/shared/task-boards/X"), None);
    }

    #[test]
    fn resolve_access_mode_known_values() {
        assert_eq!(resolve_access_mode("anonymous"), "anonymous");
        assert_eq!(resolve_access_mode("authenticated"), "authenticated");
        assert_eq!(
            resolve_access_mode("authenticated_email"),
            "authenticated_email"
        );
    }

    #[test]
    fn resolve_access_mode_unknown_falls_back_to_anonymous() {
        assert_eq!(resolve_access_mode("unknown_mode"), "anonymous");
        assert_eq!(resolve_access_mode(""), "anonymous");
    }

    #[test]
    fn parse_iso_utc_secs_unix_epoch() {
        assert_eq!(parse_iso_utc_secs("1970-01-01T00:00:00"), Some(0));
    }

    #[test]
    fn parse_iso_utc_secs_future_date() {
        // 2024-01-15T00:00:00 must be well past the Unix epoch.
        let secs = parse_iso_utc_secs("2024-01-15T00:00:00").unwrap();
        assert!(
            secs > 1_700_000_000,
            "expected > Nov 2023 epoch, got {secs}"
        );
    }

    #[test]
    fn sanitize_media_no_storage_path_keeps_url() {
        let media = json!({
            "storagePath": "",
            "url": "https://example.com/img.jpg",
            "alt": "img"
        });
        let result = sanitize_media(&Some(media));
        assert_eq!(result["url"], "https://example.com/img.jpg");
        assert_eq!(result["storagePath"], "");
    }

    #[test]
    fn sanitize_media_with_storage_path_clears_url() {
        let media = json!({
            "storagePath": "workspaces/abc/cover.jpg",
            "url": "https://stale.url/img.jpg",
            "alt": ""
        });
        let result = sanitize_media(&Some(media));
        assert_eq!(result["storagePath"], "workspaces/abc/cover.jpg");
        assert_eq!(result["url"], "");
    }

    #[test]
    fn sanitize_media_none_returns_default() {
        let result = sanitize_media(&None);
        assert_eq!(result["storagePath"], "");
        assert_eq!(result["url"], "");
        assert_eq!(result["alt"], "");
    }
}
