'use client';

import { useEffect, useRef } from 'react';

/**
 * Opens the room's default activity once, when this person's call goes live.
 * The room sends its settings with the join reply, so the value seen then is
 * the one the host chose. A default set or cleared later does not move
 * people already in the call, and closing it is the person's own choice.
 */
export function useDefaultActivity({
  live,
  activityId,
  open,
}: {
  live: boolean;
  /** The room's `defaultActivity`, already checked against known tools. */
  activityId: string | null | undefined;
  open: (activityId: string) => void;
}) {
  const settled = useRef(false);
  const latest = useRef(open);
  latest.current = open;
  useEffect(() => {
    if (!live || settled.current) return;
    settled.current = true;
    if (activityId) latest.current(activityId);
  }, [live, activityId]);
}
