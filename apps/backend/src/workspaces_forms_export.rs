//! Handler for `GET /api/v1/workspaces/:wsId/forms/:formId/export`.
//!
//! Ports `apps/web/src/app/api/v1/workspaces/[wsId]/forms/[formId]/export/route.ts`.
//!
//! Behavior mirrored from the legacy route:
//! - GET only (other methods => 405).
//! - 401 `{ "error": "Unauthorized" }` when there is no authenticated Supabase user.
//! - 403 `{ "error": "Forbidden" }` when the caller is not a workspace MEMBER, or
//!   lacks BOTH `manage_forms` AND `view_form_analytics` permissions.
//! - 404 `{ "error": "Form not found" }` when the form does not exist or belongs to a
//!   different workspace than the resolved `wsId`.
//! - 500 `{ "error": "<message>" }` for internal failures (mirrors the legacy catch-all,
//!   which surfaces `Invalid form ID` / `Invalid workspace ID` style messages).
//! - 200 returns the export envelope JSON (pretty-printed, 2-space indent) with a
//!   `Content-Disposition: attachment; filename="..."` header and
//!   `Content-Type: application/json; charset=utf-8`.
//!
//! The envelope shape is `{ formatVersion, exportedAt, form }` where `form` is the
//! `toStudioInput(definition)` projection: sections/questions/options sorted by their
//! stored `position`, logic rules sorted by `priority`, and theme/settings merged onto
//! the schema defaults.
//!
//! KNOWN DIVERGENCE (see notes in the structured result): the legacy route resolves
//! Supabase Storage signed URLs for cover/section/question/option images via
//! `createSignedUrl`. The backend has no storage-signing helper, so this port emits the
//! stored media (`storagePath` / `url` / `alt`) without re-signing. For question/option
//! images this already matches legacy behavior (`sanitizeFormMediaForStorage`); for the
//! cover image and section images the signed `url` is not regenerated.

use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const FORM_EXPORT_FORMAT_VERSION: &str = "1";
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

const WORKSPACE_FORMS_EXPORT_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACE_FORMS_EXPORT_PATH_SUFFIX: &str = "/export";
const WORKSPACE_FORMS_EXPORT_INFIX: &str = "/forms/";

pub(crate) async fn handle_workspaces_forms_export_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, raw_form_id) = workspace_forms_export_segments(request.path)?;

    Some(match request.method {
        "GET" => {
            workspace_forms_export_response(config, request, raw_ws_id, raw_form_id, outbound).await
        }
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn workspace_forms_export_response(
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

    build_export_response(&definition)
}

// ---------------------------------------------------------------------------
// Workspace id normalization / membership (mirrors workspace_habits_access.rs).
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

    // Slug/handle lookup. Try caller-scoped first, then service-role fallback.
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

// ---------------------------------------------------------------------------
// Form definition fetch (private schema).
// ---------------------------------------------------------------------------

struct FormDefinition {
    ws_id: Option<String>,
    form: Value,
    sections: Vec<Value>,
    questions: Vec<Value>,
    options: Vec<Value>,
    logic_rules: Vec<Value>,
    share_code: Option<String>,
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
    let logic_rules = private_get(
        contact_data,
        outbound,
        "form_logic_rules",
        &[
            ("select", "*".to_owned()),
            ("form_id", format!("eq.{form_id}")),
        ],
    )
    .await?;
    let share_rows = private_get(
        contact_data,
        outbound,
        "form_share_links",
        &[
            ("select", "code".to_owned()),
            ("form_id", format!("eq.{form_id}")),
            ("limit", "1".to_owned()),
        ],
    )
    .await?;
    let share_code = share_rows
        .into_iter()
        .next()
        .and_then(|row| row.get("code").and_then(Value::as_str).map(str::to_owned));

    // Options keyed by question id.
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

    Ok(Some(FormDefinition {
        ws_id,
        form,
        sections,
        questions,
        options,
        logic_rules,
        share_code,
    }))
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
// Envelope building (toStudioInput projection).
// ---------------------------------------------------------------------------

fn build_export_response(definition: &FormDefinition) -> BackendResponse {
    let form_value = build_studio_input(definition);
    let envelope = json!({
        "formatVersion": FORM_EXPORT_FORMAT_VERSION,
        "exportedAt": now_iso8601(),
        "form": form_value,
    });

    let body = serde_json::to_string_pretty(&envelope).unwrap_or_else(|_| envelope.to_string());

    let title = definition
        .form
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("form");
    let file_name = export_file_name(title);

    // Mirrors the legacy raw `NextResponse`: a pretty-printed JSON body with an
    // attachment Content-Disposition and no explicit cache-control header.
    BackendResponse {
        allow: None,
        body: Value::Null,
        body_empty: false,
        body_text: Some(body),
        cache_control: None,
        content_type: Some("application/json; charset=utf-8"),
        headers: vec![(
            "Content-Disposition",
            format!("attachment; filename=\"{file_name}\""),
        )],
        status: 200,
    }
}

/// Projects the fetched definition into the `FormStudioInput` shape produced by
/// `toStudioInput(definition)` then `ensureIdentifiers(...)`. DB rows always carry ids,
/// so the `ensureIdentifiers` UUID-fill is a no-op here and is intentionally omitted.
fn build_studio_input(definition: &FormDefinition) -> Value {
    let form = &definition.form;

    let theme = build_theme(form.get("theme"), &definition.sections);
    let settings = build_settings(form.get("settings"));

    let mut sections: Vec<(i64, Value)> = definition
        .sections
        .iter()
        .map(|section| {
            let position = section.get("position").and_then(Value::as_i64).unwrap_or(0);
            (position, build_section(section, definition))
        })
        .collect();
    sections.sort_by_key(|(position, _)| *position);
    let sections: Vec<Value> = sections.into_iter().map(|(_, value)| value).collect();

    let mut logic_rules: Vec<(i64, Value)> = definition
        .logic_rules
        .iter()
        .map(|rule| {
            let priority = rule.get("priority").and_then(Value::as_i64).unwrap_or(0);
            (priority, build_logic_rule(rule))
        })
        .collect();
    logic_rules.sort_by_key(|(priority, _)| *priority);
    let logic_rules: Vec<Value> = logic_rules.into_iter().map(|(_, value)| value).collect();

    json!({
        "title": form.get("title").cloned().unwrap_or(Value::Null),
        "description": string_or_default(form.get("description"), ""),
        "status": form.get("status").cloned().unwrap_or_else(|| json!("draft")),
        "accessMode": form.get("access_mode").cloned().unwrap_or_else(|| json!("anonymous")),
        "openAt": form.get("open_at").cloned().unwrap_or(Value::Null),
        "closeAt": form.get("close_at").cloned().unwrap_or(Value::Null),
        "maxResponses": form.get("max_responses").cloned().unwrap_or(Value::Null),
        "shareCode": definition.share_code.clone().map(Value::String).unwrap_or(Value::Null),
        "theme": theme,
        "settings": settings,
        "sections": sections,
        "logicRules": logic_rules,
    })
}

fn build_section(section: &Value, definition: &FormDefinition) -> Value {
    let section_id = section
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or_default();

    let mut questions: Vec<(i64, Value)> = definition
        .questions
        .iter()
        .filter(|question| question.get("section_id").and_then(Value::as_str) == Some(section_id))
        .map(|question| {
            let position = question
                .get("position")
                .and_then(Value::as_i64)
                .unwrap_or(0);
            (position, build_question(question, definition))
        })
        .collect();
    questions.sort_by_key(|(position, _)| *position);
    let questions: Vec<Value> = questions.into_iter().map(|(_, value)| value).collect();

    json!({
        "id": section.get("id").cloned().unwrap_or(Value::Null),
        "title": section.get("title").cloned().unwrap_or_else(|| json!("")),
        "description": string_or_default(section.get("description"), ""),
        "image": section_image(definition.form.get("theme"), section_id),
        "questions": questions,
    })
}

fn build_question(question: &Value, definition: &FormDefinition) -> Value {
    let question_id = question
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or_default();

    let mut options: Vec<(i64, Value)> = definition
        .options
        .iter()
        .filter(|option| option.get("question_id").and_then(Value::as_str) == Some(question_id))
        .map(|option| {
            let position = option.get("position").and_then(Value::as_i64).unwrap_or(0);
            (position, build_option(option))
        })
        .collect();
    options.sort_by_key(|(position, _)| *position);
    let options: Vec<Value> = options.into_iter().map(|(_, value)| value).collect();

    json!({
        "id": question.get("id").cloned().unwrap_or(Value::Null),
        "type": question.get("type").cloned().unwrap_or(Value::Null),
        "title": question.get("title").cloned().unwrap_or(Value::Null),
        "description": string_or_default(question.get("description"), ""),
        "required": question.get("required").and_then(Value::as_bool).unwrap_or(false),
        "image": sanitize_media(question.get("image")),
        "settings": question.get("settings").cloned().unwrap_or_else(|| json!({})),
        "options": options,
    })
}

fn build_option(option: &Value) -> Value {
    json!({
        "id": option.get("id").cloned().unwrap_or(Value::Null),
        "label": option.get("label").cloned().unwrap_or(Value::Null),
        "value": option.get("value").cloned().unwrap_or(Value::Null),
        "image": sanitize_media(option.get("image")),
    })
}

fn build_logic_rule(rule: &Value) -> Value {
    json!({
        "id": rule.get("id").cloned().unwrap_or(Value::Null),
        "triggerType": rule
            .get("trigger_type")
            .filter(|value| value.is_string())
            .cloned()
            .unwrap_or_else(|| json!("question")),
        "sourceSectionId": rule.get("source_section_id").cloned().unwrap_or(Value::Null),
        "sourceQuestionId": rule.get("source_question_id").cloned().unwrap_or(Value::Null),
        "operator": rule.get("operator").cloned().unwrap_or(Value::Null),
        "comparisonValue": string_or_default(rule.get("comparison_value"), ""),
        "actionType": rule.get("action_type").cloned().unwrap_or(Value::Null),
        "targetSectionId": rule.get("target_section_id").cloned().unwrap_or(Value::Null),
    })
}

// ---------------------------------------------------------------------------
// Theme / settings default-merge (mirrors zod `.default(...)` parsing).
// ---------------------------------------------------------------------------

fn build_theme(stored: Option<&Value>, _sections: &[Value]) -> Value {
    let stored = stored.and_then(Value::as_object);

    let typography_default = json!({
        "displaySize": "md",
        "headingSize": "md",
        "bodySize": "md",
    });
    let typography = match stored
        .and_then(|map| map.get("typography"))
        .and_then(Value::as_object)
    {
        Some(map) => json!({
            "displaySize": str_or(map.get("displaySize"), "md"),
            "headingSize": str_or(map.get("headingSize"), "md"),
            "bodySize": str_or(map.get("bodySize"), "md"),
        }),
        None => typography_default,
    };

    let section_images = stored
        .and_then(|map| map.get("sectionImages"))
        .and_then(Value::as_object)
        .map(|map| {
            let mut out = Map::new();
            for (key, value) in map {
                out.insert(key.clone(), sanitize_media(Some(value)));
            }
            Value::Object(out)
        })
        .unwrap_or_else(|| json!({}));

    json!({
        "presetId": str_or(stored.and_then(|m| m.get("presetId")), "editorial-moss"),
        "density": str_or(stored.and_then(|m| m.get("density")), "balanced"),
        "accentColor": str_or(stored.and_then(|m| m.get("accentColor")), "dynamic-green"),
        "headlineFontId": str_or(stored.and_then(|m| m.get("headlineFontId")), "noto-serif"),
        "bodyFontId": str_or(stored.and_then(|m| m.get("bodyFontId")), "be-vietnam-pro"),
        "surfaceStyle": str_or(stored.and_then(|m| m.get("surfaceStyle")), "paper"),
        "coverHeadline": str_or(stored.and_then(|m| m.get("coverHeadline")), ""),
        "coverImage": sanitize_media(stored.and_then(|m| m.get("coverImage"))),
        "sectionImages": section_images,
        "typography": typography,
    })
}

fn build_settings(stored: Option<&Value>) -> Value {
    let stored = stored.and_then(Value::as_object);

    json!({
        "showProgressBar": bool_or(stored.and_then(|m| m.get("showProgressBar")), true),
        "allowMultipleSubmissions": bool_or(stored.and_then(|m| m.get("allowMultipleSubmissions")), true),
        "oneResponsePerUser": bool_or(stored.and_then(|m| m.get("oneResponsePerUser")), false),
        "requireTurnstile": bool_or(stored.and_then(|m| m.get("requireTurnstile")), true),
        "confirmationTitle": str_or(stored.and_then(|m| m.get("confirmationTitle")), "Response received"),
        "confirmationMessage": str_or(
            stored.and_then(|m| m.get("confirmationMessage")),
            "Thanks for taking the time to respond.",
        ),
    })
}

/// Resolves a stored section image (theme.sectionImages[sectionId]) or the empty default.
fn section_image(theme: Option<&Value>, section_id: &str) -> Value {
    theme
        .and_then(Value::as_object)
        .and_then(|map| map.get("sectionImages"))
        .and_then(Value::as_object)
        .and_then(|map| map.get(section_id))
        .map(|value| sanitize_media(Some(value)))
        .unwrap_or_else(|| sanitize_media(None))
}

/// Mirrors `sanitizeFormMediaForStorage`: `{ storagePath, url, alt }` with url cleared
/// when a storagePath is present.
fn sanitize_media(media: Option<&Value>) -> Value {
    let media = media.and_then(Value::as_object);
    let storage_path = media
        .and_then(|m| m.get("storagePath"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let url = if storage_path.is_empty() {
        media
            .and_then(|m| m.get("url"))
            .and_then(Value::as_str)
            .unwrap_or("")
    } else {
        ""
    };
    let alt = media
        .and_then(|m| m.get("alt"))
        .and_then(Value::as_str)
        .unwrap_or("");

    json!({
        "storagePath": storage_path,
        "url": url,
        "alt": alt,
    })
}

// ---------------------------------------------------------------------------
// Small helpers.
// ---------------------------------------------------------------------------

fn str_or(value: Option<&Value>, default: &str) -> Value {
    Value::String(value.and_then(Value::as_str).unwrap_or(default).to_owned())
}

fn bool_or(value: Option<&Value>, default: bool) -> Value {
    Value::Bool(value.and_then(Value::as_bool).unwrap_or(default))
}

fn string_or_default(value: Option<&Value>, default: &str) -> Value {
    match value {
        Some(Value::String(text)) => Value::String(text.clone()),
        _ => Value::String(default.to_owned()),
    }
}

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

fn export_file_name(title: &str) -> String {
    let mut safe: String = title
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || c.is_whitespace() || *c == '_' || *c == '-')
        .collect();
    safe = safe.trim().to_owned();
    // Collapse whitespace runs to single hyphens.
    let mut collapsed = String::new();
    let mut in_ws = false;
    for c in safe.chars() {
        if c.is_whitespace() {
            if !in_ws {
                collapsed.push('-');
                in_ws = true;
            }
        } else {
            collapsed.push(c);
            in_ws = false;
        }
    }
    let truncated: String = collapsed.chars().take(40).collect();
    let base = if truncated.is_empty() {
        "form".to_owned()
    } else {
        truncated
    };
    format!("{base}-{}.json", today_date())
}

fn now_iso8601() -> String {
    format_iso8601(unix_millis())
}

fn today_date() -> String {
    now_iso8601().chars().take(10).collect()
}

fn unix_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

/// Formats milliseconds-since-epoch as an ISO-8601 UTC timestamp (`YYYY-MM-DDTHH:MM:SS.mmmZ`),
/// matching JavaScript's `new Date().toISOString()`.
fn format_iso8601(millis: u128) -> String {
    let total_secs = (millis / 1000) as i64;
    let millis_part = (millis % 1000) as u32;

    let days = total_secs.div_euclid(86_400);
    let secs_of_day = total_secs.rem_euclid(86_400);
    let hour = secs_of_day / 3600;
    let minute = (secs_of_day % 3600) / 60;
    let second = secs_of_day % 60;

    let (year, month, day) = civil_from_days(days);

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis_part:03}Z")
}

/// Converts days since the Unix epoch (1970-01-01) to a `(year, month, day)` tuple using
/// Howard Hinnant's civil-from-days algorithm.
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month_i64 = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month_i64 <= 2 { y + 1 } else { y };
    (year, month_i64 as u32, day)
}

// ---------------------------------------------------------------------------
// Path matching + UUID/handle validation.
// ---------------------------------------------------------------------------

/// Matches `/api/v1/workspaces/{wsId}/forms/{formId}/export` and returns
/// `(raw_ws_id, raw_form_id)`. Returns None when the path shape does not match.
fn workspace_forms_export_segments(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(WORKSPACE_FORMS_EXPORT_PATH_PREFIX)?;
    let rest = rest.strip_suffix(WORKSPACE_FORMS_EXPORT_PATH_SUFFIX)?;
    let (ws_id, form_id) = rest.split_once(WORKSPACE_FORMS_EXPORT_INFIX)?;

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
