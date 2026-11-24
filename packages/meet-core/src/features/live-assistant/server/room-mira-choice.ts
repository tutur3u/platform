import 'server-only';
import { MeetCallAccessError } from '../../call/lib/call-access';
import {
  callRoomService,
  type MeetCallRouteAccess,
} from '../../call/server/room-service';
import {
  type MiraChoiceEvidence,
  MiraChoiceRecordError,
  recordMiraChoice,
} from './room-mira-evidence';

export type RoomMiraChoiceInput = {
  choice: 'on' | 'off';
  version: string;
  acceptanceRevision: number;
  source: 'join' | 'confirm' | 'toggle';
  textHash: string;
  locale: string;
  noticeMode?: 'room' | 'self';
};

const isGuest = (access: MeetCallRouteAccess) =>
  'guest' in access && access.guest === true;

const notSaved = () =>
  new MeetCallAccessError(503, 'Your choice could not be saved');

/**
 * Refusals the database will repeat (unknown revision, check, uniqueness,
 * invalid value, permission); retrying them cannot help.
 */
const DETERMINISTIC = new Set(['23503', '23514', '23505', '22023', '42501']);

/** One retry covers a transient storage error; a second failure is final. */
async function recordWithRetry(evidence: MiraChoiceEvidence) {
  try {
    await recordMiraChoice(evidence);
  } catch (error) {
    if (
      error instanceof MiraChoiceRecordError &&
      DETERMINISTIC.has(error.pgCode ?? '')
    )
      throw error;
    await recordMiraChoice(evidence);
  }
}

const statusOf = (error: unknown) =>
  typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status: unknown }).status)
    : 0;

/** The room may have applied a call whose answer was lost or failed. */
const roomOutcomeUnknown = (error: unknown) => {
  const status = statusOf(error);
  return !status || status >= 500;
};

function evidenceOf(
  access: MeetCallRouteAccess,
  input: RoomMiraChoiceInput,
  requireNoticeMode: boolean
): MiraChoiceEvidence {
  return {
    meetingId: access.meeting.id,
    wsId: access.meeting.ws_id,
    participantId: access.user.id,
    guest: isGuest(access),
    choice: input.choice,
    source: input.source,
    acceptanceRevision: input.acceptanceRevision,
    noticeVersion: input.version,
    textHash: input.textHash,
    locale: input.locale,
    ...(input.noticeMode === 'self'
      ? { noticeMode: 'self' as const, requireNoticeMode }
      : {}),
  };
}

const roomChoice = (access: MeetCallRouteAccess, input: RoomMiraChoiceInput) =>
  callRoomService(access, {
    action: 'mira.room.choice',
    choice: input.choice,
    version: input.version,
    acceptanceRevision: input.acceptanceRevision,
    // The room refuses a Join state that would turn an earlier off on.
    source: input.source,
    // The room refuses an on under another mode's notice in the same turn.
    ...(input.noticeMode ? { noticeMode: input.noticeMode } : {}),
  });

/**
 * A participant's own off. The withdrawal is recorded whatever the room
 * answers, with one retry; a ledger that cannot be written is a 503 so the
 * client retries. When the room failed but the evidence landed, the room's
 * error is returned so the client retries the room off; a duplicate off row
 * is harmless, a missing one is not.
 */
async function recordOff(
  access: MeetCallRouteAccess,
  input: RoomMiraChoiceInput
) {
  let roomError: unknown;
  try {
    await roomChoice(access, input);
  } catch (error) {
    roomError = error;
  }
  try {
    await recordWithRetry(evidenceOf(access, input, false));
  } catch (error) {
    console.error('Room Mira withdrawal evidence failed', {
      name: error instanceof Error ? error.name : 'unknown',
    });
    throw notSaved();
  }
  if (roomError) throw roomError;
}

/**
 * Turns the room back off for an on that has no evidence, retrying once.
 * If the room still cannot be reached, an alertable error names only the
 * meeting and the account so an operator can turn Mira off for them.
 */
async function compensateOn(
  access: MeetCallRouteAccess,
  input: RoomMiraChoiceInput
) {
  const off = () =>
    callRoomService(access, {
      action: 'mira.room.choice',
      choice: 'off',
      version: input.version,
      acceptanceRevision: input.acceptanceRevision,
    });
  try {
    await off();
  } catch {
    try {
      await off();
    } catch {
      console.error('[meet-mira] room on left without evidence', {
        meetingId: access.meeting.id,
        accountId: access.user.id,
      });
      return;
    }
  }
  try {
    await recordMiraChoice({
      ...evidenceOf(access, { ...input, choice: 'off' }, false),
      source: 'system_fallback',
    });
  } catch {
    console.error('Room Mira fallback evidence failed');
  }
}

/**
 * A participant's own on. It counts only with durable evidence: after the
 * room accepts it, the evidence is written with one retry. If that still
 * fails, or the room call failed in a way that may still have applied it
 * (no answer, timeout, 5xx), the room is turned back off (retried once) and
 * that system-initiated off is recorded with source `system_fallback`, so
 * the room never stays on without evidence. A clear room refusal (4xx) left
 * the room unchanged and is passed through.
 */
async function recordOn(
  access: MeetCallRouteAccess,
  input: RoomMiraChoiceInput,
  requireNoticeMode: boolean
) {
  try {
    await roomChoice(access, input);
  } catch (error) {
    if (roomOutcomeUnknown(error)) await compensateOn(access, input);
    throw error;
  }
  try {
    await recordWithRetry(evidenceOf(access, input, requireNoticeMode));
    return;
  } catch (error) {
    console.error('Room Mira choice evidence failed', {
      name: error instanceof Error ? error.name : 'unknown',
    });
  }
  await compensateOn(access, input);
  throw notSaved();
}

/** Applies the caller's own Mira choice in the room and its evidence. */
export async function applyRoomMiraChoice(
  access: MeetCallRouteAccess,
  input: RoomMiraChoiceInput,
  requireNoticeMode: boolean
) {
  if (input.choice === 'off') return recordOff(access, input);
  return recordOn(access, input, requireNoticeMode);
}
