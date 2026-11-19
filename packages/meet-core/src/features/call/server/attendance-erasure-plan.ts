import { parseAttendanceRoomId } from '@tuturuuu/realtime/meet';

export type AttendanceRoomTarget = {
  roomId: string;
  wsId: string;
  meetingId: string;
};

export type AttendanceErasureSql =
  | { op: 'meeting'; meetingId: string }
  | { op: 'workspace'; wsId: string }
  | { op: 'subject'; userId?: string; guestId?: string };

export type AttendanceErasurePlan = {
  rooms: AttendanceRoomTarget[];
  sql: AttendanceErasureSql;
};

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
