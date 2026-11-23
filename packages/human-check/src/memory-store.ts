import type { HumanCheckStore } from './challenge';

/**
 * Per-process counter store for tests and for runtimes without a shared
 * store. It is only single-use within one isolate; production callers
 * pass a shared atomic store.
 */
export function createMemoryStore(
  maxEntries = 10_000,
  now: () => number = Date.now
): HumanCheckStore {
  const entries = new Map<string, { n: number; expiresAt: number }>();
  return {
    async incr(key, ttlMs) {
      const at = now();
      const current = entries.get(key);
      if (current && current.expiresAt > at) {
        current.n += 1;
        return current.n;
      }
      entries.delete(key);
      while (entries.size >= maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
      entries.set(key, { n: 1, expiresAt: at + Math.max(1, ttlMs) });
      return 1;
    },
  };
}
