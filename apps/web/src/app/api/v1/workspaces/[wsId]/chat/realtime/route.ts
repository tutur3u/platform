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

const encoder = new TextEncoder();
const realtimeUnavailableEvent = `event: message\ndata: ${JSON.stringify({
  type: 'error',
  error: 'realtime_unavailable',
})}\n\n`;
const realtimeHeaders = {
  'Cache-Control': 'no-store, no-transform',
  Connection: 'keep-alive',
  'Content-Type': 'text/event-stream; charset=utf-8',
  'X-Accel-Buffering': 'no',
};

function createRealtimeResponse(stream: ReadableStream<Uint8Array>) {
  return new NextResponse(stream, {
    headers: realtimeHeaders,
  });
}

function enqueueRealtimeUnavailable(
  controller: ReadableStreamDefaultController<Uint8Array>
) {
  controller.enqueue(encoder.encode(realtimeUnavailableEvent));
}

function createRealtimeUnavailableResponse() {
  return createRealtimeResponse(
    new ReadableStream<Uint8Array>({
      start(controller) {
        enqueueRealtimeUnavailable(controller);
        controller.close();
      },
    })
  );
}

export const GET = withSessionAuth<RouteParams>(
  async (request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    let upstreamUrl: URL;
    try {
      upstreamUrl = getChatRealtimeSubscribeUrl({
        userId: auth.user.id,
        wsId: context.context.normalizedWsId,
      }).url;
    } catch (error) {
      serverLogger.error('Chat realtime subscribe URL failed', {
        error,
        wsId: context.context.normalizedWsId,
      });
      return createRealtimeUnavailableResponse();
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const abort = new AbortController();
        let closed = false;
        const close = () => {
          if (closed) return;
          closed = true;
          abort.abort();
          try {
            controller.close();
          } catch {
            // The stream may already be closed by the client aborting.
          }
        };
        request.signal.addEventListener('abort', close, { once: true });

        try {
          const response = await fetch(upstreamUrl, {
            cache: 'no-store',
            headers: { Accept: 'text/event-stream' },
            signal: abort.signal,
          });

          if (!response.ok || !response.body) {
            serverLogger.error('Chat realtime upstream unavailable', {
              status: response.status,
              wsId: context.context.normalizedWsId,
            });
            enqueueRealtimeUnavailable(controller);
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
            enqueueRealtimeUnavailable(controller);
          }
        } finally {
          request.signal.removeEventListener('abort', close);
          close();
        }
      },
    });

    return createRealtimeResponse(stream);
  },
  { allowAppSessionAuth: true, rateLimitKind: 'read' }
);
