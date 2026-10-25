import { beforeEach, describe, expect, it, vi } from 'vitest';

// Exercises the real authorization helper; only the session, permission and
// storage boundaries are mocked.
const grants = vi.hoisted(() => ({ value: new Set<string>() }));
const createAdminClient = vi.fn();
const list = vi.fn();
const publish = vi.fn();
vi.mock('@tuturuuu/auth/app-session', () => ({
  createAppSessionUser: vi.fn(),
  getAppSessionTokenFromRequest: () => null,
}));
vi.mock('@tuturuuu/auth/cli-session', () => ({
  verifyCliAccessToken: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({}),
  createAdminClient: (...args: unknown[]) => createAdminClient(...args),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: async () => ({ user: { id: 'member-1' } }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: async () => ({
    membershipType: 'MEMBER',
    withoutPermission: (permission: string) => !grants.value.has(permission),
  }),
}));
vi.mock('@/lib/balancer/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/balancer/store')>()),
  listBalancerRuns: () => list(),
  publishBalancerRuns: (publisher: string, runs: unknown[]) =>
    publish(publisher, runs),
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => undefined,
}));

const { GET, POST } = await import('./route');
const url = 'https://infra.test/api/v1/infrastructure/balancer/runs';

beforeEach(() => {
  grants.value = new Set();
  createAdminClient.mockReset();
  list.mockReset().mockResolvedValue([]);
  publish.mockReset().mockResolvedValue([]);
});

describe('balancer runs route permissions', () => {
  it('refuses GET to a root member without view_infrastructure', async () => {
    const response = await GET(new Request(url));
    expect(response.status).toBe(403);
    expect(list).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('lists runs for a root member with view_infrastructure', async () => {
    grants.value = new Set(['view_infrastructure']);
    const response = await GET(new Request(url));
    expect(response.status).toBe(200);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('keeps POST open to root members without view_infrastructure', async () => {
    const response = await POST(
      new Request(url, { method: 'POST', body: JSON.stringify({ runs: [] }) })
    );
    expect(response.status).not.toBe(403);
  });
});
