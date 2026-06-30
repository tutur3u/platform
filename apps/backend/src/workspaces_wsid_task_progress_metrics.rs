//! Handler for `GET /api/v1/workspaces/:wsId/task-progress/metrics`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/task-progress/metrics/route.ts`.
//!
//! ## Auth
//!
//! The legacy route verifies workspace **membership** (any membership type,
//! MEMBER or GUEST) using the caller's session token; it does **not** require
//! a named workspace permission. This handler reproduces that check by:
//!
//! - Extracting the caller's access token (session cookie or `Bearer` header,
//!   app-session tokens excluded).
//! - Fetching the Supabase auth user to validate the token.
//! - Querying `workspace_members` with the caller's own token (RLS active) to
//!   confirm membership.
//!
//! **Workspace-ID normalization gap:** the legacy route resolves slug-style
//! workspace identifiers (`personal`, `internal`, workspace handles) to their
//! canonical UUIDs via `normalizeWorkspaceId`. This handler passes the raw
//! `wsId` path segment through unchanged, so slug-based workspace IDs will
//! produce a `403 Workspace access denied` response instead of the correct
//! `200` with metrics.
//!
//! ## Default metrics seeding gap
//!
//! The legacy route calls `ensureDefaultTaskProgressMetrics` before the select
//! query, inserting four seed metrics (tasks / points / minutes / words) when
//! none yet exist for the workspace. This write-side bootstrapping is **not
//! reproduced** here. Workspaces that have never seeded via the legacy Next.js
//! path will observe an empty `metrics` list until the Next.js path runs at
//! least once.
//!
//! ## Schema availability
//!
//! The `task_progress_metrics` table is part of an optional database migration.
//! When the table is absent, PostgREST returns one of the error codes
//! `42P01`, `42703`, `PGRST204`, or `PGRST205`. This handler detects those
//! codes and returns a schema-unavailable envelope
//! (`200 OK`, `schemaAvailable: false`) matching the legacy behavior.
//!
//! ## Cache
//!
//! No-store, matching the Next.js API route default.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/task-progress/metrics";

const METRIC_SELECT: &str = "id,ws_id,name,unit_label,unit_kind,description,\
    aggregation,is_default,created_by,created_at,updated_at,archived_at";

const SCHEMA_UNAVAILABLE_MESSAGE: &str =
    "Task progress is not available until the latest database migration is applied.";

/// PostgREST / Postgres error codes indicating the `task_progress_metrics`
/// table or its columns do not yet exist.
const SCHEMA_UNAVAILABLE_CODES: &[&str] = &["42P01", "42703", "PGRST204", "PGRST205"];

/// Used only to detect the presence of a row; all fields are ignored.
#[derive(Deserialize)]
struct MembershipRow {}

/// Minimal PostgREST error envelope; only `code` is needed for schema checks.
#[derive(Deserialize)]
struct SupabaseErrorBody {
    code: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_task_progress_metrics_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = extract_ws_id(request.path)?;

    Some(match request.method {
        "GET" => get_metrics(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn get_metrics(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return error_response("Internal server error");
    }

    // Step 1 — Extract session access token (excludes app-session tokens).
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, "Unauthorized");
    };

    // Step 2 — Validate the token by fetching the Supabase auth user.
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return message_response(401, "Unauthorized");
    };
    let Some(user_id) = user.id.filter(|id| !id.trim().is_empty()) else {
        return message_response(401, "Unauthorized");
    };

    // NOTE: slug-based workspace IDs (personal, internal, handles) are NOT
    // resolved; see the module-level workspace-ID normalization gap.
    let ws_id = raw_ws_id;

    let service_role_key = match contact_data.service_role_key() {
        Some(key) => key,
        None => return error_response("Internal server error"),
    };

    // Step 3 — Verify workspace membership with the caller's own token
    // (RLS active; the user can see only their own workspace_members rows).
    let member_url = match contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) {
        Some(url) => url,
        None => return error_response("Failed to verify workspace membership"),
    };

    let user_bearer = format!("Bearer {access_token}");
    let member_response = match outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &member_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &user_bearer)
                .with_header("apikey", service_role_key),
        )
        .await
    {
        Ok(resp) => resp,
        Err(_) => return error_response("Failed to verify workspace membership"),
    };

    if !(200..300).contains(&member_response.status) {
        return error_response("Failed to verify workspace membership");
    }

    let members = match member_response.json::<Vec<MembershipRow>>() {
        Ok(rows) => rows,
        Err(_) => return error_response("Failed to verify workspace membership"),
    };

    if members.is_empty() {
        return message_response(403, "Workspace access denied");
    }

    // Step 4 — Fetch metrics with the service-role key (no RLS).
    fetch_metrics(contact_data, outbound, ws_id, service_role_key).await
}

async fn fetch_metrics(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    service_role_key: &str,
) -> BackendResponse {
    let url = match contact_data.rest_url(
        "task_progress_metrics",
        &[
            ("select", METRIC_SELECT.to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("archived_at", "is.null".to_owned()),
            ("order", "is_default.desc,created_at.asc".to_owned()),
        ],
    ) {
        Some(url) => url,
        None => return error_response("Internal server error"),
    };

    let service_bearer = format!("Bearer {service_role_key}");

    let response = match outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &service_bearer)
                .with_header("apikey", service_role_key),
        )
        .await
    {
        Ok(resp) => resp,
        Err(_) => return error_response("Failed to list task progress metrics"),
    };

    if !(200..300).contains(&response.status) {
        // Detect schema-unavailability before returning a generic error.
        let is_schema_issue = response
            .json::<SupabaseErrorBody>()
            .ok()
            .and_then(|e| e.code)
            .map(|code| SCHEMA_UNAVAILABLE_CODES.contains(&code.as_str()))
            .unwrap_or(false);

        return if is_schema_issue {
            schema_unavailable_response()
        } else {
            error_response("Failed to list task progress metrics")
        };
    }

    let metrics = match response.json::<Vec<Value>>() {
        Ok(rows) => rows,
        Err(_) => return error_response("Failed to list task progress metrics"),
    };

    no_store_response(json_response(
        200,
        json!({
            "ok": true,
            "schemaAvailable": true,
            "metrics": metrics,
        }),
    ))
}

fn schema_unavailable_response() -> BackendResponse {
    no_store_response(json_response(
        200,
        json!({
            "ok": false,
            "code": "schema_unavailable",
            "schemaAvailable": false,
            "message": SCHEMA_UNAVAILABLE_MESSAGE,
            "metrics": [],
        }),
    ))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response(message: &str) -> BackendResponse {
    message_response(500, message)
}

fn extract_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    const UUID_WS: &str = "11111111-1111-4111-8111-111111111111";

    fn valid_path(ws_id: &str) -> String {
        format!("{PATH_PREFIX}{ws_id}{PATH_SUFFIX}")
    }

    #[test]
    fn extract_ws_id_returns_uuid_segment() {
        assert_eq!(extract_ws_id(&valid_path(UUID_WS)), Some(UUID_WS));
    }

    #[test]
    fn extract_ws_id_rejects_empty_ws_id_segment() {
        // PATH_PREFIX directly followed by PATH_SUFFIX with no ws_id.
        let path = format!("{PATH_PREFIX}{PATH_SUFFIX}");
        assert!(extract_ws_id(&path).is_none());
    }

    #[test]
    fn extract_ws_id_rejects_nested_path_segments() {
        let path = format!("{PATH_PREFIX}a/b{PATH_SUFFIX}");
        assert!(extract_ws_id(&path).is_none());
    }

    #[test]
    fn extract_ws_id_rejects_unrelated_paths() {
        assert!(extract_ws_id("/api/v1/workspaces/abc/other/route").is_none());
        assert!(extract_ws_id("/api/v2/workspaces/abc/task-progress/metrics").is_none());
        assert!(extract_ws_id("/api/v1/workspaces/abc/task-progress/metrics/extra").is_none());
    }

    #[test]
    fn schema_unavailable_response_has_correct_envelope() {
        let resp = schema_unavailable_response();
        assert_eq!(resp.status, 200);
        assert_eq!(resp.body["ok"], false);
        assert_eq!(resp.body["schemaAvailable"], false);
        assert_eq!(resp.body["code"], "schema_unavailable");
        let arr = resp.body["metrics"]
            .as_array()
            .expect("metrics must be an array");
        assert!(arr.is_empty());
    }
}
