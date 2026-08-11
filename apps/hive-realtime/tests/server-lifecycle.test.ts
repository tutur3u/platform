import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HiveRealtimeAwareness } from '../src/protocol';
import { createRoomMaintenance, RoomRegistry } from '../src/room-registry';

const mocks = vi.hoisted(() => ({
  loadHiveCrdtSnapshot: vi.fn(),
  persistHiveCrdtUpdate: vi.fn(),
  persistHiveWorldEvent: vi.fn(),
}));

vi.mock('../src/hive-db', () => mocks);

import { createHiveRealtimeServer } from '../src/server';

const SERVER_ID = '8f7fa5cf-8bb1-446a-9c51-f4222f452f4d';
const USER_ONE = '00000000-0000-4000-8000-000000000001';
const USER_TWO = '00000000-0000-4000-8000-000000000002';

function awareness(
  userId: string,
  lastSeenAt = '2026-08-10T00:00:00.000Z'
): HiveRealtimeAwareness {
  return {
    color: '#65a5d8',
    displayName: userId,
    lastSeenAt,
    role: 'member',
    userId,
  };
}

describe('RoomRegistry', () => {
  it('retains a multi-client room, then evicts it on the final close', () => {
    const registry = new RoomRegistry<object>();
    const firstClient = {};
    const secondClient = {};
    const room = registry.getOrCreate(SERVER_ID);
    room.clients.add(firstClient);
    room.clients.add(secondClient);
    room.awareness.set(USER_ONE, awareness(USER_ONE));
    room.awareness.set(USER_TWO, awareness(USER_TWO));

    const remaining = registry.removeClient(SERVER_ID, firstClient, USER_ONE);
    expect(remaining?.clients).toEqual(new Set([secondClient]));
    expect(remaining?.awareness.has(USER_ONE)).toBe(false);
    expect(remaining?.awareness.has(USER_TWO)).toBe(true);
    expect(registry.size).toBe(1);

    const reconnectedClient = {};
    remaining?.clients.add(reconnectedClient);
    remaining?.awareness.set(USER_ONE, awareness(USER_ONE));
    registry.removeClient(SERVER_ID, firstClient, USER_ONE);
    expect(remaining?.awareness.has(USER_ONE)).toBe(true);

    expect(registry.removeClient(SERVER_ID, secondClient, USER_TWO)).toBe(
      remaining
    );
    expect(registry.size).toBe(1);
    expect(registry.removeClient(SERVER_ID, reconnectedClient, USER_ONE)).toBe(
      undefined
    );
    expect(registry.size).toBe(0);
    expect(registry.removeClient(SERVER_ID, reconnectedClient, USER_ONE)).toBe(
      undefined
    );
    expect(registry.size).toBe(0);
  });

  it('creates fresh ephemeral state when a client reconnects after eviction', () => {
    const registry = new RoomRegistry<object>();
    const client = {};
    const initialRoom = registry.getOrCreate(SERVER_ID);
    initialRoom.clients.add(client);
    initialRoom.awareness.set(USER_ONE, awareness(USER_ONE));

    registry.removeClient(SERVER_ID, client, USER_ONE);
    const reconnectedRoom = registry.getOrCreate(SERVER_ID);

    expect(reconnectedRoom).not.toBe(initialRoom);
    expect(reconnectedRoom.clients.size).toBe(0);
    expect(reconnectedRoom.awareness.size).toBe(0);
  });

  it('prunes stale awareness only from an existing active room', () => {
    const registry = new RoomRegistry<object>();
    registry.pruneAwareness(SERVER_ID, Date.now(), 30_000);
    expect(registry.size).toBe(0);

    const room = registry.getOrCreate(SERVER_ID);
    room.clients.add({});
    room.awareness.set(
      USER_ONE,
      awareness(USER_ONE, '2026-08-10T00:00:00.000Z')
    );
    room.awareness.set(
      USER_TWO,
      awareness(USER_TWO, '2026-08-10T00:00:50.000Z')
    );

    registry.pruneAwareness(
      SERVER_ID,
      Date.parse('2026-08-10T00:01:00.000Z'),
      30_000
    );
    expect([...room.awareness.keys()]).toEqual([USER_TWO]);
  });
});

describe('room maintenance', () => {
  it('shares one timer across leases and tears it down after the final stop', () => {
    const callbacks = new Map<number, () => void>();
    const clearInterval = vi.fn((handle: number) => callbacks.delete(handle));
    const setInterval = vi.fn((callback: () => void) => {
      const handle = setInterval.mock.calls.length;
      callbacks.set(handle, callback);
      return handle;
    });
    const sweep = vi.fn();
    const maintenance = createRoomMaintenance({
      clock: { clearInterval, setInterval },
      intervalMs: 10_000,
      sweep,
    });

    const releaseFirst = maintenance.acquire();
    const releaseSecond = maintenance.acquire();
    expect(setInterval).toHaveBeenCalledOnce();
    callbacks.values().next().value?.();
    expect(sweep).toHaveBeenCalledOnce();

    releaseFirst();
    releaseFirst();
    expect(clearInterval).not.toHaveBeenCalled();
    releaseSecond();
    expect(clearInterval).toHaveBeenCalledOnce();
    expect(callbacks.size).toBe(0);

    const releaseReconnect = maintenance.acquire();
    expect(setInterval).toHaveBeenCalledTimes(2);
    releaseReconnect();
    expect(clearInterval).toHaveBeenCalledTimes(2);
  });
});

describe('Hive realtime server lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.loadHiveCrdtSnapshot.mockResolvedValue({
      crdt_state: Buffer.from([1, 2, 3]),
      crdt_state_vector: Buffer.from([4, 5, 6]),
      op_seq: 7,
      world_data: { blocks: [], objects: [] },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('preserves active presence, reloads durable state after eviction, and stops timers', async () => {
    const handlers: Array<any> = [];
    const stopped: Array<ReturnType<typeof vi.fn>> = [];
    vi.stubGlobal('Bun', {
      serve: vi.fn((options) => {
        handlers.push(options.websocket);
        const stop = vi.fn().mockResolvedValue(undefined);
        stopped.push(stop);
        return { port: options.port, stop };
      }),
    });

    const firstServer = createHiveRealtimeServer({ port: 7815 });
    const secondServer = createHiveRealtimeServer({ port: 7816 });
    expect(vi.getTimerCount()).toBe(1);

    const firstClient = fakeSocket(USER_ONE);
    const secondClient = fakeSocket(USER_TWO);
    handlers[0].open(firstClient);
    handlers[0].open(secondClient);
    await vi.waitFor(() => {
      expect(mocks.loadHiveCrdtSnapshot).toHaveBeenCalledTimes(2);
    });

    handlers[0].close(firstClient);
    expect(lastPresence(secondClient)?.awareness).toEqual([
      expect.objectContaining({ userId: USER_TWO }),
    ]);

    handlers[0].close(secondClient);
    handlers[0].close(secondClient);

    const reconnectedClient = fakeSocket(USER_ONE);
    handlers[0].open(reconnectedClient);
    await vi.waitFor(() => {
      expect(mocks.loadHiveCrdtSnapshot).toHaveBeenCalledTimes(3);
    });
    expect(
      reconnectedClient.send.mock.calls
        .map(([payload]) => JSON.parse(String(payload)))
        .find((message) => message.type === 'sync.snapshot')
    ).toMatchObject({ opSeq: 7, type: 'sync.snapshot' });
    handlers[0].close(reconnectedClient);

    await firstServer.stop();
    expect(vi.getTimerCount()).toBe(1);
    await firstServer.stop();
    expect(vi.getTimerCount()).toBe(1);
    await secondServer.stop();
    expect(vi.getTimerCount()).toBe(0);
    expect(stopped[0]).toHaveBeenCalledTimes(2);
    expect(stopped[1]).toHaveBeenCalledOnce();
  });
});

function fakeSocket(userId: string) {
  return {
    data: {
      token: {
        exp: 1_800_000_000,
        role: 'member',
        scopes: [],
        serverId: SERVER_ID,
        userId,
      },
    },
    readyState: 1,
    send: vi.fn(),
  };
}

function lastPresence(socket: ReturnType<typeof fakeSocket>) {
  return socket.send.mock.calls
    .map(([payload]) => JSON.parse(String(payload)))
    .filter((message) => message.type === 'presence')
    .at(-1);
}
