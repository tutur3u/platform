import { randomUUID } from 'node:crypto';
import { createPOST as createAiChatPost } from '@tuturuuu/ai/chat/google/route';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { type SessionAuthContext, withSessionAuth } from '@/lib/api-auth';
import {
  getAiChatId,
  isAiChatConversationId,
  listAiChatMessages,
} from '@/lib/chat/agent-discovery';
import {
  type ChatConversation,
  type ChatMessage,
  type ChatRouteContext,
  callPrivateChatRpc,
  chatRpcErrorResponse,
  resolveChatRouteContext,
} from '@/lib/chat/private-rpc';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  downloadWorkspaceStorageObjectForProvider,
  resolveWorkspaceStorageProvider,
  uploadWorkspaceStorageFileDirect,
} from '@/lib/workspace-storage-provider';

type RouteParams = {
  conversationId: string;
  wsId: string;
};

const attachmentSchema = z.object({
  contentType: z.string().max(255).nullable().optional(),
  filename: z.string().trim().min(1).max(255),
  fullPath: z.string().max(1200).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  path: z.string().trim().min(1).max(1024),
  sizeBytes: z.number().int().min(0).max(104857600).nullable().optional(),
});

const createMessageSchema = z.object({
  attachments: z.array(attachmentSchema).max(20).optional(),
  content: z.string().max(10000).default(''),
  kind: z.enum(['user', 'assistant', 'system']).default('user'),
  replyToMessageId: z.string().uuid().nullable().optional(),
});
const AI_MESSAGE_SPLIT_DECORATOR = '[[TUTURUUU_CHAT_SPLIT]]';
const AI_MESSAGE_SPLIT_INSTRUCTION = `When a response would be easier to read as a natural chat, you may split it into multiple messages by putting ${AI_MESSAGE_SPLIT_DECORATOR} on its own line between message parts. Use it sparingly, keep each part self-contained, and never mention the decorator to the user.`;

export const GET = withSessionAuth<RouteParams>(
  async (request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    const url = new URL(request.url);
    const limit = Number(url.searchParams.get('limit') ?? 60);
    const before = url.searchParams.get('before');

    try {
      if (isAiChatConversationId(params.conversationId)) {
        const messages = await listAiChatMessages({
          conversationId: params.conversationId,
          supabase: auth.supabase,
          user: auth.user,
        });

        if (!messages) {
          return NextResponse.json(
            { message: 'Chat not found' },
            { status: 404 }
          );
        }

        return NextResponse.json({ messages });
      }

      const messages = await callPrivateChatRpc<ChatMessage[]>(
        'chat_list_messages',
        {
          p_actor_user_id: auth.user.id,
          p_before: before || null,
          p_conversation_id: params.conversationId,
          p_limit: Number.isFinite(limit) ? limit : 60,
          p_ws_id: context.context.normalizedWsId,
        }
      );

      return NextResponse.json({ messages: messages ?? [] });
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to load chat messages');
    }
  },
  { allowAppSessionAuth: true, rateLimitKind: 'read' }
);

export const POST = withSessionAuth<RouteParams>(
  async (request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const parsed = createMessageSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    if (isAiChatConversationId(params.conversationId)) {
      return sendAiChatMessage({
        auth,
        content: parsed.data.content,
        context: context.context,
        conversationId: params.conversationId,
        request,
        stream: wantsChatMessageStream(request),
      });
    }

    try {
      const message = await callPrivateChatRpc<ChatMessage>(
        'chat_send_message',
        {
          p_actor_user_id: auth.user.id,
          p_attachments: parsed.data.attachments ?? [],
          p_content: parsed.data.content,
          p_conversation_id: params.conversationId,
          p_kind: parsed.data.kind,
          p_reply_to_message_id: parsed.data.replyToMessageId ?? null,
          p_ws_id: context.context.normalizedWsId,
        }
      );

      if (parsed.data.kind === 'user') {
        const conversation = await callPrivateChatRpc<ChatConversation>(
          'chat_get_conversation',
          {
            p_actor_user_id: auth.user.id,
            p_conversation_id: params.conversationId,
            p_ws_id: context.context.normalizedWsId,
          }
        );

        if (conversation?.type === 'ai') {
          if (wantsChatMessageStream(request)) {
            return streamNativeAiConversationResponse({
              auth,
              context: context.context,
              conversation,
              request,
              userMessage: message,
            });
          }

          const assistantMessages = await sendNativeAiConversationMessages({
            auth,
            context: context.context,
            conversation,
            request,
            userMessage: message,
          });

          return NextResponse.json(
            {
              message: assistantMessages.at(-1) ?? message,
              messages: [message, ...assistantMessages],
            },
            { status: 201 }
          );
        }
      }

      return NextResponse.json(
        { message, messages: [message] },
        { status: 201 }
      );
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to send chat message');
    }
  },
  { allowAppSessionAuth: true }
);

type UiMessageForAi = {
  id: string;
  role: 'assistant' | 'system' | 'user';
  parts: { text: string; type: 'text' }[];
};

type NativeAiSettings = {
  credit_source: 'personal' | 'workspace';
  credit_ws_id: string | null;
  model_id: string | null;
  system_prompt: string | null;
  thinking_mode: 'fast' | 'thinking';
};

type NativeAiSettingsRow = Partial<NativeAiSettings> | null;

type AiAssistantMessageRow = {
  completion_tokens: number | null;
  content: string | null;
  id: string;
  metadata: unknown;
  model: string | null;
  prompt_tokens: number | null;
};

function wantsChatMessageStream(request: NextRequest) {
  return (
    request.headers.get('accept')?.includes('application/x-ndjson') ?? false
  );
}

function streamNativeAiConversationResponse({
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

        write({ messages: assistantMessages, type: 'messages' });
        write({ type: 'done' });
      } catch (error) {
        serverLogger.error('Failed to stream native Chat AI response', {
          conversationId: conversation.id,
          error,
        });
        write({ message: 'Failed to send AI chat message', type: 'error' });
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

async function sendAiChatMessage({
  auth,
  content,
  context,
  conversationId,
  request,
  stream,
}: {
  auth: SessionAuthContext;
  content: string;
  context: ChatRouteContext;
  conversationId: string;
  request: NextRequest;
  stream: boolean;
}) {
  const chatId = getAiChatId(conversationId);
  const trimmedContent = content.trim();

  if (!chatId) {
    return NextResponse.json({ message: 'Chat not found' }, { status: 404 });
  }

  if (!trimmedContent) {
    return NextResponse.json(
      { message: 'Message content is required' },
      { status: 400 }
    );
  }

  const { data: chat, error } = await auth.supabase
    .from('ai_chats')
    .select('id,model')
    .eq('id', chatId)
    .eq('creator_id', auth.user.id)
    .maybeSingle();

  if (error) {
    serverLogger.error('Failed to load AI chat', error);
    return NextResponse.json(
      { message: 'Failed to load AI chat' },
      { status: 500 }
    );
  }

  if (!chat) {
    return NextResponse.json({ message: 'Chat not found' }, { status: 404 });
  }

  const previousMessages =
    (await listAiChatMessages({
      conversationId,
      supabase: auth.supabase,
      user: auth.user,
    })) ?? [];
  const previousMessageIds = new Set(
    previousMessages.map((message) => message.id)
  );

  const aiMessages = toAiChatUiMessages(previousMessages);
  aiMessages.push({
    id: randomUUID(),
    parts: [{ text: trimmedContent, type: 'text' }],
    role: 'user',
  });

  const aiResponse = await callAiChatRoute({
    chatId: chat.id,
    creditSource: 'workspace',
    creditWsId: context.normalizedWsId,
    messages: aiMessages,
    model: normalizeAiChatModel(chat.model),
    observabilityContext: buildNativeAiObservabilityContext(previousMessages),
    request,
    supabase: auth.supabase,
    thinkingMode: 'fast',
    user: auth.user,
    wsId: context.normalizedWsId,
  });

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text().catch(() => '');
    return NextResponse.json(
      { message: errorText || 'Failed to send AI chat message' },
      { status: aiResponse.status }
    );
  }

  if (stream) {
    return streamAiChatMessageResponse({
      aiResponse,
      auth,
      conversationId,
      previousMessageIds,
    });
  }

  await consumeAiResponseTextDeltas(aiResponse);

  const latestMessages =
    (await listAiChatMessages({
      conversationId,
      supabase: auth.supabase,
      user: auth.user,
    })) ?? [];
  const newMessages = latestMessages.filter(
    (item) => !previousMessageIds.has(item.id)
  );
  const message =
    newMessages
      .slice()
      .reverse()
      .find((item) => item.kind === 'assistant') ?? newMessages.at(-1);

  if (!message) {
    return NextResponse.json(
      { message: 'AI response was not saved' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message, messages: newMessages }, { status: 201 });
}

function streamAiChatMessageResponse({
  aiResponse,
  auth,
  conversationId,
  previousMessageIds,
}: {
  aiResponse: Response;
  auth: SessionAuthContext;
  conversationId: string;
  previousMessageIds: Set<string>;
}) {
  const encoder = new TextEncoder();

  const responseStream = new ReadableStream({
    async start(controller) {
      const write = (event: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        await consumeAiResponseTextDeltas(
          aiResponse,
          (delta) => write({ delta, type: 'assistant_delta' }),
          (part) => write({ part, type: 'assistant_part' })
        );

        const latestMessages =
          (await listAiChatMessages({
            conversationId,
            supabase: auth.supabase,
            user: auth.user,
          })) ?? [];
        const newMessages = latestMessages.filter(
          (item) => !previousMessageIds.has(item.id)
        );

        if (newMessages.length === 0) {
          write({ message: 'AI response was not saved', type: 'error' });
          return;
        }

        write({ messages: newMessages, type: 'messages' });
        write({ type: 'done' });
      } catch (error) {
        serverLogger.error('Failed to stream AI chat response', {
          conversationId,
          error,
        });
        write({ message: 'Failed to send AI chat message', type: 'error' });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(responseStream, {
    status: 201,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/x-ndjson; charset=utf-8',
    },
  });
}

async function sendNativeAiConversationMessages({
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
  const shadowChatResult = await ensureNativeAiShadowChat({
    auth,
    conversation,
    model: normalizeNativeAiModel(settings.model_id),
  });

  if (!shadowChatResult.ok) {
    throw new Error('Failed to prepare AI chat');
  }

  await copyChatAttachmentsToAiResources({
    conversationId: conversation.id,
    targetWsId: context.normalizedWsId,
    userMessage,
  });

  const [privateMessages, existingAiMessages] = await Promise.all([
    callPrivateChatRpc<ChatMessage[]>('chat_list_messages', {
      p_actor_user_id: auth.user.id,
      p_before: null,
      p_conversation_id: conversation.id,
      p_limit: 100,
      p_ws_id: context.normalizedWsId,
    }),
    listExistingAiMessageIds({
      chatId: conversation.id,
      supabase: auth.supabase,
    }),
  ]);
  const aiMessages = toNativeAiUiMessages(
    privateMessages ?? [],
    settings.system_prompt
  );

  const aiResponse = await callAiChatRoute({
    chatId: conversation.id,
    creditSource: settings.credit_source,
    creditWsId:
      settings.credit_source === 'personal'
        ? (settings.credit_ws_id ?? undefined)
        : (settings.credit_ws_id ?? context.normalizedWsId),
    messages: aiMessages,
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
    serverLogger.error('Native Chat AI response failed', {
      conversationId: conversation.id,
      status: aiResponse.status,
      errorText,
    });
    throw new Error(errorText || 'Failed to send AI chat message');
  }

  await consumeAiResponseTextDeltas(aiResponse, onDelta, onPart);

  const assistantResponse = await getLatestNewAiAssistantMessage({
    chatId: conversation.id,
    knownMessageIds: existingAiMessages,
    supabase: auth.supabase,
  });

  if (!assistantResponse?.content?.trim()) {
    serverLogger.error('Native Chat AI response was not saved', {
      conversationId: conversation.id,
    });
    throw new Error('AI response was not saved');
  }

  const assistantParts = splitAiAssistantContent(assistantResponse.content);
  const assistantMessages: ChatMessage[] = [];

  for (let index = 0; index < assistantParts.length; index++) {
    const content = assistantParts[index]!;
    const message = await callPrivateChatRpc<ChatMessage>('chat_send_message', {
      p_actor_user_id: auth.user.id,
      p_attachments: [],
      p_content: content,
      p_conversation_id: conversation.id,
      p_kind: 'assistant',
      p_reply_to_message_id: null,
      p_ws_id: context.normalizedWsId,
    });
    const metadata = await updateNativeAssistantMessageMetadata({
      aiMessage: assistantResponse,
      content,
      messageId: message.id,
      splitIndex: index,
      splitTotal: assistantParts.length,
    });

    assistantMessages.push(metadata ? { ...message, metadata } : message);
  }

  return assistantMessages;
}

async function copyChatAttachmentsToAiResources({
  conversationId,
  targetWsId,
  userMessage,
}: {
  conversationId: string;
  targetWsId: string;
  userMessage: ChatMessage;
}) {
  if (userMessage.attachments.length === 0) return;

  await Promise.all(
    userMessage.attachments.map(async (attachment) => {
      const sourceWsId = attachment.storageWsId ?? targetWsId;

      try {
        const { provider } = await resolveWorkspaceStorageProvider(sourceWsId);
        const downloaded = await downloadWorkspaceStorageObjectForProvider(
          sourceWsId,
          provider,
          attachment.storagePath
        );
        await uploadWorkspaceStorageFileDirect(
          targetWsId,
          `chats/ai/resources/${conversationId}/${attachment.id}-${attachment.filename}`,
          downloaded.buffer,
          {
            contentType:
              attachment.contentType ?? downloaded.contentType ?? undefined,
            upsert: true,
          }
        );
      } catch (error) {
        serverLogger.error('Failed to mirror Chat attachment for AI context', {
          attachmentId: attachment.id,
          conversationId,
          error,
        });
      }
    })
  );
}

async function consumeAiResponseTextDeltas(
  response: Response,
  onDelta?: (delta: string) => void,
  onPart?: (part: Record<string, unknown>) => void
) {
  if (!response.body) return;

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: !done });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const event of events) {
        emitAiTextDeltaFromSseEvent(event, onDelta, onPart);
      }
    }

    if (done) break;
  }

  emitAiTextDeltaFromSseEvent(buffer, onDelta, onPart);
}

function emitAiTextDeltaFromSseEvent(
  event: string,
  onDelta?: (delta: string) => void,
  onPart?: (part: Record<string, unknown>) => void
) {
  if (!event.trim()) return;

  const data = event
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
    .trim();

  if (!data || data === '[DONE]') return;

  try {
    const chunk = JSON.parse(data) as Record<string, unknown>;
    if (chunk.type === 'text-delta' && typeof chunk.delta === 'string') {
      onDelta?.(chunk.delta);
    } else if (
      chunk.type === 'reasoning-delta' &&
      typeof chunk.delta === 'string'
    ) {
      onPart?.({ type: 'reasoning', text: chunk.delta, streaming: true });
    } else if (shouldForwardAiStreamPart(chunk)) {
      onPart?.(chunk);
    }
  } catch {
    // Ignore malformed stream chunks from upstream; the AI route still owns
    // final persistence and error reporting.
  }
}

function shouldForwardAiStreamPart(chunk: Record<string, unknown>) {
  const type = typeof chunk.type === 'string' ? chunk.type : '';
  return (
    type === 'source-url' ||
    type === 'dynamic-tool' ||
    type.startsWith('tool-') ||
    type.endsWith('-tool-call') ||
    type.endsWith('-tool-result')
  );
}

async function getNativeAiSettings(conversationId: string) {
  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data, error } = (await sbAdmin
    .schema('private')
    .from('chat_conversation_ai_settings')
    .select(
      'model_id, system_prompt, thinking_mode, credit_source, credit_ws_id'
    )
    .eq('conversation_id', conversationId)
    .maybeSingle()) as {
    data: NativeAiSettingsRow;
    error: { message?: string } | null;
  };

  if (error) {
    serverLogger.error('Failed to load native Chat AI settings', error);
  }

  return {
    credit_source:
      data && 'credit_source' in data && data.credit_source === 'personal'
        ? 'personal'
        : 'workspace',
    credit_ws_id:
      data && 'credit_ws_id' in data && typeof data.credit_ws_id === 'string'
        ? data.credit_ws_id
        : null,
    model_id: data?.model_id ?? null,
    system_prompt: data?.system_prompt ?? null,
    thinking_mode:
      data && 'thinking_mode' in data && data.thinking_mode === 'thinking'
        ? 'thinking'
        : 'fast',
  } satisfies NativeAiSettings;
}

async function ensureNativeAiShadowChat({
  auth,
  conversation,
  model,
}: {
  auth: SessionAuthContext;
  conversation: ChatConversation;
  model: string;
}) {
  const sbAdmin = await createAdminClient({ noCookie: true });
  const { error } = await sbAdmin.from('ai_chats').upsert(
    {
      id: conversation.id,
      creator_id: auth.user.id,
      is_public: false,
      model,
      title: conversation.title ?? 'Mira',
    },
    { onConflict: 'id' }
  );

  if (error) {
    serverLogger.error('Failed to prepare native Chat AI shadow chat', error);
    return { ok: false };
  }

  return { ok: true };
}

async function listExistingAiMessageIds({
  chatId,
  supabase,
}: {
  chatId: string;
  supabase: SessionAuthContext['supabase'];
}) {
  const { data, error } = await supabase
    .from('ai_chat_messages')
    .select('id')
    .eq('chat_id', chatId);

  if (error) {
    serverLogger.error('Failed to load native Chat AI message markers', error);
    return new Set<string>();
  }

  return new Set((data ?? []).map((message) => message.id));
}

async function getLatestNewAiAssistantMessage({
  chatId,
  knownMessageIds,
  supabase,
}: {
  chatId: string;
  knownMessageIds: Set<string>;
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
    serverLogger.error(
      'Failed to load native Chat AI assistant response',
      error
    );
    return null;
  }

  return (
    ((data as AiAssistantMessageRow[] | null) ?? []).find(
      (message) => !knownMessageIds.has(message.id)
    ) ?? null
  );
}

async function updateNativeAssistantMessageMetadata({
  aiMessage,
  content,
  messageId,
  splitIndex,
  splitTotal,
}: {
  aiMessage: AiAssistantMessageRow;
  content: string;
  messageId: string;
  splitIndex: number;
  splitTotal: number;
}) {
  const metadata = buildNativeAssistantMessageMetadata({
    aiMessage,
    content,
    splitIndex,
    splitTotal,
  });

  const sbAdmin = await createAdminClient({ noCookie: true });
  const { error } = await sbAdmin
    .schema('private')
    .from('chat_messages')
    .update({ metadata } as never)
    .eq('id', messageId);

  if (error) {
    serverLogger.error('Failed to attach native Chat AI metadata', {
      aiMessageId: aiMessage.id,
      error,
      messageId,
    });
    return null;
  }

  return metadata;
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

function buildNativeAiObservabilityContext(messages: ChatMessage[]) {
  return messages.slice(-20).map((message) => {
    const chars = message.content.length;

    return {
      chars,
      id: message.id,
      kind: message.kind,
      label:
        message.kind === 'assistant'
          ? 'Assistant message'
          : message.kind === 'system'
            ? 'System message'
            : 'User message',
      tokensEstimate: Math.ceil(chars / 4),
    };
  });
}

function splitAiAssistantContent(content: string) {
  const parts = content
    .split(
      new RegExp(`\\s*${escapeRegExp(AI_MESSAGE_SPLIT_DECORATOR)}\\s*`, 'gu')
    )
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [content.trim()].filter(Boolean);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function toAiChatUiMessages(messages: ChatMessage[]): UiMessageForAi[] {
  const uiMessages = messages
    .filter((message) => message.content.trim())
    .map(
      (message): UiMessageForAi => ({
        id: message.id,
        parts: [{ text: message.content, type: 'text' }],
        role: message.kind,
      })
    );

  if (uiMessages.length > 0) return withAiMessageSplitInstruction(uiMessages);

  return withAiMessageSplitInstruction([
    {
      id: randomUUID(),
      parts: [
        {
          text: 'Continue this migrated AI chat in Tuturuuu Chat.',
          type: 'text',
        },
      ],
      role: 'system',
    },
  ]);
}

function toNativeAiUiMessages(
  messages: ChatMessage[],
  systemPrompt?: string | null
): UiMessageForAi[] {
  const uiMessages = messages
    .filter(
      (message) =>
        (message.kind === 'assistant' || message.kind === 'user') &&
        message.content.trim()
    )
    .map(
      (message): UiMessageForAi => ({
        id: message.id,
        parts: [{ text: message.content, type: 'text' }],
        role: message.kind,
      })
    );

  const prompt = systemPrompt?.trim();
  if (!prompt) return withAiMessageSplitInstruction(uiMessages);

  return withAiMessageSplitInstruction([
    {
      id: randomUUID(),
      parts: [{ text: prompt, type: 'text' }],
      role: 'system',
    },
    ...uiMessages,
  ]);
}

function withAiMessageSplitInstruction(messages: UiMessageForAi[]) {
  return [
    {
      id: randomUUID(),
      parts: [{ text: AI_MESSAGE_SPLIT_INSTRUCTION, type: 'text' }],
      role: 'system',
    },
    ...messages,
  ] satisfies UiMessageForAi[];
}

async function callAiChatRoute({
  chatId,
  creditSource,
  creditWsId,
  messages,
  model,
  observabilityContext,
  request,
  supabase,
  thinkingMode,
  user,
  wsId,
}: {
  chatId: string;
  creditSource: 'personal' | 'workspace';
  creditWsId?: string;
  messages: UiMessageForAi[];
  model: string;
  observabilityContext?: Record<string, unknown>[];
  request: NextRequest;
  supabase: SessionAuthContext['supabase'];
  thinkingMode: 'fast' | 'thinking';
  user: SessionAuthContext['user'];
  wsId: string;
}) {
  const headers = new Headers(request.headers);
  headers.set('content-type', 'application/json');
  headers.delete('content-length');

  const aiRequest = new NextRequest(request.url, {
    body: JSON.stringify({
      creditSource,
      id: chatId,
      isMiraMode: true,
      messages,
      model,
      observabilityContext,
      thinkingMode,
      workspaceContextId: wsId,
      wsId,
      ...(creditWsId ? { creditWsId } : {}),
    }),
    headers,
    method: 'POST',
  });

  return createAiChatPost({
    serverAPIKeyFallback: true,
    resolveAuth: async () => ({
      ok: true,
      supabase,
      user,
    }),
  })(aiRequest);
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeAiChatModel(model: string | null) {
  if (!model?.trim()) return 'google/gemini-3-flash';
  const trimmed = model.trim();
  return trimmed.includes('/') ? trimmed : `google/${trimmed}`;
}

function normalizeNativeAiModel(model: string | null) {
  if (!model?.trim()) return 'google/gemini-3-flash';
  const trimmed = model.trim();
  return trimmed.includes('/') ? trimmed : `google/${trimmed}`;
}
