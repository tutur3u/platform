import type { SqlExec } from './sql-store';
import { defaultMeta } from './store';
import type { CiRegistration } from './ci-registry';
import type { EnvironmentMeta } from './types';

// Storage port for the `ci:main` object. Synchronous, like EnvironmentStore,
// so one Durable Object call reads and writes without yielding.
export interface CiStore {
  readMeta(): EnvironmentMeta;
  writeMeta(meta: EnvironmentMeta): void;
  read(sha: string): CiRegistration | null;
  insert(registration: CiRegistration): void;
  // Newest first.
  list(limit: number): CiRegistration[];
  count(): number;
  // Deletes every registration past the newest `keep`.
  prune(keep: number): void;
  // Same contract as EnvironmentStore.countRequest: adds one to the UTC
  // day's counter and returns the new value, or null at the limit without
  // writing.
  countRequest(day: string, limit: number): number | null;
  budgetUsed(day: string): number;
}

// One row per registration: the plan is stored inside its JSON. The only key
// is the commit SHA; listing and pruning sort the at most `retain + 1` rows
// by time instead of keeping an index, which would bill one more row on
// every insert and delete.
const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS ci_meta (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS ci_registrations (sha TEXT PRIMARY KEY, registered_at INTEGER NOT NULL, data TEXT NOT NULL) WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS ci_budget (day TEXT PRIMARY KEY, used INTEGER NOT NULL) WITHOUT ROWID',
];

const NEWEST = 'ORDER BY registered_at DESC, sha DESC';

export class SqlCiStore implements CiStore {
  constructor(private readonly sql: SqlExec) {
    for (const statement of SCHEMA) sql.exec(statement);
  }

  #rows<T>(query: string, ...bindings: unknown[]) {
    return this.sql
      .exec<{ data: string }>(query, ...bindings)
      .toArray()
      .map((row) => JSON.parse(row.data) as T);
  }

  readMeta(): EnvironmentMeta {
    return (
      this.#rows<EnvironmentMeta>('SELECT data FROM ci_meta WHERE id = 1')[0] ??
      defaultMeta(0)
    );
  }
  writeMeta(meta: EnvironmentMeta) {
    this.sql.exec(
      'INSERT INTO ci_meta (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
      JSON.stringify(meta)
    );
  }
  read(sha: string) {
    return (
      this.#rows<CiRegistration>(
        'SELECT data FROM ci_registrations WHERE sha = ?',
        sha
      )[0] ?? null
    );
  }
  insert(registration: CiRegistration) {
    this.sql.exec(
      'INSERT INTO ci_registrations (sha, registered_at, data) VALUES (?, ?, ?)',
      registration.sha,
      registration.registeredAt,
      JSON.stringify(registration)
    );
  }
  list(limit: number) {
    return this.#rows<CiRegistration>(
      `SELECT data FROM ci_registrations ${NEWEST} LIMIT ?`,
      limit
    );
  }
  count() {
    return this.sql
      .exec<{ count: number }>('SELECT COUNT(*) AS count FROM ci_registrations')
      .one().count;
  }
  prune(keep: number) {
    this.sql.exec(
      `DELETE FROM ci_registrations WHERE sha IN (
         SELECT sha FROM ci_registrations ${NEWEST} LIMIT -1 OFFSET ?
       )`,
      keep
    );
  }
  countRequest(day: string, limit: number) {
    const used = this.budgetUsed(day);
    if (used >= limit) return null;
    // One row: a new day replaces the previous counter.
    this.sql.exec('DELETE FROM ci_budget WHERE day != ?', day);
    this.sql.exec(
      'INSERT INTO ci_budget (day, used) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET used = used + 1',
      day
    );
    return used + 1;
  }
  budgetUsed(day: string) {
    return (
      this.sql
        .exec<{ used: number }>('SELECT used FROM ci_budget WHERE day = ?', day)
        .toArray()[0]?.used ?? 0
    );
  }
}

// In-memory store with the same semantics as the SQLite store, for tests.
export class MemoryCiStore implements CiStore {
  meta: EnvironmentMeta = defaultMeta(0);
  registrations = new Map<string, CiRegistration>();
  budget = new Map<string, number>();

  readMeta() {
    return structuredClone(this.meta);
  }
  writeMeta(meta: EnvironmentMeta) {
    this.meta = structuredClone(meta);
  }
  read(sha: string) {
    const value = this.registrations.get(sha);
    return value ? structuredClone(value) : null;
  }
  insert(registration: CiRegistration) {
    if (this.registrations.has(registration.sha))
      throw new Error('UNIQUE constraint failed: ci_registrations.sha');
    this.registrations.set(registration.sha, structuredClone(registration));
  }
  #newest() {
    // Binary order on ties, like SQLite's default collation.
    return [...this.registrations.values()].sort(
      (a, b) =>
        b.registeredAt - a.registeredAt ||
        (a.sha < b.sha ? 1 : a.sha > b.sha ? -1 : 0)
    );
  }
  list(limit: number) {
    return this.#newest()
      .slice(0, limit)
      .map((registration) => structuredClone(registration));
  }
  count() {
    return this.registrations.size;
  }
  prune(keep: number) {
    for (const registration of this.#newest().slice(keep))
      this.registrations.delete(registration.sha);
  }
  countRequest(day: string, limit: number) {
    const used = this.budgetUsed(day);
    if (used >= limit) return null;
    this.budget.clear();
    this.budget.set(day, used + 1);
    return used + 1;
  }
  budgetUsed(day: string) {
    return this.budget.get(day) ?? 0;
  }
}
