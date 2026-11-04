// Independent public status read path (DES-TTR-UPTIME v2 PR 1). It reads only
// its KV snapshot: no platform origin, Vercel, Supabase or Redis, ever.
import * as dto from './public-dto';

/** Read-only view of the dedicated KV namespace; the Worker never writes. */
export type SnapshotStore = {
  get(key: string, type: 'text'): Promise<string | null>;
};
export type Env = dto.PolicyEnv & { STATUS_SNAPSHOTS?: SnapshotStore };

export const CURRENT_KEY = 'snapshot:current';
export const FALLBACK_KEY = 'snapshot:last-known-good';
// Freshness under the 5-min gate; all caching (no stale-if-error) ends in it.
export const STALE_AFTER_MS = 120_000;
const NO_DATA: dto.PublicEnvelope = {
  ...{ status: 'unknown', components: [], generated_at: null },
  ...{ stale: true, fallback: true },
};
const HISTORY_LIMIT = 50; // cursor paging arrives with PR 4's projection
const ROUTE = /^\/api\/v1\/status(\/[a-z]+)?(?:\/([a-z0-9-]{1,64}))?$/;
// Route -> [s-maxage, stale-while-revalidate] in seconds (design §8.1).
const ROUTES: Record<string, [number, number]> = {
  '': [15, 30],
  '/summary': [30, 60],
  '/components': [60, 60],
  '/incidents': [60, 60],
  '/badge': [60, 60],
};

async function load(env: Env, key: string, now: number) {
  try {
    const text = await env.STATUS_SNAPSHOTS?.get(key, 'text');
    const data = JSON.parse(text ?? '');
    const at = dto.coarseTime(data.generated_at);
    // Missing, invalid or future generation times are unusable.
    if (data.version !== 1 || at === null || at > now) return null;
    if (!Array.isArray(data.components)) return null;
    const log: unknown[] = Array.isArray(data.history) ? data.history : [];
    const items: unknown[] = data.components;
    return { at, live: data.publisher_available === true, items, log };
  } catch {
    return null;
  }
}

const empty = (status: number) =>
  new Response(null, { status, headers: { 'cache-control': 'no-store' } });

async function respond(
  request: Request,
  status: number,
  envelope: dto.PublicEnvelope,
  cacheControl: string
) {
  const body = JSON.stringify(envelope);
  // The ETag covers the whole representation, freshness flags included, so
  // a stale flip always changes it and a 304 never revalidates old health.
  const bytes = new TextEncoder().encode(`${status}\n${body}`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const tag = btoa(String.fromCharCode(...new Uint8Array(hash)));
  const etag = `W/"${tag}"`;
  const headers = new Headers({ 'cache-control': cacheControl, etag });
  const tags = request.headers.get('if-none-match')?.split(',') ?? [];
  if (status === 200 && tags.some((t) => t.trim().endsWith(`"${tag}"`)))
    return new Response(null, { status: 304, headers });
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(body, { status, headers });
}

export async function handleRequest(request: Request, env: Env, now: number) {
  const path = new URL(request.url).pathname;
  const [matched, route = '', badgeId] = ROUTE.exec(path) ?? [];
  const cache = ROUTES[route];
  if (!matched || !cache || (badgeId === undefined) === (route === '/badge'))
    return empty(404);
  if (request.method !== 'GET' && request.method !== 'HEAD') return empty(405);

  const current = await load(env, CURRENT_KEY, now);
  const snapshot = current ?? (await load(env, FALLBACK_KEY, now));
  if (!snapshot) return respond(request, 503, NO_DATA, 'no-store');
  const fallback = current === null;
  const age = now - snapshot.at;
  const stale = fallback || !snapshot.live || age > STALE_AFTER_MS;
  const policy = dto.readPolicy(env);
  const project = (records: unknown[]) =>
    records.flatMap((record) => {
      const item = policy && dto.toPublicComponent(record, policy, stale);
      return item ? [item] : [];
    });
  const eligible = project(snapshot.items);
  let components = route === '' ? [] : eligible;
  if (route === '/incidents') {
    components = project(snapshot.log).slice(0, HISTORY_LIMIT);
  } else if (route === '/badge') {
    components = eligible.filter((record) => record.id === badgeId);
    // Excluded and unknown IDs share one empty 404.
    if (components.length !== 1) return empty(404);
  }
  const envelope: dto.PublicEnvelope = {
    status: dto.aggregateState(route === '/badge' ? components : eligible),
    components,
    generated_at: dto.isoMinute(snapshot.at),
    stale,
    fallback,
  };
  const left = Math.floor((STALE_AFTER_MS - age) / 1000); // >= 0 when fresh
  const ttl = Math.min(cache[0], left);
  const cacheControl = stale
    ? 'no-store'
    : `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=${Math.min(cache[1], left - ttl)}`;
  return respond(request, 200, envelope, cacheControl);
}

export default {
  fetch: (request: Request, env: Env) =>
    handleRequest(request, env, Date.now()),
};
