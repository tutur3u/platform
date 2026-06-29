//! Handler for `GET /api/v1/workspaces/:wsId/task-templates`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/task-templates/route.ts`
//! (the listing path implemented by `_lib.ts::listTaskTemplates`).
//!
//! Legacy GET behavior:
//!   * `withSessionAuth(..., { allowAppSessionAuth: { targetApp: [CLI, 'tasks'] } })`
//!     resolves the caller from a Supabase session OR a CLI/`tasks` app-session
//!     token; an unresolved caller yields `401 { "error": "Unauthorized" }`.
//!   * `createTaskTemplatesRouteContext`:
//!       - `normalizeWorkspaceId(rawWsId, supabase)` resolves
//!         `internal`/`personal`/handle aliases to a workspace UUID; a thrown
//!         error (e.g. unresolved `personal`) is caught by the route and reported
//!         as `500 { "error": "Internal server error" }`.
//!       - `verifyWorkspaceMembershipType({ wsId, userId })` with the default
//!         `MEMBER` requirement:
//!           * membership lookup DB error -> `500 { "error": "Failed to verify workspace access" }`
//!           * not a `MEMBER`             -> `403 { "error": "Workspace access denied" }`
//!       - `getPermissions(...)`/`canManageWorkspaceTemplates` is computed but is
//!         only consumed by the POST/mutation paths, so it is irrelevant to GET
//!         and is intentionally not reproduced here.
//!   * `listTaskTemplates` reads `task_templates` with the admin (service-role)
//!     client, scoped by:
//!     `ws_id = <wsId>` AND `or(visibility.eq.workspace,created_by.eq.<userId>)`
//!     ordered by `created_at desc`, plus optional filters:
//!     - unless `?includeArchived=true`, `archived_at is null`;
//!     - `?visibility=private|workspace` (any other value ignored);
//!     - `?q=<term>` (trimmed, non-empty) adds a second
//!       `or(name.ilike,task_name.ilike,slug.ilike)` over `%`/`_`-escaped term.
//!       A read failure yields `500 { "error": "Failed to list task templates" }`.
//!   * Each row is serialized as the raw row with `assignee_ids`/`label_ids`/
//!     `project_ids` coerced to arrays plus `isOwner = created_by === <userId>`,
//!     wrapped as `{ "templates": [...] }` with status `200`.
//!
//! Only GET is migrated here; POST stays on the still-live Next.js route (this
//! handler returns `None` for every other method).
//!
//! BEHAVIOR GAP: the legacy route also accepts CLI/`tasks` app-session tokens.
//! Reproducing app-session identity resolution + the `tasks` JWT verification is
//! intentionally left on the Next.js route, so when the request carries an
//! app-session token this handler returns `None` and the legacy GET serves it
//! unchanged. The common authenticated path (Supabase cookie/bearer session) is
//! migrated here.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const TASK_TEMPLATES_PATH_PREFIX: &str = "/api/v1/workspaces/";
const TASK_TEMPLATES_PATH_SUFFIX: &str = "/task-templates";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const TASK_TEMPLATES_TABLE: &str = "task_templates";

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

enum DataAuth<'a> {
    AccessToken(&'a str),
    ServiceRole,
}

/// Parsed `listTaskTemplates` query parameters.
struct ListQuery {
    include_archived: bool,
    visibility: Option<String>,
    q: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_task_templates_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = task_templates_ws_id(request.path)?;

    // Owned method is GET only; every other method (POST, ...) falls through to
    // the still-live Next.js route.
    match request.method {
        "GET" => {}
        _ => return None,
    }

    // App-session callers (CLI / `tasks`) remain on the legacy Next.js GET, which
    // owns app-session identity resolution. Fall through for them.
    if contact::request_has_app_session_token(request) {
        return None;
    }

    Some(task_templates_response(config, request, raw_ws_id, outbound).await)
}

async fn task_templates_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        return internal_server_error_response();
    }

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return unauthorized_response();
    };
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return unauthorized_response();
    };
    let Some(user_id) = user.id.filter(|id| !id.trim().is_empty()) else {
        return unauthorized_response();
    };

    // `normalizeWorkspaceId` may throw (e.g. unresolved `personal`); the legacy
    // GET catches that and reports a generic 500.
    let ws_id = match normalize_workspace_id(
        contact_data,
        outbound,
        raw_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(Some(ws_id)) => ws_id,
        Ok(None) | Err(()) => return internal_server_error_response(),
    };

    match verify_member(contact_data, outbound, &ws_id, &user_id, &access_token).await {
        Ok(true) => {}
        Ok(false) => return access_denied_response(),
        Err(()) => return membership_lookup_failed_response(),
    }

    let query = parse_list_query(request.url);

    match fetch_task_templates(contact_data, outbound, &ws_id, &user_id, &query).await {
        Ok(rows) => no_store_response(json_response(200, json!({ "templates": rows }))),
        Err(()) => list_failed_response(),
    }
}

/// Mirrors `verifyWorkspaceMembershipType` with the default `requiredType =
/// 'MEMBER'`: the caller must have an exact `MEMBER` membership row. Returns
/// `Err(())` for an upstream lookup failure (legacy 500), `Ok(false)` for a
/// missing/mismatched membership (legacy 403), and `Ok(true)` otherwise.
async fn verify_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
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
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        &DataAuth::AccessToken(access_token),
    )
    .await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let membership_type =
        decode_first_row::<WorkspaceMembershipRow>(&response)?.and_then(|row| row.membership_type);

    Ok(membership_type.as_deref() == Some("MEMBER"))
}

/// Reads `task_templates` with the service-role client (mirroring the legacy
/// admin read), applies the visibility/ownership scope and optional filters, and
/// returns the serialized template rows so the response shape matches the legacy
/// route.
async fn fetch_task_templates(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    query: &ListQuery,
) -> Result<Value, ()> {
    let mut params: Vec<(&str, String)> = vec![
        ("select", "*".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        (
            "or",
            format!("(visibility.eq.workspace,created_by.eq.{user_id})"),
        ),
        ("order", "created_at.desc".to_owned()),
    ];

    if !query.include_archived {
        params.push(("archived_at", "is.null".to_owned()));
    }

    if let Some(visibility) = &query.visibility {
        params.push(("visibility", format!("eq.{visibility}")));
    }

    if let Some(q) = &query.q {
        let escaped = escape_ilike_term(q);
        params.push((
            "or",
            format!(
                "(name.ilike.%{escaped}%,task_name.ilike.%{escaped}%,slug.ilike.%{escaped}%)"
            ),
        ));
    }

    let Some(url) = contact_data.rest_url(TASK_TEMPLATES_TABLE, &params) else {
        return Err(());
    };
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        &DataAuth::ServiceRole,
    )
    .await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    Ok(serialize_task_templates(rows, user_id))
}

/// Mirrors `serializeTaskTemplate` for each row: coerces the id-array columns to
/// arrays (defaulting to `[]`) and adds `isOwner = created_by === userId`.
fn serialize_task_templates(rows: Vec<Value>, user_id: &str) -> Value {
    Value::Array(
        rows.into_iter()
            .map(|row| serialize_task_template(row, user_id))
            .collect(),
    )
}

fn serialize_task_template(row: Value, user_id: &str) -> Value {
    let mut object = match row {
        Value::Object(map) => map,
        // Non-object rows are not expected from PostgREST; pass them through
        // unchanged rather than panicking.
        other => return other,
    };

    for column in ["assignee_ids", "label_ids", "project_ids"] {
        let is_array = matches!(object.get(column), Some(Value::Array(_)));
        if !is_array {
            object.insert(column.to_owned(), Value::Array(Vec::new()));
        }
    }

    let is_owner = object
        .get("created_by")
        .and_then(Value::as_str)
        .is_some_and(|created_by| created_by == user_id);
    object.insert("isOwner".to_owned(), Value::Bool(is_owner));

    Value::Object(object)
}

/// Parses the listing query parameters from the request URL, mirroring
/// `listTaskTemplates`'s reading of `includeArchived`, `visibility`, and `q`.
fn parse_list_query(url: Option<&str>) -> ListQuery {
    let parsed = url.and_then(|url| url::Url::parse(url).ok());
    let Some(parsed) = parsed else {
        return ListQuery {
            include_archived: false,
            visibility: None,
            q: None,
        };
    };

    let mut include_archived = false;
    let mut visibility = None;
    let mut q = None;

    for (key, value) in parsed.query_pairs() {
        match key.as_ref() {
            "includeArchived" => include_archived = value == "true",
            "visibility" => {
                visibility = match value.as_ref() {
                    "private" | "workspace" => Some(value.into_owned()),
                    _ => None,
                };
            }
            "q" => {
                let trimmed = value.trim();
                q = if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.to_owned())
                };
            }
            _ => {}
        }
    }

    ListQuery {
        include_archived,
        visibility,
        q,
    }
}

/// Mirrors `q.replace(/[%_]/g, '\\$&')`: backslash-escapes the SQL `LIKE`
/// wildcards so the term is matched literally inside the `ilike` patterns.
fn escape_ilike_term(term: &str) -> String {
    let mut escaped = String::with_capacity(term.len());
    for character in term.chars() {
        if character == '%' || character == '_' {
            escaped.push('\\');
        }
        escaped.push(character);
    }
    escaped
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
    }

    if raw_ws_id.trim().eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG) {
        // Legacy throws when the personal workspace cannot be resolved; surface
        // that as `Ok(None)` so the caller maps it to the generic 500.
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(Some(resolved_ws_id));
        }

        if let Some(workspace_id) = workspace_id_by_handle(
            contact_data,
            outbound,
            &handle,
            &DataAuth::AccessToken(access_token),
        )
        .await?
        {
            return Ok(Some(workspace_id));
        }

        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, &DataAuth::ServiceRole).await?
        {
            return Ok(Some(workspace_id));
        }
    }

    Ok(Some(resolved_ws_id))
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
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
    let response = send_rest_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        &DataAuth::AccessToken(access_token),
    )
    .await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    auth: &DataAuth<'_>,
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
    let response =
        send_rest_request(contact_data, outbound, OutboundMethod::Get, &url, auth).await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    Ok(decode_first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}

async fn send_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
    auth: &DataAuth<'_>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = match auth {
        DataAuth::AccessToken(access_token) => format!("Bearer {access_token}"),
        DataAuth::ServiceRole => format!("Bearer {service_role_key}"),
    };

    outbound
        .send(
            OutboundRequest::new(method, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

fn decode_first_row<T: for<'de> Deserialize<'de>>(
    response: &OutboundResponse,
) -> Result<Option<T>, ()> {
    response
        .json::<Vec<T>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn is_direct_workspace_lookup_identifier(identifier: &str) -> bool {
    let normalized = identifier.trim().to_lowercase();

    normalized == PERSONAL_WORKSPACE_SLUG
        || normalized == ROOT_WORKSPACE_ID
        || normalized == INTERNAL_WORKSPACE_SLUG
        || is_workspace_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

fn is_workspace_uuid_literal(value: &str) -> bool {
    value.trim().len() == 36
        && value
            .trim()
            .chars()
            .enumerate()
            .all(|(index, value)| match index {
                8 | 13 | 18 | 23 => value == '-',
                _ => value.is_ascii_hexdigit(),
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

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn task_templates_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(TASK_TEMPLATES_PATH_PREFIX)?
        .strip_suffix(TASK_TEMPLATES_PATH_SUFFIX)?;

    // Reject empty and nested paths so this handler only claims the exact
    // `/api/v1/workspaces/{wsId}/task-templates` collection route.
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(401, json!({ "error": "Unauthorized" })))
}

fn access_denied_response() -> BackendResponse {
    no_store_response(json_response(
        403,
        json!({ "error": "Workspace access denied" }),
    ))
}

fn membership_lookup_failed_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "error": "Failed to verify workspace access" }),
    ))
}

fn list_failed_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "error": "Failed to list task templates" }),
    ))
}

fn internal_server_error_response() -> BackendResponse {
    no_store_response(json_response(500, json!({ "error": "Internal server error" })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn task_templates_ws_id_extracts_workspace_id() {
        assert_eq!(
            task_templates_ws_id("/api/v1/workspaces/abc-123/task-templates"),
            Some("abc-123")
        );
    }

    #[test]
    fn task_templates_ws_id_rejects_wrong_prefix() {
        // No `/v1` segment, or a different collection, must not match.
        assert_eq!(
            task_templates_ws_id("/api/workspaces/abc/task-templates"),
            None
        );
        assert_eq!(task_templates_ws_id("/api/v1/workspaces/abc/labels"), None);
    }

    #[test]
    fn task_templates_ws_id_rejects_nested_and_empty() {
        assert_eq!(task_templates_ws_id("/api/v1/workspaces//task-templates"), None);
        // A sub-resource (e.g. `[templateKey]`) is owned by other routes.
        assert_eq!(
            task_templates_ws_id("/api/v1/workspaces/abc/task-templates/some-key"),
            None
        );
    }

    #[test]
    fn parse_list_query_defaults_when_url_missing() {
        let query = parse_list_query(None);
        assert!(!query.include_archived);
        assert_eq!(query.visibility, None);
        assert_eq!(query.q, None);
    }

    #[test]
    fn parse_list_query_reads_supported_params() {
        let query = parse_list_query(Some(
            "https://x.test/api/v1/workspaces/ws/task-templates?includeArchived=true&visibility=workspace&q=%20hi%20",
        ));
        assert!(query.include_archived);
        assert_eq!(query.visibility.as_deref(), Some("workspace"));
        // `q` is trimmed before use.
        assert_eq!(query.q.as_deref(), Some("hi"));
    }

    #[test]
    fn parse_list_query_ignores_invalid_values() {
        let query = parse_list_query(Some(
            "https://x.test/p?includeArchived=1&visibility=secret&q=%20%20",
        ));
        // Only the literal string `true` enables archived inclusion.
        assert!(!query.include_archived);
        // Visibility outside the enum is dropped.
        assert_eq!(query.visibility, None);
        // A whitespace-only `q` collapses to `None`.
        assert_eq!(query.q, None);
    }

    #[test]
    fn escape_ilike_term_escapes_wildcards() {
        assert_eq!(escape_ilike_term("a%b_c"), "a\\%b\\_c");
        assert_eq!(escape_ilike_term("plain"), "plain");
    }

    #[test]
    fn serialize_task_template_adds_is_owner_and_normalizes_arrays() {
        let row = json!({
            "id": "t1",
            "created_by": "user-1",
            "assignee_ids": null,
            "label_ids": ["l1"],
            // `project_ids` missing entirely.
            "name": "Template",
        });

        let serialized = serialize_task_template(row, "user-1");
        assert_eq!(serialized["isOwner"], json!(true));
        assert_eq!(serialized["assignee_ids"], json!([]));
        assert_eq!(serialized["label_ids"], json!(["l1"]));
        assert_eq!(serialized["project_ids"], json!([]));
        // Untouched fields are preserved.
        assert_eq!(serialized["name"], json!("Template"));
    }

    #[test]
    fn serialize_task_template_marks_non_owner() {
        let row = json!({ "created_by": "someone-else" });
        let serialized = serialize_task_template(row, "user-1");
        assert_eq!(serialized["isOwner"], json!(false));
    }

    #[test]
    fn serialize_task_templates_wraps_each_row() {
        let rows = vec![
            json!({ "created_by": "user-1" }),
            json!({ "created_by": "user-2" }),
        ];
        let serialized = serialize_task_templates(rows, "user-1");
        let array = serialized.as_array().expect("array");
        assert_eq!(array.len(), 2);
        assert_eq!(array[0]["isOwner"], json!(true));
        assert_eq!(array[1]["isOwner"], json!(false));
    }

    #[test]
    fn resolve_workspace_id_maps_internal_slug_to_root() {
        assert_eq!(resolve_workspace_id("internal"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("INTERNAL"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("my-ws"), "my-ws");
    }

    #[test]
    fn response_builders_match_legacy_shapes() {
        let unauthorized = unauthorized_response();
        assert_eq!(unauthorized.status, 401);
        assert_eq!(unauthorized.body, json!({ "error": "Unauthorized" }));

        let denied = access_denied_response();
        assert_eq!(denied.status, 403);
        assert_eq!(denied.body, json!({ "error": "Workspace access denied" }));

        let lookup_failed = membership_lookup_failed_response();
        assert_eq!(lookup_failed.status, 500);
        assert_eq!(
            lookup_failed.body,
            json!({ "error": "Failed to verify workspace access" })
        );

        let list_failed = list_failed_response();
        assert_eq!(list_failed.status, 500);
        assert_eq!(
            list_failed.body,
            json!({ "error": "Failed to list task templates" })
        );

        let internal = internal_server_error_response();
        assert_eq!(internal.status, 500);
        assert_eq!(internal.body, json!({ "error": "Internal server error" }));
    }
}
