import { describe, expect, it } from 'vite-plus/test';
import { memorySql } from './__tests__/sqlite';
import {
  BudgetInputError,
  createBudgetStore,
  DAY_MS,
  DEFAULT_DAILY_BUDGETS,
  MAX_FLUSH_COUNT,
  nextUtcMidnight,
  parseDailyBudgets,
} from './budget-store';

const t0 = Date.UTC(2026, 10, 24, 10);
const budgets = { ...DEFAULT_DAILY_BUDGETS, keys: 10 };

function setup() {
  const { sql, transaction } = memorySql();
  return { store: createBudgetStore(sql), transaction };
}

describe('daily budgets config', () => {
  it('uses the defaults when empty and overrides named categories', () => {
    expect(parseDailyBudgets(undefined)).toEqual(DEFAULT_DAILY_BUDGETS);
    expect(parseDailyBudgets('  ')).toEqual(DEFAULT_DAILY_BUDGETS);
    expect(parseDailyBudgets('{"keys":5}')).toEqual({
      ...DEFAULT_DAILY_BUDGETS,
      keys: 5,
    });
  });

  it('rejects malformed budgets', () => {
    for (const raw of [
      '{"keys":0}',
      '{"keys":1.5}',
      '{"other":5}',
      '[1]',
      'x',
      7,
    ]) {
      expect(parseDailyBudgets(raw)).toBeNull();
    }
  });
});

describe('budget store', () => {
  it('marks one park when a category crosses its budget', () => {
    const { store } = setup();
    expect(store.flush({ keys: 9 }, t0, budgets)).toEqual([]);
    expect(store.flush({ keys: 1, session: 3 }, t0, budgets)).toEqual(['keys']);
    store.markParkSent('keys', t0);
    expect(store.pendingParks()).toEqual([]);
    // Further usage the same day never marks a second park.
    expect(store.flush({ keys: 100 }, t0 + 1_000, budgets)).toEqual([]);
  });

  it('keeps an undelivered park pending across flushes', () => {
    const { store } = setup();
    store.flush({ keys: 10 }, t0, budgets);
    expect(store.flush({ session: 1 }, t0 + 60_000, budgets)).toEqual(['keys']);
  });

  it('resets totals at the UTC rollover and marks one clear only if parked', () => {
    const { store } = setup();
    store.flush({ session: 5 }, t0, budgets);
    store.rollover(t0 + DAY_MS);
    expect(store.clearPending()).toBe(false);

    store.flush({ keys: 10 }, t0 + DAY_MS, budgets);
    store.markParkSent('keys', t0 + DAY_MS);
    store.rollover(t0 + 2 * DAY_MS);
    expect(store.clearPending()).toBe(true);
    expect(
      store.totals().every((row) => row.total === 0 && row.parked === 0)
    ).toBe(true);
    store.markClearSent();
    expect(store.clearPending()).toBe(false);
  });

  it('validates flush counts before writing anything', () => {
    const { store } = setup();
    for (const counts of [
      null,
      [],
      { other: 1 },
      { keys: -1 },
      { keys: 1.5 },
      { keys: MAX_FLUSH_COUNT + 1 },
      { keys: '1' },
    ]) {
      expect(() => store.flush(counts, t0, budgets)).toThrow(BudgetInputError);
    }
    expect(store.totals()).toEqual([]);
  });

  it('counts failed clears until delivery resets them', () => {
    const { store } = setup();
    expect(store.recordClearFailure()).toBe(1);
    expect(store.recordClearFailure()).toBe(2);
    store.markClearSent();
    expect(store.recordClearFailure()).toBe(1);
  });

  it('computes the next UTC midnight', () => {
    expect(nextUtcMidnight(t0)).toBe(Date.UTC(2026, 10, 25));
    expect(nextUtcMidnight(Date.UTC(2026, 10, 25))).toBe(
      Date.UTC(2026, 10, 26)
    );
  });

  it('gives each UTC day a fresh clear retry allowance', () => {
    const { store } = setup();
    store.flush({ session: 1 }, t0, budgets);
    for (let attempt = 0; attempt < 5; attempt += 1) store.recordClearFailure();
    store.rollover(t0 + DAY_MS);
    expect(store.recordClearFailure()).toBe(1);
  });
});
