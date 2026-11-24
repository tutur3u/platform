/**
 * The bodies of the `SessionControl` and `SessionBudget` Durable Objects,
 * runtime-free so unit tests drive them over `node:sqlite`. `objects.ts`
 * supplies storage, the transaction, the clock, the alarm and the stub.
 */
import type {
  AccountingCategory,
  BackgroundState,
  FenceSnapshot,
} from '@tuturuuu/session/control';
import {
  BudgetInputError,
  type BudgetStore,
  type DailyBudgets,
  nextUtcMidnight,
} from './budget-store';
import { checkCallerKey, parseCallerKeySecret } from './caller-key';
import { type ControlResult, UNAUTHORIZED, UNAVAILABLE } from './control-entry';
import {
  type FenceChange,
  FenceInputError,
  type FenceStore,
} from './fence-store';

export type Transaction = <T>(run: () => T) => T;

const BAD_REQUEST: ControlResult = Object.freeze({
  ok: false,
  error: 'bad_request',
});

export function createControlHandlers(input: {
  store: FenceStore;
  transaction: Transaction;
  secret: () => unknown;
  now: () => number;
  /** Background work became runnable; `ParkedWork` resume hooks in here. */
  onWidened?: (change: FenceChange) => void;
}) {
  const authorized = (key: unknown) =>
    checkCallerKey(parseCallerKeySecret(input.secret()), key).ok;

  const apply = (run: () => FenceChange): ControlResult => {
    let change: FenceChange;
    try {
      change = input.transaction(run);
    } catch (error) {
      if (error instanceof FenceInputError) return BAD_REQUEST;
      console.error('[auth] SessionControl write failed', error);
      return UNAVAILABLE;
    }
    if (change.widened) input.onWidened?.(change);
    return Object.freeze({
      ok: true,
      fence: change.record,
      changed: change.changed,
    });
  };

  return Object.freeze({
    readFence(key: unknown): ControlResult {
      if (!authorized(key)) return UNAUTHORIZED;
      return Object.freeze({
        ok: true,
        fence: input.store.read(),
        changed: false,
      });
    },

    setFence(key: unknown, mode: unknown, reason: unknown, actor: unknown) {
      if (!authorized(key)) return UNAUTHORIZED;
      return apply(() =>
        input.store.setFence({ mode, reason, actor, nowMs: input.now() })
      );
    },

    setBackground(
      key: unknown,
      background: BackgroundState,
      reason: unknown,
      actor: unknown
    ) {
      if (!authorized(key)) return UNAUTHORIZED;
      if (background !== 'running' && background !== 'parked')
        return BAD_REQUEST;
      return apply(() =>
        input.store.setBackground({
          background,
          reason,
          actor,
          nowMs: input.now(),
        })
      );
    },

    /** Isolate fence reads. Reveals only the fence state. */
    snapshot(): FenceSnapshot {
      return input.store.snapshot(input.now());
    },

    addBudgetPark(category: unknown): ControlResult {
      return apply(() => input.store.addBudgetPark(category, input.now()));
    },

    clearBudgetParks(): ControlResult {
      return apply(() => input.store.clearBudgetParks(input.now()));
    },
  });
}

/** What `SessionBudget` needs from `SessionControl`. */
export interface BudgetControlPort {
  addBudgetPark(category: AccountingCategory): Promise<ControlResult>;
  clearBudgetParks(): Promise<ControlResult>;
}

/** Consecutive failed clears before the alarm stops retrying until midnight. */
export const CLEAR_RETRY_LIMIT = 5;
export const CLEAR_RETRY_DELAY_MS = 60_000;

export type FlushResult =
  | Readonly<{ ok: true; pendingParks: readonly AccountingCategory[] }>
  | Readonly<{ ok: false; error: 'bad_request' | 'unavailable' }>;

export function createBudgetHandlers(input: {
  store: BudgetStore;
  transaction: Transaction;
  budgets: () => DailyBudgets;
  now: () => number;
  control: () => BudgetControlPort;
  getAlarm: () => Promise<number | null>;
  setAlarm: (atMs: number) => Promise<void>;
}) {
  const call = async (run: () => Promise<ControlResult>) => {
    try {
      return (await run()).ok;
    } catch (error) {
      console.error('[auth] SessionBudget control call failed', error);
      return false;
    }
  };

  /**
   * Delivers the pending clear first, then pending parks. While a clear is
   * undelivered no park is sent, so a late clear never wipes a new day's
   * park. At most one clear and one call per category per invocation.
   */
  const deliver = async (): Promise<boolean> => {
    if (input.store.clearPending()) {
      if (!(await call(() => input.control().clearBudgetParks()))) return false;
      input.transaction(() => input.store.markClearSent());
    }
    for (const category of input.store.pendingParks()) {
      if (await call(() => input.control().addBudgetPark(category))) {
        input.transaction(() =>
          input.store.markParkSent(category, input.now())
        );
        console.warn('[auth] session budget exhausted', category);
      }
    }
    return true;
  };

  const armMidnight = async () => {
    const midnight = nextUtcMidnight(input.now());
    const current = await input.getAlarm();
    if (current === null || current > midnight) await input.setAlarm(midnight);
  };

  return Object.freeze({
    async flush(counts: unknown): Promise<FlushResult> {
      let pending: readonly AccountingCategory[];
      try {
        pending = input.transaction(() =>
          input.store.flush(counts, input.now(), input.budgets())
        );
      } catch (error) {
        if (error instanceof BudgetInputError) {
          return { ok: false, error: 'bad_request' };
        }
        console.error('[auth] SessionBudget flush failed', error);
        return { ok: false, error: 'unavailable' };
      }
      if (pending.length > 0 || input.store.clearPending()) await deliver();
      await armMidnight();
      return { ok: true, pendingParks: input.store.pendingParks() };
    },

    /** The alarm body. Never throws, so runtime alarm retries never stack. */
    async alarm(): Promise<void> {
      try {
        input.transaction(() => input.store.rollover(input.now()));
        const delivered = await deliver();
        if (!delivered) {
          const failures = input.transaction(() =>
            input.store.recordClearFailure()
          );
          if (failures < CLEAR_RETRY_LIMIT) {
            await input.setAlarm(input.now() + CLEAR_RETRY_DELAY_MS);
            return;
          }
          console.error('[auth] session budget clear undelivered', failures);
        }
        await input.setAlarm(nextUtcMidnight(input.now()));
      } catch (error) {
        console.error('[auth] SessionBudget alarm failed', error);
      }
    },
  });
}
