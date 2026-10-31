import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  provider: vi.fn(),
  room: vi.fn(),
  cleanup: vi.fn(),
  finalize: vi.fn(),
  begin: vi.fn(),
}));
vi.mock('./room', () => ({ liveRoomCommand: mocks.room }));
vi.mock('./session-cleanup', () => ({
  cleanupEndedLiveSession: mocks.cleanup,
}));
vi.mock('./finalize-billing', () => ({
  finalizeSessionBilling: mocks.finalize,
  settlePublicBillings: vi.fn(),
}));
vi.mock('./billing', () => ({
  beginLiveBilling: mocks.begin,
  settleLiveBilling: vi.fn(),
}));
vi.mock('./registry', () => ({
  LiveRegistryQueue: class {
    fetch = async () => new Response('ok');
  },
}));
vi.mock('./registry-heartbeat', () => ({ maintainLiveRegistry: vi.fn() }));
vi.mock('./usage-report', () => ({ reportLiveUsage: vi.fn() }));
vi.mock('./provider', () => ({
  connectLiveProvider: mocks.provider,
  drainLiveProvider: vi.fn(),
}));

import { signLiveSession } from '../../features/live-assistant/token';
import { MeetLiveDurableObject } from './session';
import type { LiveEnvironment } from './storage';
import { liveWorkspaceAllowed } from './workspace-gate';

const team = '00000000-0000-4000-8000-0000000000aa';
const other = '00000000-0000-4000-8000-0000000000bb';
const owner = '00000000-0000-4000-8000-0000000000c1';
const meetingId = '00000000-0000-4000-8000-0000000000d1';
const sessionId = '00000000-0000-4000-8000-0000000000e1';
const secret = 'test-secret';
const claims = {
  audience: 'meet-live' as const,
  sessionId,
  meetingId,
  ownerId: owner,
  billingWorkspaceId: owner,
  mode: 'personal' as const,
  expiresAt: Date.now() + 600_000,
};
const identity = (workspaceId: string) => ({
  workspaceId,
  isHost: true,
  displayName: 'Host',
});
const post = (path: string, body: unknown) =>
  new Request(`https://live.internal${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

function fixture(allowlist?: string) {
  const values = new Map<string, unknown>();
  const storage = {
    get: vi.fn(async (key: string) => values.get(key)),
    put: vi.fn(async (key: string, value: unknown) => {
      values.set(key, structuredClone(value));
    }),
    setAlarm: vi.fn(async () => {}),
    delete: vi.fn(async () => true),
    list: vi.fn(async () => new Map()),
  };
  const state = {
    storage,
    blockConcurrencyWhile: (run: () => Promise<void>) => run(),
    waitUntil: (promise?: Promise<unknown>) => void promise?.catch?.(() => {}),
  };
  const env = {
    MEET_REALTIME_TOKEN_SECRET: secret,
    NEXT_PUBLIC_APP_URL: 'https://meet.tuturuuu.com',
    MEET_AI_ENABLED_WORKSPACE_IDS: allowlist,
  } as unknown as LiveEnvironment;
  const object = new MeetLiveDurableObject(state as never, env, mocks.provider);
  const events: unknown[] = [];
  Object.assign(object, {
    socket: {
      readyState: WebSocket.OPEN,
      send: (data: string) => events.push(JSON.parse(data)),
      close: () => {},
    },
  });
  return { object, env, storage, events };
}
const initialize = (object: MeetLiveDurableObject, workspaceId: string) =>
  object.fetch(
    post('/initialize', {
      claims,
      identity: identity(workspaceId),
      timezone: 'UTC',
      sharedContext: '{}',
    })
  );
const control = (object: MeetLiveDurableObject, action: string) =>
  object.fetch(post('/control', { ownerId: owner, meetingId, action }));

describe('Live (transcription) workspace gate', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.begin.mockResolvedValue({ costUsd: 0 });
  });

  it('is default deny and exempts only Parley sessions', () => {
    const session = (app?: 'meet' | 'parley') => ({
      claims: { app },
      identity: identity(team),
    });
    expect(liveWorkspaceAllowed(undefined, session())).toBe(false);
    expect(liveWorkspaceAllowed({}, session())).toBe(false);
    expect(liveWorkspaceAllowed({}, undefined)).toBe(false);
    expect(
      liveWorkspaceAllowed({ MEET_AI_ENABLED_WORKSPACE_IDS: team }, session())
    ).toBe(true);
    expect(liveWorkspaceAllowed({}, session('parley'))).toBe(true);
  });

  it('refuses /initialize for an unlisted workspace without persisting or arming an alarm', async () => {
    const { object, storage } = fixture(other);
    const response = await initialize(object, team);
    expect(response.status).toBe(403);
    expect(storage.put).not.toHaveBeenCalled();
    expect(storage.setAlarm).not.toHaveBeenCalled();
    expect(
      (
        await fixture().object.fetch(
          post('/initialize', {
            claims,
            identity: identity(team),
            timezone: 'UTC',
            sharedContext: '{}',
          })
        )
      ).status
    ).toBe(403);
  });

  it('initializes a listed workspace', async () => {
    const { object, storage } = fixture(`${team}, ${team}`);
    expect((await initialize(object, team)).status).toBe(200);
    expect(storage.put).toHaveBeenCalledWith('session', expect.anything());
  });

  it('refuses resume and workspace review after eligibility is withdrawn, but never stop', async () => {
    const { object, env } = fixture(team);
    expect((await initialize(object, team)).status).toBe(200);
    expect((await control(object, 'resume')).status).toBe(200);
    (
      env as { MEET_AI_ENABLED_WORKSPACE_IDS?: string }
    ).MEET_AI_ENABLED_WORKSPACE_IDS = undefined;
    expect((await control(object, 'resume')).status).toBe(403);
    expect(
      (
        await object.fetch(
          post('/workspace-review', {
            action: 'deny',
            ownerId: owner,
            meetingId,
            reviewId: sessionId,
          })
        )
      ).status
    ).toBe(403);
    expect((await control(object, 'stop')).status).toBe(200);
    expect(mocks.finalize).toHaveBeenCalled();
  });

  it('refuses the live-connect upgrade before any room or provider work', async () => {
    const { object } = fixture(team);
    await initialize(object, team);
    (
      object as unknown as { env: LiveEnvironment }
    ).env.MEET_AI_ENABLED_WORKSPACE_IDS = '';
    const token = signLiveSession(claims, secret);
    const response = await object.fetch(
      new Request('https://live.internal/live-connect', {
        headers: {
          Upgrade: 'websocket',
          Origin: 'https://meet.tuturuuu.com',
          'Sec-WebSocket-Protocol': `meet-live, auth.${token}`,
        },
      })
    );
    expect(response.status).toBe(403);
    expect(mocks.room).not.toHaveBeenCalled();
    expect(mocks.provider).not.toHaveBeenCalled();
  });

  it('ends the session instead of reconnecting the provider on connect and on alarm', async () => {
    for (const trigger of ['connect', 'alarm'] as const) {
      const { object, env, events } = fixture(team);
      await initialize(object, team);
      (
        env as { MEET_AI_ENABLED_WORKSPACE_IDS?: string }
      ).MEET_AI_ENABLED_WORKSPACE_IDS = '';
      if (trigger === 'connect')
        await (object as unknown as { connect(): Promise<void> }).connect();
      else await object.alarm();
      expect(mocks.provider).not.toHaveBeenCalled();
      expect(events).toContainEqual(
        expect.objectContaining({
          state: 'error',
          detail: 'workspace_not_enabled',
        })
      );
    }
  });
});
