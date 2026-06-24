use serde::Deserialize;
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const FORBIDDEN_MESSAGE: &str = "Forbidden";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const INVENTORY_APP_SESSION_TARGETS: [&str; 1] = ["inventory"];
const INVENTORY_REALTIME_SECRET: &str = "ENABLE_INVENTORY_REALTIME_BROADCAST";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const NOT_FOUND_MESSAGE: &str = "Not found";
const OVERVIEW_LOAD_FAILED_MESSAGE: &str = "Failed to load inventory overview";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const PRIVATE_SCHEMA: &str = "private";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const WORKSPACES_INVENTORY_OVERVIEW_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_INVENTORY_OVERVIEW_PATH_SUFFIX: &str = "/inventory/overview";

const DASHBOARD_SNAPSHOT_RPC: &str = "get_inventory_dashboard_snapshot";
const LOW_STOCK_PRODUCTS_RPC: &str = "get_inventory_low_stock_products";
const OVERVIEW_METRICS_RPC: &str = "get_inventory_overview_metrics";

// Permission groupings mirror apps/web/src/lib/inventory/permissions.ts.
const DASHBOARD_PERMISSIONS: [&str; 2] = ["view_inventory_dashboard", "view_inventory"];
const STOCK_PERMISSIONS: [&str; 4] = [
    "view_inventory_stock",
    "view_stock_quantity",
    "adjust_inventory_stock",
    "update_stock_quantity",
];
const SALES_PERMISSIONS: [&str; 2] = ["view_inventory_sales", "view_invoices"];
const ANALYTICS_PERMISSIONS: [&str; 4] = [
    "view_inventory_analytics",
    "view_inventory_dashboard",
    "view_inventory",
    "view_finance_stats",
];

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
struct WorkspaceCreatorRow {
    creator_id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceDefaultPermissionRow {
    permission: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceSecretRow {
    value: Option<String>,
}

#[derive(Deserialize)]
struct LowStockProductRow {
    product: Option<Value>,
}

struct AuthenticatedUser {
    access_token: Option<String>,
    id: String,
}

enum DataAuth<'a> {
    AccessToken(&'a str),
    ServiceRole,
}

struct InventoryPermissions {
    can_view_dashboard: bool,
    can_view_stock: bool,
    can_view_sales: bool,
    can_view_analytics: bool,
}

pub(crate) async fn handle_workspaces_inventory_overview_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_inventory_overview_ws_id(request.path)?;

    Some(match request.method {
        "GET" => overview_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn overview_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(user) = authenticated_user(config, request, outbound).await else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    let resolved_ws_id =
        match normalize_workspace_id(&config.contact_data, outbound, raw_ws_id, &user).await {
            Ok(Some(ws_id)) => ws_id,
            Ok(None) | Err(()) => return error_response(404, NOT_FOUND_MESSAGE),
        };

    // Mirror authorizeInventoryWorkspace: membership must resolve and be MEMBER.
    let membership_type =
        match workspace_membership_type(&config.contact_data, outbound, &resolved_ws_id, &user)
            .await
        {
            Ok(membership_type) => membership_type,
            Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
        };
    match membership_type.as_deref() {
        Some("MEMBER") => {}
        _ => return message_response(403, FORBIDDEN_MESSAGE),
    }

    // Resolve the permission set (mirrors getPermissions / containsPermission).
    let permissions = match inventory_permissions(
        &config.contact_data,
        outbound,
        &resolved_ws_id,
        &user,
        membership_type.as_deref(),
    )
    .await
    {
        Ok(permissions) => permissions,
        // getPermissions returning null -> 404 Not found.
        Err(()) => return error_response(404, NOT_FOUND_MESSAGE),
    };

    if !permissions.can_view_dashboard {
        return message_response(403, FORBIDDEN_MESSAGE);
    }

    let can_view_stock = permissions.can_view_stock;
    let can_view_sales = permissions.can_view_sales;
    let can_view_analytics = permissions.can_view_analytics;

    // dashboard snapshot: errors are logged but non-fatal (data falls back to null).
    let dashboard =
        match fetch_dashboard_snapshot(&config.contact_data, outbound, &resolved_ws_id).await {
            Ok(value) => value,
            Err(()) => Value::Null,
        };

    // low stock products: only fetched when stock is viewable; failure is fatal.
    let low_stock_products = if can_view_stock {
        match fetch_low_stock_products(&config.contact_data, outbound, &resolved_ws_id).await {
            Ok(products) => products,
            Err(()) => return message_response(500, OVERVIEW_LOAD_FAILED_MESSAGE),
        }
    } else {
        Vec::new()
    };

    // overview metrics: only fetched when sales or analytics is viewable; failure is fatal.
    let metrics = if can_view_sales || can_view_analytics {
        match fetch_overview_metrics(&config.contact_data, outbound, &resolved_ws_id).await {
            Ok(metrics) => Some(metrics),
            Err(()) => return message_response(500, OVERVIEW_LOAD_FAILED_MESSAGE),
        }
    } else {
        None
    };

    let realtime_enabled =
        inventory_realtime_enabled(&config.contact_data, outbound, &resolved_ws_id)
            .await
            .unwrap_or(false);

    let metrics_ref = metrics.as_ref();
    let recent_sales: Vec<Value> = if can_view_sales {
        metric_array(metrics_ref, "recent_sales")
    } else {
        Vec::new()
    };
    let owner_breakdown: Vec<Value> = if can_view_analytics {
        metric_array(metrics_ref, "owner_breakdown")
    } else {
        Vec::new()
    };
    let category_breakdown: Vec<Value> = if can_view_analytics {
        metric_array(metrics_ref, "category_breakdown")
    } else {
        Vec::new()
    };

    let inventory_sales_count = recent_sales.len();
    let wallets_count = metric_number(metrics_ref, "wallets_count");
    let total_income = if can_view_analytics {
        metric_number(metrics_ref, "total_income")
    } else {
        json!(0)
    };
    let total_expense = if can_view_analytics {
        metric_number(metrics_ref, "total_expense")
    } else {
        json!(0)
    };
    let inventory_sales_revenue = if can_view_analytics {
        metric_number(metrics_ref, "inventory_sales_revenue")
    } else {
        json!(0)
    };

    let dashboard_for_permissions = dashboard_for_permissions(
        &dashboard,
        can_view_analytics,
        can_view_sales,
        can_view_stock,
    );

    no_store_response(json_response(
        200,
        json!({
            "realtime_enabled": realtime_enabled,
            "totals": {
                "wallets_count": wallets_count,
                "total_income": total_income,
                "total_expense": total_expense,
                "inventory_sales_revenue": inventory_sales_revenue,
                "inventory_sales_count": inventory_sales_count,
            },
            "low_stock_products": low_stock_products,
            "recent_sales": recent_sales,
            "owner_breakdown": owner_breakdown,
            "category_breakdown": category_breakdown,
            "dashboard": dashboard_for_permissions,
        }),
    ))
}

// Returns a numeric metric, defaulting to 0 like `metrics?.field ?? 0`.
fn metric_number(metrics: Option<&Value>, key: &str) -> Value {
    metrics
        .and_then(|metrics| metrics.get(key))
        .filter(|value| value.is_number())
        .cloned()
        .unwrap_or_else(|| json!(0))
}

// Returns an array metric, defaulting to [] like `metrics?.field ?? []`.
fn metric_array(metrics: Option<&Value>, key: &str) -> Vec<Value> {
    metrics
        .and_then(|metrics| metrics.get(key))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

// Mirrors dashboardForPermissions() in the legacy route.
fn dashboard_for_permissions(
    dashboard: &Value,
    can_view_analytics: bool,
    can_view_sales: bool,
    can_view_stock: bool,
) -> Value {
    let Some(dashboard) = dashboard.as_object() else {
        return Value::Null;
    };

    let mut result = dashboard.clone();

    let products_count = dashboard
        .get("counts")
        .and_then(Value::as_object)
        .and_then(|counts| counts.get("products"))
        .and_then(Value::as_f64)
        .unwrap_or(0.0);

    // analytics
    if !can_view_analytics {
        result.insert(
            "analytics".to_owned(),
            json!({
                "categoryMix": [],
                "ownerMix": [],
                "revenueTrend": [],
            }),
        );
    }

    // costing
    if !can_view_analytics
        && let Some(costing) = result.get_mut("costing").and_then(Value::as_object_mut)
    {
        costing.insert("averageMarginPercentage".to_owned(), json!(0));
        costing.insert("bestScenario".to_owned(), Value::Null);
        costing.insert("lowestBreakEvenQuantity".to_owned(), Value::Null);
        costing.insert("weakestScenario".to_owned(), Value::Null);
    }

    // counts
    if let Some(counts) = result.get_mut("counts").and_then(Value::as_object_mut) {
        if !can_view_stock {
            counts.insert("lowStock".to_owned(), json!(0));
            counts.insert("stockRows".to_owned(), json!(0));
        }
        if !can_view_sales {
            counts.insert("sales".to_owned(), json!(0));
        }
    }

    // actions
    if !can_view_stock {
        let filtered = dashboard
            .get("actions")
            .and_then(Value::as_array)
            .map(|actions| {
                actions
                    .iter()
                    .filter(|action| {
                        let view = action.get("view").and_then(Value::as_str);
                        let kind = action.get("kind").and_then(Value::as_str);
                        view != Some("stock") && kind != Some("resolve_low_stock")
                    })
                    .cloned()
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        result.insert("actions".to_owned(), Value::Array(filtered));
    }

    // readiness
    if !can_view_stock {
        let mapped = dashboard
            .get("readiness")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .map(|item| {
                        if item.get("key").and_then(Value::as_str) == Some("products") {
                            let mut updated = item.as_object().cloned().unwrap_or_else(Map::new);
                            let has_products = products_count > 0.0;
                            updated.insert(
                                "completed".to_owned(),
                                json!(if has_products { 1 } else { 0 }),
                            );
                            updated.insert(
                                "score".to_owned(),
                                json!(if has_products { 100 } else { 0 }),
                            );
                            updated.insert("total".to_owned(), json!(1));
                            Value::Object(updated)
                        } else {
                            item.clone()
                        }
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        result.insert("readiness".to_owned(), Value::Array(mapped));
    }

    // risks
    let filtered_risks = dashboard
        .get("risks")
        .and_then(Value::as_array)
        .map(|risks| {
            risks
                .iter()
                .filter(|risk| {
                    let kind = risk.get("kind").and_then(Value::as_str);
                    let view = risk.get("view").and_then(Value::as_str);
                    if !can_view_sales && kind == Some("stale_checkout") {
                        return false;
                    }
                    if !can_view_stock && (view == Some("stock") || kind == Some("low_stock")) {
                        return false;
                    }
                    true
                })
                .cloned()
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    result.insert("risks".to_owned(), Value::Array(filtered_risks));

    Value::Object(result)
}

async fn authenticated_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<AuthenticatedUser> {
    if contact::request_has_app_session_token(request) {
        let identity =
            contact::resolve_app_session_identity(config, request, &INVENTORY_APP_SESSION_TARGETS)
                .ok()?;

        return non_empty_user_id(identity.id).map(|id| AuthenticatedUser {
            access_token: None,
            id,
        });
    }

    let access_token = supabase_auth::request_access_token(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;
    let id = non_empty_user_id(user.id?)?;

    Some(AuthenticatedUser {
        access_token: Some(access_token),
        id,
    })
}

fn non_empty_user_id(user_id: String) -> Option<String> {
    (!user_id.trim().is_empty()).then_some(user_id)
}

async fn inventory_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user: &AuthenticatedUser,
    membership_type: Option<&str>,
) -> Result<InventoryPermissions, ()> {
    let membership_type = membership_type.unwrap_or("MEMBER");
    let Some(creator) = workspace_creator(contact_data, outbound, ws_id).await? else {
        // Workspace not found -> getPermissions returns null -> Not found.
        return Err(());
    };

    let role_permissions = if membership_type == "MEMBER" {
        workspace_role_permissions(contact_data, outbound, ws_id, &user.id).await?
    } else {
        Vec::new()
    };
    let default_permissions =
        workspace_default_permissions(contact_data, outbound, ws_id, membership_type).await?;
    let is_creator = membership_type == "MEMBER" && creator.as_deref() == Some(&user.id);

    let mut permissions = Vec::new();
    extend_unique_permissions(&mut permissions, role_permissions);
    extend_unique_permissions(&mut permissions, default_permissions);

    // Creator and admin implicitly hold every permission.
    let has_all = is_creator || permissions.iter().any(|value| value == "admin");
    let has_any = |group: &[&str]| {
        has_all
            || permissions
                .iter()
                .any(|permission| group.contains(&permission.as_str()))
    };

    Ok(InventoryPermissions {
        can_view_dashboard: has_any(&DASHBOARD_PERMISSIONS),
        can_view_stock: has_any(&STOCK_PERMISSIONS),
        can_view_sales: has_any(&SALES_PERMISSIONS),
        can_view_analytics: has_any(&ANALYTICS_PERMISSIONS),
    })
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user: &AuthenticatedUser,
) -> Result<Option<String>, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user).await;
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(Some(resolved_ws_id));
        }

        if let Some(access_token) = user.access_token.as_deref()
            && let Some(workspace_id) = workspace_id_by_handle(
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
    user: &AuthenticatedUser,
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
    let response = send_rest_request(contact_data, outbound, &url, &auth).await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    decode_first_row::<WorkspaceIdRow>(&response).map(|row| row.and_then(|row| row.id))
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
    let response = send_rest_request(contact_data, outbound, &url, auth).await?;

    if !is_success_status(response.status) {
        return Ok(None);
    }

    decode_first_row::<WorkspaceIdRow>(&response).map(|row| row.and_then(|row| row.id))
}

async fn workspace_membership_type(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user: &AuthenticatedUser,
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
    let response = send_rest_request(contact_data, outbound, &url, &auth).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    decode_first_row::<WorkspaceMembershipRow>(&response)
        .map(|row| row.map(|row| row.membership_type.unwrap_or_else(|| "MEMBER".to_owned())))
}

async fn workspace_creator(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Option<Option<String>>, ()> {
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
    let response = send_rest_request(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    decode_first_row::<WorkspaceCreatorRow>(&response).map(|row| row.map(|row| row.creator_id))
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
    let response = send_rest_request(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;

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
    let response = send_rest_request(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;

    if !is_success_status(response.status) {
        return Ok(Vec::new());
    }

    Ok(response
        .json::<Vec<WorkspaceDefaultPermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
}

async fn fetch_dashboard_snapshot(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Value, ()> {
    let body = serde_json::to_string(&json!({ "p_ws_id": ws_id })).map_err(|_| ())?;
    let response = send_private_rpc(contact_data, outbound, DASHBOARD_SNAPSHOT_RPC, &body).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(response.json::<Value>().map_err(|_| ())?)
}

async fn fetch_low_stock_products(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<Value>, ()> {
    let body = serde_json::to_string(&json!({ "p_ws_id": ws_id })).map_err(|_| ())?;
    let response = send_private_rpc(contact_data, outbound, LOW_STOCK_PRODUCTS_RPC, &body).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<LowStockProductRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.product)
        .collect())
}

async fn fetch_overview_metrics(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Value, ()> {
    let body = serde_json::to_string(&json!({ "p_ws_id": ws_id })).map_err(|_| ())?;
    let response = send_private_rpc(contact_data, outbound, OVERVIEW_METRICS_RPC, &body).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(response.json::<Value>().map_err(|_| ())?)
}

async fn inventory_realtime_enabled(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "value".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("name", format!("eq.{INVENTORY_REALTIME_SECRET}")),
            ("order", "created_at.desc".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(decode_first_row::<WorkspaceSecretRow>(&response)?
        .and_then(|row| row.value)
        .as_deref()
        == Some("true"))
}

async fn send_private_rpc(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    function: &str,
    body: &str,
) -> Result<OutboundResponse, ()> {
    let Some(url) = contact_data.rpc_url(function) else {
        return Err(());
    };
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(body),
        )
        .await
        .map_err(|_| ())
}

async fn send_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
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
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
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

fn workspaces_inventory_overview_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_INVENTORY_OVERVIEW_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_INVENTORY_OVERVIEW_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
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

fn decode_first_row<T: for<'de> Deserialize<'de>>(
    response: &OutboundResponse,
) -> Result<Option<T>, ()> {
    response
        .json::<Vec<T>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
