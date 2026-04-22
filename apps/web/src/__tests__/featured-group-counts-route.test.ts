import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const getPermissions = vi.fn();
  const rpc = vi.fn();

  return {
    adminSupabase: { rpc },
    getPermissions,
    rpc,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
}));

describe('featured group counts route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getPermissions.mockResolvedValue({
      containsPermission: vi.fn(),
    });
  });

  it('falls back to zero counts when Supabase returns an HTML 502 page', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        message:
          '<!DOCTYPE html><html><head><title> | 502: Bad gateway</title></head><body>Error code 502</body></html>',
      },
    });

    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/users/groups/featured-counts/route'
    );
    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/users/groups/featured-counts?featuredGroupIds=group-a&featuredGroupIds=group-b'
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1' }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      'group-a': 0,
      'group-b': 0,
    });
  });
});
