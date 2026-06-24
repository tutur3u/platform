use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const WORKSPACES_USERS_GROUPS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_USERS_GROUPS_PATH_SUFFIX: &str = "/users/groups";
const VIEW_USER_GROUPS_PERMISSION: &str = "view_user_groups";
const MANAGE_USERS_PERMISSION: &str = "manage_users";
const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const LIST_USER_GROUPS_RPC: &str = "list_workspace_user_groups_for_table";
const COUNT_USER_GROUPS_RPC: &str = "count_workspace_user_groups_for_table";
const ATTENDANCE_COUNT_MANAGERS_CONFIG_ID: &str = "ATTENDANCE_COUNT_MANAGERS";
const PRIVATE_SCHEMA: &str = "private";
const MAX_SEARCH_LENGTH: usize = 100;
const DEFAULT_PAGE_SIZE: i64 = 10;
const MAX_PAGE_SIZE: i64 = 200;
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

// ---------------------------------------------------------------------------
// Query model (mirrors the zod SearchParamsSchema in the legacy route).
// ---------------------------------------------------------------------------

struct GroupsQuery {
    include_archived: bool,
    q: Option<String>,
    ids: Option<String>,
    status: Option<String>,
    user_id: Option<String>,
    page: i64,
    page_size: i64,
}

enum QueryParseError {
    Invalid(Value),
}

#[derive(Serialize)]
struct HasWorkspacePermissionRequest<'a> {
    p_permission: &'a str,
    p_user_id: &'a str,
    p_ws_id: &'a str,
}

#[derive(Deserialize)]
struct GroupIdRow {
    group_id: Option<String>,
}

#[derive(Deserialize)]
struct VirtualUserRow {
    virtual_user_id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceConfigRow {
    value: Option<String>,
}

#[derive(Serialize)]
struct ListUserGroupsRpcRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    p_group_ids: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_search: Option<String>,
    p_status: String,
    p_ws_id: String,
    p_limit: i64,
    p_offset: i64,
}

#[derive(Serialize)]
struct CountUserGroupsRpcRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    p_group_ids: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_search: Option<String>,
    p_status: String,
    p_ws_id: String,
}

// Embedded manager row, mirroring fetchManagersForGroups in the legacy utils.
#[derive(Deserialize)]
struct ManagerGroupRow {
    group_id: Option<String>,
    #[serde(default)]
    user: ManagerUserEmbed,
}

// PostgREST returns embedded `!inner` single relation as an object (not array).
#[derive(Default, Deserialize)]
#[serde(untagged)]
enum ManagerUserEmbed {
    #[default]
    Missing,
    Single(Box<ManagerUserRow>),
    Many(Vec<ManagerUserRow>),
}

#[derive(Deserialize)]
struct ManagerUserRow {
    id: Option<String>,
    full_name: Option<String>,
    avatar_url: Option<String>,
    display_name: Option<String>,
    email: Option<String>,
    #[serde(default)]
    workspace_user_linked_users: LinkedUsersEmbed,
}

#[derive(Default, Deserialize)]
#[serde(untagged)]
enum LinkedUsersEmbed {
    #[default]
    Missing,
    Single(LinkedUserRow),
    Many(Vec<LinkedUserRow>),
}

#[derive(Deserialize)]
struct LinkedUserRow {
    platform_user_id: Option<String>,
}

#[derive(Clone, Serialize)]
struct ManagerOut {
    id: String,
    full_name: Option<String>,
    avatar_url: Option<String>,
    display_name: Option<String>,
    email: Option<String>,
    #[serde(rename = "hasLinkedPlatformUser")]
    has_linked_platform_user: bool,
}

pub(crate) async fn handle_workspaces_users_groups_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_users_groups_ws_id(request.path)?;

    Some(match request.method {
        "GET" => groups_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn groups_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !config.contact_data.configured() {
        return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE);
    }

    // Auth: require a Supabase access token and resolve the user id, mirroring
    // resolveSessionAuthContext (the dominant bearer-token path). App-session
    // cookies are accepted too via request_access_token_allowing_app_sessions.
    let Some(access_token) = supabase_auth::request_access_token_allowing_app_sessions(request)
    else {
        return message_response(401, "Unauthorized");
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, "Unauthorized");
    };

    // normalizeWorkspaceId(id, supabase)
    let ws_id = match normalize_workspace_id(
        &config.contact_data,
        outbound,
        raw_ws_id,
        &user_id,
        &access_token,
    )
    .await
    {
        Ok(ws_id) => ws_id,
        Err(()) => return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    };

    // getPermissions(...) → null means "not found" (not a workspace member);
    // withoutPermission('view_user_groups') is a 403. We model the membership
    // gate as the view_user_groups permission RPC: false means no access, which
    // the legacy route surfaces as 403 for present members. (See notes for the
    // 404-vs-403 nuance for non-members.)
    let can_view = match has_workspace_permission(
        &config.contact_data,
        outbound,
        &ws_id,
        VIEW_USER_GROUPS_PERMISSION,
        &user_id,
    )
    .await
    {
        Ok(value) => value,
        Err(()) => return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    };
    if !can_view {
        return message_response(403, "Unauthorized");
    }

    // Parse query params (zod SearchParamsSchema equivalent).
    let query = match parse_groups_query(request.url) {
        Ok(query) => query,
        Err(QueryParseError::Invalid(issues)) => {
            return json_value_response(
                400,
                json!({ "message": "Invalid query parameters", "issues": issues }),
            );
        }
    };

    let has_manage_users = match has_workspace_permission(
        &config.contact_data,
        outbound,
        &ws_id,
        MANAGE_USERS_PERMISSION,
        &user_id,
    )
    .await
    {
        Ok(value) => value,
        Err(()) => return message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    };

    let status = query.status.clone().unwrap_or_else(|| {
        if query.include_archived {
            "all".to_owned()
        } else {
            "active".to_owned()
        }
    });

    let requested_group_ids = normalize_list_param(query.ids.as_deref());
    let mut group_ids: Option<Vec<String>> = if requested_group_ids.is_empty() {
        None
    } else {
        Some(requested_group_ids.clone())
    };

    let mut accessible_group_ids: Option<Vec<String>> = None;

    if !has_manage_users {
        let accessible =
            match user_group_memberships_for_user(&config.contact_data, outbound, &ws_id, &user_id)
                .await
            {
                Ok(ids) => ids,
                Err(()) => return rate_limit_or_internal_error(),
            };
        if accessible.is_empty() {
            return json_value_response(200, json!({ "data": [], "count": 0 }));
        }
        accessible_group_ids = Some(accessible);
    }

    if requested_group_ids.is_empty()
        && let Some(filter_user_id) = query.user_id.as_deref()
    {
        let ids = match group_ids_for_user(&config.contact_data, outbound, filter_user_id).await {
            Ok(ids) => ids,
            Err(()) => return rate_limit_or_internal_error(),
        };
        if ids.is_empty() {
            return json_value_response(200, json!({ "data": [], "count": 0 }));
        }
        group_ids = Some(ids);
    }

    // Compute effective group id filter exactly like the table repository:
    // intersect requested ids with accessible ids; an empty intersection means
    // no rows are returned at all.
    let effective = effective_group_ids(group_ids.as_deref(), accessible_group_ids.as_deref());

    let search = query
        .q
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned);

    let (fetched_data, count) = match effective {
        EffectiveGroupIds::Empty => (Vec::new(), 0_i64),
        EffectiveGroupIds::Filter(ref ids) => {
            let list = match list_user_groups(
                &config.contact_data,
                outbound,
                &ws_id,
                &status,
                Some(ids.clone()),
                search.clone(),
                query.page,
                query.page_size,
            )
            .await
            {
                Ok(list) => list,
                Err(()) => return rate_limit_or_internal_error(),
            };
            let count = match count_user_groups(
                &config.contact_data,
                outbound,
                &ws_id,
                &status,
                Some(ids.clone()),
                search.clone(),
            )
            .await
            {
                Ok(count) => count,
                Err(()) => return rate_limit_or_internal_error(),
            };
            (list, count)
        }
        EffectiveGroupIds::All => {
            let list = match list_user_groups(
                &config.contact_data,
                outbound,
                &ws_id,
                &status,
                None,
                search.clone(),
                query.page,
                query.page_size,
            )
            .await
            {
                Ok(list) => list,
                Err(()) => return rate_limit_or_internal_error(),
            };
            let count = match count_user_groups(
                &config.contact_data,
                outbound,
                &ws_id,
                &status,
                None,
                search.clone(),
            )
            .await
            {
                Ok(count) => count,
                Err(()) => return rate_limit_or_internal_error(),
            };
            (list, count)
        }
    };

    let mut data = fetched_data;

    if !data.is_empty() {
        let group_id_list: Vec<String> = data
            .iter()
            .filter_map(|group| group.get("id").and_then(Value::as_str).map(str::to_owned))
            .collect();

        let managers_by_group =
            match fetch_managers_for_groups(&config.contact_data, outbound, &group_id_list).await {
                Ok(map) => map,
                // The legacy util swallows manager-fetch errors and returns {}.
                Err(()) => Vec::new(),
            };

        let count_managers_in_attendance =
            should_count_managers_in_attendance(&config.contact_data, outbound, &ws_id)
                .await
                .unwrap_or(true);

        data =
            apply_attendance_member_counts(data, &managers_by_group, count_managers_in_attendance);
    }

    json_value_response(200, json!({ "data": data, "count": count }))
}

// ---------------------------------------------------------------------------
// Supabase reads
// ---------------------------------------------------------------------------

// Mirrors normalizeWorkspaceId(id, supabase): resolves the `internal` slug and
// `personal` to a workspace id, and handle lookups via caller token first then
// service role. Copied from the workspace_habits_access reference (file-local
// to keep this module self-contained).
async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(resolved_ws_id);
        }

        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, Some(access_token)).await?
        {
            return Ok(workspace_id);
        }
        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, None).await?
        {
            return Ok(workspace_id);
        }
    }

    Ok(resolved_ws_id)
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
    let response = send_rest_get(contact_data, outbound, &url, Some(access_token), false).await?;
    if !is_success_status(response.status) {
        return Err(());
    }

    response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id)
        .ok_or(())
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
    let response = send_rest_get(contact_data, outbound, &url, access_token, false).await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn has_workspace_permission(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    permission: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let rpc_url = contact_data
        .rpc_url(HAS_WORKSPACE_PERMISSION_RPC)
        .ok_or(())?;
    let body = serde_json::to_string(&HasWorkspacePermissionRequest {
        p_permission: permission,
        p_user_id: user_id,
        p_ws_id: ws_id,
    })
    .map_err(|_| ())?;
    let response = send_service_role_post(contact_data, outbound, &rpc_url, &body, false).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<bool>().map_err(|_| ())
}

// Mirrors getUserGroupMembershipsForUser: union of the platform user and its
// linked virtual user across workspace_user_groups_users.
async fn user_group_memberships_for_user(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    platform_user_id: &str,
) -> Result<Vec<String>, ()> {
    let Some(linked_url) = contact_data.rest_url(
        "workspace_user_linked_users",
        &[
            ("select", "virtual_user_id".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("platform_user_id", format!("eq.{platform_user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let linked_response = send_service_role_get(contact_data, outbound, &linked_url, false).await?;
    if !is_success_status(linked_response.status) {
        return Err(());
    }
    let virtual_user_id = linked_response
        .json::<Vec<VirtualUserRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.virtual_user_id);

    let mut candidate_ids: Vec<String> = Vec::new();
    if let Some(virtual_user_id) = virtual_user_id
        && !virtual_user_id.trim().is_empty()
    {
        candidate_ids.push(virtual_user_id);
    }
    candidate_ids.push(platform_user_id.to_owned());

    let in_filter = format!("in.({})", candidate_ids.join(","));
    let Some(memberships_url) = contact_data.rest_url(
        "workspace_user_groups_users",
        &[("select", "group_id".to_owned()), ("user_id", in_filter)],
    ) else {
        return Err(());
    };
    let memberships_response =
        send_service_role_get(contact_data, outbound, &memberships_url, false).await?;
    if !is_success_status(memberships_response.status) {
        return Err(());
    }

    Ok(dedupe_group_ids(
        memberships_response
            .json::<Vec<GroupIdRow>>()
            .map_err(|_| ())?,
    ))
}

// Mirrors the sp.userId branch: groups the given user belongs to.
async fn group_ids_for_user(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_user_groups_users",
        &[
            ("select", "group_id".to_owned()),
            ("user_id", format!("eq.{user_id}")),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<GroupIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.group_id)
        .filter(|id| !id.is_empty())
        .collect())
}

#[allow(clippy::too_many_arguments)]
async fn list_user_groups(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    status: &str,
    group_ids: Option<Vec<String>>,
    search: Option<String>,
    page: i64,
    page_size: i64,
) -> Result<Vec<Value>, ()> {
    let valid_page = if page > 0 { page } else { 1 };
    let valid_page_size = page_size.clamp(1, MAX_PAGE_SIZE);
    let offset = (valid_page - 1) * valid_page_size;

    let rpc_url = contact_data.rpc_url(LIST_USER_GROUPS_RPC).ok_or(())?;
    let body = serde_json::to_string(&ListUserGroupsRpcRequest {
        p_group_ids: group_ids,
        p_search: search,
        p_status: status.to_owned(),
        p_ws_id: ws_id.to_owned(),
        p_limit: valid_page_size,
        p_offset: offset,
    })
    .map_err(|_| ())?;

    let response = send_service_role_post(contact_data, outbound, &rpc_url, &body, true).await?;
    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

async fn count_user_groups(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    status: &str,
    group_ids: Option<Vec<String>>,
    search: Option<String>,
) -> Result<i64, ()> {
    let rpc_url = contact_data.rpc_url(COUNT_USER_GROUPS_RPC).ok_or(())?;
    let body = serde_json::to_string(&CountUserGroupsRpcRequest {
        p_group_ids: group_ids,
        p_search: search,
        p_status: status.to_owned(),
        p_ws_id: ws_id.to_owned(),
    })
    .map_err(|_| ())?;

    let response = send_service_role_post(contact_data, outbound, &rpc_url, &body, true).await?;
    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<i64>().map_err(|_| ())
}

async fn fetch_managers_for_groups(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    group_ids: &[String],
) -> Result<Vec<ManagerGroupRow>, ()> {
    if group_ids.is_empty() {
        return Ok(Vec::new());
    }

    let select = "group_id,user:workspace_users!workspace_user_roles_users_user_id_fkey!inner(id,full_name,avatar_url,display_name,email,workspace_user_linked_users(platform_user_id))";
    let in_filter = format!("in.({})", group_ids.join(","));
    let Some(url) = contact_data.rest_url(
        "workspace_user_groups_users",
        &[
            ("select", select.to_owned()),
            ("group_id", in_filter),
            ("role", "eq.TEACHER".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<ManagerGroupRow>>().map_err(|_| ())
}

// Reads workspace_configs (ws_id, id, value) — the underlying source the
// getWorkspaceConfig internal-api endpoint serves. Default true.
async fn should_count_managers_in_attendance(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_configs",
        &[
            ("select", "value".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("id", format!("eq.{ATTENDANCE_COUNT_MANAGERS_CONFIG_ID}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success_status(response.status) {
        return Err(());
    }

    let value = response
        .json::<Vec<WorkspaceConfigRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.value);

    Ok(value.as_deref().map(|value| value.trim().to_lowercase()) != Some("false".to_owned()))
}

// ---------------------------------------------------------------------------
// Enrichment (applyAttendanceMemberCounts + manager mapping)
// ---------------------------------------------------------------------------

fn apply_attendance_member_counts(
    groups: Vec<Value>,
    managers_rows: &[ManagerGroupRow],
    count_managers_in_attendance: bool,
) -> Vec<Value> {
    let managers_by_group = build_managers_by_group(managers_rows);

    groups
        .into_iter()
        .map(|group| {
            let group_id = group
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned();
            let amount = group.get("amount").and_then(Value::as_i64).unwrap_or(0);
            let managers = managers_by_group
                .get(&group_id)
                .cloned()
                .unwrap_or_default();

            let attendance_amount = if count_managers_in_attendance {
                amount
            } else {
                (amount - managers.len() as i64).max(0)
            };

            let mut object: Map<String, Value> = match group {
                Value::Object(object) => object,
                other => {
                    let mut map = Map::new();
                    map.insert("value".to_owned(), other);
                    map
                }
            };
            object.insert("attendance_amount".to_owned(), json!(attendance_amount));
            object.insert(
                "managers".to_owned(),
                serde_json::to_value(&managers).unwrap_or(Value::Array(Vec::new())),
            );
            Value::Object(object)
        })
        .collect()
}

fn build_managers_by_group(
    rows: &[ManagerGroupRow],
) -> std::collections::HashMap<String, Vec<ManagerOut>> {
    let mut by_group: std::collections::HashMap<String, Vec<ManagerOut>> =
        std::collections::HashMap::new();

    for row in rows {
        let Some(group_id) = row.group_id.as_ref().filter(|id| !id.is_empty()) else {
            continue;
        };

        let users: Vec<&ManagerUserRow> = match &row.user {
            ManagerUserEmbed::Missing => Vec::new(),
            ManagerUserEmbed::Single(user) => vec![user.as_ref()],
            ManagerUserEmbed::Many(users) => users.iter().collect(),
        };

        let bucket = by_group.entry(group_id.clone()).or_default();
        for user in users {
            let Some(id) = user.id.as_ref().filter(|id| !id.is_empty()) else {
                continue;
            };

            let platform_user_id = match &user.workspace_user_linked_users {
                LinkedUsersEmbed::Missing => None,
                LinkedUsersEmbed::Single(linked) => linked.platform_user_id.clone(),
                LinkedUsersEmbed::Many(linked) => linked
                    .first()
                    .and_then(|entry| entry.platform_user_id.clone()),
            };

            bucket.push(ManagerOut {
                id: id.clone(),
                full_name: user.full_name.clone(),
                avatar_url: user.avatar_url.clone(),
                display_name: user.display_name.clone(),
                email: user.email.clone(),
                has_linked_platform_user: platform_user_id
                    .as_deref()
                    .is_some_and(|value| !value.is_empty()),
            });
        }
    }

    by_group
}

// ---------------------------------------------------------------------------
// Query parsing helpers
// ---------------------------------------------------------------------------

fn parse_groups_query(request_url: Option<&str>) -> Result<GroupsQuery, QueryParseError> {
    let url = request_url.and_then(|url| url::Url::parse(url).ok());

    let include_archived = match query_value(url.as_ref(), "includeArchived").as_deref() {
        Some("true") => true,
        Some("false") | None => false,
        Some(_) => {
            return Err(QueryParseError::Invalid(json!([{
                "path": ["includeArchived"],
                "message": "Invalid enum value",
            }])));
        }
    };

    let q = match optional_query_value(url.as_ref(), "q") {
        Some(value) if value.chars().count() > MAX_SEARCH_LENGTH => {
            return Err(QueryParseError::Invalid(json!([{
                "path": ["q"],
                "message": "String must contain at most 100 character(s)",
            }])));
        }
        other => other,
    };

    let status = match query_value(url.as_ref(), "status").as_deref() {
        Some("all") => Some("all".to_owned()),
        Some("active") => Some("active".to_owned()),
        Some("archived") => Some("archived".to_owned()),
        None => None,
        Some(_) => {
            return Err(QueryParseError::Invalid(json!([{
                "path": ["status"],
                "message": "Invalid enum value",
            }])));
        }
    };

    let user_id = match optional_query_value(url.as_ref(), "userId") {
        Some(value) if is_uuid_literal(&value) => Some(value),
        Some(_) => {
            return Err(QueryParseError::Invalid(json!([{
                "path": ["userId"],
                "message": "Invalid uuid",
            }])));
        }
        None => None,
    };

    let page = match parse_int_param(query_value(url.as_ref(), "page").as_deref(), 1) {
        Some(value) if value >= 1 => value,
        Some(_) => {
            return Err(QueryParseError::Invalid(json!([{
                "path": ["page"],
                "message": "Number must be greater than or equal to 1",
            }])));
        }
        None => {
            return Err(QueryParseError::Invalid(json!([{
                "path": ["page"],
                "message": "Expected number",
            }])));
        }
    };

    let page_size = match parse_int_param(
        query_value(url.as_ref(), "pageSize").as_deref(),
        DEFAULT_PAGE_SIZE,
    ) {
        Some(value) if (1..=MAX_PAGE_SIZE).contains(&value) => value,
        Some(_) => {
            return Err(QueryParseError::Invalid(json!([{
                "path": ["pageSize"],
                "message": "Number out of range",
            }])));
        }
        None => {
            return Err(QueryParseError::Invalid(json!([{
                "path": ["pageSize"],
                "message": "Expected number",
            }])));
        }
    };

    Ok(GroupsQuery {
        include_archived,
        q,
        ids: optional_query_value(url.as_ref(), "ids"),
        status,
        user_id,
        page,
        page_size,
    })
}

fn query_value(url: Option<&url::Url>, key: &str) -> Option<String> {
    url?.query_pairs()
        .find_map(|(name, value)| (name == key).then(|| value.into_owned()))
}

fn optional_query_value(url: Option<&url::Url>, key: &str) -> Option<String> {
    query_value(url, key).filter(|value| !value.is_empty())
}

// z.coerce.number().int() — returns None for non-numeric (parse failure).
fn parse_int_param(value: Option<&str>, fallback: i64) -> Option<i64> {
    match value {
        None => Some(fallback),
        Some(value) if value.trim().is_empty() => Some(0),
        Some(value) => value.trim().parse::<f64>().ok().map(|number| number as i64),
    }
}

fn normalize_list_param(value: Option<&str>) -> Vec<String> {
    let Some(value) = value else {
        return Vec::new();
    };

    value
        .split(',')
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .map(str::to_owned)
        .collect()
}

fn dedupe_group_ids(rows: Vec<GroupIdRow>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for row in rows {
        if let Some(group_id) = row.group_id.filter(|id| !id.is_empty())
            && seen.insert(group_id.clone())
        {
            out.push(group_id);
        }
    }
    out
}

enum EffectiveGroupIds {
    Empty,
    Filter(Vec<String>),
    All,
}

// Mirrors getEffectiveGroupIds in the table repository.
fn effective_group_ids(
    group_ids: Option<&[String]>,
    accessible_group_ids: Option<&[String]>,
) -> EffectiveGroupIds {
    let requested = group_ids.map(dedupe_str_slice);
    let accessible = accessible_group_ids.map(dedupe_str_slice);

    if matches!(&requested, Some(ids) if ids.is_empty())
        || matches!(&accessible, Some(ids) if ids.is_empty())
    {
        return EffectiveGroupIds::Empty;
    }

    match (requested, accessible) {
        (None, None) => EffectiveGroupIds::All,
        (Some(requested), None) => EffectiveGroupIds::Filter(requested),
        (None, Some(accessible)) => EffectiveGroupIds::Filter(accessible),
        (Some(requested), Some(accessible)) => {
            let accessible_set: std::collections::HashSet<&String> = accessible.iter().collect();
            let intersection: Vec<String> = requested
                .into_iter()
                .filter(|id| accessible_set.contains(id))
                .collect();
            if intersection.is_empty() {
                EffectiveGroupIds::Empty
            } else {
                EffectiveGroupIds::Filter(intersection)
            }
        }
    }
}

fn dedupe_str_slice(values: &[String]) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    values
        .iter()
        .filter(|value| !value.is_empty())
        .filter(|value| seen.insert((*value).clone()))
        .cloned()
        .collect()
}

fn is_uuid_literal(value: &str) -> bool {
    value.trim().len() == 36
        && value
            .trim()
            .chars()
            .enumerate()
            .all(|(index, ch)| match index {
                8 | 13 | 18 | 23 => ch == '-',
                _ => ch.is_ascii_hexdigit(),
            })
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
        || is_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
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
// Outbound helpers (service-role REST + RPC, optional private schema headers)
// ---------------------------------------------------------------------------

async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    private_schema: bool,
) -> Result<OutboundResponse, ()> {
    send_rest_get(contact_data, outbound, url, None, private_schema).await
}

// GET with the caller access token when provided, otherwise the service role.
async fn send_rest_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: Option<&str>,
    private_schema: bool,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = match access_token {
        Some(access_token) => format!("Bearer {access_token}"),
        None => format!("Bearer {service_role_key}"),
    };
    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if private_schema {
        request = request
            .with_header("Accept-Profile", PRIVATE_SCHEMA)
            .with_header("Content-Profile", PRIVATE_SCHEMA);
    }

    outbound.send(request).await.map_err(|_| ())
}

async fn send_service_role_post(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    body: &str,
    private_schema: bool,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let mut request = OutboundRequest::new(OutboundMethod::Post, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key)
        .with_header("Content-Type", APPLICATION_JSON)
        .with_body(body);

    if private_schema {
        request = request
            .with_header("Accept-Profile", PRIVATE_SCHEMA)
            .with_header("Content-Profile", PRIVATE_SCHEMA);
    }

    outbound.send(request).await.map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Path + response helpers
// ---------------------------------------------------------------------------

fn workspaces_users_groups_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_USERS_GROUPS_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_USERS_GROUPS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn json_value_response(status: u16, payload: Value) -> BackendResponse {
    no_store_response(json_response(status, payload))
}

fn rate_limit_or_internal_error() -> BackendResponse {
    // The legacy route maps PostgREST rate-limit errors to a 429 and all other
    // failures to a 500. Without the raw PostgREST error here we conservatively
    // surface the 500 path; rate-limit detection is left to the integrator.
    message_response(500, INTERNAL_SERVER_ERROR_MESSAGE)
}
