import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  resolveUser: vi.fn(),
  getPermissions: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: mocks.createClient,
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveUser,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
}));

import {
  createFakeSupabase,
  seedDb,
} from '@/app/api/v1/workspaces/[wsId]/datasets/dataset-route-fixtures';
import { resolveDatasetAccess, resolveDatasetWorkspaceAccess } from './access';

describe('dataset authorization before privileged data access', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createClient.mockResolvedValue({
      from: vi.fn(() => {
        throw new Error('session dataset query');
      }),
    });
    mocks.resolveUser.mockResolvedValue({
      user: { id: 'actor-a' },
      authError: null,
    });
    mocks.getPermissions.mockResolvedValue({
      wsId: 'ws-a',
      withoutPermission: () => false,
    });
    mocks.createAdminClient.mockResolvedValue(createFakeSupabase(seedDb()));
  });
  it('denies anonymous requests with 401 before any data/permission lookup', async () => {
    mocks.resolveUser.mockResolvedValue({ user: null, authError: null });
    const result = await resolveDatasetWorkspaceAccess('ws-a');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(mocks.getPermissions).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
  it('hides non-membership with 404 before creating a dataset admin client', async () => {
    mocks.getPermissions.mockResolvedValue(null);
    const result = await resolveDatasetAccess('ws-b', 'ds-b');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(404);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
  it('checks the shared ai_lab permission and denies missing permission', async () => {
    const withoutPermission = vi.fn(() => true);
    mocks.getPermissions.mockResolvedValue({ wsId: 'ws-a', withoutPermission });
    const result = await resolveDatasetWorkspaceAccess('ws-a');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(withoutPermission).toHaveBeenCalledWith('ai_lab');
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
  it('uses the canonical authorized workspace and verifies dataset ownership', async () => {
    const result = await resolveDatasetAccess('personal', 'ds-a');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.wsId).toBe('ws-a');
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      wsId: 'personal',
      user: { id: 'actor-a' },
    });
    const denied = await resolveDatasetAccess('ws-a', 'ds-b');
    if (denied.ok) throw new Error('foreign dataset accepted');
    expect(denied.response.status).toBe(404);
  });
});

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, connection: async () => undefined };
});
