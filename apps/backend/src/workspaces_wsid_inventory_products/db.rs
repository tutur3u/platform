use super::*;

// ---------------------------------------------------------------------------
// RPC call
// ---------------------------------------------------------------------------

pub(super) async fn fetch_rpc_products(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &ProductsQuery,
    include_stock: bool,
    limit: i64,
    offset: i64,
) -> Result<Vec<RpcProductRow>, ()> {
    // normalizeUuid: if categoryId / manufacturerId is provided but not a valid
    // UUID, the legacy handler returns { count: 0, data: [] } immediately.
    let p_category_id = match &query.category_id {
        Some(id) if !is_uuid(id) => return Ok(Vec::new()),
        other => other.as_deref(),
    };
    let p_manufacturer_id = match &query.manufacturer_id {
        Some(id) if !is_uuid(id) => return Ok(Vec::new()),
        other => other.as_deref(),
    };

    let trimmed_search = query.q.trim();
    let p_search: Option<&str> = if trimmed_search.is_empty() {
        None
    } else {
        Some(trimmed_search)
    };

    let rpc_url = contact_data.rpc_url(RPC_NAME).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let auth_header = format!("Bearer {service_role_key}");

    let body = serde_json::to_string(&json!({
        "p_ws_id": ws_id,
        "p_limit": limit,
        "p_offset": offset,
        "p_search": p_search,
        "p_include_stock": include_stock,
        "p_category_id": p_category_id,
        "p_manufacturer_id": p_manufacturer_id,
        "p_sort_by": &query.sort_by,
        "p_sort_order": &query.sort_order,
        "p_status": &query.status,
    }))
    .map_err(|_| ())?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &auth_header)
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<RpcProductRow>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Avatar URL fetch
// ---------------------------------------------------------------------------

pub(super) async fn fetch_avatar_urls(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    product_ids: &[&str],
) -> std::collections::HashMap<String, Value> {
    if product_ids.is_empty() {
        return std::collections::HashMap::new();
    }

    // Build PostgREST `in.(id1,id2,...)` filter.
    let ids_filter = format!("in.({})", product_ids.join(","));
    let url = match contact_data.rest_url(
        "workspace_products",
        &[
            ("select", "id,avatar_url".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("id", ids_filter),
        ],
    ) {
        Some(u) => u,
        None => return std::collections::HashMap::new(),
    };

    let service_role_key = match contact_data.service_role_key() {
        Some(k) => k,
        None => return std::collections::HashMap::new(),
    };
    let auth_header = format!("Bearer {service_role_key}");

    let response = match outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &auth_header)
                .with_header("apikey", service_role_key),
        )
        .await
    {
        Ok(r) if (200..300).contains(&r.status) => r,
        _ => return std::collections::HashMap::new(),
    };

    let rows: Vec<AvatarRow> = match response.json::<Vec<AvatarRow>>() {
        Ok(r) => r,
        Err(_) => return std::collections::HashMap::new(),
    };

    rows.into_iter()
        .filter_map(|row| row.id.map(|id| (id, row.avatar_url.unwrap_or(Value::Null))))
        .collect()
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

pub(super) async fn authenticated_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<InventoryUser> {
    if contact::request_has_app_session_token(request) {
        let identity =
            contact::resolve_app_session_identity(config, request, &APP_SESSION_TARGETS).ok()?;

        let id = identity.id;
        return (!id.trim().is_empty()).then_some(InventoryUser {
            access_token: None,
            id,
        });
    }

    let access_token = supabase_auth::request_access_token(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;
    let id = user.id.filter(|id| !id.trim().is_empty())?;

    Some(InventoryUser {
        access_token: Some(access_token),
        id,
    })
}

pub(super) async fn member_check(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user: &InventoryUser,
) -> Result<MembershipCheck, ()> {
    let Some(membership_type) =
        workspace_membership_type(contact_data, outbound, ws_id, user).await?
    else {
        return Ok(MembershipCheck::NotMember);
    };

    if membership_type == "MEMBER" {
        Ok(MembershipCheck::Member)
    } else {
        Ok(MembershipCheck::NotMember)
    }
}

pub(super) async fn effective_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user: &InventoryUser,
) -> Result<Option<EffectivePermissions>, ()> {
    let Some(membership_type) =
        workspace_membership_type(contact_data, outbound, ws_id, user).await?
    else {
        return Ok(None);
    };
    let Some(workspace) = workspace_row(contact_data, outbound, ws_id).await? else {
        return Ok(None);
    };

    let role_permissions = if membership_type == "MEMBER" {
        workspace_role_permissions(contact_data, outbound, ws_id, &user.id).await?
    } else {
        Vec::new()
    };
    let default_permissions =
        workspace_default_permissions(contact_data, outbound, ws_id, &membership_type).await?;
    let is_creator =
        membership_type == "MEMBER" && workspace.creator_id.as_deref() == Some(user.id.as_str());

    if !is_creator && role_permissions.is_empty() && default_permissions.is_empty() {
        return Ok(None);
    }

    let mut permissions = Vec::new();
    extend_unique(&mut permissions, role_permissions);
    extend_unique(&mut permissions, default_permissions);

    Ok(Some(EffectivePermissions {
        has_all_permissions: is_creator || permissions.iter().any(|p| p == ADMIN_PERMISSION),
        permissions,
    }))
}

pub(super) async fn workspace_membership_type(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user: &InventoryUser,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{}", user.id)),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let auth = user
        .access_token
        .as_deref()
        .map_or(DataAuth::ServiceRole, DataAuth::AccessToken);
    let response =
        send_rest_request(contact_data, outbound, OutboundMethod::Get, &url, &auth).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(first_row::<WorkspaceMembershipRow>(&response)?
        .map(|row| row.membership_type.unwrap_or_else(|| "MEMBER".to_owned())))
}

pub(super) async fn workspace_row(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Option<WorkspaceRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "creator_id".to_owned()),
            ("id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role(contact_data, outbound, OutboundMethod::Get, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    first_row::<WorkspaceRow>(&response)
}

pub(super) async fn workspace_role_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
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
    ) else {
        return Err(());
    };
    let response = send_service_role(contact_data, outbound, OutboundMethod::Get, &url).await?;

    if !(200..300).contains(&response.status) {
        return Ok(Vec::new());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    let mut permissions = Vec::new();
    for row in rows {
        collect_role_permissions(&row, &mut permissions);
    }

    Ok(permissions)
}

pub(super) async fn workspace_default_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    membership_type: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_default_permissions",
        &[
            ("select", "permission".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("member_type", format!("eq.{membership_type}")),
            ("enabled", "eq.true".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role(contact_data, outbound, OutboundMethod::Get, &url).await?;

    if !(200..300).contains(&response.status) {
        return Ok(Vec::new());
    }

    Ok(response
        .json::<Vec<PermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
}

pub(super) async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user: &InventoryUser,
) -> Result<Option<String>, ()> {
    let resolved = if raw_ws_id.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        raw_ws_id.to_owned()
    };

    if resolved == ROOT_WORKSPACE_ID {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user).await;
    }

    if !is_uuid(&resolved) {
        let handle = raw_ws_id.trim().to_lowercase();
        if is_valid_workspace_handle(&handle) {
            if let Some(at) = user.access_token.as_deref()
                && let Some(id) = workspace_id_by_handle(
                    contact_data,
                    outbound,
                    &handle,
                    &DataAuth::AccessToken(at),
                )
                .await?
            {
                return Ok(Some(id));
            }
            if let Some(id) =
                workspace_id_by_handle(contact_data, outbound, &handle, &DataAuth::ServiceRole)
                    .await?
            {
                return Ok(Some(id));
            }
        }
    }

    Ok(Some(resolved))
}

pub(super) async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user: &InventoryUser,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id,workspace_members!inner(user_id,type)".to_owned(),
            ),
            ("personal", "eq.true".to_owned()),
            ("workspace_members.user_id", format!("eq.{}", user.id)),
            ("workspace_members.type", "eq.MEMBER".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let auth = user
        .access_token
        .as_deref()
        .map_or(DataAuth::ServiceRole, DataAuth::AccessToken);
    let response =
        send_rest_request(contact_data, outbound, OutboundMethod::Get, &url, &auth).await?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}

pub(super) async fn workspace_id_by_handle(
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

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(first_row::<WorkspaceIdRow>(&response)?.and_then(|row| row.id))
}

pub(super) async fn send_service_role(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
) -> Result<OutboundResponse, ()> {
    send_rest_request(contact_data, outbound, method, url, &DataAuth::ServiceRole).await
}

pub(super) async fn send_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
    auth: &DataAuth<'_>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = match auth {
        DataAuth::AccessToken(token) => format!("Bearer {token}"),
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

// ---------------------------------------------------------------------------
// Utility helpers (used only within db.rs)
// ---------------------------------------------------------------------------

pub(super) fn collect_role_permissions(value: &Value, permissions: &mut Vec<String>) {
    match value {
        Value::Array(items) => {
            for item in items {
                collect_role_permissions(item, permissions);
            }
        }
        Value::Object(map) => {
            if let Some(permission) = map.get("permission").and_then(Value::as_str) {
                permissions.push(permission.to_owned());
            }
            if let Some(rp) = map.get("workspace_role_permissions") {
                collect_role_permissions(rp, permissions);
            }
            if let Some(wr) = map.get("workspace_roles") {
                collect_role_permissions(wr, permissions);
            }
        }
        _ => {}
    }
}

pub(super) fn extend_unique(permissions: &mut Vec<String>, values: Vec<String>) {
    for p in values {
        if !permissions.iter().any(|x| x == &p) {
            permissions.push(p);
        }
    }
}

pub(super) fn first_row<T: for<'de> Deserialize<'de>>(
    response: &OutboundResponse,
) -> Result<Option<T>, ()> {
    response
        .json::<Vec<T>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

/// Validates that `s` looks like a UUID (8-4-4-4-12 hex with hyphens).
pub(super) fn is_uuid(s: &str) -> bool {
    let s = s.trim();
    if s.len() != 36 {
        return false;
    }
    s.chars().enumerate().all(|(i, c)| match i {
        8 | 13 | 18 | 23 => c == '-',
        _ => c.is_ascii_hexdigit(),
    })
}

pub(super) fn is_valid_workspace_handle(s: &str) -> bool {
    let len = s.len();
    if len == 0 || len > 64 {
        return false;
    }
    s.chars().enumerate().all(|(i, c)| {
        let edge = i == 0 || i + 1 == len;
        c.is_ascii_lowercase() || c.is_ascii_digit() || (!edge && matches!(c, '_' | '-'))
    })
}
