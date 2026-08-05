import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  deleteAiChatMessage,
  isAiChatConversationId,
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
  getChatRealtimeUserAudience,
  publishChatRealtimeEvent,
} from '@/lib/chat/realtime';
import {
  deleteExternalChatMessageIfBound,
  isExternalChatConversation,
} from '@/lib/external-chat/delivery';

type RouteParams = {
  conversationId: string;
  messageId: string;
  wsId: string;
};

const editMessageSchema = z.object({
  content: z.string().trim().min(1).max(10000),
});

export const PATCH = withSessionAuth<RouteParams>(
  async (request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    try {
      if (
        await isExternalChatConversation({
          conversationId: params.conversationId,
          wsId: context.context.normalizedWsId,
        })
      ) {
        return NextResponse.json(
          {
            code: 'external_message_edit_unsupported',
            message: 'Editing connected-site messages is not supported',
          },
          { status: 409 }
        );
      }
    } catch (error) {
      console.error('Failed to resolve external chat edit route', {
        code: error instanceof Error ? error.message : 'unknown',
      });
      return NextResponse.json(
        { message: 'Failed to resolve chat edit route' },
        { status: 500 }
      );
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const parsed = editMessageSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    try {
      const message = await callPrivateChatRpc<ChatMessage>(
        'chat_edit_message',
        {
          p_actor_user_id: auth.user.id,
          p_content: parsed.data.content,
          p_conversation_id: params.conversationId,
          p_message_id: params.messageId,
          p_ws_id: context.context.normalizedWsId,
        }
      );
      const conversation = await callPrivateChatRpc<ChatConversation>(
        'chat_get_conversation',
        {
          p_actor_user_id: auth.user.id,
          p_conversation_id: params.conversationId,
          p_ws_id: context.context.normalizedWsId,
        }
      );

      await publishChatRealtimeEvent({
        actorUserId: auth.user.id,
        audience: getChatRealtimeAudience(conversation),
        conversationId: message.conversationId,
        message,
        type: 'message.updated',
        wsId: context.context.normalizedWsId,
      });

      return NextResponse.json({ message });
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to edit chat message');
    }
  },
  { allowAppSessionAuth: true }
);

export const DELETE = withSessionAuth<RouteParams>(
  async (_request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    try {
      if (isAiChatConversationId(params.conversationId)) {
        const message = await deleteAiChatMessage({
          conversationId: params.conversationId,
          messageId: params.messageId,
          supabase: auth.supabase,
          user: auth.user,
        });

        if (!message) {
          return NextResponse.json(
            { message: 'Message not found' },
            { status: 404 }
          );
        }

        await publishChatRealtimeEvent({
          actorUserId: auth.user.id,
          audience: getChatRealtimeUserAudience(auth.user.id),
          conversationId: message.conversationId,
          message,
          type: 'message.deleted',
          wsId: context.context.normalizedWsId,
        });

        return NextResponse.json({ message });
      }

      try {
        await deleteExternalChatMessageIfBound({
          conversationId: params.conversationId,
          messageId: params.messageId,
          wsId: context.context.normalizedWsId,
        });
      } catch (error) {
        console.error('External chat deletion failed before native mutation', {
          code: error instanceof Error ? error.message : 'unknown',
        });
        return NextResponse.json(
          {
            code: 'external_delete_failed',
            message: 'The connected site did not accept the deletion',
          },
          { status: 502 }
        );
      }

      const message = await callPrivateChatRpc<ChatMessage>(
        'chat_delete_message',
        {
          p_actor_user_id: auth.user.id,
          p_conversation_id: params.conversationId,
          p_message_id: params.messageId,
          p_ws_id: context.context.normalizedWsId,
        }
      );
      const conversation = await callPrivateChatRpc<ChatConversation>(
        'chat_get_conversation',
        {
          p_actor_user_id: auth.user.id,
          p_conversation_id: params.conversationId,
          p_ws_id: context.context.normalizedWsId,
        }
      );

      await publishChatRealtimeEvent({
        actorUserId: auth.user.id,
        audience: getChatRealtimeAudience(conversation),
        conversationId: message.conversationId,
        message,
        type: 'message.deleted',
        wsId: context.context.normalizedWsId,
      });

      return NextResponse.json({ message });
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to delete chat message');
    }
  },
  { allowAppSessionAuth: true }
);
