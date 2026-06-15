import { isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getPermissions: vi.fn(),
  getWorkspace: vi.fn(),
  MiraDashboardClient: vi.fn(({ children }) => children),
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
}));

vi.mock('@tuturuuu/utils/user-helper', () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
  getWorkspace: mocks.getWorkspace,
}));

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
}));

vi.mock('./components/mira-dashboard-client', () => ({
  default: mocks.MiraDashboardClient,
}));

describe('WorkspaceHomePage dashboard access', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getCurrentUser.mockResolvedValue({
      email: 'creator@example.com',
      id: 'creator-1',
    });
    mocks.getWorkspace.mockResolvedValue({
      creator_id: 'creator-1',
      id: 'workspace-1',
      personal: false,
    });
    mocks.getPermissions.mockResolvedValue({
      containsPermission: vi.fn(() => true),
      withoutPermission: vi.fn(() => false),
    });
  });

  it('requires effective permissions even when the current user is the workspace creator', async () => {
    mocks.getPermissions.mockResolvedValueOnce(null);
    const Page = (await import('./page')).default;

    await expect(
      Page({
        params: Promise.resolve({ wsId: 'workspace-1' }),
      })
    ).rejects.toThrow('not-found');

    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user: {
        email: 'creator@example.com',
        id: 'creator-1',
      },
      wsId: 'workspace-1',
    });
    expect(mocks.notFound).toHaveBeenCalled();
  });

  it('renders when the creator still has effective workspace permissions', async () => {
    const Page = (await import('./page')).default;

    const result = await Page({
      params: Promise.resolve({ wsId: 'workspace-1' }),
    });

    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(isValidElement(result)).toBe(true);
  });
});
