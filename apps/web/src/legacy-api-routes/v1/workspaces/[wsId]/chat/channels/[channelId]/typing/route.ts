import { type NextRequest, NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { resolveChatRouteContext } from '@/lib/chat/private-rpc';

type RouteParams = {
  channelId: string;
  wsId: string;
};

export const POST = withSessionAuth<RouteParams>(
  async (_request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    return NextResponse.json({ success: true });
  },
  { allowAppSessionAuth: true }
);

export const DELETE = POST;
