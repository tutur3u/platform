import { type NextRequest, NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  type ChatUserProfile,
  callPrivateChatRpc,
  chatRpcErrorResponse,
  resolveChatRouteContext,
} from '@/lib/chat/private-rpc';

type RouteParams = {
  wsId: string;
};

export const GET = withSessionAuth<RouteParams>(
  async (request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    const url = new URL(request.url);
    const query = url.searchParams.get('q') ?? '';
    const limit = Number(url.searchParams.get('limit') ?? 25);

    try {
      const users = await callPrivateChatRpc<ChatUserProfile[]>(
        'chat_search_directory',
        {
          p_actor_user_id: auth.user.id,
          p_limit: Number.isFinite(limit) ? limit : 25,
          p_query: query,
          p_ws_id: context.context.normalizedWsId,
        }
      );

      return NextResponse.json({ users: users ?? [] });
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to search chat directory');
    }
  },
  { allowAppSessionAuth: true, rateLimitKind: 'read' }
);
