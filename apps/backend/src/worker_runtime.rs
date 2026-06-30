use super::{
    BackendConfig, BackendResponse, RuntimeRequestBodyPlan, RuntimeRequestParts,
    RuntimeResponseHeaderOperation, backend_request_from_runtime_parts,
    buffered_body_text_exceeds_request_body_limit, handle_backend_request, outbound,
    request_body_length_required_response, request_body_too_large_response,
    runtime_request_body_plan, runtime_response_header_operations,
};
use worker::{Env, Request, Response, Result, event};

#[event(fetch)]
pub async fn main(mut request: Request, env: Env, _ctx: worker::Context) -> Result<Response> {
    let config = worker_config(&env);
    let method = request.method().to_string();
    let path = request.path();
    let url = request.url()?.to_string();
    let headers = request.headers();
    let authorization = headers.get("Authorization")?;
    let cookie = headers.get("Cookie")?;
    let origin = headers.get("Origin")?;
    let referer = headers.get("Referer")?;
    let request_id = headers
        .get("X-Request-Id")?
        .or(headers.get("X-Request-ID")?);
    let content_length = headers.get("Content-Length")?;
    let request_parts = RuntimeRequestParts {
        authorization: authorization.as_deref(),
        content_length: content_length.as_deref(),
        cookie: cookie.as_deref(),
        method: &method,
        origin: origin.as_deref(),
        path: &path,
        referer: referer.as_deref(),
        request_id: request_id.as_deref(),
        url: Some(url.as_str()),
    };

    let body_text = match runtime_request_body_plan(&request_parts) {
        RuntimeRequestBodyPlan::RejectLengthRequired => {
            return request_body_length_required_response().into_worker_response();
        }
        RuntimeRequestBodyPlan::RejectTooLarge => {
            return request_body_too_large_response().into_worker_response();
        }
        RuntimeRequestBodyPlan::Buffer => match request.text().await.ok() {
            Some(body_text) if buffered_body_text_exceeds_request_body_limit(&body_text) => {
                return request_body_too_large_response().into_worker_response();
            }
            body_text => body_text,
        },
        RuntimeRequestBodyPlan::Skip => None,
    };

    let outbound = outbound::WorkerFetchOutboundHttpClient;

    handle_backend_request(
        &config,
        backend_request_from_runtime_parts(request_parts, body_text.as_deref()),
        &outbound,
    )
    .await
    .into_worker_response()
}

fn worker_config(env: &Env) -> BackendConfig {
    let environment = var(env, "BACKEND_ENV", "production");
    let inventory_simulated_order_secrets =
        inventory_simulated_order_secrets_from_worker_env(env, &environment);

    BackendConfig {
        app_coordination_secrets: app_coordination_secrets_from_worker_env(env, &environment),
        aurora_external_url: var(env, "AURORA_EXTERNAL_URL", "")
            .trim()
            .trim_end_matches('/')
            .to_owned(),
        aurora_external_workspace_id: var(env, "AURORA_EXTERNAL_WSID", "").trim().to_owned(),
        contact_data: contact_data_config_from_worker_env(env),
        cron_secret: cron_secret_from_worker_env(env),
        deployment_target: "cloudflare-workers".to_owned(),
        discord_app_deployment_url: var(env, "DISCORD_APP_DEPLOYMENT_URL", "")
            .trim()
            .trim_end_matches('/')
            .to_owned(),
        environment,
        inventory_simulated_order_secrets,
        internal_token: var(env, "BACKEND_INTERNAL_TOKEN", ""),
        local_e2e_migration_access: false,
        port: 7820,
        service_name: var(env, "BACKEND_SERVICE_NAME", "backend"),
        cms_app_url: var(env, "CMS_APP_URL", ""),
        next_public_cms_app_url: var(env, "NEXT_PUBLIC_CMS_APP_URL", ""),
    }
}

fn var(env: &Env, name: &str, fallback: &str) -> String {
    env.var(name)
        .map(|value| value.to_string())
        .unwrap_or_else(|_| fallback.to_owned())
}

fn cron_secret_from_worker_env(env: &Env) -> String {
    ["CRON_SECRET", "VERCEL_CRON_SECRET"]
        .iter()
        .map(|key| var(env, key, ""))
        .map(|value| value.trim().to_owned())
        .find(|value| !value.is_empty())
        .unwrap_or_default()
}

fn app_coordination_secrets_from_worker_env(env: &Env, environment: &str) -> Vec<String> {
    let mut secrets = Vec::new();

    for key in super::contact::APP_COORDINATION_SECRET_KEYS {
        let value = var(env, key, "");
        let value = value.trim();
        if !value.is_empty() && !secrets.iter().any(|secret| secret == value) {
            secrets.push(value.to_owned());
        }
    }

    if secrets.is_empty() && !environment.trim().eq_ignore_ascii_case("production") {
        secrets.push(super::contact::LOCAL_DEVELOPMENT_APP_COORDINATION_SECRET.to_owned());
    }

    secrets
}

fn inventory_simulated_order_secrets_from_worker_env(env: &Env, environment: &str) -> Vec<String> {
    let mut secrets = Vec::new();

    for key in super::inventory::INVENTORY_SIMULATED_ORDER_SECRET_KEYS {
        let value = var(env, key, "");
        let value = value.trim();
        if !value.is_empty() && !secrets.iter().any(|secret| secret == value) {
            secrets.push(value.to_owned());
        }
    }

    if secrets.is_empty() && !environment.trim().eq_ignore_ascii_case("production") {
        secrets.push(super::inventory::LOCAL_DEVELOPMENT_SIMULATED_ORDER_SECRET.to_owned());
    }

    secrets
}

fn contact_data_config_from_worker_env(env: &Env) -> super::contact::ContactDataConfig {
    super::contact::ContactDataConfig::new(
        first_var(env, &super::contact::SUPABASE_URL_KEYS),
        first_var(env, &super::contact::SUPABASE_SERVICE_ROLE_KEY_KEYS),
    )
}

fn first_var(env: &Env, keys: &[&str]) -> String {
    keys.iter()
        .map(|key| var(env, key, ""))
        .find(|value| !value.trim().is_empty())
        .unwrap_or_default()
}

impl BackendResponse {
    fn into_worker_response(self) -> Result<Response> {
        let header_operations = runtime_response_header_operations(&self);
        let mut response = if let Some(body_text) = self.body_text {
            Response::ok(body_text)?.with_status(self.status)
        } else if self.body_empty {
            Response::empty()?.with_status(self.status)
        } else {
            Response::from_json(&self.body)?.with_status(self.status)
        };

        for operation in header_operations {
            match operation {
                RuntimeResponseHeaderOperation::Append(name, value) => {
                    response.headers_mut().append(name, value.as_str())?;
                }
                RuntimeResponseHeaderOperation::Set(name, value) => {
                    response.headers_mut().set(name, value.as_str())?;
                }
            }
        }

        Ok(response)
    }
}
