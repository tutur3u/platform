import { randomUUID } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';
import type { SessionAuthContext } from '@/lib/api-auth';
import { getAiChatId, listAiChatMessages } from '@/lib/chat/agent-discovery';
import type { ChatRouteContext } from '@/lib/chat/private-rpc';
import { getChatRealtimeUserAudience } from '@/lib/chat/realtime';
import {
  buildNativeAiObservabilityContext,
  type ChatMessageAttachmentInput,
  callAiChatRoute,
  consumeAiResponseTextDeltas,
  getAiChatAttachmentPlaceholderContent,
  maybeAutoRenameAiChat,
  normalizeAiChatModel,
  publishChatRealtimeMessages,
  toAiChatUiMessages,
} from './ai-message-shared';

export async function sendAiChatMessage({
  attachments,
  auth,
  content,
  context,
  conversationId,
  request,
  stream,
}: {
  attachments: ChatMessageAttachmentInput[];
  auth: SessionAuthContext;
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

  if (!chatId) {
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

  const previousMessages =
    (await listAiChatMessages({
      conversationId,
      supabase: auth.supabase,
      user: auth.user,
      wsId: context.normalizedWsId,
    })) ?? [];
  const previousMessageIds = new Set(
    previousMessages.map((message) => message.id)
  );

  await maybeAutoRenameAiChat({
    chatId: chat.id,
    currentTitle:
      'title' in chat && typeof chat.title === 'string' ? chat.title : null,
    firstMessageContent: messageContent,
    previousMessages,
    supabase: auth.supabase,
  });

  const aiMessages = toAiChatUiMessages(previousMessages);
  aiMessages.push({
    id: randomUUID(),
    parts: [{ text: messageContent, type: 'text' }],
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
      wsId: context.normalizedWsId,
    });
  }

  await consumeAiResponseTextDeltas(aiResponse);

  const latestMessages =
    (await listAiChatMessages({
      conversationId,
      supabase: auth.supabase,
      user: auth.user,
      wsId: context.normalizedWsId,
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

  await publishChatRealtimeMessages({
    actorUserId: auth.user.id,
    audience: getChatRealtimeUserAudience(auth.user.id),
    messages: newMessages,
    wsId: context.normalizedWsId,
  });

  return NextResponse.json({ message, messages: newMessages }, { status: 201 });
}

function streamAiChatMessageResponse({
  aiResponse,
  auth,
  conversationId,
  previousMessageIds,
  wsId,
}: {
  aiResponse: Response;
  auth: SessionAuthContext;
  conversationId: string;
  previousMessageIds: Set<string>;
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

        const latestMessages =
          (await listAiChatMessages({
            conversationId,
            supabase: auth.supabase,
            user: auth.user,
            wsId,
          })) ?? [];
        const newMessages = latestMessages.filter(
          (item) => !previousMessageIds.has(item.id)
        );

        if (newMessages.length === 0) {
          write({ message: 'AI response was not saved', type: 'error' });
          return;
        }

        await publishChatRealtimeMessages({
          actorUserId: auth.user.id,
          audience: getChatRealtimeUserAudience(auth.user.id),
          messages: newMessages,
          wsId,
        });
        write({ messages: newMessages, type: 'messages' });
        write({ type: 'done' });
      } catch (error) {
        console.error('Failed to stream AI chat response', {
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
