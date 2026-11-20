import { beforeEach, describe, expect, it } from 'vitest';
import {
  admitOrHold,
  createMeetRoomSnapshot,
  meetRealtimeTokenPayloadSchema,
} from './index';
import {
  applyMiraRoomConsent,
  fenceMiraRoomRequest,
  MIRA_ROOM_NOTICE_VERSION as version,
} from './room-mira-consent';
import {
  type RoomChatMessage,
  roomService,
  type RoomServiceState,
} from './room-service';

const alice = '00000000-0000-4000-8000-0000000000a1';
const bob = '00000000-0000-4000-8000-0000000000b2';
const meetingId = '00000000-0000-4000-8000-000000000002';
const mention = 'mention-1';
const token = (id: string) =>
  meetRealtimeTokenPayloadSchema.parse({
    exp: 2000000000,
    limits: {},
    meetingId,
    mode: 'call',
    role: 'speaker',
    roomId: 'room',
    scopes: ['meet:server'],
    userId: id,
    accountId: id,
    wsId: '00000000-0000-4000-8000-000000000003',
  });
/** The meet-realtime wrapper order: consent commands, then the fence. */
const service = (state: RoomServiceState, id: string, input: unknown) =>
  applyMiraRoomConsent(state, token(id), input) ??
  fenceMiraRoomRequest(state, token(id), input, () =>
    roomService(state, token(id), input)
  );
const choose = (state: RoomServiceState, id: string, choice: string) =>
  service(state, id, { action: 'mira.room.choice', choice, version }).state;
const message = (id: string, accountId: string, body: string) =>
  ({
    type: 'chat.message',
    id,
    body,
    userId: accountId,
    accountId,
    displayName: accountId,
    createdAt: '2026-11-20T00:00:00Z',
  }) as RoomChatMessage;
const leave = (state: RoomServiceState, id: string) => ({
  ...state,
  presence: Object.fromEntries(
    Object.entries(state.presence).filter(
      ([, person]) => (person.accountId ?? person.userId) !== id
    )
  ),
});
const review = {
  text: 'Private answer from room context',
  continuation: JSON.stringify({ messages: [], context: { chat: [] } }),
  approvals: [{ id: 'approval', toolName: 'create_task', input: {} }],
  workspaceId: '00000000-0000-4000-8000-000000000003',
  workspaceName: 'Synthetic',
  timezone: 'UTC',
};
const blocked = { status: 409, body: { code: 'MIRA_ROOM_CONSENT_REQUIRED' } };

let reserved: RoomServiceState;
beforeEach(() => {
  let state = admitOrHold(
    createMeetRoomSnapshot(),
    token(alice),
    '2026-11-20T00:00:00Z'
  ).state;
  state = admitOrHold(state, token(bob), '2026-11-20T00:00:00Z').state;
  state = choose(choose(state, alice, 'continue'), bob, 'continue');
  state = {
    ...state,
    chat: [
      message('bob-1', bob, 'Something only Bob said'),
      message(mention, alice, '@mira summarize this'),
    ],
  };
  const result = service(state, alice, {
    action: 'ai.reserve',
    messageId: mention,
  });
  expect(result.status ?? 200).toBe(200);
  reserved = result.state;
});

describe('room Mira source binding', () => {
  it('records every source account with its exact consent revision', () => {
    expect(reserved.aiRequests?.[mention]?.miraRoomSources).toEqual({
      [alice]: 1,
      [bob]: 1,
    });
    expect(
      service(reserved, alice, {
        action: 'mira.room.verify',
        messageId: mention,
      }).body
    ).toEqual({ ok: true });
  });

  it('never dispatches or publishes after a source author pauses and then leaves', () => {
    const state = leave(choose(reserved, bob, 'mute'), bob);
    for (const input of [
      { action: 'mira.room.verify', messageId: mention },
      { action: 'ai.finish', messageId: mention, body: 'Answer', costUsd: 0 },
      {
        action: 'ai.review.save',
        messageId: mention,
        review,
        costUsd: 0,
      },
    ])
      expect(service(state, alice, input)).toMatchObject(blocked);
    // Cost-only settlement still finalizes the request without posting.
    const settled = service(state, alice, {
      action: 'ai.finish',
      messageId: mention,
      costUsd: 0.001,
    });
    expect(settled.status ?? 200).toBe(200);
    expect(settled.state.chat?.some((m) => m.assistant)).toBe(false);
  });

  it('treats a rejoin with a new Continue revision as stale for the old request', () => {
    let state = leave(choose(reserved, bob, 'mute'), bob);
    state = admitOrHold(state, token(bob), '2026-11-20T00:01:00Z').state;
    state = choose(state, bob, 'continue');
    expect(state.miraRoom?.choices[bob]?.revision).toBe(3);
    expect(
      service(state, alice, { action: 'mira.room.verify', messageId: mention })
    ).toMatchObject(blocked);
    expect(
      service(state, alice, {
        action: 'ai.finish',
        messageId: mention,
        body: 'Answer',
        costUsd: 0,
      })
    ).toMatchObject(blocked);
  });

  it('refuses to resume or share a saved review once its sources changed', () => {
    const saved = service(reserved, alice, {
      action: 'ai.review.save',
      messageId: mention,
      review,
      costUsd: 0,
    });
    expect(saved.status ?? 200).toBe(200);
    const revision = saved.state.aiRequests?.[mention]?.review?.revision;
    // Unchanged sources: resume reaches the base claim.
    expect(
      service(saved.state, alice, {
        action: 'ai.review.claim',
        messageId: mention,
        revision,
      }).status ?? 200
    ).toBe(200);
    const stale = leave(choose(saved.state, bob, 'mute'), bob);
    for (const action of ['ai.review.claim', 'ai.review.share'])
      expect(
        service(stale, alice, { action, messageId: mention, revision })
      ).toMatchObject(blocked);
    // Discard always works so the requester can clear private content.
    const discarded = service(stale, alice, {
      action: 'ai.review.discard',
      messageId: mention,
      revision,
    });
    expect(discarded.status ?? 200).toBe(200);
  });

  it('treats a request reserved without recorded sources as stale', () => {
    const legacy = {
      ...reserved,
      aiRequests: {
        ...reserved.aiRequests,
        [mention]: {
          ...reserved.aiRequests![mention]!,
          miraRoomSources: undefined,
        },
      },
    };
    expect(
      service(legacy, alice, { action: 'mira.room.verify', messageId: mention })
    ).toMatchObject(blocked);
    expect(
      service(legacy, bob, { action: 'mira.room.verify', messageId: mention })
    ).toMatchObject(blocked);
  });
});
