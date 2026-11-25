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
 * Whether the stage shows the join QR now. The auto-hide deadline is on the
 * room's clock, read through `skew` (`CallState.settingsClockSkew`,
 * measured when the settings arrived), so a device with a fast or slow clock
 * hides the QR with everyone else, however late this view mounts. It
 * re-renders once at that time.
 */
export function useJoinQrShown(
  settings: MeetRoomSettings | undefined,
  skew = 0
) {
  const hidesAt = meetJoinQrHidesAt(settings);
  const localHidesAt = hidesAt === null ? null : hidesAt - skew;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (localHidesAt === null) return;
    const wait = localHidesAt - Date.now();
    if (wait <= 0) {
      setNow(Date.now());
      return;
    }
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(wait, MAX_WAIT_MS)
    );
    return () => clearTimeout(timer);
  }, [localHidesAt]);
  return isMeetJoinQrShown(settings, now + skew);
}
