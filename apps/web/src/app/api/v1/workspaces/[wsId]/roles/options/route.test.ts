import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  range: vi.fn(),
  resolveWorkspaceRouteAccess: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, connection: vi.fn() };
});

vi.mock('@/lib/workspace-route-access', () => ({
  resolveWorkspaceRouteAccess: mocks.resolveWorkspaceRouteAccess,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({ range: mocks.range })),
        })),
      })),
    })),
  })),
}));

import { GET } from './route';

describe('workspace role options route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveWorkspaceRouteAccess.mockResolvedValue({
      ok: true,
      permissions: { wsId: 'resolved-workspace-id' },
    });
    mocks.range.mockResolvedValue({ count: 0, data: [], error: null });
  });

  it('rejects non-numeric pagination before querying roles', async () => {
    const response = await GET(
      new Request('http://localhost/roles/options?page=nope'),
      { params: Promise.resolve({ wsId: 'workspace-id' }) }
    );

    expect(response.status).toBe(400);
    expect(mocks.range).not.toHaveBeenCalled();
  });

  it('bounds page size and queries the resolved workspace', async () => {
    const response = await GET(
      new Request('http://localhost/roles/options?page=2&pageSize=500'),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.resolveWorkspaceRouteAccess).toHaveBeenCalledWith(
      expect.any(Request),
      'personal',
      ['manage_workspace_roles']
    );
    expect(mocks.range).toHaveBeenCalledWith(100, 199);
  });
});
