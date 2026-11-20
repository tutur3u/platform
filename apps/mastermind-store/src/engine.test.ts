import { DatabaseSync } from 'node:sqlite';
import {
  MASTERMIND_STORE_LIMITS,
  type ParsedStoreOp,
} from '@tuturuuu/utils/mastermind-store/protocol';
import { describe, expect, it } from 'vite-plus/test';
import { createEngine, type SqlLike, StoreError } from './engine';

const NOW = Date.UTC(2026, 10, 20, 5, 0, 0);
const TTL = 60_000;

function setup() {
  const db = new DatabaseSync(':memory:');
  const sql: SqlLike = {
    exec(query, ...bindings) {
      const statement = db.prepare(query);
      return { toArray: () => statement.all(...bindings) as never };
    },
  };
  const engine = createEngine(sql);
  engine.ensureSchema();
  // Mirrors the Durable Object: each run is one transaction.
  const run = (ops: ParsedStoreOp[], now = NOW, budget = 1000) => {
    db.exec('BEGIN');
    try {
      const result = engine.run(ops, now, budget);
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  const rowCount = () =>
    Number(
      (db.prepare('SELECT count(*) AS n FROM kv').get() as { n: number }).n
    );
  return { engine, run, rowCount, db };
}

const set = (k: string, v: string, mode: 'always' | 'nx' = 'always') =>
  ({ op: 'set', k, v, ttlMs: TTL, mode }) as const;

describe('store engine', () => {
  it('sets, gets, expires and reads several keys', () => {
    const { run } = setup();
    expect(run([set('a', '1'), set('b', '2')])).toEqual([true, true]);
    expect(run([{ op: 'mget', ks: ['a', 'b', 'c'] }])).toEqual([
      ['1', '2', null],
    ]);
    expect(run([{ op: 'get', k: 'a' }], NOW + TTL)).toEqual([null]);
  });

  it('nx writes only when absent or expired', () => {
    const { run } = setup();
    expect(run([set('n', 'x', 'nx')])).toEqual([true]);
    expect(run([set('n', 'y', 'nx')])).toEqual([false]);
    expect(run([set('n', 'z', 'nx')], NOW + TTL + 1)).toEqual([true]);
  });

  it('compare-and-set and compare-and-delete match exact values', () => {
    const { run } = setup();
    const cas = (expect: string | null, v: string) =>
      ({ op: 'cas', k: 'c', expect, v, ttlMs: TTL }) as const;
    expect(run([cas(null, 'r1')])).toEqual([true]);
    expect(run([cas(null, 'r2')])).toEqual([false]);
    expect(run([cas('r1', 'r2')])).toEqual([true]);
    expect(run([{ op: 'cad', k: 'c', expect: 'r1' }])).toEqual([false]);
    expect(run([{ op: 'cad', k: 'c', expect: 'r2' }])).toEqual([true]);
    expect(run([{ op: 'del', k: 'c' }])).toEqual([false]);
  });

  it('charges the daily write budget durably and resets each UTC day', () => {
    const { run, engine } = setup();
    run([set('a', '1'), set('b', '2')], NOW, 3);
    expect(() => run([set('c', '3'), set('d', '4')], NOW, 3)).toThrow(
      new StoreError('budget')
    );
    // Reads are not charged, and a refused batch charged nothing.
    expect(run([{ op: 'get', k: 'a' }], NOW, 3)).toEqual(['1']);
    expect(run([set('c', '3')], NOW, 3)).toEqual([true]);
    expect(engine.status(NOW, 3).writes).toBe(3);
    expect(run([set('e', '5')], NOW + 86_400_000, 3)).toEqual([true]);
  });

  it('refuses everything once the stop fence is set, until it is cleared', () => {
    const { run, engine } = setup();
    engine.setStopped(true);
    expect(() => run([{ op: 'get', k: 'a' }])).toThrow(
      new StoreError('stopped')
    );
    expect(() => run([set('a', '1')])).toThrow(new StoreError('stopped'));
    engine.setStopped(false);
    expect(run([set('a', '1')])).toEqual([true]);
  });

  it('caps live rows and rolls the whole batch back', () => {
    const { run, rowCount, db } = setup();
    const insert = db.prepare('INSERT INTO kv (k, v, exp) VALUES (?, ?, ?)');
    for (let i = 0; i < MASTERMIND_STORE_LIMITS.maxRows; i++)
      insert.run(`k${i}`, 'v', NOW + TTL);
    expect(() => run([set('k0', 'updated'), set('new', 'v')])).toThrow(
      new StoreError('full')
    );
    expect(run([{ op: 'get', k: 'k0' }])).toEqual(['v']);
    expect(rowCount()).toBe(MASTERMIND_STORE_LIMITS.maxRows);
    // Overwriting an existing key is still allowed at the cap.
    expect(run([set('k1', 'updated')])).toEqual([true]);
  });

  it('removes a bounded number of expired rows per write, never more', () => {
    const { run, rowCount, db } = setup();
    const insert = db.prepare('INSERT INTO kv (k, v, exp) VALUES (?, ?, ?)');
    for (let i = 0; i < 50; i++) insert.run(`old${i}`, 'v', NOW - 1);
    run([{ op: 'get', k: 'old1' }]);
    expect(rowCount()).toBe(50);
    run([set('fresh', 'v')]);
    expect(rowCount()).toBe(50 - MASTERMIND_STORE_LIMITS.cleanupPerWrite + 1);
  });
});
