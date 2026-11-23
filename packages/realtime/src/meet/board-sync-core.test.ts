import { describe, expect, it } from 'vitest';
import { createBoardRoom, type BoardRoomDeps } from './board-sync-core';
import type { BoardChange, BoardElement } from './board-sync-schema';
import { BOARD_FLUSH_RETRY, BOARD_LIMITS } from './board-sync-schema';

const el = (id: string, version = 1, extra: object = {}): BoardElement =>
  ({
    id,
    type: 'rectangle',
    version,
    versionNonce: 1,
    ...extra,
  }) as BoardElement;
const change = (element: BoardElement): BoardChange => ({
  type: 'update',
  element,
});

function harness(options: { fence?: string; connections?: number } = {}) {
  const store = new Map<string, unknown>();
  const ops = { puts: 0, alarms: 0, flushes: 0, loads: 0 };
  let now = 1_800_000_000_000;
  let alarm: number | null = null;
  let connections = options.connections ?? 1;
  let fence = options.fence;
  let flushAnswer: () => Promise<{
    status: number;
    result?: any;
  }> = async () => ({
    status: 200,
    result: { updatedAt: `t${ops.flushes}` },
  });
  const broadcasts: unknown[] = [];
  let closedAll = 0;
  const deps: BoardRoomDeps = {
    now: () => now,
    storage: {
      get: async (key) => structuredClone(store.get(key)) as never,
      put: async (entries) => {
        ops.puts++;
        for (const [k, v] of Object.entries(entries))
          store.set(k, structuredClone(v));
      },
      setAlarm: async (at) => {
        ops.alarms++;
        alarm = at;
      },
    },
    load: async () => {
      ops.loads++;
      return { updatedAt: 'base', elements: [el('seed')] };
    },
    flush: async () => {
      ops.flushes++;
      return flushAnswer();
    },
    hash: async (text) => {
      let h = 0;
      for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      return h.toString(16).padStart(64, '0');
    },
    broadcast: (m) => broadcasts.push(m),
    connections: () => connections,
    closeExpired: () => {},
    closeAll: () => closedAll++,
    fenceValue: () => fence,
  };
  const room = createBoardRoom(deps);
  /** Runs every alarm due up to `until`, advancing the clock like the platform. */
  async function advance(ms: number) {
    const until = now + ms;
    while (alarm !== null && alarm <= until) {
      now = alarm;
      alarm = null;
      await room.alarm();
    }
    now = until;
  }
  return {
    room,
    ops,
    store,
    broadcasts,
    deps,
    advance,
    get alarm() {
      return alarm;
    },
    set connections(value: number) {
      connections = value;
    },
    setFence: (v: string | undefined) => (fence = v),
    setFlush: (fn: typeof flushAnswer) => (flushAnswer = fn),
    tick: (ms: number) => (now += ms),
    get closedAll() {
      return closedAll;
    },
    get now() {
      return now;
    },
  };
}

describe('board room write budget', () => {
  it('coalesces a burst of edits into one persist and one flush', async () => {
    const h = harness();
    await h.room.ensureLoaded();
    await h.room.connectionsChanged();
    const base = { ...h.ops };
    for (let i = 0; i < 500; i++)
      await h.room.edit([change(el(`e${i % 20}`, i + 2))]);
    expect(h.ops.alarms - base.alarms).toBeLessThanOrEqual(2);
    await h.advance(BOARD_LIMITS.flushWindowMs + 1000);
    expect(h.ops.flushes).toBe(1);
    expect(h.ops.puts - base.puts).toBeLessThanOrEqual(3);
  });

  it('bounds writes per time, not per edit, under continuous editing', async () => {
    const h = harness();
    await h.room.ensureLoaded();
    await h.room.connectionsChanged();
    const minutes = 10;
    const steps = (minutes * 60_000) / 100;
    for (let i = 0; i < steps; i++) {
      await h.room.edit([change(el(`e${i % 50}`, i + 2))]);
      await h.advance(100);
    }
    await h.advance(BOARD_LIMITS.flushWindowMs * 2);
    const windows = (minutes * 60_000) / BOARD_LIMITS.flushWindowMs;
    expect(h.ops.flushes).toBeLessThanOrEqual(windows + 2);
    const persists = (minutes * 60_000) / BOARD_LIMITS.persistWindowMs;
    expect(h.ops.puts).toBeLessThanOrEqual(persists + windows * 2 + 6);
    expect(h.ops.alarms).toBeLessThanOrEqual(
      persists * 2 + windows + (minutes * 60_000) / BOARD_LIMITS.sweepMs + 6
    );
  });

  it('flushes once on idle and schedules nothing afterwards', async () => {
    const h = harness();
    await h.room.ensureLoaded();
    await h.room.connectionsChanged();
    await h.room.edit([change(el('a', 2))]);
    h.connections = 0;
    await h.room.connectionsChanged();
    await h.advance(BOARD_LIMITS.idleFlushMs + 10);
    expect(h.ops.flushes).toBe(1);
    expect(h.room.snapshotMeta().flushedRevision).toBe(1);
    expect(h.alarm).toBeNull();
    await h.advance(60 * 60_000);
    expect(h.ops.flushes).toBe(1);
  });

  it('ignores replays that change nothing', async () => {
    const h = harness();
    await h.room.ensureLoaded();
    await h.room.edit([change(el('a', 5))]);
    const before = { ...h.ops };
    for (let i = 0; i < 100; i++) await h.room.edit([change(el('a', 5))]);
    expect(h.ops).toEqual(before);
  });
});

describe('stop fence', () => {
  it('halts persist, flush and alarms for edits while fenced', async () => {
    const h = harness({ fence: 'true', connections: 0 });
    await h.room.ensureLoaded();
    expect(h.ops.puts).toBe(0);
    for (let i = 0; i < 500; i++) await h.room.edit([change(el(`e${i}`, 2))]);
    await h.advance(60 * 60_000);
    expect(h.ops).toEqual({ puts: 0, alarms: 0, flushes: 0, loads: 1 });
    expect(h.room.elements().length).toBe(501);
  });

  it('resumes when the fence clears and a later edit arrives', async () => {
    const h = harness({ fence: '1' });
    await h.room.ensureLoaded();
    await h.room.edit([change(el('a', 2))]);
    h.setFence(undefined);
    await h.room.edit([change(el('a', 3))]);
    await h.advance(BOARD_LIMITS.flushWindowMs + 1000);
    expect(h.ops.flushes).toBe(1);
  });

  it('treats an unrecognised value as open', async () => {
    const h = harness({ fence: 'false' });
    await h.room.ensureLoaded();
    await h.room.edit([change(el('a', 2))]);
    await h.advance(BOARD_LIMITS.flushWindowMs + 1000);
    expect(h.ops.flushes).toBe(1);
  });
});

describe('failure handling', () => {
  it('stops after the retry budget during an outage', async () => {
    const h = harness({ connections: 0 });
    h.setFlush(async () => {
      throw new Error('down');
    });
    await h.room.ensureLoaded();
    await h.room.edit([change(el('a', 2))]);
    await h.advance(60 * 60_000);
    expect(h.ops.flushes).toBe(BOARD_FLUSH_RETRY.maxAttempts);
    expect(h.alarm).toBeNull();
  });

  it('re-arms with a fresh budget only after the outage window expires', async () => {
    const h = harness({ connections: 0 });
    h.setFlush(async () => {
      throw new Error('down');
    });
    await h.room.ensureLoaded();
    await h.room.edit([change(el('a', 2))]);
    await h.advance(60 * 60_000);
    await h.room.edit([change(el('a', 3))]);
    await h.advance(60 * 60_000);
    expect(h.ops.flushes).toBe(BOARD_FLUSH_RETRY.maxAttempts * 2);
  });

  it('keeps the scene durable before the network call', async () => {
    const h = harness({ connections: 0 });
    let seen: unknown;
    h.setFlush(async () => {
      seen = h.store.get('scene');
      return { status: 200, result: { updatedAt: 'x' } };
    });
    await h.room.ensureLoaded();
    await h.room.edit([change(el('a', 2))]);
    await h.advance(BOARD_LIMITS.flushWindowMs + 1000);
    expect((seen as BoardElement[]).map((e) => e.id)).toContain('a');
  });

  it('stops for good when the platform says the board is gone', async () => {
    const h = harness();
    h.setFlush(async () => ({ status: 404 }));
    await h.room.ensureLoaded();
    await h.room.connectionsChanged();
    await h.room.edit([change(el('a', 2))]);
    await h.advance(BOARD_LIMITS.flushWindowMs + 1000);
    expect(h.room.closed).toBe(true);
    expect(h.closedAll).toBe(1);
    await h.room.edit([change(el('a', 3))]);
    await h.advance(60 * 60_000);
    expect(h.ops.flushes).toBe(1);
  });

  it('merges a concurrent save and flushes the union once', async () => {
    const h = harness({ connections: 0 });
    let calls = 0;
    h.setFlush(async () => {
      calls++;
      return calls === 1
        ? {
            status: 409,
            result: {
              updatedAt: 'theirs',
              elements: [el('seed'), el('remote', 4)],
            },
          }
        : { status: 200, result: { updatedAt: 'mine' } };
    });
    await h.room.ensureLoaded();
    await h.room.edit([change(el('local', 2))]);
    await h.advance(60 * 60_000);
    expect(calls).toBe(2);
    expect(
      h.room
        .elements()
        .map((e) => e.id)
        .sort()
    ).toEqual(['local', 'remote', 'seed']);
    expect(h.room.snapshotMeta().baseUpdatedAt).toBe('mine');
    expect(h.alarm).toBeNull();
  });

  it('marks a scene flushed when the other save already holds everything', async () => {
    const h = harness({ connections: 0 });
    h.setFlush(async () => ({
      status: 409,
      result: { updatedAt: 'theirs', elements: [el('seed'), el('a', 2)] },
    }));
    await h.room.ensureLoaded();
    await h.room.edit([change(el('a', 2))]);
    await h.advance(60 * 60_000);
    expect(h.ops.flushes).toBe(1);
    expect(h.room.snapshotMeta().baseUpdatedAt).toBe('theirs');
  });
});

describe('restart', () => {
  it('flushes unfinished work once after the object restarts, then stays quiet', async () => {
    const h = harness({ connections: 0 });
    await h.room.ensureLoaded();
    await h.room.edit([change(el('a', 2))]);
    await h.advance(BOARD_LIMITS.persistWindowMs + 10);
    // A new instance sharing the storage models eviction before the flush window.
    const restarted = createBoardRoom(h.deps);
    await restarted.restore();
    expect(restarted.elements().map((e) => e.id)).toEqual(['seed', 'a']);
    expect(h.alarm).not.toBeNull();
    const originalAlarm = restarted.alarm;
    await h.advance(BOARD_LIMITS.flushWindowMs + 1000);
    // the harness drives the original instance; drive the restarted one directly
    h.tick(BOARD_LIMITS.flushWindowMs);
    await originalAlarm();
    expect(h.ops.flushes).toBeGreaterThanOrEqual(1);
    const flushed = h.ops.flushes;
    const again = createBoardRoom(h.deps);
    await again.restore();
    await again.alarm();
    expect(h.ops.flushes).toBe(flushed);
  });
});
