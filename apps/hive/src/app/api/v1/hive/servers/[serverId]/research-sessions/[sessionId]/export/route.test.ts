import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  getHiveResearchSessionExport: vi.fn(),
  requireHiveAccess: vi.fn(),
}));

vi.mock('@/lib/hive/research-sessions', () => ({
  getHiveResearchSessionExport: (...args: unknown[]) =>
    mocks.getHiveResearchSessionExport(...args),
}));

vi.mock('../../../../../_shared', () => ({
  requireHiveAccess: (...args: unknown[]) => mocks.requireHiveAccess(...args),
  withHiveRoute: (
    _request: NextRequest,
    _route: string,
    handler: () => Promise<Response>
  ) => handler(),
}));

describe('Hive research session export route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireHiveAccess.mockResolvedValue({
      access: { isAdmin: false, user: { id: 'user-1' } },
      ok: true,
    });
    mocks.getHiveResearchSessionExport.mockResolvedValue({
      exportedAt: '2026-05-18T00:00:00.000Z',
      formatVersion: 1,
      serverId: 'server-1',
      session: {
        id: 'session-1',
        name: 'Research session',
        serverId: 'server-1',
      },
      timeline: [],
    });
  });

  it('passes member workflow visibility to the export helper', async () => {
    const response = await GET(
      new NextRequest(
        'https://tuturuuu.com/api/v1/hive/servers/server-1/research-sessions/session-1/export'
      ),
      {
        params: Promise.resolve({
          serverId: 'server-1',
          sessionId: 'session-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.getHiveResearchSessionExport).toHaveBeenCalledWith({
      isAdmin: false,
      serverId: 'server-1',
      sessionId: 'session-1',
    });
  });
});
