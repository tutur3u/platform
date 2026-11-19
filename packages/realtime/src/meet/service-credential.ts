import { signRealtimePayload, verifyRealtimePayload } from '../core/token';

export const MEET_SERVICE_TTL_SECONDS = 60;

export type MeetServicePurpose =
  | 'attendance-ledger'
  | 'class-timer'
  | 'attendance-erase'
  | 'attendance-index';

export type MeetServiceClaims = {
  aud: 'meet-service';
  purpose: MeetServicePurpose;
  roomId: string;
  exp: number;
  action?: 'start' | 'pause' | 'resume' | 'stop';
  durationMs?: number;
  actorUserId?: string;
  actorRole?: 'host' | 'cohost';
  erase?: 'meeting' | 'subject';
  userId?: string;
  guestId?: string;
  /** Fence generation assigned by SQL. Both subject posts share one value. */
  generation?: number;
};

export function signMeetServiceCredential(
  claims: MeetServiceClaims,
  secret?: string
) {
  return signRealtimePayload(claims, secret);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

export function verifyMeetServiceCredential(
  token: string,
  secret?: string,
  nowMs = Date.now()
): MeetServiceClaims | null {
  let parsed: unknown;
  try {
    parsed = verifyRealtimePayload(token, secret);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed.aud !== 'meet-service') return null;
  if (
    parsed.purpose !== 'attendance-ledger' &&
    parsed.purpose !== 'class-timer' &&
    parsed.purpose !== 'attendance-erase' &&
    parsed.purpose !== 'attendance-index'
  )
    return null;
  if (typeof parsed.roomId !== 'string' || !parsed.roomId) return null;
  if (typeof parsed.exp !== 'number' || parsed.exp * 1000 <= nowMs) return null;
  if (parsed.purpose === 'class-timer') {
    if (
      parsed.action !== 'start' &&
      parsed.action !== 'pause' &&
      parsed.action !== 'resume' &&
      parsed.action !== 'stop'
    )
      return null;
    if (parsed.actorRole !== 'host' && parsed.actorRole !== 'cohost')
      return null;
    if (typeof parsed.actorUserId !== 'string' || !parsed.actorUserId)
      return null;
    if (
      parsed.durationMs !== undefined &&
      (!Number.isInteger(parsed.durationMs) ||
        typeof parsed.durationMs !== 'number')
    )
      return null;
  }
  if (parsed.purpose === 'attendance-erase') {
    if (
      typeof parsed.generation !== 'number' ||
      !Number.isInteger(parsed.generation) ||
      parsed.generation < 0
    )
      return null;
    if (parsed.erase === 'meeting') {
      if (parsed.userId !== undefined || parsed.guestId !== undefined)
        return null;
    } else if (parsed.erase === 'subject') {
      const userId = typeof parsed.userId === 'string' ? parsed.userId : '';
      const guestId = typeof parsed.guestId === 'string' ? parsed.guestId : '';
      if (!userId === !guestId) return null;
    } else {
      return null;
    }
  }
  return parsed as MeetServiceClaims;
}
