use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const WORKSPACES_INVENTORY_OPTION_TEMPLATES_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_INVENTORY_OPTION_TEMPLATES_PATH_SUFFIX: &str = "/inventory/option-templates";
const PRIVATE_SCHEMA: &str = "private";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const NOT_FOUND_MESSAGE: &str = "Not found";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const LOAD_FAILED_MESSAGE: &str = "Failed to fetch inventory option templates";

// Mirrors `canViewInventoryCatalog` in
// apps/web/src/lib/inventory/permissions.ts (any of these permissions grants
// access). Workspace creators / admins are covered by `has_all_permissions`
// inside `authorize_workspace_permission`.
const VIEW_INVENTORY_CATALOG_PERMISSIONS: [&str; 6] = [
    "view_inventory_catalog",
    "manage_inventory_catalog",
    "view_inventory",
    "create_inventory",
    "update_inventory",
    "delete_inventory",
];

#[derive(Deserialize)]
struct TemplateRow {
    id: String,
    ws_id: String,
    name: String,
    description: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

#[derive(Deserialize)]
struct GroupRow {
    id: String,
    template_id: String,
    name: String,
    sort_order: i64,
}

#[derive(Deserialize)]
struct ValueRow {
    id: String,
    group_id: String,
    label: String,
    value: Option<String>,
    sort_order: i64,
}

#[derive(Serialize)]
struct OptionTemplateValue {
    id: String,
    label: String,
    value: Option<String>,
    #[serde(rename = "sortOrder")]
    sort_order: i64,
}

#[derive(Serialize)]
struct OptionTemplateGroup {
    id: String,
    name: String,
    #[serde(rename = "sortOrder")]
    sort_order: i64,
    values: Vec<OptionTemplateValue>,
}

#[derive(Serialize)]
struct OptionTemplate {
    id: String,
    #[serde(rename = "wsId")]
    ws_id: String,
    name: String,
    description: Option<String>,
    groups: Vec<OptionTemplateGroup>,
    #[serde(rename = "createdAt")]
    created_at: Option<String>,
    #[serde(rename = "updatedAt")]
    updated_at: Option<String>,
}

#[derive(Serialize)]
struct OptionTemplatesResponse {
    data: Vec<OptionTemplate>,
}

pub(crate) async fn handle_workspaces_inventory_option_templates_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_inventory_option_templates_ws_id(request.path)?;

    Some(match request.method {
        "GET" => option_templates_response(config, request, raw_ws_id, outbound).await,
        // Other HTTP methods (POST, ...) on this route are NOT migrated yet; fall
        // through to the still-active Next.js route by returning None.
        _ => return None,
    })
}

async fn option_templates_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let ws_id =
        match authorize_inventory_catalog(&config.contact_data, request, raw_ws_id, outbound).await
        {
            Ok(ws_id) => ws_id,
            Err(response) => return response,
        };

    match list_option_templates(&config.contact_data, outbound, &ws_id).await {
        Ok(data) => no_store_response(json_response(200, OptionTemplatesResponse { data })),
        Err(()) => no_store_response(json_response(
            500,
            json!({ "message": LOAD_FAILED_MESSAGE }),
        )),
    }
}

/// Authorizes the caller for the workspace, succeeding if they hold ANY of the
/// inventory-catalog permissions. Returns the resolved workspace id on success,
/// or a ready-to-send error response.
async fn authorize_inventory_catalog(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<String, BackendResponse> {
    for permission in VIEW_INVENTORY_CATALOG_PERMISSIONS {
        match authorize_workspace_permission(contact_data, request, raw_ws_id, permission, outbound)
            .await
        {
            Ok(authorization) => return Ok(authorization.ws_id),
            // A single missing permission does not deny access; the legacy
            // `canViewInventoryCatalog` grants access when ANY permission is
            // present, so keep checking the remaining permissions.
            Err(WorkspacePermissionAuthorizationError::Forbidden) => {}
            Err(error) => return Err(auth_error_response(error)),
        }
    }

    Err(no_store_response(json_response(
        403,
        json!({ "message": FORBIDDEN_MESSAGE }),
    )))
}

/// Mirrors `listOptionTemplates` + `hydrateOptionTemplates`
/// (apps/web/src/lib/inventory/commerce/repository.ts). Reads the `private`
/// schema with the service role, joins groups/values, and emits the
/// camelCase `InventoryOptionTemplate[]` shape.
async fn list_option_templates(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<OptionTemplate>, ()> {
    let template_rows = fetch_template_rows(contact_data, outbound, ws_id).await?;
    if template_rows.is_empty() {
        return Ok(Vec::new());
    }

    let template_ids: Vec<&str> = template_rows.iter().map(|row| row.id.as_str()).collect();
    let group_rows = fetch_group_rows(contact_data, outbound, &template_ids).await?;

    let group_ids: Vec<&str> = group_rows.iter().map(|row| row.id.as_str()).collect();
    let value_rows = if group_ids.is_empty() {
        Vec::new()
    } else {
        fetch_value_rows(contact_data, outbound, &group_ids).await?
    };

    Ok(hydrate(template_rows, group_rows, value_rows))
}

async fn fetch_template_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<TemplateRow>, ()> {
    let url = contact_data
        .rest_url(
            "inventory_option_templates",
            &[
                (
                    "select",
                    "id,ws_id,name,description,created_at,updated_at".to_owned(),
                ),
                ("ws_id", format!("eq.{ws_id}")),
                ("order", "name.asc".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_private_service_role_get(contact_data, outbound, &url).await?;
    if !is_success_status(response.status) {
        return Err(());
    }
    response.json::<Vec<TemplateRow>>().map_err(|_| ())
}

async fn fetch_group_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    template_ids: &[&str],
) -> Result<Vec<GroupRow>, ()> {
    let url = contact_data
        .rest_url(
            "inventory_option_template_groups",
            &[
                ("select", "id,template_id,name,sort_order".to_owned()),
                ("template_id", in_filter(template_ids)),
                ("order", "sort_order.asc".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_private_service_role_get(contact_data, outbound, &url).await?;
    if !is_success_status(response.status) {
        return Err(());
    }
    response.json::<Vec<GroupRow>>().map_err(|_| ())
}

async fn fetch_value_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    group_ids: &[&str],
) -> Result<Vec<ValueRow>, ()> {
    let url = contact_data
        .rest_url(
            "inventory_option_template_values",
            &[
                ("select", "id,group_id,label,value,sort_order".to_owned()),
                ("group_id", in_filter(group_ids)),
                ("order", "sort_order.asc".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_private_service_role_get(contact_data, outbound, &url).await?;
    if !is_success_status(response.status) {
        return Err(());
    }
    response.json::<Vec<ValueRow>>().map_err(|_| ())
}

/// Joins the flat row sets into the nested template -> groups -> values shape,
/// preserving the source order (templates by name, groups/values by sort_order).
fn hydrate(
    template_rows: Vec<TemplateRow>,
    group_rows: Vec<GroupRow>,
    value_rows: Vec<ValueRow>,
) -> Vec<OptionTemplate> {
    template_rows
        .into_iter()
        .map(|template| {
            let groups = group_rows
                .iter()
                .filter(|group| group.template_id == template.id)
                .map(|group| {
                    let values = value_rows
                        .iter()
                        .filter(|value| value.group_id == group.id)
                        .map(|value| OptionTemplateValue {
                            id: value.id.clone(),
                            label: value.label.clone(),
                            value: value.value.clone(),
                            sort_order: value.sort_order,
                        })
                        .collect();
                    OptionTemplateGroup {
                        id: group.id.clone(),
                        name: group.name.clone(),
                        sort_order: group.sort_order,
                        values,
                    }
                })
                .collect();

            OptionTemplate {
                id: template.id,
                ws_id: template.ws_id,
                name: template.name,
                description: template.description,
                groups,
                created_at: template.created_at,
                updated_at: template.updated_at,
            }
        })
        .collect()
}

fn in_filter(ids: &[&str]) -> String {
    format!("in.({})", ids.join(","))
}

async fn send_private_service_role_get(
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
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA),
        )
        .await
        .map_err(|_| ())
}

fn auth_error_response(error: WorkspacePermissionAuthorizationError) -> BackendResponse {
    match error {
        WorkspacePermissionAuthorizationError::Unauthorized => no_store_response(json_response(
            401,
            json!({ "message": UNAUTHORIZED_MESSAGE }),
        )),
        WorkspacePermissionAuthorizationError::NotFound => {
            no_store_response(json_response(404, json!({ "error": NOT_FOUND_MESSAGE })))
        }
        WorkspacePermissionAuthorizationError::Forbidden => {
            no_store_response(json_response(403, json!({ "message": FORBIDDEN_MESSAGE })))
        }
        WorkspacePermissionAuthorizationError::Internal => no_store_response(json_response(
            500,
            json!({ "message": MEMBERSHIP_LOOKUP_FAILED_MESSAGE }),
        )),
    }
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn workspaces_inventory_option_templates_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_INVENTORY_OPTION_TEMPLATES_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_INVENTORY_OPTION_TEMPLATES_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}
