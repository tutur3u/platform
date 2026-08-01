import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import type { SessionAuthContext } from '@/lib/api-auth';
import {
  isChatAiSettingsSchemaCacheError,
  mapNativeChatAiSettingsRow,
  NATIVE_CHAT_AI_SETTINGS_FULL_SELECT,
  NATIVE_CHAT_AI_SETTINGS_LEGACY_SELECT,
  type NativeChatAiSettings,
  serializeChatAiSettingsDbError,
} from '@/lib/chat/ai-settings';
import {
  type ChatConversation,
  type ChatMessage,
  type ChatRouteContext,
  callPrivateChatRpc,
} from '@/lib/chat/private-rpc';
import { getChatRealtimeAudience } from '@/lib/chat/realtime';
import {
  buildNativeAiObservabilityContext,
  callAiChatRoute,
  cleanupNativeAiResources,
  consumeAiResponseTextDeltas,
  copyChatAttachmentsToAiResources,
  maybeAutoRenameNativeAiConversation,
  normalizeNativeAiModel,
  publishChatRealtimeMessages,
  readRecord,
  readString,
  splitAiAssistantContent,
  toNativeAiUiMessages,
} from './ai-message-shared';

const NATIVE_AI_ASSISTANT_ERROR_MESSAGE =
  'Assistant response failed. Your message was saved.';

type AiAssistantMessageRow = {
  completion_tokens: number | null;
  content: string | null;
  id: string;
  metadata: unknown;
  model: string | null;
  prompt_tokens: number | null;
};

export function streamNativeAiConversationResponse({
  auth,
  context,
  conversation,
  request,
  userMessage,
}: {
  auth: SessionAuthContext;
  context: ChatRouteContext;
  conversation: ChatConversation;
  request: NextRequest;
  userMessage: ChatMessage;
}) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const write = (event: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      write({ message: userMessage, type: 'message' });
      try {
        const assistantMessages = await sendNativeAiConversationMessages({
          auth,
          context,
          conversation,
          onDelta: (delta) => write({ delta, type: 'assistant_delta' }),
          onPart: (part) => write({ part, type: 'assistant_part' }),
          request,
          userMessage,
        });

        await publishChatRealtimeMessages({
          actorUserId: auth.user.id,
          audience: getChatRealtimeAudience(conversation),
          messages: assistantMessages,
          wsId: context.normalizedWsId,
        });
        write({ messages: assistantMessages, type: 'messages' });
        write({ type: 'done' });
      } catch (error) {
        console.error('Failed to stream native Chat AI response', {
          conversationId: conversation.id,
          error,
          userMessageId: userMessage.id,
        });
        write({
          message: NATIVE_AI_ASSISTANT_ERROR_MESSAGE,
          type: 'error',
        });
        write({ type: 'done' });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    status: 201,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/x-ndjson; charset=utf-8',
    },
  });
}

export async function sendNativeAiConversationMessages({
  auth,
  context,
  conversation,
  onDelta,
  onPart,
  request,
  userMessage,
}: {
  auth: SessionAuthContext;
  context: ChatRouteContext;
  conversation: ChatConversation;
  onDelta?: (delta: string) => void;
  onPart?: (part: Record<string, unknown>) => void;
  request: NextRequest;
  userMessage: ChatMessage;
}) {
  const settings = await getNativeAiSettings(conversation.id);
  const shadowChatId = userMessage.id;
  const shadowChatResult = await ensureNativeAiShadowChat({
    auth,
    conversation,
    shadowChatId,
    model: normalizeNativeAiModel(settings.model_id),
  });

  if (!shadowChatResult.ok) {
    throw new Error('Failed to prepare AI chat');
  }

  try {
    await copyChatAttachmentsToAiResources({
      resourceChatId: shadowChatId,
      targetWsId: context.normalizedWsId,
      userMessage,
    });

    const privateMessages = await callPrivateChatRpc<ChatMessage[]>(
      'chat_list_messages',
      {
        p_actor_user_id: auth.user.id,
        p_before: null,
        p_conversation_id: conversation.id,
        p_limit: 100,
        p_ws_id: context.normalizedWsId,
      }
    );

    await maybeAutoRenameNativeAiConversation({
      auth,
      context,
      conversation,
      firstMessageContent: userMessage.content,
      messages: privateMessages ?? [],
    });

    const aiMessages = toNativeAiUiMessages(
      privateMessages ?? [],
      settings.system_prompt
    );

    const aiResponse = await callAiChatRoute({
      chatId: shadowChatId,
      creditSource: settings.credit_source,
      creditWsId:
        settings.credit_source === 'personal'
          ? (settings.credit_ws_id ?? undefined)
          : (settings.credit_ws_id ?? context.normalizedWsId),
      messages: aiMessages,
      miraMode: false,
      model: normalizeNativeAiModel(settings.model_id),
      observabilityContext: buildNativeAiObservabilityContext(
        privateMessages ?? []
      ),
      request,
      supabase: auth.supabase,
      thinkingMode: settings.thinking_mode,
      user: auth.user,
      wsId: context.normalizedWsId,
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text().catch(() => '');
      console.error('Native Chat AI response failed', {
        conversationId: conversation.id,
        status: aiResponse.status,
        errorText,
      });
      throw new Error(errorText || 'Failed to send AI chat message');
    }

    await consumeAiResponseTextDeltas(aiResponse, onDelta, onPart);

    const assistantResponse = await getLatestAiAssistantMessage({
      chatId: shadowChatId,
      supabase: auth.supabase,
    });

    if (!assistantResponse?.content?.trim()) {
      console.error('Native Chat AI response was not saved', {
        conversationId: conversation.id,
      });
      throw new Error('AI response was not saved');
    }

    const assistantParts = splitAiAssistantContent(assistantResponse.content);
    const assistantMessages: ChatMessage[] = [];

    for (let index = 0; index < assistantParts.length; index++) {
      const content = assistantParts[index]!;
      const metadata = buildNativeAssistantMessageMetadata({
        aiMessage: assistantResponse,
        content,
        splitIndex: index,
        splitTotal: assistantParts.length,
      });
      const message = await callPrivateChatRpc<ChatMessage>(
        'chat_persist_ai_message',
        {
          p_actor_user_id: auth.user.id,
          p_content: content,
          p_conversation_id: conversation.id,
          p_metadata: metadata,
          p_ws_id: context.normalizedWsId,
        }
      );

      if (!message) {
        throw new Error('Chat conversation not found');
      }

      assistantMessages.push(message);
    }

    return assistantMessages;
  } finally {
    await cleanupNativeAiShadowChat({
      shadowChatId,
      wsId: context.normalizedWsId,
    });
  }
}

async function getNativeAiSettings(conversationId: string) {
  const sbAdmin = await createAdminClient({ noCookie: true });
  const fullResult = (await sbAdmin
    .schema('private')
    .from('chat_conversation_ai_settings')
    .select(NATIVE_CHAT_AI_SETTINGS_FULL_SELECT)
    .eq('conversation_id', conversationId)
    .maybeSingle()) as {
    data: Partial<NativeChatAiSettings> | null;
    error: { message?: string } | null;
  };
  let data = fullResult.data;
  let error = fullResult.error;

  if (error && isChatAiSettingsSchemaCacheError(error)) {
    console.warn('Native Chat AI settings schema cache stale on read', {
      conversationId,
      error: serializeChatAiSettingsDbError(error),
    });

    const legacyResult = (await sbAdmin
      .schema('private')
      .from('chat_conversation_ai_settings')
      .select(NATIVE_CHAT_AI_SETTINGS_LEGACY_SELECT)
      .eq('conversation_id', conversationId)
      .maybeSingle()) as {
      data: Partial<NativeChatAiSettings> | null;
      error: { message?: string } | null;
    };
    data = legacyResult.data;
    error = legacyResult.error;
  }

  if (error) {
    console.error('Failed to load native Chat AI settings', {
      conversationId,
      error: serializeChatAiSettingsDbError(error),
    });
  }

  return mapNativeChatAiSettingsRow(data);
}

async function ensureNativeAiShadowChat({
  auth,
  conversation,
  shadowChatId,
  model,
}: {
  auth: SessionAuthContext;
  conversation: ChatConversation;
  shadowChatId: string;
  model: string;
}) {
  const sbAdmin = await createAdminClient({ noCookie: true });
  const { error } = await sbAdmin.from('ai_chats').upsert(
    {
      id: shadowChatId,
      creator_id: auth.user.id,
      is_public: false,
      model,
      title: conversation.title ?? 'Mira',
    },
    { onConflict: 'id' }
  );

  if (error) {
    console.error('Failed to prepare native Chat AI shadow chat', error);
    return { ok: false };
  }

  return { ok: true };
}

async function getLatestAiAssistantMessage({
  chatId,
  supabase,
}: {
  chatId: string;
  supabase: SessionAuthContext['supabase'];
}) {
  const { data, error } = await supabase
    .from('ai_chat_messages')
    .select('id, content, metadata, model, prompt_tokens, completion_tokens')
    .eq('chat_id', chatId)
    .eq('role', 'ASSISTANT')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Failed to load native Chat AI assistant response', error);
    return null;
  }

  return ((data as AiAssistantMessageRow[] | null) ?? [])[0] ?? null;
}

async function cleanupNativeAiShadowChat({
  shadowChatId,
  wsId,
}: {
  shadowChatId: string;
  wsId: string;
}) {
  await cleanupNativeAiResources({ chatId: shadowChatId, wsId });
  const sbAdmin = await createAdminClient({ noCookie: true });
  const { error } = await sbAdmin
    .from('ai_chats')
    .delete()
    .eq('id', shadowChatId);
  if (error) {
    console.warn('Failed to clean up native Chat AI shadow chat', {
      error,
      shadowChatId,
    });
  }
}

function buildNativeAssistantMessageMetadata({
  aiMessage,
  content,
  splitIndex,
  splitTotal,
}: {
  aiMessage: AiAssistantMessageRow;
  content: string;
  splitIndex: number;
  splitTotal: number;
}) {
  const rootMetadata = readRecord(aiMessage.metadata) ?? {};
  const aiMetadata = readRecord(rootMetadata.ai) ?? {};
  const originalParts = Array.isArray(aiMetadata.parts)
    ? (aiMetadata.parts as Record<string, unknown>[])
    : [];
  const nonTextParts = originalParts.filter(
    (part) => readString(part.type) !== 'text'
  );
  const parts =
    splitTotal === 1 && originalParts.length > 0
      ? originalParts
      : [
          { type: 'text', text: content },
          ...(splitIndex === 0 ? nonTextParts : []),
        ];

  return {
    source: 'native-ai-chat',
    ai: {
      ...aiMetadata,
      aiChatMessageId: aiMessage.id,
      parts,
      split: {
        index: splitIndex,
        total: splitTotal,
      },
      usage: {
        ...(readRecord(aiMetadata.usage) ?? {}),
        inputTokens: aiMessage.prompt_tokens ?? 0,
        outputTokens: aiMessage.completion_tokens ?? 0,
      },
    },
  };
}
