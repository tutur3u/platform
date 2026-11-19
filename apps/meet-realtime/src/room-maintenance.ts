import { createRoomUsage } from '../../../packages/realtime/src/meet/room-usage';
import {
  closeBudgetPublications,
  deferBudgetCleanup,
  maintainAttendanceCopy,
  mergePublicationCleanup,
  nextAttendanceAlarm,
  type MeetClassFeatures,
  type MeetRoomSnapshot,
} from '../../../packages/realtime/src/meet';
import {
  finishDirectoryAlarm,
  publishStoredAttendance,
} from './attendance-directory-request';

type AttendanceEnv = Parameters<typeof publishStoredAttendance>[0];
type AttendanceStorage = Parameters<typeof publishStoredAttendance>[1];

export function countRoomHttpRequest(
  snapshot: MeetRoomSnapshot,
  storage: { put(key: string, value: unknown): Promise<unknown> },
  waitUntil: ((task: Promise<unknown>) => void) | undefined
) {
  snapshot.usage ??= createRoomUsage();
  snapshot.usage.httpRequests++;
  snapshot.usage.httpCounterWrites =
    (snapshot.usage.httpCounterWrites ?? 0) + 1;
  waitUntil?.(
    storage.put('usage-http-requests', {
      requests: snapshot.usage.httpRequests,
      writes: snapshot.usage.httpCounterWrites,
    })
  );
}

export async function wakeAttendanceCopies(input: {
  env: AttendanceEnv;
  storage: AttendanceStorage;
  now: number;
  snapshot: MeetRoomSnapshot;
  roomName: string | undefined;
  waitUntil: ((task: Promise<unknown>) => void) | undefined;
  persist: () => Promise<void>;
}) {
  if (await finishDirectoryAlarm(input.env, input.storage, input.now))
    return true;
  if (
    publishStoredAttendance(
      input.env,
      input.storage,
      input.snapshot,
      input.roomName,
      input.waitUntil
    )
  )
    await input.persist();
  return false;
}

export function retainRoomAttendance(
  snapshot: MeetRoomSnapshot,
  features: MeetClassFeatures,
  nowMs: number
) {
  const attendance = maintainAttendanceCopy(
    snapshot.attendance,
    features.attendance,
    new Date(nowMs).toISOString()
  );
  if (attendance === snapshot.attendance) return snapshot;
  return { ...snapshot, attendance: attendance ?? [] };
}

export async function cleanupRoomPublications(input: {
  snapshot: MeetRoomSnapshot;
  now: number;
  closeTracks: Parameters<typeof closeBudgetPublications>[1];
  getSession: Parameters<typeof closeBudgetPublications>[3];
  persist: (snapshot: MeetRoomSnapshot) => Promise<void>;
}) {
  let snapshot = input.snapshot;
  if (
    !snapshot.budget?.pendingPublications?.length ||
    input.now < (snapshot.budget.nextCleanupAt ?? 0)
  )
    return snapshot;
  const cleanupStarted = snapshot;
  try {
    const closed = await closeBudgetPublications(
      cleanupStarted,
      input.closeTracks,
      async (progress) => {
        snapshot = mergePublicationCleanup(snapshot, cleanupStarted, progress);
        await input.persist(snapshot);
      },
      input.getSession
    );
    snapshot = mergePublicationCleanup(snapshot, cleanupStarted, closed);
    await input.persist(snapshot);
  } catch {
    snapshot = {
      ...snapshot,
      budget: deferBudgetCleanup(snapshot, Date.now(), cleanupStarted).budget,
    };
    await input.persist(snapshot);
    console.error(
      'Meeting media cleanup deferred; provider confirmation is still pending'
    );
  }
  return snapshot;
}

export async function scheduleRoomFollowUps(input: {
  snapshot: MeetRoomSnapshot;
  connectedUserIds: ReadonlySet<string>;
  now: number;
  scheduleSweep: (deadline?: number) => Promise<void>;
  scheduleEmptyRoom: () => Promise<void>;
}) {
  await input.scheduleEmptyRoom();
  if (
    Object.keys(input.snapshot.presence).some(
      (id) => !input.connectedUserIds.has(id)
    )
  )
    await input.scheduleSweep();
  if (input.snapshot.liveAssistant)
    await input.scheduleSweep(
      input.snapshot.ended ? input.now : input.snapshot.liveAssistant.expiresAt
    );
  if (input.snapshot.budget?.pendingPublications?.length)
    await input.scheduleSweep(input.snapshot.budget.nextCleanupAt ?? input.now);
  if (input.snapshot.budget && !input.snapshot.ended)
    await input.scheduleSweep(input.snapshot.budget.expiresAt);
  const attendanceAlarm = nextAttendanceAlarm(
    input.snapshot.attendance,
    input.now
  );
  if (attendanceAlarm !== undefined && attendanceAlarm > input.now)
    await input.scheduleSweep(attendanceAlarm);
  const indexAt = input.snapshot.attendanceIndex?.nextAt;
  if (
    indexAt !== undefined &&
    indexAt > input.now &&
    !input.snapshot.attendanceIndex?.stopped
  )
    await input.scheduleSweep(indexAt);
}
