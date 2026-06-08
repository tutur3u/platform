import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createHiveWorldEvent: vi.fn(),
  ensureHiveResearchSchema: vi.fn(),
  requireHiveAccess: vi.fn(),
  resolveHiveResearchSessionId: vi.fn(),
}));

vi.mock('@/lib/hive/hive-db', () => ({
  createHiveWorldEvent: (...args: unknown[]) =>
    mocks.createHiveWorldEvent(...args),
}));

vi.mock('@/lib/hive/research-schema', () => ({
  ensureHiveResearchSchema: (...args: unknown[]) =>
    mocks.ensureHiveResearchSchema(...args),
  resolveHiveResearchSessionId: (...args: unknown[]) =>
    mocks.resolveHiveResearchSessionId(...args),
}));

vi.mock('../../../_shared', async () => {
  const actual =
    await vi.importActual<typeof import('../../../_shared')>(
      '../../../_shared'
    );

  return {
    ...actual,
    requireHiveAccess: (...args: unknown[]) => mocks.requireHiveAccess(...args),
    withHiveRoute: (
      _request: NextRequest,
      _route: string,
      handler: () => Promise<Response>
    ) => handler(),
  };
});

function hiveEventRequest(body: unknown) {
  return new NextRequest(
    'https://tuturuuu.com/api/v1/hive/servers/server-1/events',
    {
      body: JSON.stringify(body),
      method: 'POST',
    }
  );
}

const world = {
  blocks: [],
  objects: [],
};

const persistedEvent = {
  actor_user_id: 'user-1',
  created_at: '2026-05-17T00:00:00.000Z',
  event_type: 'agent.refine',
  id: 'event-1',
  op_seq: 8,
  payload: {},
  research_session_id: null,
  revision: 8,
  server_id: 'server-1',
};

describe('Hive world events route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireHiveAccess.mockResolvedValue({
      access: { isAdmin: false, user: { id: 'user-1' } },
      ok: true,
    });
    mocks.resolveHiveResearchSessionId.mockResolvedValue(null);
    mocks.createHiveWorldEvent.mockResolvedValue(persistedEvent);
  });

  it('rejects member agent prompts that clear shared worlds', async () => {
    const { POST } = await import('./route');

    const response = await POST(
      hiveEventRequest({
        eventType: 'agent.refine',
        expectedRevision: 7,
        payload: { prompt: 'clear the world' },
        world,
      }),
      { params: Promise.resolve({ serverId: 'server-1' }) }
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Hive admin access required',
    });
    expect(mocks.ensureHiveResearchSchema).not.toHaveBeenCalled();
    expect(mocks.createHiveWorldEvent).not.toHaveBeenCalled();
  });

  it('rejects direct member clear and reseed world events', async () => {
    const { POST } = await import('./route');

    for (const eventType of ['world.clear', 'world.reseed']) {
      const response = await POST(
        hiveEventRequest({
          eventType,
          expectedRevision: 7,
          payload: { mode: eventType.split('.').at(-1) },
          world,
        }),
        { params: Promise.resolve({ serverId: 'server-1' }) }
      );

      expect(response.status).toBe(403);
    }

    expect(mocks.createHiveWorldEvent).not.toHaveBeenCalled();
  });

  it('allows member non-destructive agent world refinements', async () => {
    const { POST } = await import('./route');

    const response = await POST(
      hiveEventRequest({
        eventType: 'agent.refine',
        expectedRevision: 7,
        payload: { prompt: 'add a river and bridge' },
        world,
      }),
      { params: Promise.resolve({ serverId: 'server-1' }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.createHiveWorldEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'user-1',
        eventType: 'agent.refine',
        payload: expect.objectContaining({
          expectedRevision: 7,
          prompt: 'add a river and bridge',
        }),
        serverId: 'server-1',
        world,
      })
    );
  });

  it('allows admins to persist destructive agent prompts', async () => {
    const { POST } = await import('./route');
    mocks.requireHiveAccess.mockResolvedValueOnce({
      access: { isAdmin: true, user: { id: 'admin-1' } },
      ok: true,
    });

    const response = await POST(
      hiveEventRequest({
        eventType: 'agent.refine',
        expectedRevision: 7,
        payload: { prompt: 'reseed default world' },
        world,
      }),
      { params: Promise.resolve({ serverId: 'server-1' }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.createHiveWorldEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'admin-1',
        eventType: 'agent.refine',
      })
    );
  });
});
