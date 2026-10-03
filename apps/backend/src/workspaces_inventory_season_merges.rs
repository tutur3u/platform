//! Source mirror only; Web remains the live API runtime.
mod authorization;
mod response_validation;
#[cfg(test)]
mod tests;
#[cfg(all(test, feature = "native"))]
mod tests_transport;
mod validation;
use crate::outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest};
use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, json_response,
    no_store_response,
};
use serde_json::{Value, json};

pub(crate) async fn handle_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws = validation::ws(request.path)?;
    // Unowned methods continue to Web rather than intercepting them.
    if !["GET", "POST"].contains(&request.method) {
        return None;
    }
    let (ws, actor) = match authorization::authorize(config, request, raw_ws, outbound).await {
        Ok(value) => value,
        Err(status) => {
            return Some(response(
                status,
                json!({"message":match status {401=>"Unauthorized",403=>"Forbidden",404=>"Not found",_=>"Failed to verify workspace access"}}),
            ));
        }
    };
    let Some(mut args) = validation::input(request) else {
        return Some(response(
            400,
            json!({"message":"Choose different seasons and explicit valid merge policies."}),
        ));
    };
    // Actor/workspace come from authenticated membership and roles, never query IDs.
    args["p_ws_id"] = json!(ws);
    args["p_actor_id"] = json!(actor);
    if !matches!(
        rpc(
            config,
            outbound,
            "inventory_season_merge_schema_ready",
            json!({})
        )
        .await,
        Ok(Value::Bool(true))
    ) {
        return Some(failure(Some("55000")));
    }
    let function = if request.method == "POST" {
        "apply_inventory_season_merge"
    } else {
        "preview_inventory_season_merge"
    };
    Some(match rpc(config, outbound, function, args).await {
        Ok(data) if response_validation::valid(&data, request.method == "POST") => {
            response(200, data)
        }
        Ok(_) => failure(None),
        Err(code) => failure(code.as_deref()),
    })
}
async fn rpc(
    config: &BackendConfig,
    outbound: &impl OutboundHttpClient,
    function: &str,
    args: Value,
) -> Result<Value, Option<String>> {
    let key = config.contact_data.service_role_key().ok_or(None)?;
    let url = config.contact_data.rpc_url(function).ok_or(None)?;
    let auth = format!("Bearer {key}");
    let body = args.to_string();
    let result = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Authorization", &auth)
                .with_header("apikey", key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Accept-Profile", "private")
                .with_header("Content-Profile", "private")
                .with_body(&body),
        )
        .await
        .map_err(|_| None)?;
    let data: Value = result.json().map_err(|_| None)?;
    if !(200..300).contains(&result.status) {
        return Err(data.get("code").and_then(Value::as_str).map(str::to_owned));
    }
    Ok(data)
}
fn response(status: u16, body: Value) -> BackendResponse {
    let mut response = no_store_response(json_response(status, body));
    response.cache_control = Some("no-store");
    response
}
fn failure(code: Option<&str>) -> BackendResponse {
    let (status, message) = match code.unwrap_or("") {
        "40001" | "40P01" | "55P03" | "23514" | "23505" | "23P01" => (
            409,
            "Season changed or conflicts remain. Refresh the merge preview.",
        ),
        "23503" => (404, "Selected season not found."),
        "42501" => (403, "Forbidden"),
        "PGRST202" | "PGRST106" | "42883" | "42P01" | "42703" | "55000" => {
            (503, "Season merging is not ready yet.")
        }
        _ => (500, "Unable to merge seasons."),
    };
    response(status, json!({"message":message}))
}
