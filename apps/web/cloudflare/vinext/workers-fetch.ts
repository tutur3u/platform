// workerd's fetch rejects every `cache` mode except `no-store` with
// "TypeError: Unsupported cache mode", while Next.js code passes `force-cache`
// and vinext forwards it. vinext keeps its data-cache semantics (`cache`,
// `next.revalidate`, `next.tags`) in its own fetch patch and sends network
// calls through the fetch stored under ORIGINAL_FETCH, so only that network
// fetch drops the unsupported mode.
//
// workerd's fetch and Request constructor also throw "Invalid redirect value"
// for `redirect: 'error'`, which server code passes so a credentialed request
// never follows a redirect. vinext's patch builds a Request from the caller's
// init, so the global fetch, including any patch assigned to it later, sends
// those requests with `redirect: 'manual'` and turns a redirect response into
// the TypeError the Fetch standard specifies for `error` mode.
const ORIGINAL_FETCH = Symbol.for('vinext.fetchCache.originalFetch');
const WORKERS_CACHE_MODES = new Set<RequestCache>(['no-store']);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type Fetch = typeof fetch;

/** `fetchImpl` without `init.cache` values workerd rejects. */
export function withWorkersCacheModes(fetchImpl: Fetch): Fetch {
  return (input, init) => {
    if (init?.cache === undefined || WORKERS_CACHE_MODES.has(init.cache)) {
      return fetchImpl(input, init);
    }
    const { cache: _unsupported, ...supported } = init;
    return fetchImpl(input, supported);
  };
}

/** `fetchImpl` with `redirect: 'error'` emulated over `redirect: 'manual'`. */
export function withWorkersRedirectError(fetchImpl: Fetch): Fetch {
  return async (input, init) => {
    if (init?.redirect !== 'error') return fetchImpl(input, init);
    const response = await fetchImpl(input, { ...init, redirect: 'manual' });
    if (!REDIRECT_STATUSES.has(response.status)) return response;
    await response.body?.cancel().catch(() => undefined);
    throw new TypeError('fetch failed: redirect with redirect mode "error"');
  };
}

/**
 * Installs the filtered fetch as the global fetch and as vinext's network
 * fetch. Runs before vinext evaluates, which captures ORIGINAL_FETCH once and
 * later assigns its caching patch to the global fetch.
 */
export function installWorkersFetch(scope: typeof globalThis = globalThis) {
  const slot = scope as typeof globalThis & { [ORIGINAL_FETCH]?: Fetch };
  if (slot[ORIGINAL_FETCH]) return;
  const network = withWorkersRedirectError(
    withWorkersCacheModes(scope.fetch.bind(scope))
  );
  slot[ORIGINAL_FETCH] = network;
  let current = network;
  Object.defineProperty(scope, 'fetch', {
    configurable: true,
    enumerable: true,
    get: () => current,
    set: (next: Fetch) => {
      current = withWorkersRedirectError(next);
    },
  });
}
