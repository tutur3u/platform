import { withinDeadline } from './deadline';
import { type PrivateRpcResult, postPrivateRpc } from './maintenance-rpc';
import type { ProcessorContext, ProcessorResult } from './types';

// Attendance retention for the Cloudflare schedule. One slot calls the bounded
// purge, then one page of confirmed erasure intents. Both functions stop when
// the database fence is closed. Repeating a slot converges: expired rows and
// settled plans that are already gone stay gone.

export const MEET_ATTENDANCE_PURGE_RPC = 'purge_expired_meet_attendance';
export const MEET_ATTENDANCE_INTENT_RPC =
  'advance_meet_attendance_erasure_intents';
export const MEET_ATTENDANCE_PURGE_LIMIT = 200;
export const MEET_ATTENDANCE_INTENT_LIMIT = 32;

export interface MeetAttendanceRetentionDeps {
  call: (
    rpc: string,
    body: Record<string, unknown>
  ) => Promise<PrivateRpcResult>;
  /** False once Cron Control stopped the job or its generation changed. */
  fence: () => Promise<boolean>;
}

function count(value: unknown, max: number) {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= max
    ? value
    : null;
}

export async function runMeetAttendanceRetention(
  deps: MeetAttendanceRetentionDeps
): Promise<ProcessorResult> {
  if (!(await deps.fence())) return { detail: {}, outcome: 'stopped' };

  let purgedResult: PrivateRpcResult;
  try {
    purgedResult = await deps.call(MEET_ATTENDANCE_PURGE_RPC, {
      p_limit: MEET_ATTENDANCE_PURGE_LIMIT,
    });
  } catch {
    return { detail: {}, outcome: 'unknown' };
  }
  if (purgedResult.kind === 'http') return { detail: {}, outcome: 'failed' };
  const purged =
    purgedResult.kind === 'ok'
      ? count(purgedResult.value, MEET_ATTENDANCE_PURGE_LIMIT)
      : null;
  if (purged === null) return { detail: {}, outcome: 'unknown' };
  if (!(await deps.fence())) return { detail: { purged }, outcome: 'stopped' };

  let intentResult: PrivateRpcResult;
  try {
    intentResult = await deps.call(MEET_ATTENDANCE_INTENT_RPC, {
      p_limit: MEET_ATTENDANCE_INTENT_LIMIT,
    });
  } catch {
    return { detail: { purged }, outcome: 'unknown' };
  }
  if (intentResult.kind === 'http')
    return { detail: { purged }, outcome: 'failed' };
  if (
    intentResult.kind !== 'ok' ||
    typeof intentResult.value !== 'object' ||
    intentResult.value === null ||
    Array.isArray(intentResult.value)
  )
    return { detail: { purged }, outcome: 'unknown' };
  const body = intentResult.value as Record<string, unknown>;
  const advanced = count(body.advanced, MEET_ATTENDANCE_INTENT_LIMIT);
  const finished = count(body.finished, MEET_ATTENDANCE_INTENT_LIMIT);
  if (advanced === null || finished === null || finished > advanced)
    return { detail: { purged }, outcome: 'unknown' };
  if (body.state === 'fenced')
    return {
      detail: { purged, advanced, finished, fenced: 1 },
      outcome: 'ok',
    };
  if (body.state !== 'open') return { detail: { purged }, outcome: 'unknown' };
  return { detail: { purged, advanced, finished }, outcome: 'ok' };
}

/** Cron Control adapter. The service key calls the private functions. */
export function retainMeetAttendance(
  context: ProcessorContext
): Promise<ProcessorResult> {
  return runMeetAttendanceRetention({
    call: (rpc, body) => postPrivateRpc(context, rpc, body),
    fence: () => withinDeadline(context, context.fence),
  });
}
