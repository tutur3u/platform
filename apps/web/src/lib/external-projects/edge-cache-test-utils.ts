import type { EdgeCache } from './edge-cache-core';

/** In-memory stand-in for the Workers cache that records every call. */
export function createFakeEdgeCache() {
  const store = new Map<string, Response>();
  const calls = { match: [] as string[], put: [] as string[] };
  const cache: EdgeCache = {
    async match(request) {
      calls.match.push(request.url);
      return store.get(request.url)?.clone();
    },
    async put(request, response) {
      calls.put.push(request.url);
      store.set(request.url, response.clone());
    },
  };
  return { cache, calls, store };
}

export function createFakeClock(start = 1_000_000) {
  let current = start;
  return {
    advance(ms: number) {
      current += ms;
    },
    now: () => current,
  };
}
