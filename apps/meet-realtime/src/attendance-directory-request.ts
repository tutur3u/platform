import {
  admitAttendanceEraseBacklog,
  applyAttendanceDirectory,
  ATTENDANCE_DIRECTORY_ROOM,
  ATTENDANCE_INDEX_RETRY_MS,
  attendanceSubjects,
  emptyAttendanceDirectory,
  noteAttendanceIndexPublish,
  planAttendanceEraseDrain,
  recordAttendanceIndexResult,
  type AttendanceDirectory,
  type AttendanceIndexState,
  type MeetRoomSnapshot,
} from '../../../packages/realtime/src/meet';
import {
  MEET_SERVICE_TTL_SECONDS,
  signMeetServiceCredential,
  verifyMeetServiceCredential,
} from '../../../packages/realtime/src/meet/service-credential';

const DIRECTORY_KEY = 'attendance-directory';
const SNAPSHOT_KEY = 'snapshot';

type DirectoryStorage = {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<unknown>;
  getAlarm?: () => Promise<number | null>;
  setAlarm?: (scheduledTime: number) => Promise<void>;
};

export async function handleAttendanceDirectoryRequest(input: {
  storage: DirectoryStorage;
  request: Request;
  secret: string;
  nowMs?: number;
}): Promise<Response> {
  const credential = verifyMeetServiceCredential(
    input.request.headers
      .get('Authorization')
      ?.match(/^Bearer\s+(\S+)\s*$/i)?.[1] ?? '',
    input.secret
  );
  if (
    !credential ||
    credential.purpose !== 'attendance-index' ||
    credential.roomId !== ATTENDANCE_DIRECTORY_ROOM
  )
    return new Response('Unauthorized', { status: 401 });
  const command = (await input.request.json().catch(() => null)) as Parameters<
    typeof applyAttendanceDirectory
  >[1];
  const stored =
    (await input.storage.get<AttendanceDirectory>(DIRECTORY_KEY)) ??
    emptyAttendanceDirectory();
  const applied = applyAttendanceDirectory(stored, command);
  if (applied.directory !== stored)
    await input.storage.put(DIRECTORY_KEY, applied.directory);
  if (
    command?.op === 'queue-erase' &&
    applied.directory !== stored &&
    applied.directory.pending &&
    input.storage.setAlarm
  ) {
    const at = (input.nowMs ?? Date.now()) + ATTENDANCE_INDEX_RETRY_MS;
    const existing = (await input.storage.getAlarm?.()) ?? null;
    if (existing === null || existing > at) await input.storage.setAlarm(at);
  }
  return Response.json(applied.result, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export function publishStoredAttendance(
  env: {
    MEET_REALTIME_TOKEN_SECRET: string;
    MEET_ROOM: {
      idFromName(name: string): unknown;
      get(id: unknown): { fetch(request: Request): Promise<Response> };
    };
  },
  storage: DirectoryStorage,
  snapshot: MeetRoomSnapshot,
  roomName: string | undefined,
  waitUntil: ((task: Promise<unknown>) => void) | undefined
) {
  if (roomName) snapshot.roomName = roomName;
  return syncRoomAttendanceIndex({
    snapshot,
    secret: env.MEET_REALTIME_TOKEN_SECRET,
    nowMs: Date.now(),
    waitUntil,
    fetchRoom: (request) =>
      env.MEET_ROOM.get(
        env.MEET_ROOM.idFromName(ATTENDANCE_DIRECTORY_ROOM)
      ).fetch(request),
    storage,
  });
}

export function finishDirectoryAlarm(
  env: {
    MEET_REALTIME_TOKEN_SECRET: string;
    MEET_ROOM: {
      idFromName(name: string): unknown;
      get(id: unknown): { fetch(request: Request): Promise<Response> };
    };
  },
  storage: DirectoryStorage,
  nowMs: number
) {
  return drainAttendanceDirectoryAlarm({
    storage,
    secret: env.MEET_REALTIME_TOKEN_SECRET,
    nowMs,
    fetchRoom: (roomName, request) =>
      env.MEET_ROOM.get(env.MEET_ROOM.idFromName(roomName)).fetch(request),
  });
}

export function syncRoomAttendanceIndex(input: {
  snapshot: MeetRoomSnapshot;
  secret: string;
  nowMs: number;
  waitUntil: ((task: Promise<unknown>) => void) | undefined;
  fetchRoom: (request: Request) => Promise<Response>;
  storage: DirectoryStorage;
}) {
  const roomId = input.snapshot.roomName;
  if (!roomId || roomId === ATTENDANCE_DIRECTORY_ROOM) return false;
  const decision = noteAttendanceIndexPublish(
    input.snapshot.attendanceIndex,
    input.snapshot.attendance
      ? `${attendanceSubjects(input.snapshot.attendance).users.join('\n')}\u0000${attendanceSubjects(input.snapshot.attendance).guests.join('\n')}`
      : undefined,
    input.nowMs
  );
  if (!decision.publish || !decision.state) return false;
  input.snapshot.attendanceIndex = decision.state;
  const meetingId = roomId.slice(roomId.indexOf(':') + 1);
  const subjects = attendanceSubjects(input.snapshot.attendance);
  const request = directoryRequest(input.secret, input.nowMs, {
    op: 'remember',
    roomId,
    meetingId,
    users: subjects.users,
    guests: subjects.guests,
  });
  const task = input.fetchRoom(request).then(async (response) => {
    await settleAttendanceIndex(input, decision.state!, response.ok);
  });
  input.waitUntil?.(task);
  return true;
}

async function settleAttendanceIndex(
  input: {
    snapshot: MeetRoomSnapshot;
    storage: DirectoryStorage;
    nowMs: number;
  },
  started: AttendanceIndexState,
  ok: boolean
) {
  const stored =
    (await input.storage.get<MeetRoomSnapshot>(SNAPSHOT_KEY)) ?? input.snapshot;
  const current = stored.attendanceIndex;
  if (!current || current.signature !== started.signature || current.stopped)
    return;
  const recorded = recordAttendanceIndexResult(current, ok, Date.now());
  stored.attendanceIndex = recorded.state;
  input.snapshot.attendanceIndex = recorded.state;
  await input.storage.put(SNAPSHOT_KEY, stored);
  if (!recorded.scheduleAt || !input.storage.setAlarm) return;
  const existing = (await input.storage.getAlarm?.()) ?? null;
  if (existing === null || existing > recorded.scheduleAt)
    await input.storage.setAlarm(recorded.scheduleAt);
}

export async function drainAttendanceDirectoryAlarm(input: {
  storage: DirectoryStorage;
  secret: string;
  nowMs: number;
  fetchRoom: (roomName: string, request: Request) => Promise<Response>;
}): Promise<boolean> {
  const stored = await input.storage.get<AttendanceDirectory>(DIRECTORY_KEY);
  if (!stored) return false;
  const planned = planAttendanceEraseDrain(stored, input.nowMs);
  if (planned.directory !== stored)
    await input.storage.put(DIRECTORY_KEY, planned.directory);
  let directory = planned.directory;
  for (const post of planned.posts) {
    let erased = true;
    for (const claim of post.claims) {
      const response = await input
        .fetchRoom(
          post.roomId,
          new Request('https://meet.internal/class-service', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${signMeetServiceCredential(
                {
                  aud: 'meet-service',
                  purpose: 'attendance-erase',
                  roomId: post.roomId,
                  exp:
                    Math.floor(input.nowMs / 1000) + MEET_SERVICE_TTL_SECONDS,
                  generation: post.generation,
                  ...claim,
                },
                input.secret
              )}`,
            },
          })
        )
        .catch(() => null);
      if (!response?.ok) erased = false;
    }
    if (!erased) continue;
    const done = applyAttendanceDirectory(directory, {
      op: 'erase-done',
      roomId: post.roomId,
      generation: post.generation,
    });
    directory = done.directory;
  }
  const admitted = admitAttendanceEraseBacklog(directory);
  if (admitted !== directory) directory = admitted;
  if (directory !== planned.directory)
    await input.storage.put(DIRECTORY_KEY, directory);
  if (
    (directory.pending || directory.eraseBacklog?.length) &&
    input.storage.setAlarm
  ) {
    const at = planned.rescheduleAt ?? input.nowMs + ATTENDANCE_INDEX_RETRY_MS;
    await input.storage.setAlarm(at);
  }
  return true;
}

function directoryRequest(secret: string, nowMs: number, body: unknown) {
  return new Request('https://meet.internal/attendance-index', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${signMeetServiceCredential(
        {
          aud: 'meet-service',
          purpose: 'attendance-index',
          roomId: ATTENDANCE_DIRECTORY_ROOM,
          exp: Math.floor(nowMs / 1000) + MEET_SERVICE_TTL_SECONDS,
        },
        secret
      )}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}
