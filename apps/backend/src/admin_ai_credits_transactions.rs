use serde::Deserialize;
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    infrastructure_root_auth::ROOT_WORKSPACE_ID,
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const ADMIN_AI_CREDITS_TRANSACTIONS_PATH: &str = "/api/v1/admin/ai-credits/transactions";
const AI_CREDIT_TRANSACTIONS_RPC: &str = "admin_list_ai_credit_transactions";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const ROOT_ADMIN_REQUIRED_MESSAGE: &str = "Root workspace admin required";
const TRANSACTIONS_FAILED_MESSAGE: &str = "Failed to list transactions";

const DEFAULT_PAGE: i64 = 1;
const DEFAULT_LIMIT: i64 = 50;
const MAX_LIMIT: i64 = 100;

// Optional string filters forwarded verbatim to the RPC (query key -> rpc key).
const OPTIONAL_FILTERS: [(&str, &str); 8] = [
    ("ws_id", "p_ws_id"),
    ("user_id", "p_user_id"),
    ("scope", "p_scope"),
    ("transaction_type", "p_transaction_type"),
    ("feature", "p_feature"),
    ("model_id", "p_model_id"),
    ("start_date", "p_start_date"),
    ("end_date", "p_end_date"),
];

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

enum MembershipOutcome {
    Member,
    Forbidden,
    LookupFailed,
}

pub(crate) async fn handle_admin_ai_credits_transactions_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != ADMIN_AI_CREDITS_TRANSACTIONS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => admin_ai_credits_transactions_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn admin_ai_credits_transactions_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    match verify_root_workspace_member(contact_data, outbound, &access_token, &user_id).await {
        MembershipOutcome::Member => {}
        MembershipOutcome::LookupFailed => {
            return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE);
        }
        MembershipOutcome::Forbidden => {
            return message_response(403, ROOT_ADMIN_REQUIRED_MESSAGE);
        }
    }

    let url = request.url.and_then(|url| url::Url::parse(url).ok());

    // page = max(1, page ?? 1); limit = min(100, max(1, limit ?? 50)).
    let page = clamp_min(query_i64(url.as_ref(), "page", DEFAULT_PAGE), 1);
    let limit = MAX_LIMIT.min(clamp_min(
        query_i64(url.as_ref(), "limit", DEFAULT_LIMIT),
        1,
    ));

    let mut rpc_params = Map::new();
    rpc_params.insert("p_page".to_owned(), Value::from(page));
    rpc_params.insert("p_limit".to_owned(), Value::from(limit));
    for (query_key, rpc_key) in OPTIONAL_FILTERS {
        if let Some(value) = optional_query_value(url.as_ref(), query_key) {
            rpc_params.insert(rpc_key.to_owned(), Value::String(value));
        }
    }

    match fetch_transactions(contact_data, outbound, Value::Object(rpc_params)).await {
        Ok(rows) => {
            let total = rows
                .first()
                .and_then(|row| row.get("total_count"))
                .and_then(value_as_i64)
                .unwrap_or(0);
            let data: Vec<Value> = rows
                .into_iter()
                .map(|row| match row {
                    Value::Object(mut map) => {
                        map.remove("total_count");
                        Value::Object(map)
                    }
                    other => other,
                })
                .collect();

            no_store_response(json_response(
                200,
                json!({
                    "data": data,
                    "pagination": { "page": page, "limit": limit, "total": total },
                }),
            ))
        }
        Err(()) => message_response(500, TRANSACTIONS_FAILED_MESSAGE),
    }
}

async fn verify_root_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
    user_id: &str,
) -> MembershipOutcome {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ROOT_WORKSPACE_ID}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return MembershipOutcome::LookupFailed;
    };

    let Some(service_role_key) = contact_data.service_role_key() else {
        return MembershipOutcome::LookupFailed;
    };
    let authorization = format!("Bearer {access_token}");

    let response = match outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
    {
        Ok(response) => response,
        Err(_) => return MembershipOutcome::LookupFailed,
    };

    if !(200..300).contains(&response.status) {
        return MembershipOutcome::LookupFailed;
    }

    let rows = match response.json::<Vec<WorkspaceMembershipRow>>() {
        Ok(rows) => rows,
        Err(_) => return MembershipOutcome::LookupFailed,
    };

    if rows.first().and_then(|row| row.membership_type.as_deref()) == Some("MEMBER") {
        MembershipOutcome::Member
    } else {
        MembershipOutcome::Forbidden
    }
}

async fn fetch_transactions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    rpc_params: Value,
) -> Result<Vec<Value>, ()> {
    let rpc_url = contact_data.rpc_url(AI_CREDIT_TRANSACTIONS_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&rpc_params).map_err(|_| ())?;

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

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    match response.json::<Value>().map_err(|_| ())? {
        Value::Array(rows) => Ok(rows),
        Value::Null => Ok(Vec::new()),
        _ => Err(()),
    }
}

fn optional_query_value(url: Option<&url::Url>, key: &str) -> Option<String> {
    url?.query_pairs()
        .find_map(|(name, value)| (name == key).then(|| value.into_owned()))
        .filter(|value| !value.is_empty())
}

fn query_i64(url: Option<&url::Url>, key: &str, default: i64) -> i64 {
    optional_query_value(url, key)
        .and_then(|value| value.trim().parse::<i64>().ok())
        .unwrap_or(default)
}

fn clamp_min(value: i64, min: i64) -> i64 {
    if value < min { min } else { value }
}

fn value_as_i64(value: &Value) -> Option<i64> {
    match value {
        Value::Number(number) => number
            .as_i64()
            .or_else(|| number.as_f64().map(|f| f as i64)),
        Value::String(text) => text.trim().parse::<i64>().ok(),
        _ => None,
    }
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
