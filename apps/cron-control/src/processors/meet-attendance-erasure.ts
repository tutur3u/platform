import { withinDeadline } from './deadline';
import { type PrivateRpcResult, postPrivateRpc } from './maintenance-rpc';
import type { ProcessorContext, ProcessorResult } from './types';

// Meet attendance erasure for the Cloudflare schedule. One slot reconciles a
// page of intents, then erases at most MAX_PAGES pages of rooms through the
// Meet realtime entrypoint and records each room's acknowledgement, then
// finishes the intents that are settled. The database fence and the Cron
// Control fence both stop it. A claimed room that is never acknowledged is
// claimed again after its lease; a room erase repeats safely.

export const MEET_ATTENDANCE_ADVANCE_RPC =
  'advance_meet_attendance_erasure_intents';
export const MEET_ATTENDANCE_CLAIM_RPC = 'claim_meet_attendance_erasure_rooms';
export const MEET_ATTENDANCE_ACK_RPC = 'ack_meet_attendance_erasure_room';
export const MEET_ATTENDANCE_INTENT_PAGE = 32;
export const MEET_ATTENDANCE_ROOM_PAGE = 128;
export const MEET_ATTENDANCE_ROOM_PAGES = 4;
export const MEET_ATTENDANCE_ROOM_FANOUT = 4;
export const MEET_ATTENDANCE_LEASE_SECONDS = 300;
// One claimed room is about 250 bytes of JSON.
const CLAIM_RESPONSE_BYTES = 64 * 1024;

export type ClaimedAttendanceRoom = {
  kind: string;
  subjectKey: string;
  roomId: string;
  generation: number;
  keys: string[];
};

/** The Meet realtime `AttendanceErasure` entrypoint. */
export interface MeetAttendanceErasureBinding {
  erase(input: {
    roomId: string;
    generation: number;
    keys: string[];
  }): Promise<{ acked: string[] }>;
}

export interface MeetAttendanceErasureDeps {
  call: (
    rpc: string,
    body: Record<string, unknown>,
    maxBytes?: number
  ) => Promise<PrivateRpcResult>;
  erase: MeetAttendanceErasureBinding['erase'] | null;
  /** False once Cron Control stopped the job or its generation changed. */
  fence: () => Promise<boolean>;
}

type Counts = Record<string, number>;

function count(value: unknown, max: number) {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= max
    ? value
    : null;
}

function claimedRoom(value: unknown): ClaimedAttendanceRoom | null {
  if (typeof value !== 'object' || value === null) return null;
  const room = value as Record<string, unknown>;
  if (
    typeof room.kind !== 'string' ||
    typeof room.subjectKey !== 'string' ||
    typeof room.roomId !== 'string' ||
    typeof room.generation !== 'number' ||
    !Number.isSafeInteger(room.generation) ||
    room.generation < 1 ||
    !Array.isArray(room.keys) ||
    room.keys.length > 3 ||
    !room.keys.every((key) => typeof key === 'string')
  )
    return null;
  return {
    kind: room.kind,
    subjectKey: room.subjectKey,
    roomId: room.roomId,
    generation: room.generation,
    keys: room.keys as string[],
  };
}

async function advance(deps: MeetAttendanceErasureDeps, detail: Counts) {
  const result = await deps.call(MEET_ATTENDANCE_ADVANCE_RPC, {
    p_limit: MEET_ATTENDANCE_INTENT_PAGE,
  });
  if (result.kind === 'http') return 'failed' as const;
  if (
    result.kind !== 'ok' ||
    typeof result.value !== 'object' ||
    result.value === null
  )
    return 'unknown' as const;
  const body = result.value as Record<string, unknown>;
  if (body.state === 'fenced') return 'fenced' as const;
  if (body.state !== 'open') return 'unknown' as const;
  for (const name of ['advanced', 'finished', 'confirmed', 'cancelled']) {
    const value = count(body[name], MEET_ATTENDANCE_INTENT_PAGE);
    if (value === null) return 'unknown' as const;
    detail[name] = (detail[name] ?? 0) + value;
  }
  return 'open' as const;
}

async function mapBounded<T>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<void>
) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (let item = queue.shift(); item; item = queue.shift())
        await run(item);
    })
  );
}

async function erasePage(
  deps: MeetAttendanceErasureDeps,
  erase: MeetAttendanceErasureBinding['erase'],
  rooms: ClaimedAttendanceRoom[],
  detail: Counts
) {
  await mapBounded(rooms, MEET_ATTENDANCE_ROOM_FANOUT, async (room) => {
    let acked: string[];
    try {
      const result = await erase({
        roomId: room.roomId,
        generation: room.generation,
        keys: room.keys,
      });
      acked = Array.isArray(result?.acked)
        ? result.acked.filter((key) => room.keys.includes(key))
        : [];
    } catch {
      detail.failed += 1;
      return;
    }
    if (acked.length < room.keys.length) detail.failed += 1;
    if (!acked.length) return;
    const recorded = await deps
      .call(MEET_ATTENDANCE_ACK_RPC, {
        p_kind: room.kind,
        p_subject_key: room.subjectKey,
        p_room_id: room.roomId,
        p_generation: room.generation,
        p_keys: acked,
      })
      .catch(() => null);
    if (recorded?.kind !== 'ok') detail.failed += 1;
    else if (recorded.value === 'acked') detail.acked += 1;
    else detail.stale += 1;
  });
}

export async function runMeetAttendanceErasure(
  deps: MeetAttendanceErasureDeps
): Promise<ProcessorResult> {
  const detail: Counts = { claimed: 0, acked: 0, stale: 0, failed: 0 };
  if (!(await deps.fence())) return { detail: {}, outcome: 'stopped' };
  if (!deps.erase) return { detail: { unbound: 1 }, outcome: 'failed' };

  let state: Awaited<ReturnType<typeof advance>>;
  try {
    state = await advance(deps, detail);
  } catch {
    return { detail, outcome: 'unknown' };
  }
  if (state === 'fenced')
    return { detail: { ...detail, fenced: 1 }, outcome: 'ok' };
  if (state !== 'open') return { detail, outcome: state };

  for (let page = 0; page < MEET_ATTENDANCE_ROOM_PAGES; page += 1) {
    if (!(await deps.fence())) return { detail, outcome: 'stopped' };
    let claimed: PrivateRpcResult;
    try {
      claimed = await deps.call(
        MEET_ATTENDANCE_CLAIM_RPC,
        {
          p_limit: MEET_ATTENDANCE_ROOM_PAGE,
          p_lease_seconds: MEET_ATTENDANCE_LEASE_SECONDS,
        },
        CLAIM_RESPONSE_BYTES
      );
    } catch {
      return { detail, outcome: 'unknown' };
    }
    if (claimed.kind === 'http') return { detail, outcome: 'failed' };
    if (
      claimed.kind !== 'ok' ||
      typeof claimed.value !== 'object' ||
      claimed.value === null
    )
      return { detail, outcome: 'unknown' };
    const body = claimed.value as Record<string, unknown>;
    if (body.state === 'fenced')
      return { detail: { ...detail, fenced: 1 }, outcome: 'ok' };
    const stuck = count(body.stuck, Number.MAX_SAFE_INTEGER);
    if (
      body.state !== 'open' ||
      !Array.isArray(body.rooms) ||
      body.rooms.length > MEET_ATTENDANCE_ROOM_PAGE ||
      stuck === null
    )
      return { detail, outcome: 'unknown' };
    detail.stuck = stuck;
    const rooms = body.rooms.map(claimedRoom);
    if (rooms.some((room) => room === null))
      return { detail, outcome: 'unknown' };
    if (!rooms.length) break;
    detail.claimed += rooms.length;
    await erasePage(deps, deps.erase, rooms as ClaimedAttendanceRoom[], detail);
    if (rooms.length < MEET_ATTENDANCE_ROOM_PAGE) break;
  }

  if (!(await deps.fence())) return { detail, outcome: 'stopped' };
  try {
    state = await advance(deps, detail);
  } catch {
    return { detail, outcome: 'unknown' };
  }
  if (state === 'failed' || state === 'unknown')
    return { detail, outcome: state };
  return { detail, outcome: detail.failed ? 'failed' : 'ok' };
}

/** Cron Control adapter. The service key calls the private functions. */
export function eraseMeetAttendance(
  context: ProcessorContext
): Promise<ProcessorResult> {
  const binding = context.env.MEET_ATTENDANCE_ERASURE;
  return runMeetAttendanceErasure({
    call: (rpc, body, maxBytes) => postPrivateRpc(context, rpc, body, maxBytes),
    erase: binding
      ? (input) => withinDeadline(context, () => binding.erase(input))
      : null,
    fence: () => withinDeadline(context, context.fence),
  });
}
