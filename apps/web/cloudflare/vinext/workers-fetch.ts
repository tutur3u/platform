// workerd's fetch rejects every `cache` mode except `no-store` with
// "TypeError: Unsupported cache mode", while Next.js code passes `force-cache`
// and vinext forwards it. vinext keeps its data-cache semantics (`cache`,
// `next.revalidate`, `next.tags`) in its own fetch patch and sends network
// calls through the fetch stored under ORIGINAL_FETCH, so only that network
// fetch drops the unsupported mode.
const ORIGINAL_FETCH = Symbol.for('vinext.fetchCache.originalFetch');
const WORKERS_CACHE_MODES = new Set<RequestCache>(['no-store']);

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

/**
 * Installs the filtered fetch as the global fetch and as vinext's network
 * fetch. Runs before vinext evaluates, which captures ORIGINAL_FETCH once.
 */
export function installWorkersFetch(scope: typeof globalThis = globalThis) {
  const slot = scope as typeof globalThis & { [ORIGINAL_FETCH]?: Fetch };
  if (slot[ORIGINAL_FETCH]) return;
  const filtered = withWorkersCacheModes(scope.fetch.bind(scope));
  slot[ORIGINAL_FETCH] = filtered;
  scope.fetch = filtered;
}
