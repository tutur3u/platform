import { DurableObject } from 'cloudflare:workers';
import {
  type ClaimInput,
  type CompleteInput,
  type JobState,
  LedgerCore,
  type LedgerStore,
  type PendingClaim,
} from './ledger';

// One SQLite row per job. Each RPC runs synchronously against storage, so a
// claim's read and write cannot interleave with another request.
function sqlStore(sql: SqlStorage): LedgerStore {
  sql.exec(
    'CREATE TABLE IF NOT EXISTS job_state (job_id TEXT PRIMARY KEY, state TEXT NOT NULL)'
  );
  return {
    list: () =>
      sql
        .exec<{ job_id: string; state: string }>(
          'SELECT job_id, state FROM job_state ORDER BY job_id'
        )
        .toArray()
        .map((row) => [row.job_id, JSON.parse(row.state) as JobState]),
    read: (jobId) => {
      const rows = sql
        .exec<{ state: string }>(
          'SELECT state FROM job_state WHERE job_id = ?',
          jobId
        )
        .toArray();
      return rows[0] ? (JSON.parse(rows[0].state) as JobState) : null;
    },
    write: (jobId, state) => {
      sql.exec(
        'INSERT INTO job_state (job_id, state) VALUES (?, ?) ON CONFLICT(job_id) DO UPDATE SET state = excluded.state',
        jobId,
        JSON.stringify(state)
      );
    },
  };
}

export class CronLedger extends DurableObject<unknown> {
  readonly #core: LedgerCore;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    this.#core = new LedgerCore(sqlStore(ctx.storage.sql));
  }

  addPendingWork(jobId: string, items: string[]) {
    this.#core.addPendingWork(jobId, items);
  }

  failPendingWork(jobId: string, items: string[], claim?: PendingClaim) {
    return this.#core.failPendingWork(jobId, items, claim);
  }

  quarantinedWork(jobId: string) {
    return this.#core.quarantinedWork(jobId);
  }

  checkFence(jobId: string, generation: number) {
    return this.#core.checkFence(jobId, generation);
  }

  pendingWork(jobId: string) {
    return this.#core.pendingWork(jobId);
  }

  settlePendingWork(jobId: string, items: string[], claim?: PendingClaim) {
    this.#core.settlePendingWork(jobId, items, claim);
  }

  claim(input: ClaimInput) {
    return this.#core.claim(input);
  }

  complete(input: CompleteInput) {
    return this.#core.complete(input);
  }

  resume(jobId: string) {
    return this.#core.resume(jobId);
  }

  status() {
    return this.#core.status();
  }

  stop(jobId: string, reason: string) {
    return this.#core.stop(jobId, reason);
  }
}
