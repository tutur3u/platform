import { expect, it } from 'vitest';
import {
  admitOrHold,
  createMeetRoomSnapshot,
  getMeetRealtimeScopesForRole,
  meetRealtimeTokenPayloadSchema,
} from './index';
import { applyChatMessage } from './room-chat';

const token = meetRealtimeTokenPayloadSchema.parse({
  exp: Math.floor(Date.now() / 1000) + 600,
  limits: {},
  meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
  mode: 'call',
  role: 'host',
  roomId: 'workspace:meeting',
  scopes: getMeetRealtimeScopesForRole('host'),
  userId: '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691',
  wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
});
const message = {
  type: 'chat.message' as const,
  body: 'Hello',
  clientMessageId: '73d131ad-d603-4584-ac2b-ec4943558cdb',
  requestId: 'request-1',
};
it('returns the original receipt without broadcasting a retried message', () => {
  const initial = admitOrHold(
    createMeetRoomSnapshot(),
    token,
    new Date().toISOString()
  ).state;
  const first = applyChatMessage(
    initial,
    message,
    token,
    new Date().toISOString()
  );
  const retry = applyChatMessage(
    first.state,
    { ...message, requestId: 'request-2' },
    token,
    new Date().toISOString()
  );
  expect(retry.state.chat).toHaveLength(1);
  expect(retry.reply[0]).toMatchObject({
    id: first.state.chat?.[0]?.id,
    requestId: 'request-2',
  });
  expect(retry.direct).toHaveLength(0);
});
it('marks only new messages as unsaved when history is disabled', () => {
  const initial = admitOrHold(
    createMeetRoomSnapshot(),
    token,
    new Date().toISOString()
  ).state;
  const first = applyChatMessage(
    initial,
    message,
    token,
    new Date().toISOString()
  );
  const next = applyChatMessage(
    {
      ...first.state,
      settings: { shareNotes: false, ...first.state.settings, saveChat: false },
    },
    { ...message, clientMessageId: crypto.randomUUID() },
    token,
    new Date().toISOString()
  );
  expect(next.state.chat?.map((entry) => entry.retained)).toEqual([
    true,
    false,
  ]);
});
