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

vi.mock('@/lib/drive-app-url', () => ({
  getDriveAppOrigin: () => 'https://drive.tuturuuu.localhost',
}));

describe('drive page server gate', () => {
  it('throws notFound when permissions cannot be resolved', async () => {
    mocks.getPermissions.mockResolvedValueOnce(null);

    const { default: WorkspaceStorageObjectsPage } = await import('./page');
    const pageElement = await WorkspaceStorageObjectsPage({
      params: Promise.resolve({ wsId: 'ws-1' }),
      searchParams: Promise.resolve({}),
    });

    await expect(
      pageElement.props.children({
        isPersonal: false,
        isRoot: false,
        wsId: 'ws-1',
      })
    ).rejects.toThrow('not-found');
  });

  it('redirects to the workspace root when manage_drive is missing', async () => {
    mocks.getPermissions.mockResolvedValueOnce({
      withoutPermission: (permission: string) => permission === 'manage_drive',
    });

    const { default: WorkspaceStorageObjectsPage } = await import('./page');
    const pageElement = await WorkspaceStorageObjectsPage({
      params: Promise.resolve({ wsId: 'ws-1' }),
      searchParams: Promise.resolve({}),
    });

    await expect(
      pageElement.props.children({
        isPersonal: false,
        isRoot: false,
        wsId: 'ws-1',
      })
    ).rejects.toThrow('redirect:/ws-1');
  });

  it('redirects to the Drive satellite when access is allowed', async () => {
    mocks.getPermissions.mockResolvedValueOnce({
      withoutPermission: () => false,
    });

    const { default: WorkspaceStorageObjectsPage } = await import('./page');
    const pageElement = await WorkspaceStorageObjectsPage({
      params: Promise.resolve({ wsId: 'ws-1' }),
      searchParams: Promise.resolve({
        path: 'assets',
        q: 'demo',
      }),
    });

    await expect(
      pageElement.props.children({
        isPersonal: false,
        isRoot: false,
        wsId: 'ws-1',
      })
    ).rejects.toThrow(
      'redirect:https://drive.tuturuuu.localhost/ws-1?path=assets&q=demo'
    );
  });
});
