import { createBoardRoom, type BoardRoomDeps } from './board-sync-core';
import type { BoardChange, BoardElement } from './board-sync-schema';

export const el = (id: string, version = 1, extra: object = {}): BoardElement =>
  ({
    id,
    type: 'rectangle',
    version,
    versionNonce: 1,
    ...extra,
  }) as BoardElement;
export const change = (element: BoardElement): BoardChange => ({
  type: 'update',
  element,
});

export function harness(
  options: { fence?: string; connections?: number } = {}
) {
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

export const big = (id: string, version = 1, bytes = 60_000) =>
  el(id, version, { text: 'x'.repeat(bytes) });
