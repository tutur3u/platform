import { describe, expect, it } from 'vitest';
import { BoardLoadError, createBoardRoom } from './board-sync-core';
import { big, change, el, harness } from './board-sync-core.fixtures';
import { BOARD_LIMITS } from './board-sync-schema';

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

describe('elements the room cannot hold are never read as deleted', () => {
  async function conflicted(options: { dirty?: boolean }) {
    const h = harness({ connections: 0 });
    let calls = 0;
    h.setLoad(async () => ({
      status: 200,
      result: { updatedAt: 'base', elements: [el('a'), el('grew')] },
    }));
    h.setFlush(async () => {
      calls++;
      return calls === 1
        ? {
            status: 409,
            // `grew` passed a budget on the web: it is stored but not offered.
            result: {
              updatedAt: 'web',
              elements: [el('a')],
              preservedIds: ['grew'],
            },
          }
        : { status: 200, result: { updatedAt: 'merged' } };
    });
    await h.room.prepare();
    await h.room.edit([change(el('c', 2))]);
    if (options.dirty) await h.room.edit([change(el('grew', 2))]);
    await h.advance(60 * 60_000);
    return h;
  }

  it('drops its own copy without a tombstone', async () => {
    const h = await conflicted({});
    const ids = h.room.elements().map((e) => e.id);
    expect(ids).not.toContain('grew');
    expect(h.room.elements().some((e) => e.isDeleted)).toBe(false);
    const sent = h.broadcasts.flatMap((m: any) =>
      m.type === 'elements' ? m.changes.map((c: any) => c.element) : []
    );
    expect(sent.find((e: any) => e.id === 'grew')).toBeUndefined();
  });

  it('keeps an element it edited, for the platform to compare by version', async () => {
    const h = await conflicted({ dirty: true });
    expect(h.room.elements().find((e) => e.id === 'grew')?.version).toBe(2);
  });
});

describe('concurrent first joins', () => {
  it('share one load, so a later load cannot replace a scene already drawn on', async () => {
    const h = harness({ connections: 1 });
    let release: () => void = () => {};
    let loads = 0;
    h.setLoad(
      () =>
        new Promise((resolve) => {
          loads++;
          release = () =>
            resolve({
              status: 200,
              result: { updatedAt: 'base', elements: [el('seed')] },
            });
        })
    );
    const first = h.room.prepare();
    const second = h.room.prepare();
    release();
    await first;
    await h.room.edit([change(el('drawn', 2))]);
    await second;
    expect(loads).toBe(1);
    expect(h.room.elements().map((e) => e.id)).toContain('drawn');
  });
});

describe('deleted elements free space', () => {
  it('keeps only identity and version of a deleted element', async () => {
    const h = harness();
    await h.room.prepare();
    await h.room.edit([change(big('b'))]);
    await h.room.edit([change({ ...big('b', 2), isDeleted: true })]);
    const kept = h.room.elements().find((e) => e.id === 'b')!;
    expect(kept.isDeleted).toBe(true);
    expect(JSON.stringify(kept).length).toBeLessThan(500);
  });

  it('lets a board at the cap take new content after deleting some', async () => {
    const h = harness();
    await h.room.prepare();
    let refused = false;
    for (let i = 0; i < 40; i++)
      refused ||= (await h.room.edit([change(big(`b${i}`))])).rejected !== null;
    expect(refused).toBe(true);
    for (let i = 0; i < 20; i++)
      await h.room.edit([change({ ...big(`b${i}`, 2), isDeleted: true })]);
    const again = await h.room.edit([change(big('fresh'))]);
    expect(again.rejected).toBeNull();
    expect(again.applied).toHaveLength(1);
  });
});

describe('a reload drops stale chunks', () => {
  it('deletes the chunk keys of the scene it replaces', async () => {
    const h = harness({ connections: 0 });
    await h.room.prepare();
    for (let i = 0; i < 30; i++) await h.room.edit([change(big(`b${i}`))]);
    await h.advance(60 * 60_000);
    const before = [...h.store.keys()].filter((k) => k.startsWith('scene:'));
    expect(before.length).toBeGreaterThan(1);
    h.setLoad(async () => ({
      status: 200,
      result: { updatedAt: 'web', elements: [el('only')] },
    }));
    await h.room.prepare();
    const after = [...h.store.keys()].filter((k) => k.startsWith('scene:'));
    expect(after).toEqual(['scene:0']);
  });
});
