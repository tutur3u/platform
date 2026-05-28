import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  type ChatConversation,
  type ChatConversationDeleteResult,
  callPrivateChatRpc,
  chatRpcErrorResponse,
  resolveChatRouteContext,
} from '@/lib/chat/private-rpc';

type RouteParams = {
  conversationId: string;
  wsId: string;
};

const updateConversationSchema = z.object({
  description: z.string().trim().max(2000).nullable().optional(),
  title: z.string().trim().max(255).nullable().optional(),
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

    const parsed = updateConversationSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    try {
      const conversation = await callPrivateChatRpc<ChatConversation>(
        'chat_update_conversation',
        {
          p_actor_user_id: auth.user.id,
          p_conversation_id: params.conversationId,
          p_input: parsed.data,
          p_ws_id: context.context.normalizedWsId,
        }
      );

      return NextResponse.json({ conversation });
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to update conversation');
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
      const result = await callPrivateChatRpc<ChatConversationDeleteResult>(
        'chat_delete_conversation',
        {
          p_actor_user_id: auth.user.id,
          p_conversation_id: params.conversationId,
          p_ws_id: context.context.normalizedWsId,
        }
      );

      return NextResponse.json({ result });
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to delete conversation');
    }
  },
  { allowAppSessionAuth: true }
);
