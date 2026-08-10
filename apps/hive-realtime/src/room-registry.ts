import type { HiveRealtimeAwareness } from './protocol';

export type RoomState<Client> = {
  awareness: Map<string, HiveRealtimeAwareness>;
  clients: Set<Client>;
};

export class RoomRegistry<Client> {
  readonly #rooms = new Map<string, RoomState<Client>>();

  get size() {
    return this.#rooms.size;
  }

  getOrCreate(serverId: string): RoomState<Client> {
    const existing = this.#rooms.get(serverId);
    if (existing) return existing;

    const created = {
      awareness: new Map<string, HiveRealtimeAwareness>(),
      clients: new Set<Client>(),
    };
    this.#rooms.set(serverId, created);
    return created;
  }

  getExisting(serverId: string): RoomState<Client> | undefined {
    return this.#rooms.get(serverId);
  }

  removeClient(
    serverId: string,
    client: Client,
    userId: string
  ): RoomState<Client> | undefined {
    const room = this.#rooms.get(serverId);
    if (!room) return undefined;

    const removed = room.clients.delete(client);
    if (removed) room.awareness.delete(userId);

    if (room.clients.size === 0) {
      this.#rooms.delete(serverId);
      return undefined;
    }

    return room;
  }

  pruneAwareness(
    serverId: string,
    now: number,
    ttlMs: number
  ): RoomState<Client> | undefined {
    const room = this.#rooms.get(serverId);
    if (!room) return undefined;

    for (const [userId, awareness] of room.awareness) {
      if (Date.parse(awareness.lastSeenAt) + ttlMs < now) {
        room.awareness.delete(userId);
      }
    }

    return room;
  }

  forEachExisting(
    callback: (room: RoomState<Client>, serverId: string) => void
  ) {
    this.#rooms.forEach(callback);
  }
}

type IntervalClock<Handle> = {
  clearInterval(handle: Handle): void;
  setInterval(callback: () => void, intervalMs: number): Handle;
};

export function createRoomMaintenance<Handle>({
  clock,
  intervalMs,
  sweep,
}: {
  clock: IntervalClock<Handle>;
  intervalMs: number;
  sweep: () => void;
}) {
  let activeLeases = 0;
  let intervalHandle: Handle | undefined;

  return {
    acquire() {
      activeLeases += 1;
      if (intervalHandle === undefined) {
        intervalHandle = clock.setInterval(sweep, intervalMs);
      }

      let released = false;
      return () => {
        if (released) return;
        released = true;
        activeLeases -= 1;

        if (activeLeases === 0 && intervalHandle !== undefined) {
          clock.clearInterval(intervalHandle);
          intervalHandle = undefined;
        }
      };
    },
  };
}
