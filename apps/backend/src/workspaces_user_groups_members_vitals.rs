//! Handler for
//! `/api/v1/workspaces/:wsId/user-groups/:groupId/members/:userId/vitals`.
//!
//! Mirrors the legacy Next.js route
//! `apps/web/src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/members/[userId]/vitals/route.ts`.
//!
//! The legacy `GET` handler only requires `getPermissions({ wsId, request })` to
//! return non-null, i.e. an authenticated workspace member (ANY membership type)
//! whose workspace can be resolved. It does *not* require any specific
//! permission. When `getPermissions` returns `null`, the route responds with
//! `404 { "error": "Not found" }`.
//!
//! On success it queries `user_indicators` joined with `user_group_metrics!inner`
//! filtered by `user_id` (the path `:userId`) and
//! `user_group_metrics.group_id` (the path `:groupId`), then returns a flat array
//! of `{ id, name, unit, factor, is_weighted, value }`. The legacy query does not
//! constrain on the workspace itself; access control is entirely delegated to
//! `getPermissions`, so this handler mirrors that (service-role read scoped by
//! user + group only).

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

use serde::Deserialize;

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {}

/// Matches
/// `/api/v1/workspaces/:wsId/user-groups/:groupId/members/:userId/vitals`.
///
/// Returns `(raw_ws_id, group_id, user_id)` when the path shape matches.
fn vitals_segments(path: &str) -> Option<(&str, &str, &str)> {
    let segments = path_segments(path);

    if segments.len() == 9
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && !segments[3].is_empty()
        && segments[4] == "user-groups"
        && !segments[5].is_empty()
        && segments[6] == "members"
        && !segments[7].is_empty()
        && segments[8] == "vitals"
    {
        Some((segments[3], segments[5], segments[7]))
    } else {
        None
    }
}

fn path_segments(path: &str) -> Vec<&str> {
    path.trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect()
}

pub(crate) async fn handle_workspaces_user_groups_members_vitals_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, group_id, user_id) = vitals_segments(request.path)?;

    Some(match request.method {
        "GET" => vitals_response(config, request, raw_ws_id, group_id, user_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn vitals_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    group_id: &str,
    target_user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return error_fetching_response();
    }

    // Authenticate the caller, mirroring `getPermissions`. A missing or invalid
    // session resolves to `null` -> 404 `{ "error": "Not found" }`.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return not_found_response();
    };
    let Some(caller_user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return not_found_response();
    };

    // Resolve `personal`/`internal`/handle aliases to a concrete workspace id.
    let resolved_ws_id = match normalize_workspace_id(
        contact_data,
        outbound,
        raw_ws_id,
        &caller_user_id,
        &access_token,
    )
    .await
    {
        Ok(Some(ws_id)) => ws_id,
        // Resolution returned no workspace -> getPermissions null -> Not found.
        Ok(None) => return not_found_response(),
        // Lookup failure -> getPermissions returns null (try/catch) -> Not found.
        Err(()) => return not_found_response(),
    };

    // `getPermissions` requires ANY workspace membership row to exist. Missing
    // membership -> null -> Not found.
    match workspace_member_exists(
        contact_data,
        outbound,
        &resolved_ws_id,
        &caller_user_id,
        &access_token,
    )
    .await
    {
        Ok(true) => {}
        Ok(false) => return not_found_response(),
        // Membership lookup failure surfaces as null in getPermissions -> Not found.
        Err(()) => return not_found_response(),
    }

    match fetch_user_vitals(contact_data, outbound, group_id, target_user_id).await {
        Ok(vitals) => no_store_response(json_response(200, Value::Array(vitals))),
        Err(()) => error_fetching_response(),
    }
}

/// Queries `user_indicators` joined with `user_group_metrics!inner`, filtered by
/// the target `user_id` and `user_group_metrics.group_id`, and maps each row to
/// `{ id, name, unit, factor, is_weighted, value }`.
async fn fetch_user_vitals(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    group_id: &str,
    user_id: &str,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "user_indicators",
        &[
            (
                "select",
                "value,user_group_metrics!inner(id,name,unit,factor,is_weighted,group_id)"
                    .to_owned(),
            ),
            ("user_id", format!("eq.{user_id}")),
            ("user_group_metrics.group_id", format!("eq.{group_id}")),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;

    Ok(rows.iter().map(map_vital).collect())
}

/// Mirrors the legacy mapping that flattens the embedded `user_group_metrics`
/// relation (which PostgREST may return as an object or, because of the `!inner`
/// hint, a single-element array) into the vital shape. The top-level `value`
/// from `user_indicators` is preserved as `value`.
fn map_vital(row: &Value) -> Value {
    let metric = row.get("user_group_metrics");

    let metric_obj = match metric {
        Some(Value::Array(items)) => items.first(),
        other => other,
    };

    let field = |name: &str| -> Value {
        metric_obj
            .and_then(|value| value.get(name))
            .cloned()
            .unwrap_or(Value::Null)
    };

    let value = row.get("value").cloned().unwrap_or(Value::Null);

    json!({
        "id": field("id"),
        "name": field("name"),
        "unit": field("unit"),
        "factor": field("factor"),
        "is_weighted": field("is_weighted"),
        "value": value,
    })
}

/// Returns `true` when a `workspace_members` row exists for the user in the
/// workspace (ANY membership type), matching `verifyWorkspaceMembershipType`
/// with `requiredType: 'ANY'`.
async fn workspace_member_exists(
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
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(!response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .is_empty())
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

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(Some(resolved_ws_id));
        }

        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, access_token).await?
        {
            return Ok(Some(workspace_id));
        }
        if let Some(workspace_id) =
            workspace_id_by_handle_service_role(contact_data, outbound, &handle).await?
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
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    access_token: &str,
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
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn workspace_id_by_handle_service_role(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
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
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn send_caller_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

async fn send_service_role_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
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

fn not_found_response() -> BackendResponse {
    no_store_response(json_response(404, json!({ "error": "Not found" })))
}

fn error_fetching_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": "Error fetching user vitals" }),
    ))
}
