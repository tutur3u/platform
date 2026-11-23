import type {
  MeetRealtimeClientMessage,
  MeetRealtimeServerMessage,
} from '@tuturuuu/realtime/meet';
import type {
  UpskiiPresentation,
  UpskiiPresentationItem,
} from '@tuturuuu/realtime/meet/room-upskii-presentation';
import { runsRoomActivities } from '../live-activities/activity-manager';

type Send = (message: MeetRealtimeClientMessage) => boolean;

/**
 * The room's presented Upskii item as everyone sees it. `request` tracks this
 * person's own present or stop until the room answers, separately from the
 * presentation itself, so a refusal never hides what the room shows.
 */
export type UpskiiRoomSnapshot = {
  connected: boolean;
  presentation: UpskiiPresentation | null;
  canPresent: boolean;
  request:
    | { kind: 'idle' }
    | { kind: 'pending'; action: 'present' | 'stop' }
    | { kind: 'failed'; error: string };
};

const IDLE = { kind: 'idle' } as const;
const CLOSED: UpskiiRoomSnapshot = {
  connected: false,
  presentation: null,
  canPresent: false,
  request: IDLE,
};

function createUpskiiRoomStore() {
  let snapshot = CLOSED;
  let send: Send | undefined;
  let manager = false;
  let readRequest: string | undefined;
  let pendingRequest: string | undefined;
  const listeners = new Set<() => void>();

  const publish = (next: Partial<UpskiiRoomSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    for (const notify of listeners) notify();
  };

  const readRoom = () => {
    if (!send || readRequest) return;
    const requestId = `upskii-read:${crypto.randomUUID()}`;
    readRequest = requestId;
    if (!send({ type: 'upskii.present.read', requestId }))
      readRequest = undefined;
  };

  const request = (
    action: 'present' | 'stop',
    message: (requestId: string) => MeetRealtimeClientMessage
  ) => {
    if (!send || !manager) return;
    const requestId = `upskii-${action}:${crypto.randomUUID()}`;
    if (!send(message(requestId))) {
      publish({ request: { kind: 'failed', error: 'disconnected' } });
      return;
    }
    pendingRequest = requestId;
    publish({ request: { kind: 'pending', action } });
  };

  return {
    read: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    identify(canManage: boolean) {
      manager = canManage;
    },
    open(channel: Send) {
      send = channel;
      publish({ connected: true, canPresent: manager });
      readRoom();
    },
    receive(message: MeetRealtimeServerMessage) {
      if (!send) return;
      if (message.type === 'upskii.presentation') {
        if (message.requestId === readRequest) readRequest = undefined;
        const answered =
          !!message.requestId && message.requestId === pendingRequest;
        if (answered) pendingRequest = undefined;
        publish({
          presentation: message.presentation,
          ...(answered ? { request: IDLE } : {}),
        });
        return;
      }
      if (message.type === 'error' && message.requestId) {
        if (message.requestId === readRequest) readRequest = undefined;
        if (message.requestId === pendingRequest) {
          pendingRequest = undefined;
          publish({ request: { kind: 'failed', error: message.error } });
        }
      }
    },
    present(item: UpskiiPresentationItem) {
      request('present', (requestId) => ({
        type: 'upskii.present.set',
        item,
        requestId,
      }));
    },
    stop() {
      request('stop', (requestId) => ({
        type: 'upskii.present.clear',
        requestId,
      }));
    },
    dismissError() {
      if (snapshot.request.kind === 'failed') publish({ request: IDLE });
    },
    close() {
      send = undefined;
      manager = false;
      readRequest = undefined;
      pendingRequest = undefined;
      if (snapshot !== CLOSED) {
        snapshot = CLOSED;
        for (const notify of listeners) notify();
      }
      return listeners.size === 0;
    },
  };
}

const stores = new Map<string, ReturnType<typeof createUpskiiRoomStore>>();

export function upskiiRoom(meetingId: string) {
  let store = stores.get(meetingId);
  if (!store) {
    store = createUpskiiRoomStore();
    stores.set(meetingId, store);
  }
  return store;
}

export function closeUpskiiRoom(meetingId: string) {
  if (stores.get(meetingId)?.close()) stores.delete(meetingId);
}

export function handleUpskiiMessage(
  meetingId: string,
  message: MeetRealtimeServerMessage,
  send: Send
) {
  switch (message.type) {
    case 'ready': {
      const room = upskiiRoom(meetingId);
      room.close();
      room.identify(runsRoomActivities(message));
      if (message.admission === 'admitted') room.open(send);
      break;
    }
    case 'admission.result':
      if (message.admitted) upskiiRoom(meetingId).open(send);
      else closeUpskiiRoom(meetingId);
      break;
    case 'room.ended':
      closeUpskiiRoom(meetingId);
      break;
    case 'upskii.presentation':
      upskiiRoom(meetingId).receive(message);
      break;
    case 'error':
      if (message.requestId) upskiiRoom(meetingId).receive(message);
      break;
  }
}
