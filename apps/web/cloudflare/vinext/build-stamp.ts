// Stamps every vinext family Worker response with the build commit, so a
// signed-out request (a 404, a bodyless redirect, a 401 API answer) still
// names the version that served it. The value is fixed at build time and is
// never read from the request.

/** Response header carrying the full 40-hex build commit. */
export const BUILD_STAMP_HEADER = 'x-tuturuuu-build';

const COMMIT = /^[0-9a-f]{40}$/u;

/** The build commit when `value` is a full lowercase commit SHA, else null. */
export function buildCommit(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return COMMIT.test(trimmed) ? trimmed : null;
}

/**
 * Sets the stamp on `response`, replacing any upstream value. Without a
 * commit the header is removed, never invented. Upgrade (101) responses keep
 * their WebSocket and are stamped only when their headers are mutable.
 */
export function stampResponse(
  response: Response,
  commit: string | null
): Response {
  const apply = (headers: Headers) => {
    if (commit) headers.set(BUILD_STAMP_HEADER, commit);
    else headers.delete(BUILD_STAMP_HEADER);
  };
  if (response.status === 101) {
    try {
      apply(response.headers);
    } catch {
      // Immutable upgrade headers: keep the WebSocket attached.
    }
    return response;
  }
  const next = new Response(response.body, response);
  apply(next.headers);
  return next;
}

type FetchHandler<Env, Ctx> = {
  fetch: (request: Request, env: Env, ctx: Ctx) => Response | Promise<Response>;
};

/**
 * Wraps a module Worker handler so every response it returns, including a
 * thrown error turned into a 500, carries the stamp. Other handler members
 * stay reachable through the prototype.
 */
export function withBuildStamp<Env, Ctx, H extends FetchHandler<Env, Ctx>>(
  handler: H,
  commitValue: unknown
): H {
  const commit = buildCommit(commitValue);
  const wrapped = Object.create(handler) as H;
  wrapped.fetch = async (request: Request, env: Env, ctx: Ctx) => {
    let response: Response;
    try {
      response = await handler.fetch(request, env, ctx);
    } catch (error) {
      console.error('vinext worker request failed', error);
      response = new Response('Internal Server Error', {
        status: 500,
        headers: {
          'cache-control': 'no-store',
          'content-type': 'text/plain; charset=utf-8',
        },
      });
    }
    return stampResponse(response, commit);
  };
  return wrapped;
}

/**
 * Workers static-assets `_headers` rules for the asset files the runtime
 * serves without running the Worker (`/_next/static/*` and
 * `/_f/<id>/_next/static/*`).
 * Empty without a commit.
 */
export function assetHeadersRules(commitValue: unknown): string {
  const commit = buildCommit(commitValue);
  return commit ? `/*\n  ${BUILD_STAMP_HEADER}: ${commit}\n` : '';
}
