import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getPermissions: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  connection: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveAuthenticatedSessionUser,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
  createClient: mocks.createClient,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: mocks.connection,
}));

import { GET as getDomains } from './domains/route';
import { GET as getUncrawled } from './uncrawled/route';

const routes = [
  {
    get: getDomains,
    name: 'domains',
    url: 'http://localhost/api/workspace-a/crawlers/domains',
  },
  {
    get: getUncrawled,
    name: 'uncrawled',
    url: 'http://localhost/api/workspace-a/crawlers/uncrawled',
  },
] as const;

describe('crawler read access control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ auth: {} });
  });

  for (const route of routes) {
    it(`rejects anonymous ${route.name} reads before creating an admin client`, async () => {
      mocks.resolveAuthenticatedSessionUser.mockResolvedValue({ user: null });

      const response = await route.get(new Request(route.url), {
        params: Promise.resolve({ wsId: 'workspace-a' }),
      });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
      expect(mocks.getPermissions).not.toHaveBeenCalled();
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
    });
  }

  it('rejects users without access to the requested workspace', async () => {
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { email: 'member@example.com', id: 'user-1' },
    });
    mocks.getPermissions.mockResolvedValue(null);

    const response = await getDomains(
      new Request('http://localhost/api/other-workspace/crawlers/domains'),
      { params: Promise.resolve({ wsId: 'other-workspace' }) }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user: { email: 'member@example.com', id: 'user-1' },
      wsId: 'other-workspace',
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('rejects workspace members without the ai_lab permission', async () => {
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { email: 'member@example.com', id: 'user-1' },
    });
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn(() => true),
    });

    const response = await getUncrawled(
      new Request('http://localhost/api/workspace-a/crawlers/uncrawled'),
      { params: Promise.resolve({ wsId: 'workspace-a' }) }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
