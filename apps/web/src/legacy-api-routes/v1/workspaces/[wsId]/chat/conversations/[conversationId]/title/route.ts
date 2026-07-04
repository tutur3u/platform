import { google } from '@ai-sdk/google';
import { capMaxOutputTokensByCredits } from '@tuturuuu/ai/credits/cap-output-tokens';
import {
  checkAiCredits,
  deductAiCredits,
} from '@tuturuuu/ai/credits/check-credits';
import {
  resolveAiMemoryWorkspaceIdForUser,
  withAiMemory,
} from '@tuturuuu/ai/memory';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
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

type RouteParams = {
  conversationId: string;
  wsId: string;
};

const TITLE_MODEL = 'gemini-3.1-flash-lite';
const TITLE_MODEL_ID = `google/${TITLE_MODEL}`;
const TITLE_CREDIT_FEATURE = 'chat';
const MAX_TITLE_LENGTH = 255;
const MAX_TITLE_OUTPUT_TOKENS = 32;
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

      const titleResult = await generateConversationTitle({
        auth,
        messages: titleMessages,
        normalizedWsId: context.context.normalizedWsId,
        conversationId: params.conversationId,
      });
      if (!titleResult.ok) return titleResult.response;

      const title = titleResult.title;
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
      console.error('Failed to generate chat title', {
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

  const titleResult = await generateConversationTitle({
    auth,
    messages: titleMessages,
    normalizedWsId,
    conversationId,
  });
  if (!titleResult.ok) return titleResult.response;

  const title = titleResult.title;
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
  const creditCheck = await checkAiCredits(
    normalizedWsId,
    TITLE_MODEL_ID,
    TITLE_CREDIT_FEATURE,
    { userId: auth.user.id }
  );

  if (!creditCheck.allowed) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          message: creditCheck.errorMessage || 'AI credits insufficient',
          code: creditCheck.errorCode,
        },
        { status: 403 }
      ),
    };
  }

  const sbAdmin = (await createAdminClient({
    noCookie: true,
  })) as TypedSupabaseClient;
  const requestedMaxOutputTokens = Math.min(
    MAX_TITLE_OUTPUT_TOKENS,
    creditCheck.maxOutputTokens ?? MAX_TITLE_OUTPUT_TOKENS
  );
  const cappedMaxOutput = await capMaxOutputTokensByCredits(
    sbAdmin,
    TITLE_MODEL_ID,
    requestedMaxOutputTokens,
    creditCheck.remainingCredits
  );

  if (cappedMaxOutput === null || cappedMaxOutput <= 0) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: 'AI credits insufficient', code: 'CREDITS_EXHAUSTED' },
        { status: 403 }
      ),
    };
  }

  const memoryWsId = await resolveAiMemoryWorkspaceIdForUser({
    supabase: auth.supabase,
    userId: auth.user.id,
  });
  const result = await generateText({
    maxOutputTokens: Math.min(MAX_TITLE_OUTPUT_TOKENS, cappedMaxOutput),
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

  deductAiCredits({
    wsId: normalizedWsId,
    userId: auth.user.id,
    modelId: TITLE_MODEL_ID,
    inputTokens: result.usage.inputTokens ?? 0,
    outputTokens: result.usage.outputTokens ?? 0,
    reasoningTokens: result.usage.outputTokenDetails?.reasoningTokens ?? 0,
    feature: TITLE_CREDIT_FEATURE,
    metadata: {
      conversationId,
      source: 'native_chat_title',
    },
  }).catch((error: unknown) =>
    console.warn('Failed to deduct chat title AI credits', {
      conversationId,
      error,
      userId: auth.user.id,
      wsId: normalizedWsId,
    })
  );

  return { ok: true as const, title: normalizeGeneratedTitle(result.text) };
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
