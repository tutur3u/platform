import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  isAiAgentExternalConversationId,
  listAiAgentExternalMessages,
} from '@/lib/ai-agents/external-chat-mirror';
import { withSessionAuth } from '@/lib/api-auth';
import {
  isAiChatConversationId,
  listAiChatMessages,
} from '@/lib/chat/agent-discovery';
import { notifyChatMessageRecipients } from '@/lib/chat/notifications';
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
import {
  deliverExternalChatReplyIfBound,
  recordExternalChatReply,
} from '@/lib/external-chat/delivery';
import { sendAiChatMessage } from './ai-chat-message';
import { publishChatRealtimeMessages } from './ai-message-shared';
import {
  sendNativeAiConversationMessages,
  streamNativeAiConversationResponse,
} from './native-ai-message';

const NATIVE_AI_ASSISTANT_ERROR_MESSAGE =
  'Assistant response failed. Your message was saved.';

function wantsChatMessageStream(request: NextRequest) {
  return (
    request.headers.get('accept')?.includes('application/x-ndjson') ?? false
  );
}

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
          before: before || null,
          conversationId: params.conversationId,
          limit: Number.isFinite(limit) ? limit : 60,
          supabase: auth.supabase,
          user: auth.user,
          wsId: context.context.normalizedWsId,
        });

        if (!messages) {
          return NextResponse.json(
            { message: 'Chat not found' },
            { status: 404 }
          );
        }

        return NextResponse.json({ messages });
      }

      if (isAiAgentExternalConversationId(params.conversationId)) {
        const messages = await listAiAgentExternalMessages({
          actorUserId: auth.user.id,
          before: before || null,
          conversationId: params.conversationId,
          limit: Number.isFinite(limit) ? limit : 60,
          wsId: context.context.normalizedWsId,
        });

        if (!messages) {
          return NextResponse.json(
            { message: 'External thread not found' },
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
      permission: 'create_chat',
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
        attachments: parsed.data.attachments ?? [],
        auth,
        content: parsed.data.content,
        context: context.context,
        conversationId: params.conversationId,
        request,
        stream: wantsChatMessageStream(request),
      });
    }

    if (isAiAgentExternalConversationId(params.conversationId)) {
      return NextResponse.json(
        {
          message:
            'External AI-agent conversations are read-only here. Send manual responses from Infrastructure > AI Agents.',
        },
        { status: 403 }
      );
    }

    let externalDelivery = null;
    if (parsed.data.kind === 'user') {
      try {
        externalDelivery = await deliverExternalChatReplyIfBound({
          content: parsed.data.content,
          conversationId: params.conversationId,
          senderId: auth.user.id,
          wsId: context.context.normalizedWsId,
        });
      } catch (error) {
        console.warn(
          'External chat delivery failed before native persistence',
          {
            conversationId: params.conversationId,
            error,
          }
        );
        return NextResponse.json(
          {
            code: 'external_delivery_failed',
            message:
              'The external inbox did not accept this reply. Nothing was saved.',
          },
          { status: 502 }
        );
      }
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
      if (!message) {
        return NextResponse.json(
          { message: 'Chat conversation not found' },
          { status: 404 }
        );
      }

      if (externalDelivery) {
        try {
          await recordExternalChatReply({
            delivery: externalDelivery,
            messageId: message.id,
            wsId: context.context.normalizedWsId,
          });
        } catch (error) {
          console.error('Failed to record acknowledged external chat reply', {
            error,
            messageId: message.id,
          });
        }
      }

      const conversation = await callPrivateChatRpc<ChatConversation>(
        'chat_get_conversation',
        {
          p_actor_user_id: auth.user.id,
          p_conversation_id: params.conversationId,
          p_ws_id: context.context.normalizedWsId,
        }
      );
      if (!conversation) {
        return NextResponse.json(
          { message: 'Chat conversation not found' },
          { status: 404 }
        );
      }

      const audience = getChatRealtimeAudience(conversation);

      if (parsed.data.kind === 'user') {
        await publishChatRealtimeEvent({
          actorUserId: auth.user.id,
          audience,
          conversationId: message.conversationId,
          message,
          type: 'message.created',
          wsId: context.context.normalizedWsId,
        });

        await notifyChatMessageRecipients({
          actorUserId: auth.user.id,
          conversation,
          message,
          wsId: context.context.normalizedWsId,
        });

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

          let assistantMessages: ChatMessage[] = [];

          try {
            assistantMessages = await sendNativeAiConversationMessages({
              auth,
              context: context.context,
              conversation,
              request,
              userMessage: message,
            });
          } catch (error) {
            console.error(
              'Native Chat AI response failed after user message was saved',
              {
                conversationId: conversation.id,
                error,
                userMessageId: message.id,
              }
            );

            return NextResponse.json(
              {
                assistantError: NATIVE_AI_ASSISTANT_ERROR_MESSAGE,
                message,
                messages: [message],
              },
              { status: 201 }
            );
          }

          await publishChatRealtimeMessages({
            actorUserId: auth.user.id,
            audience,
            messages: assistantMessages,
            wsId: context.context.normalizedWsId,
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

      if (parsed.data.kind !== 'user') {
        await publishChatRealtimeEvent({
          actorUserId: auth.user.id,
          audience,
          conversationId: message.conversationId,
          message,
          type: 'message.created',
          wsId: context.context.normalizedWsId,
        });
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
