import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cloudflare: vi.fn(),
  fetch: vi.fn(),
  callRoom: vi.fn(),
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
          user: { id: 'actor' },
          isHost: true,
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

import { POST as review } from './review/route';
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

describe('meet-live routes workspace gate', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.fetch.mockResolvedValue(Response.json({ ok: true }));
    mocks.callRoom.mockResolvedValue({});
  });

  it.each([
    ['start', { action: 'start', mode: 'personal', timezone: 'UTC' }],
    ['resume', { action: 'resume', sessionId }],
  ])(
    'denies %s outside the allowlist with no Durable Object or room work',
    async (_name, body) => {
      for (const allowlist of [undefined, '', 'other-ws']) {
        bind(allowlist);
        const response = await call(live, body);
        expect(response.status).toBe(403);
      }
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(mocks.callRoom).not.toHaveBeenCalled();
    }
  );

  it('keeps stop open so an existing session can always end', async () => {
    bind(undefined);
    const response = await call(live, { action: 'stop', sessionId });
    expect(response.status).toBe(200);
    expect(mocks.fetch).toHaveBeenCalledWith(
      'https://live.internal/control',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('admits a listed workspace to start', async () => {
    bind('meeting-ws');
    const response = await call(live, {
      action: 'start',
      mode: 'personal',
      timezone: 'UTC',
    });
    expect(response.status).not.toBe(403);
    expect(mocks.fetch).toHaveBeenCalled();
  });

  it('denies Live review for an unlisted workspace before any Durable Object call', async () => {
    bind(undefined);
    const response = await call(review, {
      sessionId,
      reviewId: sessionId,
      approved: false,
    });
    expect(response.status).toBe(403);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
