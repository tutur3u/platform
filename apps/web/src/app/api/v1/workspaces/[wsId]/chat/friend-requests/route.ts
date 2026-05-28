import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  type ChatFriendRequest,
  type ChatFriendRequests,
  callPrivateChatRpc,
  chatRpcErrorResponse,
  resolveChatRouteContext,
} from '@/lib/chat/private-rpc';

type RouteParams = {
  wsId: string;
};

const createFriendRequestSchema = z.object({
  email: z.string().trim().email().max(320),
});

export const GET = withSessionAuth<RouteParams>(
  async (_request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    try {
      const requests = await callPrivateChatRpc<ChatFriendRequests>(
        'chat_list_friend_requests',
        {
          p_actor_user_id: auth.user.id,
          p_ws_id: context.context.normalizedWsId,
        }
      );

      return NextResponse.json({
        accepted: requests?.accepted ?? [],
        incoming: requests?.incoming ?? [],
        outgoing: requests?.outgoing ?? [],
      });
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to load friend requests');
    }
  },
  { allowAppSessionAuth: true, rateLimitKind: 'read' }
);

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

    const parsed = createFriendRequestSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    try {
      const friendRequest = await callPrivateChatRpc<ChatFriendRequest>(
        'chat_create_friend_request_by_email',
        {
          p_actor_user_id: auth.user.id,
          p_email: parsed.data.email,
          p_ws_id: context.context.normalizedWsId,
        }
      );

      return NextResponse.json({ request: friendRequest }, { status: 201 });
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to create friend request');
    }
  },
  { allowAppSessionAuth: true }
);
