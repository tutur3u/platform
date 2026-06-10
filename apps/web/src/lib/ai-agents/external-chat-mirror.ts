import 'server-only';

import { randomUUID } from 'node:crypto';
import type {
  Message as SdkMessage,
  Thread as SdkRuntimeThread,
  SentMessage as SdkSentMessage,
  ThreadInfo as SdkThread,
} from '@tuturuuu/ai/chat-sdk';
import {
  type ChatConversation,
  type ChatMessage,
  callPrivateChatRpc,
} from '@/lib/chat/private-rpc';
import type { AiAgentChannelConfig, AiAgentDefinition } from './types';

const AI_AGENT_EXTERNAL_CONVERSATION_PREFIX = 'ai-agent-thread-';

export interface AiAgentExternalThread {
  adapter: AiAgentChannelConfig['adapter'];
  agentId: string;
  channelId: string;
  conversationId: string;
  createdAt: string;
  externalChannelId: string | null;
  externalThreadId: string;
  id: string;
  lastEventAt: string | null;
  lastSyncedAt: string | null;
  latestMessage: ChatMessage | null;
  messageCount: number;
  metadata: Record<string, unknown>;
  title: string | null;
  updatedAt: string;
  wsId: string;
}

export function toAiAgentExternalConversationId(threadId: string) {
  return `${AI_AGENT_EXTERNAL_CONVERSATION_PREFIX}${threadId}`;
}

export function isAiAgentExternalConversationId(conversationId: string) {
  return conversationId.startsWith(AI_AGENT_EXTERNAL_CONVERSATION_PREFIX);
}

export function getAiAgentExternalThreadId(conversationId: string) {
  if (!isAiAgentExternalConversationId(conversationId)) {
    return null;
  }

  return conversationId.slice(AI_AGENT_EXTERNAL_CONVERSATION_PREFIX.length);
}

export async function listAiAgentExternalThreadConversations({
  actorUserId,
  wsId,
}: {
  actorUserId: string;
  wsId: string;
}) {
  try {
    return (
      (await callPrivateChatRpc<ChatConversation[]>(
        'ai_agent_external_list_conversations',
        {
          p_actor_user_id: actorUserId,
          p_ws_id: wsId,
        }
      )) ?? []
    );
  } catch (error) {
    if (isMissingExternalMirrorRpc(error)) return [];
    throw error;
  }
}

export async function listAiAgentExternalMessages({
  actorUserId,
  before,
  conversationId,
  limit,
  wsId,
}: {
  actorUserId: string;
  before?: string | null;
  conversationId: string;
  limit: number;
  wsId: string;
}) {
  if (!isAiAgentExternalConversationId(conversationId)) {
    return null;
  }

  return (
    (await callPrivateChatRpc<ChatMessage[]>(
      'ai_agent_external_list_messages',
      {
        p_actor_user_id: actorUserId,
        p_before: before || null,
        p_conversation_id: conversationId,
        p_limit: limit,
        p_ws_id: wsId,
      }
    )) ?? []
  );
}

export async function listAiAgentExternalThreads({
  agentId,
  channelId,
  wsId,
}: {
  agentId?: string | null;
  channelId?: string | null;
  wsId?: string | null;
} = {}) {
  return (
    (await callPrivateChatRpc<AiAgentExternalThread[]>(
      'ai_agent_external_list_threads',
      {
        p_agent_id: agentId ?? null,
        p_channel_id: channelId ?? null,
        p_ws_id: wsId ?? null,
      }
    )) ?? []
  );
}

export async function getAiAgentExternalThread({
  threadId,
}: {
  threadId: string;
}) {
  return await callPrivateChatRpc<AiAgentExternalThread | null>(
    'ai_agent_external_get_thread',
    {
      p_thread_id: threadId,
    }
  );
}

export async function markAiAgentExternalThreadSynced({
  threadId,
}: {
  threadId: string;
}) {
  return await callPrivateChatRpc<AiAgentExternalThread>(
    'ai_agent_external_mark_thread_synced',
    {
      p_thread_id: threadId,
    }
  );
}

export async function listAiAgentExternalThreadMessages({
  limit = 80,
  threadId,
}: {
  limit?: number;
  threadId: string;
}) {
  return (
    (await callPrivateChatRpc<ChatMessage[]>(
      'ai_agent_external_list_thread_messages',
      {
        p_limit: limit,
        p_thread_id: threadId,
      }
    )) ?? []
  );
}

export async function persistAiAgentExternalSdkThread({
  agent,
  channel,
  thread,
}: {
  agent: AiAgentDefinition;
  channel: AiAgentChannelConfig;
  thread: SdkThread | SdkRuntimeThread;
}) {
  const threadMetadata = readRecord(
    (thread as { metadata?: unknown }).metadata
  );
  const threadTitle =
    readString(threadMetadata?.threadTitle) ??
    readString(threadMetadata?.threadName) ??
    readString(threadMetadata?.channelName) ??
    channel.displayName;

  return await upsertAiAgentExternalSdkThread({
    agent,
    channel,
    externalChannelId: thread.channelId || channel.externalChannelId,
    externalThreadId: thread.id,
    threadTitle,
  });
}

export async function persistAiAgentExternalSdkMessage({
  agent,
  channel,
  direction,
  message,
  platformUserId = null,
  thread,
}: {
  agent: AiAgentDefinition;
  channel: AiAgentChannelConfig;
  direction: 'inbound' | 'outbound';
  message: SdkMessage | SdkSentMessage;
  platformUserId?: string | null;
  thread: SdkThread | SdkRuntimeThread;
}) {
  const externalThreadId = thread.id || message.threadId;
  const externalChannelId =
    thread.channelId || channel.externalChannelId || channel.id;
  const raw = toSafeJsonRecord(message.raw);
  const rawData = readRecord(raw.data);
  const threadMetadata = readRecord(
    (thread as { metadata?: unknown }).metadata
  );
  const threadTitle =
    readString(raw.threadTitle) ??
    readString(raw.threadName) ??
    readString(raw.channelName) ??
    readString(threadMetadata?.threadTitle) ??
    readString(threadMetadata?.threadName) ??
    readString(threadMetadata?.channelName) ??
    readString(rawData?.threadName) ??
    readString(rawData?.channelName) ??
    (message.author.isMe ? null : readString(message.author.fullName)) ??
    (message.author.isMe ? null : readString(message.author.userName)) ??
    channel.displayName;

  const savedThread = await upsertAiAgentExternalSdkThread({
    agent,
    channel,
    externalChannelId,
    externalThreadId,
    threadTitle,
  });

  const createdAt =
    message.metadata.dateSent instanceof Date
      ? message.metadata.dateSent.toISOString()
      : new Date().toISOString();
  const externalMessageId = readString(message.id) || randomUUID();

  return await callPrivateChatRpc<ChatMessage>(
    'ai_agent_external_upsert_message',
    {
      p_author_avatar_url: readString(raw.authorAvatarUrl) ?? null,
      p_author_display_name:
        message.author.fullName || message.author.userName || null,
      p_author_external_id: message.author.userId || null,
      p_content: message.text || '',
      p_direction: direction,
      p_external_created_at: createdAt,
      p_external_message_id: externalMessageId,
      p_kind: direction === 'outbound' ? 'assistant' : 'user',
      p_metadata: {
        authorIsBot: message.author.isBot,
        authorIsMe: message.author.isMe,
        links: message.links ?? [],
        source: 'chat-sdk',
      },
      p_platform_user_id: platformUserId,
      p_raw: raw,
      p_thread_id: savedThread.id,
    }
  );
}

async function upsertAiAgentExternalSdkThread({
  agent,
  channel,
  externalChannelId,
  externalThreadId,
  threadTitle,
}: {
  agent: AiAgentDefinition;
  channel: AiAgentChannelConfig;
  externalChannelId?: string | null;
  externalThreadId: string;
  threadTitle: string | null;
}) {
  return await callPrivateChatRpc<AiAgentExternalThread>(
    'ai_agent_external_upsert_thread',
    {
      p_adapter: channel.adapter,
      p_agent_id: agent.id,
      p_channel_id: channel.id,
      p_external_channel_id: externalChannelId || channel.id,
      p_external_thread_id: externalThreadId,
      p_metadata: {
        agentName: agent.name,
        autoRespond: channel.autoRespond ?? true,
        channelDisplayName: channel.displayName,
        historySyncEnabled: channel.historySyncEnabled ?? true,
      },
      p_title: threadTitle,
      p_ws_id: channel.workspaceId,
    }
  );
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function isMissingExternalMirrorRpc(error: unknown) {
  const rpcError = error as { code?: string; message?: string };
  const message = rpcError.message ?? '';

  return (
    rpcError.code === 'PGRST202' ||
    rpcError.code === '42883' ||
    /ai_agent_external_/u.test(message)
  );
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toSafeJsonRecord(value: unknown): Record<string, unknown> {
  try {
    const serialized = JSON.stringify(value ?? {});
    if (!serialized) return {};
    if (serialized.length > 100_000) {
      return {
        truncated: true,
        value: serialized.slice(0, 100_000),
      };
    }

    return JSON.parse(serialized) as Record<string, unknown>;
  } catch {
    return { unserializable: true };
  }
}
