import { DurableObject } from 'cloudflare:workers';
import type {
  AbuseGuardFamily,
  GuardResult,
  ParsedGuardCommand,
} from '@tuturuuu/utils/abuse-guard/protocol';
import {
  type ControlState,
  createControlState,
  familyOpen,
  recordUsage,
  rollover,
  setOperatorStop,
} from './control-state';
import {
  ALARM_PURGE_LIMIT,
  createGuardEngine,
  GuardCommandError,
  type GuardEngine,
  type GuardOperation,
  planCleanup,
  planCleanupRetry,
  shouldRearm,
} from './engine';

export type SubjectRunResult =
  | { ok: true; results: GuardResult[] }
  | { ok: false; error: 'bad_request' };

/**
 * One guard partition. Single-threaded, so each `run` is atomic across every
 * key it touches. Storage is losable rate-limit state with bounded TTLs.
 */
export class GuardSubject extends DurableObject {
  private readonly engine: GuardEngine;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    this.engine = createGuardEngine(ctx.storage.sql);
  }

  async run(
    cmds: ParsedGuardCommand[],
    operation?: GuardOperation
  ): Promise<SubjectRunResult> {
    const now = Date.now();
    // Recreate a wiped schema outside the transaction, so a failing step
    // cannot roll the tables back while the engine believes they exist.
    this.engine.ensureSchema();
    let results: GuardResult[];
    try {
      results = this.ctx.storage.transactionSync(() =>
        this.engine.run(cmds, now, operation)
      );
    } catch (error) {
      if (error instanceof GuardCommandError) {
        return { ok: false, error: 'bad_request' };
      }
      throw error;
    }
    const maxExpiry = this.engine.maxExpiry();
    if (shouldRearm(await this.ctx.storage.getAlarm(), maxExpiry)) {
      await this.ctx.storage.setAlarm((maxExpiry ?? now) + 1000);
    }
    return { ok: true, results };
  }

  /**
   * Bounded cleanup with no network or fan-out. Errors are not thrown (the
   * runtime's automatic alarm retries would be unbounded); a failed pass
   * re-arms with capped backoff and stops after ALARM_FAILURE_LIMIT attempts
   * until the next write. Reads stay correct through lazy expiry meanwhile.
   */
  async alarm() {
    await this.runCleanup();
  }

  /**
   * The alarm body. Exposed only through this object's stub, which no route
   * hands out; tests call it because `alarm` is reserved over RPC.
   */
  async runCleanup() {
    const now = Date.now();
    try {
      const purged = this.ctx.storage.transactionSync(() =>
        this.engine.purgeExpired(now, ALARM_PURGE_LIMIT)
      );
      const plan = planCleanup({
        now,
        purged,
        rowCount: this.engine.rowCount(),
        maxExpiry: this.engine.maxExpiry(),
      });
      if (plan.idle) {
        // Wipe the object, including its alarm and tables, so an emptied
        // partition stores nothing. No abort(): throwing from an alarm would
        // trigger the runtime's retries. The engine recreates its schema
        // lazily if this warm instance is used again.
        this.engine.markStorageCleared();
        await this.ctx.storage.deleteAll();
        return;
      }
      this.engine.setAlarmFailures(0);
      await this.ctx.storage.setAlarm(plan.nextAlarmAt);
    } catch (error) {
      console.error('[abuse-guard] subject cleanup failed', error);
      try {
        const failures = this.engine.alarmFailures() + 1;
        this.engine.setAlarmFailures(failures);
        const retryAt = planCleanupRetry(now, failures);
        if (retryAt !== null) await this.ctx.storage.setAlarm(retryAt);
      } catch (retryError) {
        console.error('[abuse-guard] cleanup retry not scheduled', retryError);
      }
    }
  }
}

export { type ControlState, familyOpen } from './control-state';

/**
 * Durable stop fence and per-family daily operation budgets. Budgets are per
 * family so exhausting one (for example unauthenticated offline traffic)
 * cannot stop the others; a family budget stop clears at the next UTC day.
 * The operator stop persists until an operator resumes.
 */
export class GuardControl extends DurableObject {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    ctx.storage.sql
      .exec(
        'CREATE TABLE IF NOT EXISTS control (id INTEGER PRIMARY KEY CHECK (id = 1), state TEXT NOT NULL)'
      )
      .toArray();
  }

  private load(now: number): { state: ControlState; changed: boolean } {
    const [row] = this.ctx.storage.sql
      .exec('SELECT state FROM control WHERE id = 1')
      .toArray();
    const state = row
      ? (JSON.parse(String(row.state)) as ControlState)
      : createControlState(now);
    return { state, changed: !row || rollover(state, now) };
  }

  private save(state: ControlState) {
    this.ctx.storage.sql
      .exec(
        'INSERT INTO control (id, state) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET state = excluded.state',
        JSON.stringify(state)
      )
      .toArray();
  }

  /** Commit the entire allowance before any subject operation can run. */
  async reserve(
    family: AbuseGuardFamily,
    ops: number,
    budget: number
  ): Promise<'open' | 'stopped'> {
    return this.ctx.storage.transactionSync(() => {
      const now = Date.now();
      const { state, changed } = this.load(now);
      if (
        !Number.isSafeInteger(ops) ||
        ops < 1 ||
        !familyOpen(state, family) ||
        (state.families[family]?.used ?? 0) + ops > budget
      ) {
        if (changed) this.save(state);
        return 'stopped';
      }
      recordUsage(state, family, ops, budget, now);
      this.save(state);
      return 'open';
    });
  }

  /** Records a family's admitted operations and returns the fence state. */
  async report(
    family: AbuseGuardFamily,
    delta: number,
    budget: number
  ): Promise<ControlState> {
    const now = Date.now();
    const { state, changed } = this.load(now);
    // A zero-delta refresh with no flag change is a pure read: no row write.
    if (recordUsage(state, family, delta, budget, now) || changed) {
      this.save(state);
    }
    return state;
  }

  /** Operator stop or resume. Resume also clears every family budget stop. */
  async setStopped(stopped: boolean): Promise<ControlState> {
    const now = Date.now();
    const { state } = this.load(now);
    setOperatorStop(state, stopped, now);
    this.save(state);
    return state;
  }

  async read(): Promise<ControlState> {
    return this.load(Date.now()).state;
  }
}
