import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  type ChatMessage,
  callPrivateChatRpc,
  chatRpcErrorResponse,
  resolveChatRouteContext,
} from '@/lib/chat/private-rpc';
import { publishChatRealtimeEvent } from '@/lib/chat/realtime';

type RouteParams = {
  conversationId: string;
  wsId: string;
};

const reactionSchema = z.object({
  emoji: z.string().trim().min(1).max(64),
  messageId: z.string().uuid(),
});

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

    const parsed = reactionSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    try {
      const message = await callPrivateChatRpc<ChatMessage>(
        'chat_toggle_reaction',
        {
          p_actor_user_id: auth.user.id,
          p_conversation_id: params.conversationId,
          p_emoji: parsed.data.emoji,
          p_message_id: parsed.data.messageId,
          p_ws_id: context.context.normalizedWsId,
        }
      );

      await publishChatRealtimeEvent({
        actorUserId: auth.user.id,
        conversationId: message.conversationId,
        message,
        type: 'reaction.updated',
        wsId: context.context.normalizedWsId,
      });

      return NextResponse.json({ message });
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to update chat reaction');
    }
  },
  { allowAppSessionAuth: true }
);
