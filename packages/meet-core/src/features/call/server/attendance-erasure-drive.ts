import type { MeetServiceClaims } from '@tuturuuu/realtime/meet/service-credential';
import {
  ATTENDANCE_ERASURE_ROOM_PAGE,
  attendanceErasureSettled,
  eraseClaimKey,
  subjectEraseClaims,
  unackedAttendanceRooms,
  type AttendanceErasurePlan,
  type AttendanceErasureSql,
} from './attendance-erasure-plan';
import type { AttendanceErasureDeps } from './attendance-erasure';

export const ATTENDANCE_ERASURE_FANOUT = 4;
export const ATTENDANCE_ERASURE_ATTEMPTS = 8;

type RoomClaim = Omit<
  MeetServiceClaims,
  'aud' | 'purpose' | 'roomId' | 'exp'
> & {
  key: string;
};

function claimsFor(plan: AttendanceErasurePlan): RoomClaim[] {
  if (plan.sql.op !== 'subject')
    return [{ erase: 'meeting' as const, key: 'meeting' }];
  return subjectEraseClaims(plan.sql).map((claim) => ({
    erase: 'subject' as const,
    ...claim,
    key: eraseClaimKey(claim),
  }));
}

async function mapBounded<T>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<void>
) {
  const queue = [...items];
  let first: unknown;
  let stop = false;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      for (;;) {
        if (stop) return;
        const item = queue.shift();
        if (!item) return;
        try {
          await run(item);
        } catch (error) {
          first ??= error;
          stop = true;
        }
      }
    }
  );
  await Promise.all(workers);
  if (first) throw first;
}

async function queuePage(
  plan: AttendanceErasurePlan,
  deps: AttendanceErasureDeps
) {
  const page = unackedAttendanceRooms(plan).slice(
    0,
    ATTENDANCE_ERASURE_ROOM_PAGE
  );
  if (!page.length) return;
  await deps.queueRooms({ ...plan, rooms: page });
}

/** Confirms the intent and queues one page. Room posts and SQL stay on the drive. */
export async function enqueueAttendanceErasure(
  plan: AttendanceErasurePlan | null,
  deps: AttendanceErasureDeps
) {
  if (!plan) return;
  if ((plan.attempts ?? 0) >= ATTENDANCE_ERASURE_ATTEMPTS) return;
  plan.phase = 'confirmed';
  plan.attempts = (plan.attempts ?? 0) + 1;
  for (const room of plan.rooms)
    if (room.generation == null)
      room.generation = await deps.bumpFence(room.wsId, room.meetingId);
  await deps.savePending(plan);
  const added = plan.rooms.filter((room) => room.generation == null);
  for (const room of added)
    room.generation = await deps.bumpFence(room.wsId, room.meetingId);
  if (added.length) await deps.savePending(plan);
  if (attendanceErasureSettled(plan)) {
    await deps.finishPending(plan.sql);
    return;
  }
  await queuePage(plan, deps);
}

/** Posts one page, then removes the plan only after SQL and every room ack. */
export async function driveAttendanceErasure(
  plan: AttendanceErasurePlan | null,
  deps: AttendanceErasureDeps
) {
  if (!plan) return;
  const page = unackedAttendanceRooms(plan).slice(
    0,
    ATTENDANCE_ERASURE_ROOM_PAGE
  );
  if (page.length) {
    try {
      await mapBounded(page, ATTENDANCE_ERASURE_FANOUT, async (room) => {
        for (const claim of claimsFor(plan)) {
          if (room.posted?.includes(claim.key)) continue;
          const { key, ...extra } = claim;
          await deps.postRoom(room.roomId, {
            ...extra,
            generation: room.generation,
          });
          room.posted = [...(room.posted ?? []), key];
        }
      });
    } catch (error) {
      await deps.savePending(plan);
      throw error;
    }
    await deps.savePending(plan);
    if (unackedAttendanceRooms(plan).length) {
      await queuePage(plan, deps);
      return;
    }
  }
  if (!plan.sqlDone) {
    const roomIds = plan.rooms.map((room) => room.roomId);
    if (plan.sql.op === 'subject') {
      if (roomIds.length) await deps.reviseRooms(roomIds, plan.sql);
    } else if (roomIds.length) {
      await deps.forgetRooms(roomIds);
    }
    await deps.deleteSql(plan.sql);
    plan.sqlDone = true;
    await deps.savePending(plan);
  }
  if (attendanceErasureSettled(plan)) await deps.finishPending(plan.sql);
}

export async function settleAttendanceErasure(
  plan: AttendanceErasurePlan | null,
  deps: AttendanceErasureDeps
) {
  if (!plan) return;
  await enqueueAttendanceErasure(plan, deps);
  const pages = Math.ceil(plan.rooms.length / ATTENDANCE_ERASURE_ROOM_PAGE) + 1;
  for (let index = 0; index < Math.max(pages, 1); index += 1) {
    if (attendanceErasureSettled(plan)) return;
    const before = unackedAttendanceRooms(plan).length;
    await driveAttendanceErasure(plan, deps);
    if (attendanceErasureSettled(plan)) return;
    if (unackedAttendanceRooms(plan).length === before) return;
  }
}

export type { AttendanceErasureSql };
