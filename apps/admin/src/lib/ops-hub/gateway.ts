import {
  ASSERTION_HEADER,
  allowedUsers,
  json,
  MAX_RESPONSE_BYTES,
  readBounded,
  routeAllowed,
  signAssertion,
} from '@tuturuuu/ops-hub/protocol';
import { Effect } from '@tuturuuu/utils/effect';

export const GATEWAY_PREFIX = '/api/v1/ops-hub';
type Config = {
  workerUrl: string | undefined;
  gatewaySecret: string | undefined;
  allowedUserIds: string | undefined;
};
type Dependencies = {
  authorize: (request: Request) => Promise<string | null>;
  config: () => Config;
  fetch: typeof fetch;
};
function workerOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      /^[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash
      ? url.origin
      : null;
  } catch {
    return null;
  }
}
export function forwardOpsHubRequest(request: Request, deps: Dependencies) {
  return Effect.runPromise(
    Effect.tryPromise({
      try: async () => {
        const url = new URL(request.url);
        const path = url.pathname.slice(GATEWAY_PREFIX.length);
        const target = path + url.search;
        if (
          !url.pathname.startsWith(`${GATEWAY_PREFIX}/`) ||
          !routeAllowed(request.method, target) ||
          request.body
        ) {
          return json({ error: 'Not found' }, 404);
        }
        if (
          request.method !== 'GET' &&
          !request.headers.has('authorization') &&
          request.headers.get('origin') !== url.origin
        )
          return json({ error: 'Not found' }, 404);
        const userId = await deps.authorize(request);
        if (!userId) return json({ error: 'Not found' }, 404);
        const config = deps.config();
        if (!allowedUsers(config.allowedUserIds).has(userId.toLowerCase()))
          return json({ error: 'Not found' }, 404);
        const origin = workerOrigin(config.workerUrl);
        if (!origin || !config.gatewaySecret)
          return json({ error: 'Service unavailable' }, 503);
        const assertion = await signAssertion(
          config.gatewaySecret,
          userId.toLowerCase(),
          request.method,
          target
        );
        const signal = AbortSignal.any([
          request.signal,
          AbortSignal.timeout(10_000),
        ]);
        const upstream = await deps.fetch(origin + target, {
          method: request.method,
          headers: {
            Accept: 'application/json',
            [ASSERTION_HEADER]: assertion,
          },
          signal,
          redirect: 'manual',
          cache: 'no-store',
        });
        if (
          (upstream.status >= 300 && upstream.status < 400) ||
          !/^application\/json(?:;|$)/i.test(
            upstream.headers.get('content-type') ?? ''
          )
        ) {
          await upstream.body?.cancel();
          return json({ error: 'Service unavailable' }, 502);
        }
        const body = await readBounded(upstream.body, MAX_RESPONSE_BYTES);
        return new Response(body, {
          status: upstream.status,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'private, no-store',
          },
        });
      },
      catch: (error) => error,
    }).pipe(
      Effect.catchAll(() =>
        Effect.succeed(json({ error: 'Service unavailable' }, 503))
      )
    )
  );
}
