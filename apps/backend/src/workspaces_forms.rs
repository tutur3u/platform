//! Handler for `GET /api/v1/workspaces/:wsId/forms`.
//!
//! Ports the `GET` method of
//! `apps/web/src/app/api/v1/workspaces/[wsId]/forms/route.ts`.
//!
//! ONLY the `GET` method is migrated here. The legacy route also defines `POST`
//! (create/save a form definition), which is NOT migrated yet. For every method
//! other than `GET`, this handler returns `None` so the Cloudflare worker falls
//! through to the still-active Next.js route (it must NOT 405 the live `POST`).
//!
//! Behavior mirrored from the legacy `GET`:
//! - 401 `{ "error": "Unauthorized" }` when there is no authenticated Supabase user.
//! - 403 `{ "error": "Forbidden" }` when the caller is not a workspace MEMBER, or
//!   lacks BOTH `manage_forms` AND `view_form_analytics` permissions.
//! - 500 `{ "error": "<message>" }` for internal failures (mirrors the legacy
//!   catch-all; e.g. `Invalid workspace ID` when normalization yields a non-UUID).
//! - 200 `{ "items": [...] }` where each item is the `FormListItem` projection
//!   produced by `listForms`:
//!     `{ id, title, description, status, accessMode, responseCount, viewCount,
//!        completionRate, publishedAt, updatedAt, href }`.
//!
//! `href` mirrors the legacy `/${workspaceSlug}/forms/${form.id}`, where
//! `workspaceSlug` is the RAW `:wsId` path segment (e.g. `personal` / a handle),
//! NOT the resolved UUID.
//!
//! The forms tables live in the Supabase `private` schema, read via the
//! service-role key with the `Accept-Profile: private` header (mirrors
//! `getPrivateFormsClient`). Workspace id normalization + membership checks
//! mirror `workspaces_forms_export.rs` / `workspace_habits_access.rs`.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PRIVATE_SCHEMA: &str = "private";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const INVALID_WORKSPACE_ID_MESSAGE: &str = "Invalid workspace ID";
const INTERNAL_ERROR_MESSAGE: &str = "Internal server error";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";
const MANAGE_FORMS_PERMISSION: &str = "manage_forms";
const VIEW_FORM_ANALYTICS_PERMISSION: &str = "view_form_analytics";

const WORKSPACE_FORMS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACE_FORMS_PATH_SUFFIX: &str = "/forms";

pub(crate) async fn handle_workspaces_forms_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspace_forms_ws_id(request.path)?;

    // Only GET is migrated. Every other method (POST, etc.) must fall through to
    // the still-active Next.js route, so return None for them.
    match request.method {
        "GET" => Some(workspace_forms_response(config, request, raw_ws_id, outbound).await),
        _ => None,
    }
}

async fn workspace_forms_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
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

    // Query param `q` (optional title search). Empty/whitespace => no filter.
    let query = forms_query_from_url(request.url);

    match list_forms(
        contact_data,
        outbound,
        &resolved_ws_id,
        raw_ws_id,
        query.as_deref(),
    )
    .await
    {
        Ok(items) => no_store_response(json_response(200, json!({ "items": items }))),
        Err(()) => error_response(500, INTERNAL_ERROR_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// listForms projection (private schema).
// ---------------------------------------------------------------------------

async fn list_forms(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    workspace_slug: &str,
    query: Option<&str>,
) -> Result<Vec<Value>, ()> {
    let mut params = vec![
        ("select", "*".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "updated_at.desc".to_owned()),
    ];
    if let Some(search) = query {
        params.push(("title", format!("ilike.%{search}%")));
    }

    let forms = private_get(contact_data, outbound, "forms", &params).await?;

    let form_ids: Vec<String> = forms
        .iter()
        .filter_map(|form| form.get("id").and_then(Value::as_str).map(str::to_owned))
        .collect();

    if form_ids.is_empty() {
        return Ok(Vec::new());
    }

    let in_filter = format!("in.({})", form_ids.join(","));

    let sessions = private_get(
        contact_data,
        outbound,
        "form_sessions",
        &[
            ("select", "form_id, started_at, submitted_at".to_owned()),
            ("form_id", in_filter.clone()),
        ],
    )
    .await?;
    let responses = private_get(
        contact_data,
        outbound,
        "form_responses",
        &[("select", "form_id".to_owned()), ("form_id", in_filter)],
    )
    .await?;

    let items = forms
        .into_iter()
        .map(|form| {
            let form_id = form.get("id").and_then(Value::as_str).unwrap_or_default();

            let views = sessions
                .iter()
                .filter(|session| session.get("form_id").and_then(Value::as_str) == Some(form_id))
                .count();
            let response_count = responses
                .iter()
                .filter(|response| response.get("form_id").and_then(Value::as_str) == Some(form_id))
                .count();

            // Math.round((responses / views) * 100), 0 when views == 0.
            let completion_rate = if views == 0 {
                0
            } else {
                (((response_count as f64) / (views as f64)) * 100.0).round() as i64
            };

            json!({
                "id": form.get("id").cloned().unwrap_or(Value::Null),
                "title": form.get("title").cloned().unwrap_or(Value::Null),
                "description": form.get("description").cloned().unwrap_or(Value::Null),
                "status": form.get("status").cloned().unwrap_or(Value::Null),
                "accessMode": form.get("access_mode").cloned().unwrap_or(Value::Null),
                "responseCount": response_count,
                "viewCount": views,
                "completionRate": completion_rate,
                "publishedAt": form.get("published_at").cloned().unwrap_or(Value::Null),
                "updatedAt": form.get("updated_at").cloned().unwrap_or(Value::Null),
                "href": format!("/{workspace_slug}/forms/{form_id}"),
            })
        })
        .collect();

    Ok(items)
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

// ---------------------------------------------------------------------------
// Private-schema REST helpers.
// ---------------------------------------------------------------------------

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

/// Reads the optional `q` search query from the request URL. Returns `None`
/// when absent or empty/whitespace (mirrors `searchParams.get('q') ?? undefined`
/// followed by the `if (query)` truthiness check in `listForms`).
fn forms_query_from_url(request_url: Option<&str>) -> Option<String> {
    let url = request_url.and_then(|raw| url::Url::parse(raw).ok())?;
    for (key, value) in url.query_pairs() {
        if key.as_ref() == "q" {
            let normalized = value.trim().to_owned();
            if normalized.is_empty() {
                return None;
            }
            return Some(normalized);
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Path matching + UUID/handle validation.
// ---------------------------------------------------------------------------

/// Matches `/api/v1/workspaces/{wsId}/forms` exactly and returns the raw `wsId`.
/// Returns None when the path shape does not match (e.g. a sub-resource like
/// `/forms/{id}` or `/forms/{id}/export`).
fn workspace_forms_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACE_FORMS_PATH_PREFIX)?
        .strip_suffix(WORKSPACE_FORMS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
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
