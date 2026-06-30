//! Handler for `GET /api/v1/workspaces/:wsId/forms/:formId`.
//!
//! Ports the GET method of
//! `apps/web/src/app/api/v1/workspaces/[wsId]/forms/[formId]/route.ts`.
//!
//! The legacy route also defines PUT and DELETE methods. Those mutations are NOT
//! migrated here. Every non-GET method returns `None` so the Cloudflare worker
//! falls through to the still-active Next.js route.
//!
//! Behavior mirrored from the legacy GET handler:
//!
//! - 401 `{ "error": "Unauthorized" }` when there is no authenticated Supabase user.
//! - 403 `{ "error": "Forbidden" }` when the caller is not a workspace MEMBER, or
//!   lacks BOTH `manage_forms` AND `view_form_analytics` permissions.
//! - 404 `{ "error": "Form not found" }` when the form does not exist or belongs
//!   to a different workspace than the resolved `wsId`.
//! - 500 `{ "error": "<message>" }` for internal failures. The legacy catch-all
//!   surfaces `error.message`, reproducing `Invalid workspace ID`, `Invalid form ID`,
//!   and a generic `Internal server error` fallback.
//! - 200 `{ "form": { ... } }` where `form` is the `FormDefinition` built from
//!   `private.forms`, `private.form_sections`, `private.form_questions`,
//!   `private.form_logic_rules`, `private.form_share_links`, and
//!   `private.form_question_options`.
//!
//! **Behavior gaps vs. legacy:**
//!
//! - `resolveFormDefinitionMedia`: The legacy route calls Supabase Storage to
//!   generate short-lived signed URLs for `coverImage`, section images, question
//!   images, and option images that have a non-empty `storagePath`. This Rust
//!   handler cannot call Supabase Storage, so image objects are returned with
//!   `storagePath` preserved but `url` left as the raw stored value (not a signed
//!   URL). Callers that depend on signed image URLs should continue using the
//!   Next.js route until this gap is closed.
//! - Theme/settings Zod validation defaults: The legacy `parseFormTheme` and
//!   `parseFormSettings` merge the stored JSON with Zod-schema defaults and strip
//!   invalid enum values. This handler replicates the merge-with-defaults logic
//!   using the same fallback constants but does not run Zod validation; enum fields
//!   with unknown stored values are passed through rather than replaced.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// ---------------------------------------------------------------------------
// Constants.
// ---------------------------------------------------------------------------

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

/// Path prefix and infix used for segment extraction.
const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_FORMS_INFIX: &str = "/forms/";

// Theme defaults (mirrors `createDefaultFormStudioInput().theme`).
const DEFAULT_THEME_PRESET_ID: &str = "editorial-moss";
const DEFAULT_THEME_DENSITY: &str = "balanced";
const DEFAULT_THEME_ACCENT_COLOR: &str = "dynamic-green";
const DEFAULT_THEME_HEADLINE_FONT_ID: &str = "noto-serif";
const DEFAULT_THEME_BODY_FONT_ID: &str = "be-vietnam-pro";
const DEFAULT_THEME_SURFACE_STYLE: &str = "paper";
const DEFAULT_THEME_COVER_HEADLINE: &str = "";
const DEFAULT_TEXT_SIZE: &str = "md";

// Settings defaults (mirrors `createDefaultFormStudioInput().settings`).
const DEFAULT_SETTINGS_CONFIRMATION_TITLE: &str = "Response received";
const DEFAULT_SETTINGS_CONFIRMATION_MESSAGE: &str = "Thanks for taking the time to respond.";

// ---------------------------------------------------------------------------
// Public handler.
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_forms_formid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, raw_form_id) = form_path_segments(request.path)?;

    Some(match request.method {
        "GET" => get_form_response(config, request, raw_ws_id, raw_form_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler.
// ---------------------------------------------------------------------------

async fn get_form_response(
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

    // Resolve workspace id (slug / handle / personal / internal) → canonical UUID.
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

    // Validate the form id shape (canonical UUID). The legacy `parseFormIdParam`
    // throws `Invalid form ID`, surfaced as 500 by the catch-all.
    if !is_workspace_uuid_literal(raw_form_id) {
        return error_response(500, INVALID_FORM_ID_MESSAGE);
    }

    // Fetch the main form row.
    let form_row = match fetch_single_private(
        contact_data,
        outbound,
        "forms",
        &[
            ("select", "*".to_owned()),
            ("id", format!("eq.{raw_form_id}")),
            ("limit", "1".to_owned()),
        ],
    )
    .await
    {
        Ok(Some(row)) => row,
        Ok(None) => return error_response(404, FORM_NOT_FOUND_MESSAGE),
        Err(()) => return error_response(500, INTERNAL_ERROR_MESSAGE),
    };

    // Guard: the form must belong to the resolved workspace.
    let form_ws_id = form_row.get("ws_id").and_then(Value::as_str).unwrap_or("");
    if form_ws_id != resolved_ws_id.as_str() {
        return error_response(404, FORM_NOT_FOUND_MESSAGE);
    }

    // Fetch related tables.
    let sections = match fetch_many_private(
        contact_data,
        outbound,
        "form_sections",
        &[
            ("select", "*".to_owned()),
            ("form_id", format!("eq.{raw_form_id}")),
        ],
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return error_response(500, INTERNAL_ERROR_MESSAGE),
    };

    let questions = match fetch_many_private(
        contact_data,
        outbound,
        "form_questions",
        &[
            ("select", "*".to_owned()),
            ("form_id", format!("eq.{raw_form_id}")),
        ],
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return error_response(500, INTERNAL_ERROR_MESSAGE),
    };

    let logic_rules = match fetch_many_private(
        contact_data,
        outbound,
        "form_logic_rules",
        &[
            ("select", "*".to_owned()),
            ("form_id", format!("eq.{raw_form_id}")),
        ],
    )
    .await
    {
        Ok(rows) => rows,
        Err(()) => return error_response(500, INTERNAL_ERROR_MESSAGE),
    };

    let share_link = match fetch_single_private(
        contact_data,
        outbound,
        "form_share_links",
        &[
            ("select", "*".to_owned()),
            ("form_id", format!("eq.{raw_form_id}")),
            ("limit", "1".to_owned()),
        ],
    )
    .await
    {
        Ok(row_opt) => row_opt,
        Err(()) => return error_response(500, INTERNAL_ERROR_MESSAGE),
    };

    // Fetch question options in chunks of 500 (mirrors `fetchFormQuestionOptions`).
    let question_ids: Vec<String> = questions
        .iter()
        .filter_map(|q| q.get("id").and_then(Value::as_str).map(str::to_owned))
        .collect();

    let options = match fetch_question_options(contact_data, outbound, &question_ids).await {
        Ok(rows) => rows,
        Err(()) => return error_response(500, INTERNAL_ERROR_MESSAGE),
    };

    let form = build_form_definition(
        &form_row,
        &sections,
        &questions,
        &options,
        &logic_rules,
        share_link.as_ref(),
    );

    no_store_response(json_response(200, json!({ "form": form })))
}

// ---------------------------------------------------------------------------
// Form definition builder (mirrors `buildFormDefinition` in server.ts).
// ---------------------------------------------------------------------------

fn build_form_definition(
    form: &Value,
    sections: &[Value],
    questions: &[Value],
    options: &[Value],
    logic_rules: &[Value],
    share_link: Option<&Value>,
) -> Value {
    let get = |key: &str| form.get(key).cloned().unwrap_or(Value::Null);

    let description = form
        .get("description")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned();

    let share_code = share_link
        .and_then(|sl| sl.get("code").cloned())
        .unwrap_or(Value::Null);

    let theme = parse_form_theme(form.get("theme"));
    let settings = parse_form_settings(form.get("settings"));

    // Build options map: question_id → sorted Vec<Value>.
    let mut options_by_question: std::collections::HashMap<&str, Vec<&Value>> =
        std::collections::HashMap::new();
    for opt in options {
        if let Some(qid) = opt.get("question_id").and_then(Value::as_str) {
            options_by_question.entry(qid).or_default().push(opt);
        }
    }
    for vlist in options_by_question.values_mut() {
        vlist.sort_by_key(|o| o.get("position").and_then(Value::as_i64).unwrap_or(0));
    }

    // Build questions map: section_id → sorted Vec<Value>.
    let mut questions_by_section: std::collections::HashMap<&str, Vec<&Value>> =
        std::collections::HashMap::new();
    for question in questions {
        if let Some(sid) = question.get("section_id").and_then(Value::as_str) {
            questions_by_section.entry(sid).or_default().push(question);
        }
    }
    for vlist in questions_by_section.values_mut() {
        vlist.sort_by_key(|q| q.get("position").and_then(Value::as_i64).unwrap_or(0));
    }

    // Sort sections by position.
    let mut sorted_sections: Vec<&Value> = sections.iter().collect();
    sorted_sections.sort_by_key(|s| s.get("position").and_then(Value::as_i64).unwrap_or(0));

    // Get sectionImages from parsed theme for default section images.
    let section_images = theme
        .get("sectionImages")
        .and_then(|si| si.as_object())
        .cloned()
        .unwrap_or_default();
    let default_media = json!({ "storagePath": "", "url": "", "alt": "" });

    let sections_json: Vec<Value> = sorted_sections
        .iter()
        .map(|section| {
            let sid = section.get("id").and_then(Value::as_str).unwrap_or("");
            let section_image = section_images
                .get(sid)
                .cloned()
                .unwrap_or_else(|| default_media.clone());

            let section_questions: Vec<Value> = questions_by_section
                .get(sid)
                .map(|qs| qs.as_slice())
                .unwrap_or(&[])
                .iter()
                .map(|question| {
                    let qid = question.get("id").and_then(Value::as_str).unwrap_or("");
                    let q_image = question
                        .get("image")
                        .map(sanitize_media)
                        .unwrap_or_else(|| default_media.clone());

                    let q_options: Vec<Value> = options_by_question
                        .get(qid)
                        .map(|os| os.as_slice())
                        .unwrap_or(&[])
                        .iter()
                        .map(|opt| {
                            let opt_image = opt
                                .get("image")
                                .map(sanitize_media)
                                .unwrap_or_else(|| default_media.clone());
                            json!({
                                "id": opt.get("id").cloned().unwrap_or(Value::Null),
                                "label": opt.get("label").cloned().unwrap_or(Value::Null),
                                "value": opt.get("value").cloned().unwrap_or(Value::Null),
                                "image": opt_image,
                            })
                        })
                        .collect();

                    json!({
                        "id": question.get("id").cloned().unwrap_or(Value::Null),
                        "sectionId": question.get("section_id").cloned().unwrap_or(Value::Null),
                        "type": question.get("type").cloned().unwrap_or(Value::Null),
                        "title": question.get("title").cloned().unwrap_or(Value::Null),
                        "description": question.get("description").and_then(Value::as_str).unwrap_or(""),
                        "required": question.get("required").cloned().unwrap_or(json!(false)),
                        "image": q_image,
                        "settings": parse_question_settings(question.get("settings")),
                        "options": q_options,
                    })
                })
                .collect();

            json!({
                "id": section.get("id").cloned().unwrap_or(Value::Null),
                "title": section.get("title").cloned().unwrap_or(Value::Null),
                "description": section.get("description").and_then(Value::as_str).unwrap_or(""),
                "image": section_image,
                "questions": section_questions,
            })
        })
        .collect();

    // Sort logic rules by priority.
    let mut sorted_rules: Vec<&Value> = logic_rules.iter().collect();
    sorted_rules.sort_by_key(|r| r.get("priority").and_then(Value::as_i64).unwrap_or(0));

    let logic_rules_json: Vec<Value> = sorted_rules
        .iter()
        .map(|rule| {
            let trigger_type = rule
                .get("trigger_type")
                .and_then(Value::as_str)
                .unwrap_or("question");
            json!({
                "id": rule.get("id").cloned().unwrap_or(Value::Null),
                "triggerType": trigger_type,
                "sourceSectionId": rule.get("source_section_id").cloned().unwrap_or(Value::Null),
                "sourceQuestionId": rule.get("source_question_id").cloned().unwrap_or(Value::Null),
                "operator": rule.get("operator").cloned().unwrap_or(Value::Null),
                "comparisonValue": rule.get("comparison_value").and_then(Value::as_str).unwrap_or(""),
                "actionType": rule.get("action_type").cloned().unwrap_or(Value::Null),
                "targetSectionId": rule.get("target_section_id").cloned().unwrap_or(Value::Null),
            })
        })
        .collect();

    json!({
        "id": get("id"),
        "wsId": get("ws_id"),
        "creatorId": get("creator_id"),
        "title": get("title"),
        "description": description,
        "status": get("status"),
        "accessMode": get("access_mode"),
        "openAt": get("open_at"),
        "closeAt": get("close_at"),
        "maxResponses": get("max_responses"),
        "createdAt": get("created_at"),
        "updatedAt": get("updated_at"),
        "shareCode": share_code,
        "theme": theme,
        "settings": settings,
        "sections": sections_json,
        "logicRules": logic_rules_json,
    })
}

// ---------------------------------------------------------------------------
// Theme / settings / media parsers.
// ---------------------------------------------------------------------------

/// Mirrors `parseFormTheme`: merge stored JSON with defaults, apply per-field
/// defaults for missing or null fields. Enum validation is NOT enforced (gap).
fn parse_form_theme(stored: Option<&Value>) -> Value {
    let obj = stored.and_then(Value::as_object);
    let get_str =
        |key: &str| -> Option<&str> { obj.and_then(|o| o.get(key)).and_then(Value::as_str) };

    let preset_id = get_str("presetId").unwrap_or(DEFAULT_THEME_PRESET_ID);
    let density = get_str("density").unwrap_or(DEFAULT_THEME_DENSITY);
    let accent_color = get_str("accentColor").unwrap_or(DEFAULT_THEME_ACCENT_COLOR);
    let headline_font = get_str("headlineFontId").unwrap_or(DEFAULT_THEME_HEADLINE_FONT_ID);
    let body_font = get_str("bodyFontId").unwrap_or(DEFAULT_THEME_BODY_FONT_ID);
    let surface_style = get_str("surfaceStyle").unwrap_or(DEFAULT_THEME_SURFACE_STYLE);
    let cover_headline = get_str("coverHeadline").unwrap_or(DEFAULT_THEME_COVER_HEADLINE);

    let cover_image = obj
        .and_then(|o| o.get("coverImage"))
        .map(sanitize_media)
        .unwrap_or_else(|| json!({ "storagePath": "", "url": "", "alt": "" }));

    // sectionImages: record<string, media>; pass through stored map if present.
    let section_images = obj
        .and_then(|o| o.get("sectionImages"))
        .cloned()
        .unwrap_or_else(|| json!({}));

    let typography = {
        let typo_obj = obj
            .and_then(|o| o.get("typography"))
            .and_then(Value::as_object);
        let display = typo_obj
            .and_then(|t| t.get("displaySize"))
            .and_then(Value::as_str)
            .unwrap_or(DEFAULT_TEXT_SIZE);
        let heading = typo_obj
            .and_then(|t| t.get("headingSize"))
            .and_then(Value::as_str)
            .unwrap_or(DEFAULT_TEXT_SIZE);
        let body = typo_obj
            .and_then(|t| t.get("bodySize"))
            .and_then(Value::as_str)
            .unwrap_or(DEFAULT_TEXT_SIZE);
        json!({ "displaySize": display, "headingSize": heading, "bodySize": body })
    };

    json!({
        "presetId": preset_id,
        "density": density,
        "accentColor": accent_color,
        "headlineFontId": headline_font,
        "bodyFontId": body_font,
        "surfaceStyle": surface_style,
        "coverHeadline": cover_headline,
        "coverImage": cover_image,
        "sectionImages": section_images,
        "typography": typography,
    })
}

/// Mirrors `parseFormSettings`: merge stored JSON with defaults.
fn parse_form_settings(stored: Option<&Value>) -> Value {
    let obj = stored.and_then(Value::as_object);
    let get_bool = |key: &str, default: bool| -> bool {
        obj.and_then(|o| o.get(key))
            .and_then(Value::as_bool)
            .unwrap_or(default)
    };
    let get_str_field = |key: &str, default: &'static str| -> &str {
        obj.and_then(|o| o.get(key))
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .unwrap_or(default)
    };

    json!({
        "showProgressBar": get_bool("showProgressBar", true),
        "allowMultipleSubmissions": get_bool("allowMultipleSubmissions", true),
        "oneResponsePerUser": get_bool("oneResponsePerUser", false),
        "requireTurnstile": get_bool("requireTurnstile", true),
        "confirmationTitle": get_str_field("confirmationTitle", DEFAULT_SETTINGS_CONFIRMATION_TITLE),
        "confirmationMessage": get_str_field("confirmationMessage", DEFAULT_SETTINGS_CONFIRMATION_MESSAGE),
    })
}

/// Mirrors `parseQuestionSettings`: pass through stored question settings as-is,
/// returning `{}` when absent or not an object.
fn parse_question_settings(stored: Option<&Value>) -> Value {
    match stored {
        Some(Value::Object(_)) => stored.cloned().unwrap_or_else(|| json!({})),
        _ => json!({}),
    }
}

/// Mirrors `sanitizeFormMediaForStorage`: normalizes a media object.
///
/// If `storagePath` is non-empty, `url` is cleared (will need signed URL). The
/// Rust handler does NOT call Supabase Storage to generate signed URLs (behavior gap).
fn sanitize_media(media: &Value) -> Value {
    let obj = media.as_object();
    let storage_path = obj
        .and_then(|o| o.get("storagePath"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let url = if storage_path.is_empty() {
        obj.and_then(|o| o.get("url"))
            .and_then(Value::as_str)
            .unwrap_or("")
    } else {
        ""
    };
    let alt = obj
        .and_then(|o| o.get("alt"))
        .and_then(Value::as_str)
        .unwrap_or("");
    json!({ "storagePath": storage_path, "url": url, "alt": alt })
}

// ---------------------------------------------------------------------------
// Question options fetcher (mirrors `fetchFormQuestionOptions`, chunks of 500).
// ---------------------------------------------------------------------------

async fn fetch_question_options(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    question_ids: &[String],
) -> Result<Vec<Value>, ()> {
    let mut all_options: Vec<Value> = Vec::new();

    for chunk in question_ids.chunks(500) {
        if chunk.is_empty() {
            continue;
        }
        let in_filter = format!("in.({})", chunk.join(","));
        let rows = fetch_many_private(
            contact_data,
            outbound,
            "form_question_options",
            &[
                (
                    "select",
                    "id,question_id,label,value,image,position".to_owned(),
                ),
                ("question_id", in_filter),
            ],
        )
        .await?;
        all_options.extend(rows);
    }

    Ok(all_options)
}

// ---------------------------------------------------------------------------
// Private-schema REST helpers.
// ---------------------------------------------------------------------------

async fn fetch_many_private(
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

async fn fetch_single_private(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    params: &[(&str, String)],
) -> Result<Option<Value>, ()> {
    let rows = fetch_many_private(contact_data, outbound, table, params).await?;
    Ok(rows.into_iter().next())
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

    let mut req = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);
    if let Some(schema) = schema {
        req = req.with_header("Accept-Profile", schema);
    }

    outbound.send(req).await.map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Workspace id normalization / membership / permission.
// Copied file-local from workspaces_forms_formid_analytics.rs.
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

    if let Some(ws_id) =
        workspace_id_by_handle(contact_data, outbound, &handle, Some(access_token)).await?
    {
        return Ok(Some(ws_id));
    }
    if let Some(ws_id) = workspace_id_by_handle(contact_data, outbound, &handle, None).await? {
        return Ok(Some(ws_id));
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

// ---------------------------------------------------------------------------
// Small helpers.
// ---------------------------------------------------------------------------

fn first_id(response: &OutboundResponse) -> Option<String> {
    response
        .json::<Vec<Value>>()
        .ok()?
        .into_iter()
        .next()
        .and_then(|row| row.get("id").and_then(Value::as_str).map(str::to_owned))
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ---------------------------------------------------------------------------
// Path matching.
// ---------------------------------------------------------------------------

/// Matches `/api/v1/workspaces/{wsId}/forms/{formId}` exactly and returns
/// `(raw_ws_id, raw_form_id)`. Returns `None` for any other path shape,
/// including sub-resources such as `/forms/{id}/analytics`.
fn form_path_segments(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let (ws_id, rest2) = rest.split_once(PATH_FORMS_INFIX)?;

    // Neither segment may be empty or contain a `/` (guards sub-paths).
    if ws_id.is_empty() || ws_id.contains('/') || rest2.is_empty() || rest2.contains('/') {
        return None;
    }

    Some((ws_id, rest2))
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

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // Path matching.

    #[test]
    fn exact_form_path_matches() {
        let (ws_id, form_id) = form_path_segments(
            "/api/v1/workspaces/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/forms/11111111-2222-3333-4444-555555555555",
        )
        .unwrap();
        assert_eq!(ws_id, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
        assert_eq!(form_id, "11111111-2222-3333-4444-555555555555");
    }

    #[test]
    fn sub_resource_path_does_not_match() {
        assert!(form_path_segments("/api/v1/workspaces/ws-id/forms/form-id/analytics").is_none());
        assert!(form_path_segments("/api/v1/workspaces/ws-id/forms/form-id/responses").is_none());
    }

    #[test]
    fn forms_list_path_does_not_match() {
        // /api/v1/workspaces/{wsId}/forms has no formId segment.
        assert!(form_path_segments("/api/v1/workspaces/ws-id/forms").is_none());
    }

    #[test]
    fn unrelated_path_does_not_match() {
        assert!(form_path_segments("/api/v1/workspaces/ws-id/habits").is_none());
        assert!(form_path_segments("/api/v2/workspaces/ws-id/forms/fid").is_none());
    }

    #[test]
    fn personal_slug_ws_id_allowed() {
        let (ws_id, form_id) =
            form_path_segments("/api/v1/workspaces/personal/forms/my-form-id").unwrap();
        assert_eq!(ws_id, "personal");
        assert_eq!(form_id, "my-form-id");
    }

    // UUID validation.

    #[test]
    fn valid_uuid_passes() {
        assert!(is_workspace_uuid_literal(
            "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
        ));
    }

    #[test]
    fn invalid_uuid_fails() {
        assert!(!is_workspace_uuid_literal("not-a-uuid"));
        assert!(!is_workspace_uuid_literal(""));
    }

    // Theme/settings parsing.

    #[test]
    fn parse_form_theme_uses_defaults_when_null() {
        let theme = parse_form_theme(None);
        assert_eq!(theme["presetId"], "editorial-moss");
        assert_eq!(theme["density"], "balanced");
        assert_eq!(theme["accentColor"], "dynamic-green");
        assert_eq!(theme["typography"]["displaySize"], "md");
    }

    #[test]
    fn parse_form_theme_respects_stored_values() {
        let stored = json!({
            "presetId": "custom-preset",
            "density": "compact",
            "accentColor": "dynamic-blue",
            "headlineFontId": "inter",
            "bodyFontId": "inter",
            "surfaceStyle": "glass",
            "coverHeadline": "Hello",
            "coverImage": { "storagePath": "path/to/img", "url": "http://old", "alt": "img" },
            "sectionImages": {},
            "typography": { "displaySize": "lg", "headingSize": "sm", "bodySize": "lg" },
        });
        let theme = parse_form_theme(Some(&stored));
        assert_eq!(theme["presetId"], "custom-preset");
        assert_eq!(theme["density"], "compact");
        assert_eq!(theme["typography"]["displaySize"], "lg");
    }

    #[test]
    fn parse_form_settings_uses_defaults_when_null() {
        let settings = parse_form_settings(None);
        assert_eq!(settings["showProgressBar"], true);
        assert_eq!(settings["allowMultipleSubmissions"], true);
        assert_eq!(settings["oneResponsePerUser"], false);
        assert_eq!(settings["requireTurnstile"], true);
        assert_eq!(settings["confirmationTitle"], "Response received");
    }

    #[test]
    fn sanitize_media_clears_url_when_storage_path_present() {
        let media = json!({ "storagePath": "some/path", "url": "https://example.com/img.png", "alt": "Alt" });
        let result = sanitize_media(&media);
        assert_eq!(result["storagePath"], "some/path");
        assert_eq!(result["url"], "");
        assert_eq!(result["alt"], "Alt");
    }

    #[test]
    fn sanitize_media_preserves_url_when_no_storage_path() {
        let media = json!({ "storagePath": "", "url": "https://example.com/img.png", "alt": "" });
        let result = sanitize_media(&media);
        assert_eq!(result["url"], "https://example.com/img.png");
        assert_eq!(result["storagePath"], "");
    }

    // Handle validation.

    #[test]
    fn valid_handle_passes() {
        assert!(is_workspace_handle("my-workspace"));
        assert!(is_workspace_handle("ws123"));
    }

    #[test]
    fn invalid_handle_fails() {
        assert!(!is_workspace_handle(""));
        assert!(!is_workspace_handle("-leading-dash"));
        assert!(!is_workspace_handle("UPPERCASE"));
    }
}
