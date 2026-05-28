import 'server-only';

import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { listAiAgents } from '@/lib/ai-agents/registry';
import type { SessionAuthContext } from '@/lib/api-auth';
import type {
  ChatConversation,
  ChatMessage,
  ChatUserProfile,
} from './private-rpc';

const AI_CHAT_CONVERSATION_PREFIX = 'ai-chat-';
const AI_CHAT_COMPAT_CONVERSATION_PREFIX = 'legacy-ai-';

type AiChatRow = {
  created_at: string;
  creator_id: string | null;
  id: string;
  is_public: boolean;
  model: string | null;
  pinned: boolean;
  summary: string | null;
  title: string | null;
};

type AiChatMessageRow = {
  chat_id: string;
  content: string | null;
  created_at: string;
  creator_id: string | null;
  id: string;
  metadata: unknown;
  model: string | null;
  role: string;
  type: string;
};

function agentChannelTimestamp(
  agent: Awaited<ReturnType<typeof listAiAgents>>[number],
  channel: Awaited<ReturnType<typeof listAiAgents>>[number]['channels'][number]
) {
  return (
    channel.lastEventAt ||
    channel.lastDeployedAt ||
    agent.updatedAt ||
    agent.createdAt ||
    new Date(0).toISOString()
  );
}

function buildVirtualAgentMessage({
  agent,
  channel,
  conversationId,
}: {
  agent: Awaited<ReturnType<typeof listAiAgents>>[number];
  channel: Awaited<ReturnType<typeof listAiAgents>>[number]['channels'][number];
  conversationId: string;
}): ChatMessage {
  const timestamp = agentChannelTimestamp(agent, channel);

  return {
    attachments: [],
    content: `${channel.displayName} is a read-only ${channel.adapter} AI agent channel. Manage credentials and deployment from Infrastructure > AI Agents.`,
    conversationId,
    createdAt: timestamp,
    deletedAt: null,
    editedAt: null,
    id: `${conversationId}-status`,
    kind: 'system',
    metadata: {
      adapter: channel.adapter,
      agentId: agent.id,
      channelId: channel.id,
      readOnly: true,
      source: 'ai-agent',
      status: channel.status,
      webhookUrl: channel.webhookUrl,
    },
    reactions: [],
    replyToMessageId: null,
    sender: null,
    senderId: null,
    updatedAt: null,
  };
}

export async function listRootAiAgentDiscoveryConversations({
  wsId,
}: {
  wsId: string;
}): Promise<ChatConversation[]> {
  if (wsId !== ROOT_WORKSPACE_ID) {
    return [];
  }

  const agents = await listAiAgents();

  return agents.flatMap((agent) => {
    if (!agent.enabled) {
      return [];
    }

    return agent.channels
      .filter((channel) => channel.enabled)
      .map((channel): ChatConversation => {
        const id = `ai-agent-${agent.id}-${channel.id}`;
        const timestamp = agentChannelTimestamp(agent, channel);
        const latestMessage = buildVirtualAgentMessage({
          agent,
          channel,
          conversationId: id,
        });

        return {
          aiEnabled: true,
          archivedAt: null,
          createdAt: agent.createdAt || timestamp,
          createdBy: null,
          description: `${channel.adapter} channel ${channel.id}`,
          id,
          latestMessage,
          memberCount: 0,
          members: [],
          metadata: {
            adapter: channel.adapter,
            agentId: agent.id,
            channelId: channel.id,
            readOnly: true,
            source: 'ai-agent',
            status: channel.status,
            webhookUrl: channel.webhookUrl,
            workspaceId: channel.workspaceId,
          },
          title: `${agent.name} / ${channel.displayName}`,
          type: 'ai',
          unreadCount: 0,
          updatedAt: timestamp,
          wsId: ROOT_WORKSPACE_ID,
        };
      });
  });
}

export function isAiChatConversationId(conversationId: string) {
  return (
    conversationId.startsWith(AI_CHAT_CONVERSATION_PREFIX) ||
    conversationId.startsWith(AI_CHAT_COMPAT_CONVERSATION_PREFIX)
  );
}

export function getAiChatId(conversationId: string) {
  if (conversationId.startsWith(AI_CHAT_CONVERSATION_PREFIX)) {
    return conversationId.slice(AI_CHAT_CONVERSATION_PREFIX.length);
  }

  if (conversationId.startsWith(AI_CHAT_COMPAT_CONVERSATION_PREFIX)) {
    return conversationId.slice(AI_CHAT_COMPAT_CONVERSATION_PREFIX.length);
  }

  return null;
}

export async function listAiChatConversations({
  supabase,
  user,
  wsId,
}: {
  supabase: SessionAuthContext['supabase'];
  user: SessionAuthContext['user'];
  wsId: string;
}): Promise<ChatConversation[]> {
  const { data: chats, error } = await supabase
    .from('ai_chats')
    .select('id,title,created_at,creator_id,is_public,model,pinned,summary')
    .eq('creator_id', user.id)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !chats?.length) return [];

  const chatRows = chats as AiChatRow[];
  const { data: latestMessages } = await supabase
    .from('ai_chat_messages')
    .select('id,chat_id,content,created_at,creator_id,metadata,model,role,type')
    .in(
      'chat_id',
      chatRows.map((chat) => chat.id)
    )
    .order('created_at', { ascending: false });

  const latestByChatId = new Map<string, AiChatMessageRow>();
  for (const message of (latestMessages ?? []) as AiChatMessageRow[]) {
    if (!latestByChatId.has(message.chat_id)) {
      latestByChatId.set(message.chat_id, message);
    }
  }

  const sender = getAiChatUserProfile(user);

  return chatRows.map((chat) => {
    const conversationId = toAiChatConversationId(chat.id);
    const latestMessage = latestByChatId.get(chat.id);

    return {
      aiEnabled: true,
      archivedAt: null,
      createdAt: chat.created_at,
      createdBy: chat.creator_id,
      description: chat.summary,
      id: conversationId,
      latestMessage: latestMessage
        ? toAiChatMessage({
            conversationId,
            message: latestMessage,
            sender,
            userId: user.id,
          })
        : null,
      memberCount: 1,
      members: [],
      metadata: {
        isPublic: chat.is_public,
        aiChatId: chat.id,
        model: chat.model,
        pinned: chat.pinned,
        readOnly: false,
        source: 'ai-chat',
      },
      title: chat.title?.trim() || 'Mira',
      type: 'ai',
      unreadCount: 0,
      updatedAt: latestMessage?.created_at ?? chat.created_at,
      wsId,
    };
  });
}

export async function listAiChatMessages({
  conversationId,
  supabase,
  user,
}: {
  conversationId: string;
  supabase: SessionAuthContext['supabase'];
  user: SessionAuthContext['user'];
}): Promise<ChatMessage[] | null> {
  const chatId = getAiChatId(conversationId);
  if (!chatId) return null;

  const { data: chat, error: chatError } = await supabase
    .from('ai_chats')
    .select('id')
    .eq('id', chatId)
    .eq('creator_id', user.id)
    .maybeSingle();

  if (chatError || !chat) return null;

  const { data: messages, error } = await supabase
    .from('ai_chat_messages')
    .select('id,chat_id,content,created_at,creator_id,metadata,model,role,type')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });

  if (error) return [];

  const sender = getAiChatUserProfile(user);

  return ((messages ?? []) as AiChatMessageRow[]).map((message) =>
    toAiChatMessage({
      conversationId,
      message,
      sender,
      userId: user.id,
    })
  );
}

export async function canAccessAiChatConversation({
  conversationId,
  supabase,
  userId,
}: {
  conversationId: string;
  supabase: SessionAuthContext['supabase'];
  userId: string;
}) {
  const chatId = getAiChatId(conversationId);
  if (!chatId) return false;

  const { data, error } = await supabase
    .from('ai_chats')
    .select('id')
    .eq('id', chatId)
    .eq('creator_id', userId)
    .maybeSingle();

  return !error && Boolean(data);
}

export const isLegacyAiConversationId = isAiChatConversationId;
export const getLegacyAiChatId = getAiChatId;
export const listLegacyAiChatConversations = listAiChatConversations;
export const listLegacyAiChatMessages = listAiChatMessages;
export const canAccessLegacyAiConversation = canAccessAiChatConversation;

export function isReadOnlyAgentConversation(
  conversation: Pick<ChatConversation, 'metadata'>
) {
  return (
    conversation.metadata.source === 'ai-agent' &&
    conversation.metadata.readOnly === true
  );
}

function toAiChatConversationId(chatId: string) {
  return `${AI_CHAT_CONVERSATION_PREFIX}${chatId}`;
}

function toAiChatMessage({
  conversationId,
  message,
  sender,
  userId,
}: {
  conversationId: string;
  message: AiChatMessageRow;
  sender: ChatUserProfile;
  userId: string;
}): ChatMessage {
  const isUserMessage = message.role.toLowerCase() === 'user';

  return {
    attachments: [],
    content: message.content ?? '',
    conversationId,
    createdAt: message.created_at,
    deletedAt: null,
    editedAt: null,
    id: message.id,
    kind: getAiChatMessageKind(message.role),
    metadata: {
      aiChatId: message.chat_id,
      aiMessageType: message.type,
      metadata: message.metadata,
      model: message.model,
      source: 'ai-chat',
    },
    reactions: [],
    replyToMessageId: null,
    sender: isUserMessage ? sender : null,
    senderId: isUserMessage ? (message.creator_id ?? userId) : null,
    updatedAt: null,
  };
}

function getAiChatMessageKind(role: string): ChatMessage['kind'] {
  const normalizedRole = role.toLowerCase();
  if (normalizedRole === 'user') return 'user';
  if (normalizedRole === 'system') return 'system';
  return 'assistant';
}

function getAiChatUserProfile(
  user: SessionAuthContext['user']
): ChatUserProfile {
  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  const displayName =
    readString(metadata?.full_name) ??
    readString(metadata?.name) ??
    user.email ??
    'You';

  return {
    avatarUrl: readString(metadata?.avatar_url),
    displayName,
    handle: user.email ?? null,
    id: user.id,
  };
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
