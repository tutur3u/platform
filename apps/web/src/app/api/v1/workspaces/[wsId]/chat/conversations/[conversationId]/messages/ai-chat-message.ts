import { randomUUID } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';
import type { SessionAuthContext } from '@/lib/api-auth';
import {
  getAiChatId,
  isUserPersonalChatWorkspace,
  listAiChatMessages,
} from '@/lib/chat/agent-discovery';
import type { ChatMessage, ChatRouteContext } from '@/lib/chat/private-rpc';
import { getChatRealtimeUserAudience } from '@/lib/chat/realtime';
import {
  buildNativeAiObservabilityContext,
  type ChatMessageAttachmentInput,
  callAiChatRoute,
  consumeAiResponseTextDeltas,
  copyAiChatAttachmentInputsToResources,
  getAiChatAttachmentPlaceholderContent,
  maybeAutoRenameAiChat,
  normalizeAiChatModel,
  publishChatRealtimeMessages,
  readRecord,
  toAiChatUiMessages,
} from './ai-message-shared';

export async function sendAiChatMessage({
  attachments,
  auth,
  clientRequestId,
  content,
  context,
  conversationId,
  request,
  stream,
}: {
  attachments: ChatMessageAttachmentInput[];
  auth: SessionAuthContext;
  clientRequestId?: string;
  content: string;
  context: ChatRouteContext;
  conversationId: string;
  request: NextRequest;
  stream: boolean;
}) {
  const chatId = getAiChatId(conversationId);
  const trimmedContent = content.trim();
  const messageContent =
    trimmedContent || getAiChatAttachmentPlaceholderContent(attachments);
  const requestId = clientRequestId ?? randomUUID();

  if (!chatId) {
    return NextResponse.json({ message: 'Chat not found' }, { status: 404 });
  }

  if (
    !(await isUserPersonalChatWorkspace({
      supabase: auth.supabase,
      userId: auth.user.id,
      wsId: context.normalizedWsId,
    }))
  ) {
    return NextResponse.json({ message: 'Chat not found' }, { status: 404 });
  }

  if (!messageContent) {
    return NextResponse.json(
      { message: 'Message content is required' },
      { status: 400 }
    );
  }

  const { data: chat, error } = await auth.supabase
    .from('ai_chats')
    .select('id,model,title')
    .eq('id', chatId)
    .eq('creator_id', auth.user.id)
    .maybeSingle();

  if (error) {
    console.error('Failed to load AI chat', error);
    return NextResponse.json(
      { message: 'Failed to load AI chat' },
      { status: 500 }
    );
  }

  if (!chat) {
    return NextResponse.json({ message: 'Chat not found' }, { status: 404 });
  }

  let previousMessages: ChatMessage[];
  try {
    previousMessages =
      (await listAiChatMessages({
        conversationId,
        supabase: auth.supabase,
        user: auth.user,
        wsId: context.normalizedWsId,
      })) ?? [];
    const existingRequestMessages = filterRequestMessages(
      previousMessages,
      requestId
    );
    if (
      existingRequestMessages.some((message) => message.kind === 'assistant')
    ) {
      return replayAiChatMessageResponse(existingRequestMessages, stream);
    }
    if (existingRequestMessages.length > 0) {
      return NextResponse.json(
        {
          code: 'ai_message_request_in_progress',
          message: 'This AI message request is already in progress.',
        },
        { status: 409 }
      );
    }
    await copyAiChatAttachmentInputsToResources({
      attachments,
      chatId: chat.id,
      wsId: context.normalizedWsId,
    });
  } catch (error) {
    console.error('Failed to prepare AI chat message', {
      chatId: chat.id,
      error,
    });
    return NextResponse.json(
      { message: 'Failed to send AI chat message' },
      { status: 500 }
    );
  }

  const aiMessages = toAiChatUiMessages(previousMessages);
  aiMessages.push({
    id: requestId,
    parts: [{ text: messageContent, type: 'text' }],
    role: 'user',
  });

  const aiResponse = await callAiChatRoute({
    chatId: chat.id,
    creditSource: 'workspace',
    creditWsId: context.normalizedWsId,
    messages: aiMessages,
    miraMode: false,
    model: normalizeAiChatModel(chat.model),
    observabilityContext: buildNativeAiObservabilityContext(previousMessages),
    persistenceRequestId: requestId,
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
      chatId: chat.id,
      currentTitle:
        'title' in chat && typeof chat.title === 'string' ? chat.title : null,
      conversationId,
      firstMessageContent: messageContent,
      previousMessages,
      requestId,
      wsId: context.normalizedWsId,
    });
  }

  try {
    await consumeAiResponseTextDeltas(aiResponse);
  } catch (error) {
    console.error('Failed to consume AI chat response', {
      chatId: chat.id,
      error,
    });
    return NextResponse.json(
      { message: 'Failed to send AI chat message' },
      { status: 500 }
    );
  }

  const requestMessages = await listRequestMessages({
    auth,
    conversationId,
    requestId,
    wsId: context.normalizedWsId,
  });
  if (requestMessages instanceof NextResponse) return requestMessages;
  const message =
    requestMessages.findLast((item) => item.kind === 'assistant') ??
    requestMessages.at(-1);

  if (!message) {
    return NextResponse.json(
      { message: 'AI response was not saved' },
      { status: 500 }
    );
  }

  await maybeAutoRenameAiChat({
    chatId: chat.id,
    currentTitle:
      'title' in chat && typeof chat.title === 'string' ? chat.title : null,
    firstMessageContent: messageContent,
    previousMessages,
    supabase: auth.supabase,
  });
  await publishChatRealtimeMessages({
    actorUserId: auth.user.id,
    audience: getChatRealtimeUserAudience(auth.user.id),
    messages: requestMessages,
    wsId: context.normalizedWsId,
  });

  return NextResponse.json(
    { message, messages: requestMessages },
    { status: 201 }
  );
}

async function listRequestMessages({
  auth,
  conversationId,
  requestId,
  wsId,
}: {
  auth: SessionAuthContext;
  conversationId: string;
  requestId: string;
  wsId: string;
}) {
  try {
    const latestMessages =
      (await listAiChatMessages({
        conversationId,
        supabase: auth.supabase,
        user: auth.user,
        wsId,
      })) ?? [];
    return filterRequestMessages(latestMessages, requestId);
  } catch (error) {
    console.error('Failed to load saved AI chat messages', {
      conversationId,
      error,
      requestId,
    });
    return NextResponse.json(
      { message: 'Failed to send AI chat message' },
      { status: 500 }
    );
  }
}

function filterRequestMessages(messages: ChatMessage[], requestId: string) {
  return messages.filter((message) => {
    const wrappedMetadata = readRecord(message.metadata);
    return readRecord(wrappedMetadata?.metadata)?.requestId === requestId;
  });
}

function replayAiChatMessageResponse(messages: ChatMessage[], stream: boolean) {
  if (!stream) {
    return NextResponse.json({ message: messages.at(-1), messages });
  }

  const body = `${JSON.stringify({ messages, type: 'messages' })}\n${JSON.stringify({ type: 'done' })}\n`;
  return new NextResponse(body, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/x-ndjson; charset=utf-8',
    },
  });
}

function streamAiChatMessageResponse({
  aiResponse,
  auth,
  chatId,
  currentTitle,
  conversationId,
  firstMessageContent,
  previousMessages,
  requestId,
  wsId,
}: {
  aiResponse: Response;
  auth: SessionAuthContext;
  chatId: string;
  currentTitle: string | null;
  conversationId: string;
  firstMessageContent: string;
  previousMessages: Awaited<ReturnType<typeof listAiChatMessages>>;
  requestId: string;
  wsId: string;
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

        const requestMessages = await listRequestMessages({
          auth,
          conversationId,
          requestId,
          wsId,
        });
        if (requestMessages instanceof NextResponse) {
          write({ message: 'Failed to send AI chat message', type: 'error' });
          write({ type: 'done' });
          return;
        }

        if (requestMessages.length === 0) {
          write({ message: 'AI response was not saved', type: 'error' });
          write({ type: 'done' });
          return;
        }

        await maybeAutoRenameAiChat({
          chatId,
          currentTitle,
          firstMessageContent,
          previousMessages: previousMessages ?? [],
          supabase: auth.supabase,
        });
        await publishChatRealtimeMessages({
          actorUserId: auth.user.id,
          audience: getChatRealtimeUserAudience(auth.user.id),
          messages: requestMessages,
          wsId,
        });
        write({ messages: requestMessages, type: 'messages' });
        write({ type: 'done' });
      } catch (error) {
        console.error('Failed to stream AI chat response', {
          conversationId,
          error,
        });
        const requestMessages = await listRequestMessages({
          auth,
          conversationId,
          requestId,
          wsId,
        });
        if (!(requestMessages instanceof NextResponse)) {
          write({ messages: requestMessages, type: 'messages' });
        }
        write({ message: 'Failed to send AI chat message', type: 'error' });
        write({ type: 'done' });
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
