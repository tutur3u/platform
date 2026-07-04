use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorizationError, authorize_scoped_app_permission},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

// Mirrors the legacy GET handler at
// apps/web/src/app/api/v1/workspaces/[wsId]/chat/conversations/[conversationId]/ai-observability/route.ts

const VIEW_CHAT_PERMISSION: &str = "view_chat";
const CHAT_APP_SESSION_TARGETS: [&str; 1] = ["chat"];
const PRIVATE_SCHEMA: &str = "private";
const CHAT_GET_CONVERSATION_RPC: &str = "chat_get_conversation";

const AI_CHAT_CONVERSATION_PREFIX: &str = "ai-chat-";
const AI_CHAT_COMPAT_CONVERSATION_PREFIX: &str = "legacy-ai-";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient chat permissions";
const NOT_AI_CHAT_MESSAGE: &str = "Conversation is not an AI chat";
const FAILED_MESSAGE: &str = "Failed to load AI chat observability";

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const CONVERSATIONS_SEGMENT: &str = "/chat/conversations/";
const OBSERVABILITY_SUFFIX: &str = "/ai-observability";

struct ObservabilityRoute<'a> {
    ws_id: &'a str,
    conversation_id: &'a str,
}

#[derive(Deserialize)]
struct AiChatIdRow {
    #[allow(dead_code)]
    id: Option<String>,
}

#[derive(Deserialize)]
struct ChatConversationRow {
    id: Option<String>,
    #[serde(rename = "type")]
    conversation_type: Option<String>,
}

#[derive(Deserialize)]
struct AiMessageRow {
    id: String,
    content: Option<String>,
    created_at: String,
    metadata: Option<Value>,
    model: Option<String>,
    role: String,
    prompt_tokens: Option<i64>,
    completion_tokens: Option<i64>,
}

#[derive(Deserialize)]
struct CreditTransactionRow {
    chat_message_id: Option<String>,
    cost_usd: Option<Value>,
    input_tokens: Option<i64>,
    output_tokens: Option<i64>,
    reasoning_tokens: Option<i64>,
    image_count: Option<i64>,
    search_count: Option<i64>,
}

#[derive(Clone, Copy, Default)]
struct TokenUsage {
    cached_input_tokens: f64,
    cached_output_tokens: f64,
    cost_usd: f64,
    image_input_count: f64,
    image_output_count: f64,
    input_tokens: f64,
    output_tokens: f64,
    reasoning_tokens: f64,
    search_count: f64,
}

impl TokenUsage {
    fn total_tokens(&self) -> f64 {
        self.input_tokens
            + self.output_tokens
            + self.reasoning_tokens
            + self.cached_input_tokens
            + self.cached_output_tokens
    }

    fn to_json(self) -> Value {
        json!({
            "cachedInputTokens": self.cached_input_tokens,
            "cachedOutputTokens": self.cached_output_tokens,
            "costUsd": self.cost_usd,
            "imageInputCount": self.image_input_count,
            "imageOutputCount": self.image_output_count,
            "inputTokens": self.input_tokens,
            "outputTokens": self.output_tokens,
            "reasoningTokens": self.reasoning_tokens,
            "searchCount": self.search_count,
            "totalTokens": self.total_tokens(),
        })
    }
}

pub(crate) async fn handle_workspaces_chat_conversations_conversationid_ai_observability_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let route = parse_observability_route(request.path)?;

    Some(match request.method {
        "GET" => observability_response(config, request, &route, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn observability_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    route: &ObservabilityRoute<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Mirror resolveChatRouteContext({ permission: 'view_chat' }): authenticate,
    // normalize the workspace id, then require view_chat before any data read.
    let authorization = match authorize_scoped_app_permission(
        config,
        request,
        route.ws_id,
        VIEW_CHAT_PERMISSION,
        &CHAT_APP_SESSION_TARGETS,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(FinanceAuthorizationError::Unauthorized | FinanceAuthorizationError::NotFound) => {
            return message_response(401, UNAUTHORIZED_MESSAGE);
        }
        Err(FinanceAuthorizationError::Forbidden) => {
            return message_response(403, INSUFFICIENT_PERMISSIONS_MESSAGE);
        }
        Err(FinanceAuthorizationError::Internal) => {
            return error_response(500, FAILED_MESSAGE);
        }
    };

    let chat_id = match resolve_observable_ai_chat_id(
        &config.contact_data,
        outbound,
        &authorization.ws_id,
        &authorization.user_id,
        route.conversation_id,
    )
    .await
    {
        Ok(Some(chat_id)) => chat_id,
        Ok(None) => return message_response(400, NOT_AI_CHAT_MESSAGE),
        Err(()) => return error_response(500, FAILED_MESSAGE),
    };

    let messages = match list_ai_messages(&config.contact_data, outbound, &chat_id).await {
        Ok(messages) => messages,
        // listAiMessages rethrows on error -> caught by chatRpcErrorResponse (500).
        Err(()) => return error_response(500, FAILED_MESSAGE),
    };

    let message_ids: Vec<&str> = messages.iter().map(|message| message.id.as_str()).collect();
    // listAiCreditTransactions swallows errors and returns [].
    let transactions = list_ai_credit_transactions(&config.contact_data, outbound, &message_ids)
        .await
        .unwrap_or_default();

    let context_breakdown = build_context_breakdown(&messages);
    let message_usages: Vec<Value> = messages
        .iter()
        .map(|message| {
            let message_transactions: Vec<&CreditTransactionRow> = transactions
                .iter()
                .filter(|transaction| {
                    transaction.chat_message_id.as_deref() == Some(message.id.as_str())
                })
                .collect();
            map_message_usage(&context_breakdown, message, &message_transactions)
        })
        .collect();

    let totals_usage = sum_usage(message_usages.iter().map(usage_from_message));
    let mut totals = totals_usage.to_json();
    if let Value::Object(map) = &mut totals {
        map.insert("messageCount".to_owned(), json!(messages.len()));
    }

    no_store_response(json_response(
        200,
        json!({
            "observability": {
                "contextBreakdown": context_breakdown,
                "messages": message_usages,
                "totals": totals,
            }
        }),
    ))
}

async fn resolve_observable_ai_chat_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    actor_user_id: &str,
    conversation_id: &str,
) -> Result<Option<String>, ()> {
    if is_ai_chat_conversation_id(conversation_id) {
        let Some(chat_id) = get_ai_chat_id(conversation_id) else {
            return Ok(None);
        };

        let can_access =
            can_access_ai_chat_conversation(contact_data, outbound, &chat_id, actor_user_id)
                .await?;

        return Ok(can_access.then_some(chat_id));
    }

    let conversation = call_chat_get_conversation(
        contact_data,
        outbound,
        ws_id,
        actor_user_id,
        conversation_id,
    )
    .await?;

    Ok(match conversation {
        Some(conversation) if conversation.conversation_type.as_deref() == Some("ai") => {
            conversation.id
        }
        _ => None,
    })
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

/// Mirrors canAccessAiChatConversation: the chat exists and was created by the
/// actor. The legacy code uses the caller's RLS client; here we use the service
/// role but keep the explicit creator_id guard so the check is equivalent.
async fn can_access_ai_chat_conversation(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    chat_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "ai_chats",
        &[
            ("select", "id".to_owned()),
            ("id", format!("eq.{chat_id}")),
            ("creator_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        // maybeSingle returns { data: null, error } -> canAccess === false.
        return Ok(false);
    }

    Ok(!response
        .json::<Vec<AiChatIdRow>>()
        .map_err(|_| ())?
        .is_empty())
}

async fn call_chat_get_conversation(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    actor_user_id: &str,
    conversation_id: &str,
) -> Result<Option<ChatConversationRow>, ()> {
    let Some(rpc_url) = contact_data.rpc_url(CHAT_GET_CONVERSATION_RPC) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");
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
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        // callPrivateChatRpc throws on RPC error -> chatRpcErrorResponse (500).
        return Err(());
    }

    // The RPC returns a single conversation object (or null).
    let value = response.json::<Value>().map_err(|_| ())?;
    if value.is_null() {
        return Ok(None);
    }
    let row = serde_json::from_value::<ChatConversationRow>(value).map_err(|_| ())?;
    Ok(Some(row))
}

async fn list_ai_messages(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    chat_id: &str,
) -> Result<Vec<AiMessageRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "ai_chat_messages",
        &[
            (
                "select",
                "id,chat_id,content,created_at,metadata,model,role,prompt_tokens,completion_tokens"
                    .to_owned(),
            ),
            ("chat_id", format!("eq.{chat_id}")),
            ("order", "created_at.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<AiMessageRow>>().map_err(|_| ())
}

async fn list_ai_credit_transactions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    message_ids: &[&str],
) -> Result<Vec<CreditTransactionRow>, ()> {
    if message_ids.is_empty() {
        return Ok(Vec::new());
    }

    // PostgREST `in` filter: (id1,id2,...). Values are UUIDs from the DB.
    let in_list = format!("({})", message_ids.join(","));
    let Some(url) = contact_data.rest_url(
        "ai_credit_transactions",
        &[
            (
                "select",
                "chat_message_id,cost_usd,input_tokens,output_tokens,reasoning_tokens,image_count,search_count,metadata"
                    .to_owned(),
            ),
            ("chat_message_id", format!("in.{in_list}")),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<CreditTransactionRow>>().map_err(|_| ())
}

fn map_message_usage(
    context_breakdown: &Value,
    message: &AiMessageRow,
    transactions: &[&CreditTransactionRow],
) -> Value {
    let metadata_usage = read_metadata_usage(message.metadata.as_ref());
    let transaction_usage = sum_usage(
        transactions
            .iter()
            .map(|transaction| map_transaction_usage(transaction)),
    );
    let fallback_usage = TokenUsage {
        input_tokens: message.prompt_tokens.unwrap_or(0) as f64,
        output_tokens: message.completion_tokens.unwrap_or(0) as f64,
        ..TokenUsage::default()
    };

    let usage = if transaction_usage.total_tokens() > 0.0 || transaction_usage.cost_usd > 0.0 {
        merge_usage(metadata_usage, transaction_usage)
    } else {
        merge_usage(metadata_usage, fallback_usage)
    };

    let content_preview = collapse_whitespace(message.content.as_deref().unwrap_or(""));
    let content_preview: String = content_preview.chars().take(140).collect();

    let message_context_breakdown = read_metadata_context_breakdown(message.metadata.as_ref())
        .unwrap_or_else(|| context_breakdown.clone());

    json!({
        "contentPreview": content_preview,
        "contextBreakdown": message_context_breakdown,
        "createdAt": message.created_at,
        "exact": !transactions.is_empty(),
        "id": message.id,
        "model": message.model,
        "role": message.role,
        "usage": usage.to_json(),
    })
}

fn build_context_breakdown(messages: &[AiMessageRow]) -> Value {
    let start = messages.len().saturating_sub(10);
    let entries: Vec<Value> = messages[start..]
        .iter()
        .map(|message| {
            let chars = message.content.as_deref().map_or(0, |c| c.chars().count());
            let role_lower = message.role.to_lowercase();
            let label = if role_lower == "assistant" {
                "Assistant message"
            } else if role_lower == "system" {
                "System message"
            } else {
                "User message"
            };
            json!({
                "chars": chars,
                "id": message.id,
                "kind": map_role_to_kind(&message.role),
                "label": label,
                "tokensEstimate": chars.div_ceil(4),
            })
        })
        .collect();
    Value::Array(entries)
}

fn map_role_to_kind(role: &str) -> &'static str {
    match role.to_lowercase().as_str() {
        "assistant" => "assistant",
        "system" => "system",
        _ => "user",
    }
}

fn map_transaction_usage(transaction: &CreditTransactionRow) -> TokenUsage {
    TokenUsage {
        cost_usd: to_number(transaction.cost_usd.as_ref()),
        image_input_count: transaction.image_count.unwrap_or(0) as f64,
        input_tokens: transaction.input_tokens.unwrap_or(0) as f64,
        output_tokens: transaction.output_tokens.unwrap_or(0) as f64,
        reasoning_tokens: transaction.reasoning_tokens.unwrap_or(0) as f64,
        search_count: transaction.search_count.unwrap_or(0) as f64,
        ..TokenUsage::default()
    }
}

fn read_metadata_usage(metadata: Option<&Value>) -> TokenUsage {
    let usage = metadata
        .and_then(|m| m.get("ai"))
        .and_then(|ai| ai.get("usage"));

    TokenUsage {
        cached_input_tokens: read_number(usage.and_then(|u| u.get("cachedInputTokens"))),
        cached_output_tokens: read_number(usage.and_then(|u| u.get("cachedOutputTokens"))),
        input_tokens: read_number(usage.and_then(|u| u.get("inputTokens"))),
        output_tokens: read_number(usage.and_then(|u| u.get("outputTokens"))),
        reasoning_tokens: read_number(usage.and_then(|u| u.get("reasoningTokens"))),
        ..TokenUsage::default()
    }
}

fn read_metadata_context_breakdown(metadata: Option<&Value>) -> Option<Value> {
    let context_breakdown = metadata
        .and_then(|m| m.get("ai"))
        .and_then(|ai| ai.get("observability"))
        .and_then(|o| o.get("contextBreakdown"));

    match context_breakdown {
        Some(Value::Array(array)) => Some(Value::Array(array.clone())),
        _ => None,
    }
}

fn merge_usage(left: TokenUsage, right: TokenUsage) -> TokenUsage {
    TokenUsage {
        cached_input_tokens: left.cached_input_tokens + right.cached_input_tokens,
        cached_output_tokens: left.cached_output_tokens + right.cached_output_tokens,
        cost_usd: left.cost_usd + right.cost_usd,
        image_input_count: left.image_input_count + right.image_input_count,
        image_output_count: left.image_output_count + right.image_output_count,
        input_tokens: left.input_tokens.max(right.input_tokens),
        output_tokens: left.output_tokens.max(right.output_tokens),
        reasoning_tokens: left.reasoning_tokens.max(right.reasoning_tokens),
        search_count: left.search_count + right.search_count,
    }
}

fn sum_usage(usages: impl Iterator<Item = TokenUsage>) -> TokenUsage {
    usages.fold(TokenUsage::default(), |total, usage| TokenUsage {
        cached_input_tokens: total.cached_input_tokens + usage.cached_input_tokens,
        cached_output_tokens: total.cached_output_tokens + usage.cached_output_tokens,
        cost_usd: total.cost_usd + usage.cost_usd,
        image_input_count: total.image_input_count + usage.image_input_count,
        image_output_count: total.image_output_count + usage.image_output_count,
        input_tokens: total.input_tokens + usage.input_tokens,
        output_tokens: total.output_tokens + usage.output_tokens,
        reasoning_tokens: total.reasoning_tokens + usage.reasoning_tokens,
        search_count: total.search_count + usage.search_count,
    })
}

/// Re-read the usage object emitted into a message JSON so totals match the
/// legacy sumUsage(messageUsages.map((m) => m.usage)).
fn usage_from_message(message: &Value) -> TokenUsage {
    let usage = message.get("usage");
    TokenUsage {
        cached_input_tokens: read_number(usage.and_then(|u| u.get("cachedInputTokens"))),
        cached_output_tokens: read_number(usage.and_then(|u| u.get("cachedOutputTokens"))),
        cost_usd: read_number(usage.and_then(|u| u.get("costUsd"))),
        image_input_count: read_number(usage.and_then(|u| u.get("imageInputCount"))),
        image_output_count: read_number(usage.and_then(|u| u.get("imageOutputCount"))),
        input_tokens: read_number(usage.and_then(|u| u.get("inputTokens"))),
        output_tokens: read_number(usage.and_then(|u| u.get("outputTokens"))),
        reasoning_tokens: read_number(usage.and_then(|u| u.get("reasoningTokens"))),
        search_count: read_number(usage.and_then(|u| u.get("searchCount"))),
    }
}

fn collapse_whitespace(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut in_whitespace = false;
    for character in input.chars() {
        if character.is_whitespace() {
            if !in_whitespace {
                out.push(' ');
                in_whitespace = true;
            }
        } else {
            out.push(character);
            in_whitespace = false;
        }
    }
    out
}

fn read_number(value: Option<&Value>) -> f64 {
    match value.and_then(Value::as_f64) {
        Some(number) if number.is_finite() => number,
        _ => 0.0,
    }
}

/// Mirror toNumber: accept numeric or string `cost_usd`, default 0.
fn to_number(value: Option<&Value>) -> f64 {
    match value {
        Some(Value::Number(number)) => number.as_f64().filter(|n| n.is_finite()).unwrap_or(0.0),
        Some(Value::String(text)) => text
            .parse::<f64>()
            .ok()
            .filter(|n| n.is_finite())
            .unwrap_or(0.0),
        _ => 0.0,
    }
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

fn parse_observability_route(path: &str) -> Option<ObservabilityRoute<'_>> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let (ws_id, after_ws) = rest.split_once(CONVERSATIONS_SEGMENT)?;
    let conversation_id = after_ws.strip_suffix(OBSERVABILITY_SUFFIX)?;

    if ws_id.is_empty()
        || ws_id.contains('/')
        || conversation_id.is_empty()
        || conversation_id.contains('/')
    {
        return None;
    }

    Some(ObservabilityRoute {
        ws_id,
        conversation_id,
    })
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
