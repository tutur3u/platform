import { DatabaseSync } from 'node:sqlite';
import { BRIDGE_LIMITS } from '@tuturuuu/utils/mastermind-store/bridge-protocol';
import { describe, expect, it } from 'vite-plus/test';
import {
  BridgeError,
  type BridgeReplyInput,
  createBridgeEngine,
} from './bridge-engine';
import type { SqlLike } from './engine';

const NOW = Date.UTC(2026, 10, 21, 5, 0, 0);
const BUDGET = 1000;
const ACTOR = '00000000-0000-4000-8000-0000000000aa';
const ownerTicket = {
  role: 'owner' as const,
  ownerId: ACTOR,
  leaseExpiresAt: NOW + 300_000,
};
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function setup() {
  const db = new DatabaseSync(':memory:');
  const sql: SqlLike = {
    exec(query, ...bindings) {
      const statement = db.prepare(query);
      return { toArray: () => statement.all(...bindings) as never };
    },
  };
  const engine = createBridgeEngine(sql);
  engine.ensureSchema();
  return { engine, db };
}

const reply = (n: number, over: Partial<BridgeReplyInput> = {}) => ({
  id: uuid(n),
  machineId: 'skr-m4',
  threadId: `thread:${n}`,
  actorId: ACTOR,
  textDigest: 'a'.repeat(64),
  ackKey: ACK_KEY,
  // Far ahead, so a reply stored later in a test is still in date; the
  // engine caps the outbox lifetime itself.
  expiresAt: NOW + 365 * 24 * 60 * 60_000,
  frame: `frame-${n}`,
  ...over,
});

const SIG = 'd'.repeat(128);
const ACK_KEY = 'K'.repeat(43);
/** An acknowledgement with the machine signature the store only relays. */
const settle = (
  engine: ReturnType<typeof setup>['engine'],
  input: Omit<Parameters<ReturnType<typeof setup>['engine']['ack']>[0], 'sig'>,
  now: number
) => engine.ack({ ...input, sig: SIG }, now);

const code = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    if (error instanceof BridgeError) return error.code;
    throw error;
  }
  return 'ok';
};

describe('fleet bridge engine', () => {
  it('stores a reply once and replays the same receipt for the same key', () => {
    const { engine } = setup();
    const first = engine.enqueue(reply(1), NOW, BUDGET);
    expect(first).toMatchObject({
      replayed: false,
      receipt: { id: uuid(1), state: 'sent', createdAt: NOW },
    });
    const again = engine.enqueue(reply(1), NOW + 5, BUDGET);
    expect(again).toEqual({ receipt: first.receipt, replayed: true });
    expect(engine.pending('skr-m4', NOW)).toEqual(['frame-1']);
    // One charged operation, one outbox row: a retry costs nothing.
    expect(engine.status(NOW, BUDGET)).toMatchObject({ ops: 1, pending: 1 });
  });

  it('refuses the same key with a different text, thread, environment, machine or actor', () => {
    const { engine } = setup();
    engine.enqueue(reply(1), NOW, BUDGET);
    for (const over of [
      { textDigest: 'b'.repeat(64) },
      { threadId: 'thread:other' },
      { environmentId: 'env-2' },
      { machineId: 'other' },
      { actorId: uuid(99) },
    ])
      expect(code(() => engine.enqueue(reply(1, over), NOW, BUDGET))).toBe(
        'conflict'
      );
  });

  it('settles only a pending reply, only from its own machine, and drops the frame', () => {
    const { engine, db } = setup();
    engine.enqueue(reply(1), NOW, BUDGET);
    expect(
      settle(
        engine,
        { id: uuid(1), machineId: 'intruder', state: 'delivered' },
        NOW
      )
    ).toBeNull();
    const settled = settle(
      engine,
      {
        id: uuid(1),
        machineId: 'skr-m4',
        state: 'delivered',
        delivery: 'steered',
      },
      NOW + 400
    );
    expect(settled).toMatchObject({
      changed: true,
      receipt: {
        state: 'delivered',
        delivery: 'steered',
        settledAt: NOW + 400,
      },
    });
    // A late or repeated ack cannot rewrite the outcome.
    expect(
      settle(
        engine,
        { id: uuid(1), machineId: 'skr-m4', state: 'failed', code: 'expired' },
        NOW + 900
      )
    ).toMatchObject({ changed: false, receipt: { state: 'delivered' } });
    expect(engine.pending('skr-m4', NOW)).toEqual([]);
    // The record keeps who, when, where and the hash; the text is gone.
    expect(db.prepare('SELECT count(*) AS n FROM outbox').get()).toEqual({
      n: 0,
    });
    expect(
      db.prepare('SELECT actor, machine, thread, sha FROM replies').get()
    ).toEqual({
      actor: ACTOR,
      machine: 'skr-m4',
      thread: 'thread:1',
      sha: 'a'.repeat(64),
    });
  });

  it('keeps the machine signature and the digest with the receipt, for Web to verify', () => {
    const { engine } = setup();
    engine.enqueue(reply(1, { environmentId: 'env-2' }), NOW, BUDGET);
    expect(engine.receipt(uuid(1), NOW)).toEqual({
      id: uuid(1),
      machineId: 'skr-m4',
      threadId: 'thread:1',
      environmentId: 'env-2',
      state: 'sent',
      createdAt: NOW,
      textDigest: 'a'.repeat(64),
    });
    settle(
      engine,
      { id: uuid(1), machineId: 'skr-m4', state: 'failed' },
      NOW + 1
    );
    // The store adds nothing of its own: no default code, the signature as sent.
    expect(engine.receipt(uuid(1), NOW)).toEqual({
      id: uuid(1),
      machineId: 'skr-m4',
      threadId: 'thread:1',
      environmentId: 'env-2',
      state: 'failed',
      createdAt: NOW,
      settledAt: NOW + 1,
      textDigest: 'a'.repeat(64),
      ackSig: SIG,
    });
  });

  it('names what an acknowledgement must be signed over, for a pending reply of that machine only', () => {
    const { engine } = setup();
    engine.enqueue(reply(1), NOW, BUDGET);
    expect(engine.ackContext(uuid(1), 'skr-m4')).toEqual({
      textDigest: 'a'.repeat(64),
      ackKey: ACK_KEY,
    });
    expect(engine.ackContext(uuid(1), 'intruder')).toBeNull();
    expect(engine.ackContext(uuid(2), 'skr-m4')).toBeNull();
    settle(
      engine,
      { id: uuid(1), machineId: 'skr-m4', state: 'delivered' },
      NOW
    );
    expect(engine.ackContext(uuid(1), 'skr-m4')).toBeNull();
  });

  it('charges an outbox replay and counts acknowledgements without refusing them', () => {
    const { engine } = setup();
    engine.chargeFrame(NOW, 2);
    engine.countFrame(NOW);
    expect(engine.status(NOW, 2).ops).toBe(2);
    expect(code(() => engine.chargeFrame(NOW, 2))).toBe('budget');
    // An acknowledgement is never refused, and still shows in the count.
    engine.countFrame(NOW);
    expect(engine.status(NOW, 2).ops).toBe(3);
    expect(code(() => engine.enqueue(reply(1), NOW, 2))).toBe('budget');
    engine.setStopped(true);
    expect(code(() => engine.chargeFrame(NOW + 86_400_000, 2))).toBe('stopped');
  });

  it('records a failure with a closed code', () => {
    const { engine } = setup();
    engine.enqueue(reply(1), NOW, BUDGET);
    expect(
      settle(
        engine,
        {
          id: uuid(1),
          machineId: 'skr-m4',
          state: 'failed',
          code: 'unknown_thread',
        },
        NOW
      )?.receipt
    ).toMatchObject({ state: 'failed', code: 'unknown_thread' });
  });

  it('keeps undelivered replies in order for an offline machine and expires them', () => {
    const { engine } = setup();
    const expiresAt = NOW + 60 * 60_000;
    engine.enqueue(reply(2, { expiresAt }), NOW + 2, BUDGET);
    engine.enqueue(reply(1, { expiresAt }), NOW + 1, BUDGET);
    engine.enqueue(
      reply(3, { machineId: 'other', expiresAt }),
      NOW + 3,
      BUDGET
    );
    expect(engine.pending('skr-m4', NOW + 10)).toEqual(['frame-1', 'frame-2']);
    const late = NOW + 61 * 60_000;
    expect(engine.pending('skr-m4', late)).toEqual([]);
    expect(engine.receipt(uuid(1), late)?.state).toBe('expired');
    // The next write sweeps the overdue rows out of the outbox for good.
    engine.enqueue(reply(9), late, BUDGET);
    expect(engine.status(late, BUDGET).pending).toBe(1);
    expect(
      settle(
        engine,
        { id: uuid(1), machineId: 'skr-m4', state: 'delivered' },
        late
      )
    ).toMatchObject({ changed: false, receipt: { state: 'expired' } });
  });

  it('caps the outbox lifetime at 24 hours whatever the envelope says', () => {
    const { engine } = setup();
    engine.enqueue(
      reply(1, { expiresAt: NOW + 30 * 24 * 60 * 60_000 }),
      NOW,
      BUDGET
    );
    expect(
      engine.receipt(uuid(1), NOW + BRIDGE_LIMITS.outboxTtlMs)?.state
    ).toBe('expired');
  });

  it('limits replies per thread per minute and per hour', () => {
    const { engine } = setup();
    for (let i = 0; i < BRIDGE_LIMITS.perThreadPerMinute; i++)
      engine.enqueue(reply(i, { threadId: 'thread:hot' }), NOW + i, BUDGET);
    expect(
      code(() =>
        engine.enqueue(reply(50, { threadId: 'thread:hot' }), NOW + 9, BUDGET)
      )
    ).toBe('rate_limited');
    // Another thread is unaffected; the same thread recovers after a minute.
    expect(code(() => engine.enqueue(reply(51), NOW + 9, BUDGET))).toBe('ok');
    expect(
      code(() =>
        engine.enqueue(
          reply(52, { threadId: 'thread:hot' }),
          NOW + 61_000,
          BUDGET
        )
      )
    ).toBe('ok');

    const hourly = setup().engine;
    for (let i = 0; i < BRIDGE_LIMITS.perHour; i++)
      hourly.enqueue(reply(i), NOW + i, BUDGET);
    expect(code(() => hourly.enqueue(reply(900), NOW + 999, BUDGET))).toBe(
      'rate_limited'
    );
    expect(
      code(() => hourly.enqueue(reply(901), NOW + 3_600_100, BUDGET))
    ).toBe('ok');
  });

  it('stops at the daily operation budget and resets the next UTC day', () => {
    const { engine } = setup();
    engine.enqueue(reply(1), NOW, 2);
    engine.mintTicket({ hash: 'h1', ...ownerTicket }, NOW, 2);
    expect(code(() => engine.enqueue(reply(2), NOW, 2))).toBe('budget');
    expect(
      code(() => engine.mintTicket({ hash: 'h2', ...ownerTicket }, NOW, 2))
    ).toBe('budget');
    // A refused reply left no record behind.
    expect(engine.receipt(uuid(2), NOW)).toBeNull();
    expect(
      code(() => engine.enqueue(reply(3), NOW + 24 * 60 * 60_000, 2))
    ).toBe('ok');
  });

  it('refuses new work behind the stop fence but still answers receipts and replays', () => {
    const { engine } = setup();
    const first = engine.enqueue(reply(1), NOW, BUDGET);
    engine.mintTicket({ hash: 'live', ...ownerTicket }, NOW, BUDGET);
    engine.setStopped(true);
    expect(code(() => engine.enqueue(reply(2), NOW, BUDGET))).toBe('stopped');
    expect(
      code(() => engine.mintTicket({ hash: 'h', ...ownerTicket }, NOW, BUDGET))
    ).toBe('stopped');
    expect(engine.redeemTicket('live', NOW)).toBeNull();
    expect(
      engine.poke(
        { machineId: 'skr-m4', topic: 'usage', revision: 1, observedAt: 'x' },
        NOW,
        BUDGET
      )
    ).toBe(false);
    expect(engine.enqueue(reply(1), NOW, BUDGET)).toEqual({
      receipt: first.receipt,
      replayed: true,
    });
    engine.setStopped(false);
    expect(code(() => engine.enqueue(reply(2), NOW, BUDGET))).toBe('ok');
  });

  it('admits one socket per ticket, before it expires, with the role it was minted for', () => {
    const { engine } = setup();
    const expiresAt = engine.mintTicket(
      { hash: 'm', role: 'machine', machineId: 'skr-m4' },
      NOW,
      BUDGET
    );
    expect(expiresAt).toBe(NOW + BRIDGE_LIMITS.ticketTtlMs);
    engine.mintTicket({ hash: 'o', ...ownerTicket }, NOW, BUDGET);
    engine.mintTicket({ hash: 'late', ...ownerTicket }, NOW, BUDGET);
    expect(engine.redeemTicket('m', NOW + 1)).toEqual({
      role: 'machine',
      machineId: 'skr-m4',
    });
    expect(engine.redeemTicket('m', NOW + 2)).toBeNull();
    expect(engine.redeemTicket('o', NOW + 2)).toEqual(ownerTicket);
    expect(engine.redeemTicket('unknown', NOW)).toBeNull();
    expect(engine.redeemTicket('late', expiresAt)).toBeNull();
    // An expired ticket is spent too: it cannot be retried.
    expect(engine.redeemTicket('late', NOW)).toBeNull();
  });

  it('persists owner tickets outside the legacy decoder and revokes them when fenced', () => {
    const { engine, db } = setup();
    engine.mintTicket({ hash: 'upgraded', ...ownerTicket }, NOW, BUDGET);
    db.prepare('INSERT INTO tickets (hash, role, exp) VALUES (?, ?, ?)').run(
      'legacy',
      'owner',
      NOW + BRIDGE_LIMITS.ticketTtlMs
    );
    expect(
      db.prepare('SELECT role FROM tickets WHERE hash = ?').get('upgraded')
    ).toEqual({ role: 'owner-v2' });
    const machine = { role: 'machine' as const, machineId: 'skr-m4' };
    engine.mintTicket({ hash: 'machine', ...machine }, NOW, BUDGET);
    engine.setStopped(true);
    engine.setStopped(false);
    expect(db.prepare('SELECT hash FROM tickets ORDER BY hash').all()).toEqual([
      { hash: 'machine' },
    ]);
    expect(engine.redeemTicket('upgraded', NOW + 1)).toBeNull();
    expect(engine.redeemTicket('machine', NOW + 1)).toEqual(machine);
  });

  it('bounds a single-use owner ticket by the credential lease', () => {
    const { engine } = setup();
    expect(
      engine.mintTicket(
        {
          hash: 'short',
          ...ownerTicket,
          leaseExpiresAt: NOW + 500,
        },
        NOW,
        BUDGET
      )
    ).toBe(NOW + 500);
    expect(engine.redeemTicket('short', NOW + 500)).toBeNull();
    expect(
      code(() =>
        engine.mintTicket(
          {
            hash: 'long',
            ...ownerTicket,
            leaseExpiresAt: NOW + 300_001,
          },
          NOW,
          BUDGET
        )
      )
    ).toBe('unauthorized');
  });

  it('caps live tickets', () => {
    const { engine } = setup();
    for (let i = 0; i < BRIDGE_LIMITS.maxLiveTickets; i++)
      engine.mintTicket({ hash: `t${i}`, ...ownerTicket }, NOW, BUDGET);
    expect(
      code(() =>
        engine.mintTicket({ hash: 'more', ...ownerTicket }, NOW, BUDGET)
      )
    ).toBe('rate_limited');
    expect(
      code(() =>
        engine.mintTicket(
          { hash: 'later', ...ownerTicket },
          NOW + BRIDGE_LIMITS.ticketTtlMs,
          BUDGET
        )
      )
    ).toBe('ok');
  });

  it('keeps only the highest poke revision per machine and topic', () => {
    const { engine } = setup();
    const poke = (revision: number, topic = 'usage' as const) =>
      engine.poke(
        { machineId: 'skr-m4', topic, revision, observedAt: `at-${revision}` },
        NOW,
        BUDGET
      );
    expect(poke(3)).toBe(true);
    expect(poke(3)).toBe(false);
    expect(poke(2)).toBe(false);
    expect(poke(4)).toBe(true);
    expect(engine.pokes()).toEqual([
      { machineId: 'skr-m4', topic: 'usage', revision: 4, observedAt: 'at-4' },
    ]);
    // Only an accepted poke is charged.
    expect(engine.status(NOW, BUDGET).ops).toBe(2);
  });

  it('tracks machine presence', () => {
    const { engine } = setup();
    engine.machineConnected('skr-m4', NOW);
    expect(engine.machines()).toEqual([
      { machineId: 'skr-m4', connectedAt: NOW },
    ]);
    engine.machineDisconnected('skr-m4', NOW + 5);
    expect(engine.machines()).toEqual([
      { machineId: 'skr-m4', connectedAt: NOW, disconnectedAt: NOW + 5 },
    ]);
    engine.machineConnected('skr-m4', NOW + 9);
    expect(engine.machines()).toEqual([
      { machineId: 'skr-m4', connectedAt: NOW + 9 },
    ]);
  });

  it('drops settled records after the audit retention and keeps pending ones', () => {
    const { engine } = setup();
    engine.enqueue(reply(1), NOW, BUDGET);
    settle(
      engine,
      { id: uuid(1), machineId: 'skr-m4', state: 'delivered' },
      NOW
    );
    const later = NOW + BRIDGE_LIMITS.auditRetentionMs + 1;
    engine.enqueue(reply(2), later, BUDGET);
    expect(engine.receipt(uuid(1), later)).toBeNull();
    expect(engine.receipt(uuid(2), later)?.state).toBe('sent');
  });
});
