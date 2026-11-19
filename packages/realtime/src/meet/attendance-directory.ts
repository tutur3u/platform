import type { AttendanceInterval } from './attendance-ledger';

/** Singleton room that lists attendance copies, including ones Postgres has not stored. */
export const ATTENDANCE_DIRECTORY_ROOM = 'meet-attendance-index';
export const ATTENDANCE_DIRECTORY_PAGE = 200;

export type AttendanceDirectoryRoom = {
  meetingId: string;
  users: string[];
  guests: string[];
};

export type AttendanceDirectory = {
  rooms: Record<string, AttendanceDirectoryRoom>;
};

export function emptyAttendanceDirectory(): AttendanceDirectory {
  return { rooms: {} };
}

export function attendanceSubjects(
  intervals: AttendanceInterval[] | undefined
) {
  const users = new Set<string>();
  const guests = new Set<string>();
  for (const row of intervals ?? []) {
    if (row.userId) users.add(row.userId);
    if (row.guestId) guests.add(row.guestId);
  }
  return {
    users: [...users].sort(),
    guests: [...guests].sort(),
  };
}

export function rememberAttendanceSubjects(
  directory: AttendanceDirectory,
  roomId: string,
  meetingId: string,
  users: readonly string[],
  guests: readonly string[]
): AttendanceDirectory {
  const rooms = { ...directory.rooms };
  const nextUsers = [...new Set(users)].sort();
  const nextGuests = [...new Set(guests)].sort();
  if (!nextUsers.length && !nextGuests.length) delete rooms[roomId];
  else rooms[roomId] = { meetingId, users: nextUsers, guests: nextGuests };
  return { rooms };
}

export function applyAttendanceDirectory(
  directory: AttendanceDirectory,
  command: {
    op?: string;
    roomId?: string;
    meetingId?: string;
    users?: string[];
    guests?: string[];
    roomIds?: string[];
    userId?: string;
    guestId?: string;
    wsId?: string;
    meetingFilter?: string;
    cursor?: number;
  } | null
) {
  if (!command || command.op === 'list') {
    const page = pageAttendanceDirectory(
      directory,
      {
        userId: command?.userId,
        guestId: command?.guestId,
        wsId: command?.wsId,
        meetingId: command?.meetingId,
      },
      command?.cursor ?? 0
    );
    return { directory, result: page };
  }
  if (command.op === 'remember' && command.roomId && command.meetingId) {
    return {
      directory: rememberAttendanceSubjects(
        directory,
        command.roomId,
        command.meetingId,
        command.users ?? [],
        command.guests ?? []
      ),
      result: { ok: true },
    };
  }
  if (command.op === 'forget') {
    return {
      directory: forgetAttendanceRooms(directory, command.roomIds ?? []),
      result: { ok: true },
    };
  }
  return { directory, result: { ok: false } };
}

export function rememberAttendanceRoom(
  directory: AttendanceDirectory,
  roomId: string,
  meetingId: string,
  intervals: AttendanceInterval[] | undefined
): AttendanceDirectory {
  const subjects = attendanceSubjects(intervals);
  const rooms = { ...directory.rooms };
  if (!subjects.users.length && !subjects.guests.length) delete rooms[roomId];
  else rooms[roomId] = { meetingId, ...subjects };
  return { rooms };
}

export function forgetAttendanceRooms(
  directory: AttendanceDirectory,
  roomIds: readonly string[]
): AttendanceDirectory {
  const rooms = { ...directory.rooms };
  for (const roomId of roomIds) delete rooms[roomId];
  return { rooms };
}

export function parseAttendanceRoomId(roomId: string) {
  const split = roomId.indexOf(':');
  if (split <= 0 || split === roomId.length - 1) return null;
  return { wsId: roomId.slice(0, split), meetingId: roomId.slice(split + 1) };
}

function matchesSubject(
  room: AttendanceDirectoryRoom,
  subject: { userId?: string; guestId?: string }
) {
  if (subject.userId && room.users.includes(subject.userId)) return true;
  if (subject.guestId && room.guests.includes(subject.guestId)) return true;
  // A signed-in guest is stored under guest id, which is that account id.
  if (subject.userId && room.guests.includes(subject.userId)) return true;
  return false;
}

export function pageAttendanceDirectory(
  directory: AttendanceDirectory,
  query: {
    userId?: string;
    guestId?: string;
    meetingId?: string;
    wsId?: string;
  },
  cursor = 0
) {
  const ids = Object.entries(directory.rooms)
    .filter(([roomId, room]) => {
      if (query.meetingId && room.meetingId !== query.meetingId) return false;
      const parsed = parseAttendanceRoomId(roomId);
      if (query.wsId && parsed?.wsId !== query.wsId) return false;
      if (query.userId || query.guestId) return matchesSubject(room, query);
      return true;
    })
    .map(([roomId]) => roomId)
    .sort();
  const start = Math.max(0, cursor);
  const roomIds = ids.slice(start, start + ATTENDANCE_DIRECTORY_PAGE);
  const next = start + roomIds.length;
  return { roomIds, cursor: next < ids.length ? next : null };
}
