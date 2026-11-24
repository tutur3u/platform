import { describe, expect, it } from 'vite-plus/test';
import { memorySql } from './__tests__/sqlite';
import { randomKey, randomToken } from './__tests__/harness';
import {
  createBudgetStore,
  DAY_MS,
  DEFAULT_DAILY_BUDGET,
  parseDailyBudget,
} from './budget-store';
import { createControlHandlers } from './control';
import { parseFenceFloor } from './fence-store';
import { guardPorts, STOPPED_HOLD_MS } from './ports';
import {
  createReplayStore,
  MAX_LIVE_TOKENS,
  SWEEP_LIMIT,
  TRANSACTION_CLAIM_TTL_MS,
} from './replay-store';

const NOW = 1_800_000_000_000;
const TRANSACTION = '0b5a3c1e-7d2f-4a6b-9c8d-1e2f3a4b5c6d';

function replayStore() {
  const { db, sql, transaction } = memorySql();
  return { db, store: createReplayStore(sql, transaction) };
}

describe('replay store', () => {
  it('claims a nonce and a permit once, all or nothing', () => {
    const { store } = replayStore();
    const nonce = {
      kind: 'nonce' as const,
      token: randomToken(),
      expiresAtMs: NOW + 60_000,
    };
    const permit = {
      kind: 'permit' as const,
      token: randomToken(),
      expiresAtMs: NOW + 60_000,
    };
    expect(store.claim([nonce, permit], NOW)).toEqual({ ok: true });
    expect(store.claim([nonce], NOW)).toEqual({ ok: false, error: 'replayed' });
    const fresh = { ...nonce, token: randomToken() };
    expect(store.claim([fresh, permit], NOW)).toEqual({
      ok: false,
      error: 'replayed',
    });
    // The refused claim recorded nothing, so the fresh nonce is still unused.
    expect(store.claim([fresh], NOW)).toEqual({ ok: true });
    expect(store.liveCount()).toBe(3);
  });

  it('gives exactly one success to concurrent claims of one token', async () => {
    const { store } = replayStore();
    const tokens = [
      {
        kind: 'nonce' as const,
        token: randomToken(),
        expiresAtMs: NOW + 60_000,
      },
      {
        kind: 'permit' as const,
        token: randomToken(),
        expiresAtMs: NOW + 60_000,
      },
    ];
    const results = await Promise.all(
      Array.from({ length: 8 }, async () => store.claim(tokens, NOW))
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(7);
    expect(store.liveCount()).toBe(2);
  });

  it('claims a transaction once across fresh nonces and permits, all or nothing', () => {
    const { store } = replayStore();
    const claim = (transaction: string) =>
      store.claim(
        [
          { kind: 'nonce', token: randomToken(), expiresAtMs: NOW + 120_000 },
          { kind: 'permit', token: randomToken(), expiresAtMs: NOW + 60_000 },
          {
            kind: 'transaction',
            token: transaction,
            expiresAtMs: NOW + TRANSACTION_CLAIM_TTL_MS,
          },
        ],
        NOW
      );
    expect(claim(TRANSACTION)).toEqual({ ok: true });
    expect(claim(TRANSACTION)).toEqual({ ok: false, error: 'replayed' });
    // The refused claims recorded neither their nonce nor their permit.
    expect(store.liveCount()).toBe(3);
    // Still held just before the claim lifetime ends.
    const late = NOW + TRANSACTION_CLAIM_TTL_MS - 1;
    expect(
      store.claim(
        [{ kind: 'transaction', token: TRANSACTION, expiresAtMs: late + 1 }],
        late
      )
    ).toEqual({ ok: false, error: 'replayed' });
  });

  it('keeps nonce and permit namespaces apart', () => {
    const { store } = replayStore();
    const token = randomToken();
    expect(
      store.claim([{ kind: 'nonce', token, expiresAtMs: NOW + 1 }], NOW).ok
    ).toBe(true);
    expect(
      store.claim([{ kind: 'permit', token, expiresAtMs: NOW + 1 }], NOW).ok
    ).toBe(true);
  });

  it('sweeps at most SWEEP_LIMIT expired rows per claim', () => {
    const { db, store } = replayStore();
    for (let i = 0; i < SWEEP_LIMIT * 2 + 5; i += 1) {
      store.claim(
        [{ kind: 'nonce', token: randomToken(), expiresAtMs: NOW + 1_000 }],
        NOW
      );
    }
    const rows = () =>
      Number(
        (
          db.prepare('SELECT COUNT(*) AS n FROM used_token').get() as {
            n: number;
          }
        ).n
      );
    const later = NOW + 2_000;
    store.claim(
      [{ kind: 'nonce', token: randomToken(), expiresAtMs: later + 1 }],
      later
    );
    expect(rows()).toBe(SWEEP_LIMIT * 2 + 5 - SWEEP_LIMIT + 1);
    expect(store.liveCount()).toBe(rows());
    store.claim(
      [{ kind: 'nonce', token: randomToken(), expiresAtMs: later + 1 }],
      later
    );
    store.claim(
      [{ kind: 'nonce', token: randomToken(), expiresAtMs: later + 1 }],
      later
    );
    expect(rows()).toBe(3);
    expect(store.liveCount()).toBe(3);
  });

  it('fails closed at the live-row cap', () => {
    const { db, store } = replayStore();
    db.exec(
      `INSERT INTO replay_meta (k, v) VALUES ('live', ${MAX_LIVE_TOKENS - 1})`
    );
    const claim = () =>
      store.claim(
        [
          { kind: 'nonce', token: randomToken(), expiresAtMs: NOW + 1_000 },
          { kind: 'permit', token: randomToken(), expiresAtMs: NOW + 1_000 },
        ],
        NOW
      );
    expect(claim()).toEqual({ ok: false, error: 'replay_capacity' });
  });

  it.each([
    [[]],
    [[{ kind: 'nonce', token: 'short', expiresAtMs: NOW + 1 }]],
    [[{ kind: 'other', token: randomToken(), expiresAtMs: NOW + 1 }]],
    [[{ kind: 'nonce', token: randomToken(), expiresAtMs: NOW }]],
    [[{ kind: 'nonce', token: randomToken(), expiresAtMs: NOW + 660_001 }]],
    [
      [
        {
          kind: 'transaction',
          token: TRANSACTION.toUpperCase(),
          expiresAtMs: NOW + 1,
        },
      ],
    ],
    [[{ kind: 'transaction', token: randomToken(), expiresAtMs: NOW + 1 }]],
    [[{ kind: 'toString', token: randomToken(), expiresAtMs: NOW + 1 }]],
    [
      [
        { kind: 'nonce', token: randomToken(), expiresAtMs: NOW + 1 },
        { kind: 'nonce', token: randomToken(), expiresAtMs: NOW + 1 },
      ],
    ],
    [
      [
        { kind: 'nonce', token: randomToken(), expiresAtMs: NOW + 1 },
        { kind: 'permit', token: randomToken(), expiresAtMs: NOW + 1 },
        { kind: 'transaction', token: TRANSACTION, expiresAtMs: NOW + 1 },
        { kind: 'nonce', token: randomToken(), expiresAtMs: NOW + 1 },
      ],
    ],
  ])('refuses a malformed claim %#', (tokens) => {
    expect(() => replayStore().store.claim(tokens as never, NOW)).toThrow(
      TypeError
    );
  });
});

describe('daily budget', () => {
  it('caps admitted requests per UTC day and keeps one day row', () => {
    const { db, sql, transaction } = memorySql();
    const store = createBudgetStore(sql, transaction);
    expect(store.reserve(NOW, 2)).toEqual({ ok: true, total: 1 });
    expect(store.reserve(NOW, 2)).toEqual({ ok: true, total: 2 });
    const refused = store.reserve(NOW, 2);
    expect(refused).toMatchObject({ ok: false, error: 'budget_exhausted' });
    expect(!refused.ok && refused.retryAtMs).toBe(
      (Math.floor(NOW / DAY_MS) + 1) * DAY_MS
    );
    expect(store.reserve(NOW + DAY_MS, 2)).toEqual({ ok: true, total: 1 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM budget_day').get()).toEqual({
      n: 1,
    });
  });

  it('parses the configured budget', () => {
    expect(parseDailyBudget('')).toBe(DEFAULT_DAILY_BUDGET);
    expect(parseDailyBudget(undefined)).toBe(DEFAULT_DAILY_BUDGET);
    expect(parseDailyBudget('25')).toBe(25);
    for (const raw of ['0', '-1', '1.5', 'many', '2000000']) {
      expect(parseDailyBudget(raw)).toBeNull();
    }
  });
});

describe('stop fence', () => {
  it('starts stopped and moves only with the control key', () => {
    const control = randomKey();
    const { sql } = memorySql();
    const handlers = createControlHandlers({
      sql,
      secret: () => control.text,
      now: () => NOW,
    });
    expect(handlers.fenceMode()).toBe('stopped');
    expect(handlers.setFence(randomKey().text, 'running', 'start')).toEqual({
      ok: false,
      error: 'unauthorized',
    });
    expect(handlers.readFence(undefined)).toEqual({
      ok: false,
      error: 'unauthorized',
    });
    expect(handlers.setFence(control.text, 'paused', 'start')).toEqual({
      ok: false,
      error: 'invalid_request',
    });
    expect(handlers.setFence(control.text, 'running', 'line\nbreak')).toEqual({
      ok: false,
      error: 'invalid_request',
    });
    expect(handlers.setFence(control.text, 'running', 'staging start')).toEqual(
      {
        ok: true,
        fence: { mode: 'running', version: 1, updatedAtMs: NOW },
      }
    );
    expect(handlers.fenceMode()).toBe('running');
    expect(handlers.setFence(control.text, 'stopped', 'incident').ok).toBe(
      true
    );
    expect(handlers.readFence(control.text)).toEqual({
      ok: true,
      fence: { mode: 'stopped', version: 2, updatedAtMs: NOW },
    });
  });

  it('refuses every call without a control secret', () => {
    const { sql } = memorySql();
    const handlers = createControlHandlers({
      sql,
      secret: () => undefined,
      now: () => NOW,
    });
    expect(handlers.readFence('').ok).toBe(false);
  });

  it('reads the floor: empty runs, anything else but running stops', () => {
    expect(parseFenceFloor('')).toBe('running');
    expect(parseFenceFloor(undefined)).toBe('running');
    expect(parseFenceFloor('running')).toBe('running');
    for (const raw of ['stopped', 'stoped', 'RUNNING', 'off']) {
      expect(parseFenceFloor(raw)).toBe('stopped');
    }
  });
});

describe('isolate guards', () => {
  it('holds a stopped fence for ten seconds and never caches running', async () => {
    let clock = NOW;
    let mode: 'running' | 'stopped' = 'running';
    let reads = 0;
    const guards = guardPorts({
      control: {
        fenceMode: async () => {
          reads += 1;
          return mode;
        },
      },
      budget: { reserve: async () => ({ ok: true, total: 1 }) },
      now: () => clock,
    });
    await guards.control.fenceMode();
    await guards.control.fenceMode();
    expect(reads).toBe(2);
    mode = 'stopped';
    expect(await guards.control.fenceMode()).toBe('stopped');
    mode = 'running';
    expect(await guards.control.fenceMode()).toBe('stopped');
    expect(reads).toBe(3);
    clock += STOPPED_HOLD_MS;
    expect(await guards.control.fenceMode()).toBe('running');
    expect(reads).toBe(4);
  });

  it('holds an exhausted budget until its retry time', async () => {
    let calls = 0;
    const retryAtMs = NOW + 1_000;
    const guards = guardPorts({
      control: { fenceMode: async () => 'running' },
      budget: {
        reserve: async () => {
          calls += 1;
          return { ok: false, error: 'budget_exhausted', retryAtMs };
        },
      },
      now: () => NOW,
    });
    expect(guards.budget.peek?.(NOW)).toBeNull();
    await guards.budget.reserve(NOW);
    expect(guards.budget.peek?.(NOW + 999)).toEqual({
      ok: false,
      error: 'budget_exhausted',
      retryAtMs,
    });
    expect(await guards.budget.reserve(NOW + 999)).toMatchObject({ ok: false });
    expect(calls).toBe(1);
    expect(guards.budget.peek?.(retryAtMs)).toBeNull();
    await guards.budget.reserve(retryAtMs);
    expect(calls).toBe(2);
  });
});
