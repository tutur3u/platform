import {
  containsPoint,
  objectBounds,
  type Point,
  type World,
} from '@tuturuuu/worlds';
import {
  isActorId,
  isRecord,
  isRoomScope,
  type RoomAdmission,
  type RoomScope,
  roomName,
} from './admission.ts';

export const ROOM_CAPACITY = 32;
export const MAX_FRAME_BYTES = 256;
export const MAX_FRAMES_PER_SECOND = 12;
export const MOVE_SPEED = 6;
const MAX_MOVEMENT_CREDIT_MS = 250;
const INTEREST_RADIUS = 12;
const encoder = new TextEncoder();

export type Player = {
  v: 1;
  scope: RoomScope;
  actorId: string;
  peerId: string;
  leaseUntil: number;
  point: Point;
  movedAt: number;
  windowStartedAt: number;
  frames: number;
};

export type Peer = Point & { id: string };

export function publicPeer(player: Player): Peer {
  return { id: player.peerId, ...player.point };
}

export function nearby(left: Player, right: Player) {
  return (
    left.peerId !== right.peerId &&
    Math.hypot(left.point.x - right.point.x, left.point.z - right.point.z) <=
      INTEREST_RADIUS
  );
}

function isPoint(value: unknown): value is Point {
  return (
    isRecord(value) && Number.isFinite(value.x) && Number.isFinite(value.z)
  );
}

export function readMovement(frame: string | ArrayBuffer): Point | null {
  if (
    typeof frame !== 'string' ||
    frame.length > MAX_FRAME_BYTES ||
    encoder.encode(frame).byteLength > MAX_FRAME_BYTES
  )
    return null;
  try {
    const value: unknown = JSON.parse(frame);
    if (
      !isRecord(value) ||
      value.type !== 'move' ||
      Object.keys(value).length !== 3 ||
      !isPoint(value)
    )
      return null;
    return { x: value.x, z: value.z };
  } catch {
    return null;
  }
}

export function createPlayer(
  admission: RoomAdmission,
  spawn: Point,
  now: number
): Player {
  const { actorId, leaseUntil, worldId, revision, shard } = admission;
  return {
    v: 1,
    actorId,
    leaseUntil,
    scope: { worldId, revision, shard },
    peerId: crypto.randomUUID(),
    point: { x: spawn.x, z: spawn.z },
    movedAt: now,
    windowStartedAt: now,
    frames: 0,
  };
}

export function restorePlayer(
  value: unknown,
  world: World,
  target: RoomScope
): Player | null {
  if (
    !isRecord(value) ||
    value.v !== 1 ||
    !isRoomScope(value.scope) ||
    roomName(value.scope) !== roomName(target) ||
    !isActorId(value.actorId) ||
    typeof value.peerId !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(value.peerId) ||
    typeof value.leaseUntil !== 'number' ||
    !Number.isSafeInteger(value.leaseUntil) ||
    typeof value.movedAt !== 'number' ||
    !Number.isSafeInteger(value.movedAt) ||
    typeof value.windowStartedAt !== 'number' ||
    !Number.isSafeInteger(value.windowStartedAt) ||
    typeof value.frames !== 'number' ||
    !Number.isInteger(value.frames) ||
    value.frames < 0 ||
    value.frames > MAX_FRAMES_PER_SECOND ||
    !isPoint(value.point) ||
    !containsPoint(world.bounds, value.point)
  )
    return null;

  return {
    v: 1,
    scope: target,
    actorId: value.actorId,
    peerId: value.peerId,
    leaseUntil: value.leaseUntil,
    movedAt: value.movedAt,
    windowStartedAt: value.windowStartedAt,
    frames: value.frames,
    point: { x: value.point.x, z: value.point.z },
  };
}

export function consumeFrame(player: Player, now: number): Player | null {
  if (now - player.windowStartedAt >= 1000)
    return { ...player, windowStartedAt: now, frames: 1 };
  if (player.frames >= MAX_FRAMES_PER_SECOND) return null;
  return { ...player, frames: player.frames + 1 };
}

function crossesObject(
  from: Point,
  to: Point,
  { min, max }: ReturnType<typeof objectBounds>
) {
  let enter = 0;
  let leave = 1;
  for (const axis of ['x', 'z'] as const) {
    const delta = to[axis] - from[axis];
    if (delta === 0) {
      if (from[axis] < min[axis] || from[axis] > max[axis]) return false;
      continue;
    }
    const near = (min[axis] - from[axis]) / delta;
    const far = (max[axis] - from[axis]) / delta;
    enter = Math.max(enter, Math.min(near, far));
    leave = Math.min(leave, Math.max(near, far));
    if (enter > leave) return false;
  }
  return true;
}

export function createMovementValidator(world: World) {
  const obstacles = world.objects.map(objectBounds);
  return (player: Player, point: Point, now: number) => {
    const credit = Math.max(
      0,
      Math.min(now - player.movedAt, MAX_MOVEMENT_CREDIT_MS)
    );
    const distance = Math.hypot(
      point.x - player.point.x,
      point.z - player.point.z
    );
    if (
      distance === 0 ||
      distance > (MOVE_SPEED * credit) / 1000 ||
      !containsPoint(world.bounds, point) ||
      obstacles.some((obstacle) => crossesObject(player.point, point, obstacle))
    )
      return null;
    return { ...player, point, movedAt: now };
  };
}
