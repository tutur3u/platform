'use client';

import type { MeetMediaState } from '@tuturuuu/realtime/meet';
import { type RefObject, useCallback } from 'react';
import type { MeetSignaling } from '../lib/signaling';

/**
 * Publishes this participant's focused activity and follow target over the
 * room's presence channel, keeping the current media state in the same message.
 */
export function usePresencePublisher(
  signalingRef: RefObject<MeetSignaling | null>,
  mediaRef: RefObject<MeetMediaState>
) {
  return useCallback(
    (activeActivityId: string | null, followingUserId: string | null) => {
      signalingRef.current?.send({
        media: mediaRef.current,
        activeActivityId,
        followingUserId,
        type: 'presence.update',
      });
    },
    [signalingRef, mediaRef]
  );
}
