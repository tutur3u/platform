import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  handleTaskRouteGET: vi.fn(),
  getProxySessionSubjectKey: vi.fn(),
  hasCachedIpBlockAppealRelief: vi.fn(),
  headers: vi.fn(),
  isIPBlocked: vi.fn(),
  isIPBlockedEdge: vi.fn(),
  readTaskBoardDetail: vi.fn(),
  readUserSuspension: vi.fn(),
}));

vi.mock('@tanstack/react-start/server-only', () => ({}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: vi.fn(),
}));
vi.mock('@tuturuuu/start-bridge/next/headers', () => ({
  headers: mocks.headers,
}));
vi.mock('@tuturuuu/start-bridge/next/server', () => ({
  NextRequest: class {
    constructor(readonly url: URL) {}
  },
}));
vi.mock('@tuturuuu/auth/app-session', () => ({
  attachSupabaseAuthUser: (client: unknown) => client,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@tuturuuu/tasks-api/server/tasks/route', () => ({
  handleTaskRouteGET: mocks.handleTaskRouteGET,
}));
vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  extractIPFromHeaders: () => '203.0.113.9',
}));
vi.mock('@tuturuuu/utils/abuse-protection/abuse-subject', () => ({
  abuseSubject: (_headers: unknown, ip: string) => `subject:${ip}`,
}));
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  getProxySessionSubjectKeyFromCookieHeader: mocks.getProxySessionSubjectKey,
}));
vi.mock('@tuturuuu/utils/abuse-protection/edge-trust', () => ({
  hasCachedIpBlockAppealRelief: mocks.hasCachedIpBlockAppealRelief,
}));
vi.mock('@tuturuuu/utils/abuse-protection/edge', () => ({
  isIPBlockedEdge: mocks.isIPBlockedEdge,
}));
vi.mock('@tuturuuu/utils/abuse-protection/recent-ip-block', () => ({
  isIPBlockedReusingRecentClear: mocks.isIPBlocked,
}));
vi.mock('../lib/session-security-lookups', () => ({
  readUserSuspension: mocks.readUserSuspension,
}));
vi.mock(
  '../app/api/v1/workspaces/[wsId]/task-boards/[boardId]/board-detail',
  () => ({ readTaskBoardDetail: mocks.readTaskBoardDetail })
);

const { loadBoardSnapshot } = await import('./board-snapshot.server');

const user = { id: 'user-1' } as Parameters<
  typeof loadBoardSnapshot
>[0]['user'];
const block = (reason: string) => ({
  id: 'block-1',
  blockLevel: 1,
  reason,
  expiresAt: new Date(Date.now() + 60_000),
  blockedAt: new Date(),
});
const load = () =>
  loadBoardSnapshot({ user, wsId: 'ws-1', boardId: 'board-1' });

describe('loadBoardSnapshot request decisions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
    mocks.getProxySessionSubjectKey.mockResolvedValue(null);
    mocks.hasCachedIpBlockAppealRelief.mockResolvedValue(false);
    mocks.isIPBlocked.mockResolvedValue(null);
    mocks.isIPBlockedEdge.mockResolvedValue(null);
    mocks.readUserSuspension.mockResolvedValue(null);
    mocks.createAdminClient.mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            in: async () => ({ data: [], error: null }),
            eq: () => ({ in: async () => ({ data: [], error: null }) }),
          }),
        }),
      }),
    });
    mocks.readTaskBoardDetail.mockResolvedValue(
      Response.json({
        board: {
          id: 'board-1',
          ws_id: 'ws-1',
          access_type: 'member',
          task_lists: [],
        },
      })
    );
  });

  it('reads nothing for a blocked IP', async () => {
    mocks.isIPBlocked.mockResolvedValue(block('password_login_failed'));

    await expect(load()).resolves.toBeNull();
    expect(mocks.readTaskBoardDetail).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('reads nothing for a suspended actor', async () => {
    mocks.readUserSuspension.mockResolvedValue({ reason: 'abuse' });

    await expect(load()).resolves.toBeNull();
    expect(mocks.readTaskBoardDetail).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('reads nothing when an api_abuse block and a suspension coincide', async () => {
    mocks.isIPBlocked.mockResolvedValue(block('api_abuse'));
    mocks.readUserSuspension.mockResolvedValue({ reason: 'abuse' });

    await expect(load()).resolves.toBeNull();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.readTaskBoardDetail).not.toHaveBeenCalled();
  });

  it('denies an api_abuse block too, as the API proxy guard does', async () => {
    mocks.isIPBlocked.mockResolvedValue(block('api_abuse'));

    await expect(load()).resolves.toBeNull();
    expect(mocks.readTaskBoardDetail).not.toHaveBeenCalled();
  });

  it('reads the board with matching temporary API-abuse relief', async () => {
    mocks.isIPBlocked.mockResolvedValue(block('api_abuse'));
    mocks.isIPBlockedEdge.mockResolvedValue(block('api_abuse'));
    mocks.getProxySessionSubjectKey.mockResolvedValue('session-key');
    mocks.hasCachedIpBlockAppealRelief.mockResolvedValue(true);

    await expect(load()).resolves.toMatchObject({ board: { id: 'board-1' } });
    expect(mocks.hasCachedIpBlockAppealRelief).toHaveBeenCalledWith(
      'session-key',
      'ip:203.0.113.9'
    );
  });

  it('keeps unrelated blocks in force during API-abuse relief', async () => {
    mocks.isIPBlocked.mockResolvedValue(block('password_login_failed'));
    mocks.isIPBlockedEdge.mockResolvedValue(block('api_abuse'));
    mocks.getProxySessionSubjectKey.mockResolvedValue('session-key');
    mocks.hasCachedIpBlockAppealRelief.mockResolvedValue(true);

    await expect(load()).resolves.toBeNull();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('reads nothing for a block only the edge proxy store holds', async () => {
    mocks.isIPBlockedEdge.mockResolvedValue(block('api_abuse'));

    await expect(load()).resolves.toBeNull();
    expect(mocks.isIPBlockedEdge).toHaveBeenCalledWith('subject:203.0.113.9');
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('reads the board when neither decision denies', async () => {
    await expect(load()).resolves.toMatchObject({
      board: { id: 'board-1' },
    });
    expect(mocks.readTaskBoardDetail).toHaveBeenCalledTimes(1);
  });

  it('checks the request IP for the board page', async () => {
    await load();
    expect(mocks.isIPBlocked).toHaveBeenCalledWith('203.0.113.9', {
      route: '/[wsId]/boards/[boardId]',
      source: 'tasks-board-page',
    });
  });
});
