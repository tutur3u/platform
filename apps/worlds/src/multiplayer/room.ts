import type { World } from '@tuturuuu/worlds';
import { edufestHall } from '@tuturuuu/worlds/edufest-hall';
import {
  isRoomScope,
  type RoomScope,
  roomName,
  verifyRoomAdmission,
} from './admission.ts';
import {
  consumeFrame,
  createMovementValidator,
  createPlayer,
  nearby,
  type Peer,
  type Player,
  publicPeer,
  readMovement,
  restorePlayer,
  ROOM_CAPACITY,
} from './room-state.ts';

export const EDUFEST_HALL_REVISION = 'edufest-hall-v1';

export type RoomEvent =
  | { type: 'ready'; self: Peer; peers: Peer[]; leaseUntil: number }
  | { type: 'peer'; peer: Peer }
  | { type: 'leave'; id: string }
  | { type: 'position'; self: Peer };

export type RoomSocket = {
  readonly readyState: number;
  send(value: string): void;
  close(code: number, reason: string): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
};

type RoomObjectId = { toString(): string };
type RoomContext = {
  id: RoomObjectId;
  storage: {
    get(key: string): Promise<unknown>;
    put(key: string, value: boolean): Promise<void>;
  };
  getWebSockets(): RoomSocket[];
  acceptWebSocket(socket: RoomSocket): void;
};

type RoomEnv = {
  WORLDS_ROOM_ADMISSION_SECRET: string;
  WORLDS_ROOMS: { idFromName(name: string): RoomObjectId };
};

type SocketEntry = { socket: RoomSocket; player: Player };
type RoomWorld = { world: World; scope: RoomScope };

const STOP_KEY = 'stopped:v1';
const INTERNAL_ROOM_PATH = '/room';

function upgrade() {
  const { WebSocketPair } = globalThis as typeof globalThis & {
    WebSocketPair: new () => { 0: WebSocket; 1: RoomSocket };
  };
  const { 0: client, 1: server } = new WebSocketPair();
  return {
    server,
    response: new Response(null, {
      status: 101,
      webSocket: client,
    } as ResponseInit),
  };
}

function send(socket: RoomSocket, event: RoomEvent) {
  try {
    socket.send(JSON.stringify(event));
  } catch {
    socket.close(1011, 'Send failed');
  }
}

export function createWorldRoom(
  resolveWorld: (scope: RoomScope) => World | null,
  options = { clock: Date.now, upgrade }
) {
  return class WorldRoom {
    private readonly ctx: RoomContext;
    private readonly env: RoomEnv;
    private readonly initialized: Promise<void>;
    private stopped = false;
    private stopWrite?: Promise<void>;
    private room: RoomWorld | null = null;
    private validateMovement: ReturnType<
      typeof createMovementValidator
    > | null = null;

    constructor(ctx: RoomContext, env: RoomEnv) {
      this.ctx = ctx;
      this.env = env;
      this.initialized = ctx.storage.get(STOP_KEY).then((stored) => {
        this.stopped = stored === true;
        if (this.stopped) {
          this.stopWrite = Promise.resolve();
          this.closeStoppedSockets();
        }
      });
    }

    private closeStoppedSockets() {
      for (const socket of this.ctx.getWebSockets()) {
        socket.close(1001, 'Room stopped');
      }
    }

    /** Call from the Worker adapter's authorized room shutdown operation. */
    async stop() {
      await this.initialized;
      this.stopped = true;
      this.stopWrite ??= this.ctx.storage.put(STOP_KEY, true).catch((error) => {
        this.stopWrite = undefined;
        throw error;
      });
      await this.stopWrite;
      this.closeStoppedSockets();
    }

    private bind(scope: RoomScope) {
      const name = roomName(scope);
      if (this.room)
        return roomName(this.room.scope) === name ? this.room : null;
      if (
        this.ctx.id.toString() !==
        this.env.WORLDS_ROOMS.idFromName(name).toString()
      )
        return null;
      const target = {
        worldId: scope.worldId,
        revision: scope.revision,
        shard: scope.shard,
      };
      const world = resolveWorld(target);
      if (!world || world.id !== target.worldId || !world.spawns[0])
        return null;
      this.room = { scope: target, world };
      this.validateMovement = createMovementValidator(world);
      return this.room;
    }

    private readPlayer(socket: RoomSocket): Player | null {
      const attachment = socket.deserializeAttachment();
      if (
        typeof attachment !== 'object' ||
        attachment === null ||
        !('scope' in attachment)
      )
        return null;
      const { scope } = attachment;
      if (!isRoomScope(scope)) return null;
      const room = this.bind(scope);
      return room && restorePlayer(attachment, room.world, room.scope);
    }

    private activePlayers(now: number, excluded?: RoomSocket) {
      const entries: SocketEntry[] = [];
      const expired: Player[] = [];
      for (const socket of this.ctx.getWebSockets()) {
        if (socket === excluded || socket.readyState !== 1) continue;
        const player = this.readPlayer(socket);
        if (
          player &&
          player.leaseUntil * 1000 > now &&
          entries.length < ROOM_CAPACITY
        ) {
          entries.push({ socket, player });
          continue;
        }
        if (player) expired.push(player);
        socket.serializeAttachment(null);
        socket.close(1008, 'Admission ended');
      }
      for (const player of expired) this.notifyDeparture(player, entries);
      return entries;
    }

    private notifyDeparture(departed: Player, entries: SocketEntry[]) {
      for (const { player, socket } of entries) {
        if (nearby(departed, player))
          send(socket, { type: 'leave', id: departed.peerId });
      }
    }

    async fetch(request: Request): Promise<Response> {
      if (new URL(request.url).pathname !== INTERNAL_ROOM_PATH)
        return new Response(null, { status: 404 });
      if (
        request.method !== 'GET' ||
        request.headers.get('upgrade')?.toLowerCase() !== 'websocket'
      )
        return new Response(null, { status: 426 });

      const token = request.headers
        .get('authorization')
        ?.match(/^Bearer ([A-Za-z0-9_.-]+)$/)?.[1];
      if (!token) return new Response(null, { status: 401 });
      await this.initialized;
      if (this.stopped) return new Response(null, { status: 503 });
      const admission = await verifyRoomAdmission(
        token,
        this.env.WORLDS_ROOM_ADMISSION_SECRET,
        options.clock
      );
      if (this.stopped) return new Response(null, { status: 503 });
      if (!admission) return new Response(null, { status: 401 });
      const room = this.bind(admission);
      if (!room) return new Response(null, { status: 403 });

      const now = options.clock();
      if (admission.expiresAt * 1000 <= now)
        return new Response(null, { status: 401 });
      const entries = this.activePlayers(now);
      if (entries.some(({ player }) => player.actorId === admission.actorId))
        return new Response(null, { status: 409 });
      const spawn = room.world.spawns[0];
      if (entries.length >= ROOM_CAPACITY)
        return new Response(null, { status: 429 });
      if (!spawn) return new Response(null, { status: 503 });

      const player = createPlayer(admission, spawn, now);
      const { server, response } = options.upgrade();
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment(player);
      const neighbors = entries.filter((entry) => nearby(player, entry.player));
      const self = publicPeer(player);
      send(server, {
        type: 'ready',
        self,
        peers: neighbors.map((entry) => publicPeer(entry.player)),
        leaseUntil: player.leaseUntil,
      });
      for (const { socket } of neighbors)
        send(socket, { type: 'peer', peer: self });
      return response;
    }

    async webSocketMessage(socket: RoomSocket, message: string | ArrayBuffer) {
      await this.initialized;
      if (this.stopped || socket.readyState !== 1) return;
      const now = options.clock();
      const previous = this.readPlayer(socket);
      if (!previous || previous.leaseUntil * 1000 <= now) {
        this.depart(socket, now, 1008);
        return;
      }

      const counted = consumeFrame(previous, now);
      const point = counted && readMovement(message);
      if (!counted || !point) {
        this.depart(socket, now, 1008);
        return;
      }
      const next = this.validateMovement?.(counted, point, now);
      const entries = this.activePlayers(now);
      socket.serializeAttachment(next ?? counted);
      send(socket, { type: 'position', self: publicPeer(next ?? counted) });
      if (!next) return;

      const peer = publicPeer(next);
      for (const entry of entries) {
        const wasNearby = nearby(previous, entry.player);
        const isNearby = nearby(next, entry.player);
        if (isNearby) {
          send(entry.socket, { type: 'peer', peer });
          if (!wasNearby)
            send(socket, { type: 'peer', peer: publicPeer(entry.player) });
        } else if (wasNearby) {
          send(entry.socket, { type: 'leave', id: peer.id });
          send(socket, { type: 'leave', id: entry.player.peerId });
        }
      }
    }

    private depart(socket: RoomSocket, now: number, code?: number) {
      const player = this.readPlayer(socket);
      socket.serializeAttachment(null);
      if (code !== undefined) socket.close(code, 'Admission ended');
      if (player) this.notifyDeparture(player, this.activePlayers(now, socket));
    }

    async webSocketClose(socket: RoomSocket) {
      await this.initialized;
      if (!this.stopped) this.depart(socket, options.clock());
    }

    async webSocketError(socket: RoomSocket) {
      await this.initialized;
      if (!this.stopped) this.depart(socket, options.clock(), 1011);
    }
  };
}

export const WorldRoom = createWorldRoom((scope) =>
  scope.worldId === edufestHall.id && scope.revision === EDUFEST_HALL_REVISION
    ? edufestHall
    : null
);
