use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const WATCHER_CONFIG_PATH: &str = "/api/v1/infrastructure/ai-agents/discord-gateway/watcher-config";
const WATCHER_SECRET_NAME: &str = "AI_AGENT_DISCORD_GATEWAY_WATCHER_SECRET";
const AI_AGENT_REGISTRY_PREFIX: &str = "AI_AGENT_REGISTRY";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const DISCORD_ADAPTER: &str = "discord";
const DEPLOYED_STATUS: &str = "deployed";

#[derive(Deserialize)]
struct SecretRow {
    name: Option<String>,
    value: Option<String>,
}

#[derive(Default, Deserialize)]
struct AgentMetaRecord {
    enabled: Option<bool>,
}

#[derive(Default, Deserialize)]
struct ChannelMetaRecord {
    adapter: Option<String>,
    enabled: Option<bool>,
    status: Option<String>,
    #[serde(rename = "webhookUrl")]
    webhook_url: Option<String>,
    #[serde(rename = "workspaceId")]
    workspace_id: Option<String>,
    #[serde(rename = "discordGuildId")]
    discord_guild_id: Option<String>,
    #[serde(rename = "externalChannelId")]
    external_channel_id: Option<String>,
}

#[derive(Serialize)]
struct WatcherTarget {
    #[serde(rename = "agentId")]
    agent_id: String,
    #[serde(rename = "channelId")]
    channel_id: String,
    #[serde(rename = "discordGuildId")]
    discord_guild_id: Option<String>,
    #[serde(rename = "externalChannelId")]
    external_channel_id: Option<String>,
    #[serde(rename = "webhookUrl")]
    webhook_url: Option<String>,
    #[serde(rename = "workspaceId")]
    workspace_id: String,
}

pub(crate) async fn handle_infrastructure_ai_agents_discord_gateway_watcher_config_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != WATCHER_CONFIG_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => watcher_config_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn watcher_config_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Resolve the configured watcher secret from the ROOT workspace_secrets row.
    // Legacy also accepts an env-var override, which is unavailable here.
    let configured_secret = match read_watcher_secret(&config.contact_data, outbound).await {
        Ok(Some(secret)) => secret,
        Ok(None) => {
            return error_response(500, "Discord Gateway watcher secret is not configured");
        }
        Err(()) => {
            return error_response(
                500,
                "Failed to resolve Discord Gateway watcher configuration",
            );
        }
    };

    let Some(bearer_token) = read_bearer_token(request.authorization) else {
        return error_response(401, "Invalid Discord Gateway watcher credentials");
    };

    if !secrets_match(&bearer_token, &configured_secret) {
        return error_response(401, "Invalid Discord Gateway watcher credentials");
    }

    let requested_channel_id = requested_channel_id(request.url);

    let rows = match read_registry_rows(&config.contact_data, outbound).await {
        Ok(rows) => rows,
        Err(()) => {
            return error_response(
                500,
                "Failed to resolve Discord Gateway watcher configuration",
            );
        }
    };

    let targets = build_targets(&rows, requested_channel_id.as_deref());

    no_store_response(json_response(200, json!({ "targets": targets })))
}

fn read_bearer_token(authorization: Option<&str>) -> Option<String> {
    let authorization = authorization.unwrap_or("").trim();
    let mut parts = authorization.split_whitespace();
    let scheme = parts.next()?;

    if !scheme.eq_ignore_ascii_case("bearer") {
        return None;
    }

    let token = parts.collect::<Vec<_>>().join(" ");
    let token = token.trim();

    if token.is_empty() {
        None
    } else {
        Some(token.to_owned())
    }
}

fn secrets_match(candidate: &str, configured: &str) -> bool {
    let candidate = candidate.as_bytes();
    let configured = configured.as_bytes();

    if candidate.len() != configured.len() {
        return false;
    }

    // Constant-time comparison over equal-length byte slices.
    let mut diff = 0u8;
    for (left, right) in candidate.iter().zip(configured.iter()) {
        diff |= left ^ right;
    }

    diff == 0
}

fn requested_channel_id(request_url: Option<&str>) -> Option<String> {
    let url = request_url.and_then(|value| url::Url::parse(value).ok())?;

    url.query_pairs()
        .find(|(key, _)| key == "channelId")
        .map(|(_, value)| value.trim().to_lowercase())
        .filter(|value| !value.is_empty())
}

async fn read_watcher_secret(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "value".to_owned()),
            ("ws_id", format!("eq.{ROOT_WORKSPACE_ID}")),
            ("name", format!("eq.{WATCHER_SECRET_NAME}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<SecretRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.value)
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty()))
}

async fn read_registry_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<SecretRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "name,value".to_owned()),
            ("ws_id", format!("eq.{ROOT_WORKSPACE_ID}")),
            ("name", format!("like.{AI_AGENT_REGISTRY_PREFIX}:%")),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<SecretRow>>().map_err(|_| ())
}

async fn send_service_role_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

// ---- Registry parsing (mirrors registry-codec.ts buildAgentDefinitions) ----

#[derive(Default)]
struct AgentEntry {
    meta: AgentMetaRecord,
    channel_meta: HashMap<String, ChannelMetaRecord>,
}

enum ParsedRow {
    Meta {
        agent_id: String,
    },
    ChannelMeta {
        agent_id: String,
        channel_id: String,
    },
    Other,
}

fn parse_registry_row_name(name: &str) -> ParsedRow {
    let parts: Vec<&str> = name.split(':').collect();

    if parts.first().copied() != Some(AI_AGENT_REGISTRY_PREFIX) {
        return ParsedRow::Other;
    }

    let Some(agent_id) = parts.get(1).copied().filter(|value| !value.is_empty()) else {
        return ParsedRow::Other;
    };

    match parts.get(2).copied() {
        Some("meta") => ParsedRow::Meta {
            agent_id: agent_id.to_owned(),
        },
        Some("channel") => {
            let channel_id = parts.get(3).copied().filter(|value| !value.is_empty());
            if parts.get(4).copied() == Some("meta") {
                if let Some(channel_id) = channel_id {
                    return ParsedRow::ChannelMeta {
                        agent_id: agent_id.to_owned(),
                        channel_id: channel_id.to_owned(),
                    };
                }
            }
            ParsedRow::Other
        }
        _ => ParsedRow::Other,
    }
}

fn build_targets(rows: &[SecretRow], requested_channel_id: Option<&str>) -> Vec<WatcherTarget> {
    let mut agents: HashMap<String, AgentEntry> = HashMap::new();

    for row in rows {
        let Some(name) = row.name.as_deref() else {
            continue;
        };

        match parse_registry_row_name(name) {
            ParsedRow::Meta { agent_id } => {
                let entry = agents.entry(agent_id).or_default();
                entry.meta = parse_meta(row.value.as_deref());
            }
            ParsedRow::ChannelMeta {
                agent_id,
                channel_id,
            } => {
                let entry = agents.entry(agent_id).or_default();
                entry
                    .channel_meta
                    .insert(channel_id, parse_channel_meta(row.value.as_deref()));
            }
            ParsedRow::Other => {}
        }
    }

    // Deterministic ordering: agents by id, channels by id (mirrors localeCompare-ish sort).
    let mut agent_ids: Vec<&String> = agents.keys().collect();
    agent_ids.sort();

    let mut targets = Vec::new();

    for agent_id in agent_ids {
        let entry = &agents[agent_id];
        let agent_enabled = entry.meta.enabled.unwrap_or(true);

        let mut channel_ids: Vec<&String> = entry.channel_meta.keys().collect();
        channel_ids.sort();

        for channel_id in channel_ids {
            let channel = &entry.channel_meta[channel_id];

            let adapter = channel.adapter.as_deref().unwrap_or(DISCORD_ADAPTER);
            let channel_enabled = channel.enabled.unwrap_or(true);
            let status = channel.status.as_deref().unwrap_or("draft");
            let workspace_id = channel
                .workspace_id
                .as_deref()
                .filter(|value| !value.is_empty())
                .unwrap_or(ROOT_WORKSPACE_ID);
            let discord_guild_id = channel.discord_guild_id.as_deref();
            let external_channel_id = channel.external_channel_id.as_deref();
            // Legacy passes a resolved webhook origin into buildAgentDefinitions, so
            // webhookUrl is always truthy when an origin is configured. The backend has
            // no webhook-origin config field; fall back to the stored channel webhookUrl.
            let webhook_url = channel
                .webhook_url
                .as_deref()
                .filter(|value| !value.is_empty());

            if let Some(requested) = requested_channel_id {
                if channel_id.as_str() != requested {
                    continue;
                }
            }

            let passes = agent_enabled
                && adapter == DISCORD_ADAPTER
                && channel_enabled
                && status == DEPLOYED_STATUS
                && workspace_id == ROOT_WORKSPACE_ID
                && discord_guild_id.is_some_and(|value| !value.trim().is_empty())
                && external_channel_id.is_some_and(|value| !value.trim().is_empty())
                && webhook_url.is_some();

            if !passes {
                continue;
            }

            targets.push(WatcherTarget {
                agent_id: agent_id.clone(),
                channel_id: channel_id.clone(),
                discord_guild_id: channel.discord_guild_id.clone(),
                external_channel_id: channel.external_channel_id.clone(),
                webhook_url: channel.webhook_url.clone(),
                workspace_id: workspace_id.to_owned(),
            });
        }
    }

    targets
}

fn parse_meta(value: Option<&str>) -> AgentMetaRecord {
    value
        .and_then(|value| serde_json::from_str(value).ok())
        .unwrap_or_default()
}

fn parse_channel_meta(value: Option<&str>) -> ChannelMetaRecord {
    value
        .and_then(|value| serde_json::from_str(value).ok())
        .unwrap_or_default()
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
