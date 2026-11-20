import {
  admitOrHold,
  createMeetRoomSnapshot,
  MIRA_ROOM_NOTICE_VERSION as version,
  meetRealtimeTokenPayloadSchema,
} from '@tuturuuu/realtime/meet';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  type RoomServiceState,
  roomService,
} from '../../../../../../apps/meet-realtime/src/room-service';

const f = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../call/server/room-service', () => ({ callRoomService: f.call }));
vi.mock('../../call/lib/call-access', () => ({
  MeetCallAccessError: class extends Error {
    constructor(
      public status: number,
      message: string,
      public code?: string
    ) {
      super(message);
    }
  },
}));

import { roomMiraProviderFetch } from './room-mira-provider-fetch';

const alice = '00000000-0000-4000-8000-0000000000a1';
const bob = '00000000-0000-4000-8000-0000000000b2';
const meetingId = '00000000-0000-4000-8000-000000000002';
const mention = 'mention-1';
const model = {
  id: 'google/gemini-3.1-flash-lite',
  providerModelId: 'gemini-3.1-flash-lite',
  inputPricePerToken: 0.25 / 1e6,
  outputPricePerToken: 1.5 / 1e6,
  cacheReadPricePerToken: null,
  tieredPricing: false,
};
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

/** The room as one serialized authority, as in the room Durable Object. */
let room: RoomServiceState;
function apply(id: string, command: unknown) {
  const result = roomService(room, token(id), command);
  room = result.state;
  if ((result.status ?? 200) >= 400)
    throw Object.assign(new Error('room refused'), { status: result.status });
  return result.body;
}
const pause = () =>
  apply(bob, { action: 'mira.room.choice', choice: 'mute', version });
const access = { user: { id: alice } } as never;
const answer = () =>
  new Response(
    JSON.stringify({
      candidates: [{}],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 },
    }),
    { status: 200 }
  );
const url = 'https://generativelanguage.googleapis.com/v1beta/models/x';

beforeEach(() => {
  vi.resetAllMocks();
  f.call.mockImplementation(async (_access, command) => apply(alice, command));
  room = createMeetRoomSnapshot();
  for (const id of [alice, bob]) {
    room = admitOrHold(room, token(id), '2026-11-20T00:00:00Z').state;
    apply(id, { action: 'mira.room.choice', choice: 'continue', version });
  }
  room = {
    ...room,
    chat: [
      {
        type: 'chat.message',
        id: 'bob-1',
        body: 'Something only Bob said',
        userId: bob,
        accountId: bob,
        displayName: 'Bob',
        createdAt: '2026-11-20T00:00:00Z',
      },
      {
        type: 'chat.message',
        id: mention,
        body: '@mira summarize',
        userId: alice,
        accountId: alice,
        displayName: 'Alice',
        createdAt: '2026-11-20T00:00:00Z',
      },
    ],
  };
  apply(alice, { action: 'ai.reserve', messageId: mention });
});

it('admits every request while consent holds and measures their usage', async () => {
  const upstream = vi.fn(async () => answer());
  const provider = roomMiraProviderFetch(access, mention, model, upstream);
  for (let request = 0; request < 3; request++)
    await provider.fetch(url, { method: 'POST' });
  expect(upstream).toHaveBeenCalledTimes(3);
  expect(provider.withdrawn()).toBeUndefined();
  expect(provider.observed()?.usage).toEqual({
    available: true,
    inputTokens: 300,
    outputTokens: 60,
  });
  expect(room.aiRequests?.[mention]?.miraDispatches).toEqual({});
});

it('sends nothing when a source pauses before admission', async () => {
  const upstream = vi.fn(async () => answer());
  const provider = roomMiraProviderFetch(access, mention, model, upstream);
  pause();
  // No admitted send carries Bob, so the Pause is effective at once.
  expect(room.miraRoom?.choices[bob]?.choice).toBe('mute');
  await expect(provider.fetch(url)).rejects.toMatchObject({
    status: 409,
    code: 'MIRA_ROOM_CONSENT_REQUIRED',
  });
  expect(upstream).not.toHaveBeenCalled();
  expect(provider.observed()).toBeNull();
});

it('discards the response when a Pause lands after admission but before transport', async () => {
  const upstream = vi.fn(async () => {
    // The admission RPC has returned; the Pause is serialized after it and
    // stays pending while this admitted send finishes.
    pause();
    expect(room.miraRoom?.pending?.[bob]).toBeDefined();
    expect(room.miraRoom?.choices[bob]?.choice).toBe('continue');
    return answer();
  });
  const provider = roomMiraProviderFetch(access, mention, model, upstream);
  await expect(provider.fetch(url)).rejects.toMatchObject({
    code: 'MIRA_ROOM_CONSENT_REQUIRED',
  });
  // Later steps and search never leave, and the room is not asked again.
  const calls = f.call.mock.calls.length;
  await expect(provider.fetch(url)).rejects.toMatchObject({ status: 409 });
  expect(upstream).toHaveBeenCalledTimes(1);
  expect(f.call.mock.calls.length).toBe(calls);
  // Releasing the last lease makes Bob's Pause effective.
  expect(room.miraRoom?.choices[bob]?.choice).toBe('mute');
  expect(room.miraRoom?.pending?.[bob]).toBeUndefined();
  // The discarded answer's usage still settles.
  expect(provider.observed()?.usage).toMatchObject({
    available: true,
    inputTokens: 100,
  });
});

it('discards the response when a Pause lands while it is in flight', async () => {
  let finish!: (response: Response) => void;
  const upstream = vi.fn(
    () => new Promise<Response>((resolve) => (finish = resolve))
  );
  const provider = roomMiraProviderFetch(access, mention, model, upstream);
  const pending = provider.fetch(url);
  await vi.waitFor(() => expect(upstream).toHaveBeenCalled());
  pause();
  finish(answer());
  await expect(pending).rejects.toMatchObject({
    code: 'MIRA_ROOM_CONSENT_REQUIRED',
  });
  expect(room.aiRequests?.[mention]?.miraDispatches).toEqual({});
  expect(room.miraRoom?.choices[bob]?.choice).toBe('mute');
});

it('counts a request that failed without an answer as unpriced, never zero', async () => {
  const upstream = vi.fn(async () => {
    throw new Error('synthetic network failure');
  });
  const provider = roomMiraProviderFetch(access, mention, model, upstream);
  await expect(provider.fetch(url)).rejects.toThrow('synthetic network');
  expect(provider.withdrawn()).toBeUndefined();
  expect(provider.observed()).toMatchObject({
    costUsd: null,
    usage: { available: false },
  });
});
