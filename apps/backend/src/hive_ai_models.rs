use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, hive_access,
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const HIVE_AI_MODELS_PATH: &str = "/api/v1/hive/ai/models";
const AI_GATEWAY_MODELS_TABLE: &str = "ai_gateway_models";
const PRIVATE_SCHEMA: &str = "private";
const HIVE_APP_SESSION_TARGETS: [&str; 1] = ["hive"];
const HIVE_AI_MODEL_COLUMNS: &str = concat!(
    "context_window,",
    "description,",
    "id,",
    "is_enabled,",
    "name,",
    "provider,",
    "tags,",
    "type"
);

#[derive(Clone, Debug, Eq, PartialEq)]
struct HiveAiModelsQuery {
    enabled_only: bool,
    type_filter: Option<String>,
}

#[derive(Deserialize)]
struct HiveAiModelRow {
    context_window: Option<i64>,
    description: Option<String>,
    id: String,
    is_enabled: Option<bool>,
    name: Option<String>,
    provider: Option<String>,
    tags: Option<Vec<String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HiveAiModel {
    value: String,
    label: String,
    provider: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    context: Option<i64>,
    disabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    tags: Option<Vec<String>>,
}

pub(crate) async fn handle_hive_ai_models_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != HIVE_AI_MODELS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => hive_ai_models_response(config, request, outbound).await,
        method => method_not_allowed(method, "GET"),
    })
}

async fn hive_ai_models_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let user =
        match hive_access::authenticated_user(config, request, &HIVE_APP_SESSION_TARGETS, outbound)
            .await
        {
            Ok(user) => user,
            Err(()) => return unauthorized_response(),
        };

    let access =
        match hive_access::resolve_hive_access(&config.contact_data, &user.id, outbound).await {
            Ok(access) => access,
            Err(()) => return failed_to_resolve_hive_access_response(),
        };

    if !access.has_access() {
        return hive_access_required_response();
    }

    let query = hive_ai_models_query(request.url);
    let rows = match fetch_hive_ai_models(&config.contact_data, &query, outbound).await {
        Ok(rows) => rows,
        Err(()) => return failed_to_list_models_response(),
    };
    let models = rows.into_iter().map(HiveAiModel::from).collect::<Vec<_>>();

    no_store_response(json_response(
        200,
        json!({
            "models": models,
        }),
    ))
}

async fn fetch_hive_ai_models(
    contact_data: &contact::ContactDataConfig,
    query: &HiveAiModelsQuery,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<HiveAiModelRow>, ()> {
    let Some(url) = contact_data.rest_url(AI_GATEWAY_MODELS_TABLE, &hive_ai_models_params(query))
    else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<HiveAiModelRow>>().map_err(|_| ())
}

fn hive_ai_models_query(request_url: Option<&str>) -> HiveAiModelsQuery {
    let url = request_url.and_then(|url| url::Url::parse(url).ok());
    let enabled_only = query_value(url.as_ref(), "enabled").as_deref() != Some("false");
    let type_param = query_value(url.as_ref(), "type").unwrap_or_else(|| "language".to_owned());

    HiveAiModelsQuery {
        enabled_only,
        type_filter: (type_param != "all").then_some(type_param),
    }
}

fn hive_ai_models_params(query: &HiveAiModelsQuery) -> Vec<(&'static str, String)> {
    let mut params = vec![
        ("select", HIVE_AI_MODEL_COLUMNS.to_owned()),
        ("order", "provider.asc,name.asc".to_owned()),
    ];

    if let Some(type_filter) = &query.type_filter {
        params.push(("type", format!("eq.{type_filter}")));
    }

    if query.enabled_only {
        params.push(("is_enabled", "eq.true".to_owned()));
    }

    params
}

fn query_value(url: Option<&url::Url>, key: &str) -> Option<String> {
    url?.query_pairs()
        .find_map(|(name, value)| (name == key).then(|| value.into_owned()))
}

impl From<HiveAiModelRow> for HiveAiModel {
    fn from(row: HiveAiModelRow) -> Self {
        let fallback_label = row
            .id
            .split_once('/')
            .map(|(_provider, model)| model)
            .filter(|model| !model.is_empty())
            .unwrap_or(&row.id);
        let label = row
            .name
            .as_deref()
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .unwrap_or(fallback_label)
            .to_owned();
        let provider = row
            .provider
            .filter(|provider| !provider.is_empty())
            .or_else(|| row.id.split('/').next().map(str::to_owned))
            .filter(|provider| !provider.is_empty())
            .unwrap_or_else(|| "unknown".to_owned());

        Self {
            context: row.context_window,
            description: row.description,
            disabled: row.is_enabled == Some(false),
            label,
            provider,
            tags: row.tags,
            value: row.id,
        }
    }
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(
        401,
        json!({
            "error": "Unauthorized",
        }),
    ))
}

fn hive_access_required_response() -> BackendResponse {
    no_store_response(json_response(
        403,
        json!({
            "error": "Hive access required",
        }),
    ))
}

fn failed_to_resolve_hive_access_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "error": "Failed to resolve Hive access",
        }),
    ))
}

fn failed_to_list_models_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "error": "Failed to list AI models",
        }),
    ))
}
