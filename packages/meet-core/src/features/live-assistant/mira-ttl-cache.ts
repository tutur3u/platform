const TTL_MS = 60_000;
const MAX_ENTRIES = 2048;

/** Per instance or isolate. In-flight reads cannot repopulate after invalidation. */
export class MiraTtlCache<T> {
  private entries = new Map<string, { value: T; expiresAt: number }>();
  private generation = 0;

  delete(key: string) {
    this.entries.delete(key);
    this.generation++;
  }

  async read(
    key: string,
    load: () => Promise<T>,
    shouldCache: (value: T) => boolean
  ): Promise<T> {
    const now = Date.now();
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > now) return cached.value;
    this.entries.delete(key);
    const generation = this.generation;
    const value = await load();
    if (generation === this.generation && shouldCache(value)) {
      const oldest = this.entries.keys().next().value;
      if (this.entries.size >= MAX_ENTRIES && oldest !== undefined)
        this.entries.delete(oldest);
      this.entries.set(key, { value, expiresAt: now + TTL_MS });
    }
    return value;
  }
}
