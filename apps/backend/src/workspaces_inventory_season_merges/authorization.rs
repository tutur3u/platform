//! Inventory-only session identity, workspace membership and role authorization.
use super::validation::uuid;
use crate::outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest};
use crate::{APPLICATION_JSON, BackendConfig, BackendRequest, contact, supabase_auth};
use serde_json::Value;

pub(super) async fn authorize(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<(String, String), u16> {
    let (actor, token) = if contact::request_has_app_session_token(request) {
        let identity = contact::resolve_app_session_identity(config, request, &["inventory"])
            .map_err(|_| 401u16)?;
        (identity.id, None)
    } else {
        let token = supabase_auth::request_access_token(request).ok_or(401u16)?;
        let actor = supabase_auth::fetch_supabase_auth_user(&config.contact_data, &token, outbound)
            .await
            .and_then(|u| u.id)
            .ok_or(401u16)?;
        (actor, Some(token))
    };
    if !uuid(&actor) {
        return Err(401);
    }
    let ws = normalize(config, raw_ws, &actor, outbound).await?;
    let members = rows(
        config,
        "workspace_members",
        &[
            ("select", "type".into()),
            ("ws_id", format!("eq.{ws}")),
            ("user_id", format!("eq.{actor}")),
            ("limit", "1".into()),
        ],
        token.as_deref(),
        outbound,
    )
    .await
    .map_err(|_| 500u16)?;
    let membership = members.first().ok_or(403u16)?;
    let member_type = membership
        .get("type")
        .and_then(Value::as_str)
        .ok_or(500u16)?;
    // Match authorizeInventoryWorkspace: its membership gate requires MEMBER
    // before getPermissions can consult creator or GUEST default permissions.
    if member_type != "MEMBER" {
        return Err(403);
    }
    let workspace = rows(
        config,
        "workspaces",
        &[
            ("select", "creator_id".into()),
            ("id", format!("eq.{ws}")),
            ("limit", "1".into()),
        ],
        None,
        outbound,
    )
    .await
    .map_err(|_| 404u16)?;
    let workspace = workspace.first().ok_or(404u16)?;
    if workspace.get("creator_id").and_then(Value::as_str) == Some(actor.as_str()) {
        return Ok((ws, actor));
    }
    let mut permissions = Vec::new();
    if member_type == "MEMBER" {
        let roles = rows(
            config,
            "workspace_role_members",
            &[
                (
                    "select",
                    "workspace_roles!inner(workspace_role_permissions(permission))".into(),
                ),
                ("user_id", format!("eq.{actor}")),
                ("workspace_roles.ws_id", format!("eq.{ws}")),
                (
                    "workspace_roles.workspace_role_permissions.enabled",
                    "eq.true".into(),
                ),
            ],
            None,
            outbound,
        )
        .await
        .map_err(|_| 404u16)?;
        for role in roles {
            collect(&role, &mut permissions);
        }
    }
    let defaults = rows(
        config,
        "workspace_default_permissions",
        &[
            ("select", "permission".into()),
            ("ws_id", format!("eq.{ws}")),
            ("member_type", format!("eq.{member_type}")),
            ("enabled", "eq.true".into()),
        ],
        None,
        outbound,
    )
    .await
    .map_err(|_| 404u16)?;
    for row in defaults {
        collect(&row, &mut permissions);
    }
    if permitted(&permissions) {
        Ok((ws, actor))
    } else {
        Err(403)
    }
}
pub(super) fn permitted(permissions: &[String]) -> bool {
    let has = |key: &str| permissions.iter().any(|p| p == key);
    has("admin")
        || (has("update_invoices")
            && has("delete_invoices")
            && (has("manage_inventory_catalog") || has("update_inventory")))
}
fn collect(row: &Value, out: &mut Vec<String>) {
    match row {
        Value::Array(rows) => {
            for row in rows {
                collect(row, out);
            }
        }
        Value::Object(map) => {
            if let Some(permission) = map.get("permission").and_then(Value::as_str) {
                out.push(permission.into());
            }
            for key in ["workspace_roles", "workspace_role_permissions"] {
                if let Some(value) = map.get(key) {
                    collect(value, out);
                }
            }
        }
        _ => {}
    }
}
async fn normalize(
    config: &BackendConfig,
    raw: &str,
    actor: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<String, u16> {
    let raw = raw.trim().to_lowercase();
    if raw == "internal" {
        return Ok("00000000-0000-0000-0000-000000000000".into());
    }
    if uuid(&raw) {
        return Ok(raw);
    }
    let params = if raw == "personal" {
        vec![
            ("select", "id,workspace_members!inner(user_id,type)".into()),
            ("personal", "eq.true".into()),
            ("workspace_members.user_id", format!("eq.{actor}")),
            ("workspace_members.type", "eq.MEMBER".into()),
            ("limit", "1".into()),
        ]
    } else {
        if !crate::workspace_permission_check::is_workspace_handle_identifier(&raw) {
            return Err(404);
        }
        vec![
            ("select", "id".into()),
            ("handle", format!("eq.{raw}")),
            ("limit", "1".into()),
        ]
    };
    let data = rows(config, "workspaces", &params, None, outbound)
        .await
        .map_err(|_| 404u16)?;
    data.first()
        .and_then(|row| row.get("id"))
        .and_then(Value::as_str)
        .filter(|id| uuid(id))
        .map(str::to_owned)
        .ok_or(404)
}
async fn rows(
    config: &BackendConfig,
    table: &str,
    params: &[(&str, String)],
    token: Option<&str>,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<Value>, ()> {
    let key = config.contact_data.service_role_key().ok_or(())?;
    let url = config.contact_data.rest_url(table, params).ok_or(())?;
    let authorization = format!("Bearer {}", token.unwrap_or(key));
    let result = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("apikey", key)
                .with_header("Authorization", &authorization),
        )
        .await
        .map_err(|_| ())?;
    if !(200..300).contains(&result.status) {
        return Err(());
    }
    result.json().map_err(|_| ())
}
