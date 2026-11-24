import 'server-only';
import { MeetCallAccessError } from '../../call/lib/call-access';
import {
  callRoomService,
  type MeetCallRouteAccess,
} from '../../call/server/room-service';

/** The Mira notice a participant saw: room capture or per-speaker capture. */
export type MiraNoticeMode = 'room' | 'self';

export const MIRA_ROOM_NOTICE_MODE_STALE = 'MIRA_ROOM_NOTICE_MODE_STALE';

/**
 * A Mira "on" counts only under the notice for the room's current transcript
 * mode, since the two notices describe different capture. A notice shown for
 * another mode is refused so the client reads the room again. A room without
 * a mode is in room capture. "Off" is never checked: anyone can always turn
 * Mira off.
 */
export async function requireCurrentMiraNoticeMode(
  access: MeetCallRouteAccess,
  noticeMode: MiraNoticeMode = 'room'
) {
  const view = await callRoomService<{ mode?: unknown }>(access, {
    action: 'transcript.consent.read',
  });
  const current: MiraNoticeMode = view?.mode === 'self' ? 'self' : 'room';
  if (noticeMode !== current)
    throw new MeetCallAccessError(
      409,
      'The Mira notice changed; review it and try again',
      MIRA_ROOM_NOTICE_MODE_STALE
    );
  return current;
}
