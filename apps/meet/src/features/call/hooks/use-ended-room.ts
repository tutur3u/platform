'use client';
import { useEffect, useSyncExternalStore } from 'react';
import {
  isKnownEndedRoom,
  rememberEndedRoom,
  subscribeEndedRooms,
} from '../lib/ended-room-cache';

export function useEndedRoom(
  accountId: string,
  meetingId: string,
  confirmedEnded = false
) {
  const cached = useSyncExternalStore(
    subscribeEndedRooms,
    () => isKnownEndedRoom(accountId, meetingId),
    () => false
  );
  useEffect(() => {
    if (confirmedEnded) rememberEndedRoom(accountId, meetingId);
  }, [accountId, meetingId, confirmedEnded]);
  return confirmedEnded || cached;
}
