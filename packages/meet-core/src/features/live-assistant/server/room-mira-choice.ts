import 'server-only';
import { getCloudflareContext } from '@opennextjs/cloudflare';
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
import { compensateLegacyOn, roomOutcomeUnknown } from './room-mira-legacy-on';

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

/**
 * A room refusal carries the room's own status. Anything else (a failed or
 * aborted fetch, an unreadable answer, an error before the request) leaves
 * the outcome unknown and is answered 503 so the client asks again.
 */
const roomFailure = (error: unknown) =>
  error instanceof MeetCallAccessError ? error : notSaved();

function evidenceOf(
  access: MeetCallRouteAccess,
  input: RoomMiraChoiceInput,
  requireNoticeMode: boolean,
  pendingId?: string
): MiraChoiceEvidence {
  return {
    ...(pendingId ? { pendingId } : {}),
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
  callRoomService<{ pendingId?: unknown }>(access, {
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
  if (roomError) throw roomFailure(roomError);
}

/**
 * Lets work finish after the response when the Worker offers waitUntil;
 * the caller still awaits the same promise for its answer.
 */
async function keepAlive<T>(work: Promise<T>) {
  try {
    const { ctx } = await getCloudflareContext({ async: true });
    ctx?.waitUntil?.(work.catch(() => undefined));
  } catch {
    // Outside a Worker there is nothing to extend.
  }
  return work;
}

const PENDING_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A participant's own on, in two phases fenced by the room. The room holds
 * the on as pending (no effect on anything consent-gated) and returns its
 * pending id; the evidence row is written with that id (one retry); only
 * then does the room confirm it. Without evidence nothing is confirmed and
 * the pending on expires by itself, so a lost answer, a late or replayed on,
 * a cancelled request or a racing tab can never leave Mira on without
 * evidence. An expired or superseded pending id is a 503 so the client asks
 * again.
 */
async function recordOn(
  access: MeetCallRouteAccess,
  input: RoomMiraChoiceInput,
  requireNoticeMode: boolean
) {
  const offEvidence = evidenceOf(access, { ...input, choice: 'off' }, false);
  let reply: { pendingId?: unknown };
  try {
    reply = await roomChoice(access, input);
  } catch (error) {
    // Legacy rooms may have applied an on whose answer was lost; on a
    // two-phase room this off only drops the pending on.
    if (roomOutcomeUnknown(error))
      await keepAlive(compensateLegacyOn(access, input, offEvidence));
    throw roomFailure(error);
  }
  // Already on under the same acceptance and notice: nothing was staged, and
  // the evidence for that on was recorded when it was confirmed.
  if (reply?.pendingId === null) return;
  // A room without the pending fence (deployed before it) applied the on at
  // once: record its evidence as before. The server can therefore deploy
  // before or with the room, never after it.
  if (reply?.pendingId === undefined) {
    await keepAlive(
      recordEffectiveOn(access, input, requireNoticeMode, offEvidence)
    );
    return;
  }
  const pendingId =
    typeof reply.pendingId === 'string' && PENDING_ID.test(reply.pendingId)
      ? reply.pendingId
      : undefined;
  if (!pendingId) throw notSaved();
  // The evidence and confirm finish even if the client disconnects.
  await keepAlive(
    confirmWithEvidence(access, input, requireNoticeMode, pendingId)
  );
}

/**
 * Rooms without two-phase Mira support: the on is already effective, so an
 * on whose evidence fails is compensated (see room-mira-legacy-on.ts).
 */
async function recordEffectiveOn(
  access: MeetCallRouteAccess,
  input: RoomMiraChoiceInput,
  requireNoticeMode: boolean,
  offEvidence: MiraChoiceEvidence
) {
  try {
    await recordWithRetry(evidenceOf(access, input, requireNoticeMode));
  } catch (error) {
    console.error('Room Mira choice evidence failed', {
      name: error instanceof Error ? error.name : 'unknown',
    });
    await compensateLegacyOn(access, input, offEvidence);
    throw notSaved();
  }
}

async function confirmWithEvidence(
  access: MeetCallRouteAccess,
  input: RoomMiraChoiceInput,
  requireNoticeMode: boolean,
  pendingId: string
) {
  try {
    await recordWithRetry(
      evidenceOf(access, input, requireNoticeMode, pendingId)
    );
  } catch (error) {
    console.error('Room Mira choice evidence failed', {
      name: error instanceof Error ? error.name : 'unknown',
    });
    throw notSaved();
  }
  try {
    await callRoomService(access, {
      action: 'mira.room.confirm',
      pendingId,
      // The room binds the pending on to its room, account and notice mode.
      ...(input.noticeMode ? { noticeMode: input.noticeMode } : {}),
    });
  } catch {
    // Expired, superseded or unreachable: the pending on lapses by itself.
    throw notSaved();
  }
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
