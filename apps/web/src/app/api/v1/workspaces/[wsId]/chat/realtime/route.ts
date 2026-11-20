import { connection, type NextRequest, NextResponse } from 'next/server';
import { createLegacyHeadHandler } from '@/legacy-api-routes/head';
import { withSessionAuth } from '@/lib/api-auth';
import { resolveChatRouteContext } from '@/lib/chat/private-rpc';
import { getChatRealtimeSubscribeUrl } from '@/lib/chat/realtime';

type RouteParams = {
  wsId: string;
};

const realtimeHeaders = {
  'Cache-Control': 'no-store, no-transform',
  Connection: 'keep-alive',
  'Content-Type': 'text/event-stream; charset=utf-8',
  'X-Accel-Buffering': 'no',
};
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const LOCAL_DEV_REALTIME_USER_ID = '00000000-0000-4000-8000-000000000001';

function resolveRealtimeSubscribeUserId(userId: string) {
  if (UUID_PATTERN.test(userId)) return userId;
  if (process.env.NODE_ENV !== 'production') return LOCAL_DEV_REALTIME_USER_ID;

  return userId;
}

const getRealtime = withSessionAuth<RouteParams>(
  async (request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    const unavailable = () =>
      new NextResponse(null, {
        headers: { 'Cache-Control': 'no-store' },
        status: 503,
      });

    try {
      const subscription = getChatRealtimeSubscribeUrl({
        userId: resolveRealtimeSubscribeUserId(auth.user.id),
        wsId: context.context.normalizedWsId,
      });

      if (!subscription) {
        return new NextResponse(null, {
          headers: { 'Cache-Control': 'no-store' },
          status: 204,
        });
      }

      const response = await fetch(subscription.url, {
        cache: 'no-store',
        headers: { Accept: 'text/event-stream' },
        signal: request.signal,
      });
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        console.error('Chat realtime upstream unavailable', {
          status: response.status,
          wsId: context.context.normalizedWsId,
        });
        return unavailable();
      }

      return new NextResponse(response.body, { headers: realtimeHeaders });
    } catch {
      if (!request.signal.aborted) {
        console.error('Chat realtime subscription failed', {
          wsId: context.context.normalizedWsId,
        });
      }
      return unavailable();
    }
  },
  { allowAppSessionAuth: true, rateLimitKind: 'read' }
);

export async function GET(...args: Parameters<typeof getRealtime>) {
  await connection();
  return getRealtime(...args);
}

export const HEAD = createLegacyHeadHandler(GET);
