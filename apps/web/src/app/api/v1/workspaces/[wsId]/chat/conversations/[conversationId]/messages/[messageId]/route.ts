import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  deleteAiChatMessage,
  isAiChatConversationId,
} from '@/lib/chat/agent-discovery';
import {
  type ChatMessage,
  callPrivateChatRpc,
  chatRpcErrorResponse,
  resolveChatRouteContext,
} from '@/lib/chat/private-rpc';
import { publishChatRealtimeEvent } from '@/lib/chat/realtime';

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

      await publishChatRealtimeEvent({
        actorUserId: auth.user.id,
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
          conversationId: message.conversationId,
          message,
          type: 'message.deleted',
          wsId: context.context.normalizedWsId,
        });

        return NextResponse.json({ message });
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

      await publishChatRealtimeEvent({
        actorUserId: auth.user.id,
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
