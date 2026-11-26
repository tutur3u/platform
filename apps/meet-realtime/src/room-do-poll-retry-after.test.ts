import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  getMeetRealtimeScopesForRole,
  meetRealtimeTokenPayloadSchema,
} from '../../../packages/realtime/src/meet';
import { MEET_POLL_VOTE_LIMIT } from '../../../packages/realtime/src/meet/room-polls';
import { MeetRoomDurableObject, type MeetRoomEnv } from './room-do';

globalThis.WebSocketRequestResponsePair =
  class {} as typeof WebSocketRequestResponsePair;

const HOST_ID = '00000000-0000-4000-8000-000000000001';
const GUEST_ID = '00000000-0000-4000-8000-000000000002';

function makeToken(role: 'host' | 'speaker', extra: Record<string, unknown>) {
  return meetRealtimeTokenPayloadSchema.parse({
    userId: role === 'host' ? HOST_ID : GUEST_ID,
    accountId: role === 'host' ? HOST_ID : GUEST_ID,
    role,
    admission: role === 'host' ? 'open' : 'lobby',
    mode: 'call',
    meetingApp: 'meet',
    exp: Math.floor(Date.now() / 1000) + 600,
    meetingId: '11111111-1111-4111-8111-111111111111',
    wsId: '22222222-2222-4222-8222-222222222222',
    roomId: 'ws:poll-retry-after',
    scopes: [...getMeetRealtimeScopesForRole(role), 'meet:server'],
    ...extra,
  });
}

test('room-service emits Retry-After header when poll.vote hits 429', async () => {
  const values = new Map<string, unknown>();
  const state = {
    blockConcurrencyWhile: (run: () => Promise<void>) => run(),
    setWebSocketAutoResponse: () => undefined,
    getWebSockets: () => [],
    acceptWebSocket: () => undefined,
    waitUntil: () => undefined,
    storage: {
      get: async (key: string) => values.get(key),
      put: async (key: string, value: unknown) => {
        values.set(key, structuredClone(value));
      },
      getAlarm: async () => null,
      setAlarm: async () => undefined,
    },
  } as unknown as DurableObjectState;
  const room = new MeetRoomDurableObject(state, {} as MeetRoomEnv);
  const host = makeToken('host', {});
  const guest = makeToken('speaker', { guest: true });
  values.set('snapshot', {
    ended: false,
    presence: {
      [GUEST_ID]: {
        guest: true,
        accountId: GUEST_ID,
        userId: GUEST_ID,
        displayName: 'Guest One',
        joinedAt: '2026-11-27T00:00:00.000Z',
        lastSeenAt: '2026-11-27T00:00:00.000Z',
        media: {
          audioEnabled: false,
          videoEnabled: false,
          screenEnabled: false,
        },
        role: 'speaker',
      },
    },
    waiting: {},
    approved: { [GUEST_ID]: { userId: GUEST_ID, displayName: 'Guest One' } },
    tracks: {},
    stage: {
      activeSpeakerIds: [],
      hostUserId: HOST_ID,
      locked: false,
      raisedHandUserIds: [],
    },
    recording: { state: 'idle' },
  });

  const post = (token: ReturnType<typeof makeToken>, body: unknown) =>
    room.fetch(
      new Request('https://meet-rt.test/room-service', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-meet-token': JSON.stringify(token),
        },
        body: JSON.stringify(body),
      })
    );

  const created = await post(host, {
    action: 'poll.create',
    definition: {
      type: 'single_choice',
      question: 'Pick one',
      options: ['A', 'B'],
    },
    anonymous: true,
  });
  assert.equal(created.status, 200);
  const { pollId } = (await created.json()) as { pollId: string };
  assert.equal(
    (await post(host, { action: 'poll.launch', pollId })).status,
    200
  );
  const listed = (await (
    await post(guest, { action: 'poll.list' })
  ).json()) as {
    polls: Array<{ options: Array<{ id: string }> }>;
  };
  const optionIds = listed.polls[0]!.options.map(({ id }) => id);

  for (let index = 0; index < MEET_POLL_VOTE_LIMIT; index++) {
    const res = await post(guest, {
      action: 'poll.vote',
      pollId,
      response: { type: 'single_choice', optionId: optionIds[index % 2] },
    });
    assert.equal(res.status, 200);
  }

  const limited = await post(guest, {
    action: 'poll.vote',
    pollId,
    response: { type: 'single_choice', optionId: optionIds[0] },
  });
  assert.equal(limited.status, 429);
  const retryAfter = Number(limited.headers.get('Retry-After'));
  assert.ok(
    Number.isInteger(retryAfter) && retryAfter >= 1 && retryAfter <= 60,
    `expected Retry-After in 1..60, got ${limited.headers.get('Retry-After')}`
  );
});
