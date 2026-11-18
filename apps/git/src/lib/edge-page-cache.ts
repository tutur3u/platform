/**
 * Edge cache for anonymous repository pages (overview, blob and tree).
 *
 * Framework independent: the Worker adapter passes a Cache API compatible
 * store and `waitUntil`. A request is eligible only when it carries no cookie
 * and no credential header, so a signed-in or cookie-bearing request is never
 * served from, or written to, the cache.
 */

export const EDGE_CACHE_HEADER = 'x-git-edge-cache';
/** Rendered into error boundaries so a degraded page is never stored. */
export const DEGRADED_RENDER_MARKER = 'data-git-degraded';

export const EDGE_CACHE_TTL_SECONDS = {
  /** Branch, tag and default-branch pages. */
  mutable: 300,
  /** Pages pinned to a full commit SHA never change. */
  immutable: 86_400,
  notFound: 60,
} as const;

const CACHE_ORIGIN = 'https://git-edge-page-cache.invalid';
const CACHE_KEY_VERSION = 'v1';
const EXPIRES_HEADER = 'x-git-edge-expires';
const COMMIT_SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu;
const OWNER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]*$/u;
const REPOSITORY_PATTERN = /^[\w.-]+$/u;
const LOCALE_COOKIE = 'NEXT_LOCALE';
const CREDENTIAL_HEADERS = ['authorization', 'cookie', 'proxy-authorization'];
/** First path segments owned by the app, never a repository owner. */
const RESERVED_OWNERS = new Set([
  '-',
  '_serverFn',
  'api',
  'assets',
  'login',
  'verify-token',
]);

/** The subset of the Workers Cache API this module uses. */
export interface EdgePageCacheStore {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

export interface EdgePageCacheOptions {
  defaultLocale: string;
  locales: readonly string[];
  now?: () => number;
  store: EdgePageCacheStore;
  waitUntil?: (work: Promise<unknown>) => void;
}

export interface AnonymousPagePolicy {
  /** The path pins a full commit SHA. */
  immutable: boolean;
  key: Request;
  locale: string;
}

/**
 * The locale a cookie-less request renders in: the first `Accept-Language`
 * tag (by weight) that names a supported locale or one of its regions.
 */
export function resolveRequestLocale(
  acceptLanguage: string | null,
  locales: readonly string[],
  defaultLocale: string
) {
  const requested = (acceptLanguage ?? '')
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const weight = params
        .map((param) => /^\s*q\s*=\s*([0-9.]+)\s*$/iu.exec(param)?.[1])
        .find(Boolean);
      return {
        index,
        q: weight === undefined ? 1 : Number(weight),
        tag: tag.trim().toLowerCase(),
      };
    })
    .filter(({ q, tag }) => tag && tag !== '*' && q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);

  for (const { tag } of requested) {
    const match = locales.find(
      (locale) =>
        tag === locale.toLowerCase() || tag.startsWith(`${locale.toLowerCase()}-`)
    );
    if (match) return match;
  }

  return defaultLocale;
}

/**
 * Decides whether a request may use the cache and derives its key (path plus
 * resolved locale). Returns `null` for anything else.
 */
export function anonymousPagePolicy(
  request: Request,
  { defaultLocale, locales }: Pick<EdgePageCacheOptions, 'defaultLocale' | 'locales'>
): AnonymousPagePolicy | null {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return null;
  if (CREDENTIAL_HEADERS.some((name) => request.headers.has(name))) return null;

  const url = new URL(request.url);
  if (url.search) return null;

  const segments = url.pathname.split('/').filter(Boolean);
  const [owner, repo, view, ...rest] = segments;
  if (
    !owner ||
    !repo ||
    !OWNER_PATTERN.test(owner) ||
    !REPOSITORY_PATTERN.test(repo) ||
    repo === '.' ||
    repo === '..'
  ) {
    return null;
  }
  if (RESERVED_OWNERS.has(owner) || locales.includes(owner)) return null;

  if (view !== undefined) {
    if ((view !== 'blob' && view !== 'tree') || rest.length === 0) return null;
  }

  const locale = resolveRequestLocale(
    request.headers.get('accept-language'),
    locales,
    defaultLocale
  );
  const key = new Request(
    [
      CACHE_ORIGIN,
      CACHE_KEY_VERSION,
      encodeURIComponent(locale),
      encodeURIComponent(url.host.toLowerCase()),
      encodeURIComponent(url.pathname),
    ].join('/'),
    { method: 'GET' }
  );

  return { immutable: COMMIT_SHA_PATTERN.test(rest[0] ?? ''), key, locale };
}

function ttlSeconds(status: number, immutable: boolean) {
  if (status === 404) return EDGE_CACHE_TTL_SECONDS.notFound;
  if (status !== 200) return 0;
  return immutable
    ? EDGE_CACHE_TTL_SECONDS.immutable
    : EDGE_CACHE_TTL_SECONDS.mutable;
}

function setCookieNames(headers: Headers) {
  return headers
    .getSetCookie()
    .map((cookie) => cookie.split('=')[0]?.trim() ?? '');
}

function withMarker(response: Response, state: 'BYPASS' | 'HIT' | 'MISS') {
  const marked = new Response(response.body, response);
  marked.headers.set(EDGE_CACHE_HEADER, state);
  return marked;
}

async function readEntry(
  options: EdgePageCacheOptions,
  policy: AnonymousPagePolicy,
  method: string
) {
  try {
    const entry = await options.store.match(policy.key);
    if (!entry) return null;
    const expiresAt = Number(entry.headers.get(EXPIRES_HEADER));
    if (!Number.isFinite(expiresAt) || expiresAt <= (options.now ?? Date.now)())
      return null;
    return method === 'HEAD'
      ? new Response(null, { headers: entry.headers, status: entry.status })
      : entry;
  } catch {
    return null;
  }
}

async function writeEntry({
  copy,
  options,
  policy,
  ttl,
}: {
  copy: Response;
  options: EdgePageCacheOptions;
  policy: AnonymousPagePolicy;
  ttl: number;
}) {
  try {
    const html = await copy.text();
    if (html.includes(DEGRADED_RENDER_MARKER)) return;

    const headers = new Headers(copy.headers);
    for (const name of [
      'content-encoding',
      'content-length',
      'set-cookie',
      'transfer-encoding',
    ]) {
      headers.delete(name);
    }
    headers.set(
      'cache-control',
      `public, max-age=0, s-maxage=${ttl}, must-revalidate`
    );
    headers.set('cdn-cache-control', `public, max-age=${ttl}`);
    headers.set('vary', 'Accept-Language, Cookie');
    headers.set(EXPIRES_HEADER, String((options.now ?? Date.now)() + ttl * 1000));

    await options.store.put(
      policy.key,
      new Response(html, { headers, status: copy.status })
    );
  } catch {
    // A cache write failure must never fail the page that triggered it.
  }
}

/**
 * Serves an eligible anonymous request from the cache, or renders it and
 * stores a cookie-free copy. Ineligible requests pass straight to `render`
 * with their response untouched.
 */
export async function serveWithEdgePageCache({
  options,
  render,
  request,
}: {
  options: EdgePageCacheOptions;
  render: () => Promise<Response>;
  request: Request;
}): Promise<Response> {
  const policy = anonymousPagePolicy(request, options);
  if (!policy) return render();

  const method = request.method.toUpperCase();
  const hit = await readEntry(options, policy, method);
  if (hit) return withMarker(hit, 'HIT');

  const response = await render();
  const ttl = ttlSeconds(response.status, policy.immutable);
  const isHtml = (response.headers.get('content-type') ?? '')
    .toLowerCase()
    .includes('text/html');
  const cookies = setCookieNames(response.headers);
  const storable =
    method === 'GET' &&
    ttl > 0 &&
    isHtml &&
    cookies.every((name) => name === LOCALE_COOKIE);
  if (!storable) return withMarker(response, 'BYPASS');

  const write = writeEntry({ copy: response.clone(), options, policy, ttl });
  if (options.waitUntil) options.waitUntil(write);
  else await write;

  return withMarker(response, 'MISS');
}
