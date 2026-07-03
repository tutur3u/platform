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

function isStaleReadAnchorError(error: unknown) {
  const rpcError = error as { code?: string; message?: string } | null;
  return (
    rpcError?.code === '22023' &&
    rpcError.message?.includes('chat_read_message_not_found') === true
  );
}

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

    const rpcParams = {
      p_actor_user_id: auth.user.id,
      p_conversation_id: params.conversationId,
      p_message_id: parsed.data.messageId ?? null,
      p_ws_id: context.context.normalizedWsId,
    };

    try {
      const conversation = await callPrivateChatRpc<ChatConversation>(
        'chat_set_read_state',
        rpcParams
      );

      return NextResponse.json({ conversation });
    } catch (error) {
      if (parsed.data.messageId && isStaleReadAnchorError(error)) {
        try {
          const conversation = await callPrivateChatRpc<ChatConversation>(
            'chat_set_read_state',
            { ...rpcParams, p_message_id: null }
          );

          return NextResponse.json({ conversation });
        } catch (retryError) {
          return chatRpcErrorResponse(
            retryError,
            'Failed to update chat read state'
          );
        }
      }

      return chatRpcErrorResponse(error, 'Failed to update chat read state');
    }
  },
  { allowAppSessionAuth: true }
);
