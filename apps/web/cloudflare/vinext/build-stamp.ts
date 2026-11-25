// Stamps every vinext family Worker response with the build commit, so a
// signed-out request (a 404, a bodyless redirect, a 401 API answer) still
// names the version that served it. The value is fixed at build time and is
// never read from the request.
import { safeErrorFields } from '@tuturuuu/utils/log-safety';

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
 * their WebSocket, and a response that cannot be copied is returned as is;
 * both are stamped only when their headers are mutable.
 */
export function stampResponse(
  response: Response,
  commit: string | null
): Response {
  const apply = (headers: Headers) => {
    if (commit) headers.set(BUILD_STAMP_HEADER, commit);
    else headers.delete(BUILD_STAMP_HEADER);
  };
  const inPlace = () => {
    try {
      apply(response.headers);
    } catch {
      // Immutable headers: serve the response unstamped rather than fail.
    }
    return response;
  };
  if (response.status === 101) return inPlace();
  let next: Response;
  try {
    next = new Response(response.body, response);
  } catch {
    return inPlace();
  }
  apply(next.headers);
  return next;
}

type FetchHandler<Env, Ctx> = {
  fetch: (request: Request, env: Env, ctx: Ctx) => Response | Promise<Response>;
};

/**
 * Wraps a module Worker handler so every response it returns carries the
 * stamp. A thrown error is logged scrubbed and re-thrown unchanged, so Workers
 * still records the exception (and the gateway still answers 502); only that
 * failure goes unstamped. Other handler members stay reachable through the
 * prototype.
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
      console.error(
        'vinext worker request failed',
        safeErrorFields(error, { message: true })
      );
      throw error;
    }
    return stampResponse(response, commit);
  };
  return wrapped;
}

/**
 * Workers static-assets `_headers` rules: one `/*` rule, so every asset the
 * runtime serves (including the `/_next/static/*` and
 * `/_f/<id>/_next/static/*` files it serves without running the Worker)
 * carries the stamp. The uploader must pass this file's contents as the
 * assets config `_headers`, not as a public file. Empty without a commit.
 */
export function assetHeadersRules(commitValue: unknown): string {
  const commit = buildCommit(commitValue);
  return commit ? `/*\n  ${BUILD_STAMP_HEADER}: ${commit}\n` : '';
}
