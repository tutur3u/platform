import { AsyncLocalStorage } from 'node:async_hooks';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';

/**
 * Phase names are a closed set so a header can never carry identifiers, emails
 * or any other request data: only a fixed label and a duration.
 */
export type ServerTimingPhase = 'auth' | 'db' | 'cache';

const PHASE_ORDER: readonly ServerTimingPhase[] = ['auth', 'db', 'cache'];

interface ServerTimingStore {
  readonly phases: Map<ServerTimingPhase, number>;
  readonly startedAt: number;
}

const storage = new AsyncLocalStorage<ServerTimingStore>();

function now() {
  return performance.now();
}

function formatDuration(ms: number) {
  return Math.max(0, ms).toFixed(1);
}

function buildHeaderValue(store: ServerTimingStore) {
  const entries: string[] = [];
  for (const phase of PHASE_ORDER) {
    const duration = store.phases.get(phase);
    if (duration !== undefined) {
      entries.push(`${phase};dur=${formatDuration(duration)}`);
    }
  }
  entries.push(`total;dur=${formatDuration(now() - store.startedAt)}`);
  return entries.join(', ');
}

/**
 * Times `run` and adds the duration to `phase` for the surrounding
 * `withServerTiming` request. Outside a timed request it only runs `run`.
 * Repeated calls for one phase are summed.
 */
export async function timeServerPhase<T>(
  phase: ServerTimingPhase,
  run: () => PromiseLike<T> | T
): Promise<T> {
  const store = storage.getStore();
  if (!store) return await run();

  const startedAt = now();
  try {
    return await run();
  } finally {
    store.phases.set(
      phase,
      (store.phases.get(phase) ?? 0) + (now() - startedAt)
    );
  }
}

/** Session/user resolution, reported as the `auth` phase. */
export function resolveTimedSessionUser(
  ...args: Parameters<typeof resolveAuthenticatedSessionUser>
) {
  return timeServerPhase('auth', () =>
    resolveAuthenticatedSessionUser(...args)
  );
}

function withTimingHeader(response: Response, value: string): Response {
  const existing = response.headers.get('Server-Timing');
  const merged = existing ? `${existing}, ${value}` : value;
  try {
    response.headers.set('Server-Timing', merged);
    return response;
  } catch {
    // Responses from fetch() have immutable headers.
    const headers = new Headers(response.headers);
    headers.set('Server-Timing', merged);
    return new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText,
    });
  }
}

/**
 * Adds a `Server-Timing` header (`auth`, `db`, `cache` when recorded, plus
 * `total`) to the wrapped route handler's response. Bodies, status codes,
 * caching headers and auth behavior are untouched.
 */
export function withServerTiming<Args extends unknown[], R extends Response>(
  handler: (...args: Args) => Promise<R> | R
): (...args: Args) => Promise<Response> {
  return (...args: Args) => {
    const store: ServerTimingStore = {
      phases: new Map(),
      startedAt: now(),
    };
    return storage.run(store, async () => {
      const response = await handler(...args);
      return withTimingHeader(response, buildHeaderValue(store));
    });
  };
}
