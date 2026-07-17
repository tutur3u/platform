//! Core public request/response/config types (extracted from `lib.rs`).

use crate::*;
use serde_json::Value;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BackendConfig {
    pub app_coordination_secrets: Vec<String>,
    pub aurora_external_url: String,
    pub aurora_external_workspace_id: String,
    pub(crate) contact_data: contact::ContactDataConfig,
    pub cron_secret: String,
    pub deployment_target: String,
    pub discord_app_deployment_url: String,
    pub environment: String,
    pub(crate) inventory_simulated_order_secrets: Vec<String>,
    pub internal_token: String,
    pub local_e2e_migration_access: bool,
    pub port: u16,
    pub service_name: String,
    pub cms_app_url: String,
    pub next_public_cms_app_url: String,
}

impl BackendConfig {
    pub fn new(environment: impl Into<String>, service_name: impl Into<String>) -> Self {
        Self {
            app_coordination_secrets: Vec::new(),
            aurora_external_url: String::new(),
            aurora_external_workspace_id: String::new(),
            contact_data: contact::ContactDataConfig::disabled(),
            cron_secret: String::new(),
            deployment_target: default_deployment_target().to_owned(),
            discord_app_deployment_url: String::new(),
            environment: environment.into(),
            inventory_simulated_order_secrets: Vec::new(),
            internal_token: String::new(),
            local_e2e_migration_access: false,
            port: 7820,
            service_name: service_name.into(),
            cms_app_url: String::new(),
            next_public_cms_app_url: String::new(),
        }
    }

    #[cfg(feature = "native")]
    pub fn from_env() -> Self {
        let environment = env("BACKEND_ENV", "development");
        let inventory_simulated_order_secrets =
            inventory_simulated_order_secrets_from_env(&environment);

        Self {
            app_coordination_secrets: contact::app_coordination_secrets_from_env(&environment),
            aurora_external_url: env("AURORA_EXTERNAL_URL", "")
                .trim()
                .trim_end_matches('/')
                .to_owned(),
            aurora_external_workspace_id: env("AURORA_EXTERNAL_WSID", "").trim().to_owned(),
            contact_data: contact::contact_data_config_from_env(),
            cron_secret: cron_secret_from_env(),
            deployment_target: env("BACKEND_DEPLOYMENT_TARGET", default_deployment_target()),
            discord_app_deployment_url: env("DISCORD_APP_DEPLOYMENT_URL", "")
                .trim()
                .trim_end_matches('/')
                .to_owned(),
            environment,
            inventory_simulated_order_secrets,
            internal_token: std::env::var("BACKEND_INTERNAL_TOKEN")
                .unwrap_or_default()
                .trim()
                .to_owned(),
            local_e2e_migration_access: allows_local_e2e_migration_access(),
            port: parse_port(&env("PORT", "7820")),
            service_name: env("BACKEND_SERVICE_NAME", "backend"),
            cms_app_url: env("CMS_APP_URL", ""),
            next_public_cms_app_url: env("NEXT_PUBLIC_CMS_APP_URL", ""),
        }
    }

    pub fn ready(&self) -> bool {
        !self.internal_token.is_empty()
    }

    pub fn toolchain(&self) -> String {
        option_env!("RUSTC_VERSION")
            .unwrap_or("rustc unavailable")
            .to_owned()
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BackendRequest<'a> {
    pub authorization: Option<&'a str>,
    pub body_text: Option<&'a str>,
    pub cookie: Option<&'a str>,
    pub if_none_match: Option<&'a str>,
    pub method: &'a str,
    pub origin: Option<&'a str>,
    pub path: &'a str,
    pub referer: Option<&'a str>,
    pub request_id: Option<&'a str>,
    pub url: Option<&'a str>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BackendResponse {
    pub allow: Option<&'static str>,
    pub body: Value,
    pub body_empty: bool,
    pub body_text: Option<String>,
    pub cache_control: Option<&'static str>,
    pub content_type: Option<&'static str>,
    pub headers: Vec<(&'static str, String)>,
    pub status: u16,
}

pub fn json_security_headers() -> &'static [(&'static str, &'static str)] {
    &JSON_SECURITY_HEADERS
}
