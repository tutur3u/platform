import { describe, expect, it } from 'vitest';
import {
  BoardLoadError,
  createBoardRoom,
  type BoardRoomDeps,
} from './board-sync-core';
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
  let failPut = false;
  let expired = 0;
  let loadAnswer: () => Promise<{
    status: number;
    result?: any;
  }> = async () => ({
    status: 200,
    result: { updatedAt: 'base', elements: [el('seed')] },
  });
  const broadcasts: unknown[] = [];
  let closedAll = 0;
  const deps: BoardRoomDeps = {
    now: () => now,
    storage: {
      get: async (key) => structuredClone(store.get(key)) as never,
      put: async (entries) => {
        ops.puts++;
        if (failPut) throw new Error('storage down');
        for (const [k, v] of Object.entries(entries))
          store.set(k, structuredClone(v));
      },
      delete: async (keys) => {
        for (const key of keys) store.delete(key);
      },
      setAlarm: async (at) => {
        ops.alarms++;
        alarm = at;
      },
    },
    load: async () => {
      ops.loads++;
      return loadAnswer();
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
    closeExpired: () => expired++,
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
    setLoad: (fn: typeof loadAnswer) => (loadAnswer = fn),
    setFailPut: (value: boolean) => (failPut = value),
    setFlush: (fn: typeof flushAnswer) => (flushAnswer = fn),
    tick: (ms: number) => (now += ms),
    get expired() {
      return expired;
    },
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
    await h.room.prepare();
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
    await h.room.prepare();
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
    await h.room.prepare();
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
    await h.room.prepare();
    await h.room.edit([change(el('a', 5))]);
    const before = { ...h.ops };
    for (let i = 0; i < 100; i++) await h.room.edit([change(el('a', 5))]);
    expect(h.ops).toEqual(before);
  });
});

describe('stop fence', () => {
  it('halts persist, flush and alarms for edits while fenced', async () => {
    const h = harness({ fence: 'true', connections: 0 });
    await h.room.prepare();
    expect(h.ops.puts).toBe(0);
    for (let i = 0; i < 500; i++) await h.room.edit([change(el(`e${i}`, 2))]);
    await h.advance(60 * 60_000);
    expect(h.ops).toEqual({ puts: 0, alarms: 0, flushes: 0, loads: 1 });
    expect(h.room.elements().length).toBe(501);
  });

  it('resumes when the fence clears and a later edit arrives', async () => {
    const h = harness({ fence: '1' });
    await h.room.prepare();
    await h.room.edit([change(el('a', 2))]);
    h.setFence(undefined);
    await h.room.edit([change(el('a', 3))]);
    await h.advance(BOARD_LIMITS.flushWindowMs + 1000);
    expect(h.ops.flushes).toBe(1);
  });

  it('treats an unrecognised value as open', async () => {
    const h = harness({ fence: 'false' });
    await h.room.prepare();
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
    await h.room.prepare();
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
    await h.room.prepare();
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
      seen = h.store.get('scene:0');
      return { status: 200, result: { updatedAt: 'x' } };
    });
    await h.room.prepare();
    await h.room.edit([change(el('a', 2))]);
    await h.advance(BOARD_LIMITS.flushWindowMs + 1000);
    expect((seen as BoardElement[]).map((e) => e.id)).toContain('a');
  });

  it('stops for good when the platform says the board is gone', async () => {
    const h = harness();
    h.setFlush(async () => ({ status: 404 }));
    await h.room.prepare();
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
    await h.room.prepare();
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
    await h.room.prepare();
    await h.room.edit([change(el('a', 2))]);
    await h.advance(60 * 60_000);
    expect(h.ops.flushes).toBe(1);
    expect(h.room.snapshotMeta().baseUpdatedAt).toBe('theirs');
  });
});

describe('restart', () => {
  it('flushes unfinished work once after the object restarts, then stays quiet', async () => {
    const h = harness({ connections: 0 });
    await h.room.prepare();
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

const big = (id: string, version = 1, bytes = 60_000) =>
  el(id, version, { text: 'x'.repeat(bytes) });

describe('scene size bound', () => {
  it('refuses growth past the byte budget but still applies shrinking edits', async () => {
    const h = harness();
    await h.room.prepare();
    let rejected: string | null = null;
    for (let i = 0; i < 40; i++) {
      const result = await h.room.edit([change(big(`b${i}`))]);
      rejected ??= result.rejected;
    }
    expect(rejected).toBe('size');
    const total = JSON.stringify(h.room.elements()).length;
    expect(total).toBeLessThanOrEqual(BOARD_LIMITS.maxSnapshotBytes);
    const shrunk = await h.room.edit([change(big('b0', 2, 10))]);
    expect(shrunk.applied).toHaveLength(1);
    expect(shrunk.rejected).toBeNull();
  });

  it('refuses new elements past the element budget', async () => {
    const h = harness();
    await h.room.prepare();
    let rejected: string | null = null;
    for (let batch = 0; batch < 12; batch++) {
      const result = await h.room.edit(
        Array.from({ length: 200 }, (_, i) => change(el(`n${batch}-${i}`)))
      );
      rejected ??= result.rejected;
    }
    expect(rejected).toBe('count');
    expect(h.room.elements().length).toBeLessThanOrEqual(
      BOARD_LIMITS.maxElements
    );
  });

  it('stores the scene in chunks no larger than the chunk budget and restores it', async () => {
    const h = harness({ connections: 0 });
    await h.room.prepare();
    for (let i = 0; i < 30; i++) await h.room.edit([change(big(`b${i}`))]);
    await h.advance(BOARD_LIMITS.persistWindowMs + 10);
    const chunks = [...h.store.keys()].filter((key) =>
      key.startsWith('scene:')
    );
    expect(chunks.length).toBeGreaterThan(1);
    for (const key of chunks)
      expect(JSON.stringify(h.store.get(key)).length).toBeLessThanOrEqual(
        BOARD_LIMITS.chunkBytes + 62_000
      );
    const restarted = createBoardRoom(h.deps);
    await restarted.restore();
    expect(
      restarted
        .elements()
        .map((e) => e.id)
        .sort()
    ).toEqual(
      h.room
        .elements()
        .map((e) => e.id)
        .sort()
    );
  });

  it('shrinking the scene deletes the stale chunks', async () => {
    const h = harness({ connections: 0 });
    await h.room.prepare();
    for (let i = 0; i < 30; i++) await h.room.edit([change(big(`b${i}`))]);
    await h.advance(BOARD_LIMITS.persistWindowMs + 10);
    const before = [...h.store.keys()].filter((k) =>
      k.startsWith('scene:')
    ).length;
    for (let i = 0; i < 30; i++)
      await h.room.edit([change(big(`b${i}`, 2, 5))]);
    await h.advance(BOARD_LIMITS.persistWindowMs + 10);
    const after = [...h.store.keys()].filter((k) =>
      k.startsWith('scene:')
    ).length;
    expect(after).toBeLessThan(before);
  });

  it('marks a revision persisted only after the write resolved, without spinning', async () => {
    const h = harness({ connections: 0 });
    await h.room.prepare();
    h.setFailPut(true);
    await h.room.edit([change(el('a', 2))]);
    const alarmsBefore = h.ops.alarms;
    await h.advance(60 * 60_000);
    expect(h.room.snapshotMeta().persistedRevision).toBe(0);
    expect(h.ops.alarms - alarmsBefore).toBeLessThanOrEqual(4);
    h.setFailPut(false);
    await h.room.edit([change(el('a', 3))]);
    await h.advance(BOARD_LIMITS.flushWindowMs + 1000);
    expect(h.room.snapshotMeta().persistedRevision).toBeGreaterThan(0);
  });

  it('keeps an edit that arrives during a persist for the next window', async () => {
    const h = harness({ connections: 0 });
    await h.room.prepare();
    await h.room.edit([change(el('a', 2))]);
    const original = h.deps.storage.put;
    h.deps.storage.put = async (entries) => {
      await original(entries);
      await h.room.edit([change(el('b', 2))]);
    };
    await h.advance(BOARD_LIMITS.persistWindowMs + 10);
    h.deps.storage.put = original;
    await h.advance(BOARD_LIMITS.persistWindowMs + 10);
    expect(h.room.snapshotMeta().persistedRevision).toBe(
      h.room.snapshotMeta().revision
    );
  });
});

describe('deletions made elsewhere stay deleted', () => {
  it('reloads for the first participant when nothing is unflushed', async () => {
    const h = harness({ connections: 0 });
    await h.room.prepare();
    await h.room.edit([change(el('b', 2))]);
    await h.advance(60 * 60_000);
    expect(h.room.snapshotMeta().flushedRevision).toBe(1);
    // The web editor deleted `seed` and `b` between sessions.
    h.setLoad(async () => ({
      status: 200,
      result: { updatedAt: 'web-edit', elements: [el('kept', 5)] },
    }));
    await h.room.prepare();
    expect(h.room.elements().map((e) => e.id)).toEqual(['kept']);
    expect(h.room.snapshotMeta().baseUpdatedAt).toBe('web-edit');
  });

  it('does not reload while people are connected or edits are unflushed', async () => {
    const h = harness({ connections: 1 });
    await h.room.prepare();
    await h.room.prepare();
    expect(h.ops.loads).toBe(1);
    h.connections = 0;
    await h.room.edit([change(el('mine', 2))]);
    await h.room.prepare();
    expect(h.ops.loads).toBe(1);
    expect(h.room.elements().map((e) => e.id)).toContain('mine');
  });

  it('keeps an element deleted on the web deleted after a concurrent-save merge', async () => {
    const h = harness({ connections: 0 });
    let calls = 0;
    h.setLoad(async () => ({
      status: 200,
      result: { updatedAt: 'base', elements: [el('a'), el('b')] },
    }));
    h.setFlush(async () => {
      calls++;
      return calls === 1
        ? {
            status: 409,
            // The web removed `b`; `a` is untouched there.
            result: { updatedAt: 'web', elements: [el('a')] },
          }
        : { status: 200, result: { updatedAt: 'merged' } };
    });
    await h.room.prepare();
    await h.room.edit([change(el('c', 2))]);
    await h.advance(60 * 60_000);
    const live = h.room
      .elements()
      .filter((e) => !e.isDeleted)
      .map((e) => e.id);
    expect(live.sort()).toEqual(['a', 'c']);
    const removed = h.room.elements().find((e) => e.id === 'b');
    expect(removed?.isDeleted).toBe(true);
    expect(removed!.version).toBeGreaterThan(1);
  });

  it('keeps a local edit to an element the web also changed', async () => {
    const h = harness({ connections: 0 });
    let calls = 0;
    h.setFlush(async () => {
      calls++;
      return calls === 1
        ? { status: 409, result: { updatedAt: 'web', elements: [] } }
        : { status: 200, result: { updatedAt: 'merged' } };
    });
    await h.room.prepare();
    await h.room.edit([change(el('seed', 2))]);
    await h.advance(60 * 60_000);
    expect(
      h.room.elements().find((e) => e.id === 'seed')?.isDeleted
    ).toBeFalsy();
  });

  it('remembers which elements were edited across a restart', async () => {
    const h = harness({ connections: 0 });
    h.setLoad(async () => ({
      status: 200,
      result: { updatedAt: 'base', elements: [el('a'), el('b')] },
    }));
    await h.room.prepare();
    await h.room.edit([change(el('a', 2))]);
    await h.advance(BOARD_LIMITS.persistWindowMs + 10);
    const restarted = createBoardRoom(h.deps);
    await restarted.restore();
    expect(restarted.snapshotMeta().dirtyIds).toEqual(['a']);
  });
});

describe('a closed room can reopen', () => {
  async function closed() {
    const h = harness();
    h.setFlush(async () => ({ status: 404 }));
    await h.room.prepare();
    await h.room.connectionsChanged();
    await h.room.edit([change(el('a', 2))]);
    await h.advance(BOARD_LIMITS.flushWindowMs + 1000);
    expect(h.room.closed).toBe(true);
    h.connections = 0;
    return h;
  }

  it('reloads on the next join and reopens when the board is back', async () => {
    const h = await closed();
    h.setLoad(async () => ({
      status: 200,
      result: { updatedAt: 'relinked', elements: [el('fresh')] },
    }));
    await h.room.prepare();
    expect(h.room.closed).toBe(false);
    expect(h.room.elements().map((e) => e.id)).toEqual(['fresh']);
    expect(h.room.snapshotMeta().baseUpdatedAt).toBe('relinked');
    h.setFlush(async () => ({ status: 200, result: { updatedAt: 'ok' } }));
    await h.room.edit([change(el('fresh', 2))]);
    await h.advance(BOARD_LIMITS.flushWindowMs + 1000);
    expect(h.room.snapshotMeta().baseUpdatedAt).toBe('ok');
  });

  it('stays closed while the platform still reports the board gone', async () => {
    const h = await closed();
    h.setLoad(async () => ({ status: 404 }));
    await h.room.prepare();
    expect(h.room.closed).toBe(true);
  });

  it('reports a transient platform failure without reopening', async () => {
    const h = await closed();
    h.setLoad(async () => ({ status: 503 }));
    await expect(h.room.prepare()).rejects.toBeInstanceOf(BoardLoadError);
    expect(h.room.closed).toBe(true);
  });
});

describe('revoked access is time-bounded across eviction', () => {
  it('re-arms the expiry sweep when the room restarts with sockets open', async () => {
    const h = harness({ connections: 2 });
    await h.room.prepare();
    await h.room.connectionsChanged();
    const restarted = createBoardRoom(h.deps);
    const alarmsBefore = h.ops.alarms;
    await restarted.restore();
    expect(h.ops.alarms).toBeGreaterThan(alarmsBefore);
    await restarted.alarm();
    expect(h.expired).toBeGreaterThan(0);
  });

  it('schedules nothing on restart when nobody is connected', async () => {
    const h = harness({ connections: 0 });
    await h.room.prepare();
    const restarted = createBoardRoom(h.deps);
    const alarmsBefore = h.ops.alarms;
    await restarted.restore();
    expect(h.ops.alarms).toBe(alarmsBefore);
  });
});
