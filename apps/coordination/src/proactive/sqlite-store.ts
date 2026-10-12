import type { DueJob, JobState, JobStore, Phase } from './contracts';
import { sameJob, validJob } from './engine';
import {
  type ReviewState,
  type ReviewStore,
  reviewStateSchema,
} from './review';

export interface SqlExecutor {
  exec(
    query: string,
    ...values: (string | number | null)[]
  ): {
    toArray(): Record<string, unknown>[];
  };
}

function text(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') throw new Error('Corrupt proactive state');
  return value;
}
function integer(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new Error('Corrupt proactive state');
  return value;
}

export class SqliteJobStore implements JobStore {
  constructor(
    private readonly sql: SqlExecutor,
    private readonly atomic: <T>(operation: () => T) => T
  ) {
    sql.exec(`CREATE TABLE IF NOT EXISTS proactive_job (
      singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
      actor_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
      occurrence_id TEXT NOT NULL, due_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL, source_version TEXT NOT NULL,
      consent_version TEXT NOT NULL, runs INTEGER NOT NULL CHECK(runs BETWEEN 0 AND 3),
      phase TEXT NOT NULL, token TEXT, lease_until INTEGER, detail TEXT
    )`);
  }

  transaction<T>(operation: () => T): T {
    return this.atomic(operation);
  }

  read(): JobState | null {
    const row = this.sql
      .exec('SELECT * FROM proactive_job WHERE singleton = 1')
      .toArray()[0];
    if (!row) return null;
    const job: DueJob = {
      actorId: text(row, 'actor_id'),
      workspaceId: text(row, 'workspace_id'),
      occurrenceId: text(row, 'occurrence_id'),
      dueAt: integer(row, 'due_at'),
      expiresAt: integer(row, 'expires_at'),
      sourceVersion: text(row, 'source_version'),
      consentVersion: text(row, 'consent_version'),
      action: 'reflection-dry-run',
    };
    if (!validJob(job)) throw new Error('Corrupt proactive job');
    const runs = integer(row, 'runs');
    if (runs < 0 || runs > 3) throw new Error('Corrupt proactive run count');
    let phase: Phase;
    switch (row.phase) {
      case 'pending':
        phase = { kind: 'pending' };
        break;
      case 'leased':
        phase = {
          kind: 'leased',
          token: text(row, 'token'),
          until: integer(row, 'lease_until'),
        };
        break;
      case 'completed':
        phase = {
          kind: 'completed',
          result: {
            kind: 'reflection-dry-run',
            occurrenceId: job.occurrenceId,
            sourceVersion: job.sourceVersion,
            visibility: 'private',
            sourceRead: false,
            providerCalled: false,
          },
        };
        break;
      case 'cancelled':
        phase = { kind: 'cancelled', reason: text(row, 'detail') };
        break;
      case 'dead-letter':
        phase = { kind: 'dead-letter', reason: text(row, 'detail') };
        break;
      case 'unknown':
        if (row.detail !== 'accepted' && row.detail !== 'unknown')
          throw new Error('Corrupt proactive acceptance');
        phase = { kind: 'unknown', acceptance: row.detail };
        break;
      default:
        throw new Error('Corrupt proactive phase');
    }
    return { job, runs, phase };
  }

  write(state: JobState): void {
    if (!validJob(state.job)) throw new Error('Invalid proactive job');
    const existing = this.read();
    if (existing && !sameJob(existing.job, state.job))
      throw new Error('Identity conflict');
    const { job, phase } = state;
    this.sql.exec(
      `INSERT INTO proactive_job VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(singleton) DO UPDATE SET runs = excluded.runs,
         phase = excluded.phase, token = excluded.token,
         lease_until = excluded.lease_until, detail = excluded.detail`,
      job.actorId,
      job.workspaceId,
      job.occurrenceId,
      job.dueAt,
      job.expiresAt,
      job.sourceVersion,
      job.consentVersion,
      state.runs,
      phase.kind,
      phase.kind === 'leased' ? phase.token : null,
      phase.kind === 'leased' ? phase.until : null,
      phase.kind === 'cancelled' || phase.kind === 'dead-letter'
        ? phase.reason
        : phase.kind === 'unknown'
          ? phase.acceptance
          : null
    );
  }
}

export class SqliteReviewStore implements ReviewStore {
  constructor(
    private readonly sql: SqlExecutor,
    private readonly atomic: <T>(operation: () => T) => T
  ) {
    sql.exec(
      'CREATE TABLE IF NOT EXISTS proactive_review (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), state TEXT NOT NULL)'
    );
  }
  transaction<T>(operation: () => T): T {
    return this.atomic(operation);
  }
  read(): ReviewState | null {
    const row = this.sql
      .exec('SELECT state FROM proactive_review WHERE singleton = 1')
      .toArray()[0];
    return row ? reviewStateSchema.parse(JSON.parse(text(row, 'state'))) : null;
  }
  write(state: ReviewState): void {
    const parsed = reviewStateSchema.parse(state);
    this.sql.exec(
      'INSERT INTO proactive_review VALUES (1, ?) ON CONFLICT(singleton) DO UPDATE SET state = excluded.state',
      JSON.stringify(parsed)
    );
  }
}
