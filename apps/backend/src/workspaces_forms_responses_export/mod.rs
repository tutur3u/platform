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

mod answer_format;
use answer_format::*;
mod export;
use export::*;
mod form_db;
use form_db::*;
mod markdown;
use markdown::*;
mod models;
use models::*;
mod path;
use path::*;
mod workspace;
use workspace::*;

pub(super) const PRIVATE_SCHEMA: &str = "private";

pub(super) const INTERNAL_WORKSPACE_SLUG: &str = "internal";
pub(super) const PERSONAL_WORKSPACE_SLUG: &str = "personal";
pub(super) const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

pub(super) const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";
pub(super) const MANAGE_FORMS_PERMISSION: &str = "manage_forms";
pub(super) const VIEW_FORM_ANALYTICS_PERMISSION: &str = "view_form_analytics";

pub(super) const RESPONSE_PAGE_RPC: &str = "get_form_response_page";
pub(super) const MATCHED_RESPONSE_IDS_RPC: &str = "get_form_matched_response_ids";

pub(super) const EXPORT_PAGE_SIZE: i64 = 5000;
pub(super) const CHUNK_SIZE: usize = 500;

pub(super) const ANSWERABLE_TYPES: &[&str] = &[
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

pub(super) const WORKSPACE_RESPONSES_EXPORT_PATH_PREFIX: &str = "/api/v1/workspaces/";
pub(super) const WORKSPACE_RESPONSES_EXPORT_PATH_SUFFIX: &str = "/responses/export";
pub(super) const WORKSPACE_RESPONSES_EXPORT_INFIX: &str = "/forms/";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const FORM_NOT_FOUND_MESSAGE: &str = "Form not found";
const INVALID_WORKSPACE_ID_MESSAGE: &str = "Invalid workspace ID";
const INVALID_FORM_ID_MESSAGE: &str = "Invalid form ID";
const INTERNAL_ERROR_MESSAGE: &str = "Internal server error";
const XLSX_UNSUPPORTED_MESSAGE: &str = "XLSX export is not supported by this backend";

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
