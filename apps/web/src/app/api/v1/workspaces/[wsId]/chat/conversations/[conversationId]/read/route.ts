import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  type ChatConversation,
  callPrivateChatRpc,
  chatRpcErrorResponse,
  resolveChatRouteContext,
} from '@/lib/chat/private-rpc';

type RouteParams = {
  conversationId: string;
  wsId: string;
};

const readStateSchema = z.object({
  messageId: z.string().uuid().nullable().optional(),
});

export const POST = withSessionAuth<RouteParams>(
  async (request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    const payload = await request.json().catch(() => ({}));
    const parsed = readStateSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    try {
      const conversation = await callPrivateChatRpc<ChatConversation>(
        'chat_set_read_state',
        {
          p_actor_user_id: auth.user.id,
          p_conversation_id: params.conversationId,
          p_message_id: parsed.data.messageId ?? null,
          p_ws_id: context.context.normalizedWsId,
        }
      );

      return NextResponse.json({ conversation });
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to update chat read state');
    }
  },
  { allowAppSessionAuth: true }
);
