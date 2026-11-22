'use client';

import { useState } from 'react';

/**
 * A draft that starts from what the room stored and follows it until the
 * person edits. A newer stored value replaces an untouched draft and never
 * text the person has typed, so an answer that arrives after the first
 * render, a save by someone else or a reconnect cannot wipe their work.
 */
export function useRoomDraft<T>(
  stored: T,
  same: (a: T, b: T) => boolean = Object.is
) {
  const [base, setBase] = useState(stored);
  const [draft, setDraft] = useState(stored);
  if (!same(base, stored)) {
    // State adjusted while rendering: React restarts this render at once.
    setBase(stored);
    if (same(draft, base)) setDraft(stored);
  }
  return [draft, setDraft] as const;
}
