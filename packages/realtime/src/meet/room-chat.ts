import type {
  MeetRealtimeClientMessage,
  MeetRealtimeServerMessage,
} from './messages';
import { hasMeetRealtimeScope, MEET_REALTIME_SCOPES } from './permissions';
import type { MeetRealtimeTokenPayload } from './primitives';
import type { MeetRoomSnapshot } from './room';
import { denied, outcome } from './room-outcome';

export function retainRoomChat(
  messages: Extract<MeetRealtimeServerMessage, { type: 'chat.message' }>[]
) {
  const retained = new Set(
    messages.filter((message) => message.retained !== false).slice(-500)
  );
  const transient = new Set(
    messages.filter((message) => message.retained === false).slice(-500)
  );
  return messages.filter(
    (message) => retained.has(message) || transient.has(message)
  );
}
export function applyChatMessage(
  state: MeetRoomSnapshot,
  message: Extract<MeetRealtimeClientMessage, { type: 'chat.message' }>,
  token: MeetRealtimeTokenPayload,
  now: string
) {
  const userId = token.userId;
  if (!hasMeetRealtimeScope(token, MEET_REALTIME_SCOPES.chatWrite)) {
    return denied(state, 'permission_denied', message.requestId);
  }
  const previous =
    message.clientMessageId &&
    state.chat?.find(
      (entry) =>
        entry.clientMessageId === message.clientMessageId &&
        (entry.accountId ?? entry.userId) === (token.accountId ?? userId)
    );
  if (previous)
    return outcome(state, {
      reply: [{ ...previous, requestId: message.requestId }],
    });
  const attachments = { ...state.attachments };
  for (const id of message.attachmentIds ?? []) {
    const file = attachments[id];
    if (
      !file ||
      file.discarded ||
      file.ownerAccountId !== (token.accountId ?? userId)
    )
      return denied(state, 'attachment_unavailable', message.requestId);
    attachments[id] = { ...file, published: true };
  }
  const entry: Extract<MeetRealtimeServerMessage, { type: 'chat.message' }> = {
    type: 'chat.message',
    clientMessageId: message.clientMessageId,
    retained: state.settings?.saveChat !== false,
    body: message.body,
    createdAt: now,
    displayName:
      state.presence[userId]?.displayName ??
      (token.displayName || (token.role === 'host' ? 'Host' : 'Participant')),
    avatarUrl: token.avatarUrl,
    accountId: token.accountId,
    id: crypto.randomUUID(),
    userId,
    attachmentIds: message.attachmentIds,
  };
  return outcome(
    {
      ...state,
      attachments,
      chat: retainRoomChat([...(state.chat ?? []), entry]),
    },
    {
      direct: Object.keys(state.presence)
        .filter((id) => id !== userId)
        .map((userId) => ({ userId, message: entry })),
      reply: [{ ...entry, requestId: message.requestId }],
    }
  );
}
