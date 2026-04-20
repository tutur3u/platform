import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPermissions: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
}));

vi.mock('next/navigation', () => ({
  notFound: (...args: Parameters<typeof mocks.notFound>) =>
    mocks.notFound(...args),
  redirect: (...args: Parameters<typeof mocks.redirect>) =>
    mocks.redirect(...args),
}));

vi.mock('./drive-explorer-client', () => ({
  default: ({ wsId }: { wsId: string }) => ({
    type: 'drive-client',
    props: { wsId },
  }),
}));

describe('drive page server gate', () => {
  it('throws notFound when permissions cannot be resolved', async () => {
    mocks.getPermissions.mockResolvedValueOnce(null);

    const { default: WorkspaceStorageObjectsPage } = await import('./page');
    const pageElement = await WorkspaceStorageObjectsPage({
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    await expect(pageElement.props.children({ wsId: 'ws-1' })).rejects.toThrow(
      'not-found'
    );
  });

  it('redirects to the workspace root when manage_drive is missing', async () => {
    mocks.getPermissions.mockResolvedValueOnce({
      withoutPermission: (permission: string) => permission === 'manage_drive',
    });

    const { default: WorkspaceStorageObjectsPage } = await import('./page');
    const pageElement = await WorkspaceStorageObjectsPage({
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    await expect(pageElement.props.children({ wsId: 'ws-1' })).rejects.toThrow(
      'redirect:/ws-1'
    );
  });

  it('returns the client explorer when access is allowed', async () => {
    mocks.getPermissions.mockResolvedValueOnce({
      withoutPermission: () => false,
    });

    const { default: WorkspaceStorageObjectsPage } = await import('./page');
    const pageElement = await WorkspaceStorageObjectsPage({
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    const result = await pageElement.props.children({ wsId: 'ws-1' });

    expect(result.props.wsId).toBe('ws-1');
    expect(typeof result.type).toBe('function');
  });
});
