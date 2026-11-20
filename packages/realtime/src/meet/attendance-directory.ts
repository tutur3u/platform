import type { AttendanceInterval } from './attendance-ledger';

/** Singleton room that lists attendance copies, including ones Postgres has not stored. */
export const ATTENDANCE_DIRECTORY_ROOM = 'meet-attendance-index';
export const ATTENDANCE_DIRECTORY_PAGE = 200;
/** Full subject rows. Further rooms are stored as ids until the overflow cap. */
export const ATTENDANCE_DIRECTORY_ROOM_CAP = 512;
export const ATTENDANCE_DIRECTORY_OVERFLOW_CAP = 64;
export const ATTENDANCE_DIRECTORY_PENDING_CAP = 128;
export const ATTENDANCE_ERASE_DRAIN_LIMIT = 8;
export const ATTENDANCE_ERASE_ATTEMPT_LIMIT = 3;
export const ATTENDANCE_INDEX_RETRY_MS = 60_000;
export const ATTENDANCE_INDEX_ATTEMPT_LIMIT = 3;

export type AttendanceDirectoryRoom = {
  meetingId: string;
  users: string[];
  guests: string[];
  generation?: number;
};

export type AttendanceEraseClaim =
  | { erase: 'meeting' }
  | { erase: 'subject'; userId?: string; guestId?: string };

export type AttendancePendingErase = {
  generation: number;
  attempts: number;
  claims: AttendanceEraseClaim[];
};

export type AttendanceEraseBacklogItem = {
  roomId: string;
  generation: number;
  claims: AttendanceEraseClaim[];
};

export type AttendanceDirectory = {
  rooms: Record<string, AttendanceDirectoryRoom>;
  /** Room ids that did not fit in the subject map. Erasure still visits them. */
  overflow?: string[];
  /** Ids past the overflow cap. Discovery still pages them. */
  spill?: string[];
  pending?: Record<string, AttendancePendingErase>;
  eraseBacklog?: AttendanceEraseBacklogItem[];
};

export type AttendanceIndexState = {
  signature: string;
  attempts: number;
  nextAt?: number;
  stopped?: boolean;
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

function sameList(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function withoutId(ids: readonly string[] | undefined, roomId: string) {
  const next = (ids ?? []).filter((id) => id !== roomId);
  return next.length ? next : undefined;
}

export function rememberAttendanceSubjects(
  directory: AttendanceDirectory,
  roomId: string,
  meetingId: string,
  users: readonly string[],
  guests: readonly string[],
  generation?: number
): AttendanceDirectory {
  const nextUsers = [...new Set(users)].filter(Boolean).sort();
  const nextGuests = [...new Set(guests)].filter(Boolean).sort();
  const current = directory.rooms[roomId];
  if (
    current?.generation !== undefined &&
    generation !== undefined &&
    generation < current.generation
  )
    return directory;
  if (!nextUsers.length && !nextGuests.length) {
    if (
      !current &&
      !directory.overflow?.includes(roomId) &&
      !directory.spill?.includes(roomId)
    )
      return directory;
    const rooms = { ...directory.rooms };
    delete rooms[roomId];
    return {
      ...directory,
      rooms,
      overflow: withoutId(directory.overflow, roomId),
      spill: withoutId(directory.spill, roomId),
    };
  }
  if (
    current &&
    current.meetingId === meetingId &&
    sameList(current.users, nextUsers) &&
    sameList(current.guests, nextGuests) &&
    (generation === undefined || generation === current.generation)
  )
    return directory;
  if (
    !current &&
    Object.keys(directory.rooms).length >= ATTENDANCE_DIRECTORY_ROOM_CAP
  ) {
    const overflow = directory.overflow ?? [];
    if (overflow.includes(roomId) || directory.spill?.includes(roomId))
      return directory;
    if (overflow.length < ATTENDANCE_DIRECTORY_OVERFLOW_CAP) {
      return {
        ...directory,
        overflow: [...overflow, roomId].sort(),
      };
    }
    return {
      ...directory,
      spill: [...(directory.spill ?? []), roomId].sort(),
    };
  }
  const rooms = {
    ...directory.rooms,
    [roomId]: {
      meetingId,
      users: nextUsers,
      guests: nextGuests,
      ...(generation === undefined ? {} : { generation }),
    },
  };
  return {
    ...directory,
    rooms,
    overflow: withoutId(directory.overflow, roomId),
    spill: withoutId(directory.spill, roomId),
  };
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
    generation?: number;
    rooms?: Array<{
      roomId?: string;
      generation?: number;
      claims?: AttendanceEraseClaim[];
    }>;
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
    const next = rememberAttendanceSubjects(
      directory,
      command.roomId,
      command.meetingId,
      command.users ?? [],
      command.guests ?? [],
      command.generation
    );
    const kept =
      !!next.rooms[command.roomId] ||
      !!next.overflow?.includes(command.roomId) ||
      !!next.spill?.includes(command.roomId) ||
      (!(command.users ?? []).length && !(command.guests ?? []).length);
    if (!kept)
      return { directory, result: { ok: false, error: 'directory_full' } };
    return { directory: next, result: { ok: true } };
  }
  if (command.op === 'queue-erase' && Array.isArray(command.rooms)) {
    return queueAttendanceErases(directory, command.rooms);
  }
  if (command.op === 'erase-done' && command.roomId) {
    return {
      directory: completeAttendanceErase(
        directory,
        command.roomId,
        command.generation
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
  if (command.op === 'revise-membership' && command.roomIds?.length) {
    let next = directory;
    for (const roomId of command.roomIds)
      next = reviseAttendanceMembership(
        next,
        roomId,
        command.userId,
        command.guestId
      );
    return { directory: next, result: { ok: true } };
  }
  return { directory, result: { ok: false } };
}

export function rememberAttendanceRoom(
  directory: AttendanceDirectory,
  roomId: string,
  meetingId: string,
  intervals: AttendanceInterval[] | undefined,
  generation?: number
): AttendanceDirectory {
  const subjects = attendanceSubjects(intervals);
  return rememberAttendanceSubjects(
    directory,
    roomId,
    meetingId,
    subjects.users,
    subjects.guests,
    generation
  );
}

export function reviseAttendanceMembership(
  directory: AttendanceDirectory,
  roomId: string,
  userId?: string,
  guestId?: string
): AttendanceDirectory {
  const room = directory.rooms[roomId];
  if (!room) return directory;
  const users = userId ? room.users.filter((id) => id !== userId) : room.users;
  const guests = room.guests.filter((id) => id !== guestId && id !== userId);
  if (!users.length && !guests.length)
    return forgetAttendanceRooms(directory, [roomId]);
  if (sameList(room.users, users) && sameList(room.guests, guests))
    return directory;
  return {
    ...directory,
    rooms: {
      ...directory.rooms,
      [roomId]: { ...room, users, guests },
    },
  };
}

export function forgetAttendanceRooms(
  directory: AttendanceDirectory,
  roomIds: readonly string[]
): AttendanceDirectory {
  if (
    !roomIds.some(
      (roomId) =>
        directory.rooms[roomId] ||
        directory.overflow?.includes(roomId) ||
        directory.spill?.includes(roomId)
    )
  )
    return directory;
  const rooms = { ...directory.rooms };
  let overflow = directory.overflow;
  let spill = directory.spill;
  for (const roomId of roomIds) {
    delete rooms[roomId];
    overflow = withoutId(overflow, roomId);
    spill = withoutId(spill, roomId);
  }
  return { ...directory, rooms, overflow, spill };
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
  const overflowIds = [
    ...(directory.overflow ?? []),
    ...(directory.spill ?? []),
  ].filter((roomId) => {
    const parsed = parseAttendanceRoomId(roomId);
    if (!parsed) return false;
    if (query.meetingId && parsed.meetingId !== query.meetingId) return false;
    if (query.wsId && parsed.wsId !== query.wsId) return false;
    return true;
  });
  const ids = [
    ...new Set([
      ...Object.entries(directory.rooms)
        .filter(([roomId, room]) => {
          if (query.meetingId && room.meetingId !== query.meetingId)
            return false;
          const parsed = parseAttendanceRoomId(roomId);
          if (query.wsId && parsed?.wsId !== query.wsId) return false;
          if (query.userId || query.guestId) return matchesSubject(room, query);
          return true;
        })
        .map(([roomId]) => roomId),
      ...overflowIds,
    ]),
  ].sort();
  const start = Math.max(0, cursor);
  const roomIds = ids.slice(start, start + ATTENDANCE_DIRECTORY_PAGE);
  const next = start + roomIds.length;
  return { roomIds, cursor: next < ids.length ? next : null };
}

function queueAttendanceErases(
  directory: AttendanceDirectory,
  rooms: Array<{
    roomId?: string;
    generation?: number;
    claims?: AttendanceEraseClaim[];
  }>
) {
  const pending = { ...(directory.pending ?? {}) };
  const backlog = [...(directory.eraseBacklog ?? [])];
  let accepted = 0;
  let changed = false;
  for (const room of rooms) {
    if (
      !room.roomId ||
      !Number.isInteger(room.generation) ||
      (room.generation ?? -1) < 0
    )
      continue;
    const generation = room.generation ?? 0;
    const claims = room.claims?.length
      ? room.claims
      : [{ erase: 'meeting' as const }];
    const current = pending[room.roomId];
    if (current && generation <= current.generation) continue;
    if (
      !current &&
      Object.keys(pending).length >= ATTENDANCE_DIRECTORY_PENDING_CAP
    ) {
      const index = backlog.findIndex((item) => item.roomId === room.roomId);
      const next = { roomId: room.roomId, generation, claims };
      if (index >= 0) {
        if (generation <= backlog[index]!.generation) continue;
        backlog[index] = next;
      } else {
        backlog.push(next);
      }
      changed = true;
      continue;
    }
    pending[room.roomId] = { generation, attempts: 0, claims };
    accepted += 1;
    changed = true;
  }
  if (!changed)
    return {
      directory,
      result: { ok: true, accepted: 0, backlog: backlog.length },
    };
  return {
    directory: {
      ...directory,
      pending: Object.keys(pending).length ? pending : undefined,
      eraseBacklog: backlog.length ? backlog : undefined,
    },
    result: { ok: true, accepted, backlog: backlog.length },
  };
}

export function admitAttendanceEraseBacklog(
  directory: AttendanceDirectory
): AttendanceDirectory {
  const backlog = directory.eraseBacklog ?? [];
  if (!backlog.length) return directory;
  const pending = { ...(directory.pending ?? {}) };
  const rest: AttendanceEraseBacklogItem[] = [];
  let changed = false;
  for (const room of backlog) {
    const current = pending[room.roomId];
    if (current && room.generation <= current.generation) {
      changed = true;
      continue;
    }
    if (
      !current &&
      Object.keys(pending).length >= ATTENDANCE_DIRECTORY_PENDING_CAP
    ) {
      rest.push(room);
      continue;
    }
    pending[room.roomId] = {
      generation: room.generation,
      attempts: current?.attempts ?? 0,
      claims: room.claims,
    };
    changed = true;
  }
  if (!changed && rest.length === backlog.length) return directory;
  return {
    ...directory,
    pending: Object.keys(pending).length ? pending : undefined,
    eraseBacklog: rest.length ? rest : undefined,
  };
}

function completeAttendanceErase(
  directory: AttendanceDirectory,
  roomId: string,
  generation: number | undefined
) {
  const current = directory.pending?.[roomId];
  if (!current) return directory;
  if (generation !== undefined && generation < current.generation)
    return directory;
  const pending = { ...directory.pending };
  delete pending[roomId];
  return {
    ...directory,
    pending: Object.keys(pending).length ? pending : undefined,
  };
}

/** Checkpoint a bounded batch. Attempts increase before the posts so a restart cannot reset them. */
export function planAttendanceEraseDrain(
  directory: AttendanceDirectory,
  nowMs: number,
  limit = ATTENDANCE_ERASE_DRAIN_LIMIT
) {
  const admitted = admitAttendanceEraseBacklog(directory);
  const ready = Object.entries(admitted.pending ?? {}).filter(
    ([, item]) => item.attempts < ATTENDANCE_ERASE_ATTEMPT_LIMIT
  );
  if (!ready.length)
    return {
      directory: admitted,
      posts: [] as Array<{
        roomId: string;
        generation: number;
        claims: AttendanceEraseClaim[];
      }>,
      rescheduleAt: admitted.eraseBacklog?.length
        ? nowMs + ATTENDANCE_INDEX_RETRY_MS
        : null,
    };
  const posts = ready.slice(0, limit).map(([roomId, item]) => ({
    roomId,
    generation: item.generation,
    claims: item.claims,
  }));
  const pending = { ...admitted.pending };
  for (const post of posts) {
    const item = pending[post.roomId];
    if (!item) continue;
    pending[post.roomId] = { ...item, attempts: item.attempts + 1 };
  }
  const next = {
    ...admitted,
    pending: Object.keys(pending).length ? pending : undefined,
  };
  const rescheduleAt =
    Object.values(pending).some(
      (item) => item.attempts < ATTENDANCE_ERASE_ATTEMPT_LIMIT
    ) || next.eraseBacklog?.length
      ? nowMs + ATTENDANCE_INDEX_RETRY_MS
      : null;
  if (
    next.pending === admitted.pending &&
    !posts.length &&
    admitted === directory
  )
    return {
      directory,
      posts,
      rescheduleAt,
    };
  return { directory: next, posts, rescheduleAt };
}

export function attendanceIndexSignature(
  intervals: AttendanceInterval[] | undefined
) {
  if (!intervals) return undefined;
  const subjects = attendanceSubjects(intervals);
  return `${subjects.users.join('\n')}\u0000${subjects.guests.join('\n')}`;
}

/** Skip unchanged subjects and a retry that is not due yet. A new signature starts a new budget. */
export function noteAttendanceIndexPublish(
  state: AttendanceIndexState | undefined,
  signature: string | undefined,
  nowMs: number
): { publish: boolean; state: AttendanceIndexState | undefined } {
  if (!signature) return { publish: false, state };
  if (state?.stopped && state.signature === signature)
    return { publish: false, state };
  if (
    state?.signature === signature &&
    state.nextAt !== undefined &&
    state.nextAt > nowMs
  )
    return { publish: false, state };
  if (
    state?.signature === signature &&
    state.attempts === 0 &&
    state.nextAt === undefined &&
    !state.stopped
  )
    return { publish: false, state };
  const attempts = state?.signature === signature ? state.attempts : 0;
  return {
    publish: true,
    state: {
      signature,
      attempts,
      nextAt: nowMs + ATTENDANCE_INDEX_RETRY_MS,
    },
  };
}

export function recordAttendanceIndexResult(
  state: AttendanceIndexState,
  ok: boolean,
  nowMs: number
): { state: AttendanceIndexState; scheduleAt?: number } {
  if (ok) return { state: { signature: state.signature, attempts: 0 } };
  const attempts = state.attempts + 1;
  if (attempts >= ATTENDANCE_INDEX_ATTEMPT_LIMIT)
    return { state: { signature: state.signature, attempts, stopped: true } };
  const scheduleAt = nowMs + ATTENDANCE_INDEX_RETRY_MS;
  return {
    state: { signature: state.signature, attempts, nextAt: scheduleAt },
    scheduleAt,
  };
}
