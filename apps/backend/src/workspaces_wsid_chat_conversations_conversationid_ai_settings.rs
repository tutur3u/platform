//! Handler for `GET /api/v1/workspaces/:wsId/chat/conversations/:conversationId/ai-settings`.
//!
//! Ports the GET path of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/chat/conversations/[conversationId]/ai-settings/route.ts`.
//!
//! ## Auth
//!
//! Mirrors `resolveChatRouteContext({ permission: 'view_chat' })` via
//! `finance_auth::authorize_finance_permission`.
//!
//! ## Behavior
//!
//! Two sub-paths depending on the conversation ID prefix:
//!
//! - **Legacy AI chat** (`ai-chat-*` / `legacy-ai-*`): fetches from the public
//!   `ai_chats` table filtered by `creator_id`, then returns a synthesised
//!   settings object.
//! - **Native conversation**: calls the `chat_get_conversation` RPC to verify
//!   the conversation exists and is of type `ai`, then reads
//!   `private.chat_conversation_ai_settings` with a fallback to the legacy
//!   column subset when the schema cache is stale.
//!
//! ## Behavior gaps vs legacy
//!
//! - `normalizeAiModelId` is reproduced inline using the same
//!   `resolveGatewayModelId` / `normalizeStableModelId` rules found in
//!   `packages/ai/src/credits/model-mapping.ts`.
//! - The PATCH method is **not** handled here; `None` is returned so the
//!   request falls through to the Next.js route.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorizationError, authorize_finance_permission},
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const VIEW_CHAT_PERMISSION: &str = "view_chat";
const PRIVATE_SCHEMA: &str = "private";
const CHAT_GET_CONVERSATION_RPC: &str = "chat_get_conversation";
const AI_CHAT_CONVERSATION_PREFIX: &str = "ai-chat-";
const AI_CHAT_COMPAT_CONVERSATION_PREFIX: &str = "legacy-ai-";
const GEMINI_31_FLASH_LITE_PREVIEW_MODEL: &str = "gemini-3.1-flash-lite-preview";
const GEMINI_3_FLASH_MODEL: &str = "gemini-3-flash";
const GEMINI_31_FLASH_LITE_MODEL: &str = "gemini-3.1-flash-lite";
const DEFAULT_GATEWAY_MODEL: &str = "google/gemini-3.1-flash-lite";

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const CONVERSATIONS_SEGMENT: &str = "/chat/conversations/";
const AI_SETTINGS_SUFFIX: &str = "/ai-settings";

struct AiSettingsRoute<'a> {
    ws_id: &'a str,
    conversation_id: &'a str,
}

#[derive(Deserialize)]
struct AiChatRow {
    #[allow(dead_code)]
    id: Option<String>,
    model: Option<String>,
}

#[derive(Deserialize)]
struct ChatConversationRow {
    id: Option<String>,
    #[serde(rename = "type")]
    conversation_type: Option<String>,
}

/// Full select from `private.chat_conversation_ai_settings`.
#[derive(Deserialize)]
struct ChatAiSettingsRow {
    auto_reply: Option<bool>,
    credit_source: Option<String>,
    credit_ws_id: Option<String>,
    enabled: Option<bool>,
    model_id: Option<String>,
    system_prompt: Option<String>,
    thinking_mode: Option<String>,
    updated_at: Option<String>,
}

/// Legacy select (fallback when schema cache is stale).
#[derive(Deserialize)]
struct ChatAiSettingsLegacyRow {
    auto_reply: Option<bool>,
    enabled: Option<bool>,
    model_id: Option<String>,
    system_prompt: Option<String>,
    updated_at: Option<String>,
}

#[derive(Deserialize)]
struct PersonalWorkspaceRow {
    id: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_chat_conversations_conversationid_ai_settings_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let route = parse_ai_settings_route(request.path)?;

    Some(match request.method {
        "GET" => ai_settings_get_response(config, request, &route, outbound).await,
        _ => return None,
    })
}

async fn ai_settings_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    route: &AiSettingsRoute<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let authorization = match authorize_finance_permission(
        config,
        request,
        route.ws_id,
        VIEW_CHAT_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(FinanceAuthorizationError::Unauthorized | FinanceAuthorizationError::NotFound) => {
            return message_response(401, "Unauthorized");
        }
        Err(FinanceAuthorizationError::Forbidden) => {
            return message_response(403, "Insufficient chat permissions");
        }
        Err(FinanceAuthorizationError::Internal) => {
            return message_response(500, "Failed to load AI chat settings");
        }
    };

    let personal_ws_id =
        get_personal_workspace_id(&config.contact_data, outbound, &authorization.user_id).await;

    if is_ai_chat_conversation_id(route.conversation_id) {
        let chat_id = match get_ai_chat_id(route.conversation_id) {
            Some(id) => id,
            None => return message_response(404, "Chat not found"),
        };

        let row = match fetch_ai_chat_row(
            &config.contact_data,
            outbound,
            &chat_id,
            &authorization.user_id,
        )
        .await
        {
            Ok(Some(row)) => row,
            Ok(None) => return message_response(404, "Chat not found"),
            Err(()) => return message_response(500, "Failed to load AI chat settings"),
        };

        let settings = map_legacy_ai_chat_settings(
            route.conversation_id,
            personal_ws_id.as_deref(),
            row.model.as_deref(),
        );
        return no_store_response(json_response(200, json!({ "settings": settings })));
    }

    // Native conversation path.
    let conversation = match call_chat_get_conversation(
        &config.contact_data,
        outbound,
        &authorization.ws_id,
        &authorization.user_id,
        route.conversation_id,
    )
    .await
    {
        Ok(Some(conv)) => conv,
        Ok(None) => return message_response(400, "Conversation is not an AI chat"),
        Err(()) => return message_response(500, "Failed to load AI chat settings"),
    };

    if conversation.conversation_type.as_deref() != Some("ai") {
        return message_response(400, "Conversation is not an AI chat");
    }

    let native_conversation_id = match conversation.id {
        Some(ref id) => id.as_str(),
        None => return message_response(400, "Conversation is not an AI chat"),
    };

    let settings = match fetch_native_ai_settings(
        &config.contact_data,
        outbound,
        native_conversation_id,
        personal_ws_id.as_deref(),
    )
    .await
    {
        Ok(settings) => settings,
        Err(()) => return message_response(500, "Failed to load AI chat settings"),
    };

    no_store_response(json_response(200, json!({ "settings": settings })))
}

async fn get_personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Option<String> {
    // Mirror: sbAdmin.from('workspaces').select('id,workspace_members!inner(user_id)')
    //   .eq('personal', true).eq('workspace_members.user_id', userId).maybeSingle()
    let url = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id,workspace_members!inner(user_id)".to_owned()),
            ("personal", "eq.true".to_owned()),
            ("workspace_members.user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    )?;
    let response = send_service_role_get(contact_data, outbound, &url)
        .await
        .ok()?;
    if !(200..300).contains(&response.status) {
        return None;
    }
    let rows = response.json::<Vec<PersonalWorkspaceRow>>().ok()?;
    rows.into_iter().next().and_then(|row| row.id)
}

async fn fetch_ai_chat_row(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    chat_id: &str,
    user_id: &str,
) -> Result<Option<AiChatRow>, ()> {
    let url = contact_data
        .rest_url(
            "ai_chats",
            &[
                ("select", "id,model".to_owned()),
                ("id", format!("eq.{chat_id}")),
                ("creator_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Ok(None);
    }
    let rows = response.json::<Vec<AiChatRow>>().map_err(|_| ())?;
    Ok(rows.into_iter().next())
}

async fn call_chat_get_conversation(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    actor_user_id: &str,
    conversation_id: &str,
) -> Result<Option<ChatConversationRow>, ()> {
    let rpc_url = contact_data.rpc_url(CHAT_GET_CONVERSATION_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization_header = format!("Bearer {service_role_key}");
    let body = json!({
        "p_actor_user_id": actor_user_id,
        "p_conversation_id": conversation_id,
        "p_ws_id": ws_id,
    })
    .to_string();

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization_header)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let value = response.json::<Value>().map_err(|_| ())?;
    if value.is_null() {
        return Ok(None);
    }
    let row = serde_json::from_value::<ChatConversationRow>(value).map_err(|_| ())?;
    Ok(Some(row))
}

async fn fetch_native_ai_settings(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    conversation_id: &str,
    personal_ws_id: Option<&str>,
) -> Result<Value, ()> {
    // Try full select first.
    let full_url = contact_data.rest_url(
        "chat_conversation_ai_settings",
        &[
            (
                "select",
                "conversation_id,model_id,system_prompt,auto_reply,enabled,thinking_mode,credit_source,credit_ws_id,updated_at".to_owned(),
            ),
            ("conversation_id", format!("eq.{conversation_id}")),
            ("limit", "1".to_owned()),
        ],
    ).ok_or(())?;

    let response = send_private_schema_get(contact_data, outbound, &full_url).await?;
    if (200..300).contains(&response.status)
        && let Ok(rows) = response.json::<Vec<ChatAiSettingsRow>>()
    {
        let row = rows.into_iter().next();
        return Ok(map_chat_ai_settings_row(
            conversation_id,
            personal_ws_id,
            row.as_ref(),
        ));
    }

    // Schema cache may be stale — fall back to legacy column subset.
    let legacy_url = contact_data
        .rest_url(
            "chat_conversation_ai_settings",
            &[
                (
                    "select",
                    "conversation_id,model_id,system_prompt,auto_reply,enabled,updated_at"
                        .to_owned(),
                ),
                ("conversation_id", format!("eq.{conversation_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let legacy_response = send_private_schema_get(contact_data, outbound, &legacy_url).await?;
    if !(200..300).contains(&legacy_response.status) {
        return Err(());
    }
    let rows = legacy_response
        .json::<Vec<ChatAiSettingsLegacyRow>>()
        .map_err(|_| ())?;
    let row = rows.into_iter().next();
    Ok(map_chat_ai_settings_row_legacy(
        conversation_id,
        personal_ws_id,
        row.as_ref(),
    ))
}

fn map_legacy_ai_chat_settings(
    conversation_id: &str,
    personal_ws_id: Option<&str>,
    raw_model: Option<&str>,
) -> Value {
    json!({
        "autoReply": true,
        "conversationId": conversation_id,
        "creditSource": "workspace",
        "creditWsId": null,
        "enabled": true,
        "modelId": normalize_ai_model_id(raw_model),
        "personalWorkspaceId": personal_ws_id,
        "systemPrompt": null,
        "thinkingMode": "fast",
        "updatedAt": null,
    })
}

fn map_chat_ai_settings_row(
    conversation_id: &str,
    personal_ws_id: Option<&str>,
    row: Option<&ChatAiSettingsRow>,
) -> Value {
    json!({
        "autoReply": row.and_then(|r| r.auto_reply).unwrap_or(true),
        "conversationId": conversation_id,
        "creditSource": row.and_then(|r| r.credit_source.as_deref()).unwrap_or("workspace"),
        "creditWsId": row.and_then(|r| r.credit_ws_id.as_deref()),
        "enabled": row.and_then(|r| r.enabled).unwrap_or(true),
        "modelId": normalize_ai_model_id(row.and_then(|r| r.model_id.as_deref())),
        "personalWorkspaceId": personal_ws_id,
        "systemPrompt": row.and_then(|r| r.system_prompt.as_deref()),
        "thinkingMode": row.and_then(|r| r.thinking_mode.as_deref()).unwrap_or("fast"),
        "updatedAt": row.and_then(|r| r.updated_at.as_deref()),
    })
}

fn map_chat_ai_settings_row_legacy(
    conversation_id: &str,
    personal_ws_id: Option<&str>,
    row: Option<&ChatAiSettingsLegacyRow>,
) -> Value {
    json!({
        "autoReply": row.and_then(|r| r.auto_reply).unwrap_or(true),
        "conversationId": conversation_id,
        "creditSource": "workspace",
        "creditWsId": Value::Null,
        "enabled": row.and_then(|r| r.enabled).unwrap_or(true),
        "modelId": normalize_ai_model_id(row.and_then(|r| r.model_id.as_deref())),
        "personalWorkspaceId": personal_ws_id,
        "systemPrompt": row.and_then(|r| r.system_prompt.as_deref()),
        "thinkingMode": "fast",
        "updatedAt": row.and_then(|r| r.updated_at.as_deref()),
    })
}

/// Mirrors `normalizeAiModelId` from `packages/ai/src/credits/model-mapping.ts`.
///
/// Rules:
///
/// - Empty / blank input → `"google/gemini-3.1-flash-lite"`.
/// - Strip provider prefix when detecting retired bare names, then renormalize.
/// - `gemini-3.1-flash-lite-preview` and `gemini-3-flash` (bare) →
///   `gemini-3.1-flash-lite`.
/// - If the result already contains `/`, return it as-is (already gateway
///   format).
/// - Otherwise prepend `"google/"`.
fn normalize_ai_model_id(raw: Option<&str>) -> String {
    let trimmed = raw.map(str::trim).unwrap_or("");
    if trimmed.is_empty() {
        return DEFAULT_GATEWAY_MODEL.to_owned();
    }
    let stable = normalize_stable_model_id(trimmed);
    if stable.contains('/') {
        stable
    } else {
        format!("google/{stable}")
    }
}

/// Mirrors `normalizeStableModelId`: replaces retired model aliases.
fn normalize_stable_model_id(model_id: &str) -> String {
    let slash_pos = model_id.find('/');
    let (provider_prefix, bare) = match slash_pos {
        Some(pos) => (&model_id[..=pos], &model_id[pos + 1..]),
        None => ("", model_id),
    };

    if bare == GEMINI_31_FLASH_LITE_PREVIEW_MODEL || bare == GEMINI_3_FLASH_MODEL {
        return format!("{provider_prefix}{GEMINI_31_FLASH_LITE_MODEL}");
    }
    model_id.to_owned()
}

fn is_ai_chat_conversation_id(conversation_id: &str) -> bool {
    conversation_id.starts_with(AI_CHAT_CONVERSATION_PREFIX)
        || conversation_id.starts_with(AI_CHAT_COMPAT_CONVERSATION_PREFIX)
}

fn get_ai_chat_id(conversation_id: &str) -> Option<String> {
    if let Some(chat_id) = conversation_id.strip_prefix(AI_CHAT_CONVERSATION_PREFIX) {
        return Some(chat_id.to_owned());
    }
    if let Some(chat_id) = conversation_id.strip_prefix(AI_CHAT_COMPAT_CONVERSATION_PREFIX) {
        return Some(chat_id.to_owned());
    }
    None
}

fn parse_ai_settings_route(path: &str) -> Option<AiSettingsRoute<'_>> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let (ws_id, after_ws) = rest.split_once(CONVERSATIONS_SEGMENT)?;
    let conversation_id = after_ws.strip_suffix(AI_SETTINGS_SUFFIX)?;

    if ws_id.is_empty()
        || ws_id.contains('/')
        || conversation_id.is_empty()
        || conversation_id.contains('/')
    {
        return None;
    }

    Some(AiSettingsRoute {
        ws_id,
        conversation_id,
    })
}

async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<crate::outbound::OutboundResponse, ()> {
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

async fn send_private_schema_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<crate::outbound::OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA),
        )
        .await
        .map_err(|_| ())
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_route_extracts_ws_and_conversation_ids() {
        let route = parse_ai_settings_route(
            "/api/v1/workspaces/ws-123/chat/conversations/conv-456/ai-settings",
        )
        .unwrap();
        assert_eq!(route.ws_id, "ws-123");
        assert_eq!(route.conversation_id, "conv-456");
    }

    #[test]
    fn parse_route_rejects_wrong_suffix() {
        assert!(
            parse_ai_settings_route("/api/v1/workspaces/ws-123/chat/conversations/conv-456/other")
                .is_none()
        );
    }

    #[test]
    fn parse_route_rejects_extra_segments() {
        assert!(
            parse_ai_settings_route(
                "/api/v1/workspaces/ws-123/chat/conversations/conv-456/extra/ai-settings"
            )
            .is_none()
        );
    }

    #[test]
    fn is_ai_chat_id_detects_both_prefixes() {
        assert!(is_ai_chat_conversation_id("ai-chat-abc"));
        assert!(is_ai_chat_conversation_id("legacy-ai-abc"));
        assert!(!is_ai_chat_conversation_id("native-abc"));
    }

    #[test]
    fn get_ai_chat_id_strips_prefix() {
        assert_eq!(get_ai_chat_id("ai-chat-abc").unwrap(), "abc");
        assert_eq!(get_ai_chat_id("legacy-ai-xyz").unwrap(), "xyz");
        assert!(get_ai_chat_id("native-abc").is_none());
    }

    #[test]
    fn normalize_model_id_handles_empty_and_null() {
        assert_eq!(normalize_ai_model_id(None), DEFAULT_GATEWAY_MODEL);
        assert_eq!(normalize_ai_model_id(Some("")), DEFAULT_GATEWAY_MODEL);
        assert_eq!(normalize_ai_model_id(Some("  ")), DEFAULT_GATEWAY_MODEL);
    }

    #[test]
    fn normalize_model_id_prepends_google_for_bare_names() {
        assert_eq!(
            normalize_ai_model_id(Some("gemini-2.5-flash")),
            "google/gemini-2.5-flash"
        );
    }

    #[test]
    fn normalize_model_id_passes_through_gateway_format() {
        assert_eq!(
            normalize_ai_model_id(Some("openai/gpt-4o")),
            "openai/gpt-4o"
        );
    }

    #[test]
    fn normalize_model_id_replaces_retired_aliases() {
        assert_eq!(
            normalize_ai_model_id(Some("gemini-3.1-flash-lite-preview")),
            "google/gemini-3.1-flash-lite"
        );
        assert_eq!(
            normalize_ai_model_id(Some("gemini-3-flash")),
            "google/gemini-3.1-flash-lite"
        );
        // Retired alias with existing provider prefix.
        assert_eq!(
            normalize_ai_model_id(Some("google/gemini-3-flash")),
            "google/gemini-3.1-flash-lite"
        );
    }

    #[test]
    fn map_legacy_ai_chat_settings_shape() {
        let settings = map_legacy_ai_chat_settings(
            "ai-chat-abc",
            Some("ws-personal"),
            Some("gemini-2.5-flash"),
        );
        assert_eq!(settings["autoReply"], true);
        assert_eq!(settings["conversationId"], "ai-chat-abc");
        assert_eq!(settings["creditSource"], "workspace");
        assert_eq!(settings["creditWsId"], Value::Null);
        assert_eq!(settings["enabled"], true);
        assert_eq!(settings["modelId"], "google/gemini-2.5-flash");
        assert_eq!(settings["personalWorkspaceId"], "ws-personal");
        assert_eq!(settings["systemPrompt"], Value::Null);
        assert_eq!(settings["thinkingMode"], "fast");
        assert_eq!(settings["updatedAt"], Value::Null);
    }
}
