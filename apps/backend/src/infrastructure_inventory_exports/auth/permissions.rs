use serde::Deserialize;
use serde_json::Value;

use crate::{
    contact,
    infrastructure_inventory_exports::auth::{
        AuthenticatedInventoryUser,
        workspace::{
            is_success_status, send_service_role_rest_request, workspace_membership_type,
            workspace_row,
        },
    },
    outbound::{OutboundHttpClient, OutboundMethod},
};

const INVENTORY_READ_PERMISSIONS: [&str; 7] = [
    "view_inventory_catalog",
    "manage_inventory_catalog",
    "view_inventory",
    "create_inventory",
    "update_inventory",
    "delete_inventory",
    "manage_inventory_setup",
];

#[derive(Deserialize)]
struct PermissionRow {
    permission: Option<String>,
}

pub(super) async fn has_inventory_read_permission(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user: &AuthenticatedInventoryUser,
) -> Result<Option<bool>, ()> {
    let Some(membership_type) =
        workspace_membership_type(contact_data, outbound, ws_id, user).await?
    else {
        return Ok(None);
    };
    let Some(workspace) = workspace_row(contact_data, outbound, ws_id).await? else {
        return Err(());
    };
    let role_permissions = if membership_type == "MEMBER" {
        workspace_role_permissions(contact_data, outbound, ws_id, &user.id).await?
    } else {
        Vec::new()
    };
    let default_permissions =
        workspace_default_permissions(contact_data, outbound, ws_id, &membership_type).await?;
    let is_creator =
        membership_type == "MEMBER" && workspace.creator_id.as_deref() == Some(&user.id);
    let mut permissions = Vec::new();

    extend_unique_permissions(&mut permissions, role_permissions);
    extend_unique_permissions(&mut permissions, default_permissions);

    Ok(Some(
        is_creator
            || permissions.iter().any(|value| value == "admin")
            || permissions
                .iter()
                .any(|permission| INVENTORY_READ_PERMISSIONS.contains(&permission.as_str())),
    ))
}

async fn workspace_role_permissions(
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
    let response =
        send_service_role_rest_request(contact_data, outbound, OutboundMethod::Get, &url).await?;

    if !is_success_status(response.status) {
        return Ok(Vec::new());
    }

    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    let mut permissions = Vec::new();
    for row in rows {
        collect_role_permissions(&row, &mut permissions);
    }

    Ok(permissions)
}

async fn workspace_default_permissions(
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
    let response =
        send_service_role_rest_request(contact_data, outbound, OutboundMethod::Get, &url).await?;

    if !is_success_status(response.status) {
        return Ok(Vec::new());
    }

    Ok(response
        .json::<Vec<PermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
}

fn collect_role_permissions(value: &Value, permissions: &mut Vec<String>) {
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
            if let Some(role_permissions) = map.get("workspace_role_permissions") {
                collect_role_permissions(role_permissions, permissions);
            }
            if let Some(workspace_roles) = map.get("workspace_roles") {
                collect_role_permissions(workspace_roles, permissions);
            }
        }
        _ => {}
    }
}

fn extend_unique_permissions(permissions: &mut Vec<String>, values: Vec<String>) {
    for permission in values {
        if !permissions.iter().any(|value| value == &permission) {
            permissions.push(permission);
        }
    }
}
