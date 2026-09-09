import { expect, it } from 'vitest';
import {
  admitOrHold,
  createMeetRoomSnapshot,
  meetRealtimeTokenPayloadSchema,
} from './index';
import { type RoomServiceState, roomService } from './room-service';

const account = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691';
const other = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2692';
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
function initial() {
  const state: RoomServiceState = {
    ...admitOrHold(createMeetRoomSnapshot(), token, new Date().toISOString())
      .state,
    chat: [
      {
        type: 'chat.message',
        id: 'message',
        userId: account,
        accountId: account,
        displayName: 'Guest',
        body: '@ttr my tasks',
        createdAt: new Date().toISOString(),
      },
    ],
  };
  state.presence[other] = {
    ...state.presence[account]!,
    userId: other,
    accountId: other,
  };
  return roomService(state, token, {
    action: 'ai.reserve',
    messageId: 'message',
  }).state;
}
const review = {
  text: 'Private task information',
  continuation: 'private-continuation',
  workspaceId: token.wsId,
  workspaceName: 'Personal',
  timezone: 'UTC',
  approvals: [
    { id: 'approval', toolName: 'create_task', input: { name: 'Task' } },
  ],
};
function save(state: RoomServiceState, payload = review) {
  return roomService(state, token, {
    action: 'ai.review.save',
    messageId: 'message',
    review: payload,
    costUsd: 0.01,
  });
}
it('keeps private drafts out of broadcasts and rejects another participant reading or claiming them', () => {
  const result = save(initial());
  expect(result.status).toBeUndefined();
  expect(result.messages).toBeUndefined();
  expect(result.state.chat).toHaveLength(1);
  for (const action of [
    'ai.review.get',
    'ai.review.claim',
    'ai.review.share',
  ]) {
    expect(
      roomService(
        result.state,
        { ...token, userId: other, accountId: other },
        { action, messageId: 'message', revision: 1 }
      ).status
    ).toBe(409);
  }
  expect(
    roomService(
      result.state,
      { ...token, userId: other, accountId: other },
      { action: 'ai.review.list' }
    ).body
  ).toEqual([]);
  expect(
    roomService(result.state, token, { action: 'ai.review.list' }).body
  ).toEqual([{ id: 'message', status: 'ready' }]);
});
it('claims exactly once and rejects sharing before tool approvals are resolved', () => {
  const saved = save(initial()).state;
  expect(
    roomService(saved, token, {
      action: 'ai.review.share',
      messageId: 'message',
      revision: 1,
    }).status
  ).toBe(409);
  const claimed = roomService(saved, token, {
    action: 'ai.review.claim',
    messageId: 'message',
    revision: 1,
  });
  expect(claimed.status).toBeUndefined();
  expect(
    roomService(claimed.state, token, {
      action: 'ai.review.claim',
      messageId: 'message',
      revision: 1,
    }).status
  ).toBe(409);
  const completed = save(claimed.state, {
    ...review,
    continuation: 'completed',
    approvals: [],
  });
  expect(completed.state.aiRequests?.message?.costUsd).toBe(0.02);
  expect(
    save(completed.state, {
      ...review,
      continuation: 'completed',
      approvals: [],
    }).state.aiRequests?.message?.costUsd
  ).toBe(0.02);
  expect(
    roomService(completed.state, token, {
      action: 'ai.review.share',
      messageId: 'message',
      revision: 1,
    }).status
  ).toBe(409);
  const shared = roomService(completed.state, token, {
    action: 'ai.review.share',
    messageId: 'message',
    revision: 2,
  });
  expect(shared.messages).toEqual([
    expect.objectContaining({ assistant: true, body: review.text }),
  ]);
  expect(
    roomService(shared.state, token, {
      action: 'ai.review.share',
      messageId: 'message',
      revision: 2,
    }).status
  ).toBe(409);
});
it('does not expose private continuation in general room state or discard it into chat', () => {
  const state = save(initial()).state;
  expect(
    JSON.stringify(roomService(state, token, { action: 'read' }).body)
  ).not.toContain(review.continuation);
  const discarded = roomService(state, token, {
    action: 'ai.review.discard',
    messageId: 'message',
    revision: 1,
  });
  expect(discarded.messages).toBeUndefined();
  expect(discarded.state.aiRequests?.message?.review?.continuation).toBe('');
});
it('counts people once across multiple devices', () => {
  const state = initial();
  delete state.aiRequests;
  state.presence.device2 = {
    ...state.presence[account]!,
    userId: token.meetingId,
  };
  const result = roomService(state, token, {
    action: 'ai.reserve',
    messageId: 'message',
  });
  expect(result.body).toMatchObject({
    meetingContext: {
      participantCount: 2,
      deviceCount: 3,
      participants: expect.any(Array),
    },
  });
});

it('omits private reviews from host read responses too', () => {
  const state = save(initial()).state;
  const body = roomService(
    state,
    { ...token, role: 'host', accountId: other, userId: other },
    { action: 'read' }
  ).body;
  expect(JSON.stringify(body)).not.toContain('private-continuation');
  expect(JSON.stringify(body)).not.toContain('Private task information');
  expect(JSON.stringify(body)).not.toContain('create_task');
});
it('allows interrupted reviews to be discarded without permitting mutation replay, including after room end', () => {
  const claimed = roomService(save(initial()).state, token, {
    action: 'ai.review.claim',
    messageId: 'message',
    revision: 1,
  }).state;
  const failed = roomService(claimed, token, {
    action: 'ai.finish',
    messageId: 'message',
    costUsd: 0.01,
  }).state;
  expect(
    roomService(failed, token, {
      action: 'ai.review.get',
      messageId: 'message',
    }).body
  ).toMatchObject({ status: 'interrupted' });
  expect(
    roomService(failed, token, {
      action: 'ai.review.claim',
      messageId: 'message',
      revision: 1,
    }).status
  ).toBe(409);
  failed.ended = true;
  const discarded = roomService(failed, token, {
    action: 'ai.review.discard',
    messageId: 'message',
    revision: 1,
  });
  expect(discarded.status).toBeUndefined();
  expect(discarded.state.aiRequests?.message?.review?.continuation).toBe('');
});
it('rejects sharing empty approval-only drafts', () => {
  const state = save(initial(), { ...review, text: '', approvals: [] }).state;
  expect(
    roomService(state, token, {
      action: 'ai.review.share',
      messageId: 'message',
      revision: 1,
    }).status
  ).toBe(409);
});
