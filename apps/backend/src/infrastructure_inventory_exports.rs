mod auth;

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    infrastructure_inventory_exports::auth::{
        INSUFFICIENT_INVENTORY_PERMISSION_MESSAGE, InventoryExportAuthorizationError,
        authorize_inventory_export,
    },
    infrastructure_paginated_list::{parse_js_parse_int_prefix, total_count_from_content_range},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const MISSING_WS_ID_MESSAGE: &str = "Missing ws_id parameter";
const PRODUCT_UNITS_ERROR_MESSAGE: &str = "Error fetching inventory_units";
const PRODUCT_UNITS_PATH: &str = "/api/v1/infrastructure/product-units";
const PRIVATE_SCHEMA: &str = "private";
const WAREHOUSES_ERROR_MESSAGE: &str = "Error fetching inventory_warehouses";
const WAREHOUSES_PATH: &str = "/api/v1/infrastructure/warehouses";

#[derive(Clone, Debug, Eq, PartialEq)]
struct InventoryExportQuery {
    limit: Option<i64>,
    offset: Option<i64>,
    ws_id: Option<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct InventoryExportSpec {
    error_message: &'static str,
    table: &'static str,
}

const PRODUCT_UNITS_SPEC: InventoryExportSpec = InventoryExportSpec {
    error_message: PRODUCT_UNITS_ERROR_MESSAGE,
    table: "inventory_units",
};

const WAREHOUSES_SPEC: InventoryExportSpec = InventoryExportSpec {
    error_message: WAREHOUSES_ERROR_MESSAGE,
    table: "inventory_warehouses",
};

pub(crate) async fn handle_inventory_export_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let spec = match request.path {
        PRODUCT_UNITS_PATH => PRODUCT_UNITS_SPEC,
        WAREHOUSES_PATH => WAREHOUSES_SPEC,
        _ => return None,
    };

    Some(match request.method {
        "GET" => inventory_export_response(config, request, outbound, spec).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn inventory_export_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
    spec: InventoryExportSpec,
) -> BackendResponse {
    let query = inventory_export_query_from_url(request.url);
    let Some(raw_ws_id) = query.ws_id.as_deref().filter(|ws_id| !ws_id.is_empty()) else {
        return no_store_response(json_response(
            400,
            json!({ "message": MISSING_WS_ID_MESSAGE }),
        ));
    };
    let authorization = match authorize_inventory_export(config, request, raw_ws_id, outbound).await
    {
        Ok(authorization) => authorization,
        Err(error) => return inventory_export_auth_error_response(error),
    };
    let response = match fetch_inventory_export_rows(
        &config.contact_data,
        outbound,
        &authorization.ws_id,
        &query,
        spec,
    )
    .await
    {
        Ok(response) => response,
        Err(()) => return inventory_export_error_response(spec.error_message),
    };
    let count = total_count_from_content_range(&response).unwrap_or(0);
    let rows = match response.json::<Vec<Value>>() {
        Ok(rows) => rows,
        Err(_) => return inventory_export_error_response(spec.error_message),
    };

    no_store_response(json_response(
        200,
        json!({
            "data": rows,
            "count": count,
        }),
    ))
}

async fn fetch_inventory_export_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &InventoryExportQuery,
    spec: InventoryExportSpec,
) -> Result<OutboundResponse, ()> {
    let Some(url) = contact_data.rest_url(
        spec.table,
        &[("select", "*".to_owned()), ("ws_id", format!("eq.{ws_id}"))],
    ) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");
    let range = inventory_export_range(query);
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Range-Unit", "items")
                .with_header("Range", &range)
                .with_header("Prefer", "count=exact"),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response)
}

fn inventory_export_query_from_url(request_url: Option<&str>) -> InventoryExportQuery {
    let mut query = InventoryExportQuery {
        limit: Some(1000),
        offset: Some(0),
        ws_id: None,
    };
    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return query;
    };
    let mut saw_limit = false;
    let mut saw_offset = false;

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "ws_id" if query.ws_id.is_none() => query.ws_id = Some(value.into_owned()),
            "limit" if !saw_limit => {
                query.limit = parse_js_parse_int_prefix(&value);
                saw_limit = true;
            }
            "offset" if !saw_offset => {
                query.offset = parse_js_parse_int_prefix(&value);
                saw_offset = true;
            }
            _ => {}
        }
    }

    query
}

fn inventory_export_range(query: &InventoryExportQuery) -> String {
    let (Some(offset), Some(limit)) = (query.offset, query.limit) else {
        return "NaN-NaN".to_owned();
    };

    format!("{offset}-{}", offset + limit - 1)
}

fn inventory_export_auth_error_response(
    error: InventoryExportAuthorizationError,
) -> BackendResponse {
    match error {
        InventoryExportAuthorizationError::Unauthorized => {
            no_store_response(json_response(401, json!({ "error": "Unauthorized" })))
        }
        InventoryExportAuthorizationError::Forbidden => {
            no_store_response(json_response(403, json!({ "message": "Forbidden" })))
        }
        InventoryExportAuthorizationError::InsufficientPermissions => {
            no_store_response(json_response(
                403,
                json!({ "message": INSUFFICIENT_INVENTORY_PERMISSION_MESSAGE }),
            ))
        }
        InventoryExportAuthorizationError::NotFound => {
            no_store_response(json_response(404, json!({ "error": "Not found" })))
        }
        InventoryExportAuthorizationError::Internal => no_store_response(json_response(
            500,
            json!({ "message": "Failed to verify workspace access" }),
        )),
    }
}

fn inventory_export_error_response(message: &'static str) -> BackendResponse {
    no_store_response(json_response(500, json!({ "message": message })))
}
