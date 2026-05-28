import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  type ChatFriendRequest,
  callPrivateChatRpc,
  chatRpcErrorResponse,
  resolveChatRouteContext,
} from '@/lib/chat/private-rpc';

type RouteParams = {
  requestId: string;
  wsId: string;
};

const respondFriendRequestSchema = z.object({
  status: z.enum(['accepted', 'declined']),
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

    const parsed = respondFriendRequestSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    try {
      const friendRequest = await callPrivateChatRpc<ChatFriendRequest>(
        'chat_respond_friend_request',
        {
          p_actor_user_id: auth.user.id,
          p_request_id: params.requestId,
          p_status: parsed.data.status,
          p_ws_id: context.context.normalizedWsId,
        }
      );

      return NextResponse.json({ request: friendRequest });
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to update friend request');
    }
  },
  { allowAppSessionAuth: true }
);
