import { defaultMeta, type EnvironmentStore } from './store';
import type { Deployment, EnvironmentMeta, Lane } from './types';

// Minimal view of the Durable Object SQL API, so tests can supply their own.
export interface SqlExec {
  exec<T extends Record<string, SqlStorageValue>>(
    query: string,
    ...bindings: unknown[]
  ): { toArray(): T[]; one(): T };
}

type SqlStorageValue = ArrayBuffer | string | number | null;

// Text-keyed tables are WITHOUT ROWID so the primary key is the table itself:
// Cloudflare bills every index a write touches as another row written.
const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS meta (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL, seq INTEGER NOT NULL DEFAULT 0)',
  'CREATE TABLE IF NOT EXISTS lanes (lane TEXT PRIMARY KEY, updated_at INTEGER NOT NULL, data TEXT NOT NULL) WITHOUT ROWID',
  `CREATE TABLE IF NOT EXISTS deployments (
    id TEXT PRIMARY KEY,
    lane TEXT NOT NULL,
    seq INTEGER NOT NULL,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    run_id INTEGER,
    epoch INTEGER,
    idempotency_key TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    data TEXT NOT NULL
  ) WITHOUT ROWID`,
  'CREATE INDEX IF NOT EXISTS deployments_lane_seq ON deployments (lane, seq)',
  'CREATE INDEX IF NOT EXISTS deployments_status ON deployments (status, created_at)',
  'CREATE TABLE IF NOT EXISTS budget (day TEXT PRIMARY KEY, used INTEGER NOT NULL) WITHOUT ROWID',
];

const TERMINAL = "('succeeded','failed','superseded','cancelled','unknown')";

const parse = <T>(rows: Array<{ data: string }>) =>
  rows.map((row) => JSON.parse(row.data) as T);

export class SqlEnvironmentStore implements EnvironmentStore {
  constructor(private readonly sql: SqlExec) {
    for (const statement of SCHEMA) sql.exec(statement);
  }

  #rows<T>(query: string, ...bindings: unknown[]) {
    return parse<T>(
      this.sql.exec<{ data: string }>(query, ...bindings).toArray()
    );
  }

  readMeta(): EnvironmentMeta {
    return (
      this.#rows<EnvironmentMeta>('SELECT data FROM meta WHERE id = 1')[0] ??
      defaultMeta(0)
    );
  }
  writeMeta(meta: EnvironmentMeta) {
    this.sql.exec(
      'INSERT INTO meta (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
      JSON.stringify(meta)
    );
  }
  readLane(lane: string) {
    return (
      this.#rows<Lane>('SELECT data FROM lanes WHERE lane = ?', lane)[0] ?? null
    );
  }
  writeLane(lane: Lane) {
    this.sql.exec(
      'INSERT INTO lanes (lane, updated_at, data) VALUES (?, ?, ?) ON CONFLICT(lane) DO UPDATE SET updated_at = excluded.updated_at, data = excluded.data',
      lane.lane,
      lane.updatedAt,
      JSON.stringify(lane)
    );
  }
  listLanes() {
    return this.#rows<Lane>(
      'SELECT data FROM lanes ORDER BY updated_at DESC, lane ASC'
    );
  }
  readDeployment(id: string) {
    return (
      this.#rows<Deployment>(
        'SELECT data FROM deployments WHERE id = ?',
        id
      )[0] ?? null
    );
  }
  findByIdempotencyKey(key: string) {
    return (
      this.#rows<Deployment>(
        'SELECT data FROM deployments WHERE idempotency_key = ?',
        key
      )[0] ?? null
    );
  }
  writeDeployment(d: Deployment) {
    this.sql.exec(
      `INSERT INTO deployments (id, lane, seq, kind, status, run_id, epoch, idempotency_key, created_at, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, epoch = excluded.epoch, data = excluded.data`,
      d.id,
      d.lane,
      d.seq,
      d.kind,
      d.status,
      d.runId,
      d.attempt?.epoch ?? null,
      d.idempotencyKey,
      d.createdAt,
      JSON.stringify(d)
    );
  }
  queued(lane: string) {
    return this.#rows<Deployment>(
      "SELECT data FROM deployments WHERE lane = ? AND status = 'queued' ORDER BY seq ASC",
      lane
    );
  }
  recent(lane: string, limit: number) {
    return this.#rows<Deployment>(
      'SELECT data FROM deployments WHERE lane = ? ORDER BY seq DESC LIMIT ?',
      lane,
      limit
    );
  }
  publishing() {
    return this.#rows<Deployment>(
      "SELECT data FROM deployments WHERE status = 'publishing'"
    );
  }
  queuedBefore(cutoff: number) {
    return this.#rows<Deployment>(
      "SELECT data FROM deployments WHERE status = 'queued' AND created_at < ?",
      cutoff
    );
  }
  current(lane: string) {
    return (
      this.#rows<Deployment>(
        "SELECT data FROM deployments WHERE lane = ? AND status = 'succeeded' ORDER BY epoch DESC LIMIT 1",
        lane
      )[0] ?? null
    );
  }
  maxDeployRunId(lane: string) {
    const row = this.sql
      .exec<{ max_run: number | null }>(
        "SELECT MAX(run_id) AS max_run FROM deployments WHERE lane = ? AND kind = 'deploy' AND status IN ('queued','publishing','succeeded')",
        lane
      )
      .one();
    return row.max_run ?? null;
  }
  nextSeq() {
    this.sql.exec(
      'INSERT INTO meta (id, data, seq) VALUES (1, ?, 0) ON CONFLICT(id) DO NOTHING',
      JSON.stringify(defaultMeta(0))
    );
    return this.sql
      .exec<{ seq: number }>(
        'UPDATE meta SET seq = seq + 1 WHERE id = 1 RETURNING seq'
      )
      .one().seq;
  }
  openLaneCount() {
    return this.sql
      .exec<{ count: number }>(
        "SELECT COUNT(DISTINCT lane) AS count FROM deployments WHERE status IN ('queued','publishing')"
      )
      .one().count;
  }
  pruneTerminal(
    lane: string,
    keep: number,
    protectId: string | null,
    unknownSince: number
  ) {
    this.sql.exec(
      `DELETE FROM deployments WHERE id IN (
         SELECT id FROM deployments
         WHERE lane = ? AND status IN ${TERMINAL} AND id != ?
           AND NOT (status = 'unknown'
             AND COALESCE(json_extract(data, '$.finishedAt'), 0) >= ?)
         ORDER BY seq DESC LIMIT -1 OFFSET ?
       )`,
      lane,
      protectId ?? '',
      unknownSince,
      keep
    );
  }
  hasUnknownSince(lane: string, cutoff: number) {
    return this.#rows<Deployment>(
      "SELECT data FROM deployments WHERE lane = ? AND status = 'unknown'",
      lane
    ).some((d) => (d.finishedAt ?? 0) >= cutoff);
  }
  deleteLane(lane: string) {
    this.sql.exec('DELETE FROM deployments WHERE lane = ?', lane);
    this.sql.exec('DELETE FROM lanes WHERE lane = ?', lane);
  }
  countRequest(day: string, limit: number, force: boolean) {
    const row = this.sql
      .exec<{ day: string; used: number }>('SELECT day, used FROM budget')
      .toArray()
      .find((entry) => entry.day === day);
    const used = row?.used ?? 0;
    if (used >= limit && !force) return null;
    // One row: a new day replaces the previous counter.
    this.sql.exec('DELETE FROM budget WHERE day != ?', day);
    this.sql.exec(
      'INSERT INTO budget (day, used) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET used = used + 1',
      day
    );
    return used + 1;
  }
}
