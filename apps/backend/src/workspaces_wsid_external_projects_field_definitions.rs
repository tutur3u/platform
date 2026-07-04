//! Handler for `GET /api/v1/workspaces/:wsId/external-projects/field-definitions`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/external-projects/field-definitions/route.ts`.
//!
//! Auth model (GET, `mode: 'read'`):
//!
//! - Caller must supply a Supabase user session (cookie or bearer token).
//!   App-session and app-coordination token flows are not supported here.
//! - The workspace must have an enabled external project binding backed by an
//!   active canonical project; `404` is returned when the binding is missing.
//! - Access is allowed when the workspace has the `manage_external_projects`
//!   or `publish_external_projects` permission, **or** the root workspace has
//!   `manage_external_projects` or `manage_workspace_roles`.
//!
//! Query parameters:
//!
//! - `collectionId`: optional; either `"global"` (maps to `IS NULL`) or a UUID
//!   string. Omitting the parameter applies no `collection_id` filter.
//! - `includeDisabled`: if `"true"`, disabled field definitions are included;
//!   otherwise only `is_enabled = true` rows are returned.
//!
//! On success the handler returns a bare JSON array of
//! `workspace_external_project_field_definitions` rows, ordered by
//! `sort_order ASC, created_at ASC`, using the service-role client (matching
//! the legacy admin-client read).
//!
//! Behavior gaps vs. legacy:
//!
//! - App-session (`ttr_app_*`) and app-coordination token auth paths are not
//!   implemented; only regular Supabase user sessions are accepted.
//! - Personal-workspace slug normalization uses a service-role read rather
//!   than the caller's RLS-visible view.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/external-projects/field-definitions";

const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";

const ENABLED_SECRET: &str = "EXTERNAL_PROJECT_ENABLED";
const CANONICAL_ID_SECRET: &str = "EXTERNAL_PROJECT_CANONICAL_ID";

const ADMIN_PERMISSION: &str = "admin";
const UNAVAILABLE_MESSAGE: &str = "External project studio unavailable for this workspace";
const FAILED_MESSAGE: &str = "Failed to list external project field definitions";

// ---------------------------------------------------------------------------
// Row models
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceRow {
    creator_id: Option<String>,
}

#[derive(Deserialize)]
struct PermissionRow {
    permission: Option<String>,
}

#[derive(Deserialize)]
struct BindingRow {
    canonical_project_id: Option<String>,
    is_enabled: Option<bool>,
}

#[derive(Deserialize)]
struct SecretRow {
    name: Option<String>,
    value: Option<String>,
}

#[derive(Deserialize)]
struct CanonicalProjectRow {
    is_active: Option<bool>,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_external_projects_field_definitions_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = extract_ws_id(request.path)?;

    Some(match request.method {
        "GET" => field_definitions_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET response
// ---------------------------------------------------------------------------

async fn field_definitions_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return error_response(500, FAILED_MESSAGE);
    }

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, "Unauthorized");
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, "Unauthorized");
    };

    let ws_id =
        match normalize_ws_id(contact_data, outbound, raw_ws_id, &user_id, &access_token).await {
            Ok(ws_id) => ws_id,
            Err(()) => return error_response(401, "Unauthorized"),
        };

    let (canonical_id, enabled) = match read_binding_state(contact_data, outbound, &ws_id).await {
        Ok(state) => state,
        Err(()) => return error_response(500, FAILED_MESSAGE),
    };

    let canonical_active = match canonical_id.as_deref() {
        Some(id) => match canonical_project_active(contact_data, outbound, id).await {
            Ok(active) => active,
            Err(()) => return error_response(500, FAILED_MESSAGE),
        },
        None => false,
    };

    if !enabled || canonical_id.is_none() || !canonical_active {
        return error_response(404, UNAVAILABLE_MESSAGE);
    }

    let ws_perms = match effective_permissions(
        contact_data,
        outbound,
        &ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(p) => p,
        Err(()) => return error_response(500, FAILED_MESSAGE),
    };

    let allowed = if perms_allow(
        &ws_perms,
        &["manage_external_projects", "publish_external_projects"],
    ) {
        true
    } else {
        let root_perms = match effective_permissions(
            contact_data,
            outbound,
            ROOT_WORKSPACE_ID,
            &user_id,
            &access_token,
        )
        .await
        {
            Ok(p) => p,
            Err(()) => return error_response(500, FAILED_MESSAGE),
        };
        perms_allow(
            &root_perms,
            &["manage_external_projects", "manage_workspace_roles"],
        )
    };

    if !allowed {
        return error_response(403, "Forbidden");
    }

    let collection_id_param = query_param(request.url, "collectionId");
    let collection_filter = match parse_collection_filter(collection_id_param.as_deref()) {
        Ok(filter) => filter,
        Err(()) => {
            return json_response(
                400,
                json!({ "error": "Invalid collectionId query parameter" }),
            );
        }
    };
    let include_disabled = query_param(request.url, "includeDisabled").as_deref() == Some("true");

    match fetch_field_definitions(
        contact_data,
        outbound,
        &ws_id,
        collection_filter,
        include_disabled,
    )
    .await
    {
        Ok(rows) => json_response(200, rows),
        Err(()) => error_response(500, FAILED_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// Collection ID filter
// ---------------------------------------------------------------------------

enum CollectionFilter {
    None,
    IsNull,
    Eq(String),
}

fn parse_collection_filter(value: Option<&str>) -> Result<CollectionFilter, ()> {
    match value {
        None => Ok(CollectionFilter::None),
        Some("global") => Ok(CollectionFilter::IsNull),
        Some(uuid) if is_uuid(uuid) => Ok(CollectionFilter::Eq(uuid.to_owned())),
        Some(_) => Err(()),
    }
}

fn is_uuid(value: &str) -> bool {
    value.trim().len() == 36
        && value.trim().chars().enumerate().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        })
}

// ---------------------------------------------------------------------------
// Field definitions fetch (service-role, mirroring the legacy admin client)
// ---------------------------------------------------------------------------

async fn fetch_field_definitions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    collection_filter: CollectionFilter,
    include_disabled: bool,
) -> Result<Value, ()> {
    let mut params: Vec<(&str, String)> = vec![
        ("select", "*".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "sort_order.asc,created_at.asc".to_owned()),
    ];

    match &collection_filter {
        CollectionFilter::None => {}
        CollectionFilter::IsNull => params.push(("collection_id", "is.null".to_owned())),
        CollectionFilter::Eq(uuid) => params.push(("collection_id", format!("eq.{uuid}"))),
    }

    if !include_disabled {
        params.push(("is_enabled", "eq.true".to_owned()));
    }

    let url = contact_data
        .rest_url("workspace_external_project_field_definitions", &params)
        .ok_or(())?;
    let response = send_service_role(contact_data, outbound, &url).await?;
    if !is_ok(response.status) {
        return Err(());
    }
    response.json::<Value>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Auth helpers (mirrors workspace_external_projects_summary.rs)
// ---------------------------------------------------------------------------

async fn normalize_ws_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let resolved = resolve_ws_id(raw_ws_id);
    if resolved == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }
    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_ws_id(contact_data, outbound, user_id, access_token).await;
    }
    if !is_uuid(&resolved) {
        let handle = raw_ws_id.trim().to_lowercase();
        if is_handle_candidate(&handle)
            && let Some(id) = ws_id_by_handle(contact_data, outbound, &handle).await?
        {
            return Ok(id);
        }
    }
    Ok(resolved)
}

fn resolve_ws_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn is_handle_candidate(value: &str) -> bool {
    let len = value.len();
    if len == 0 || len > 64 {
        return false;
    }
    value.chars().enumerate().all(|(i, c)| {
        let edge = i == 0 || i + 1 == len;
        c.is_ascii_lowercase() || c.is_ascii_digit() || (!edge && matches!(c, '_' | '-'))
    })
}

async fn personal_ws_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let url = contact_data
        .rest_url(
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
        )
        .ok_or(())?;
    let response = send_caller(contact_data, outbound, &url, access_token).await?;
    if !is_ok(response.status) {
        return Err(());
    }
    first_row::<WorkspaceIdRow>(&response)?
        .and_then(|row| row.id)
        .ok_or(())
}

async fn ws_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
) -> Result<Option<String>, ()> {
    let url = contact_data
        .rest_url(
            "workspaces",
            &[
                ("select", "id".to_owned()),
                ("handle", format!("eq.{handle}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role(contact_data, outbound, &url).await?;
    if !is_ok(response.status) {
        return Ok(None);
    }
    Ok(first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}

async fn read_binding_state(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<(Option<String>, bool), ()> {
    if let Some(url) = contact_data.rest_url(
        "workspace_external_project_bindings",
        &[
            ("select", "canonical_project_id,is_enabled".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) && let Ok(response) = send_service_role(contact_data, outbound, &url).await
        && is_ok(response.status)
        && let Ok(Some(row)) = first_row::<BindingRow>(&response)
    {
        return Ok((row.canonical_project_id, row.is_enabled == Some(true)));
    }

    let url = contact_data
        .rest_url(
            "workspace_secrets",
            &[
                ("select", "name,value".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                (
                    "name",
                    format!("in.({ENABLED_SECRET},{CANONICAL_ID_SECRET})"),
                ),
            ],
        )
        .ok_or(())?;
    let response = send_service_role(contact_data, outbound, &url).await?;
    if !is_ok(response.status) {
        return Err(());
    }
    let rows = response.json::<Vec<SecretRow>>().map_err(|_| ())?;
    let canonical_id = rows
        .iter()
        .find(|row| row.name.as_deref() == Some(CANONICAL_ID_SECRET))
        .and_then(|row| row.value.clone());
    let enabled = rows.iter().any(|row| {
        row.name.as_deref() == Some(ENABLED_SECRET) && row.value.as_deref() == Some("true")
    });
    Ok((canonical_id, enabled))
}

async fn canonical_project_active(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    canonical_id: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            "canonical_external_projects",
            &[
                ("select", "is_active".to_owned()),
                ("id", format!("eq.{canonical_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role(contact_data, outbound, &url).await?;
    if !is_ok(response.status) {
        return Err(());
    }
    Ok(first_row::<CanonicalProjectRow>(&response)?
        .and_then(|row| row.is_active)
        .unwrap_or(false))
}

struct Permissions {
    has_all: bool,
    list: Vec<String>,
}

fn perms_allow(perms: &Permissions, wanted: &[&str]) -> bool {
    perms.has_all || wanted.iter().any(|w| perms.list.iter().any(|p| p == w))
}

async fn effective_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Permissions, ()> {
    let membership_type = ws_membership_type(contact_data, outbound, ws_id, user_id, access_token)
        .await?
        .unwrap_or_default();

    if membership_type.is_empty() {
        return Ok(Permissions {
            has_all: false,
            list: Vec::new(),
        });
    }

    let ws_row_data = ws_row(contact_data, outbound, ws_id).await?;
    let is_creator = membership_type == "MEMBER"
        && ws_row_data.as_ref().and_then(|r| r.creator_id.as_deref()) == Some(user_id);

    let role_perms = if membership_type == "MEMBER" {
        ws_role_permissions(contact_data, outbound, ws_id, user_id).await?
    } else {
        Vec::new()
    };
    let default_perms =
        ws_default_permissions(contact_data, outbound, ws_id, &membership_type).await?;

    let mut list = Vec::new();
    extend_unique(&mut list, role_perms);
    extend_unique(&mut list, default_perms);

    Ok(Permissions {
        has_all: is_creator || list.iter().any(|p| p == ADMIN_PERMISSION),
        list,
    })
}

async fn ws_membership_type(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_members",
            &[
                ("select", "type".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("user_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_caller(contact_data, outbound, &url, access_token).await?;
    if !is_ok(response.status) {
        return Ok(None);
    }
    Ok(first_row::<WorkspaceMembershipRow>(&response)?
        .map(|row| row.membership_type.unwrap_or_else(|| "MEMBER".to_owned())))
}

async fn ws_row(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Option<WorkspaceRow>, ()> {
    let url = contact_data
        .rest_url(
            "workspaces",
            &[
                ("select", "creator_id".to_owned()),
                ("id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role(contact_data, outbound, &url).await?;
    if !is_ok(response.status) {
        return Ok(None);
    }
    first_row::<WorkspaceRow>(&response)
}

async fn ws_role_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Vec<String>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_role_members",
            &[
                (
                    "select",
                    "workspace_roles!inner(workspace_role_permissions(permission))".to_owned(),
                ),
                ("user_id", format!("eq.{user_id}")),
                ("workspace_roles.ws_id", format!("eq.{ws_id}")),
                (
                    "workspace_roles.workspace_role_permissions.enabled",
                    "eq.true".to_owned(),
                ),
            ],
        )
        .ok_or(())?;
    let response = send_service_role(contact_data, outbound, &url).await?;
    if !is_ok(response.status) {
        return Ok(Vec::new());
    }
    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    let mut perms = Vec::new();
    for row in &rows {
        collect_permissions(row, &mut perms);
    }
    Ok(perms)
}

async fn ws_default_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    membership_type: &str,
) -> Result<Vec<String>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_default_permissions",
            &[
                ("select", "permission".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("member_type", format!("eq.{membership_type}")),
                ("enabled", "eq.true".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role(contact_data, outbound, &url).await?;
    if !is_ok(response.status) {
        return Ok(Vec::new());
    }
    Ok(response
        .json::<Vec<PermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
}

fn collect_permissions(value: &Value, perms: &mut Vec<String>) {
    match value {
        Value::Array(items) => items
            .iter()
            .for_each(|item| collect_permissions(item, perms)),
        Value::Object(map) => {
            if let Some(p) = map.get("permission").and_then(Value::as_str) {
                perms.push(p.to_owned());
            }
            for key in &["workspace_role_permissions", "workspace_roles"] {
                if let Some(nested) = map.get(*key) {
                    collect_permissions(nested, perms);
                }
            }
        }
        _ => {}
    }
}

fn extend_unique(list: &mut Vec<String>, values: Vec<String>) {
    for value in values {
        if !list.iter().any(|p| p == &value) {
            list.push(value);
        }
    }
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async fn send_service_role(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let key = contact_data.service_role_key().ok_or(())?;
    let auth = format!("Bearer {key}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &auth)
                .with_header("apikey", key),
        )
        .await
        .map_err(|_| ())
}

async fn send_caller(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let key = contact_data.service_role_key().ok_or(())?;
    let auth = format!("Bearer {access_token}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &auth)
                .with_header("apikey", key),
        )
        .await
        .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

fn first_row<T: for<'de> Deserialize<'de>>(response: &OutboundResponse) -> Result<Option<T>, ()> {
    response
        .json::<Vec<T>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

fn is_ok(status: u16) -> bool {
    (200..300).contains(&status)
}

fn query_param(url: Option<&str>, key: &str) -> Option<String> {
    let url = url?;
    let query = url.split_once('?').map(|(_, q)| q).unwrap_or("");
    for pair in query.split('&') {
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        if k == key {
            let decoded = url::form_urlencoded::parse(format!("{k}={v}").as_bytes())
                .next()
                .map(|(_, val)| val.into_owned())
                .unwrap_or_default();
            if !decoded.is_empty() {
                return Some(decoded);
            }
        }
    }
    None
}

fn extract_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    json_response(status, json!({ "error": message }))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_ws_id_valid_uuid() {
        let ws_id = "550e8400-e29b-41d4-a716-446655440000";
        let path = format!("/api/v1/workspaces/{ws_id}/external-projects/field-definitions");
        assert_eq!(extract_ws_id(&path), Some(ws_id));
    }

    #[test]
    fn extract_ws_id_wrong_prefix() {
        assert_eq!(
            extract_ws_id("/api/v2/workspaces/abc/external-projects/field-definitions"),
            None
        );
    }

    #[test]
    fn extract_ws_id_wrong_suffix() {
        assert_eq!(
            extract_ws_id("/api/v1/workspaces/abc/external-projects/collections"),
            None
        );
    }

    #[test]
    fn extract_ws_id_extra_segment() {
        assert_eq!(
            extract_ws_id("/api/v1/workspaces/abc/extra/external-projects/field-definitions"),
            None
        );
    }

    #[test]
    fn extract_ws_id_empty_segment() {
        assert_eq!(
            extract_ws_id("/api/v1/workspaces//external-projects/field-definitions"),
            None
        );
    }

    #[test]
    fn is_uuid_valid() {
        assert!(is_uuid("550e8400-e29b-41d4-a716-446655440000"));
        assert!(is_uuid("00000000-0000-0000-0000-000000000000"));
    }

    #[test]
    fn is_uuid_invalid() {
        assert!(!is_uuid("global"));
        assert!(!is_uuid("not-a-uuid-string-here"));
        assert!(!is_uuid("550e8400e29b41d4a716446655440000"));
    }

    #[test]
    fn collection_filter_none() {
        assert!(matches!(
            parse_collection_filter(None),
            Ok(CollectionFilter::None)
        ));
    }

    #[test]
    fn collection_filter_global() {
        assert!(matches!(
            parse_collection_filter(Some("global")),
            Ok(CollectionFilter::IsNull)
        ));
    }

    #[test]
    fn collection_filter_uuid() {
        let uuid = "550e8400-e29b-41d4-a716-446655440000";
        assert!(matches!(
            parse_collection_filter(Some(uuid)),
            Ok(CollectionFilter::Eq(_))
        ));
    }

    #[test]
    fn collection_filter_invalid() {
        assert!(parse_collection_filter(Some("not-a-valid-id")).is_err());
        assert!(parse_collection_filter(Some("some random string")).is_err());
    }

    #[test]
    fn query_param_present() {
        let url = "https://example.com/path?collectionId=global&includeDisabled=true";
        assert_eq!(
            query_param(Some(url), "collectionId"),
            Some("global".to_owned())
        );
        assert_eq!(
            query_param(Some(url), "includeDisabled"),
            Some("true".to_owned())
        );
    }

    #[test]
    fn query_param_absent() {
        let url = "https://example.com/path?collectionId=global";
        assert_eq!(query_param(Some(url), "includeDisabled"), None);
    }

    #[test]
    fn query_param_no_url() {
        assert_eq!(query_param(None, "collectionId"), None);
    }

    #[test]
    fn query_param_no_query_string() {
        assert_eq!(
            query_param(Some("https://example.com/path"), "collectionId"),
            None
        );
    }
}
