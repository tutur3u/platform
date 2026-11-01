import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cloudflare: vi.fn(),
  fetch: vi.fn(),
  callRoom: vi.fn(),
  actor: { id: 'host', isHost: true },
}));
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: mocks.cloudflare,
}));
vi.mock('@tuturuuu/meet-core/features/call/lib/call-access', () => ({
  MeetCallAccessError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));
vi.mock('@tuturuuu/meet-core/features/call/server/room-service', () => ({
  callRoomService: mocks.callRoom,
  personalWorkspace: async () => 'personal-ws',
  roomRoute: async (
    _request: Request,
    _id: string,
    work: (access: unknown) => Promise<unknown>
  ) => {
    try {
      return Response.json(
        await work({
          user: { id: mocks.actor.id },
          isHost: mocks.actor.isHost,
          displayName: 'Host',
          meeting: { ws_id: 'meeting-ws', name: 'Meeting' },
        })
      );
    } catch (error) {
      return Response.json(
        { error: (error as Error).message },
        { status: (error as { status?: number }).status ?? 500 }
      );
    }
  },
}));
vi.mock('@tuturuuu/meet-core/features/live-assistant/token', () => ({
  signLiveSession: () => 'signed',
}));
vi.mock('@tuturuuu/meet-core/features/live-assistant/workspace-tools', () => ({
  liveWorkspaceCatalog: async () => [],
  liveWorkspaceTools: async () => ({}),
}));
vi.mock('@tuturuuu/meet-core/parley/repository', () => ({
  getScenarioPrompt: async () => undefined,
}));

import { POST as live } from './route';

const sessionId = '00000000-0000-4000-8000-0000000000e1';
const call = (handler: typeof live, body: unknown) =>
  handler(
    new Request('https://meet.tuturuuu.com/api/meet-live/x', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ meetingId: 'meeting' }) }
  );
const bind = (allowlist?: string) =>
  mocks.cloudflare.mockResolvedValue({
    env: {
      MEET_LIVE: {
        idFromName: (name: string) => name,
        get: () => ({ fetch: mocks.fetch }),
      },
      MEET_REALTIME_TOKEN_SECRET: 'secret',
      GOOGLE_GENERATIVE_AI_API_KEY: 'key',
      MEET_AI_ENABLED_WORKSPACE_IDS: allowlist,
    },
  });

describe('meet-live meeting workspace billing', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.fetch.mockImplementation(async () => Response.json({ ok: true }));
    mocks.callRoom.mockResolvedValue({});
    bind('meeting-ws');
  });

  it.each(['host', 'member', 'guest'])(
    'charges the meeting workspace for %s despite a supplied tool workspace',
    async (actor) => {
      mocks.actor.id = actor;
      mocks.actor.isHost = actor === 'host';
      const response = await call(live, {
        action: 'start',
        mode: 'personal',
        timezone: 'UTC',
        workspaceId: sessionId,
      });
      expect(response.status).toBe(200);
      const initialize = mocks.fetch.mock.calls.find(
        ([url]) => url === 'https://live.internal/initialize'
      );
      expect(initialize).toBeDefined();
      const body = JSON.parse(initialize?.[1].body);
      expect(body.claims.billingWorkspaceId).toBe('meeting-ws');
      expect(body.claims.ownerId).toBe(actor);
      expect(body.workspace.id).toBe(sessionId);
    }
  );

  it('charges room transcription to the meeting workspace', async () => {
    mocks.actor.id = 'host';
    mocks.actor.isHost = true;
    mocks.callRoom.mockResolvedValue({ live: { sessionId: 'unused' } });
    await call(live, {
      action: 'start',
      mode: 'room',
      timezone: 'UTC',
      audioPolicy: 'participant-opt-in',
    });
    const initialize = mocks.fetch.mock.calls.find(
      ([url]) => url === 'https://live.internal/initialize'
    );
    expect(initialize).toBeDefined();
    expect(JSON.parse(initialize?.[1].body).claims.billingWorkspaceId).toBe(
      'meeting-ws'
    );
  });
});
