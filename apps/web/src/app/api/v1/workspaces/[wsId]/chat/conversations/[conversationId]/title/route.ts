import { google } from '@ai-sdk/google';
import {
  resolveAiMemoryWorkspaceIdForUser,
  withAiMemory,
} from '@tuturuuu/ai/memory';
import { generateText } from 'ai';
import { type NextRequest, NextResponse } from 'next/server';
import { type SessionAuthContext, withSessionAuth } from '@/lib/api-auth';
import {
  isAiChatConversationId,
  listAiChatMessages,
  updateAiChatConversationTitle,
} from '@/lib/chat/agent-discovery';
import {
  type ChatConversation,
  type ChatMessage,
  callPrivateChatRpc,
  chatRpcErrorResponse,
  resolveChatRouteContext,
} from '@/lib/chat/private-rpc';
import {
  getChatRealtimeAudience,
  publishChatRealtimeEvent,
} from '@/lib/chat/realtime';
import { serverLogger } from '@/lib/infrastructure/log-drain';

type RouteParams = {
  conversationId: string;
  wsId: string;
};

const TITLE_MODEL = 'gemini-3.1-flash-lite';
const MAX_TITLE_LENGTH = 255;
const TITLE_SYSTEM_PROMPT =
  'Generate a concise conversation title from the provided recent messages. Return only the title, with no quotes, markdown, punctuation-only suffixes, or explanation.';

export const POST = withSessionAuth<RouteParams>(
  async (_request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    try {
      if (isAiChatConversationId(params.conversationId)) {
        return await generateAiChatConversationTitle({
          auth,
          conversationId: params.conversationId,
          normalizedWsId: context.context.normalizedWsId,
        });
      }

      await callPrivateChatRpc<ChatConversation>('chat_get_conversation', {
        p_actor_user_id: auth.user.id,
        p_conversation_id: params.conversationId,
        p_ws_id: context.context.normalizedWsId,
      });

      const messages = await callPrivateChatRpc<ChatMessage[]>(
        'chat_list_messages',
        {
          p_actor_user_id: auth.user.id,
          p_before: null,
          p_conversation_id: params.conversationId,
          p_limit: 5,
          p_ws_id: context.context.normalizedWsId,
        }
      );
      const titleMessages = normalizeTitleMessages(messages ?? []);

      if (titleMessages.length === 0) {
        return NextResponse.json(
          { message: 'No messages found' },
          { status: 404 }
        );
      }

      const title = await generateConversationTitle({
        auth,
        messages: titleMessages,
        normalizedWsId: context.context.normalizedWsId,
        conversationId: params.conversationId,
      });

      if (!title) {
        return NextResponse.json(
          { message: 'Could not generate title' },
          { status: 502 }
        );
      }

      const conversation = await callPrivateChatRpc<ChatConversation>(
        'chat_update_conversation',
        {
          p_actor_user_id: auth.user.id,
          p_conversation_id: params.conversationId,
          p_input: { title },
          p_ws_id: context.context.normalizedWsId,
        }
      );

      await publishChatRealtimeEvent({
        actorUserId: auth.user.id,
        audience: getChatRealtimeAudience(conversation),
        conversation,
        conversationId: conversation.id,
        type: 'conversation.updated',
        wsId: context.context.normalizedWsId,
      });

      return NextResponse.json({ conversation, title });
    } catch (error) {
      serverLogger.error('Failed to generate chat title', {
        conversationId: params.conversationId,
        error,
      });
      return chatRpcErrorResponse(error, 'Failed to generate chat title');
    }
  },
  { allowAppSessionAuth: true }
);

async function generateAiChatConversationTitle({
  auth,
  conversationId,
  normalizedWsId,
}: {
  auth: SessionAuthContext;
  conversationId: string;
  normalizedWsId: string;
}) {
  const messages = await listAiChatMessages({
    conversationId,
    limit: 5,
    supabase: auth.supabase,
    user: auth.user,
    wsId: normalizedWsId,
  });

  if (!messages) {
    return NextResponse.json(
      { message: 'Conversation not found' },
      { status: 404 }
    );
  }

  const titleMessages = normalizeTitleMessages(messages);

  if (titleMessages.length === 0) {
    return NextResponse.json({ message: 'No messages found' }, { status: 404 });
  }

  const title = await generateConversationTitle({
    auth,
    messages: titleMessages,
    normalizedWsId,
    conversationId,
  });

  if (!title) {
    return NextResponse.json(
      { message: 'Could not generate title' },
      { status: 502 }
    );
  }

  const conversation = await updateAiChatConversationTitle({
    conversationId,
    supabase: auth.supabase,
    title,
    user: auth.user,
    wsId: normalizedWsId,
  });

  if (!conversation) {
    return NextResponse.json(
      { message: 'Conversation not found' },
      { status: 404 }
    );
  }

  await publishChatRealtimeEvent({
    actorUserId: auth.user.id,
    audience: getChatRealtimeAudience(conversation),
    conversation,
    conversationId: conversation.id,
    type: 'conversation.updated',
    wsId: normalizedWsId,
  });

  return NextResponse.json({ conversation, title });
}

function normalizeTitleMessages(messages: ChatMessage[]) {
  return messages
    .filter((message) => !message.deletedAt)
    .map((message) => ({
      content: message.content.replace(/\s+/gu, ' ').trim(),
      kind: message.kind,
    }))
    .filter((message) => message.content.length > 0);
}

async function generateConversationTitle({
  auth,
  conversationId,
  messages,
  normalizedWsId,
}: {
  auth: SessionAuthContext;
  conversationId: string;
  messages: ReturnType<typeof normalizeTitleMessages>;
  normalizedWsId: string;
}) {
  const memoryWsId = await resolveAiMemoryWorkspaceIdForUser({
    supabase: auth.supabase,
    userId: auth.user.id,
  });
  const result = await generateText({
    maxOutputTokens: 32,
    model: await withAiMemory({
      addMemory: 'never',
      customId: `chat-title-${conversationId}-${Date.now()}`,
      model: google(TITLE_MODEL),
      product: 'native_chat',
      source: 'native_chat_title',
      surface: 'native_chat_title',
      userId: auth.user.id,
      wsId: memoryWsId ?? normalizedWsId,
    }),
    prompt: buildTitlePrompt(messages),
    system: TITLE_SYSTEM_PROMPT,
  });

  return normalizeGeneratedTitle(result.text);
}

function buildTitlePrompt(messages: ReturnType<typeof normalizeTitleMessages>) {
  return messages
    .map((message, index) => {
      const role = message.kind === 'assistant' ? 'Assistant' : 'User';
      return `${index + 1}. ${role}: ${message.content}`;
    })
    .join('\n');
}

function normalizeGeneratedTitle(value: string) {
  const normalized = value
    .replace(/^[\s"'`*#-]+/u, '')
    .replace(/[\s"'`*#-]+$/u, '')
    .replace(/\s+/gu, ' ')
    .trim();

  if (!normalized) return null;
  if (normalized.length <= MAX_TITLE_LENGTH) return normalized;

  return normalized.slice(0, MAX_TITLE_LENGTH).trim();
}
