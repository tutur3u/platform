import { describe, expect, it } from 'vitest';
import {
  admitOrHold,
  applyMeetRoomCommand,
  createMeetRoomSnapshot,
  meetRealtimeTokenPayloadSchema,
} from './index';
import { type RoomServiceState, roomService } from './room-service';

const account = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691';
const token = meetRealtimeTokenPayloadSchema.parse({
  exp: 2000000000,
  limits: {},
  meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
  mode: 'call',
  role: 'speaker',
  roomId: 'room',
  scopes: ['meet:server'],
  userId: account,
  accountId: account,
  wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
});
const now = '2026-09-09T00:00:00Z';
const initial = (): RoomServiceState => ({
  ...admitOrHold(createMeetRoomSnapshot(), token, now).state,
  chat: [
    {
      type: 'chat.message',
      id: 'message',
      displayName: 'Guest',
      userId: account,
      accountId: account,
      body: '@Tuturuuu summarize our discussion',
      createdAt: now,
    },
  ],
});

describe('trusted room services', () => {
  it('rejects browser tokens even when they belong to the host', () => {
    expect(
      roomService(
        initial(),
        { ...token, role: 'host', scopes: [] },
        { action: 'costs' }
      ).status
    ).toBe(403);
  });
  it('keeps costs and recording access admin-only by default', () => {
    expect(roomService(initial(), token, { action: 'costs' }).status).toBe(403);
    expect(
      roomService(initial(), token, {
        action: 'recording.read',
        sessionId: account,
      }).status
    ).toBe(403);
    expect(
      roomService(initial(), { ...token, role: 'host' }, { action: 'costs' })
        .status
    ).toBeUndefined();
  });
  it('deduplicates assistant requests and rejects another account’s mention', () => {
    const reserved = roomService(initial(), token, {
      action: 'ai.reserve',
      messageId: 'message',
    });
    expect(reserved.status).toBeUndefined();
    expect(
      roomService(reserved.state, token, {
        action: 'ai.reserve',
        messageId: 'message',
      }).status
    ).toBe(409);
    const other = { ...token, accountId: 'other', userId: 'other' };
    const otherState = initial();
    otherState.presence[other.userId] = {
      ...otherState.presence[token.userId]!,
      userId: other.userId,
      accountId: other.accountId,
    };
    expect(
      roomService(otherState, other, {
        action: 'ai.reserve',
        messageId: 'message',
      }).status
    ).toBe(404);
  });
  it('preserves incurred AI costs when the meeting ends during generation', () => {
    const reserved = roomService(initial(), token, {
      action: 'ai.reserve',
      messageId: 'message',
    });
    const ended = { ...reserved.state, presence: {}, ended: true };
    const result = roomService(ended, token, {
      action: 'ai.finish',
      messageId: 'message',
      body: 'Summary',
      costUsd: 0.001,
    });
    expect(result.status).toBeUndefined();
    expect(result.state.aiRequests?.message?.costUsd).toBe(0.001);
    expect(result.messages?.[0]).toMatchObject({
      assistant: true,
      displayName: 'Mira',
    });
    expect(
      roomService(result.state, token, {
        action: 'ai.finish',
        messageId: 'message',
        body: 'Duplicate',
      }).state
    ).toBe(result.state);
  });
});

it('shares recording metadata after a call only when explicitly enabled', () => {
  const state: RoomServiceState = {
    ...initial(),
    presence: {},
    ended: true,
    approved: { [account]: { userId: account, displayName: 'Guest' } },
    recordings: [
      {
        sessionId: account,
        ownerAccountId: account,
        ownerDeviceId: account,
        startedAt: now,
        status: 'ready',
        path: 'private-storage-path',
        storageWsId: account,
      },
    ],
  };
  expect(roomService(state, token, { action: 'recording.list' }).status).toBe(
    403
  );
  state.settings = { shareNotes: false, shareRecordings: true };
  const result = roomService(state, token, { action: 'recording.list' });
  expect(result.status).toBeUndefined();
  expect(JSON.stringify(result.body)).not.toContain('private-storage-path');
  expect(roomService(state, token, { action: 'read' }).status).toBe(403);
});

it('permits new questions after an abandoned request while retaining late cost accounting', () => {
  const state = initial();
  state.aiRequests = {
    abandoned: {
      userId: account,
      status: 'pending',
      startedAt: Date.now() - 180000,
    },
  };
  const next = roomService(state, token, {
    action: 'ai.reserve',
    messageId: 'message',
  });
  expect(next.status).toBeUndefined();
  const late = roomService(next.state, token, {
    action: 'ai.finish',
    messageId: 'abandoned',
    costUsd: 0.001,
  });
  expect(late.status).toBeUndefined();
  expect(late.state.aiRequests?.abandoned?.costUsd).toBe(0.001);
});

it('keeps legacy pending requests active until Worker migration timestamps them', () => {
  const state = initial();
  state.aiRequests = { legacy: { userId: account, status: 'pending' } };
  expect(
    roomService(state, token, { action: 'ai.reserve', messageId: 'message' })
      .status
  ).toBe(409);
});

it('discards only the uploader’s unsent files and preserves sent files after an acknowledgement is lost', () => {
  const file = {
    id: account,
    name: 'file.txt',
    size: 10,
    contentType: 'text/plain',
    path: 'Meet/chat/file.txt',
    storageWsId: token.wsId,
  };
  const state = roomService(initial(), token, {
    action: 'attach',
    attachment: file,
  }).state;
  const other = { ...token, accountId: token.meetingId };
  expect(
    roomService(state, other, { action: 'attachment.discard', id: account })
      .status
  ).toBe(404);
  const sent = applyMeetRoomCommand(state, {
    token: { ...token, scopes: [...token.scopes, 'chat:write'] },
    now,
    message: { type: 'chat.message', body: 'File', attachmentIds: [account] },
  });
  expect(sent.state.attachments?.[account]?.published).toBe(true);
  expect(
    roomService(sent.state, token, {
      action: 'attachment.discard',
      id: account,
    }).status
  ).toBe(409);
  const discarded = roomService(state, token, {
    action: 'attachment.discard',
    id: account,
  });
  expect(discarded.status).toBeUndefined();
  expect(
    roomService(discarded.state, token, { action: 'attachment', id: account })
      .status
  ).toBe(404);
});

it('acknowledges a repeated completed assistant settlement without duplicating messages or cost', () => {
  const reserved = roomService(initial(), token, {
    action: 'ai.reserve',
    messageId: 'message',
  }).state;
  const command = {
    action: 'ai.finish',
    messageId: 'message',
    body: 'Answer',
    costUsd: 0.001,
  };
  const done = roomService(reserved, token, command);
  const retried = roomService(done.state, token, command);
  expect(retried.status).toBeUndefined();
  expect(retried.state).toBe(done.state);
  expect(retried.messages).toBeUndefined();
});
it('reclaims a discarded attachment slot only after storage deletion succeeds', () => {
  const file = {
    id: account,
    name: 'file.txt',
    size: 10,
    contentType: 'text/plain',
    path: 'Meet/file.txt',
    storageWsId: token.wsId,
  };
  const state = roomService(initial(), token, {
    action: 'attach',
    attachment: file,
  }).state;
  expect(
    roomService(state, token, { action: 'attachment.deleted', id: account })
      .status
  ).toBe(403);
  const discarded = roomService(state, token, {
    action: 'attachment.discard',
    id: account,
  }).state;
  const deleted = roomService(discarded, token, {
    action: 'attachment.deleted',
    id: account,
  });
  expect(deleted.state.attachments?.[account]).toBeUndefined();
  expect(
    roomService(deleted.state, token, {
      action: 'attachment.deleted',
      id: account,
    }).status
  ).toBeUndefined();
});
