import {
  applyAttendanceDirectory,
  ATTENDANCE_DIRECTORY_ROOM,
  attendanceSubjects,
  emptyAttendanceDirectory,
  type AttendanceDirectory,
} from '../../../packages/realtime/src/meet';
import {
  MEET_SERVICE_TTL_SECONDS,
  signMeetServiceCredential,
  verifyMeetServiceCredential,
} from '../../../packages/realtime/src/meet/service-credential';

const DIRECTORY_KEY = 'attendance-directory';

type DirectoryStorage = {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: AttendanceDirectory): Promise<unknown>;
};

export async function handleAttendanceDirectoryRequest(input: {
  storage: DirectoryStorage;
  request: Request;
  secret: string;
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
  const command = (await input.request.json().catch(() => null)) as {
    op?: string;
    roomId?: string;
    meetingId?: string;
    users?: string[];
    guests?: string[];
    roomIds?: string[];
    userId?: string;
    guestId?: string;
    wsId?: string;
    cursor?: number;
  } | null;
  const stored =
    (await input.storage.get<AttendanceDirectory>(DIRECTORY_KEY)) ??
    emptyAttendanceDirectory();
  const applied = applyAttendanceDirectory(stored, command);
  if (applied.directory !== stored)
    await input.storage.put(DIRECTORY_KEY, applied.directory);
  return Response.json(applied.result, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export function publishRoomAttendanceIndex(input: {
  roomId: string | undefined;
  intervals: { userId?: string; guestId?: string }[] | undefined;
  secret: string;
  waitUntil: ((task: Promise<unknown>) => void) | undefined;
  fetchRoom: (request: Request) => Promise<Response>;
}) {
  if (!input.roomId || input.roomId === ATTENDANCE_DIRECTORY_ROOM) return;
  if (!input.intervals) return;
  const meetingId = input.roomId.slice(input.roomId.indexOf(':') + 1);
  const subjects = attendanceSubjects(
    input.intervals as Parameters<typeof attendanceSubjects>[0]
  );
  const request = new Request('https://meet.internal/attendance-index', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${signMeetServiceCredential(
        {
          aud: 'meet-service',
          purpose: 'attendance-index',
          roomId: ATTENDANCE_DIRECTORY_ROOM,
          exp: Math.floor(Date.now() / 1000) + MEET_SERVICE_TTL_SECONDS,
        },
        input.secret
      )}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      op: 'remember',
      roomId: input.roomId,
      meetingId,
      users: subjects.users,
      guests: subjects.guests,
    }),
  });
  input.waitUntil?.(
    input.fetchRoom(request).catch((error: unknown) => {
      console.error('Meet attendance index update failed', {
        name: error instanceof Error ? error.name : 'unknown',
      });
    })
  );
}
