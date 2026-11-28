import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  callPrivateChatRpc,
  chatRpcErrorResponse,
  resolveChatRouteContext,
} from '@/lib/chat/private-rpc';
import { listChatBlockedUsers } from '@/lib/chat/safety';

type RouteParams = {
  wsId: string;
};

const blockUserSchema = z.object({
  userId: z.guid(),
});

// Blocks are per user, not per workspace. The workspace only scopes chat
// access (view_chat); the SQL binds the block to the verified session user.
export const GET = withSessionAuth<RouteParams>(
  async (_request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    try {
      const blocks = await listChatBlockedUsers(auth.user.id);
      return NextResponse.json(
        { blocks },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to load blocked people');
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

    const parsed = blockUserSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    try {
      const result = await callPrivateChatRpc<{
        blocked: boolean;
        userId: string;
      }>('chat_block_user', {
        p_actor_user_id: auth.user.id,
        p_target_user_id: parsed.data.userId,
      });

      return NextResponse.json({
        blocked: result?.blocked ?? true,
        userId: parsed.data.userId,
      });
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to block user');
    }
  },
  { allowAppSessionAuth: true }
);
