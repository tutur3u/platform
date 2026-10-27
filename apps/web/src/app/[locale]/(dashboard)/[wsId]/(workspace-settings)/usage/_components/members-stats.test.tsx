import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  permissions: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not-found');
  },
}));
vi.mock('@/components/cards/StatisticCard', () => ({
  default: ({ value }: { value: string | number }) => <div>{value}</div>,
}));

import { WorkspaceMembersStats } from './members-stats';

describe('Members usage statistic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: 57, error: null });
    mocks.admin.mockResolvedValue({ rpc: mocks.rpc });
  });
  it('counts for a manager without profile read grants using the server client', async () => {
    mocks.permissions.mockResolvedValue({
      containsPermission: (p: string) => p === 'manage_workspace_members',
    });
    expect(
      renderToStaticMarkup(await WorkspaceMembersStats({ wsId: 'workspace-1' }))
    ).toContain('57');
    expect(mocks.rpc).toHaveBeenCalledWith('get_workspace_users_count', {
      ws_id: 'workspace-1',
    });
  });
  it('masks the count without the statistics permission and never acquires an admin client', async () => {
    mocks.permissions.mockResolvedValue({ containsPermission: () => false });
    expect(
      renderToStaticMarkup(await WorkspaceMembersStats({ wsId: 'workspace-1' }))
    ).toContain('***');
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('does not expose a count when workspace access is absent', async () => {
    mocks.permissions.mockResolvedValue(null);
    await expect(
      WorkspaceMembersStats({ wsId: 'workspace-1' })
    ).rejects.toThrow('not-found');
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
