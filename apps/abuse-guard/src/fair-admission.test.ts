import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createControlState, rollover } from './control-state';
import type { SqlRunner } from './engine';
import {
  admitFairCommands,
  ensureFairAdmissionSchema,
  FAIR_DAY_MS,
  type FairIdentity,
} from './fair-admission';
import { createFairAdmissionGate, type FenceEnv } from './fence';

function setup() {
  const db = new DatabaseSync(':memory:');
  const sql: SqlRunner = {
    exec(query, ...bindings) {
      return {
        toArray: () =>
          db
            .prepare(query)
            .all(...(bindings as (string | number | null)[])) as never,
      };
    },
  };
  ensureFairAdmissionSchema(sql);
  const state = createControlState(1000);
  const admit = (source: string, principal: string, ops = 1, now = 1000) => {
    rollover(state, now);
    return admitFairCommands({
      sql,
      state,
      family: 'replay',
      identity: { source, principal },
      ops,
      budget: 1000,
      now,
    });
  };
  return { db, state, admit };
}

afterEach(() => vi.useRealTimers());

describe('durable fairness before shared family spend', () => {
  it('bounds one principal across rotating sources and leaves other principals room', () => {
    const { db, state, admit } = setup();
    for (let n = 0; n < 50; n++)
      expect(admit(`source:${n}`, 'attacker').kind).toBe('open');
    for (let n = 0; n < 100; n++)
      expect(admit(`new:${n}`, 'attacker').kind).toBe('limited');
    expect(state.families.replay?.used).toBe(50);
    expect(state.families.replay?.stopped).toBe(false);
    expect(admit('legit-source', 'legit').kind).toBe('open');
    // A denied rotating identity allocates no quota row.
    expect(db.prepare('SELECT COUNT(*) AS n FROM fair_usage').get()?.n).toBe(
      53
    );
    db.close();
  });

  it('bounds one source across rotating principals, counts batch commands and refunds', () => {
    const { db, state, admit } = setup();
    // 25 reserve+refund pairs spend the same 50-command allowance.
    for (let n = 0; n < 25; n++)
      expect(admit('source', `principal:${n}`, 2).kind).toBe('open');
    expect(admit('source', 'rotated', 1).kind).toBe('limited');
    expect(state.families.replay?.used).toBe(50);
    expect(admit('other', 'rotated', 2).kind).toBe('open');
    db.close();
  });

  it('does not cache a batch denial against an identity that still has capacity', () => {
    const { db, admit } = setup();
    expect(admit('source', 'principal', 49).kind).toBe('open');
    expect(admit('source', 'principal', 2)).toMatchObject({
      kind: 'limited',
      keys: [],
    });
    expect(admit('source', 'another-principal', 1).kind).toBe('open');
    db.close();
  });

  it('keeps quotas at an operator resume and resets them at UTC rollover', () => {
    const { db, state, admit } = setup();
    expect(admit('source', 'principal', 50).kind).toBe('open');
    state.families.replay!.used = 0;
    expect(admit('source', 'principal').kind).toBe('limited');
    expect(admit('source', 'principal', 1, FAIR_DAY_MS).kind).toBe('open');
    expect(state.families.replay?.used).toBe(1);
    db.close();
  });

  it('fails closed for tiny shares instead of allowing one command to exhaust a family', () => {
    const { db, admit } = setup();
    expect(admit('source', 'principal', 51).kind).toBe('limited');
    expect(admit('source', 'principal', 50).kind).toBe('open');
    db.close();
  });

  it('suppresses repeated denied probes; eviction and isolate restart recheck durable limits', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const { db, state, admit } = setup();
    const probe = vi.fn(
      async (_family: string, identity: FairIdentity, ops: number) =>
        admit(identity.source, identity.principal ?? 'anonymous', ops)
    );
    const env = {
      GUARD_CONTROL: {
        idFromName: () => 'control',
        get: () => ({ admitFair: probe }),
      },
      ABUSE_GUARD_DAILY_OP_BUDGET: '10000',
      ABUSE_GUARD_FAMILY_BUDGETS: 'replay=1000',
    } as unknown as FenceEnv;
    expect(admit('attacker', 'attacker', 50).kind).toBe('open');
    const gate = createFairAdmissionGate(2);
    const identity = { source: 'attacker', principal: 'attacker' };
    for (let n = 0; n < 100; n++)
      expect((await gate(env, 'replay', identity, 1)).kind).toBe('limited');
    expect(probe).toHaveBeenCalledTimes(1);
    // A different exhausted pair evicts the attacker's shortcuts.
    expect(admit('evict', 'evict', 50).kind).toBe('open');
    await gate(env, 'replay', { source: 'evict', principal: 'evict' }, 1);
    expect((await gate(env, 'replay', identity, 1)).kind).toBe('limited');
    expect(probe).toHaveBeenCalledTimes(3);
    const restarted = createFairAdmissionGate(2);
    expect((await restarted(env, 'replay', identity, 1)).kind).toBe('limited');
    expect(probe).toHaveBeenCalledTimes(4);
    expect(state.families.replay?.used).toBe(100);
    db.close();
  });
});
