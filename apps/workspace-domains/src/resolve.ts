export interface Env {
  /** apps/web origin answering resolve + delivery. Default https://tuturuuu.com. */
  RESOLVE_URL?: string;
  /** Shared secret for `GET /api/v1/workspace-domains/resolve`. */
  WORKSPACE_DOMAINS_EDGE_SECRET?: string;
  /** Bootstrap JSON `{ "<host>": { "wsId": "...", "name": "..." } }`. */
  STATIC_HOST_MAP?: string;
}

export interface CacheLike {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

/** Public facts about the workspace bound to a host. Nothing private. */
export interface ResolvedWorkspace {
  wsId: string;
  name: string;
  avatarUrl: string | null;
  /** `null` when unknown (static map): the delivery API decides. */
  siteAvailable: boolean | null;
  source: 'resolver' | 'static';
}

export const DEFAULT_RESOLVE_URL = 'https://tuturuuu.com';
export const RESOLVE_CACHE_SECONDS = 60;
export const EDGE_SECRET_HEADER = 'X-Workspace-Domains-Edge-Secret';
const CACHE_ORIGIN = 'https://workspace-domains.cache.invalid';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const MAX_NAME_LENGTH = 200;

export function resolveOrigin(env: Env): string {
  const raw = env.RESOLVE_URL?.trim() || DEFAULT_RESOLVE_URL;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
      return DEFAULT_RESOLVE_URL;
    }
    return url.origin;
  } catch {
    return DEFAULT_RESOLVE_URL;
  }
}

function safeAvatarUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function toWorkspace(
  value: unknown,
  source: ResolvedWorkspace['source']
): ResolvedWorkspace | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const wsId = record.wsId;
  const name = record.name;
  if (typeof wsId !== 'string' || !UUID_PATTERN.test(wsId)) return null;
  if (typeof name !== 'string' || !name.trim()) return null;
  return {
    wsId: wsId.toLowerCase(),
    name: name.trim().slice(0, MAX_NAME_LENGTH),
    avatarUrl: safeAvatarUrl(record.avatarUrl),
    siteAvailable:
      typeof record.siteAvailable === 'boolean' ? record.siteAvailable : null,
    source,
  };
}

/** Parses STATIC_HOST_MAP; invalid JSON or entries are ignored, never thrown. */
export function parseStaticHostMap(
  raw: string | undefined
): Map<string, ResolvedWorkspace> {
  const map = new Map<string, ResolvedWorkspace>();
  if (!raw?.trim()) return map;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error('workspace-domains: STATIC_HOST_MAP is not valid JSON');
    return map;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return map;
  }
  for (const [host, entry] of Object.entries(parsed)) {
    const workspace = toWorkspace(entry, 'static');
    if (workspace) map.set(host.trim().toLowerCase(), workspace);
  }
  return map;
}

type ResolverAnswer =
  | { kind: 'found'; workspace: ResolvedWorkspace }
  | { kind: 'missing' }
  | { kind: 'unavailable' };

function cacheKey(host: string) {
  return new Request(
    `${CACHE_ORIGIN}/resolve?host=${encodeURIComponent(host)}`
  );
}

async function askResolver(
  host: string,
  env: Env,
  cache: CacheLike | null,
  waitUntil: (promise: Promise<unknown>) => void
): Promise<ResolverAnswer> {
  const secret = env.WORKSPACE_DOMAINS_EDGE_SECRET;
  if (!secret) return { kind: 'unavailable' };

  const key = cacheKey(host);
  const cached = await cache?.match(key).catch(() => undefined);
  if (cached) {
    const body = (await cached.json().catch(() => null)) as {
      workspace?: unknown;
    } | null;
    const workspace = toWorkspace(body?.workspace, 'resolver');
    return workspace ? { kind: 'found', workspace } : { kind: 'missing' };
  }

  let response: Response;
  try {
    response = await fetch(
      `${resolveOrigin(env)}/api/v1/workspace-domains/resolve?host=${encodeURIComponent(host)}`,
      {
        headers: { Accept: 'application/json', [EDGE_SECRET_HEADER]: secret },
        redirect: 'manual',
      }
    );
  } catch {
    return { kind: 'unavailable' };
  }

  let answer: ResolverAnswer;
  if (response.status === 404) {
    answer = { kind: 'missing' };
  } else if (response.ok) {
    const workspace = toWorkspace(
      await response.json().catch(() => null),
      'resolver'
    );
    answer = workspace ? { kind: 'found', workspace } : { kind: 'unavailable' };
  } else {
    return { kind: 'unavailable' };
  }

  if (cache) {
    const stored = new Response(
      JSON.stringify({
        workspace: answer.kind === 'found' ? answer.workspace : null,
      }),
      {
        headers: {
          'Cache-Control': `max-age=${RESOLVE_CACHE_SECONDS}`,
          'Content-Type': 'application/json',
        },
      }
    );
    waitUntil(cache.put(key, stored).catch(() => undefined));
  }
  return answer;
}

/**
 * Resolves a normalized host to its workspace. The database-backed resolver is
 * authoritative when configured; STATIC_HOST_MAP answers when the resolver is
 * unconfigured, unreachable, or does not know the host (bootstrap before the
 * resolver ships).
 */
export async function resolveHost(
  host: string,
  env: Env,
  cache: CacheLike | null,
  waitUntil: (promise: Promise<unknown>) => void
): Promise<ResolvedWorkspace | null> {
  const answer = await askResolver(host, env, cache, waitUntil);
  if (answer.kind === 'found') return answer.workspace;
  return parseStaticHostMap(env.STATIC_HOST_MAP).get(host) ?? null;
}
