import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  listHiveResearchTimeline: vi.fn(),
  requireHiveAccess: vi.fn(),
}));

vi.mock('@/lib/hive/research-sessions', () => ({
  listHiveResearchTimeline: (...args: unknown[]) =>
    mocks.listHiveResearchTimeline(...args),
}));

vi.mock('../../../_shared', () => ({
  requireHiveAccess: (...args: unknown[]) => mocks.requireHiveAccess(...args),
  withHiveRoute: (
    _request: NextRequest,
    _route: string,
    handler: () => Promise<Response>
  ) => handler(),
}));

describe('Hive timeline route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireHiveAccess.mockResolvedValue({
      access: { isAdmin: false, user: { id: 'user-1' } },
      ok: true,
    });
    mocks.listHiveResearchTimeline.mockResolvedValue({
      items: [
        {
          actorUserId: 'user-1',
          createdAt: '2026-05-17T10:00:00.000Z',
          eventType: 'npc.interaction',
          id: 'event-1',
          kind: 'event',
          payload: {},
          researchSessionId: 'session-1',
          revision: 12,
        },
      ],
    });
  });

  it('passes research timeline filters through to the shared helper', async () => {
    const response = await GET(
      new NextRequest(
        'https://tuturuuu.com/api/v1/hive/servers/server-1/timeline?researchSessionId=session-1&trigger=manual&status=completed&eventType=npc.interaction&actorUserId=user-1&npcId=npc-1&workflowId=workflow-1&limit=50'
      ),
      { params: Promise.resolve({ serverId: 'server-1' }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items[0]).toMatchObject({
      eventType: 'npc.interaction',
      kind: 'event',
    });
    expect(mocks.listHiveResearchTimeline).toHaveBeenCalledWith({
      filters: {
        actorUserId: 'user-1',
        eventType: 'npc.interaction',
        limit: 50,
        npcId: 'npc-1',
        researchSessionId: 'session-1',
        status: 'completed',
        trigger: 'manual',
        workflowId: 'workflow-1',
      },
      isAdmin: false,
      serverId: 'server-1',
    });
  });
});
