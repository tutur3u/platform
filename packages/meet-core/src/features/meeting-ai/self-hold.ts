'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Local per-speaker capture fences for one meeting, kept apart from server
 * state so they apply at once:
 * - `held`: a decline or Mira off was started. It is set before the request
 *   is sent and only a successful Allow started after it clears it, so a
 *   slow or failed request never leaves capture running. Each hold takes a
 *   new, monotonic epoch; the flag (never audio) is mirrored in session
 *   storage so a reload of the tab keeps it.
 * - `noticeRequired`: the server wants the person to confirm the
 *   per-speaker notice; only a successful per-speaker Allow clears it.
 * - `ineligible`: the server says this person cannot contribute here.
 */
export type SelfCaptureFlags = {
  held: boolean;
  noticeRequired: boolean;
  ineligible: boolean;
};

type Entry = SelfCaptureFlags & { holdEpoch: number };

const NONE: SelfCaptureFlags = {
  held: false,
  noticeRequired: false,
  ineligible: false,
};
const entries = new Map<string, Entry>();
const snapshots = new Map<string, SelfCaptureFlags>();
const listeners = new Map<string, Set<() => void>>();
let counter = 0;
const storageKey = (meetingId: string) => `meet-self-hold:${meetingId}`;

function storage() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function entry(meetingId: string): Entry {
  const existing = entries.get(meetingId);
  if (existing) return existing;
  let holdEpoch = 0;
  try {
    holdEpoch = Number(storage()?.getItem(storageKey(meetingId)) ?? 0) || 0;
  } catch {
    // Without storage the hold lasts for this page only.
  }
  counter = Math.max(counter, holdEpoch);
  const created: Entry = { ...NONE, held: holdEpoch > 0, holdEpoch };
  entries.set(meetingId, created);
  return created;
}

function change(meetingId: string, next: Partial<Entry>) {
  const current = entry(meetingId);
  const updated = { ...current, ...next };
  if (
    updated.held === current.held &&
    updated.noticeRequired === current.noticeRequired &&
    updated.ineligible === current.ineligible &&
    updated.holdEpoch === current.holdEpoch
  )
    return;
  entries.set(meetingId, updated);
  snapshots.delete(meetingId);
  for (const listener of [...(listeners.get(meetingId) ?? [])]) listener();
}

export function selfCaptureFlags(meetingId: string): SelfCaptureFlags {
  const cached = snapshots.get(meetingId);
  if (cached) return cached;
  const { held, noticeRequired, ineligible } = entry(meetingId);
  const snapshot = { held, noticeRequired, ineligible };
  snapshots.set(meetingId, snapshot);
  return snapshot;
}

/** Holds capture and returns the hold's epoch. */
export function holdSelfCapture(meetingId: string) {
  entry(meetingId);
  const holdEpoch = ++counter;
  try {
    storage()?.setItem(storageKey(meetingId), String(holdEpoch));
  } catch {
    // The in-memory hold still applies.
  }
  change(meetingId, { held: true, holdEpoch });
  return holdEpoch;
}

/** The epoch an Allow starting now is ordered after. */
export const selfHoldEpoch = (meetingId: string) => {
  entry(meetingId);
  return counter;
};

/**
 * Releases the hold, unless it was set after `since` (an Allow that started
 * before a later decline never undoes that decline).
 */
export function releaseSelfCapture(meetingId: string, since = Infinity) {
  if (entry(meetingId).holdEpoch > since) return;
  try {
    storage()?.removeItem(storageKey(meetingId));
  } catch {
    // Nothing stored to clear.
  }
  change(meetingId, { held: false, holdEpoch: 0 });
}

export const isSelfCaptureHeld = (meetingId: string) =>
  selfCaptureFlags(meetingId).held;

export function requireSelfNotice(meetingId: string) {
  change(meetingId, { noticeRequired: true });
}

export function confirmSelfNotice(meetingId: string) {
  change(meetingId, { noticeRequired: false });
}

export function markSelfIneligible(meetingId: string) {
  change(meetingId, { ineligible: true });
}

/** Clears every flag; for a meeting this tab no longer shows. */
export function resetSelfCaptureFlags(meetingId: string) {
  releaseSelfCapture(meetingId);
  change(meetingId, { noticeRequired: false, ineligible: false });
}

/** Calls `listener` synchronously whenever a flag for `meetingId` changes. */
export function onSelfCaptureFlags(meetingId: string, listener: () => void) {
  const set = listeners.get(meetingId) ?? new Set();
  set.add(listener);
  listeners.set(meetingId, set);
  return () => {
    set.delete(listener);
    if (!set.size) listeners.delete(meetingId);
  };
}

export function useSelfCaptureFlags(meetingId: string) {
  const subscribe = useCallback(
    (listener: () => void) => onSelfCaptureFlags(meetingId, listener),
    [meetingId]
  );
  return useSyncExternalStore(
    subscribe,
    () => selfCaptureFlags(meetingId),
    () => NONE
  );
}
