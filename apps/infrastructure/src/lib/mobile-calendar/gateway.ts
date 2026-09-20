import { Effect } from '@tuturuuu/utils/effect';

export const GATEWAY_PREFIX = '/api/v1/mobile-calendar';
export const GATEWAY_HEADER = 'x-tuturuuu-calendar-gateway';
const CALENDAR_ORIGIN = 'https://calendar.tuturuuu.com';
const MAX_REQUEST_BYTES = 512 * 1024;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

type Dependencies = {
  verifyToken: (token: string) => Promise<boolean>;
  loadSecret: () => Promise<string>;
  fetch: typeof fetch;
};

class GatewayError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

function jsonError(status: number, message: string) {
  return Response.json(
    { message },
    {
      status,
      headers: { 'Cache-Control': 'private, no-store' },
    }
  );
}

// Only the native Calendar repository's JSON APIs are forwarded. OAuth
// callbacks, media, AI endpoints, cron routes and arbitrary URLs are excluded.
function allowedMethods(path: string): string[] {
  const id = '[a-zA-Z0-9_-]+';
  if (new RegExp(`^/api/v1/workspaces/${id}/calendar/events$`).test(path)) {
    return ['GET', 'POST'];
  }
  if (
    new RegExp(`^/api/v1/workspaces/${id}/calendar/events/${id}$`).test(path)
  ) {
    return ['GET', 'PUT', 'DELETE'];
  }
  if (
    new RegExp(
      `^/api/v1/workspaces/${id}/calendar/events/${id}/response$`
    ).test(path)
  ) {
    return ['POST'];
  }
  if (path === '/api/v1/calendar/auth/accounts') return ['GET', 'DELETE'];
  if (path === '/api/v1/calendar/connections') return ['GET', 'PATCH'];
  if (
    path === '/api/v1/calendar/auth' ||
    path === '/api/v1/calendar/auth/microsoft'
  )
    return ['GET'];
  return [];
}

async function boundedBody(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
  signal: AbortSignal,
  oversizedStatus: number
): Promise<Uint8Array<ArrayBuffer>> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new GatewayError(
          oversizedStatus,
          'Calendar payload is too large'
        );
      }
      chunks.push(value);
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  } finally {
    signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}

export function forwardCalendarRequest(request: Request, deps: Dependencies) {
  return Effect.runPromise(
    Effect.tryPromise({
      try: async () => {
        const incoming = new URL(request.url);
        const path = incoming.pathname.slice(GATEWAY_PREFIX.length);
        if (
          !incoming.pathname.startsWith(`${GATEWAY_PREFIX}/`) ||
          allowedMethods(path).length === 0
        ) {
          return jsonError(404, 'Calendar route not found');
        }
        if (!allowedMethods(path).includes(request.method)) {
          return jsonError(405, 'Method not allowed');
        }
        const match = /^Bearer ([^\s]+)$/i.exec(
          request.headers.get('authorization') ?? ''
        );
        if (!match || !(await deps.verifyToken(match[1]!))) {
          return jsonError(401, 'Unauthorized');
        }
        // Verification precedes both secret access and the upstream request.
        // Calendar independently verifies this same token and workspace access.
        const secret = await deps.loadSecret();
        if (!/^[a-zA-Z0-9_-]{43,}$/.test(secret)) {
          return jsonError(503, 'Calendar gateway unavailable');
        }
        const signal = AbortSignal.any([
          request.signal,
          AbortSignal.timeout(20_000),
        ]);
        const headers = new Headers({
          Authorization: `Bearer ${match[1]}`,
          Accept: 'application/json',
          [GATEWAY_HEADER]: secret,
        });
        let body: Uint8Array<ArrayBuffer> | undefined;
        if (request.body) {
          if (
            !/^application\/json(?:;|$)/i.test(
              request.headers.get('content-type') ?? ''
            )
          ) {
            return jsonError(415, 'Expected application/json');
          }
          body = await boundedBody(
            request.body,
            MAX_REQUEST_BYTES,
            signal,
            413
          );
          headers.set('Content-Type', 'application/json');
        }
        const upstream = await deps.fetch(
          `${CALENDAR_ORIGIN}${path}${incoming.search}`,
          {
            method: request.method,
            headers,
            body,
            signal,
            redirect: 'manual',
            cache: 'no-store',
          }
        );
        // Never forward the credentials through a redirect or relay HTML challenges.
        if (
          (upstream.status >= 300 && upstream.status < 400) ||
          (upstream.status !== 204 &&
            !/^application\/json(?:;|$)/i.test(
              upstream.headers.get('content-type') ?? ''
            ))
        ) {
          await upstream.body?.cancel();
          return jsonError(502, 'Calendar service unavailable');
        }
        const bytes = await boundedBody(
          upstream.body,
          MAX_RESPONSE_BYTES,
          signal,
          502
        );
        const responseHeaders = new Headers({
          'Cache-Control': 'private, no-store',
          'Content-Type': 'application/json',
        });
        const retryAfter = upstream.headers.get('retry-after');
        if (retryAfter) responseHeaders.set('Retry-After', retryAfter);
        return new Response(upstream.status === 204 ? null : bytes, {
          status: upstream.status,
          headers: responseHeaders,
        });
      },
      catch: (error) => error,
    }).pipe(
      Effect.catchAll((error) =>
        Effect.succeed(
          error instanceof GatewayError
            ? jsonError(error.status, error.message)
            : jsonError(503, 'Calendar gateway unavailable')
        )
      )
    )
  );
}
