import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  callPrivateChatRpc,
  chatRpcErrorResponse,
  resolveChatRouteContext,
} from '@/lib/chat/private-rpc';

type RouteParams = {
  userId: string;
  wsId: string;
};

const userIdSchema = z.guid();

export const DELETE = withSessionAuth<RouteParams>(
  async (_request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    const parsed = userIdSchema.safeParse(params.userId);
    if (!parsed.success) {
      return NextResponse.json({ message: 'Invalid user' }, { status: 400 });
    }

    try {
      await callPrivateChatRpc('chat_unblock_user', {
        p_actor_user_id: auth.user.id,
        p_target_user_id: parsed.data,
      });
      return NextResponse.json({ blocked: false, userId: parsed.data });
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to unblock user');
    }
  },
  { allowAppSessionAuth: true }
);
