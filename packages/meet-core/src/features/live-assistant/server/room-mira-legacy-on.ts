import 'server-only';
import {
  callRoomService,
  type MeetCallRouteAccess,
} from '../../call/server/room-service';
import {
  type MiraChoiceEvidence,
  recordMiraChoice,
} from './room-mira-evidence';

/*
 * Rooms without two-phase Mira support apply an on at once, so an on whose
 * evidence failed must be turned back off. This module applies only to those
 * rooms (an on reply with no pendingId) and to an on call whose answer was
 * lost. Delete it once meet-realtime with two-phase Mira runs everywhere.
 */

const statusOf = (error: unknown) =>
  typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status: unknown }).status)
    : 0;

/** The room may have applied a call whose answer was lost or failed. */
export const roomOutcomeUnknown = (error: unknown) => {
  const status = statusOf(error);
  return !status || status >= 500;
};

/**
 * Turns the room back off for an on that has no evidence, retrying once.
 * If the room still cannot be reached, an alertable error names only the
 * meeting and the account so an operator can turn Mira off for them. The
 * system-initiated off is recorded with source `system_fallback`.
 */
export async function compensateLegacyOn(
  access: MeetCallRouteAccess,
  input: { version: string; acceptanceRevision: number },
  offEvidence: MiraChoiceEvidence
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
    await recordMiraChoice({ ...offEvidence, source: 'system_fallback' });
  } catch {
    console.error('Room Mira fallback evidence failed');
  }
}
