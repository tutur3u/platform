/**
 * Response cache for the GitHub mirror's API calls.
 *
 * Framework independent: it receives a Cache API compatible store and an
 * optional `waitUntil` from the runtime adapter, so Vercel/Node (no store)
 * keeps calling GitHub directly and the Cloudflare Worker (`caches.default`)
 * stops re-fetching the same repository content on every page view.
 */

export const GITHUB_CACHE_TTL_SECONDS = {
  /** Branch, tag, default-branch and listing responses. */
  mutable: 300,
  /** Content addressed by a full commit SHA never changes. */
  immutable: 86_400,
  /** CI check runs, suites and statuses change while a commit is checked. */
  checks: 60,
  /** A missing resource may appear soon after a push. */
  notFound: 60,
} as const;

const CACHE_ORIGIN = 'https://github-response-cache.invalid';
const CACHE_KEY_VERSION = 'v1';
const EXPIRES_HEADER = 'x-git-cache-expires';
const COMMIT_SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu;
const PRESERVED_HEADERS = ['content-type', 'etag', 'link'] as const;

/** The subset of the Workers Cache API this module uses. */
export interface GitHubCacheStore {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

export interface GitHubResponseCache {
  store: GitHubCacheStore;
  /** Keeps a cache write alive after the response is returned. */
  waitUntil?: (work: Promise<unknown>) => void;
}

export function isCommitSha(value: string | null | undefined) {
  return COMMIT_SHA_PATTERN.test(value ?? '');
}

function decodeSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function repositorySegments(url: URL) {
  const segments = url.pathname.split('/').filter(Boolean).map(decodeSegment);
  if (segments[0] !== 'repos' || segments.length < 3) return [];
  return segments.slice(3);
}

/** Whether the URL addresses content that a full commit SHA pins forever. */
export function isImmutableGitHubUrl(url: URL) {
  const [resource, first, second] = repositorySegments(url);

  if (resource === 'commits') {
    return repositorySegments(url).length === 2 && isCommitSha(first);
  }

  if (resource === 'git') {
    return (
      repositorySegments(url).length === 3 &&
      (first === 'commits' || first === 'trees' || first === 'blobs') &&
      isCommitSha(second)
    );
  }

  if (resource === 'contents' || resource === 'readme') {
    return isCommitSha(url.searchParams.get('ref'));
  }

  if (resource === 'compare' && first) {
    const [base, head] = first.split('...');
    return (
      repositorySegments(url).length === 2 &&
      isCommitSha(base) &&
      isCommitSha(head)
    );
  }

  return false;
}

const CHECK_RESOURCES = new Set(['check-runs', 'check-suites', 'statuses']);
const COMMIT_CHECK_RESOURCES = new Set([
  'check-runs',
  'check-suites',
  'status',
  'statuses',
]);

/** Whether the URL reads CI check data, which changes after the push. */
export function isCheckGitHubUrl(url: URL) {
  const [resource, , second] = repositorySegments(url);
  if (resource && CHECK_RESOURCES.has(resource)) return true;
  return resource === 'commits' && COMMIT_CHECK_RESOURCES.has(second ?? '');
}

/**
 * Seconds a response may be reused. Zero means do not store: this covers every
 * 5xx, rate limit (403/429), redirect and other non-content status.
 */
export function githubCacheTtlSeconds(url: URL, status: number) {
  if (status === 404) return GITHUB_CACHE_TTL_SECONDS.notFound;
  if (status !== 200) return 0;
  if (isCheckGitHubUrl(url)) return GITHUB_CACHE_TTL_SECONDS.checks;
  return isImmutableGitHubUrl(url)
    ? GITHUB_CACHE_TTL_SECONDS.immutable
    : GITHUB_CACHE_TTL_SECONDS.mutable;
}

/**
 * Cache key: method, normalized URL, `Accept` (it selects the body format)
 * and the auth scope, so a response fetched under one scope is never replayed
 * to another.
 */
export function githubCacheKey({
  accept,
  authScope,
  method = 'GET',
  url,
}: {
  accept: string;
  authScope: string;
  method?: string;
  url: URL;
}) {
  const normalized = new URL(url.href);
  normalized.hash = '';
  normalized.searchParams.sort();

  const segments = [
    CACHE_KEY_VERSION,
    method.toUpperCase(),
    authScope,
    accept,
    normalized.href,
  ].map(encodeURIComponent);

  // The Cache API only keys GET requests.
  return new Request(`${CACHE_ORIGIN}/${segments.join('/')}`, {
    method: 'GET',
  });
}

async function readEntry(
  store: GitHubCacheStore,
  key: Request,
  now: () => number
) {
  try {
    const entry = await store.match(key);
    if (!entry) return null;
    const expiresAt = Number(entry.headers.get(EXPIRES_HEADER));
    if (!Number.isFinite(expiresAt) || expiresAt <= now()) return null;
    return entry;
  } catch {
    return null;
  }
}

async function writeEntry({
  key,
  now,
  response,
  store,
  ttl,
}: {
  key: Request;
  now: () => number;
  response: Response;
  store: GitHubCacheStore;
  ttl: number;
}) {
  try {
    const headers = new Headers();
    for (const name of PRESERVED_HEADERS) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }
    headers.set('cache-control', `public, max-age=${ttl}`);
    headers.set(EXPIRES_HEADER, String(now() + ttl * 1000));

    await store.put(
      key,
      new Response(await response.text(), { headers, status: response.status })
    );
  } catch {
    // A cache write failure must never fail the page that triggered it.
  }
}

export async function cachedGitHubFetch({
  accept,
  authScope,
  cache,
  fetcher = fetch,
  headers,
  method = 'GET',
  now = Date.now,
  url,
}: {
  accept: string;
  /** Identifies the credential class: `anonymous` or a repository grant. */
  authScope: string;
  cache?: GitHubResponseCache | null;
  fetcher?: (input: URL, init: RequestInit) => Promise<Response>;
  headers: HeadersInit;
  method?: string;
  now?: () => number;
  url: URL;
}): Promise<Response> {
  if (!cache || method.toUpperCase() !== 'GET') {
    return fetcher(url, { headers, method });
  }

  const key = githubCacheKey({ accept, authScope, method, url });
  const hit = await readEntry(cache.store, key, now);
  if (hit) return hit;

  const response = await fetcher(url, { headers, method });
  const ttl = githubCacheTtlSeconds(url, response.status);
  if (ttl > 0) {
    const write = writeEntry({
      key,
      now,
      response: response.clone(),
      store: cache.store,
      ttl,
    });
    if (cache.waitUntil) cache.waitUntil(write);
    else await write;
  }

  return response;
}
