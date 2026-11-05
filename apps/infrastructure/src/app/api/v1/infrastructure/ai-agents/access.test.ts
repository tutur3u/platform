import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAiAgentAdmin } from './access';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  resolveSatelliteRequestActor: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mocks.createAdminClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: unknown[]) => mocks.getPermissions(...args),
}));

vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  resolveSatelliteRequestActor: (...args: unknown[]) =>
    mocks.resolveSatelliteRequestActor(...args),
}));

function request() {
  return new Request(
    'http://localhost/api/v1/infrastructure/ai-agents'
  ) as unknown as NextRequest;
}

describe('requireAiAgentAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({ id: 'admin-client' });
    mocks.resolveSatelliteRequestActor.mockResolvedValue({
      ok: true,
      supabase: { id: 'session-client' },
      user: { email: 'root@example.com', id: 'user-1' },
    });
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn().mockReturnValue(false),
    });
  });

  it('accepts infra app-session auth before checking root AI-agent permissions', async () => {
    const result = await requireAiAgentAdmin(request());

    expect(result.ok).toBe(true);
    expect(mocks.resolveSatelliteRequestActor).toHaveBeenCalledWith(
      expect.anything(),
      'infra'
    );
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user: { email: 'root@example.com', id: 'user-1' },
      wsId: ROOT_WORKSPACE_ID,
    });
    expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
  });

  it.each(['manage_workspace_secrets', 'manage_workspace_roles'])(
    'accepts root %s permission',
    async (allowed) => {
      mocks.getPermissions.mockResolvedValue({
        withoutPermission: (permission: string) => permission !== allowed,
      });
      expect((await requireAiAgentAdmin(request())).ok).toBe(true);
    }
  );

  it('rejects a workspace creator without root permissions', async () => {
    mocks.getPermissions.mockImplementation(async ({ wsId }) => ({
      withoutPermission: () => wsId === ROOT_WORKSPACE_ID,
    }));
    const result = await requireAiAgentAdmin(request());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('rejects authenticated users without root secret-management permission', async () => {
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn().mockReturnValue(true),
    });

    const result = await requireAiAgentAdmin(request());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });
});
