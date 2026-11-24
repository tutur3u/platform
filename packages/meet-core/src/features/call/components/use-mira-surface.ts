'use client';

import { useLiveSession } from '../../live-assistant/live-session-store';
import { useRoomMiraConsent } from './use-room-mira';

/**
 * Whether Mira exists for this person in this call at all. The header's Mira
 * control and the chat's Private Assistant tab both follow it, so neither one
 * shows without the other.
 *
 * Mira exists when this device owns a Private Assistant (its policy may still
 * be unavailable; the choice dialog explains why) or room Mira is available.
 * It is off only when no Private Assistant is published and the room says
 * room Mira is unavailable. A failed or pending read never hides it.
 */
export function useMiraSurface(meetingId: string, accountId?: string) {
  const session = useLiveSession(meetingId, accountId);
  const room = useRoomMiraConsent(meetingId);
  return {
    session,
    off: !session && room.data?.available === false,
  };
}
