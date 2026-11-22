'use client';

import {
  EMPTY_LIVE_ACTIVITIES_MINE,
  EMPTY_LIVE_ACTIVITIES_SNAPSHOT,
  type LiveActivitiesHost,
  type LiveActivitiesMine,
  type LiveActivitiesSnapshot,
  type LiveActivityCommand,
  type MeetRealtimeClientMessage,
  type MeetRealtimeServerMessage,
} from '@tuturuuu/realtime/meet';
import { useSyncExternalStore } from 'react';

export type {
  LiveActivitiesHost,
  LiveActivitiesMine,
  LiveActivitiesSnapshot,
  LiveActivityCommand,
} from '@tuturuuu/realtime/meet';

export type LiveActivitiesView = {
  snapshot: LiveActivitiesSnapshot;
  mine: LiveActivitiesMine;
  host: LiveActivitiesHost | null;
  /** Why the room refused this person's last command; cleared by the next one. */
  error: string | null;
};

const EMPTY: LiveActivitiesView = {
  snapshot: EMPTY_LIVE_ACTIVITIES_SNAPSHOT,
  mine: EMPTY_LIVE_ACTIVITIES_MINE,
  host: null,
  error: null,
};

type Send = (message: MeetRealtimeClientMessage) => boolean;

export function createLiveActivitiesStore() {
  let view = EMPTY;
  let send: Send | undefined;
  let manager = false;
  // Only a refusal of the command this person just sent is theirs to see.
  let lastRequest: string | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: LiveActivitiesView) => {
    if (view === next) return;
    view = next;
    for (const listener of listeners) listener();
  };
  return {
    read: () => view,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setManager(value: boolean) {
      manager = value;
      if (!manager && view.host) publish({ ...view, host: null });
    },
    open(channel: Send) {
      send = channel;
      send({ type: 'activity.read' });
    },
    receive(message: MeetRealtimeServerMessage) {
      if (!send) return;
      switch (message.type) {
        case 'activity.snapshot':
          publish({ ...view, snapshot: message.snapshot });
          break;
        case 'activity.mine':
          publish({ ...view, mine: message.mine });
          break;
        case 'activity.host':
          if (manager) publish({ ...view, host: message.host });
          break;
        case 'error':
          if (message.requestId && message.requestId === lastRequest)
            publish({ ...view, error: message.error });
          break;
      }
    },
    send(command: LiveActivityCommand) {
      if (!send) return false;
      lastRequest = crypto.randomUUID();
      if (view.error) publish({ ...view, error: null });
      return send({
        type: 'activity.command',
        command,
        requestId: lastRequest,
      });
    },
    close() {
      send = undefined;
      manager = false;
      lastRequest = undefined;
      publish(EMPTY);
      return listeners.size === 0;
    },
  };
}

const rooms = new Map<string, ReturnType<typeof createLiveActivitiesStore>>();

export function liveActivitiesRoom(meetingId: string) {
  let room = rooms.get(meetingId);
  if (!room) {
    room = createLiveActivitiesStore();
    rooms.set(meetingId, room);
  }
  return room;
}

export function closeLiveActivitiesRoom(meetingId: string) {
  if (rooms.get(meetingId)?.close()) rooms.delete(meetingId);
}

export function useLiveActivities(meetingId: string) {
  const room = liveActivitiesRoom(meetingId);
  const view = useSyncExternalStore(room.subscribe, room.read, () => EMPTY);
  return { ...view, send: room.send };
}

export type LiveActivities = ReturnType<typeof useLiveActivities>;
