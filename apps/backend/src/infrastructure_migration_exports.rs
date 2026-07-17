use serde_json::{Value, json};
use std::collections::BTreeMap;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const MANAGE_EXTERNAL_MIGRATIONS_PERMISSION: &str = "manage_external_migrations";
const MISSING_WS_ID_MESSAGE: &str = "Missing ws_id parameter";
const PRIVATE_SCHEMA: &str = "private";
const COUPONS_PATH: &str = "/api/v1/infrastructure/coupons";
const USER_COUPONS_PATH: &str = "/api/v1/infrastructure/user-coupons";
const USER_MONTHLY_REPORT_LOGS_PATH: &str = "/api/v1/infrastructure/user-monthly-report-logs";
const USER_MONTHLY_REPORTS_PATH: &str = "/api/v1/infrastructure/user-monthly-reports";
const USER_COUPONS_PROMOTIONS_ERROR: &str = "Error fetching workspace_promotions";
const USER_COUPONS_LINKS_ERROR: &str = "Error fetching user_linked_promotions";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct MigrationExportSpec {
    error_message: &'static str,
    path: &'static str,
    table: &'static str,
    workspace_filter_column: &'static str,
}

const MIGRATION_EXPORT_SPECS: [MigrationExportSpec; 3] = [
    MigrationExportSpec {
        error_message: "Error fetching workspace promotions",
        path: COUPONS_PATH,
        table: "workspace_promotions",
        workspace_filter_column: "ws_id",
    },
    MigrationExportSpec {
        error_message: "Error fetching external_user_monthly_report_logs",
        path: USER_MONTHLY_REPORT_LOGS_PATH,
        table: "external_user_monthly_report_logs_workspace_view",
        workspace_filter_column: "user_ws_id",
    },
    MigrationExportSpec {
        error_message: "Error fetching external_user_monthly_reports",
        path: USER_MONTHLY_REPORTS_PATH,
        table: "external_user_monthly_reports_workspace_view",
        workspace_filter_column: "user_ws_id",
    },
];

#[derive(Clone, Debug, Eq, PartialEq)]
struct MigrationExportQuery {
    limit: Option<i64>,
    offset: Option<i64>,
    ws_id: Option<String>,
}

pub(crate) async fn handle_infrastructure_migration_export_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path == USER_COUPONS_PATH {
        return Some(match request.method {
            "GET" => user_coupons_response(config, request, outbound).await,
            method => no_store_response(method_not_allowed(method, "GET")),
        });
    }

    for spec in MIGRATION_EXPORT_SPECS {
        if request.path == spec.path {
            return Some(match request.method {
                "GET" => migration_export_response(config, request, outbound, spec).await,
                method => no_store_response(method_not_allowed(method, "GET")),
            });
        }
    }

    None
}

async fn migration_export_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
    spec: MigrationExportSpec,
) -> BackendResponse {
    let query = migration_export_query_from_url(request.url);
    let Some(raw_ws_id) = query.ws_id.as_deref().filter(|ws_id| !ws_id.is_empty()) else {
        return no_store_response(json_response(
            400,
            json!({ "message": MISSING_WS_ID_MESSAGE }),
        ));
    };

    let authorization = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        MANAGE_EXTERNAL_MIGRATIONS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(error) => return migration_export_auth_error_response(error, spec),
    };

    let response = match fetch_migration_export_rows(
        &config.contact_data,
        outbound,
        &authorization.ws_id,
        &query,
        spec,
    )
    .await
    {
        Ok(response) => response,
        Err(()) => return migration_export_error_response(spec.error_message),
    };
    let count = total_count_from_content_range(&response).unwrap_or(0);
    let rows = match response.json::<Vec<Value>>() {
        Ok(rows) => rows,
        Err(_) => return migration_export_error_response(spec.error_message),
    };

    no_store_response(json_response(
        200,
        json!({
            "data": rows,
            "count": count,
        }),
    ))
}

async fn user_coupons_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let query = migration_export_query_from_url(request.url);
    let Some(raw_ws_id) = query.ws_id.as_deref().filter(|ws_id| !ws_id.is_empty()) else {
        return no_store_response(json_response(
            400,
            json!({ "message": MISSING_WS_ID_MESSAGE }),
        ));
    };

    let authorization = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        MANAGE_EXTERNAL_MIGRATIONS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(error) => {
            return migration_export_auth_error_response_for_message(
                error,
                USER_COUPONS_PROMOTIONS_ERROR,
            );
        }
    };

    let promotions = match fetch_workspace_promotions(
        &config.contact_data,
        outbound,
        &authorization.ws_id,
    )
    .await
    {
        Ok(promotions) => promotions,
        Err(()) => return migration_export_error_response(USER_COUPONS_PROMOTIONS_ERROR),
    };
    let (promotion_ids, promotion_workspace_by_id) = promotion_workspace_map_by_id(&promotions);

    if promotion_ids.is_empty() {
        return no_store_response(json_response(
            200,
            json!({
                "data": [],
                "count": 0,
            }),
        ));
    }

    let response =
        match fetch_user_linked_promotions(&config.contact_data, outbound, &promotion_ids, &query)
            .await
        {
            Ok(response) => response,
            Err(()) => return migration_export_error_response(USER_COUPONS_LINKS_ERROR),
        };
    let count = total_count_from_content_range(&response).unwrap_or(0);
    let rows = match response.json::<Vec<Value>>() {
        Ok(rows) => user_coupon_rows_with_workspace_promotions(rows, &promotion_workspace_by_id),
        Err(_) => return migration_export_error_response(USER_COUPONS_LINKS_ERROR),
    };

    no_store_response(json_response(
        200,
        json!({
            "data": rows,
            "count": count,
        }),
    ))
}

async fn fetch_migration_export_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &MigrationExportQuery,
    spec: MigrationExportSpec,
) -> Result<OutboundResponse, ()> {
    let Some(url) = contact_data.rest_url(
        spec.table,
        &[
            ("select", "*".to_owned()),
            (spec.workspace_filter_column, format!("eq.{ws_id}")),
        ],
    ) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");
    let range = migration_export_range(query);
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

async fn fetch_workspace_promotions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_promotions",
        &[
            ("select", "id, ws_id".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
        ],
    ) else {
        return Err(());
    };
    let response = send_private_schema_get(contact_data, outbound, &url, None).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

async fn fetch_user_linked_promotions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    promotion_ids: &[String],
    query: &MigrationExportQuery,
) -> Result<OutboundResponse, ()> {
    let Some(url) = contact_data.rest_url(
        "user_linked_promotions",
        &[
            ("select", "*".to_owned()),
            ("promo_id", format!("in.({})", promotion_ids.join(","))),
        ],
    ) else {
        return Err(());
    };
    let range = migration_export_range(query);
    let response =
        send_private_schema_get(contact_data, outbound, &url, Some(range.as_str())).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response)
}

async fn send_private_schema_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    range: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");
    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key)
        .with_header("Accept-Profile", PRIVATE_SCHEMA)
        .with_header("Content-Profile", PRIVATE_SCHEMA);

    if let Some(range) = range {
        request = request
            .with_header("Range-Unit", "items")
            .with_header("Range", range)
            .with_header("Prefer", "count=exact");
    }

    outbound.send(request).await.map_err(|_| ())
}

fn promotion_workspace_map_by_id(promotions: &[Value]) -> (Vec<String>, BTreeMap<String, Value>) {
    let mut promotion_ids = Vec::new();
    let mut promotion_workspace_by_id = BTreeMap::new();

    for promotion in promotions {
        let Some(id) = promotion.get("id").and_then(Value::as_str) else {
            continue;
        };
        promotion_ids.push(id.to_owned());
        promotion_workspace_by_id.insert(
            id.to_owned(),
            json!({
                "ws_id": promotion.get("ws_id").cloned().unwrap_or(Value::Null),
            }),
        );
    }

    (promotion_ids, promotion_workspace_by_id)
}

fn user_coupon_rows_with_workspace_promotions(
    rows: Vec<Value>,
    promotion_workspace_by_id: &BTreeMap<String, Value>,
) -> Vec<Value> {
    rows.into_iter()
        .map(|mut row| {
            let workspace_promotion = row
                .get("promo_id")
                .and_then(Value::as_str)
                .and_then(|promo_id| promotion_workspace_by_id.get(promo_id).cloned())
                .unwrap_or(Value::Null);

            if let Value::Object(object) = &mut row {
                object.insert("workspace_promotions".to_owned(), workspace_promotion);
            }

            row
        })
        .collect()
}

fn migration_export_query_from_url(request_url: Option<&str>) -> MigrationExportQuery {
    let mut query = MigrationExportQuery {
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

fn migration_export_range(query: &MigrationExportQuery) -> String {
    let (Some(offset), Some(limit)) = (query.offset, query.limit) else {
        return "NaN-NaN".to_owned();
    };

    format!("{offset}-{}", offset + limit - 1)
}

fn parse_js_parse_int_prefix(value: &str) -> Option<i64> {
    let trimmed = value.trim_start();
    let mut chars = trimmed.char_indices().peekable();
    let mut sign = 1_i64;

    if let Some((_, first)) = chars.peek().copied() {
        match first {
            '-' => {
                sign = -1;
                chars.next();
            }
            '+' => {
                chars.next();
            }
            _ => {}
        }
    }

    let mut digits = String::new();
    while let Some((_, character)) = chars.peek().copied() {
        if !character.is_ascii_digit() {
            break;
        }
        digits.push(character);
        chars.next();
    }

    if digits.is_empty() {
        return None;
    }

    digits.parse::<i64>().ok().map(|value| sign * value)
}

fn total_count_from_content_range(response: &OutboundResponse) -> Option<usize> {
    let header = response.header("content-range")?;
    let (_, total) = header.rsplit_once('/')?;

    total.parse::<usize>().ok()
}

fn migration_export_auth_error_response(
    error: WorkspacePermissionAuthorizationError,
    spec: MigrationExportSpec,
) -> BackendResponse {
    migration_export_auth_error_response_for_message(error, spec.error_message)
}

fn migration_export_auth_error_response_for_message(
    error: WorkspacePermissionAuthorizationError,
    error_message: &'static str,
) -> BackendResponse {
    match error {
        WorkspacePermissionAuthorizationError::Unauthorized => {
            no_store_response(json_response(401, json!({ "message": "Unauthorized" })))
        }
        WorkspacePermissionAuthorizationError::NotFound => {
            no_store_response(json_response(404, json!({ "message": "Not found" })))
        }
        WorkspacePermissionAuthorizationError::Forbidden => {
            no_store_response(json_response(403, json!({ "message": "Forbidden" })))
        }
        WorkspacePermissionAuthorizationError::Internal => {
            migration_export_error_response(error_message)
        }
    }
}

fn migration_export_error_response(message: &'static str) -> BackendResponse {
    no_store_response(json_response(500, json!({ "message": message })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::outbound::{OutboundFuture, OutboundHeader};
    use std::{cell::RefCell, collections::VecDeque};

    #[derive(Clone, Debug, Eq, PartialEq)]
    struct RecordedOutboundRequest {
        headers: Vec<(String, String)>,
        method: OutboundMethod,
        url: String,
    }

    struct RecordingOutboundClient {
        calls: RefCell<Vec<RecordedOutboundRequest>>,
        responses: RefCell<VecDeque<OutboundResponse>>,
    }

    impl RecordingOutboundClient {
        fn with_responses(responses: Vec<OutboundResponse>) -> Self {
            Self {
                calls: RefCell::new(Vec::new()),
                responses: RefCell::new(VecDeque::from(responses)),
            }
        }

        fn calls(&self) -> Vec<RecordedOutboundRequest> {
            self.calls.borrow().clone()
        }
    }

    impl Default for RecordingOutboundClient {
        fn default() -> Self {
            Self::with_responses(Vec::new())
        }
    }

    impl OutboundHttpClient for RecordingOutboundClient {
        fn send<'a>(&'a self, request: OutboundRequest<'a>) -> OutboundFuture<'a> {
            self.calls.borrow_mut().push(RecordedOutboundRequest {
                headers: recorded_headers(&request.headers),
                method: request.method,
                url: request.url.to_owned(),
            });
            let response = self.responses.borrow_mut().pop_front();

            Box::pin(async move {
                response.ok_or_else(|| {
                    crate::outbound::OutboundError::Transport("missing test response".to_owned())
                })
            })
        }
    }

    #[test]
    fn migration_export_specs_preserve_legacy_route_contracts() {
        assert_eq!(
            MIGRATION_EXPORT_SPECS,
            [
                MigrationExportSpec {
                    error_message: "Error fetching workspace promotions",
                    path: "/api/v1/infrastructure/coupons",
                    table: "workspace_promotions",
                    workspace_filter_column: "ws_id",
                },
                MigrationExportSpec {
                    error_message: "Error fetching external_user_monthly_report_logs",
                    path: "/api/v1/infrastructure/user-monthly-report-logs",
                    table: "external_user_monthly_report_logs_workspace_view",
                    workspace_filter_column: "user_ws_id",
                },
                MigrationExportSpec {
                    error_message: "Error fetching external_user_monthly_reports",
                    path: "/api/v1/infrastructure/user-monthly-reports",
                    table: "external_user_monthly_reports_workspace_view",
                    workspace_filter_column: "user_ws_id",
                },
            ]
        );
    }

    #[tokio::test]
    async fn migration_export_requires_ws_id_before_authorization() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::default();

        let response = handle_infrastructure_migration_export_route(
            &config,
            request(
                "GET",
                USER_MONTHLY_REPORTS_PATH,
                "https://backend.test/api/v1/infrastructure/user-monthly-reports",
            ),
            &outbound,
        )
        .await
        .expect("route response");

        assert_eq!(response.status, 400);
        assert_eq!(response.body, json!({ "message": MISSING_WS_ID_MESSAGE }));
        assert_eq!(outbound.calls().len(), 0);
    }

    #[tokio::test]
    async fn migration_export_queries_private_view_after_permission_check() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(vec![
            outbound_response(200, r#"{"id":"user-1"}"#),
            outbound_response(200, r#"[{"type":"MEMBER"}]"#),
            outbound_response(200, r#"[{"creator_id":"owner-1"}]"#),
            outbound_response(
                200,
                r#"[{"workspace_roles":{"workspace_role_permissions":[{"permission":"manage_external_migrations"}]}}]"#,
            ),
            outbound_response(200, r#"[]"#),
            outbound_response_with_headers(
                200,
                r#"[{"report_id":"report-1"},{"report_id":"report-2"}]"#,
                vec![("content-range".to_owned(), "0-1/2".to_owned())],
            ),
        ]);

        let response = handle_infrastructure_migration_export_route(
            &config,
            request(
                "GET",
                USER_MONTHLY_REPORTS_PATH,
                "https://backend.test/api/v1/infrastructure/user-monthly-reports?ws_id=11111111-1111-4111-8111-111111111111&offset=2&limit=3",
            ),
            &outbound,
        )
        .await
        .expect("route response");

        assert_eq!(response.status, 200);
        assert_eq!(
            response.body,
            json!({
                "data": [
                    { "report_id": "report-1" },
                    { "report_id": "report-2" },
                ],
                "count": 2,
            })
        );

        let calls = outbound.calls();
        assert_eq!(calls.len(), 6);
        let data_call = calls.last().expect("private view call");
        assert_eq!(data_call.method, OutboundMethod::Get);
        assert!(data_call.url.contains(
            "external_user_monthly_reports_workspace_view?select=*&user_ws_id=eq.11111111-1111-4111-8111-111111111111"
        ));
        assert_eq!(
            recorded_header(data_call, "Accept-Profile"),
            Some(PRIVATE_SCHEMA)
        );
        assert_eq!(
            recorded_header(data_call, "Content-Profile"),
            Some(PRIVATE_SCHEMA)
        );
        assert_eq!(recorded_header(data_call, "Range"), Some("2-4"));
        assert_eq!(recorded_header(data_call, "Prefer"), Some("count=exact"));
    }

    #[tokio::test]
    async fn user_coupons_returns_empty_page_when_workspace_has_no_promotions() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(vec![
            outbound_response(200, r#"{"id":"user-1"}"#),
            outbound_response(200, r#"[{"type":"MEMBER"}]"#),
            outbound_response(200, r#"[{"creator_id":"owner-1"}]"#),
            outbound_response(
                200,
                r#"[{"workspace_roles":{"workspace_role_permissions":[{"permission":"manage_external_migrations"}]}}]"#,
            ),
            outbound_response(200, r#"[]"#),
            outbound_response(200, r#"[]"#),
        ]);

        let response = handle_infrastructure_migration_export_route(
            &config,
            request(
                "GET",
                USER_COUPONS_PATH,
                "https://backend.test/api/v1/infrastructure/user-coupons?ws_id=11111111-1111-4111-8111-111111111111",
            ),
            &outbound,
        )
        .await
        .expect("route response");

        assert_eq!(response.status, 200);
        assert_eq!(
            response.body,
            json!({
                "data": [],
                "count": 0,
            })
        );

        let calls = outbound.calls();
        assert_eq!(calls.len(), 6);
        let promotions_call = calls.last().expect("promotions call");
        assert!(promotions_call.url.contains(
            "workspace_promotions?select=id%2C+ws_id&ws_id=eq.11111111-1111-4111-8111-111111111111"
        ));
        assert_eq!(
            recorded_header(promotions_call, "Accept-Profile"),
            Some(PRIVATE_SCHEMA)
        );
        assert_eq!(recorded_header(promotions_call, "Prefer"), None);
    }

    #[tokio::test]
    async fn user_coupons_attaches_workspace_promotion_rows_to_links() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(vec![
            outbound_response(200, r#"{"id":"user-1"}"#),
            outbound_response(200, r#"[{"type":"MEMBER"}]"#),
            outbound_response(200, r#"[{"creator_id":"owner-1"}]"#),
            outbound_response(
                200,
                r#"[{"workspace_roles":{"workspace_role_permissions":[{"permission":"manage_external_migrations"}]}}]"#,
            ),
            outbound_response(200, r#"[]"#),
            outbound_response(
                200,
                r#"[{"id":"promo-1","ws_id":"11111111-1111-4111-8111-111111111111"},{"id":"promo-2","ws_id":"11111111-1111-4111-8111-111111111111"}]"#,
            ),
            outbound_response_with_headers(
                200,
                r#"[{"id":"link-1","promo_id":"promo-1","user_id":"user-2"}]"#,
                vec![("content-range".to_owned(), "4-8/9".to_owned())],
            ),
        ]);

        let response = handle_infrastructure_migration_export_route(
            &config,
            request(
                "GET",
                USER_COUPONS_PATH,
                "https://backend.test/api/v1/infrastructure/user-coupons?ws_id=11111111-1111-4111-8111-111111111111&offset=4&limit=5",
            ),
            &outbound,
        )
        .await
        .expect("route response");

        assert_eq!(response.status, 200);
        assert_eq!(
            response.body,
            json!({
                "data": [
                    {
                        "id": "link-1",
                        "promo_id": "promo-1",
                        "user_id": "user-2",
                        "workspace_promotions": {
                            "ws_id": "11111111-1111-4111-8111-111111111111",
                        },
                    },
                ],
                "count": 9,
            })
        );

        let calls = outbound.calls();
        assert_eq!(calls.len(), 7);
        let links_call = calls.last().expect("linked promotions call");
        assert!(
            links_call
                .url
                .contains("user_linked_promotions?select=*&promo_id=in.%28promo-1%2Cpromo-2%29")
        );
        assert_eq!(
            recorded_header(links_call, "Accept-Profile"),
            Some(PRIVATE_SCHEMA)
        );
        assert_eq!(
            recorded_header(links_call, "Content-Profile"),
            Some(PRIVATE_SCHEMA)
        );
        assert_eq!(recorded_header(links_call, "Range"), Some("4-8"));
        assert_eq!(recorded_header(links_call, "Prefer"), Some("count=exact"));
    }

    fn backend_config_with_contact_data() -> BackendConfig {
        let mut config = BackendConfig::new("test", "backend");
        config.contact_data = contact::ContactDataConfig::new(
            "https://project-ref.supabase.co/",
            "test-service-role-secret",
        );
        config
    }

    fn request(
        method: &'static str,
        path: &'static str,
        url: &'static str,
    ) -> BackendRequest<'static> {
        BackendRequest {
            authorization: Some("Bearer user-access-token"),
            body_text: None,
            cookie: None,
            if_none_match: None,
            method,
            origin: None,
            path,
            referer: None,
            request_id: None,
            url: Some(url),
        }
    }

    fn outbound_response(status: u16, body_text: impl Into<String>) -> OutboundResponse {
        outbound_response_with_headers(status, body_text, Vec::new())
    }

    fn outbound_response_with_headers(
        status: u16,
        body_text: impl Into<String>,
        headers: Vec<(String, String)>,
    ) -> OutboundResponse {
        let mut response_headers = vec![("content-type".to_owned(), APPLICATION_JSON.to_owned())];
        response_headers.extend(headers);

        OutboundResponse {
            body_text: body_text.into(),
            headers: response_headers,
            status,
        }
    }

    fn recorded_headers(headers: &[OutboundHeader<'_>]) -> Vec<(String, String)> {
        headers
            .iter()
            .map(|header| (header.name.to_owned(), header.value.to_owned()))
            .collect()
    }

    fn recorded_header<'a>(request: &'a RecordedOutboundRequest, header: &str) -> Option<&'a str> {
        request
            .headers
            .iter()
            .find(|(name, _)| name.eq_ignore_ascii_case(header))
            .map(|(_, value)| value.as_str())
    }
}
