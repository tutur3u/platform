//! config_env helpers extracted from `lib.rs` (pure movement).

use crate::*;

pub(crate) fn path_segments(path: &str) -> Vec<&str> {
    path.trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect()
}

pub(crate) fn authorized(config: &BackendConfig, authorization: Option<&str>) -> bool {
    let expected = format!("Bearer {}", config.internal_token);
    constant_time_eq(
        authorization.unwrap_or_default().as_bytes(),
        expected.as_bytes(),
    )
}

pub(crate) fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    let mut diff = left.len() ^ right.len();
    let max_len = left.len().max(right.len());

    for index in 0..max_len {
        let left_byte = left.get(index).copied().unwrap_or_default();
        let right_byte = right.get(index).copied().unwrap_or_default();
        diff |= usize::from(left_byte ^ right_byte);
    }

    diff == 0
}

pub(crate) fn generated_request_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();

    format!("rust-{nanos:x}")
}

#[cfg(feature = "native")]
pub(crate) fn env(name: &str, fallback: &str) -> String {
    std::env::var(name)
        .unwrap_or_else(|_| fallback.to_owned())
        .trim()
        .to_owned()
}

#[cfg(feature = "native")]
pub(crate) fn cron_secret_from_env() -> String {
    ["CRON_SECRET", "VERCEL_CRON_SECRET"]
        .iter()
        .filter_map(|key| std::env::var(key).ok())
        .map(|value| value.trim().to_owned())
        .find(|value| !value.is_empty())
        .unwrap_or_default()
}

#[cfg(feature = "native")]
pub(crate) fn inventory_simulated_order_secrets_from_env(environment: &str) -> Vec<String> {
    let mut secrets = Vec::new();

    for key in inventory::INVENTORY_SIMULATED_ORDER_SECRET_KEYS {
        let Ok(value) = std::env::var(key) else {
            continue;
        };
        push_unique_secret(&mut secrets, &value);
    }

    if secrets.is_empty() && !environment.trim().eq_ignore_ascii_case("production") {
        secrets.push(inventory::LOCAL_DEVELOPMENT_SIMULATED_ORDER_SECRET.to_owned());
    }

    secrets
}

#[cfg(feature = "native")]
pub(crate) fn push_unique_secret(secrets: &mut Vec<String>, value: &str) {
    let value = value.trim();

    if !value.is_empty() && !secrets.iter().any(|secret| secret == value) {
        secrets.push(value.to_owned());
    }
}

#[cfg(feature = "native")]
pub(crate) fn parse_port(value: &str) -> u16 {
    value
        .trim()
        .trim_start_matches(':')
        .parse::<u16>()
        .unwrap_or(7820)
}

#[cfg(feature = "native")]
pub(crate) fn allows_local_e2e_migration_access() -> bool {
    if !is_truthy_env_value(
        std::env::var("TUTURUUU_LOCAL_E2E_AUTH_BYPASS")
            .ok()
            .as_deref(),
    ) {
        return false;
    }

    if SUPABASE_REFERENCE_KEYS
        .iter()
        .any(|key| is_cloud_supabase_reference(std::env::var(key).ok().as_deref()))
    {
        return false;
    }

    has_only_allowed_origins(&LOCAL_E2E_WEB_URL_KEYS, &SAFE_LOCAL_WEB_ORIGINS)
        && has_only_allowed_origins(&LOCAL_E2E_SUPABASE_URL_KEYS, &SAFE_LOCAL_SUPABASE_ORIGINS)
}

#[cfg(feature = "native")]
pub(crate) fn is_truthy_env_value(value: Option<&str>) -> bool {
    let Some(value) = value else {
        return false;
    };

    TRUTHY_ENV_VALUES.contains(&value.trim().to_ascii_lowercase().as_str())
}

#[cfg(feature = "native")]
pub(crate) fn is_cloud_supabase_reference(value: Option<&str>) -> bool {
    let Some(value) = value else {
        return false;
    };
    let value = value.to_ascii_lowercase();

    value.contains("supabase.co") || value.contains("supabase.in")
}

#[cfg(feature = "native")]
pub(crate) fn has_only_allowed_origins(keys: &[&str], allowed_origins: &[&str]) -> bool {
    let mut has_configured_url = false;

    for key in keys {
        let Ok(value) = std::env::var(key) else {
            continue;
        };
        let value = value.trim();
        if value.is_empty() {
            continue;
        }

        has_configured_url = true;

        let Ok(url) = url::Url::parse(value) else {
            return false;
        };
        let origin = url.origin().ascii_serialization();

        if !allowed_origins.contains(&origin.as_str()) {
            return false;
        }
    }

    has_configured_url
}

pub(crate) fn default_deployment_target() -> &'static str {
    if cfg!(target_arch = "wasm32") {
        "cloudflare-workers"
    } else {
        "container"
    }
}
