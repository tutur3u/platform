import type { PermissionSnapshot, VersionKey, Versions } from './types';

type Entry = {
  versions: Versions;
  snapshot: PermissionSnapshot;
  storedAt: number;
};

const sameVersions = (a: Versions, b: Versions) =>
  a.principal === b.principal && a.workspace === b.workspace;

const lower = (a: Versions, b: Versions) =>
  a.principal < b.principal || a.workspace < b.workspace;

/**
 * Per-isolate snapshot cache. A hit requires the exact versions of a fresh
 * read; an entry is never replaced by one with lower versions. The TTL only
 * bounds memory.
 */
export class SnapshotCache {
  readonly #entries = new Map<string, Entry>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number,
    private readonly maxEntries = 10_000
  ) {}

  #key(key: VersionKey, wsId: string) {
    // JSON keeps the parts apart even if an id contains a separator.
    return JSON.stringify([key.kind, key.id, wsId]);
  }

  get(
    key: VersionKey,
    wsId: string,
    versions: Versions
  ): PermissionSnapshot | undefined {
    const id = this.#key(key, wsId);
    const entry = this.#entries.get(id);
    if (!entry) return undefined;
    if (this.now() - entry.storedAt > this.ttlMs) {
      this.#entries.delete(id);
      return undefined;
    }
    return sameVersions(entry.versions, versions) ? entry.snapshot : undefined;
  }

  set(
    key: VersionKey,
    wsId: string,
    versions: Versions,
    snapshot: PermissionSnapshot
  ) {
    const id = this.#key(key, wsId);
    const existing = this.#entries.get(id);
    if (existing && lower(versions, existing.versions)) return;
    if (!existing && this.#entries.size >= this.maxEntries) {
      const oldest = this.#entries.keys().next().value;
      if (oldest !== undefined) this.#entries.delete(oldest);
    }
    this.#entries.set(id, { versions, snapshot, storedAt: this.now() });
  }
}

export { lower as versionsLower };
