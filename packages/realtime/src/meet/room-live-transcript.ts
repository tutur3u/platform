import { MEET_ASSISTANT_USER_ID } from './assistant-mentions';
import { retainRoomChat } from './room-chat';
import type { RoomChatMessage, RoomServiceState } from './room-service';

/** Called only after the room session and service scope have been authorized. */
export function appendRoomLiveTranscript(
  snapshot: RoomServiceState,
  id: string,
  text: string,
  now: number
) {
  if (snapshot.chat?.some((entry) => entry.id === id))
    return { state: snapshot, body: { ok: true } };
  const entry: RoomChatMessage = {
    type: 'chat.message',
    id,
    userId: MEET_ASSISTANT_USER_ID,
    assistant: true,
    displayName: 'Mira Live',
    body: text,
    createdAt: new Date(now).toISOString(),
    retained: snapshot.settings?.saveChat !== false,
  };
  return {
    state: {
      ...snapshot,
      chat: retainRoomChat([...(snapshot.chat ?? []), entry]),
    },
    body: { ok: true },
    messages: [entry],
  };
}
