use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const LESSONS_ERROR_MESSAGE: &str = "Error fetching user_group_posts";
const LESSONS_PATH: &str = "/api/v1/infrastructure/lessons";
const MISSING_WS_ID_MESSAGE: &str = "Missing ws_id parameter";
const PACKAGES_ERROR_MESSAGE: &str = "Error fetching workspace products";
const PACKAGES_PATH: &str = "/api/v1/infrastructure/packages";
const PRIVATE_SCHEMA: &str = "private";
const VIEW_INVENTORY_PERMISSION: &str = "view_inventory";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ContentExportKind {
    Lessons,
    Packages,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct ContentExportQuery {
    limit: Option<i64>,
    offset: Option<i64>,
    ws_id: Option<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct ContentExportSpec {
    error_message: &'static str,
    kind: ContentExportKind,
    path: &'static str,
    schema: Option<&'static str>,
    select: &'static str,
    table: &'static str,
    workspace_filter_column: &'static str,
}

const LESSONS_SPEC: ContentExportSpec = ContentExportSpec {
    error_message: LESSONS_ERROR_MESSAGE,
    kind: ContentExportKind::Lessons,
    path: LESSONS_PATH,
    schema: Some(PRIVATE_SCHEMA),
    select: "*, workspace_user_groups!inner(ws_id)",
    table: "user_group_posts",
    workspace_filter_column: "workspace_user_groups.ws_id",
};

const PACKAGES_SPEC: ContentExportSpec = ContentExportSpec {
    error_message: PACKAGES_ERROR_MESSAGE,
    kind: ContentExportKind::Packages,
    path: PACKAGES_PATH,
    schema: None,
    select: "*",
    table: "workspace_products",
    workspace_filter_column: "ws_id",
};

pub(crate) async fn handle_content_export_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let spec = match request.path {
        LESSONS_PATH => LESSONS_SPEC,
        PACKAGES_PATH => PACKAGES_SPEC,
        _ => return None,
    };

    Some(match request.method {
        "GET" => content_export_response(config, request, outbound, spec).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn content_export_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
    spec: ContentExportSpec,
) -> BackendResponse {
    let query = content_export_query_from_url(request.url);
    let Some(raw_ws_id) = query.ws_id.as_deref().filter(|ws_id| !ws_id.is_empty()) else {
        return no_store_response(json_response(
            400,
            json!({ "message": MISSING_WS_ID_MESSAGE }),
        ));
    };

    let ws_id = match spec.kind {
        ContentExportKind::Lessons => raw_ws_id.to_owned(),
        ContentExportKind::Packages => {
            match authorize_workspace_permission(
                &config.contact_data,
                request,
                raw_ws_id,
                VIEW_INVENTORY_PERMISSION,
                outbound,
            )
            .await
            {
                Ok(authorization) => authorization.ws_id,
                Err(error) => return packages_auth_error_response(error),
            }
        }
    };

    let response =
        match fetch_content_export_rows(&config.contact_data, outbound, &ws_id, &query, spec).await
        {
            Ok(response) => response,
            Err(()) => return content_export_error_response(spec.error_message),
        };
    let count = content_range_total(&response).unwrap_or(0);
    let rows = match response.json::<Vec<Value>>() {
        Ok(rows) => rows,
        Err(_) => return content_export_error_response(spec.error_message),
    };

    no_store_response(json_response(
        200,
        json!({
            "data": rows,
            "count": count,
        }),
    ))
}

async fn fetch_content_export_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &ContentExportQuery,
    spec: ContentExportSpec,
) -> Result<OutboundResponse, ()> {
    let Some(url) = contact_data.rest_url(
        spec.table,
        &[
            ("select", spec.select.to_owned()),
            (spec.workspace_filter_column, format!("eq.{ws_id}")),
        ],
    ) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");
    let range = content_export_range(query);
    let mut outbound_request = OutboundRequest::new(OutboundMethod::Get, &url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key)
        .with_header("Range-Unit", "items")
        .with_header("Range", &range)
        .with_header("Prefer", "count=exact");

    if let Some(schema) = spec.schema {
        outbound_request = outbound_request
            .with_header("Accept-Profile", schema)
            .with_header("Content-Profile", schema);
    }

    let response = outbound.send(outbound_request).await.map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response)
}

fn content_export_query_from_url(request_url: Option<&str>) -> ContentExportQuery {
    let mut query = ContentExportQuery {
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
                query.limit =
                    crate::infrastructure_paginated_list::parse_js_parse_int_prefix(&value);
                saw_limit = true;
            }
            "offset" if !saw_offset => {
                query.offset =
                    crate::infrastructure_paginated_list::parse_js_parse_int_prefix(&value);
                saw_offset = true;
            }
            _ => {}
        }
    }

    query
}

fn content_export_range(query: &ContentExportQuery) -> String {
    let (Some(offset), Some(limit)) = (query.offset, query.limit) else {
        return "NaN-NaN".to_owned();
    };

    format!("{offset}-{}", offset + limit - 1)
}

fn content_range_total(response: &OutboundResponse) -> Option<usize> {
    let header = response.header("content-range")?;
    let (_, total) = header.rsplit_once('/')?;

    total.parse::<usize>().ok()
}

fn packages_auth_error_response(error: WorkspacePermissionAuthorizationError) -> BackendResponse {
    match error {
        WorkspacePermissionAuthorizationError::Unauthorized => {
            no_store_response(json_response(401, json!({ "message": "Unauthorized" })))
        }
        WorkspacePermissionAuthorizationError::Forbidden
        | WorkspacePermissionAuthorizationError::NotFound => {
            no_store_response(json_response(403, json!({ "message": "Forbidden" })))
        }
        WorkspacePermissionAuthorizationError::Internal => {
            content_export_error_response(PACKAGES_ERROR_MESSAGE)
        }
    }
}

fn content_export_error_response(message: &'static str) -> BackendResponse {
    no_store_response(json_response(500, json!({ "message": message })))
}
