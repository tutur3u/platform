import { type NextRequest, NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { resolveChatRouteContext } from '@/lib/chat/private-rpc';
import { getChatRealtimeSubscribeUrl } from '@/lib/chat/realtime';

type RouteParams = {
  wsId: string;
};

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
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const LOCAL_DEV_REALTIME_USER_ID = '00000000-0000-4000-8000-000000000001';

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

function resolveRealtimeSubscribeUserId(userId: string) {
  if (UUID_PATTERN.test(userId)) return userId;
  if (process.env.NODE_ENV !== 'production') return LOCAL_DEV_REALTIME_USER_ID;

  return userId;
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
        userId: resolveRealtimeSubscribeUserId(auth.user.id),
        wsId: context.context.normalizedWsId,
      }).url;
    } catch (error) {
      console.error('Chat realtime subscribe URL failed', {
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
            console.error('Chat realtime upstream unavailable', {
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
            console.error('Chat realtime stream failed', {
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
