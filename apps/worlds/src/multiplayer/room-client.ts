import { isActorId, isRecord, ROOM_LEASE_SECONDS } from './admission.ts';
import type { RoomEvent } from './room.ts';
import { ROOM_CAPACITY, type Peer } from './room-state.ts';

type Disconnected = 'idle' | 'joining' | 'unavailable' | 'expired';
export type RoomState =
  | { status: Disconnected }
  | {
      status: 'joined';
      self: Peer;
      peers: Peer[];
      leaseUntil: number;
    };

function isPeer(value: unknown): value is Peer {
  return (
    isRecord(value) &&
    isActorId(value.id) &&
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    typeof value.z === 'number' &&
    Number.isFinite(value.z)
  );
}

function readRoomEvent(frame: unknown): RoomEvent | null {
  if (typeof frame !== 'string' || frame.length > 8192) return null;
  try {
    const event: unknown = JSON.parse(frame);
    if (!isRecord(event)) return null;
    switch (event.type) {
      case 'ready':
        if (
          isPeer(event.self) &&
          Array.isArray(event.peers) &&
          event.peers.length < ROOM_CAPACITY &&
          event.peers.every(isPeer) &&
          typeof event.leaseUntil === 'number' &&
          Number.isSafeInteger(event.leaseUntil)
        ) {
          return {
            type: event.type,
            self: event.self,
            peers: event.peers,
            leaseUntil: event.leaseUntil,
          };
        }
        break;
      case 'peer':
        if (isPeer(event.peer)) return { type: event.type, peer: event.peer };
        break;
      case 'position':
        if (isPeer(event.self)) return { type: event.type, self: event.self };
        break;
      case 'leave':
        if (isActorId(event.id)) return { type: event.type, id: event.id };
        break;
    }
  } catch {
    return null;
  }
  return null;
}

export function applyRoomFrame(
  state: RoomState,
  frame: unknown,
  now: number
): RoomState {
  if (state.status === 'joined' && state.leaseUntil * 1000 <= now)
    return { status: 'expired' };
  const event = readRoomEvent(frame);
  if (!event) return state;
  if (state.status === 'joining' && event.type === 'ready') {
    if (event.leaseUntil * 1000 <= now) return { status: 'expired' };
    const leaseUntil = Math.min(
      event.leaseUntil,
      Math.floor(now / 1000) + ROOM_LEASE_SECONDS
    );
    const peers = new Map(
      event.peers
        .filter((peer) => peer.id !== event.self.id)
        .map((peer) => [peer.id, peer])
    );
    return {
      status: 'joined',
      self: event.self,
      peers: [...peers.values()],
      leaseUntil,
    };
  }
  if (state.status !== 'joined') return state;
  switch (event.type) {
    case 'position':
      return event.self.id === state.self.id
        ? { ...state, self: event.self }
        : state;
    case 'peer': {
      if (event.peer.id === state.self.id) return state;
      const peers = state.peers.filter((peer) => peer.id !== event.peer.id);
      if (peers.length >= ROOM_CAPACITY - 1) return state;
      return { ...state, peers: [...peers, event.peer] };
    }
    case 'leave':
      return {
        ...state,
        peers: state.peers.filter((peer) => peer.id !== event.id),
      };
    case 'ready':
      return state;
  }
}

export function connectRoom(url: URL, onState: (state: RoomState) => void) {
  let state: RoomState = { status: 'joining' };
  let timer: ReturnType<typeof setTimeout>;
  let lastMove = -Infinity;
  let awaitingPosition = false;
  let socket: WebSocket | undefined;

  function finish(status: Exclude<Disconnected, 'joining'>) {
    clearTimeout(timer);
    const previous = socket;
    socket = undefined;
    previous?.close();
    state = { status };
    onState(state);
  }

  onState(state);
  try {
    socket = new WebSocket(url);
  } catch {
    finish('unavailable');
  }
  if (socket) {
    const active = socket;
    timer = setTimeout(() => finish('unavailable'), 10_000);
    active.onmessage = ({ data }) => {
      if (socket !== active) return;
      const next = applyRoomFrame(state, data, Date.now());
      if (next.status === 'expired') {
        finish('expired');
        return;
      }
      if (next === state) return;
      if (state.status === 'joining' && next.status === 'joined') {
        clearTimeout(timer);
        timer = setTimeout(
          () => finish('expired'),
          next.leaseUntil * 1000 - Date.now()
        );
      } else if (
        next.status === 'joined' &&
        state.status === 'joined' &&
        next.self !== state.self
      ) {
        awaitingPosition = false;
      }
      state = next;
      onState(state);
    };
    active.onerror = active.onclose = () => {
      if (socket !== active) return;
      finish(
        state.status === 'joined' && state.leaseUntil * 1000 <= Date.now()
          ? 'expired'
          : 'unavailable'
      );
    };
  }

  return {
    leave: () => finish('idle'),
    dispose() {
      clearTimeout(timer);
      const previous = socket;
      socket = undefined;
      previous?.close();
    },
    move(dx: number, dz: number) {
      if (state.status !== 'joined' || socket?.readyState !== WebSocket.OPEN)
        return;
      if (state.leaseUntil * 1000 <= Date.now()) {
        finish('expired');
        return;
      }
      const now = performance.now();
      if (awaitingPosition || now - lastMove < 100 || socket.bufferedAmount)
        return;
      socket.send(
        JSON.stringify({
          type: 'move',
          x: state.self.x + dx,
          z: state.self.z + dz,
        })
      );
      lastMove = now;
      awaitingPosition = true;
    },
  };
}
