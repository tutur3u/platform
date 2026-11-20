import { parseAttendanceRoomId } from '@tuturuuu/realtime/meet';

export type AttendanceRoomTarget = {
  roomId: string;
  wsId: string;
  meetingId: string;
  /** SQL fence generation already assigned to this room. */
  generation?: number;
  /** Claim keys already accepted by the room copy. */
  posted?: string[];
};

export type AttendanceErasureSql =
  | { op: 'meeting'; meetingId: string }
  | { op: 'workspace'; wsId: string }
  | { op: 'subject'; userId?: string; guestId?: string };

export type AttendanceErasurePlan = {
  rooms: AttendanceRoomTarget[];
  sql: AttendanceErasureSql;
  /** Planned work is cancelled when the delete is denied. Confirmed work is finished. */
  phase?: 'planned' | 'confirmed';
  attempts?: number;
  /** Session rows are already gone. Room copies may still be outstanding. */
  sqlDone?: boolean;
};

export const ATTENDANCE_ERASURE_ROOM_PAGE = 128;

export function attendanceErasureKey(sql: AttendanceErasureSql) {
  if (sql.op === 'meeting')
    return { kind: 'meeting' as const, subjectKey: sql.meetingId };
  if (sql.op === 'workspace')
    return { kind: 'workspace' as const, subjectKey: sql.wsId };
  const subjectKey = sql.userId
    ? `user:${sql.userId}`
    : `guest:${sql.guestId ?? ''}`;
  return { kind: 'subject' as const, subjectKey };
}

export function eraseClaimKey(claim: { userId?: string; guestId?: string }) {
  if (claim.userId) return `user:${claim.userId}`;
  if (claim.guestId) return `guest:${claim.guestId}`;
  return 'meeting';
}

function addRoom(
  rooms: Map<string, AttendanceRoomTarget>,
  wsId: string,
  meetingId: string
) {
  if (!wsId || !meetingId) return;
  const roomId = `${wsId}:${meetingId}`;
  rooms.set(roomId, { roomId, wsId, meetingId });
}

export function planMeetingAttendanceRooms(input: {
  wsId: string;
  meetingId: string;
  sessionWsIds: readonly string[];
  directoryRoomIds: readonly string[];
}): AttendanceRoomTarget[] {
  const rooms = new Map<string, AttendanceRoomTarget>();
  addRoom(rooms, input.wsId, input.meetingId);
  for (const wsId of input.sessionWsIds) addRoom(rooms, wsId, input.meetingId);
  for (const roomId of input.directoryRoomIds) {
    const parsed = parseAttendanceRoomId(roomId);
    if (parsed?.meetingId === input.meetingId)
      addRoom(rooms, parsed.wsId, parsed.meetingId);
  }
  return [...rooms.values()];
}

export function planWorkspaceAttendanceRooms(input: {
  wsId: string;
  meetingIds: readonly string[];
  sessionRooms: readonly { wsId: string; meetingId: string }[];
  directoryRoomIds: readonly string[];
}): AttendanceRoomTarget[] {
  const rooms = new Map<string, AttendanceRoomTarget>();
  for (const meetingId of input.meetingIds)
    addRoom(rooms, input.wsId, meetingId);
  for (const room of input.sessionRooms)
    addRoom(rooms, room.wsId, room.meetingId);
  for (const roomId of input.directoryRoomIds) {
    const parsed = parseAttendanceRoomId(roomId);
    if (parsed?.wsId === input.wsId)
      addRoom(rooms, parsed.wsId, parsed.meetingId);
  }
  return [...rooms.values()];
}

export function planSubjectAttendanceRooms(input: {
  sessionRooms: readonly { wsId: string; meetingId: string }[];
  directoryRoomIds: readonly string[];
}): AttendanceRoomTarget[] {
  const rooms = new Map<string, AttendanceRoomTarget>();
  for (const room of input.sessionRooms)
    addRoom(rooms, room.wsId, room.meetingId);
  for (const roomId of input.directoryRoomIds) {
    const parsed = parseAttendanceRoomId(roomId);
    if (parsed) addRoom(rooms, parsed.wsId, parsed.meetingId);
  }
  return [...rooms.values()];
}

export function subjectEraseClaims(
  sql: Extract<AttendanceErasureSql, { op: 'subject' }>
) {
  const claims: Array<{ userId?: string; guestId?: string }> = [];
  const seen = new Set<string>();
  const add = (claim: { userId?: string; guestId?: string }) => {
    const key = `${claim.userId ?? ''}:${claim.guestId ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    claims.push(claim);
  };
  if (sql.userId) {
    add({ userId: sql.userId });
    add({ guestId: sql.userId });
  }
  if (sql.guestId) add({ guestId: sql.guestId });
  return claims;
}

export function attendanceClaimKeys(plan: AttendanceErasurePlan) {
  if (plan.sql.op !== 'subject') return ['meeting'];
  return subjectEraseClaims(plan.sql).map((claim) => eraseClaimKey(claim));
}

export function attendanceRoomAcknowledged(
  plan: AttendanceErasurePlan,
  room: AttendanceRoomTarget
) {
  const posted = new Set(room.posted ?? []);
  return attendanceClaimKeys(plan).every((key) => posted.has(key));
}

export function unackedAttendanceRooms(plan: AttendanceErasurePlan) {
  return plan.rooms.filter((room) => !attendanceRoomAcknowledged(plan, room));
}

/** A lower generation is a stale copy and does not count as this room's ack. */
export function acknowledgeAttendanceRoom(
  plan: AttendanceErasurePlan,
  roomId: string,
  generation: number,
  claimKey: string
): AttendanceErasurePlan {
  return {
    ...plan,
    rooms: plan.rooms.map((room) => {
      if (room.roomId !== roomId || room.generation !== generation) return room;
      if (room.posted?.includes(claimKey)) return room;
      return { ...room, posted: [...(room.posted ?? []), claimKey] };
    }),
  };
}

export function attendanceErasureSettled(plan: AttendanceErasurePlan) {
  return plan.sqlDone === true && unackedAttendanceRooms(plan).length === 0;
}

/** A confirmed intent stays confirmed. A stale planned copy does not replace it. */
export function mergeAttendanceIntent(
  existing: AttendanceErasurePlan | null,
  incoming: AttendanceErasurePlan
): AttendanceErasurePlan | null {
  if (!existing) return incoming;
  if (existing.phase === 'confirmed' && incoming.phase !== 'confirmed')
    return null;
  if (existing.phase !== 'confirmed' || incoming.phase !== 'confirmed')
    return incoming;
  const rooms = new Map(
    existing.rooms.map((room) => [room.roomId, { ...room }])
  );
  for (const room of incoming.rooms) {
    const prior = rooms.get(room.roomId);
    if (!prior) {
      rooms.set(room.roomId, { ...room });
      continue;
    }
    const generation = Math.max(prior.generation ?? -1, room.generation ?? -1);
    const posted = [
      ...new Set([...(prior.posted ?? []), ...(room.posted ?? [])]),
    ];
    rooms.set(room.roomId, {
      roomId: room.roomId,
      wsId: room.wsId || prior.wsId,
      meetingId: room.meetingId || prior.meetingId,
      ...(generation >= 0 ? { generation } : {}),
      ...(posted.length ? { posted } : {}),
    });
  }
  return {
    ...incoming,
    phase: 'confirmed',
    attempts: Math.max(existing.attempts ?? 0, incoming.attempts ?? 0),
    sqlDone: existing.sqlDone || incoming.sqlDone ? true : undefined,
    rooms: [...rooms.values()],
  };
}
