import { describe, expect, it } from 'vite-plus/test';
import { memorySql } from './__tests__/sqlite';
import {
  createFenceStore,
  FENCE_LOG_LIMIT,
  FenceInputError,
} from './fence-store';

function setup() {
  const { db, sql, transaction } = memorySql();
  const store = createFenceStore(sql);
  return { db, sql, store, transaction };
}

const operator = { reason: 'incident 42', actor: 'operator@example.test' };

describe('fence store', () => {
  it('reads a never-written fence as stopped and parked at version 0', () => {
    const { store } = setup();
    expect(store.read()).toMatchObject({
      mode: 'stopped',
      version: 0,
      background: 'parked',
      budgetParks: [],
    });
    expect(store.snapshot(1_000)).toEqual({
      mode: 'stopped',
      version: 0,
      readAtMs: 1_000,
      background: 'parked',
      budgetParks: [],
    });
  });

  it('bumps the version by one per change and logs each change', () => {
    const { store } = setup();
    const opened = store.setFence({ mode: 'running', ...operator, nowMs: 10 });
    expect(opened).toMatchObject({ changed: true, widened: true });
    expect(opened.record).toMatchObject({ mode: 'running', version: 1 });
    const stopped = store.setFence({
      mode: 'issuance_stopped',
      ...operator,
      nowMs: 20,
    });
    expect(stopped).toMatchObject({ changed: true, widened: false });
    expect(stopped.record.version).toBe(2);
    expect(store.log(10).map((row) => row.version)).toEqual([2, 1]);
  });

  it('treats setting the current mode as no change', () => {
    const { store } = setup();
    store.setFence({ mode: 'running', ...operator, nowMs: 10 });
    const again = store.setFence({ mode: 'running', ...operator, nowMs: 20 });
    expect(again).toMatchObject({ changed: false, widened: false });
    expect(store.read().version).toBe(1);
    expect(store.log(10)).toHaveLength(1);
  });

  it('rejects an unknown mode and bounds reason and actor', () => {
    const { store } = setup();
    expect(() =>
      store.setFence({ mode: 'open', ...operator, nowMs: 1 })
    ).toThrow(FenceInputError);
    expect(() =>
      store.setFence({ mode: 'running', reason: ' ', actor: 'a', nowMs: 1 })
    ).toThrow(FenceInputError);
    expect(() =>
      store.setFence({
        mode: 'running',
        reason: 'x'.repeat(501),
        actor: 'a',
        nowMs: 1,
      })
    ).toThrow(FenceInputError);
    expect(() =>
      store.setFence({ mode: 'running', reason: 'r', actor: 7, nowMs: 1 })
    ).toThrow(FenceInputError);
    expect(store.read().version).toBe(0);
  });

  it('parks and resumes background work as separate versions', () => {
    const { store } = setup();
    store.setFence({ mode: 'running', ...operator, nowMs: 1 });
    expect(
      store.setBackground({ background: 'running', ...operator, nowMs: 2 })
    ).toMatchObject({
      changed: true,
      widened: true,
    });
    expect(
      store.setBackground({ background: 'parked', ...operator, nowMs: 3 })
    ).toMatchObject({
      changed: true,
      widened: false,
    });
    expect(store.read()).toMatchObject({
      mode: 'running',
      background: 'parked',
      version: 3,
    });
  });

  it('adds each budget park once and clears them together', () => {
    const { store } = setup();
    expect(store.addBudgetPark('keys', 1).changed).toBe(true);
    expect(store.addBudgetPark('keys', 2).changed).toBe(false);
    expect(store.addBudgetPark('control', 3).record.budgetParks).toEqual([
      'control',
      'keys',
    ]);
    expect(() => store.addBudgetPark('everything', 4)).toThrow(FenceInputError);
    const cleared = store.clearBudgetParks(5);
    expect(cleared).toMatchObject({ changed: true, widened: true });
    expect(cleared.record.budgetParks).toEqual([]);
    expect(store.clearBudgetParks(6).changed).toBe(false);
    // Budget parks never change the mode.
    expect(store.read().mode).toBe('stopped');
  });

  it('keeps only the newest fence log entries', () => {
    const { store, transaction } = setup();
    for (let index = 0; index < FENCE_LOG_LIMIT + 5; index += 1) {
      transaction(() =>
        store.setFence({
          mode: index % 2 === 0 ? 'running' : 'stopped',
          ...operator,
          nowMs: index,
        })
      );
    }
    const log = store.log(FENCE_LOG_LIMIT + 50);
    expect(log).toHaveLength(FENCE_LOG_LIMIT);
    expect(log[0]?.version).toBe(FENCE_LOG_LIMIT + 5);
    expect(log.at(-1)?.version).toBe(6);
  });

  it('rolls a failed write back with its transaction', () => {
    const { store, transaction } = setup();
    expect(() =>
      transaction(() => {
        store.setFence({ mode: 'running', ...operator, nowMs: 1 });
        throw new Error('boom');
      })
    ).toThrow('boom');
    expect(store.read().version).toBe(0);
    expect(store.log(10)).toHaveLength(0);
  });

  it('reads corrupt stored values as the strictest state', () => {
    const { db, store } = setup();
    store.setFence({ mode: 'running', ...operator, nowMs: 1 });
    db.exec(
      "UPDATE fence SET mode = 'open', background = 'x', budget_parks = 'nope'"
    );
    expect(store.read()).toMatchObject({
      mode: 'stopped',
      background: 'parked',
      budgetParks: [
        'control',
        'abuse',
        'epoch',
        'index',
        'session',
        'credential',
        'keys',
      ],
    });
  });

  it('repairs a corrupt row on an explicit write of its fallback value', () => {
    const { db, store } = setup();
    store.setFence({ mode: 'running', ...operator, nowMs: 1 });
    db.exec("UPDATE fence SET mode = 'open'");
    const repaired = store.setFence({ mode: 'stopped', ...operator, nowMs: 2 });
    expect(repaired).toMatchObject({
      changed: true,
      record: { mode: 'stopped', version: 2 },
    });
    expect(store.log(1)[0]).toMatchObject({ version: 2, mode: 'stopped' });
    // The repaired row is clean, so the same write is a no-op again.
    expect(
      store.setFence({ mode: 'stopped', ...operator, nowMs: 3 }).changed
    ).toBe(false);
  });
});
