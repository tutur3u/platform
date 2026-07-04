use super::*;

/// Mirrors `getUserGroupMemberships`: resolves the caller's workspace user link
/// (`virtual_user_id`, falling back to `platform_user_id`) and collects the
/// distinct `group_id`s the user belongs to. Returns an empty set when no link
/// exists.
///
/// Note: the legacy helper relies on `getCurrentWorkspaceUser`, which may
/// auto-repair a missing link via the `ensure_workspace_user_link` RPC
/// mutation. This handler intentionally performs a read-only lookup and skips
/// the repair path (see integrator notes).
pub(super) async fn user_group_memberships(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    platform_user_id: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_user_linked_users",
        &[
            ("select", "platform_user_id,virtual_user_id".to_owned()),
            ("platform_user_id", format!("eq.{platform_user_id}")),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let Some(link) = decode_first_row::<WorkspaceUserLinkRow>(&response)? else {
        return Ok(Vec::new());
    };

    let user_id = link
        .virtual_user_id
        .filter(|id| !id.trim().is_empty())
        .or(link.platform_user_id)
        .filter(|id| !id.trim().is_empty());

    let Some(user_id) = user_id else {
        return Ok(Vec::new());
    };

    let Some(memberships_url) = contact_data.rest_url(
        "workspace_user_groups_users",
        &[
            ("select", "group_id".to_owned()),
            ("user_id", format!("eq.{user_id}")),
        ],
    ) else {
        return Err(());
    };
    let memberships_response = send_rest_request(
        contact_data,
        outbound,
        &memberships_url,
        &DataAuth::ServiceRole,
    )
    .await?;

    if !is_success_status(memberships_response.status) {
        return Err(());
    }

    let mut group_ids = Vec::new();
    for row in memberships_response
        .json::<Vec<GroupMembershipRow>>()
        .map_err(|_| ())?
    {
        if let Some(group_id) = row.group_id.filter(|id| !id.is_empty())
            && !group_ids.iter().any(|existing| existing == &group_id)
        {
            group_ids.push(group_id);
        }
    }

    Ok(group_ids)
}

/// Queries `workspace_user_groups_with_guest` for the workspace (ordered by
/// name, limit 20), with an optional `ilike` search and an optional
/// `id=in.(...)` accessible-group filter.
pub(super) async fn fetch_report_groups(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    q: Option<&str>,
    accessible_group_ids: Option<&[String]>,
) -> Result<Vec<ReportGroupRow>, ()> {
    let mut params = vec![
        ("select", "id,name,ws_id".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "name.asc".to_owned()),
        ("limit", "20".to_owned()),
    ];

    if let Some(query) = q.filter(|value| !value.is_empty()) {
        let escaped = escape_like_wildcards(query);
        params.push(("name", format!("ilike.*{escaped}*")));
    }

    if let Some(ids) = accessible_group_ids {
        params.push(("id", format!("in.({})", join_id_list(ids))));
    }

    let Some(url) = contact_data.rest_url("workspace_user_groups_with_guest", &params) else {
        return Err(());
    };
    let response = send_rest_request(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<Vec<ReportGroupRow>>().map_err(|_| ())
}

/// Looks up a single group by id within the workspace, optionally restricted to
/// the accessible group set. Returns `Ok(None)` when no matching row exists.
pub(super) async fn fetch_selected_report_group(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    selected_group_id: &str,
    accessible_group_ids: Option<&[String]>,
) -> Result<Option<ReportGroupRow>, ()> {
    let mut params = vec![
        ("select", "id,name,ws_id".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("id", format!("eq.{selected_group_id}")),
        ("limit", "1".to_owned()),
    ];

    if let Some(ids) = accessible_group_ids {
        params.push(("id", format!("in.({})", join_id_list(ids))));
    }

    let Some(url) = contact_data.rest_url("workspace_user_groups_with_guest", &params) else {
        return Err(());
    };
    let response = send_rest_request(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    decode_first_row::<ReportGroupRow>(&response)
}

/// Mirrors `fetchManagersForGroups` for a single group: TEACHER-role members of
/// the group, mapped to the `ManagerUser` shape
/// `{ id, full_name, avatar_url, display_name, email, hasLinkedPlatformUser }`.
pub(super) async fn fetch_group_managers(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    group_id: &str,
    _ws_id: &str,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_user_groups_users",
        &[
            (
                "select",
                "group_id,user:workspace_users!workspace_user_roles_users_user_id_fkey!inner(id,full_name,avatar_url,display_name,email,workspace_user_linked_users(platform_user_id))"
                    .to_owned(),
            ),
            ("group_id", format!("eq.{group_id}")),
            ("role", "eq.TEACHER".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;

    let mut managers = Vec::new();
    for row in &rows {
        let user = row.get("user");
        let users: Vec<&Value> = match user {
            Some(Value::Array(items)) => items.iter().collect(),
            Some(value) if !value.is_null() => vec![value],
            _ => Vec::new(),
        };

        for user in users {
            if let Some(manager) = map_manager_user(user) {
                managers.push(manager);
            }
        }
    }

    Ok(managers)
}

/// Builds a `ManagerUser` JSON object from an embedded `workspace_users` row.
/// Returns `None` when the user has no `id` (matching the legacy guard).
pub(super) fn map_manager_user(user: &Value) -> Option<Value> {
    let id = user.get("id").filter(|value| !value.is_null())?;
    if id.as_str().is_some_and(str::is_empty) {
        return None;
    }

    let platform_user_id = match user.get("workspace_user_linked_users") {
        Some(Value::Array(items)) => items
            .first()
            .and_then(|item| item.get("platform_user_id"))
            .filter(|value| !value.is_null()),
        Some(Value::Object(_)) => user
            .get("workspace_user_linked_users")
            .and_then(|value| value.get("platform_user_id"))
            .filter(|value| !value.is_null()),
        _ => None,
    };

    let has_linked_platform_user = platform_user_id
        .and_then(Value::as_str)
        .is_some_and(|value| !value.is_empty());

    Some(json!({
        "id": id.clone(),
        "full_name": nullable_field(user, "full_name"),
        "avatar_url": nullable_field(user, "avatar_url"),
        "display_name": nullable_field(user, "display_name"),
        "email": nullable_field(user, "email"),
        "hasLinkedPlatformUser": has_linked_platform_user,
    }))
}

pub(super) fn nullable_field(value: &Value, key: &str) -> Value {
    value
        .get(key)
        .filter(|field| !field.is_null())
        .cloned()
        .unwrap_or(Value::Null)
}

/// Invokes the `get_group_report_status_summary(_ws_id)` RPC and, when scoped,
/// filters rows down to the accessible group ids.
pub(super) async fn fetch_group_status_summary(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    accessible_group_ids: Option<&[String]>,
) -> Result<Vec<Value>, ()> {
    let rpc_url = contact_data
        .rpc_url(GROUP_REPORT_STATUS_SUMMARY_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = json!({ "_ws_id": ws_id }).to_string();

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

    if !is_success_status(response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;

    Ok(match accessible_group_ids {
        None => rows,
        Some(ids) => rows
            .into_iter()
            .filter(|row| {
                row.get("group_id")
                    .and_then(Value::as_str)
                    .is_some_and(|group_id| ids.iter().any(|id| id == group_id))
            })
            .collect(),
    })
}

pub(super) fn report_group_to_value(group: &ReportGroupRow) -> Value {
    json!({
        "id": group.id.clone().map(Value::String).unwrap_or(Value::Null),
        "name": group.name.clone().map(Value::String).unwrap_or(Value::Null),
        "ws_id": group.ws_id.clone().map(Value::String).unwrap_or(Value::Null),
    })
}
