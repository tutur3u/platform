import { DurableObject } from 'cloudflare:workers';
import type {
  AbuseGuardFamily,
  GuardResult,
  ParsedGuardCommand,
} from '@tuturuuu/utils/abuse-guard/protocol';
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
      this.engine.setAlarmFailures(0);
      if (plan.idle) {
        await this.ctx.storage.deleteAlarm();
        return;
      }
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

export type FamilyUsage = {
  used: number;
  budget: number;
  warned: boolean;
  /** Budget stop for this family only; other families keep serving. */
  stopped: boolean;
};

export type ControlState = {
  /** Operator stop: every family fails closed. */
  stopped: boolean;
  day: string;
  families: Partial<Record<AbuseGuardFamily, FamilyUsage>>;
  changedAt: number;
};

/** Share of the daily budget that emits the warning. */
export const BUDGET_WARNING_RATIO = 0.8;

function utcDay(now: number) {
  return new Date(now).toISOString().slice(0, 10);
}

/** Whether a family may run: neither the operator nor its budget stopped it. */
export function familyOpen(state: ControlState, family: AbuseGuardFamily) {
  return !state.stopped && !state.families[family]?.stopped;
}

/**
 * Durable stop fence and per-family daily operation budgets. Budgets are per
 * family so exhausting one (for example unauthenticated offline traffic)
 * cannot stop the others. A stop persists until an operator resumes,
 * including a budget stop on a new day.
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

  private load(now: number): ControlState {
    const [row] = this.ctx.storage.sql
      .exec('SELECT state FROM control WHERE id = 1')
      .toArray();
    const state: ControlState = row
      ? (JSON.parse(String(row.state)) as ControlState)
      : { stopped: false, day: utcDay(now), families: {}, changedAt: now };
    if (state.day !== utcDay(now)) {
      state.day = utcDay(now);
      for (const usage of Object.values(state.families)) {
        if (!usage) continue;
        usage.used = 0;
        usage.warned = false;
      }
    }
    return state;
  }

  private save(state: ControlState) {
    this.ctx.storage.sql
      .exec(
        'INSERT INTO control (id, state) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET state = excluded.state',
        JSON.stringify(state)
      )
      .toArray();
  }

  /** Records a family's admitted operations and returns the fence state. */
  async report(
    family: AbuseGuardFamily,
    delta: number,
    budget: number
  ): Promise<ControlState> {
    const now = Date.now();
    const state = this.load(now);
    const usage = state.families[family] ?? {
      used: 0,
      budget,
      warned: false,
      stopped: false,
    };
    state.families[family] = usage;
    usage.budget = budget;
    // A stopped fence admits nothing, so nothing it rejects is billed.
    if (familyOpen(state, family)) {
      usage.used += Math.max(0, Math.trunc(delta));
    }
    if (!usage.warned && usage.used >= budget * BUDGET_WARNING_RATIO) {
      usage.warned = true;
      console.warn(
        `[abuse-guard] ${family} daily operation budget at ${usage.used}/${budget}`
      );
    }
    // `used` counts only admitted operations, so stopping at the budget
    // admits exactly `budget` commands per family per day.
    if (!usage.stopped && usage.used >= budget) {
      usage.stopped = true;
      state.changedAt = now;
      console.error(
        `[abuse-guard] ${family} daily operation budget exhausted (${usage.used}/${budget}); family stopped`
      );
    }
    this.save(state);
    return state;
  }

  /** Operator stop or resume. Resume also clears every family budget stop. */
  async setStopped(stopped: boolean): Promise<ControlState> {
    const now = Date.now();
    const state = this.load(now);
    state.stopped = stopped;
    state.changedAt = now;
    if (!stopped) {
      // Resuming starts a fresh allowance for the day.
      for (const usage of Object.values(state.families)) {
        if (!usage) continue;
        usage.used = 0;
        usage.warned = false;
        usage.stopped = false;
      }
    }
    this.save(state);
    return state;
  }

  async read(): Promise<ControlState> {
    return this.load(Date.now());
  }
}
