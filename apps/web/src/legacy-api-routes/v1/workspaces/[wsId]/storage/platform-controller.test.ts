import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPermissions: vi.fn(),
  getWorkspaceStorageRolloutState: vi.fn(),
  migrateWorkspaceStorageBetweenProviders: vi.fn(),
  resolveWorkspaceStorageRouteAuth: vi.fn(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
}));
vi.mock('@tuturuuu/storage-core/workspace-storage-migration', () => ({
  getWorkspaceStorageRolloutState: mocks.getWorkspaceStorageRolloutState,
  migrateWorkspaceStorageBetweenProviders:
    mocks.migrateWorkspaceStorageBetweenProviders,
}));
vi.mock('@tuturuuu/storage-core/workspace-storage-config', () => ({
  WORKSPACE_STORAGE_PROVIDER_OPTIONS: ['supabase', 'r2'],
}));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  WorkspaceStorageError: class WorkspaceStorageError extends Error {
    constructor(
      message: string,
      public readonly status: number
    ) {
      super(message);
    }
  },
}));
vi.mock('./route-auth', () => ({
  logWorkspaceStorageRouteError: vi.fn(),
  resolveWorkspaceStorageRouteAuth: mocks.resolveWorkspaceStorageRouteAuth,
}));

import { POST as migrate } from './migrate/route';
import { GET as rolloutState } from './rollout-state/route';

const user = { id: 'owner-1' };
const params = { params: Promise.resolve({ wsId: 'workspace-1' }) };

/** Workspace grants as a creator or `admin` member resolves them. */
const OWNER_GRANTS = ['admin', 'manage_workspace_secrets'];

function grant(workspace: string[] | null, root: string[] | null) {
  mocks.getPermissions.mockImplementation(
    async ({ wsId }: { wsId: string }) => {
      const grants = wsId === ROOT_WORKSPACE_ID ? root : workspace;
      return grants
        ? { containsPermission: (p: string) => grants.includes(p) }
        : null;
    }
  );
}

function migrateRequest() {
  return new Request('https://tuturuuu.example/api/storage/migrate', {
    method: 'POST',
    body: JSON.stringify({ sourceProvider: 'supabase', targetProvider: 'r2' }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveWorkspaceStorageRouteAuth.mockResolvedValue({
    ok: true,
    context: { normalizedWsId: 'workspace-1', user },
  });
  mocks.getWorkspaceStorageRolloutState.mockResolvedValue({ state: 'idle' });
  mocks.migrateWorkspaceStorageBetweenProviders.mockResolvedValue({
    moved: 0,
  });
});

describe('workspace storage provider rollout', () => {
  it('denies a workspace owner without root access', async () => {
    grant(OWNER_GRANTS, null);

    expect((await migrate(migrateRequest(), params)).status).toBe(403);
    expect(
      (await rolloutState(new Request('https://t.example'), params)).status
    ).toBe(403);
    expect(
      mocks.migrateWorkspaceStorageBetweenProviders
    ).not.toHaveBeenCalled();
    expect(mocks.getWorkspaceStorageRolloutState).not.toHaveBeenCalled();
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user,
      wsId: ROOT_WORKSPACE_ID,
    });
  });

  it.each(['manage_workspace_secrets', 'manage_workspace_roles'])(
    'allows a platform admin holding root %s',
    async (rootGrant) => {
      grant([], [rootGrant]);

      expect((await migrate(migrateRequest(), params)).status).toBe(200);
      expect(
        (await rolloutState(new Request('https://t.example'), params)).status
      ).toBe(200);
      expect(
        mocks.migrateWorkspaceStorageBetweenProviders
      ).toHaveBeenCalledWith('workspace-1', {
        overwrite: false,
        sourceProvider: 'supabase',
        targetProvider: 'r2',
      });
    }
  );
});
