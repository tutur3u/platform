use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorization, FinanceAuthorizationError, authorize_finance_permission},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const FILTER_USERS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const FILTER_USERS_PATH_SUFFIX: &str = "/finance/filter-users";
const INVOICE_CREATORS_ERROR_MESSAGE: &str = "Failed to fetch invoice creators";
const TRANSACTION_CREATORS_ERROR_MESSAGE: &str = "Failed to fetch transaction creators";
const VIEW_TRANSACTIONS_PERMISSION: &str = "view_transactions";
const WORKSPACE_USERS_ERROR_MESSAGE: &str = "Failed to fetch workspace users";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum FilterUsersKind {
    InvoiceCreators,
    TransactionCreators,
    WorkspaceUsers,
}

enum RestAuth<'a> {
    AccessToken(&'a str),
    ServiceRole,
}

pub(crate) async fn handle_finance_filter_users_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = filter_users_ws_id(request.path)?;

    Some(match request.method {
        "GET" => filter_users_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn filter_users_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let kind = filter_users_kind_from_url(request.url);
    let authorization = match authorize_finance_permission(
        config,
        request,
        raw_ws_id,
        VIEW_TRANSACTIONS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(FinanceAuthorizationError::Unauthorized | FinanceAuthorizationError::NotFound) => {
            return unauthorized_response(401);
        }
        Err(FinanceAuthorizationError::Forbidden) => return unauthorized_response(403),
        Err(FinanceAuthorizationError::Internal) => return filter_users_error_response(kind),
    };

    match fetch_filter_users(&config.contact_data, outbound, &authorization, kind).await {
        Ok(users) => no_store_response(json_response(200, json!({ "users": users }))),
        Err(()) => filter_users_error_response(kind),
    }
}

async fn fetch_filter_users(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    kind: FilterUsersKind,
) -> Result<Value, ()> {
    match kind {
        FilterUsersKind::TransactionCreators => {
            fetch_rest_rows(
                contact_data,
                outbound,
                "distinct_transaction_creators",
                &[
                    ("select", "id,display_name".to_owned()),
                    ("ws_id", format!("eq.{}", authorization.ws_id)),
                ],
                &RestAuth::ServiceRole,
            )
            .await
        }
        FilterUsersKind::InvoiceCreators => {
            fetch_rest_rows(
                contact_data,
                outbound,
                "distinct_invoice_creators",
                &[
                    ("select", "id,display_name".to_owned()),
                    ("ws_id", format!("eq.{}", authorization.ws_id)),
                ],
                &RestAuth::ServiceRole,
            )
            .await
        }
        FilterUsersKind::WorkspaceUsers => {
            let auth = authorization
                .access_token
                .as_deref()
                .map_or(RestAuth::ServiceRole, RestAuth::AccessToken);
            fetch_rest_rows(
                contact_data,
                outbound,
                "workspace_users",
                &[
                    (
                        "select",
                        "id,full_name,display_name,email,avatar_url".to_owned(),
                    ),
                    ("ws_id", format!("eq.{}", authorization.ws_id)),
                    ("order", "full_name.asc".to_owned()),
                ],
                &auth,
            )
            .await
        }
    }
}

async fn fetch_rest_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    params: &[(&str, String)],
    auth: &RestAuth<'_>,
) -> Result<Value, ()> {
    let url = contact_data.rest_url(table, params).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = match auth {
        RestAuth::AccessToken(access_token) => format!("Bearer {access_token}"),
        RestAuth::ServiceRole => format!("Bearer {service_role_key}"),
    };
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Value>().map_err(|_| ())?;
    if rows.is_array() { Ok(rows) } else { Err(()) }
}

fn filter_users_kind_from_url(request_url: Option<&str>) -> FilterUsersKind {
    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return FilterUsersKind::WorkspaceUsers;
    };

    match url
        .query_pairs()
        .find(|(key, _)| key == "type")
        .map(|(_, value)| value.into_owned())
    {
        Some(value) if value == "transaction_creators" => FilterUsersKind::TransactionCreators,
        Some(value) if value == "invoice_creators" => FilterUsersKind::InvoiceCreators,
        _ => FilterUsersKind::WorkspaceUsers,
    }
}

fn filter_users_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(FILTER_USERS_PATH_PREFIX)?
        .strip_suffix(FILTER_USERS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn unauthorized_response(status: u16) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": "Unauthorized" })))
}

fn filter_users_error_response(kind: FilterUsersKind) -> BackendResponse {
    let message = match kind {
        FilterUsersKind::InvoiceCreators => INVOICE_CREATORS_ERROR_MESSAGE,
        FilterUsersKind::TransactionCreators => TRANSACTION_CREATORS_ERROR_MESSAGE,
        FilterUsersKind::WorkspaceUsers => WORKSPACE_USERS_ERROR_MESSAGE,
    };

    no_store_response(json_response(500, json!({ "message": message })))
}
