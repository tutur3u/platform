use super::*;

const CACHE_RPC: &str = "get_external_project_storage_analytics";
const DRIVE_SECRETS: [&str; 5] = [
    "DRIVE_STORAGE_PROVIDER",
    "DRIVE_R2_BUCKET",
    "DRIVE_R2_ENDPOINT",
    "DRIVE_R2_ACCESS_KEY_ID",
    "DRIVE_R2_SECRET_ACCESS_KEY",
];

pub(super) async fn is_r2_active(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            "workspace_secrets",
            &[
                ("select", "name,value".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("name", format!("in.({})", DRIVE_SECRETS.join(","))),
                ("order", "created_at.asc".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    let secrets = response.json::<Vec<SecretRow>>().map_err(|_| ())?;
    Ok(configured_r2(&secrets))
}

fn configured_r2(secrets: &[SecretRow]) -> bool {
    let value = |name: &str| {
        secrets
            .iter()
            .find(|row| row.name.as_deref() == Some(name))
            .and_then(|row| row.value.as_deref())
            .map(str::trim)
            .filter(|value| !value.is_empty())
    };
    value(DRIVE_SECRETS[0]).is_some_and(|provider| provider.eq_ignore_ascii_case("r2"))
        && DRIVE_SECRETS[1..].iter().all(|name| value(name).is_some())
}

pub(super) async fn cached_analytics(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    adapter: &str,
    quota: i64,
) -> Result<Option<serde_json::Value>, ()> {
    let url = contact_data.rpc_url(CACHE_RPC).ok_or(())?;
    let service_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_key}");
    let body = json!({ "p_ws_id": ws_id, "p_adapter": adapter }).to_string();
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_key)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;
    cache_response(&response, quota)
}

fn cache_response(
    response: &OutboundResponse,
    quota: i64,
) -> Result<Option<serde_json::Value>, ()> {
    let payload = response.json::<serde_json::Value>().map_err(|_| ())?;
    if !is_success(response.status) {
        return match payload.get("code").and_then(serde_json::Value::as_str) {
            Some("PGRST202" | "42883") => Ok(None),
            _ => Err(()),
        };
    }
    if payload.is_null() {
        return Ok(None);
    }
    if payload.get("largestFile").is_none() || payload.get("smallestFile").is_none() {
        return Err(());
    }
    let cached: CachedAnalytics = serde_json::from_value(payload).map_err(|_| ())?;
    if !cached.valid() {
        return Err(());
    }
    let percentage = super::compute_usage_percentage(cached.total_size, quota as f64);
    let mut result = serde_json::to_value(cached).map_err(|_| ())?;
    let object = result.as_object_mut().ok_or(())?;
    object.insert("storageLimit".to_owned(), json!(quota));
    object.insert("usagePercentage".to_owned(), json!(percentage));
    Ok(Some(result))
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CachedAnalytics {
    total_size: f64,
    file_count: f64,
    scanned_object_limit: f64,
    truncated: bool,
    largest_file: Option<CachedFile>,
    smallest_file: Option<CachedFile>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CachedFile {
    name: String,
    size: f64,
    created_at: String,
}

impl CachedAnalytics {
    fn valid(&self) -> bool {
        self.total_size.is_finite()
            && self.total_size >= 0.0
            && self.file_count.is_finite()
            && self.file_count >= 0.0
            && self.file_count.fract() == 0.0
            && self.scanned_object_limit.is_finite()
            && self.scanned_object_limit > 0.0
            && self.scanned_object_limit.fract() == 0.0
            && self
                .largest_file
                .iter()
                .chain(self.smallest_file.iter())
                .all(|file| file.size.is_finite() && file.size >= 0.0)
    }
}

#[cfg(test)]
mod tests;
