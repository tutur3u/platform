import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  resolveSatellitePageActor: vi.fn(),
  resolveSatelliteRequestActor: vi.fn(),
}));

vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  resolveSatellitePageActor: mocks.resolveSatellitePageActor,
  resolveSatelliteRequestActor: mocks.resolveSatelliteRequestActor,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
}));

import { resolveDatasetWorkspaceAccess } from './access';

describe('resolveDatasetWorkspaceAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveSatellitePageActor.mockResolvedValue(null);
    mocks.resolveSatelliteRequestActor.mockResolvedValue(null);
  });

  it('resolves the page actor against the workspace audience only', async () => {
    await resolveDatasetWorkspaceAccess('ws-1');

    expect(mocks.resolveSatellitePageActor).toHaveBeenCalledWith('workspace');
    expect(mocks.resolveSatelliteRequestActor).not.toHaveBeenCalled();
  });

  it('resolves the request actor against the workspace audience only', async () => {
    const request = new Request('https://workspace.tuturuuu.com/api/x');

    await resolveDatasetWorkspaceAccess('ws-1', request);

    expect(mocks.resolveSatelliteRequestActor).toHaveBeenCalledWith(
      request,
      'workspace'
    );
  });

  it('answers 401 and reads no permissions without an actor', async () => {
    const access = await resolveDatasetWorkspaceAccess('ws-1');

    expect(access.ok).toBe(false);
    if (!access.ok) expect(access.response.status).toBe(401);
    expect(mocks.getPermissions).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
