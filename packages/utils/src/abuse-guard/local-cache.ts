/**
 * Bounded process-local caches in front of the abuse-guard store. They make
 * repeated denials and known replays cost zero store operations, and give a
 * conservative per-instance limiter while the store is unavailable. Each map
 * is capped and evicts its oldest entries, so memory stays bounded.
 */

const DEFAULT_MAX_ENTRIES = 10_000;

export type ExpiringMap<V> = {
  /** The live value, or undefined when absent or expired. */
  get(key: string, now?: number): V | undefined;
  set(key: string, value: V, expiresAt: number): void;
  delete(key: string): void;
  readonly size: number;
};

export function createExpiringMap<V>(
  maxEntries = DEFAULT_MAX_ENTRIES
): ExpiringMap<V> {
  const entries = new Map<string, { value: V; expiresAt: number }>();
  return {
    get(key, now = Date.now()) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value, expiresAt) {
      entries.delete(key);
      while (entries.size >= maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
      entries.set(key, { value, expiresAt });
    },
    delete(key) {
      entries.delete(key);
    },
    get size() {
      return entries.size;
    },
  };
}

export type LocalWindow = { key: string; limit: number; windowMs: number };

/**
 * Per-instance fixed windows, all-or-nothing like the store's `win.hit`.
 * Returns the first denied window, or null when every window admitted.
 */
export function createLocalWindowLimiter(maxEntries = DEFAULT_MAX_ENTRIES) {
  const counters = createExpiringMap<{ index: number; count: number }>(
    maxEntries
  );
  return {
    hit(windows: LocalWindow[], now = Date.now()) {
      const states = windows.map((window) => {
        const index = Math.floor(now / window.windowMs);
        const current = counters.get(window.key, now);
        const count = current?.index === index ? current.count : 0;
        return { window, index, count, resetAt: (index + 1) * window.windowMs };
      });
      const denied = states.find((state) => state.count >= state.window.limit);
      if (denied) return { window: denied.window, resetAt: denied.resetAt };
      for (const state of states) {
        counters.set(
          state.window.key,
          { index: state.index, count: state.count + 1 },
          state.resetAt
        );
      }
      return null;
    },
  };
}
