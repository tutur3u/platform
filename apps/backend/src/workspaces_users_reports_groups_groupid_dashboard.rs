//! Handler for
//! `/api/v1/workspaces/:wsId/users/reports/groups/:groupId/dashboard`.
//!
//! Mirrors the legacy Next.js route
//! `apps/web/src/app/api/v1/workspaces/[wsId]/users/reports/groups/[groupId]/dashboard/route.ts`.
//!
//! The legacy `GET` handler:
//!   1. Parses optional `reportId` / `userId` query params (each capped at
//!      `MAX_SHORT_TEXT_LENGTH` = 256). Anything longer → 400 INVALID_QUERY.
//!   2. Runs `getPermissions({ wsId, request })`. `null` → 404 WORKSPACE_NOT_FOUND.
//!   3. Requires `view_user_groups_reports` → otherwise 403 PERMISSION_DENIED.
//!   4. If the caller lacks `manage_users`, restricts access to groups the
//!      caller belongs to (via `getUserGroupMemberships`) → otherwise 403
//!      GROUP_FORBIDDEN.
//!   5. Fetches (in parallel) the group, the group's workspace users (RPC
//!      `get_workspace_users`), the group managers, the per-user report status
//!      summary (RPC `get_user_report_status_summary`), the user's reports +
//!      selected report detail (private view), and the user's group metrics.
//!   6. On any query error → 500 FETCH_FAILED. Missing group → 404
//!      GROUP_NOT_FOUND.
//!   7. Returns `{ group, userGroupMetrics, managers, reportDetail, reports,
//!      userStatusSummary, users }`.
//!
//! Notable porting decisions (see also the structured `notes`):
//!   - Auth + permission resolution is delegated to the shared
//!     `workspace_permission_check::authorize_workspace_permission` helper.
//!     Because that helper returns only the resolved `ws_id` (not the full
//!     permission set), the `manage_users` check is performed with a SECOND
//!     call to the same helper: `Ok` ⇒ caller has `manage_users`, `Forbidden`
//!     ⇒ caller lacks it (run the group-membership fallback). This costs an
//!     extra auth round-trip vs. the legacy single permission fetch but keeps
//!     the module self-contained.
//!   - All Supabase reads use the service role key (the legacy route reads via
//!     `createAdminClient()`), so RLS is bypassed exactly like the legacy code.
//!   - The rate-limit-specific 429 branch from the legacy route is NOT
//!     reproduced (the backend has no equivalent PostgREST rate-limit metadata
//!     parser); a failed query collapses to the 500 FETCH_FAILED branch, which
//!     matches the legacy non-rate-limited error path.

use serde::Deserialize;
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const PRIVATE_SCHEMA: &str = "private";
const VIEW_PERMISSION: &str = "view_user_groups_reports";
const MANAGE_USERS_PERMISSION: &str = "manage_users";
const REPORTS_VIEW: &str = "external_user_monthly_reports_workspace_view";
const MAX_SHORT_TEXT_LENGTH: usize = 256;

// Error codes mirroring `ReportsDashboardErrorCode` in the legacy route.
const CODE_FETCH_FAILED: &str = "REPORTS_FETCH_FAILED";
const CODE_GROUP_FORBIDDEN: &str = "REPORTS_GROUP_FORBIDDEN";
const CODE_GROUP_NOT_FOUND: &str = "REPORTS_GROUP_NOT_FOUND";
const CODE_INVALID_QUERY: &str = "REPORTS_INVALID_QUERY";
const CODE_PERMISSION_DENIED: &str = "REPORTS_PERMISSION_DENIED";
const CODE_WORKSPACE_NOT_FOUND: &str = "REPORTS_WORKSPACE_NOT_FOUND";
const CODE_INTERNAL_ERROR: &str = "REPORTS_INTERNAL_ERROR";

#[derive(Deserialize)]
struct GroupRow {
    id: Option<String>,
    name: Option<String>,
}

#[derive(Deserialize)]
struct VirtualUserRow {
    virtual_user_id: Option<String>,
}

#[derive(Deserialize)]
struct GroupIdRow {
    group_id: Option<String>,
}

/// Matches `/api/v1/workspaces/:wsId/users/reports/groups/:groupId/dashboard`.
///
/// Returns `(raw_ws_id, group_id)` when the path shape matches this route.
fn dashboard_segments(path: &str) -> Option<(&str, &str)> {
    let segments = path_segments(path);

    if segments.len() == 9
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && !segments[3].is_empty()
        && segments[4] == "users"
        && segments[5] == "reports"
        && segments[6] == "groups"
        && !segments[7].is_empty()
        && segments[8] == "dashboard"
    {
        Some((segments[3], segments[7]))
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

pub(crate) async fn handle_workspaces_users_reports_groups_groupid_dashboard_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, group_id) = dashboard_segments(request.path)?;
    let group_id = group_id.to_owned();

    Some(match request.method {
        "GET" => dashboard_response(config, request, raw_ws_id, &group_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn dashboard_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    group_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // STEP 1: parse + validate query params.
    let (report_id, user_id) = match parse_query_params(request.url) {
        Ok(values) => values,
        Err(()) => {
            return error_response(400, CODE_INVALID_QUERY, "Invalid query parameters");
        }
    };

    // STEP 2 + 3: authenticate, resolve ws_id, require `view_user_groups_reports`.
    let resolved_ws_id = match authorize_workspace_permission(
        contact_data,
        request,
        raw_ws_id,
        VIEW_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization.ws_id,
        // getPermissions returned null → workspace not found.
        Err(WorkspacePermissionAuthorizationError::Unauthorized)
        | Err(WorkspacePermissionAuthorizationError::NotFound) => {
            return error_response(404, CODE_WORKSPACE_NOT_FOUND, "Workspace not found");
        }
        // Permission missing → 403 PERMISSION_DENIED.
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return error_response(
                403,
                CODE_PERMISSION_DENIED,
                "Missing permission to view reports",
            );
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return error_response(500, CODE_INTERNAL_ERROR, "Internal server error");
        }
    };

    // STEP 4: group-scoping for callers without `manage_users`.
    //
    // A second `authorize_workspace_permission` call distinguishes "caller has
    // manage_users" (Ok) from "caller lacks manage_users" (Forbidden). On
    // Forbidden, restrict to groups the caller belongs to.
    let has_manage_users = match authorize_workspace_permission(
        contact_data,
        request,
        raw_ws_id,
        MANAGE_USERS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(_) => true,
        Err(WorkspacePermissionAuthorizationError::Forbidden) => false,
        // Any auth/resolution issue here would have surfaced above; treat as 500.
        Err(_) => {
            return error_response(500, CODE_INTERNAL_ERROR, "Internal server error");
        }
    };

    if !has_manage_users {
        let Some(access_token) = workspace_access_token(request) else {
            return error_response(404, CODE_WORKSPACE_NOT_FOUND, "Workspace not found");
        };
        match accessible_group_ids(contact_data, outbound, &resolved_ws_id, &access_token).await {
            Ok(group_ids) => {
                if !group_ids.iter().any(|id| id == group_id) {
                    return error_response(
                        403,
                        CODE_GROUP_FORBIDDEN,
                        "Missing access to this report group",
                    );
                }
            }
            Err(()) => {
                return error_response(500, CODE_INTERNAL_ERROR, "Internal server error");
            }
        }
    }

    // STEP 5: fetch the group itself (drives the 404 GROUP_NOT_FOUND branch).
    let group = match fetch_group(contact_data, outbound, &resolved_ws_id, group_id).await {
        Ok(Some(group)) => group,
        Ok(None) => return error_response(404, CODE_GROUP_NOT_FOUND, "Group not found"),
        Err(()) => return error_response(500, CODE_FETCH_FAILED, "Error fetching reports"),
    };

    // Remaining data fetches. Any error → 500 FETCH_FAILED, matching the legacy
    // per-operation error sweep (sans the 429 rate-limit branch).
    let users = match fetch_group_users(contact_data, outbound, &resolved_ws_id, group_id).await {
        Ok(users) => sort_users_by_archive(users),
        Err(()) => return error_response(500, CODE_FETCH_FAILED, "Error fetching reports"),
    };

    let managers =
        match fetch_group_managers(contact_data, outbound, group_id, &resolved_ws_id).await {
            Ok(managers) => managers,
            Err(()) => return error_response(500, CODE_FETCH_FAILED, "Error fetching reports"),
        };

    let user_status_summary =
        match fetch_user_status_summary(contact_data, outbound, group_id, &resolved_ws_id).await {
            Ok(summary) => summary,
            Err(()) => return error_response(500, CODE_FETCH_FAILED, "Error fetching reports"),
        };

    let reports = match fetch_reports(
        contact_data,
        outbound,
        user_id.as_deref(),
        group_id,
        &resolved_ws_id,
    )
    .await
    {
        Ok(reports) => reports,
        Err(()) => return error_response(500, CODE_FETCH_FAILED, "Error fetching reports"),
    };

    let report_detail = match fetch_report_detail(
        contact_data,
        outbound,
        report_id.as_deref(),
        user_id.as_deref(),
        group_id,
        &resolved_ws_id,
    )
    .await
    {
        Ok(detail) => detail,
        Err(()) => return error_response(500, CODE_FETCH_FAILED, "Error fetching reports"),
    };

    let user_group_metrics = match fetch_user_group_metrics(
        contact_data,
        outbound,
        user_id.as_deref(),
        group_id,
    )
    .await
    {
        Ok(metrics) => metrics,
        Err(()) => return error_response(500, CODE_FETCH_FAILED, "Error fetching reports"),
    };

    no_store_response(json_response(
        200,
        json!({
            "group": { "id": group.id, "name": group.name },
            "userGroupMetrics": user_group_metrics,
            "managers": managers,
            "reportDetail": report_detail,
            "reports": reports,
            "userStatusSummary": user_status_summary,
            "users": users,
        }),
    ))
}

// ---------------------------------------------------------------------------
// Query param parsing
// ---------------------------------------------------------------------------

/// Parses optional `reportId` / `userId` query params. Mirrors the zod schema:
/// each is optional and capped at `MAX_SHORT_TEXT_LENGTH` characters; exceeding
/// the cap is a validation error.
fn parse_query_params(request_url: Option<&str>) -> Result<(Option<String>, Option<String>), ()> {
    let Some(parsed) = request_url.and_then(|raw| url::Url::parse(raw).ok()) else {
        return Ok((None, None));
    };

    let mut report_id = None;
    let mut user_id = None;

    for (key, value) in parsed.query_pairs() {
        match key.as_ref() {
            "reportId" => {
                if value.chars().count() > MAX_SHORT_TEXT_LENGTH {
                    return Err(());
                }
                report_id = Some(value.into_owned());
            }
            "userId" => {
                if value.chars().count() > MAX_SHORT_TEXT_LENGTH {
                    return Err(());
                }
                user_id = Some(value.into_owned());
            }
            _ => {}
        }
    }

    Ok((report_id, user_id))
}

// ---------------------------------------------------------------------------
// Group access fallback (mirrors getUserGroupMemberships)
// ---------------------------------------------------------------------------

/// Mirrors `getUserGroupMemberships(wsId)`: resolves the caller's workspace user
/// id (preferring the linked virtual user id, falling back to the platform user
/// id) and returns the distinct group ids they belong to.
async fn accessible_group_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    access_token: &str,
) -> Result<Vec<String>, ()> {
    let Some(platform_user_id) = supabase_user_id(contact_data, outbound, access_token).await?
    else {
        // No resolvable user → no memberships (matches getCurrentWorkspaceUser null).
        return Ok(Vec::new());
    };

    // Prefer the linked virtual_user_id, fall back to the platform user id.
    let virtual_user_id =
        linked_virtual_user_id(contact_data, outbound, ws_id, &platform_user_id).await?;
    let user_id = virtual_user_id
        .filter(|id| !id.trim().is_empty())
        .unwrap_or(platform_user_id);

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

    let mut group_ids: Vec<String> = Vec::new();
    for row in response.json::<Vec<GroupIdRow>>().map_err(|_| ())? {
        if let Some(group_id) = row.group_id.filter(|id| !id.is_empty())
            && !group_ids.iter().any(|existing| existing == &group_id)
        {
            group_ids.push(group_id);
        }
    }

    Ok(group_ids)
}

/// Resolves the Supabase auth user id for the supplied access token.
async fn supabase_user_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
) -> Result<Option<String>, ()> {
    Ok(
        crate::supabase_auth::fetch_supabase_auth_user(contact_data, access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty())),
    )
}

async fn linked_virtual_user_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    platform_user_id: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
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
    let response = send_service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<VirtualUserRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.virtual_user_id))
}

// ---------------------------------------------------------------------------
// Data fetchers
// ---------------------------------------------------------------------------

async fn fetch_group(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    group_id: &str,
) -> Result<Option<GroupRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_user_groups",
        &[
            ("select", "id,name".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("id", format!("eq.{group_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<GroupRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

/// Mirrors the `get_workspace_users` RPC selecting
/// `id, full_name, archived, archived_until, note` for the group, ordered by
/// `full_name` ascending (nulls last). The RPC accepts the same arguments as the
/// legacy call.
async fn fetch_group_users(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    group_id: &str,
) -> Result<Vec<Value>, ()> {
    let rpc_url = contact_data.rpc_url("get_workspace_users").ok_or(())?;
    let body = json!({
        "_ws_id": ws_id,
        "included_groups": [group_id],
        "excluded_groups": [],
        "search_query": "",
        "include_archived": true,
    })
    .to_string();

    // The legacy code chains `.select(...)` + `.order(...)` onto the RPC result,
    // which PostgREST exposes as query params on the RPC POST.
    let rpc_url = format!(
        "{rpc_url}?select=id,full_name,archived,archived_until,note&order=full_name.asc.nullslast"
    );

    let response = send_service_role_post(contact_data, outbound, &rpc_url, &body, false).await?;
    if !is_success_status(response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    Ok(rows
        .into_iter()
        .map(|row| {
            // Legacy maps `note: user.note ?? undefined`; an explicit null note is
            // dropped so it serializes as absent, matching `undefined`.
            let Value::Object(mut map) = row else {
                return row;
            };
            if matches!(map.get("note"), Some(Value::Null)) {
                map.remove("note");
            }
            Value::Object(map)
        })
        .collect())
}

/// Mirrors `fetchManagersForGroups(sbAdmin, [groupId])[groupId] ?? []`: TEACHER
/// role members of the group with their linked platform user id flattened into a
/// `ManagerUser` shape.
async fn fetch_group_managers(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    group_id: &str,
    ws_id: &str,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_user_groups_users",
        &[
            (
                "select",
                "group_id,user:workspace_users!workspace_user_roles_users_user_id_fkey!inner(id,full_name,avatar_url,display_name,email,ws_id,workspace_user_linked_users(platform_user_id))"
                    .to_owned(),
            ),
            ("group_id", format!("eq.{group_id}")),
            ("role", "eq.TEACHER".to_owned()),
            ("user.ws_id", format!("eq.{ws_id}")),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success_status(response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    let mut managers = Vec::new();
    for row in &rows {
        let user = row.get("user");
        let user_obj = match user {
            Some(Value::Array(items)) => items.first(),
            other => other,
        };
        let Some(user_obj) = user_obj else { continue };

        // Legacy drops managers without an id.
        let id = user_obj.get("id");
        if id.is_none() || matches!(id, Some(Value::Null)) {
            continue;
        }

        let linked = user_obj.get("workspace_user_linked_users");
        let platform_user_id = match linked {
            Some(Value::Array(items)) => items
                .first()
                .and_then(|item| item.get("platform_user_id"))
                .cloned(),
            Some(Value::Object(_)) => linked
                .and_then(|value| value.get("platform_user_id"))
                .cloned(),
            _ => None,
        };
        let has_linked_platform_user = matches!(
            &platform_user_id,
            Some(value) if !value.is_null()
        );

        managers.push(json!({
            "id": id.cloned().unwrap_or(Value::Null),
            "full_name": nullable_field(user_obj, "full_name"),
            "avatar_url": nullable_field(user_obj, "avatar_url"),
            "display_name": nullable_field(user_obj, "display_name"),
            "email": nullable_field(user_obj, "email"),
            "hasLinkedPlatformUser": has_linked_platform_user,
        }));
    }

    Ok(managers)
}

fn nullable_field(value: &Value, field: &str) -> Value {
    value
        .get(field)
        .filter(|value| !value.is_null())
        .cloned()
        .unwrap_or(Value::Null)
}

/// Mirrors the `get_user_report_status_summary` RPC; returns the raw rows as-is.
async fn fetch_user_status_summary(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    group_id: &str,
    ws_id: &str,
) -> Result<Vec<Value>, ()> {
    let rpc_url = contact_data
        .rpc_url("get_user_report_status_summary")
        .ok_or(())?;
    let body = json!({
        "_group_id": group_id,
        "_ws_id": ws_id,
    })
    .to_string();

    let response = send_service_role_post(contact_data, outbound, &rpc_url, &body, false).await?;
    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

/// Mirrors the reports list query against the private workspace view. Returns
/// `[]` when no `userId` is supplied.
async fn fetch_reports(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: Option<&str>,
    group_id: &str,
    ws_id: &str,
) -> Result<Vec<Value>, ()> {
    let Some(user_id) = user_id else {
        return Ok(Vec::new());
    };

    let Some(url) = contact_data.rest_url(
        REPORTS_VIEW,
        &[
            ("select", "*".to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("group_id", format!("eq.{group_id}")),
            ("user_ws_id", format!("eq.{ws_id}")),
            ("order", "created_at.desc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url, true).await?;
    if !is_success_status(response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    Ok(rows.into_iter().map(map_report_with_names).collect())
}

/// Mirrors the single-report detail query. Returns `null` unless a non-`new`
/// `reportId` and a `userId` are both supplied.
async fn fetch_report_detail(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    report_id: Option<&str>,
    user_id: Option<&str>,
    group_id: &str,
    ws_id: &str,
) -> Result<Value, ()> {
    let (Some(user_id), Some(report_id)) = (user_id, report_id) else {
        return Ok(Value::Null);
    };
    if report_id == "new" {
        return Ok(Value::Null);
    }

    let Some(url) = contact_data.rest_url(
        REPORTS_VIEW,
        &[
            ("select", "*".to_owned()),
            ("id", format!("eq.{report_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("group_id", format!("eq.{group_id}")),
            ("user_ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url, true).await?;
    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<Value>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .map(map_report_with_names)
        .unwrap_or(Value::Null))
}

/// Mirrors the `user_indicators` join against `user_group_metrics`, sorted by the
/// metric's `created_at` ascending and projected to
/// `{ id, name, unit, factor, is_weighted, value }`. Returns `[]` without a
/// `userId`.
async fn fetch_user_group_metrics(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: Option<&str>,
    group_id: &str,
) -> Result<Vec<Value>, ()> {
    let Some(user_id) = user_id else {
        return Ok(Vec::new());
    };

    let Some(url) = contact_data.rest_url(
        "user_indicators",
        &[
            (
                "select",
                "value,user_group_metrics!inner(id,name,unit,factor,is_weighted,group_id,created_at)"
                    .to_owned(),
            ),
            ("user_id", format!("eq.{user_id}")),
            ("user_group_metrics.group_id", format!("eq.{group_id}")),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success_status(response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;

    // Sort by the embedded metric `created_at` ascending (missing → epoch).
    let mut sortable: Vec<(String, &Value)> = rows
        .iter()
        .map(|row| {
            let created_at = row
                .get("user_group_metrics")
                .and_then(|metric| metric.get("created_at"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned();
            (created_at, row)
        })
        .collect();
    sortable.sort_by(|left, right| left.0.cmp(&right.0));

    Ok(sortable
        .into_iter()
        .filter_map(|(_, row)| {
            let metric = row.get("user_group_metrics")?;
            Some(json!({
                "id": metric.get("id").cloned().unwrap_or(Value::Null),
                "name": metric.get("name").cloned().unwrap_or(Value::Null),
                "unit": metric.get("unit").cloned().unwrap_or(Value::Null),
                "factor": metric.get("factor").cloned().unwrap_or(Value::Null),
                "is_weighted": metric.get("is_weighted").cloned().unwrap_or(Value::Null),
                "value": row.get("value").cloned().unwrap_or(Value::Null),
            }))
        })
        .collect())
}

// ---------------------------------------------------------------------------
// Mapping helpers (mirror mapReportWithNames)
// ---------------------------------------------------------------------------

/// Mirrors `mapReportWithNames`: flattens the embedded `user`/`creator`
/// relations into the report row and derives the legacy `*_name` fields.
fn map_report_with_names(row: Value) -> Value {
    let Value::Object(mut map) = row else {
        return row;
    };

    let user = map.remove("user");
    let creator = map.remove("creator");

    let user_obj = embedded_object(user.as_ref());
    let creator_obj = embedded_object(creator.as_ref());

    let user_full_name = nullable(map.get("user_full_name"));
    let user_name = user_full_name.or_else(|| user_obj.and_then(|u| nullable(u.get("full_name"))));

    let user_archived = field_or_embedded(&map, "user_archived", user_obj, "archived");
    let user_archived_until =
        field_or_embedded(&map, "user_archived_until", user_obj, "archived_until");
    let user_note = field_or_embedded(&map, "user_note", user_obj, "note");

    let creator_full_name = nullable(map.get("creator_full_name"));
    let creator_name =
        creator_full_name.or_else(|| creator_obj.and_then(|c| nullable(c.get("full_name"))));

    let group_name = nullable(map.get("group_name"))
        .or_else(|| nullable(map.get("name")))
        .unwrap_or(Value::Null);

    map.insert("user_name".to_owned(), user_name.unwrap_or(Value::Null));
    map.insert(
        "user_archived".to_owned(),
        user_archived.unwrap_or(Value::Null),
    );
    map.insert(
        "user_archived_until".to_owned(),
        user_archived_until.unwrap_or(Value::Null),
    );
    map.insert("user_note".to_owned(), user_note.unwrap_or(Value::Null));
    map.insert(
        "creator_name".to_owned(),
        creator_name.unwrap_or(Value::Null),
    );
    map.insert("group_name".to_owned(), group_name);

    Value::Object(map)
}

/// Returns the existing top-level field if present (legacy `raw.x ?? embedded`),
/// otherwise the embedded relation's field.
fn field_or_embedded(
    map: &Map<String, Value>,
    top_level: &str,
    embedded: Option<&Map<String, Value>>,
    embedded_field: &str,
) -> Option<Value> {
    nullable(map.get(top_level))
        .or_else(|| embedded.and_then(|obj| nullable(obj.get(embedded_field))))
}

/// PostgREST may return an embedded relation as an object or a single-element
/// array (because of `!inner`); flatten to the underlying object map.
fn embedded_object(value: Option<&Value>) -> Option<&Map<String, Value>> {
    match value {
        Some(Value::Array(items)) => items.first().and_then(Value::as_object),
        Some(Value::Object(map)) => Some(map),
        _ => None,
    }
}

/// Returns a cloned non-null value, or `None` for null/missing (mirrors the
/// `?? undefined` chains in the legacy mapper).
fn nullable(value: Option<&Value>) -> Option<Value> {
    value.filter(|value| !value.is_null()).cloned()
}

// ---------------------------------------------------------------------------
// User archive sort (mirrors sortWorkspaceUsersByArchive)
// ---------------------------------------------------------------------------

/// Mirrors `sortWorkspaceUsersByArchive`: active users first, then temporary
/// archived, then archived; within a state, by case-insensitive display name,
/// with id as the final tiebreaker. Because the RPC only selects
/// `full_name`/`archived`/`archived_until`, `display_name`/`name` are absent and
/// the name falls back to `full_name`.
fn sort_users_by_archive(users: Vec<Value>) -> Vec<Value> {
    let now_ms = current_time_millis();
    let mut users = users;
    users.sort_by(|left, right| {
        let left_rank = archive_state_rank(left, now_ms);
        let right_rank = archive_state_rank(right, now_ms);
        if left_rank != right_rank {
            return left_rank.cmp(&right_rank);
        }

        let left_name = user_sort_name(left);
        let right_name = user_sort_name(right);

        match (left_name.is_empty(), right_name.is_empty()) {
            (true, true) => user_id(left).cmp(&user_id(right)),
            (true, false) => std::cmp::Ordering::Greater,
            (false, true) => std::cmp::Ordering::Less,
            (false, false) => left_name
                .to_lowercase()
                .cmp(&right_name.to_lowercase())
                .then_with(|| left_name.cmp(&right_name)),
        }
    });
    users
}

fn archive_state_rank(user: &Value, now_ms: i128) -> u8 {
    if let Some(archived_until) = user.get("archived_until").and_then(Value::as_str)
        && let Some(until_ms) = parse_iso_millis(archived_until)
        && until_ms > now_ms
    {
        return 1; // temporary-archived
    }
    if user
        .get("archived")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return 2; // archived
    }
    0 // active
}

fn user_sort_name(user: &Value) -> String {
    for key in ["full_name", "display_name", "name"] {
        if let Some(value) = user.get(key).and_then(Value::as_str) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return trimmed.to_owned();
            }
        }
    }
    String::new()
}

fn user_id(user: &Value) -> String {
    user.get("id")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned()
}

/// Best-effort ISO-8601 → epoch-millis parser sufficient for archive comparison.
/// Returns `None` when the leading `YYYY-MM-DD` cannot be parsed, mirroring the
/// legacy `Number.isNaN` guard (an unparseable date is treated as not in the
/// future).
fn parse_iso_millis(value: &str) -> Option<i128> {
    let bytes = value.as_bytes();
    if bytes.len() < 10 {
        return None;
    }
    let year: i128 = value.get(0..4)?.parse().ok()?;
    if bytes[4] != b'-' {
        return None;
    }
    let month: i128 = value.get(5..7)?.parse().ok()?;
    if bytes[7] != b'-' {
        return None;
    }
    let day: i128 = value.get(8..10)?.parse().ok()?;

    let mut hour: i128 = 0;
    let mut minute: i128 = 0;
    let mut second: i128 = 0;
    if bytes.len() >= 19 && (bytes[10] == b'T' || bytes[10] == b' ') {
        hour = value.get(11..13).and_then(|v| v.parse().ok()).unwrap_or(0);
        minute = value.get(14..16).and_then(|v| v.parse().ok()).unwrap_or(0);
        second = value.get(17..19).and_then(|v| v.parse().ok()).unwrap_or(0);
    }

    // Days since a fixed epoch using a civil-date algorithm (Howard Hinnant).
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468;

    Some(((days * 86400 + hour * 3600 + minute * 60 + second) * 1000) as i128)
}

fn current_time_millis() -> i128 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i128)
        .unwrap_or(0)
}

// ---------------------------------------------------------------------------
// Outbound helpers
// ---------------------------------------------------------------------------

async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    private_schema: bool,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
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

/// Extracts the caller's Supabase access token from the bearer header (falling
/// back to the supabase auth cookie), ignoring app-session bearer tokens. This
/// re-implements the private `request_access_token_ignoring_app_sessions` logic
/// from `workspace_permission_check` so the module stays self-contained.
fn workspace_access_token(request: BackendRequest<'_>) -> Option<String> {
    bearer_access_token(request.authorization).or_else(|| {
        request
            .cookie
            .and_then(supabase_access_token_from_cookie_header)
    })
}

fn bearer_access_token(authorization: Option<&str>) -> Option<String> {
    let authorization = authorization?.trim();
    let token = authorization
        .strip_prefix("Bearer ")
        .or_else(|| authorization.strip_prefix("bearer "))?
        .trim();

    if token.is_empty() || token.starts_with("ttr_app_") {
        return None;
    }

    Some(token.to_owned())
}

fn supabase_access_token_from_cookie_header(cookie_header: &str) -> Option<String> {
    use base64::Engine;
    use base64::engine::general_purpose::URL_SAFE;

    #[derive(Deserialize)]
    struct SupabaseCookieSession {
        access_token: Option<String>,
    }

    // Collect chunked `sb-*-auth-token[.N]` cookies into ordered groups.
    use std::collections::BTreeMap;
    let mut groups: BTreeMap<String, (Option<String>, BTreeMap<usize, String>, bool)> =
        BTreeMap::new();

    for (name, value) in cookie_header
        .split(';')
        .filter_map(|cookie| cookie.trim().split_once('='))
    {
        let name = name.trim();
        if !name.starts_with("sb-") {
            continue;
        }
        let (storage_key, index) = if name.ends_with("-auth-token") {
            (name.to_owned(), None)
        } else if let Some((key, suffix)) = name.rsplit_once('.') {
            if !key.ends_with("-auth-token") {
                continue;
            }
            match suffix.parse::<usize>() {
                Ok(index) => (key.to_owned(), Some(index)),
                Err(_) => continue,
            }
        } else {
            continue;
        };

        let entry = groups.entry(storage_key).or_default();
        match index {
            Some(index) => {
                if entry.1.insert(index, value.trim().to_owned()).is_some() {
                    entry.2 = true;
                }
            }
            None => {
                if entry.0.is_some() {
                    entry.2 = true;
                }
                entry.0 = Some(value.trim().to_owned());
            }
        }
    }

    for (_, (base, chunks, duplicate)) in groups {
        if duplicate {
            continue;
        }
        let cookie_value = match (base, chunks.is_empty()) {
            (Some(base), true) => base,
            (Some(_), false) | (None, true) => continue,
            (None, false) => {
                let mut value = String::new();
                let mut ok = true;
                for index in 0..chunks.len() {
                    match chunks.get(&index) {
                        Some(chunk) => value.push_str(chunk),
                        None => {
                            ok = false;
                            break;
                        }
                    }
                }
                if !ok {
                    continue;
                }
                value
            }
        };

        let session = if let Some(base64_body) = cookie_value.strip_prefix("base64-") {
            let mut padded = base64_body.to_owned();
            while padded.len() % 4 != 0 {
                padded.push('=');
            }
            let Ok(decoded) = URL_SAFE.decode(padded.as_bytes()) else {
                continue;
            };
            match serde_json::from_slice::<SupabaseCookieSession>(&decoded) {
                Ok(session) => session,
                Err(_) => continue,
            }
        } else if cookie_value.starts_with('{') {
            match serde_json::from_str::<SupabaseCookieSession>(&cookie_value) {
                Ok(session) => session,
                Err(_) => continue,
            }
        } else {
            continue;
        };

        if let Some(token) = session
            .access_token
            .filter(|token| !token.trim().is_empty())
        {
            return Some(token);
        }
    }

    None
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn error_response(status: u16, code: &str, message: &str) -> BackendResponse {
    no_store_response(json_response(
        status,
        json!({ "code": code, "message": message }),
    ))
}
