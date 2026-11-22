const DAY_MS = 24 * 60 * 60 * 1000;
const ACTOR_WINDOW_MS = 10 * 60 * 1000;
const MAX_JOB_AGE_MS = 50_000;
const RESULT_RETENTION_MS = DAY_MS;

export interface Capacity {
  readonly concurrent: number;
  readonly concurrentPerActor: number;
  readonly perActorPerWindow: number;
  readonly startsPerDay: number;
}

export const DEFAULT_CAPACITY: Capacity = Object.freeze({
  concurrent: 20,
  concurrentPerActor: 1,
  perActorPerWindow: 30,
  startsPerDay: 5000,
});

export function parseCapacity(env: {
  PLAYGROUND_MAX_CONCURRENT?: string;
  PLAYGROUND_MAX_CONCURRENT_PER_USER?: string;
  PLAYGROUND_MAX_RUNS_PER_USER_10_MINUTES?: string;
  PLAYGROUND_MAX_STARTS_PER_UTC_DAY?: string;
}): Capacity {
  function limit(value: string | undefined, maximum: number): number {
    if (value === undefined) return maximum;
    const count = Number(value);
    if (!/^[1-9][0-9]*$/u.test(value) || count > maximum) {
      throw new Error('Invalid Playground capacity configuration');
    }
    return count;
  }

  return {
    concurrent: limit(
      env.PLAYGROUND_MAX_CONCURRENT,
      DEFAULT_CAPACITY.concurrent
    ),
    concurrentPerActor: limit(
      env.PLAYGROUND_MAX_CONCURRENT_PER_USER,
      DEFAULT_CAPACITY.concurrentPerActor
    ),
    perActorPerWindow: limit(
      env.PLAYGROUND_MAX_RUNS_PER_USER_10_MINUTES,
      DEFAULT_CAPACITY.perActorPerWindow
    ),
    startsPerDay: limit(
      env.PLAYGROUND_MAX_STARTS_PER_UTC_DAY,
      DEFAULT_CAPACITY.startsPerDay
    ),
  };
}

type SqlValue = string | number | null;
type SqlRow = Record<string, SqlValue>;

// The caller must provide the Durable Object's synchronous storage transaction.
export interface AdmissionStorage {
  query<Row extends SqlRow>(sql: string, ...params: SqlValue[]): Iterable<Row>;
  transaction<T>(callback: () => T): T;
}

interface RunScope {
  runId: string;
  projectId: string;
  scopeId: string;
}

export interface RunRequest extends RunScope {
  requester: string;
  revision: number;
}

export type Denial =
  | 'execution_paused'
  | 'global_capacity'
  | 'user_busy'
  | 'project_busy'
  | 'user_rate_limit'
  | 'daily_capacity'
  | 'request_conflict';

type RunState = 'reserved' | 'starting' | 'succeeded' | 'failed' | 'cancelled';
type TerminalState = Exclude<RunState, 'reserved' | 'starting'>;

export interface RunRow extends SqlRow {
  run_id: string;
  requester: string;
  project_id: string;
  scope_id: string;
  revision: number;
  generation: number;
  slot: number;
  created_at: number;
  deadline: number;
  state: RunState;
  finished_at: number | null;
  cleanup_at: number | null;
  cleanup_attempts: number;
  stop_requested: number;
  writeback_state: 0 | 1 | 2;
  exit_code: number | null;
  result_revision: number | null;
  output: string;
}

interface GateRow extends SqlRow {
  enabled: number;
  generation: number;
  day: number;
  starts: number;
}

const ACTIVE = "state IN ('reserved', 'starting')";

export class PlaygroundAdmission {
  private readonly storage: AdmissionStorage;
  private readonly capacity: Capacity;

  constructor(storage: AdmissionStorage, capacity: Capacity) {
    this.storage = storage;
    this.capacity = capacity;
    storage.query(`
      CREATE TABLE IF NOT EXISTS playground_gate (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
        generation INTEGER NOT NULL,
        day INTEGER NOT NULL,
        starts INTEGER NOT NULL
      )`);
    storage.query(
      'INSERT OR IGNORE INTO playground_gate VALUES (1, 0, 0, -1, 0)'
    );
    storage.query(`
      CREATE TABLE IF NOT EXISTS playground_runs (
        run_id TEXT PRIMARY KEY,
        requester TEXT NOT NULL,
        project_id TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        generation INTEGER NOT NULL,
        slot INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        deadline INTEGER NOT NULL,
        state TEXT NOT NULL,
        finished_at INTEGER,
        cleanup_at INTEGER,
        cleanup_attempts INTEGER NOT NULL,
        stop_requested INTEGER NOT NULL,
        writeback_state INTEGER NOT NULL,
        exit_code INTEGER,
        result_revision INTEGER,
        output TEXT NOT NULL
      )`);
    storage.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS playground_active_slot
      ON playground_runs (slot) WHERE ${ACTIVE}`);
    storage.query(`
      CREATE INDEX IF NOT EXISTS playground_user_window
      ON playground_runs (requester, created_at)`);
    storage.query(`
      CREATE INDEX IF NOT EXISTS playground_expired_receipts
      ON playground_runs (finished_at) WHERE finished_at IS NOT NULL`);
  }

  private gate(): GateRow {
    const [gate] = this.storage.query<GateRow>(
      'SELECT enabled, generation, day, starts FROM playground_gate WHERE singleton = 1'
    );
    if (!gate) throw new Error('Playground execution gate missing');
    return gate;
  }

  active(): RunRow[] {
    return Array.from(
      this.storage.query<RunRow>(
        `SELECT * FROM playground_runs WHERE ${ACTIVE} ORDER BY slot`
      )
    );
  }

  read(scope: RunScope): RunRow | undefined {
    const [run] = this.storage.query<RunRow>(
      `SELECT * FROM playground_runs
       WHERE run_id = ? AND project_id = ? AND scope_id = ?`,
      scope.runId,
      scope.projectId,
      scope.scopeId
    );
    return run;
  }

  setEnabled(enabled: boolean) {
    return this.storage.transaction(() => {
      const gate = this.gate();
      if (enabled && !gate.enabled && this.active().length) {
        return { enabled: false, generation: gate.generation };
      }
      if (Boolean(gate.enabled) === enabled) {
        return { enabled, generation: gate.generation };
      }
      const generation = gate.generation + 1;
      this.storage.query(
        'UPDATE playground_gate SET enabled = ?, generation = ? WHERE singleton = 1',
        Number(enabled),
        generation
      );
      if (!enabled) {
        this.storage.query(
          `UPDATE playground_runs SET cleanup_at = 0, stop_requested = 1
           WHERE ${ACTIVE} AND cleanup_attempts < 3`
        );
      }
      return { enabled, generation };
    });
  }

  reserve(
    request: RunRequest,
    now: number
  ):
    | { kind: 'new' | 'existing'; run: RunRow }
    | { kind: 'refused'; reason: Denial } {
    return this.storage.transaction(() => {
      const [previous] = this.storage.query<RunRow>(
        'SELECT * FROM playground_runs WHERE run_id = ?',
        request.runId
      );
      if (previous) {
        return previous.requester === request.requester &&
          previous.project_id === request.projectId &&
          previous.scope_id === request.scopeId
          ? { kind: 'existing', run: previous }
          : { kind: 'refused', reason: 'request_conflict' };
      }
      const gate = this.gate();
      if (!gate.enabled) return { kind: 'refused', reason: 'execution_paused' };
      const day = Math.floor(now / DAY_MS);
      // A clock reversal keeps the newest UTC day's budget charged.
      const starts = day > gate.day ? 0 : gate.starts;
      if (starts >= this.capacity.startsPerDay) {
        return { kind: 'refused', reason: 'daily_capacity' };
      }
      const active = this.active();
      if (active.some((run) => run.project_id === request.projectId)) {
        return { kind: 'refused', reason: 'project_busy' };
      }
      if (
        active.filter((run) => run.requester === request.requester).length >=
        this.capacity.concurrentPerActor
      ) {
        return { kind: 'refused', reason: 'user_busy' };
      }
      if (active.length >= this.capacity.concurrent) {
        return { kind: 'refused', reason: 'global_capacity' };
      }
      const recent = Array.from(
        this.storage.query<{ run_id: string }>(
          `SELECT run_id FROM playground_runs WHERE requester = ? AND created_at > ?
         ORDER BY created_at DESC LIMIT ?`,
          request.requester,
          now - ACTOR_WINDOW_MS,
          this.capacity.perActorPerWindow
        )
      );
      if (recent.length >= this.capacity.perActorPerWindow) {
        return { kind: 'refused', reason: 'user_rate_limit' };
      }
      const usedSlots = new Set(active.map((run) => run.slot));
      let slot = 0;
      while (usedSlots.has(slot)) slot += 1;
      const run: RunRow = {
        run_id: request.runId,
        requester: request.requester,
        project_id: request.projectId,
        scope_id: request.scopeId,
        revision: request.revision,
        generation: gate.generation,
        slot,
        created_at: now,
        deadline: now + MAX_JOB_AGE_MS,
        state: 'reserved',
        finished_at: null,
        cleanup_at: now + MAX_JOB_AGE_MS,
        cleanup_attempts: 0,
        stop_requested: 0,
        writeback_state: 0,
        exit_code: null,
        result_revision: null,
        output: '',
      };
      this.storage.query(
        `INSERT INTO playground_runs VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reserved', NULL, ?, 0, 0, 0, NULL, NULL, ''
        )`,
        run.run_id,
        run.requester,
        run.project_id,
        run.scope_id,
        run.revision,
        run.generation,
        run.slot,
        now,
        run.deadline,
        run.cleanup_at
      );
      this.storage.query(
        'UPDATE playground_gate SET day = ?, starts = ? WHERE singleton = 1',
        Math.max(day, gate.day),
        starts + 1
      );
      this.storage.query(
        `
        DELETE FROM playground_runs WHERE run_id IN (
          SELECT run_id FROM playground_runs
          WHERE finished_at IS NOT NULL AND finished_at < ?
          ORDER BY finished_at LIMIT 64
        )`,
        now - RESULT_RETENTION_MS
      );
      return { kind: 'new', run };
    });
  }

  claimStart(
    input: Pick<RunRow, 'run_id' | 'generation' | 'slot'>,
    now: number
  ) {
    return this.storage.transaction(() => {
      const gate = this.gate();
      if (!gate.enabled || gate.generation !== input.generation) return false;
      const [claimed] = this.storage.query<{ run_id: string }>(
        `UPDATE playground_runs SET state = 'starting'
         WHERE run_id = ? AND generation = ? AND slot = ?
           AND state = 'reserved' AND stop_requested = 0 AND deadline > ?
         RETURNING run_id`,
        input.run_id,
        input.generation,
        input.slot,
        now
      );
      return Boolean(claimed);
    });
  }

  mayExecute(
    input: Pick<RunRow, 'run_id' | 'generation' | 'slot'>,
    now: number
  ) {
    const [valid] = this.storage.query<{ run_id: string }>(
      `SELECT run_id FROM playground_runs
       WHERE run_id = ? AND generation = ? AND slot = ? AND state = 'starting'
         AND stop_requested = 0 AND deadline > ?
         AND EXISTS (
           SELECT 1 FROM playground_gate WHERE singleton = 1 AND enabled = 1
             AND generation = ?
         )`,
      input.run_id,
      input.generation,
      input.slot,
      now,
      input.generation
    );
    return Boolean(valid);
  }

  claimWriteback(run: RunRow, now: number) {
    const [claim] = this.storage.query<{ run_id: string }>(
      `UPDATE playground_runs SET writeback_state = 1
       WHERE run_id = ? AND generation = ? AND state = 'starting'
         AND writeback_state = 0 AND stop_requested = 0 AND deadline > ?
         AND EXISTS (
           SELECT 1 FROM playground_gate WHERE singleton = 1 AND enabled = 1
             AND generation = ?
         )
       RETURNING run_id`,
      run.run_id,
      run.generation,
      now,
      run.generation
    );
    return Boolean(claim);
  }

  settleWriteback(run: RunRow, now: number) {
    const [settled] = this.storage.query<{ run_id: string }>(
      `UPDATE playground_runs
       SET writeback_state = 2,
           cleanup_at = COALESCE(cleanup_at, ?),
           cleanup_attempts = CASE WHEN cleanup_at IS NULL THEN 2 ELSE cleanup_attempts END
       WHERE run_id = ? AND generation = ? AND writeback_state = 1
         AND ${ACTIVE}
       RETURNING run_id`,
      now,
      run.run_id,
      run.generation
    );
    return Boolean(settled);
  }

  claimCleanup(run: RunRow, now: number): boolean {
    const [claimed] = this.storage.query<{ run_id: string }>(
      `UPDATE playground_runs
       SET cleanup_attempts = cleanup_attempts + 1,
           cleanup_at = CASE cleanup_attempts WHEN 0 THEN ? WHEN 1 THEN ? ELSE NULL END
       WHERE run_id = ? AND slot = ? AND generation = ?
         AND ${ACTIVE} AND cleanup_at <= ? AND cleanup_attempts < 3
       RETURNING run_id`,
      now + 3000,
      now + 6000,
      run.run_id,
      run.slot,
      run.generation,
      now
    );
    return Boolean(claimed);
  }

  requestStop(run: RunRow) {
    this.storage.query(
      `UPDATE playground_runs SET cleanup_at = 0, stop_requested = 1
       WHERE run_id = ? AND generation = ? AND ${ACTIVE} AND cleanup_attempts < 3`,
      run.run_id,
      run.generation
    );
  }

  // Release only after the slot owner confirms teardown.
  finish(
    input: Pick<RunRow, 'run_id' | 'generation' | 'slot'>,
    state: TerminalState,
    now: number,
    result?: { exitCode: number; output: string; savedRevision?: number }
  ) {
    return this.storage.transaction(() => {
      const gate = this.gate();
      const finalState =
        gate.enabled && gate.generation === input.generation
          ? state
          : 'cancelled';
      const [finished] = this.storage.query<{ state: TerminalState }>(
        `UPDATE playground_runs
         SET state = CASE stop_requested WHEN 1 THEN 'cancelled' ELSE ? END,
             finished_at = ?, cleanup_at = NULL,
             exit_code = CASE stop_requested WHEN 1 THEN NULL ELSE ? END,
             result_revision = CASE stop_requested WHEN 1 THEN NULL ELSE ? END,
             output = CASE stop_requested WHEN 1 THEN '' ELSE ? END
         WHERE run_id = ? AND generation = ? AND slot = ? AND ${ACTIVE}
           AND writeback_state <> 1
         RETURNING state`,
        finalState,
        now,
        finalState === 'cancelled' ? null : (result?.exitCode ?? null),
        finalState === 'cancelled' ? null : (result?.savedRevision ?? null),
        finalState === 'cancelled' ? '' : (result?.output ?? ''),
        input.run_id,
        input.generation,
        input.slot
      );
      return finished?.state;
    });
  }
}
