import { type NextRequest, NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { resolveChatRouteContext } from '@/lib/chat/private-rpc';
import { getChatRealtimeSubscribeUrl } from '@/lib/chat/realtime';
import { serverLogger } from '@/lib/infrastructure/log-drain';

type RouteParams = {
  wsId: string;
};

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withSessionAuth<RouteParams>(
  async (request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    const encoder = new TextEncoder();
    const upstream = getChatRealtimeSubscribeUrl({
      userId: auth.user.id,
      wsId: context.context.normalizedWsId,
    });

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const abort = new AbortController();
        let closed = false;
        const close = () => {
          if (closed) return;
          closed = true;
          abort.abort();
          controller.close();
        };
        request.signal.addEventListener('abort', close, { once: true });

        try {
          const response = await fetch(upstream.url, {
            cache: 'no-store',
            headers: { Accept: 'text/event-stream' },
            signal: abort.signal,
          });

          if (!response.ok || !response.body) {
            controller.enqueue(
              encoder.encode(
                `event: message\ndata: ${JSON.stringify({
                  type: 'error',
                  error: 'realtime_unavailable',
                })}\n\n`
              )
            );
            close();
            return;
          }

          const reader = response.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (value) controller.enqueue(value);
            if (done) break;
          }
        } catch (error) {
          if (!abort.signal.aborted) {
            serverLogger.error('Chat realtime stream failed', {
              error,
              wsId: context.context.normalizedWsId,
            });
          }
        } finally {
          request.signal.removeEventListener('abort', close);
          close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Cache-Control': 'no-store, no-transform',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream; charset=utf-8',
        'X-Accel-Buffering': 'no',
      },
    });
  },
  { allowAppSessionAuth: true, rateLimitKind: 'read' }
);
