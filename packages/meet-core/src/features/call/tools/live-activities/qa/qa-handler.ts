import type { MeetRealtimeServerMessage } from '@tuturuuu/realtime/meet';
import {
  createLiveQaClient,
  LIVE_QA_REQUEST_PREFIX,
  type LiveQaCommand,
} from './qa-store';

type RoomChannel = {
  send?: (message: LiveQaCommand) => void;
  listeners: Set<(message: MeetRealtimeServerMessage) => void>;
  client: ReturnType<typeof createLiveQaClient>;
};
const rooms = new Map<string, RoomChannel>();

export function liveQaRoom(meetingId: string) {
  const existing = rooms.get(meetingId);
  if (existing) return existing;
  const listeners = new Set<(message: MeetRealtimeServerMessage) => void>();
  const room: RoomChannel = {
    listeners,
    client: createLiveQaClient({
      send: (message) => room.send?.(message),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    }),
  };
  rooms.set(meetingId, room);
  return room;
}

/** Routes the existing room socket into the Q&A read model. */
export function handleLiveQaMessage(
  meetingId: string,
  message: MeetRealtimeServerMessage,
  send: (command: LiveQaCommand) => void
) {
  const room = liveQaRoom(meetingId);
  room.send = send;
  if (
    (message.type === 'ready' && message.admission === 'admitted') ||
    (message.type === 'admission.result' && message.admitted)
  ) {
    room.client.reset();
    send({ type: 'qa.read' });
  }
  if (
    message.type === 'qa.snapshot' ||
    message.type === 'qa.host' ||
    (message.type === 'error' &&
      message.requestId?.startsWith(LIVE_QA_REQUEST_PREFIX))
  )
    for (const listener of room.listeners) listener(message);
  if (message.type === 'room.ended') rooms.delete(meetingId);
}
