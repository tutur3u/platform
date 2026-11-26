/**
 * Guards a Worker fetch handler that bridges to a Node-style server so
 * requests that no route can serve never enter the bridge, and a response
 * whose headers never arrive still settles.
 *
 * The OpenNext `cloudflare-node` wrapper resolves its Response only when the
 * Node response flushes headers, and runs the server handler inside
 * `ctx.waitUntil`. A handler that rejects, or a Node response destroyed
 * before its headers (Next's `pipeToNodeResponse` aborts its writer with
 * `res.destroy(err)`), leaves that Response pending with nothing left to
 * resolve it, and the runtime cancels the request as hung. Unroutable
 * scanner requests are fenced before the bridge; the header backstop turns
 * any remaining pending Response into a 504.
 *
 * Framework-free: no Next.js or Cloudflare imports, only Fetch API types.
 */
import { safeErrorFields } from './log-safety';

export interface WorkerContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

export type WorkerFetch<Env, Ctx extends WorkerContextLike> = (
  request: Request,
  env: Env,
  ctx: Ctx
) => Promise<Response>;

export interface SettledFetchOptions {
  /** Log label; never derived from the request. */
  app: string;
  /** App-owned rule: true when no route of the app can serve the URL. */
  isUnroutable?: (url: URL, method: string) => boolean;
  /**
   * Milliseconds to wait for response headers before answering 504, or
   * `null` for routes whose legitimate work can run longer (imports,
   * exports, uploads); those keep the runtime's own limits.
   */
  headersTimeoutMs?: (url: URL, method: string) => number | null;
}

export const DEFAULT_HEADERS_TIMEOUT_MS = 60_000;

/** Methods any route of a Next.js app can answer; others match no handler. */
const ROUTABLE_METHODS = new Set([
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
]);

function hasControlCharacter(value: string) {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * True for a request no route can serve: an unroutable method, a path with
 * invalid percent-encoding, or a decoded path containing control characters
 * (`%0A`, `%00`, ...).
 */
export function isMalformedRequest(url: URL, method: string): boolean {
  if (!ROUTABLE_METHODS.has(method)) return true;
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return true;
  }
  return hasControlCharacter(path);
}

function plainResponse(request: Request, status: number, text: string) {
  return new Response(request.method === 'HEAD' ? null : text, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/plain; charset=utf-8',
      'x-content-type-options': 'nosniff',
    },
  });
}

function logOutcome(
  app: string,
  outcome: string,
  request: Request,
  error?: unknown
) {
  console.error(
    '[worker-settle]',
    JSON.stringify({
      app,
      outcome,
      method: ROUTABLE_METHODS.has(request.method) ? request.method : 'other',
      ...(error === undefined ? {} : safeErrorFields(error)),
    })
  );
}

/**
 * Wraps a Worker fetch handler:
 * - malformed or app-unroutable requests get a fast no-store 404 before the
 *   bridge runs;
 * - a fetch that throws or rejects answers 500;
 * - headers that never arrive answer 504 after the route's backstop.
 * A Response that arrives in time, including its body stream, passes through
 * untouched. Responses carry no error detail; logs carry only safe error
 * fields.
 */
export function withSettledResponse<Env, Ctx extends WorkerContextLike>(
  fetch: WorkerFetch<Env, Ctx>,
  options: SettledFetchOptions
): WorkerFetch<Env, Ctx> {
  return async (request, env, ctx) => {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return plainResponse(request, 404, 'Not Found');
    }
    if (
      isMalformedRequest(url, request.method) ||
      options.isUnroutable?.(url, request.method)
    )
      return plainResponse(request, 404, 'Not Found');

    const served = Promise.resolve().then(() => fetch(request, env, ctx));
    const timeoutMs = options.headersTimeoutMs
      ? options.headersTimeoutMs(url, request.method)
      : DEFAULT_HEADERS_TIMEOUT_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut =
      timeoutMs === null
        ? null
        : new Promise<'timeout'>((resolve) => {
            timer = setTimeout(() => resolve('timeout'), timeoutMs);
          });
    let outcome: { response: Response } | { error: unknown } | 'timeout';
    try {
      const settled = served.then(
        (response) => ({ response }),
        (error: unknown) => ({ error })
      );
      outcome = await (timedOut ? Promise.race([settled, timedOut]) : settled);
    } finally {
      clearTimeout(timer);
    }
    if (outcome === 'timeout') {
      logOutcome(options.app, 'headers-timeout', request);
      // A Response that arrives after the 504 answered is discarded.
      served.then(
        (late) => late.body?.cancel().catch(() => undefined),
        () => undefined
      );
      return plainResponse(request, 504, 'Gateway Timeout');
    }
    if ('response' in outcome) return outcome.response;
    logOutcome(options.app, 'fetch-rejected', request, outcome.error);
    return plainResponse(request, 500, 'Internal Server Error');
  };
}
