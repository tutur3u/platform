import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createLegacyHeadHandler } from '@/legacy-api-routes/head';
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
  cancelExternalChatReply,
  deliverExternalChatReplyIfBound,
  finalizeExternalChatReply,
  isExternalChatConversation,
  markExternalChatReplyDelivered,
  type ReservedExternalChatDelivery,
  reserveExternalChatReply,
} from '@/lib/external-chat/delivery';
import { sendAiChatMessage } from './ai-chat-message';
import {
  NATIVE_AI_ASSISTANT_ERROR_MESSAGE,
  publishChatRealtimeMessages,
} from './ai-message-shared';
import {
  sendNativeAiConversationMessages,
  streamNativeAiConversationResponse,
} from './native-ai-message';

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
  clientRequestId: z.string().uuid().optional(),
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
    const parsedLimit = Number(url.searchParams.get('limit') ?? 60);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(Math.trunc(parsedLimit), 1), 100)
      : 60;
    const before = url.searchParams.get('before');

    try {
      if (isAiChatConversationId(params.conversationId)) {
        const messages = await listAiChatMessages({
          before: before || null,
          conversationId: params.conversationId,
          limit,
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
          limit,
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
          p_limit: limit,
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

export const HEAD = createLegacyHeadHandler(GET);

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
        clientRequestId: parsed.data.clientRequestId,
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

    let externalBound: boolean;
    try {
      externalBound = await isExternalChatConversation({
        conversationId: params.conversationId,
        wsId: context.context.normalizedWsId,
      });
    } catch (error) {
      console.error('Failed to resolve external chat binding', {
        conversationId: params.conversationId,
        error,
      });
      return NextResponse.json(
        { message: 'Failed to resolve chat delivery route' },
        { status: 500 }
      );
    }

    let externalReservation: ReservedExternalChatDelivery | null = null;
    if (externalBound) {
      if (parsed.data.kind !== 'user') {
        return NextResponse.json(
          {
            code: 'external_message_kind_unsupported',
            message: 'Chat replies only accept user messages.',
          },
          { status: 400 }
        );
      }
      if ((parsed.data.attachments?.length ?? 0) > 0) {
        return NextResponse.json(
          {
            code: 'external_attachments_unsupported',
            message: 'Connected-site replies do not support attachments yet.',
          },
          { status: 400 }
        );
      }
      if (!parsed.data.content.trim()) {
        return NextResponse.json(
          { message: 'Message content is required' },
          { status: 400 }
        );
      }
      if (!parsed.data.clientRequestId) {
        return NextResponse.json(
          { message: 'Client request ID is required' },
          { status: 400 }
        );
      }
      try {
        externalReservation = await reserveExternalChatReply({
          clientRequestId: parsed.data.clientRequestId,
          content: parsed.data.content,
          conversationId: params.conversationId,
          replyToMessageId: parsed.data.replyToMessageId ?? null,
          senderId: auth.user.id,
          wsId: context.context.normalizedWsId,
        });
      } catch (error) {
        return chatRpcErrorResponse(
          error,
          'Failed to reserve external chat reply'
        );
      }
      if (!externalReservation) {
        return NextResponse.json(
          {
            code: 'external_delivery_reservation_failed',
            message: 'Failed to reserve connected-site reply.',
          },
          { status: 502 }
        );
      }
      if (!externalReservation.delivered) {
        const deliveryId = externalReservation.deliveryId;
        try {
          await deliverExternalChatReplyIfBound({
            configurationRevision: externalReservation.configurationRevision,
            content: parsed.data.content,
            conversationId: params.conversationId,
            deliveryId: externalReservation.deliveryId,
            idempotencyKey: externalReservation.idempotencyKey,
            senderId: auth.user.id,
            wsId: context.context.normalizedWsId,
          });
          await markExternalChatReplyDelivered({
            deliveryId: externalReservation.deliveryId,
            wsId: context.context.normalizedWsId,
          });
        } catch (error) {
          await cancelExternalChatReply({
            deliveryId,
            wsId: context.context.normalizedWsId,
          }).catch((cancelError) => {
            console.error('Failed to release external delivery lease', {
              cancelError,
              deliveryId,
            });
          });
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
    }

    try {
      const persistence = externalReservation
        ? await finalizeExternalChatReply({
            content: parsed.data.content,
            deliveryId: externalReservation.deliveryId,
            replyToMessageId: parsed.data.replyToMessageId ?? null,
            senderId: auth.user.id,
            wsId: context.context.normalizedWsId,
          })
        : {
            message: await callPrivateChatRpc<ChatMessage>(
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
            ),
            replayed: false,
          };
      const { message, replayed } = persistence;
      if (!message) {
        return NextResponse.json(
          { message: 'Chat conversation not found' },
          { status: 404 }
        );
      }

      let conversation: ChatConversation | null;
      try {
        conversation = await callPrivateChatRpc<ChatConversation>(
          'chat_get_conversation',
          {
            p_actor_user_id: auth.user.id,
            p_conversation_id: params.conversationId,
            p_ws_id: context.context.normalizedWsId,
          }
        );
      } catch (error) {
        console.error('Failed to load conversation after message persistence', {
          conversationId: params.conversationId,
          error,
          messageId: message.id,
        });
        return NextResponse.json(
          { message, messages: [message] },
          { status: 201 }
        );
      }
      if (!conversation) {
        return NextResponse.json(
          { message, messages: [message] },
          { status: 201 }
        );
      }

      const audience = getChatRealtimeAudience(conversation);

      if (!replayed) {
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

      return NextResponse.json(
        { message, messages: [message] },
        { status: replayed ? 200 : 201 }
      );
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to send chat message');
    }
  },
  { allowAppSessionAuth: true }
);
