/** Shared Live Q&A protocol fixtures: tokens, a room with everyone admitted
 * and helpers that send one message or register one file. */
import { applyLiveQa } from './live-qa';
import { meetRealtimeClientMessageSchema } from './messages';
import { getMeetRealtimeScopesForRole } from './permissions';
import {
  type MeetRealtimeTokenPayload,
  meetRealtimeTokenPayloadSchema,
} from './primitives';
import {
  createMeetPresence,
  createMeetRoomSnapshot,
  type MeetRoomSnapshot,
} from './room';
import type { RoomAttachment } from './room-service';

export const time = Date.parse('2026-11-23T08:00:00Z');
export const now = new Date(time).toISOString();
export const host = meetRealtimeTokenPayloadSchema.parse({
  roomId: 'room-qa',
  wsId: crypto.randomUUID(),
  meetingId: crypto.randomUUID(),
  userId: crypto.randomUUID(),
  accountId: crypto.randomUUID(),
  displayName: 'Hana Host',
  role: 'host',
  scopes: getMeetRealtimeScopesForRole('host'),
  exp: 2_000_000_000,
});
export const member = {
  ...host,
  role: 'speaker' as const,
  scopes: getMeetRealtimeScopesForRole('speaker'),
  userId: crypto.randomUUID(),
  accountId: crypto.randomUUID(),
  displayName: 'Minh Member',
};
const { accountId: _account, ...memberWithoutAccount } = member;
export const guest: MeetRealtimeTokenPayload = {
  ...memberWithoutAccount,
  userId: crypto.randomUUID(),
  guest: true,
  displayName: 'Gia Guest',
};
export const waiting = { ...member, userId: crypto.randomUUID() };

export function room(): MeetRoomSnapshot {
  const state = createMeetRoomSnapshot();
  return {
    ...state,
    presence: Object.fromEntries(
      [host, member, guest].map((token) => [
        token.userId,
        createMeetPresence(token, now),
      ])
    ),
  };
}

export function send(
  state: MeetRoomSnapshot,
  token: MeetRealtimeTokenPayload,
  input: Record<string, unknown>,
  offset = 0
) {
  const message = meetRealtimeClientMessageSchema.parse(input);
  const result = applyLiveQa(state, {
    message,
    token,
    now: new Date(time + offset).toISOString(),
  });
  if (!result) throw new Error('Expected a Q&A outcome');
  return result;
}
export const errorOf = (result: ReturnType<typeof send>) =>
  result.reply.find((message) => message.type === 'error');
export function ask(
  state: MeetRoomSnapshot,
  token: MeetRealtimeTokenPayload = member,
  extra = {}
) {
  const result = send(state, token, { type: 'qa.ask', text: 'Why?', ...extra });
  const id = result.state.liveQa?.questions.at(-1)?.id;
  if (!id) throw new Error('Expected a question');
  return { state: result.state, id, result };
}
export function attach(
  state: MeetRoomSnapshot,
  owner: string,
  extra: Partial<RoomAttachment> = {}
) {
  const id = crypto.randomUUID();
  return {
    id,
    state: {
      ...state,
      attachments: {
        ...state.attachments,
        [id]: {
          id,
          name: 'slide.png',
          size: 10,
          contentType: 'image/png',
          path: `Meet/x/Chat/${id}`,
          storageWsId: crypto.randomUUID(),
          ownerAccountId: owner,
          ...extra,
        },
      },
    },
  };
}
