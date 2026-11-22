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
  /**
   * True while the state on screen comes from before a reconnect and the room
   * has not answered this connection's read yet. Nothing can be sent until then.
   */
  stale: boolean;
};

const EMPTY: LiveActivitiesView = {
  snapshot: EMPTY_LIVE_ACTIVITIES_SNAPSHOT,
  mine: EMPTY_LIVE_ACTIVITIES_MINE,
  host: null,
  error: null,
  stale: false,
};

type Send = (message: MeetRealtimeClientMessage) => boolean;

/** Shown when the person acts before the room has confirmed its state. */
export const LIVE_ACTIVITIES_OFFLINE = 'activity_offline';
/** How long a read may go unanswered before it counts as refused. */
export const LIVE_ACTIVITIES_READ_DEADLINE_MS = 10_000;
/** Shown when the room did not answer a read in time. */
export const LIVE_ACTIVITIES_READ_TIMEOUT = 'activity_read_timeout';
/** Waits before a refused read is sent again; after the last one it is manual. */
export const LIVE_ACTIVITIES_READ_RETRY_MS = [2_000, 4_000, 8_000] as const;

export function createLiveActivitiesStore() {
  let view = EMPTY;
  let send: Send | undefined;
  let manager = false;
  // True while a room that was open waits for its socket to come back.
  let suspended = false;
  // The room answered this connection's read: commands may go out.
  let fresh = false;
  let readRequest: string | undefined;
  let readError: string | undefined;
  let readRetries = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  // Only a refusal of the command this person just sent is theirs to see.
  let lastRequest: string | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: LiveActivitiesView) => {
    if (view === next) return;
    view = next;
    for (const listener of listeners) listener();
  };
  const stopReading = () => {
    clearTimeout(retry);
    clearTimeout(deadline);
    retry = undefined;
    deadline = undefined;
    readRequest = undefined;
  };
  const requestRead = () => {
    stopReading();
    if (!send) return;
    const requestId = `activity-read:${crypto.randomUUID()}`;
    if (!send({ type: 'activity.read', requestId })) return;
    readRequest = requestId;
    // A read the room never answers must not leave the panel waiting forever.
    deadline = setTimeout(
      () => failRead(LIVE_ACTIVITIES_READ_TIMEOUT),
      LIVE_ACTIVITIES_READ_DEADLINE_MS
    );
  };
  /** The read was refused or went unanswered: say so, and ask again shortly. */
  const failRead = (error: string) => {
    stopReading();
    readError = error;
    publish({ ...view, error });
    const delay = LIVE_ACTIVITIES_READ_RETRY_MS[readRetries];
    if (delay !== undefined) {
      readRetries += 1;
      retry = setTimeout(requestRead, delay);
    }
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
      suspended = false;
      fresh = false;
      readRetries = 0;
      requestRead();
    },
    receive(message: MeetRealtimeServerMessage) {
      if (!send) return;
      switch (message.type) {
        case 'activity.snapshot':
          if (message.requestId && message.requestId === readRequest) {
            // The answer to this connection's read: the screen is current.
            stopReading();
            fresh = true;
            const waiting =
              view.error === LIVE_ACTIVITIES_OFFLINE ||
              view.error === readError;
            readError = undefined;
            publish({
              ...view,
              snapshot: message.snapshot,
              stale: false,
              error: waiting ? null : view.error,
            });
          } else publish({ ...view, snapshot: message.snapshot });
          break;
        case 'activity.mine':
          publish({ ...view, mine: message.mine });
          break;
        case 'activity.host':
          if (manager) publish({ ...view, host: message.host });
          break;
        case 'error':
          if (message.requestId && message.requestId === readRequest)
            failRead(message.error);
          else if (message.requestId && message.requestId === lastRequest)
            publish({ ...view, error: message.error });
          break;
      }
    },
    send(command: LiveActivityCommand) {
      if (!send || !fresh) {
        // What is on screen is not confirmed yet, so nothing is sent on it.
        // Acting again after the automatic retries ran out asks once more.
        if (send && !readRequest && !retry) requestRead();
        if ((send || suspended) && !view.error)
          publish({ ...view, error: LIVE_ACTIVITIES_OFFLINE });
        return false;
      }
      lastRequest = crypto.randomUUID();
      if (view.error) publish({ ...view, error: null });
      return send({
        type: 'activity.command',
        command,
        requestId: lastRequest,
      });
    },
    /**
     * The socket dropped and is recovering. The last state stays on screen, so
     * a brief reconnect does not blank the panels or the drafts built on them.
     * It is marked stale and takes no commands until the room answers the read
     * sent when the socket opens again.
     */
    suspend() {
      if (!send) return;
      send = undefined;
      suspended = true;
      fresh = false;
      stopReading();
      publish({ ...view, stale: true });
    },
    close() {
      send = undefined;
      suspended = false;
      fresh = false;
      manager = false;
      lastRequest = undefined;
      readError = undefined;
      stopReading();
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

export function suspendLiveActivitiesRoom(meetingId: string) {
  rooms.get(meetingId)?.suspend();
}

export function useLiveActivities(meetingId: string) {
  const room = liveActivitiesRoom(meetingId);
  const view = useSyncExternalStore(room.subscribe, room.read, () => EMPTY);
  return { ...view, send: room.send };
}

export type LiveActivities = ReturnType<typeof useLiveActivities>;
