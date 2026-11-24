import { describe, expect, it, vi } from 'vite-plus/test';
import { keyOf, memorySql } from './__tests__/sqlite';
import {
  createBudgetStore,
  DEFAULT_DAILY_BUDGETS,
  nextUtcMidnight,
} from './budget-store';
import type { ControlResult } from './control-entry';
import {
  type BudgetControlPort,
  CLEAR_RETRY_DELAY_MS,
  CLEAR_RETRY_LIMIT,
  createBudgetHandlers,
  createControlHandlers,
} from './control-object';
import { createFenceStore } from './fence-store';

const t0 = Date.UTC(2026, 10, 24, 10);

function control(secret: unknown = keyOf(1)) {
  const { sql, transaction } = memorySql();
  const store = createFenceStore(sql);
  const widened = vi.fn();
  const handlers = createControlHandlers({
    store,
    transaction,
    secret: () => secret,
    now: () => t0,
    onWidened: widened,
  });
  return { handlers, store, widened };
}

describe('SessionControl handlers', () => {
  it('checks the caller key inside the object before any write', () => {
    const { handlers, store } = control();
    expect(handlers.setFence(keyOf(2), 'running', 'r', 'a')).toEqual({
      ok: false,
      error: 'unauthorized',
    });
    expect(handlers.setBackground(keyOf(2), 'running', 'r', 'a')).toEqual({
      ok: false,
      error: 'unauthorized',
    });
    expect(handlers.readFence(undefined)).toEqual({
      ok: false,
      error: 'unauthorized',
    });
    expect(store.read().version).toBe(0);
  });

  it('refuses every write when its own secret is absent', () => {
    const { handlers } = control(null);
    expect(handlers.setFence(keyOf(1), 'running', 'r', 'a')).toEqual({
      ok: false,
      error: 'unauthorized',
    });
  });

  it('writes the fence and reports widening', () => {
    const { handlers, widened } = control();
    const result = handlers.setFence(keyOf(1), 'running', 'open', 'op');
    expect(result).toMatchObject({
      ok: true,
      changed: true,
      fence: { mode: 'running', version: 1 },
    });
    expect(widened).toHaveBeenCalledTimes(1);
    expect(handlers.snapshot()).toMatchObject({
      mode: 'running',
      version: 1,
      readAtMs: t0,
    });
  });

  it('answers bad_request for invalid input without a write', () => {
    const { handlers, store } = control();
    expect(handlers.setFence(keyOf(1), 'open', 'r', 'a')).toEqual({
      ok: false,
      error: 'bad_request',
    });
    expect(
      handlers.setBackground(keyOf(1), 'maybe' as never, 'r', 'a')
    ).toEqual({ ok: false, error: 'bad_request' });
    expect(handlers.addBudgetPark('nope')).toEqual({
      ok: false,
      error: 'bad_request',
    });
    expect(store.read().version).toBe(0);
  });
});

function budget(port: BudgetControlPort) {
  const { sql, transaction } = memorySql();
  const store = createBudgetStore(sql);
  let now = t0;
  let alarm: number | null = null;
  const handlers = createBudgetHandlers({
    store,
    transaction,
    budgets: () => ({ ...DEFAULT_DAILY_BUDGETS, keys: 10 }),
    now: () => now,
    control: () => port,
    getAlarm: async () => alarm,
    setAlarm: async (at) => {
      alarm = at;
    },
  });
  return {
    handlers,
    store,
    alarm: () => alarm,
    setNow: (at: number) => {
      now = at;
    },
  };
}

const okResult = { ok: true } as unknown as ControlResult;

describe('SessionBudget handlers', () => {
  it('sends one park per exhausted category and arms the midnight alarm', async () => {
    const port = {
      addBudgetPark: vi.fn(async () => okResult),
      clearBudgetParks: vi.fn(async () => okResult),
    };
    const { handlers, alarm } = budget(port);
    expect(await handlers.flush({ keys: 10 })).toEqual({
      ok: true,
      pendingParks: [],
    });
    await handlers.flush({ keys: 10 });
    expect(port.addBudgetPark).toHaveBeenCalledTimes(1);
    expect(port.addBudgetPark).toHaveBeenCalledWith('keys');
    expect(alarm()).toBe(nextUtcMidnight(t0));
  });

  it('retries an undelivered park on the next flush', async () => {
    let fail = true;
    const port = {
      addBudgetPark: vi.fn(async () => {
        if (fail) throw new Error('down');
        return okResult;
      }),
      clearBudgetParks: vi.fn(async () => okResult),
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { handlers } = budget(port);
    expect(await handlers.flush({ keys: 10 })).toEqual({
      ok: true,
      pendingParks: ['keys'],
    });
    fail = false;
    expect(await handlers.flush({ session: 1 })).toEqual({
      ok: true,
      pendingParks: [],
    });
    expect(port.addBudgetPark).toHaveBeenCalledTimes(2);
  });

  it('clears once at midnight before sending any new-day park', async () => {
    const calls: string[] = [];
    const port = {
      addBudgetPark: vi.fn(async (category: string) => {
        calls.push(`park:${category}`);
        return okResult;
      }),
      clearBudgetParks: vi.fn(async () => {
        calls.push('clear');
        return okResult;
      }),
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { handlers, setNow, alarm } = budget(port);
    await handlers.flush({ keys: 10 });
    setNow(nextUtcMidnight(t0));
    await handlers.alarm();
    await handlers.alarm();
    expect(calls).toEqual(['park:keys', 'clear']);
    expect(alarm()).toBe(nextUtcMidnight(nextUtcMidnight(t0)));
  });

  it('bounds clear retries and holds new parks until the clear lands', async () => {
    let clearUp = false;
    const port = {
      addBudgetPark: vi.fn(async () => okResult),
      clearBudgetParks: vi.fn(async () => {
        if (!clearUp) throw new Error('down');
        return okResult;
      }),
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { handlers, setNow, alarm } = budget(port);
    await handlers.flush({ keys: 10 });
    const midnight = nextUtcMidnight(t0);
    setNow(midnight);
    for (let attempt = 1; attempt < CLEAR_RETRY_LIMIT; attempt += 1) {
      await handlers.alarm();
      expect(alarm()).toBe(midnight + CLEAR_RETRY_DELAY_MS);
    }
    await handlers.alarm();
    expect(alarm()).toBe(nextUtcMidnight(midnight));
    expect(port.clearBudgetParks).toHaveBeenCalledTimes(CLEAR_RETRY_LIMIT);

    // A new-day park waits behind the undelivered clear.
    await handlers.flush({ keys: 10 });
    expect(port.addBudgetPark).toHaveBeenCalledTimes(1);
    clearUp = true;
    await handlers.flush({ session: 1 });
    expect(port.addBudgetPark).toHaveBeenCalledTimes(2);
  });

  it('answers bad_request for malformed counts', async () => {
    const port = { addBudgetPark: vi.fn(), clearBudgetParks: vi.fn() };
    const { handlers } = budget(port as unknown as BudgetControlPort);
    expect(await handlers.flush({ keys: -1 })).toEqual({
      ok: false,
      error: 'bad_request',
    });
  });

  it('never throws from the alarm', async () => {
    const port = {
      addBudgetPark: vi.fn(async () => okResult),
      clearBudgetParks: vi.fn(async () => okResult),
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { handlers, store } = budget(port);
    vi.spyOn(store, 'rollover').mockImplementation(() => {
      throw new Error('storage reset');
    });
    await expect(handlers.alarm()).resolves.toBeUndefined();
  });
});
