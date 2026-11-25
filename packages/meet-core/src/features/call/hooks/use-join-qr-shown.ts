'use client';

import {
  isMeetJoinQrShown,
  type MeetRoomSettings,
  meetJoinQrHidesAt,
} from '@tuturuuu/realtime/meet';
import { useEffect, useState } from 'react';

/** setTimeout clamps longer waits to 1 ms, so cap them. */
const MAX_WAIT_MS = 2 ** 31 - 1;

/**
 * Whether the stage shows the join QR now. It re-renders once at the room's
 * auto-hide time, so every client hides the QR together.
 */
export function useJoinQrShown(settings: MeetRoomSettings | undefined) {
  const hidesAt = meetJoinQrHidesAt(settings);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (hidesAt === null) return;
    const wait = hidesAt - Date.now();
    if (wait <= 0) {
      setNow(Date.now());
      return;
    }
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(wait, MAX_WAIT_MS)
    );
    return () => clearTimeout(timer);
  }, [hidesAt]);
  return isMeetJoinQrShown(settings, now);
}
