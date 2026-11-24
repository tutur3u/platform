'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Meetings where this tab must not capture the participant's own voice,
 * whatever the server last said. A decline or Mira off sets the hold before
 * its request is sent; only a successful Allow clears it, so a slow or failed
 * request never leaves capture running.
 */
const held = new Set<string>();
const listeners = new Map<string, Set<() => void>>();

function notify(meetingId: string) {
  for (const listener of [...(listeners.get(meetingId) ?? [])]) listener();
}

export function holdSelfCapture(meetingId: string) {
  if (held.has(meetingId)) return;
  held.add(meetingId);
  notify(meetingId);
}

export function releaseSelfCapture(meetingId: string) {
  if (!held.delete(meetingId)) return;
  notify(meetingId);
}

export const isSelfCaptureHeld = (meetingId: string) => held.has(meetingId);

/** Calls `listener` synchronously whenever the hold for `meetingId` changes. */
export function onSelfCaptureHold(meetingId: string, listener: () => void) {
  const set = listeners.get(meetingId) ?? new Set();
  set.add(listener);
  listeners.set(meetingId, set);
  return () => {
    set.delete(listener);
    if (!set.size) listeners.delete(meetingId);
  };
}

export function useSelfCaptureHold(meetingId: string) {
  const subscribe = useCallback(
    (listener: () => void) => onSelfCaptureHold(meetingId, listener),
    [meetingId]
  );
  return useSyncExternalStore(
    subscribe,
    () => held.has(meetingId),
    () => false
  );
}
