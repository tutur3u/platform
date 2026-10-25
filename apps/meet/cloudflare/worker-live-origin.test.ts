import { MeetLiveDurableObject } from '@tuturuuu/meet-core/cloudflare/live/session';
import type { SavedSession } from '@tuturuuu/meet-core/cloudflare/live/session-state';
import type { LiveEnvironment } from '@tuturuuu/meet-core/cloudflare/live/storage';
import { EMPTY_LIVE_JOURNAL } from '@tuturuuu/meet-core/features/live-assistant/context';
import type { LiveSessionClaims } from '@tuturuuu/meet-core/features/live-assistant/contracts';
import { signLiveSession } from '@tuturuuu/meet-core/features/live-assistant/token';
import { afterEach, describe, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock('../../../packages/meet-core/src/cloudflare/live/room', () => ({
  liveRoomCommand: boundary.context,
}));
vi.mock('../src/runtime/handler', () => ({ handleMeetRequest: vi.fn() }));
vi.mock('./provider', () => ({ MeetingAIProvider: class {} }));

import worker from './worker';

const secret = 'disposable-origin-regression';
const claims: LiveSessionClaims = {
  audience: 'meet-live',
  app: 'meet',
  sessionId: '11111111-1111-4111-8111-111111111111',
  meetingId: '22222222-2222-4222-8222-222222222222',
  ownerId: '33333333-3333-4333-8333-333333333333',
  billingWorkspaceId: '44444444-4444-4444-8444-444444444444',
  mode: 'room',
  expiresAt: Date.now() + 60_000,
};

async function fixture(app: LiveSessionClaims['app'] = 'meet') {
  const sessionClaims = { ...claims, app };
  const saved: SavedSession = {
    claims: sessionClaims,
    identity: {
      workspaceId: claims.billingWorkspaceId,
      isHost: true,
      displayName: 'Fixture',
    },
    timezone: 'UTC',
    sharedContext: '',
    journal: structuredClone(EMPTY_LIVE_JOURNAL),
    startedAt: Date.now(),
    reviews: [],
  };
  let ready: Promise<unknown> | undefined;
  const state = {
    storage: { get: vi.fn(async () => saved) },
    blockConcurrencyWhile(run: () => Promise<unknown>) {
      ready = run();
    },
  } as unknown as ConstructorParameters<typeof MeetLiveDurableObject>[0];
  const environment = {
    NEXT_PUBLIC_APP_URL: 'https://meet.tuturuuu.com',
    APP_ORIGIN: 'https://tuturuuu.com',
    PARLEY_APP_URL: 'https://parley.tuturuuu.com',
    MEET_REALTIME_TOKEN_SECRET: secret,
  } as LiveEnvironment;
  const object = new MeetLiveDurableObject(state, environment);
  await ready;
  const dispatch = vi.fn((input: string, init: RequestInit) =>
    object.fetch(new Request(input, init))
  );
  const env = {
    ...environment,
    APP_BASE_PATH: '/meet',
    MEET_LIVE: {
      idFromName: (name: string) => name,
      get: () => ({ fetch: dispatch }),
    },
  } as unknown as Parameters<typeof worker.fetch>[1];
  const headers = (origin: string) => ({
    Origin: origin,
    Upgrade: 'websocket',
    'Sec-WebSocket-Protocol': `meet-live, auth.${signLiveSession(sessionClaims, secret)}`,
  });
  return { object, dispatch, env, headers };
}

afterEach(() => vi.resetAllMocks());

describe('Live Worker to Durable Object document-origin admission', () => {
  it.each([
    ['https://meet.tuturuuu.com/live-connect', 'https://meet.tuturuuu.com'],
    ['https://tuturuuu.com/meet/live-connect', 'https://tuturuuu.com'],
  ])(
    'admits %s through both origin checks before room/provider work',
    async (url, origin) => {
      const f = await fixture();
      const reachedContext = new Error('Reached authorized room context');
      boundary.context.mockRejectedValue(reachedContext);
      await expect(
        worker.fetch(
          new Request(url, { headers: f.headers(origin) }),
          f.env,
          {} as ExecutionContext
        )
      ).rejects.toBe(reachedContext);
      expect(f.dispatch).toHaveBeenCalledOnce();
      expect(boundary.context).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ app: 'meet' }),
        expect.anything(),
        { action: 'live.context' }
      );
    }
  );

  it.each([
    'https://untrusted.invalid',
    'https://tuturuuu.com.untrusted.invalid',
    'https://meet.tuturuuu.com',
  ])(
    'rejects the wrong mounted document origin %s before DO dispatch',
    async (origin) => {
      const f = await fixture();
      const response = await worker.fetch(
        new Request('https://tuturuuu.com/meet/live-connect', {
          headers: f.headers(origin),
        }),
        f.env,
        {} as ExecutionContext
      );
      expect(response.status).toBe(403);
      expect(f.dispatch).not.toHaveBeenCalled();
      expect(boundary.context).not.toHaveBeenCalled();
    }
  );

  it('keeps Parley restricted to its existing configured origin', async () => {
    const f = await fixture('parley');
    const response = await f.object.fetch(
      new Request('https://tuturuuu.com/meet/live-connect', {
        headers: f.headers('https://tuturuuu.com'),
      })
    );
    expect(response.status).toBe(403);
    expect(boundary.context).not.toHaveBeenCalled();
  });
});
