import 'server-only';

import { createHash } from 'node:crypto';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { listAiAgents } from '@/lib/ai-agents/registry';
import type { SessionAuthContext } from '@/lib/api-auth';
import {
  extractLinks,
  isPhotoAttachment,
  listAiChatAttachmentsByMessage,
  sanitizeAiChatMessageContent,
} from './ai-chat-files';
import type {
  ChatAttachment,
  ChatConversation,
  ChatMessage,
  ChatUserProfile,
} from './private-rpc';

const AI_CHAT_CONVERSATION_PREFIX = 'ai-chat-';
const AI_CHAT_COMPAT_CONVERSATION_PREFIX = 'legacy-ai-';

type AiChatRow = {
  archived_at: string | null;
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
  includeAdminMetadata = false,
}: {
  agent: Awaited<ReturnType<typeof listAiAgents>>[number];
  channel: Awaited<ReturnType<typeof listAiAgents>>[number]['channels'][number];
  conversationId: string;
  includeAdminMetadata?: boolean;
}): ChatMessage {
  const timestamp = agentChannelTimestamp(agent, channel);
  const metadata = {
    readOnly: true,
    source: 'ai-agent',
    ...(includeAdminMetadata
      ? {
          agentId: agent.id,
          channelId: channel.id,
        }
      : {}),
  };

  return {
    attachments: [],
    content: `${channel.displayName} is a read-only ${channel.adapter} AI agent channel. Manage credentials and deployment from Infrastructure > AI Agents.`,
    conversationId,
    createdAt: timestamp,
    deletedAt: null,
    editedAt: null,
    id: `${conversationId}-status`,
    kind: 'system',
    metadata,
    reactions: [],
    replyToMessageId: null,
    sender: null,
    senderId: null,
    updatedAt: null,
  };
}

export async function listRootAiAgentDiscoveryConversations({
  includeAdminMetadata = false,
  wsId,
}: {
  includeAdminMetadata?: boolean;
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
        const id = toVirtualAiAgentConversationId(agent.id, channel.id);
        const timestamp = agentChannelTimestamp(agent, channel);
        const latestMessage = buildVirtualAgentMessage({
          agent,
          channel,
          conversationId: id,
          includeAdminMetadata,
        });
        const metadata = {
          readOnly: true,
          source: 'ai-agent',
          ...(includeAdminMetadata
            ? {
                agentId: agent.id,
                channelId: channel.id,
              }
            : {}),
        };

        return {
          aiEnabled: true,
          archivedAt: null,
          createdAt: agent.createdAt || timestamp,
          createdBy: null,
          description: `${channel.adapter} agent channel`,
          id,
          latestMessage,
          memberCount: 0,
          members: [],
          metadata,
          title: `${agent.name} / ${channel.displayName}`,
          type: 'ai',
          unreadCount: 0,
          updatedAt: timestamp,
          wsId: ROOT_WORKSPACE_ID,
        };
      });
  });
}

export function toVirtualAiAgentConversationId(
  agentId: string,
  channelId: string
) {
  const digest = createHash('sha256')
    .update(`${agentId}:${channelId}`)
    .digest('hex')
    .slice(0, 32);
  return `ai-agent-${digest}`;
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
  archived = 'active',
  supabase,
  user,
  wsId,
}: {
  archived?: 'active' | 'all' | 'archived';
  supabase: SessionAuthContext['supabase'];
  user: SessionAuthContext['user'];
  wsId: string;
}): Promise<ChatConversation[]> {
  const personalWorkspaceId = await getUserPersonalWorkspaceId({
    supabase,
    userId: user.id,
  });

  if (!personalWorkspaceId || wsId !== personalWorkspaceId) {
    return [];
  }

  let query = supabase
    .from('ai_chats')
    .select(
      'id,title,created_at,creator_id,is_public,model,pinned,summary,archived_at'
    )
    .eq('creator_id', user.id)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50);

  if (archived === 'active') {
    query = query.is('archived_at', null);
  } else if (archived === 'archived') {
    query = query.not('archived_at', 'is', null);
  }

  const { data: chats, error } = await query;

  if (error || !chats?.length) return [];

  const chatRows = await filterNativeChatShadowRows(chats as AiChatRow[]);
  if (chatRows.length === 0) return [];
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
      archivedAt: chat.archived_at,
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

export async function archiveAiChatConversation({
  conversationId,
  supabase,
  userId,
}: {
  conversationId: string;
  supabase: SessionAuthContext['supabase'];
  userId: string;
}) {
  const chatId = getAiChatId(conversationId);
  if (!chatId) return null;

  const { data, error } = await supabase
    .from('ai_chats')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', chatId)
    .eq('creator_id', userId)
    .select('id')
    .maybeSingle();

  if (error || !data) return null;

  return {
    conversationId,
    mode: 'archived' as const,
    type: 'ai' as const,
  };
}

export async function updateAiChatConversationTitle({
  conversationId,
  supabase,
  title,
  user,
  wsId,
}: {
  conversationId: string;
  supabase: SessionAuthContext['supabase'];
  title: string;
  user: SessionAuthContext['user'];
  wsId: string;
}): Promise<ChatConversation | null> {
  const chatId = getAiChatId(conversationId);
  if (!chatId) return null;

  const personalWorkspaceId = await getUserPersonalWorkspaceId({
    supabase,
    userId: user.id,
  });

  if (!personalWorkspaceId || wsId !== personalWorkspaceId) {
    return null;
  }

  const { data: chat, error } = await supabase
    .from('ai_chats')
    .update({ title })
    .eq('id', chatId)
    .eq('creator_id', user.id)
    .select(
      'id,title,created_at,creator_id,is_public,model,pinned,summary,archived_at'
    )
    .maybeSingle();

  if (error || !chat) return null;

  const [chatRow] = await filterNativeChatShadowRows([chat as AiChatRow]);
  if (!chatRow) return null;

  const { data: latestMessages } = await supabase
    .from('ai_chat_messages')
    .select('id,chat_id,content,created_at,creator_id,metadata,model,role,type')
    .eq('chat_id', chatRow.id)
    .order('created_at', { ascending: false })
    .limit(1);

  const [latestMessage] = (latestMessages ?? []) as AiChatMessageRow[];
  const sender = getAiChatUserProfile(user);

  return {
    aiEnabled: true,
    archivedAt: chatRow.archived_at,
    createdAt: chatRow.created_at,
    createdBy: chatRow.creator_id,
    description: chatRow.summary,
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
      isPublic: chatRow.is_public,
      aiChatId: chatRow.id,
      model: chatRow.model,
      pinned: chatRow.pinned,
      readOnly: false,
      source: 'ai-chat',
    },
    title: chatRow.title?.trim() || 'Mira',
    type: 'ai',
    unreadCount: 0,
    updatedAt: latestMessage?.created_at ?? chatRow.created_at,
    wsId,
  };
}

export async function listAiChatMessages({
  before,
  conversationId,
  limit = 80,
  supabase,
  user,
  wsId,
}: {
  before?: string | null;
  conversationId: string;
  limit?: number;
  supabase: SessionAuthContext['supabase'];
  user: SessionAuthContext['user'];
  wsId: string;
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

  const messagesQuery = supabase
    .from('ai_chat_messages')
    .select('id,chat_id,content,created_at,creator_id,metadata,model,role,type')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));

  if (before) {
    messagesQuery.lt('created_at', before);
  }

  const { data: messages, error } = await messagesQuery;

  if (error) return [];

  const sender = getAiChatUserProfile(user);
  const messageRows = [...((messages ?? []) as AiChatMessageRow[])].reverse();
  const attachmentsByMessageId = await listAiChatAttachmentsByMessage({
    chatId,
    conversationId,
    messages: messageRows,
    supabase,
    userId: user.id,
    wsId,
  });

  return messageRows.map((message) =>
    toAiChatMessage({
      attachments: attachmentsByMessageId.get(message.id) ?? [],
      conversationId,
      message,
      sender,
      userId: user.id,
    })
  );
}

export async function listAiChatSharedContent({
  conversationId,
  supabase,
  user,
  wsId,
}: {
  conversationId: string;
  supabase: SessionAuthContext['supabase'];
  user: SessionAuthContext['user'];
  wsId: string;
}) {
  const messages = await listAiChatMessages({
    conversationId,
    supabase,
    user,
    wsId,
  });
  if (!messages) return null;

  const attachments = messages.flatMap((message) => message.attachments);
  const photos = attachments.filter((attachment) =>
    isPhotoAttachment(attachment)
  );
  const files = attachments.filter(
    (attachment) => !isPhotoAttachment(attachment)
  );
  const links = messages.flatMap((message) =>
    extractLinks(message.content).map((url) => ({
      conversationId,
      createdAt: message.createdAt,
      messageId: message.id,
      sender: message.sender,
      url,
    }))
  );

  return { files, links, photos };
}

export async function deleteAiChatMessage({
  conversationId,
  messageId,
  supabase,
  user,
}: {
  conversationId: string;
  messageId: string;
  supabase: SessionAuthContext['supabase'];
  user: SessionAuthContext['user'];
}): Promise<ChatMessage | null> {
  const chatId = getAiChatId(conversationId);
  if (!chatId) return null;

  const { data: chat, error: chatError } = await supabase
    .from('ai_chats')
    .select('id')
    .eq('id', chatId)
    .eq('creator_id', user.id)
    .maybeSingle();

  if (chatError || !chat) return null;

  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data: deleted, error } = await sbAdmin
    .from('ai_chat_messages')
    .delete()
    .eq('id', messageId)
    .eq('chat_id', chatId)
    .select('id,chat_id,content,created_at,creator_id,metadata,model,role,type')
    .maybeSingle();

  if (error || !deleted) return null;

  const message = toAiChatMessage({
    conversationId,
    message: deleted as AiChatMessageRow,
    sender: getAiChatUserProfile(user),
    userId: user.id,
  });

  return {
    ...message,
    attachments: [],
    content: '',
    deletedAt: new Date().toISOString(),
  };
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
  attachments = [],
  conversationId,
  message,
  sender,
  userId,
}: {
  attachments?: ChatAttachment[];
  conversationId: string;
  message: AiChatMessageRow;
  sender: ChatUserProfile;
  userId: string;
}): ChatMessage {
  const isUserMessage = message.role.toLowerCase() === 'user';

  return {
    attachments,
    content: sanitizeAiChatMessageContent(message.content ?? '', attachments),
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

async function getUserPersonalWorkspaceId({
  supabase,
  userId,
}: {
  supabase: SessionAuthContext['supabase'];
  userId: string;
}) {
  const { data, error } = await supabase
    .from('workspaces')
    .select('id')
    .eq('creator_id', userId)
    .eq('personal', true)
    .eq('deleted', false)
    .maybeSingle();

  if (error) return null;
  return typeof data?.id === 'string' ? data.id : null;
}

async function filterNativeChatShadowRows(chatRows: AiChatRow[]) {
  if (chatRows.length === 0) return chatRows;

  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data, error } = (await sbAdmin
    .schema('private')
    .from('chat_conversations')
    .select('id')
    .in(
      'id',
      chatRows.map((chat) => chat.id)
    )) as {
    data: { id: string }[] | null;
    error: { message?: string } | null;
  };

  if (error || !data?.length) return chatRows;

  const nativeConversationIds = new Set(data.map((row) => row.id));
  return chatRows.filter((chat) => !nativeConversationIds.has(chat.id));
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
