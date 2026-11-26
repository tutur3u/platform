'use client';

import { useCallback, useSyncExternalStore } from 'react';

const activeRooms = new Set<string>();
const listeners = new Map<string, Set<() => void>>();

export function subscribeArenaChanges(meetingId: string, listener: () => void) {
  const room = listeners.get(meetingId) ?? new Set<() => void>();
  room.add(listener);
  listeners.set(meetingId, room);
  return () => {
    room.delete(listener);
    if (!room.size) listeners.delete(meetingId);
  };
}

export function setArenaAnnouncement(meetingId: string, active: boolean) {
  if (active) activeRooms.add(meetingId);
  else activeRooms.delete(meetingId);
  for (const listener of listeners.get(meetingId) ?? []) listener();
}

export function clearArenaAnnouncement(meetingId: string) {
  activeRooms.delete(meetingId);
}

export function useArenaAnnouncement(meetingId: string) {
  return useSyncExternalStore(
    useCallback(
      (listener) => subscribeArenaChanges(meetingId, listener),
      [meetingId]
    ),
    () => activeRooms.has(meetingId),
    () => false
  );
}
