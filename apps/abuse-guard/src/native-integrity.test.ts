import { DatabaseSync } from 'node:sqlite';
import type { ParsedGuardCommand } from '@tuturuuu/utils/abuse-guard/protocol';
import { describe, expect, it } from 'vite-plus/test';
import { createGuardEngine, type SqlRunner } from './engine';

type Operation = Extract<ParsedGuardCommand, { op: 'integrity.atomic' }>;
const day = 86_400_000;

function setup() {
  const db = new DatabaseSync(':memory:');
  const sql: SqlRunner = {
    exec(query, ...args) {
      const bindings = args.map((value) =>
        value instanceof ArrayBuffer ? new Uint8Array(value) : value
      );
      return {
        toArray: () => db.prepare(query).all(...bindings) as never,
      };
    },
  };
  const engine = createGuardEngine(sql);
  const run = (now: number, ...commands: ParsedGuardCommand[]) => {
    db.exec('BEGIN');
    try {
      const results = engine.run(commands, now);
      db.exec('COMMIT');
      return results;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  const apply = (command: Operation['command'], keys: string[], now = 1000) => {
    const [result] = run(now, { op: 'integrity.atomic', command, keys });
    if (result?.op !== 'integrity.atomic') throw new Error('Missing result');
    return result.value;
  };
  return { apply, run };
}

describe('SQLite native integrity atomic operations', () => {
  it('issues at most one nonce per key and consumes it once', () => {
    const { apply } = setup();
    const issue = {
      action: 'issue',
      limit: 2,
      windowSeconds: 60,
      ttlMs: 1000,
      value: 'challenge fixture',
    } as const;
    expect(apply(issue, ['minute', 'hour', 'nonce'])).toBe(true);
    expect(apply(issue, ['minute', 'hour', 'nonce'])).toBe(false);
    expect(apply(issue, ['minute', 'hour', 'next'])).toBe(false);
    expect(apply({ action: 'consume' }, ['nonce'], 1500)).toBe(issue.value);
    expect(apply({ action: 'consume' }, ['nonce'], 1500)).toBeNull();
    expect(apply(issue, ['minute', 'hour', 'next'], 61_000)).toBe(true);
    expect(apply({ action: 'consume' }, ['next'], 62_001)).toBeNull();
  });

  it('retains account-wide key ownership and compares counters without extending expiry', () => {
    const { apply, run } = setup();
    const register = { action: 'register', value: '{"counter":0}' } as const;
    const keys = ['device', 'index-a', 'owner-device', 'actor-a'];
    expect(apply(register, keys)).toBe(true);
    expect(apply(register, keys)).toBe(false);
    expect(
      apply(register, ['device-other', 'index-b', 'owner-device', 'actor-b'])
    ).toBe(false);
    expect(apply({ action: 'advance', expected: 0, next: 5 }, ['device'])).toBe(
      true
    );
    expect(apply({ action: 'advance', expected: 0, next: 6 }, ['device'])).toBe(
      false
    );
    const [ttl] = run(7000, { op: 'kv.ttl', k: 'device' });
    expect(ttl).toEqual({ op: 'kv.ttl', ttlMs: 90 * day - 6000 });
    expect(apply({ action: 'mark-play' }, ['play-a'])).toBe(true);
    expect(apply({ action: 'revoke' }, ['index-a', 'play-a', 'actor-a'])).toBe(
      2
    );
    expect(apply({ action: 'capability' }, ['index-a', 'play-a'])).toBe(false);
    expect(
      apply(register, ['device-other', 'index-b', 'owner-device', 'actor-b'])
    ).toBe(true);
  });

  it('admits eight active enrollments and frees capacity after expiry', () => {
    const { apply } = setup();
    const register = { action: 'register', value: '{"counter":0}' } as const;
    for (let i = 0; i < 8; i += 1) {
      expect(
        apply(register, [`key-${i}`, 'index', `owner-${i}`, 'actor'])
      ).toBe(true);
    }
    expect(apply(register, ['ninth', 'index', 'owner-ninth', 'actor'])).toBe(
      false
    );
    expect(
      apply({ action: 'capability' }, ['index', 'play'], 1000 + 90 * day)
    ).toBe(false);
    expect(
      apply(
        register,
        ['ninth', 'index', 'owner-ninth', 'actor'],
        1000 + 90 * day
      )
    ).toBe(true);
  });

  it('enforces global and per-actor provider limits, alerts once, and honors a persistent stop', () => {
    const { apply, run } = setup();
    const reserve = {
      action: 'reserve-provider',
      limit: 3,
      actorLimit: 2,
      warningAt: 2,
      ttlSeconds: 86_460,
    } as const;
    const keys = ['stop', 'day', 'actor-a', 'warning'];
    expect(apply(reserve, keys)).toEqual({
      reserved: true,
      used: 1,
      actor: 1,
      warning: false,
    });
    expect(apply(reserve, keys)).toEqual({
      reserved: true,
      used: 2,
      actor: 2,
      warning: true,
    });
    expect(apply(reserve, keys)).toEqual({
      reserved: false,
      used: 2,
      actor: 2,
      warning: false,
    });
    expect(apply(reserve, ['stop', 'day', 'actor-b', 'warning'])).toEqual({
      reserved: true,
      used: 3,
      actor: 1,
      warning: false,
    });
    expect(apply(reserve, ['stop', 'day', 'actor-b', 'warning'])).toEqual({
      reserved: false,
      used: 3,
      actor: 1,
      warning: false,
    });
    run(2000, {
      op: 'kv.set',
      k: 'stop',
      v: '1',
      mode: 'always',
      ttlMs: 2 * day,
    });
    expect(
      apply(reserve, ['stop', 'new-day', 'new-actor', 'new-warning'], day)
    ).toEqual({ reserved: false, used: 0, actor: 0, warning: false });
  });
});
