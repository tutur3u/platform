import { describe, expect, it } from 'vitest';
import {
  admitOrHold,
  createMeetRoomSnapshot,
  meetRealtimeTokenPayloadSchema,
} from './index';
import {
  applyMiraRoomConsent,
  consentedMiraRoomChat,
  fenceMiraRoomRequest,
  MIRA_ROOM_NOTICE_VERSION as version,
  miraRoomFence,
} from './room-mira-consent';
import type { RoomChatMessage, RoomServiceState } from './room-service';

const alice = '00000000-0000-4000-8000-0000000000a1';
const guest = '00000000-0000-4000-8000-0000000000b2';
const meetingId = '00000000-0000-4000-8000-000000000002';
const token = (id: string, role = 'speaker') =>
  meetRealtimeTokenPayloadSchema.parse({
    exp: 2000000000,
    limits: {},
    meetingId,
    mode: 'call',
    role,
    roomId: 'room',
    scopes: ['meet:server'],
    userId: id,
    accountId: id,
    wsId: '00000000-0000-4000-8000-000000000003',
  });
const admit = (state: RoomServiceState, id: string) =>
  admitOrHold(state, token(id), '2026-11-20T00:00:00Z').state;
const choose = (
  state: RoomServiceState,
  id: string,
  choice: 'continue' | 'mute'
) =>
  applyMiraRoomConsent(state, token(id), {
    action: 'mira.room.choice',
    choice,
    version,
  })!.state;
const chat = (id: string, body: string, assistant = false) =>
  ({
    type: 'chat.message',
    id: body,
    body,
    userId: id,
    accountId: id,
    displayName: id,
    createdAt: '2026-11-20T00:00:00Z',
    ...(assistant ? { assistant: true } : {}),
  }) as RoomChatMessage;

describe('room Mira all-participant fence', () => {
  it('waits for every admitted account, guests included', () => {
    let state = admit(createMeetRoomSnapshot(), alice);
    expect(miraRoomFence(state, meetingId)).toEqual({
      ready: false,
      pending: 1,
      admitted: 1,
    });
    state = choose(state, alice, 'continue');
    expect(miraRoomFence(state, meetingId).ready).toBe(true);
    state = admit(state, guest);
    expect(miraRoomFence(state, meetingId)).toEqual({
      ready: false,
      pending: 1,
      admitted: 2,
    });
    state = choose(state, guest, 'continue');
    expect(miraRoomFence(state, meetingId).ready).toBe(true);
    // One Mute pauses room Mira for everyone.
    state = choose(state, guest, 'mute');
    expect(miraRoomFence(state, meetingId).ready).toBe(false);
    expect(miraRoomFence(state, 'other-meeting').ready).toBe(false);
  });

  it('records only the admitted caller and rejects foreign, stale or unscoped writes', () => {
    const state = admit(createMeetRoomSnapshot(), alice);
    expect(
      applyMiraRoomConsent(state, token(guest), {
        action: 'mira.room.choice',
        choice: 'continue',
        version,
      })?.status
    ).toBe(403);
    expect(
      applyMiraRoomConsent(
        state,
        { ...token(alice), scopes: [] },
        { action: 'mira.room.read' }
      )?.status
    ).toBe(403);
    expect(
      applyMiraRoomConsent(state, token(alice), {
        action: 'mira.room.choice',
        choice: 'continue',
        version: 'old',
      })
    ).toBeNull();
    const result = applyMiraRoomConsent(state, token(alice), {
      action: 'mira.room.choice',
      choice: 'continue',
      version,
      accountId: guest,
    })!;
    expect(result.state.miraRoom?.choices[alice]).toMatchObject({
      accountId: alice,
      meetingId,
      choice: 'continue',
      version,
      revision: 1,
    });
    expect(result.state.miraRoom?.choices[guest]).toBeUndefined();
    expect(result.body).toEqual({
      version,
      choice: 'continue',
      fence: { ready: true, pending: 0, admitted: 1 },
    });
  });

  it('denies reservation and approval resume before room content is read', () => {
    let state = admit(admit(createMeetRoomSnapshot(), alice), guest);
    state = choose(state, alice, 'continue');
    let called = 0;
    const next = () => {
      called++;
      return { state, body: { chat: [] } };
    };
    for (const action of ['ai.reserve', 'ai.review.claim'])
      expect(
        fenceMiraRoomRequest(state, token(alice), { action }, next)
      ).toMatchObject({
        status: 409,
        body: { code: 'MIRA_ROOM_CONSENT_REQUIRED' },
      });
    expect(called).toBe(0);
    expect(
      fenceMiraRoomRequest(state, token(alice), { action: 'ai.finish' }, next)
    ).toEqual({ state, body: { chat: [] } });
    expect(called).toBe(1);
  });

  it('sends only consenting authors and Mira replies to the provider', () => {
    const left = '00000000-0000-4000-8000-0000000000c3';
    let state = admit(createMeetRoomSnapshot(), alice);
    state = choose(state, alice, 'continue');
    const history = [
      chat(alice, 'from alice'),
      chat(left, 'from someone who left'),
      chat('mira', 'from mira', true),
    ];
    expect(
      consentedMiraRoomChat(state, meetingId, history).map((m) => m.body)
    ).toEqual(['from alice', 'from mira']);
    const reserved = fenceMiraRoomRequest(
      state,
      token(alice),
      { action: 'ai.reserve' },
      () => ({ state, body: { chat: history, prompt: '@mira hi' } })
    );
    expect(
      (reserved.body as { chat: RoomChatMessage[] }).chat.map((m) => m.body)
    ).toEqual(['from alice', 'from mira']);
  });
});
