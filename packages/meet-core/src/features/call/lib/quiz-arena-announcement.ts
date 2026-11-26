'use client';

import { useCallback, useSyncExternalStore } from 'react';

const activeRooms = new Set<string>();
type Listener = (change?: { teamId?: string }) => void;
const listeners = new Map<string, Set<Listener>>();

export function subscribeArenaChanges(meetingId: string, listener: Listener) {
  const room = listeners.get(meetingId) ?? new Set<Listener>();
  room.add(listener);
  listeners.set(meetingId, room);
  return () => {
    room.delete(listener);
    if (!room.size) listeners.delete(meetingId);
  };
}

export function setArenaAnnouncement(
  meetingId: string,
  active: boolean,
  teamId?: string
) {
  if (active) activeRooms.add(meetingId);
  else activeRooms.delete(meetingId);
  for (const listener of listeners.get(meetingId) ?? []) listener({ teamId });
}

export function clearArenaAnnouncement(meetingId: string) {
  if (!activeRooms.delete(meetingId)) return;
  for (const listener of listeners.get(meetingId) ?? []) listener();
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
