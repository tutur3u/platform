'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Meetings where this tab must not capture the participant's own voice,
 * whatever the server last said. A decline or Mira off sets the hold before
 * its request is sent; only a successful Allow clears it, so a slow or failed
 * request never leaves capture running. The hold (a flag, never audio) is
 * mirrored in session storage so a reload of the tab keeps it.
 */
const held = new Set<string>();
const loaded = new Set<string>();
const listeners = new Map<string, Set<() => void>>();
const storageKey = (meetingId: string) => `meet-self-hold:${meetingId}`;

function storage() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function load(meetingId: string) {
  if (loaded.has(meetingId)) return;
  loaded.add(meetingId);
  try {
    if (storage()?.getItem(storageKey(meetingId)) === '1') held.add(meetingId);
  } catch {
    // Without storage the hold lasts for this page only.
  }
}

function notify(meetingId: string) {
  for (const listener of [...(listeners.get(meetingId) ?? [])]) listener();
}

export function holdSelfCapture(meetingId: string) {
  load(meetingId);
  if (held.has(meetingId)) return;
  held.add(meetingId);
  try {
    storage()?.setItem(storageKey(meetingId), '1');
  } catch {
    // The in-memory hold still applies.
  }
  notify(meetingId);
}

export function releaseSelfCapture(meetingId: string) {
  load(meetingId);
  try {
    storage()?.removeItem(storageKey(meetingId));
  } catch {
    // Nothing stored to clear.
  }
  if (!held.delete(meetingId)) return;
  notify(meetingId);
}

export function isSelfCaptureHeld(meetingId: string) {
  load(meetingId);
  return held.has(meetingId);
}

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
    () => isSelfCaptureHeld(meetingId),
    () => false
  );
}
