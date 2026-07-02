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

mod analytics;
use analytics::*;
mod answer_format;
use answer_format::*;
mod db;
use db::*;
mod markdown;
use markdown::*;
mod path_params;
use path_params::*;
mod types;
use types::*;
mod workspace_auth;
use workspace_auth::*;

pub(super) const PRIVATE_SCHEMA: &str = "private";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const FORM_NOT_FOUND_MESSAGE: &str = "Form not found";
const INVALID_WORKSPACE_ID_MESSAGE: &str = "Invalid workspace ID";
const INVALID_FORM_ID_MESSAGE: &str = "Invalid form ID";
const INTERNAL_ERROR_MESSAGE: &str = "Internal server error";

pub(super) const INTERNAL_WORKSPACE_SLUG: &str = "internal";
pub(super) const PERSONAL_WORKSPACE_SLUG: &str = "personal";
pub(super) const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

pub(super) const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";
pub(super) const MANAGE_FORMS_PERMISSION: &str = "manage_forms";
pub(super) const VIEW_FORM_ANALYTICS_PERMISSION: &str = "view_form_analytics";

pub(super) const RESPONSES_PATH_PREFIX: &str = "/api/v1/workspaces/";
pub(super) const RESPONSES_PATH_SUFFIX: &str = "/responses";
pub(super) const FORMS_INFIX: &str = "/forms/";

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

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
