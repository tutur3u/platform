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

/**
 * The time to hand `setAlarm` for a sweep `deadline`, or undefined when there
 * is nothing to schedule. `setAlarm` refuses any time <= 0, and a deadline can
 * be past, zero (room cleanup marks itself due with `nextCleanupAt: 0`) or,
 * from an older snapshot missing a field, NaN. A past or zero deadline runs at
 * the next moment instead; a non-finite one schedules nothing.
 */
export function roomAlarmTime(deadline: number, now: number) {
  if (!Number.isFinite(deadline)) return undefined;
  return Math.max(deadline, now + 1);
}

/**
 * Arms the room alarm for `deadline` unless an earlier one is set. A past or
 * zero deadline runs at the next moment (`roomAlarmTime`); a non-finite one
 * is dropped with a warning, never re-armed as now, which would wake the
 * room on every run.
 */
export async function armRoomAlarm(
  storage: Pick<DurableObjectStorage, 'getAlarm' | 'setAlarm'>,
  deadline: number,
  now: number
) {
  const at = roomAlarmTime(deadline, now);
  if (at === undefined) {
    console.warn('Meet room sweep skipped: deadline is not a number');
    return;
  }
  const existing = await storage.getAlarm();
  if (existing === null || existing > at) await storage.setAlarm(at);
}

/**
 * When to sweep for an expiry stored as `expiresAt`. One that is not a finite
 * number counts as expired now: the sweep then treats it as expired too
 * (`expireRoomLive` drops the assistant, `expireRoomBudget` ends the room),
 * so it is scheduled once and cannot re-arm the alarm.
 */
export function expiryDeadline(expiresAt: number, now: number) {
  return Number.isFinite(expiresAt) ? expiresAt : now;
}

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

/** Restores the durable HTTP request counter into a freshly loaded room. */
export async function restoreHttpCounter(
  storage: Pick<DurableObjectStorage, 'get'>,
  snapshot: MeetRoomSnapshot
) {
  const counter = await storage.get<
    number | { requests: number; writes: number }
  >('usage-http-requests');
  if (counter === undefined) return;
  snapshot.usage ??= createRoomUsage();
  snapshot.usage.httpRequests = Math.max(
    snapshot.usage.httpRequests,
    typeof counter === 'number' ? counter : counter.requests
  );
  snapshot.usage.httpCounterWrites = Math.max(
    snapshot.usage.httpCounterWrites ?? 0,
    typeof counter === 'number' ? counter : counter.writes
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
  readSnapshot: () => MeetRoomSnapshot;
  now: number;
  closeTracks: Parameters<typeof closeBudgetPublications>[1];
  getSession: Parameters<typeof closeBudgetPublications>[3];
  persist: (snapshot: MeetRoomSnapshot) => Promise<void>;
}) {
  const started = input.readSnapshot();
  if (
    !started.budget?.pendingPublications?.length ||
    input.now < (started.budget.nextCleanupAt ?? 0)
  )
    return;
  // Provider awaits can interleave with room commands and lifecycle changes.
  const persistProgress = (progress: MeetRoomSnapshot) =>
    input.persist(
      mergePublicationCleanup(input.readSnapshot(), started, progress)
    );
  try {
    const closed = await closeBudgetPublications(
      started,
      input.closeTracks,
      persistProgress,
      input.getSession
    );
    await persistProgress(closed);
  } catch {
    await input.persist(
      deferBudgetCleanup(input.readSnapshot(), Date.now(), started)
    );
    console.error(
      'Meeting media cleanup deferred; provider confirmation is still pending'
    );
  }
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
      input.snapshot.ended
        ? input.now
        : expiryDeadline(input.snapshot.liveAssistant.expiresAt, input.now)
    );
  if (input.snapshot.budget?.pendingPublications?.length)
    // `nextCleanupAt: 0` marks cleanup as due now.
    await input.scheduleSweep(input.snapshot.budget.nextCleanupAt || input.now);
  if (input.snapshot.budget && !input.snapshot.ended)
    await input.scheduleSweep(
      expiryDeadline(input.snapshot.budget.expiresAt, input.now)
    );
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
