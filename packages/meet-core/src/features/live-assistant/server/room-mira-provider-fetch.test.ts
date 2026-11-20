import {
  admitOrHold,
  createMeetRoomSnapshot,
  MIRA_ROOM_NOTICE_VERSION as version,
  meetRealtimeTokenPayloadSchema,
} from '@tuturuuu/realtime/meet';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
/** Overrides for the lease lifetime and admission latency the room reports. */
let lifetime: number | undefined;
let admissionDelayMs = 0;
/** Advances a stubbed clock during admission when set (deterministic runs). */
let admissionAdvance: (() => void) | undefined;
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
  lifetime = undefined;
  admissionDelayMs = 0;
  admissionAdvance = undefined;
  vi.restoreAllMocks();
  f.call.mockImplementation(async (_access, command) => {
    const body = apply(alice, command) as Record<string, unknown>;
    if (command.action !== 'mira.room.dispatch') return body;
    await new Promise((resolve) => setTimeout(resolve, admissionDelayMs));
    admissionAdvance?.();
    return lifetime === undefined ? body : { ...body, expiresInMs: lifetime };
  });
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

const leases = () => room.aiRequests?.[mention]?.miraDispatches;
const expired = { status: 503, code: 'MIRA_ROOM_LEASE_EXPIRED' };

it('sends nothing when the lease expires before transport', async () => {
  const upstream = vi.fn(async () => answer());
  // The room reports no remaining lifetime.
  lifetime = 0;
  let provider = roomMiraProviderFetch(access, mention, model, upstream);
  await expect(provider.fetch(url)).rejects.toMatchObject(expired);
  // The lease ran out while the admission call was returning.
  lifetime = 10;
  admissionDelayMs = 30;
  provider = roomMiraProviderFetch(access, mention, model, upstream);
  await expect(provider.fetch(url)).rejects.toMatchObject(expired);
  await expect(provider.fetch(url)).rejects.toMatchObject(expired);
  expect(upstream).not.toHaveBeenCalled();
  expect(provider.observed()).toBeNull();
  expect(leases()).toEqual({});
});

it('sends nothing when the caller signal is already aborted', async () => {
  const upstream = vi.fn(async () => answer());
  const provider = roomMiraProviderFetch(access, mention, model, upstream);
  const controller = new AbortController();
  controller.abort(new Error('synthetic caller abort'));
  await expect(
    provider.fetch(url, { signal: controller.signal })
  ).rejects.toThrow('synthetic caller abort');
  expect(upstream).not.toHaveBeenCalled();
  expect(leases()).toEqual({});
});

it('aborts transport at the lease deadline and counts it as unpriced', async () => {
  lifetime = 40;
  const upstream = vi.fn(
    (_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal?.reason)
        )
      )
  );
  const provider = roomMiraProviderFetch(access, mention, model, upstream);
  await expect(provider.fetch(url)).rejects.toMatchObject(expired);
  expect(provider.observed()).toMatchObject({
    costUsd: null,
    usage: { available: false },
  });
  expect(leases()).toEqual({});
  // Later steps and search are refused without another send.
  await expect(provider.fetch(url)).rejects.toMatchObject(expired);
  expect(upstream).toHaveBeenCalledTimes(1);
});

it('stops waiting on usage observation at the deadline and settles a pending Pause', async () => {
  lifetime = 40;
  const upstream = vi.fn(async () => {
    pause();
    // A successful answer whose body never finishes arriving.
    return new Response(new ReadableStream({ start() {} }), { status: 200 });
  });
  const provider = roomMiraProviderFetch(access, mention, model, upstream);
  await expect(provider.fetch(url)).rejects.toMatchObject(expired);
  expect(provider.observed()).toMatchObject({
    costUsd: null,
    usage: { available: false },
  });
  expect(leases()).toEqual({});
  expect(room.miraRoom?.choices[bob]?.choice).toBe('mute');
  expect(room.miraRoom?.pending?.[bob]).toBeUndefined();
});

it('never sends a cancelled Request object', async () => {
  const upstream = vi.fn(async () => answer());
  const provider = roomMiraProviderFetch(access, mention, model, upstream);
  const controller = new AbortController();
  controller.abort(new Error('synthetic request cancel'));
  const request = new Request(url, {
    method: 'POST',
    signal: controller.signal,
  });
  await expect(provider.fetch(request)).rejects.toThrow(
    'synthetic request cancel'
  );
  expect(upstream).not.toHaveBeenCalled();
  expect(provider.observed()).toBeNull();
  expect(leases()).toEqual({});
});

it('aborts transport when a Request object is cancelled in flight', async () => {
  const controller = new AbortController();
  const upstream = vi.fn(
    (_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal?.reason)
        );
        controller.abort(new Error('synthetic cancel in flight'));
      })
  );
  const provider = roomMiraProviderFetch(access, mention, model, upstream);
  await expect(
    provider.fetch(new Request(url, { signal: controller.signal }))
  ).rejects.toThrow('synthetic cancel in flight');
  // Sent, then interrupted: unpriced, and the lease is released.
  expect(provider.observed()).toMatchObject({ costUsd: null });
  expect(leases()).toEqual({});
});

describe('deterministic lease deadline boundary', () => {
  let clock: number;
  beforeEach(() => {
    clock = 1_800_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
    lifetime = 100;
  });

  it('refuses transport when no lease time remains', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    admissionAdvance = () => {
      clock += 100;
    };
    const upstream = vi.fn(async () => answer());
    const provider = roomMiraProviderFetch(access, mention, model, upstream);
    await expect(provider.fetch(url)).rejects.toMatchObject(expired);
    expect(upstream).not.toHaveBeenCalled();
    expect(timeout).not.toHaveBeenCalled();
    expect(leases()).toEqual({});
  });

  it('sends with exactly the one remaining millisecond as its timeout', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    admissionAdvance = () => {
      clock += 99;
    };
    const upstream = vi.fn(async () => answer());
    const provider = roomMiraProviderFetch(access, mention, model, upstream);
    await provider.fetch(url);
    expect(timeout).toHaveBeenCalledTimes(1);
    expect(timeout).toHaveBeenCalledWith(1);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(leases()).toEqual({});
  });

  it('refuses transport when the deadline passes while the timeout is built', async () => {
    const real = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      clock += 2; // One millisecond remained; construction took two.
      return real(ms);
    });
    admissionAdvance = () => {
      clock += 99;
    };
    const upstream = vi.fn(async () => answer());
    const provider = roomMiraProviderFetch(access, mention, model, upstream);
    await expect(provider.fetch(url)).rejects.toMatchObject(expired);
    expect(upstream).not.toHaveBeenCalled();
    expect(provider.sent()).toBe(false);
    expect(provider.observed()).toBeNull();
    expect(leases()).toEqual({});
  });

  it('refuses transport when the deadline passes while the combined signal is built', async () => {
    const real = AbortSignal.any.bind(AbortSignal);
    vi.spyOn(AbortSignal, 'any').mockImplementation((signals) => {
      clock += 50;
      return real(signals);
    });
    admissionAdvance = () => {
      clock += 60;
    };
    const upstream = vi.fn(async () => answer());
    const provider = roomMiraProviderFetch(access, mention, model, upstream);
    await expect(
      provider.fetch(url, { signal: new AbortController().signal })
    ).rejects.toMatchObject(expired);
    expect(upstream).not.toHaveBeenCalled();
    expect(provider.observed()).toBeNull();
    expect(leases()).toEqual({});
  });

  it('refuses transport when the caller cancels while the signal is built', async () => {
    const controller = new AbortController();
    const real = AbortSignal.any.bind(AbortSignal);
    vi.spyOn(AbortSignal, 'any').mockImplementation((signals) => {
      controller.abort(new Error('synthetic cancel during setup'));
      return real(signals);
    });
    const upstream = vi.fn(async () => answer());
    const provider = roomMiraProviderFetch(access, mention, model, upstream);
    await expect(
      provider.fetch(url, { signal: controller.signal })
    ).rejects.toThrow('synthetic cancel during setup');
    expect(upstream).not.toHaveBeenCalled();
    expect(provider.observed()).toBeNull();
    // A caller cancel is not a lease expiry: later requests may proceed.
    expect(provider.withdrawn()).toBeUndefined();
    expect(leases()).toEqual({});
  });

  it('releases the lease when the transport timeout cannot be created', async () => {
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
      throw new Error('synthetic timer failure');
    });
    const upstream = vi.fn(async () => answer());
    const provider = roomMiraProviderFetch(access, mention, model, upstream);
    await expect(provider.fetch(url)).rejects.toThrow(
      'synthetic timer failure'
    );
    expect(upstream).not.toHaveBeenCalled();
    expect(provider.observed()).toBeNull();
    expect(leases()).toEqual({});
  });
});
