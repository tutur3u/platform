import { signRealtimePayload, verifyRealtimePayload } from '../core/token';

export const MEET_SERVICE_TTL_SECONDS = 60;
export const MEET_SERVICE_CLOCK_SKEW_SECONDS = 30;

export type MeetServicePurpose =
  | 'attendance-ledger'
  | 'class-timer'
  | 'attendance-erase'
  | 'attendance-index'
  /** Room to Meet Worker delivery of the per-speaker legal outbox. */
  | 'self-outbox';

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

/**
 * Verifies a room's per-speaker outbox delivery. Only the Meet Worker
 * accepts this purpose; the realtime Worker's own service endpoints refuse it.
 */
export function verifyMeetSelfOutboxCredential(
  token: string,
  secret?: string,
  nowMs = Date.now()
): (MeetServiceClaims & { purpose: 'self-outbox' }) | null {
  let parsed: unknown;
  try {
    parsed = verifyRealtimePayload(token, secret);
  } catch {
    return null;
  }
  if (
    !isRecord(parsed) ||
    parsed.aud !== 'meet-service' ||
    parsed.purpose !== 'self-outbox' ||
    typeof parsed.roomId !== 'string' ||
    !parsed.roomId ||
    typeof parsed.exp !== 'number' ||
    parsed.exp * 1000 <= nowMs ||
    // A credential is minted for one delivery; refuse longer lifetimes.
    parsed.exp * 1000 >
      nowMs +
        (MEET_SERVICE_TTL_SECONDS + MEET_SERVICE_CLOCK_SKEW_SECONDS) * 1000
  )
    return null;
  return parsed as MeetServiceClaims & { purpose: 'self-outbox' };
}
