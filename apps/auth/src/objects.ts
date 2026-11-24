import { DurableObject } from 'cloudflare:workers';
import type {
  AccountingCategory,
  BackgroundState,
} from '@tuturuuu/session/control';
import {
  createBudgetStore,
  DEFAULT_DAILY_BUDGETS,
  parseDailyBudgets,
} from './budget-store';
import type { ControlResult } from './control-entry';
import {
  type BudgetControlPort,
  createBudgetHandlers,
  createControlHandlers,
  type Transaction,
} from './control-object';
import { createFenceStore } from './fence-store';
import type { Env } from './worker';

function transactionOf(ctx: DurableObjectState): Transaction {
  return (run) => ctx.storage.transactionSync(run);
}

/**
 * `control:<env>`: the stop-fence record, its version, the background switch,
 * budget parks and the fence log. Operator writes need the control caller
 * key, checked here as well as at `ControlEntry`.
 */
export class SessionControl extends DurableObject<Env> {
  private readonly handlers;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.handlers = createControlHandlers({
      store: createFenceStore(ctx.storage.sql),
      transaction: transactionOf(ctx),
      secret: () => this.env.TTR_SESSION_ENTRY_CONTROL_KEY,
      now: () => Date.now(),
      onWidened: (change) => {
        // ParkedWork resume lands with sub-slice 4b; nothing parks before it.
        console.info('[auth] fence widened', change.record.version);
      },
    });
  }

  async readFence(key: string): Promise<ControlResult> {
    return this.handlers.readFence(key);
  }

  async setFence(key: string, mode: unknown, reason: unknown, actor: unknown) {
    return this.handlers.setFence(key, mode, reason, actor);
  }

  async setBackground(
    key: string,
    background: BackgroundState,
    reason: unknown,
    actor: unknown
  ) {
    return this.handlers.setBackground(key, background, reason, actor);
  }

  async snapshot() {
    return this.handlers.snapshot();
  }

  async addBudgetPark(category: AccountingCategory) {
    return this.handlers.addBudgetPark(category);
  }

  async clearBudgetParks() {
    return this.handlers.clearBudgetParks();
  }
}

/** `budget:<env>`: per-category daily operation totals and budget parks. */
export class SessionBudget extends DurableObject<Env> {
  private readonly handlers;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    let invalidLogged = false;
    this.handlers = createBudgetHandlers({
      store: createBudgetStore(ctx.storage.sql),
      transaction: transactionOf(ctx),
      budgets: () => {
        const parsed = parseDailyBudgets(this.env.TTR_SESSION_DAILY_BUDGETS);
        if (parsed) return parsed;
        if (!invalidLogged) {
          invalidLogged = true;
          console.error(
            '[auth] TTR_SESSION_DAILY_BUDGETS is malformed; using defaults'
          );
        }
        return DEFAULT_DAILY_BUDGETS;
      },
      now: () => Date.now(),
      control: () => controlStub(this.env) as unknown as BudgetControlPort,
      getAlarm: () => ctx.storage.getAlarm(),
      setAlarm: (atMs) => ctx.storage.setAlarm(atMs),
    });
  }

  async flush(counts: unknown) {
    return this.handlers.flush(counts);
  }

  async alarm() {
    await this.handlers.alarm();
  }
}

export function sessionEnvironmentName(env: Env): string | null {
  const value = env.TTR_SESSION_ENV;
  return value === 'production' || value === 'staging' || value === 'local'
    ? value
    : null;
}

export function controlStub(env: Env) {
  const name = sessionEnvironmentName(env);
  if (!name) throw new Error('TTR_SESSION_ENV is not set');
  return env.SESSION_CONTROL.get(
    env.SESSION_CONTROL.idFromName(`control:${name}`)
  );
}

export function budgetStub(env: Env) {
  const name = sessionEnvironmentName(env);
  if (!name) throw new Error('TTR_SESSION_ENV is not set');
  return env.SESSION_BUDGET.get(
    env.SESSION_BUDGET.idFromName(`budget:${name}`)
  );
}
