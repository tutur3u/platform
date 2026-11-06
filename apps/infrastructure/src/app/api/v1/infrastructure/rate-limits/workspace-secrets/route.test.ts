import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RATE_LIMIT_SECRET_NAMES } from '@/lib/rate-limit';
import { PUT } from './route';

const WS_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getPermissions: vi.fn(),
  granted: new Set<string>(),
  resolveActor: vi.fn(),
}));

vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: async () => ({ id: 'actor' }),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ from: mocks.from }),
}));
vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  resolveSatelliteRequestActor: (...args: unknown[]) =>
    mocks.resolveActor(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: unknown[]) => mocks.getPermissions(...args),
}));

function makeRequest() {
  return new Request(
    'http://localhost/api/v1/infrastructure/rate-limits/workspace-secrets',
    {
      body: JSON.stringify({
        secrets: Object.fromEntries(
          Object.values(RATE_LIMIT_SECRET_NAMES).map((name) => [name, null])
        ),
        wsId: WS_ID,
      }),
      method: 'PUT',
    }
  );
}

describe('rate-limit workspace secrets PUT permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.granted = new Set();
    mocks.resolveActor.mockResolvedValue({
      admin: { from: mocks.from },
      user: { id: 'actor' },
    });
    mocks.getPermissions.mockImplementation(({ wsId }: { wsId: string }) =>
      Promise.resolve(
        wsId === ROOT_WORKSPACE_ID
          ? {
              membershipType: 'MEMBER',
              containsPermission: (permission: string) =>
                mocks.granted.has(permission),
              withoutPermission: (permission: string) =>
                !mocks.granted.has(permission),
            }
          : null
      )
    );
    mocks.from.mockReturnValue({
      select: () => ({
        eq: () => ({ in: async () => ({ data: [], error: null }) }),
      }),
    });
  });

  it('admits root MEMBER role managers under SR-385', async () => {
    mocks.granted = new Set(['manage_workspace_roles', 'view_infrastructure']);

    const response = await PUT(makeRequest());

    expect(response.status).toBe(200);
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user: { id: 'actor' },
      wsId: ROOT_WORKSPACE_ID,
    });
    expect(mocks.from).toHaveBeenCalledWith('workspace_secrets');
  });

  it('allows root manage_workspace_secrets', async () => {
    mocks.granted = new Set(['manage_workspace_secrets']);

    const response = await PUT(makeRequest());

    expect(response.status).toBe(200);
    expect(mocks.from).toHaveBeenCalledWith('workspace_secrets');
  });
});
