import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  client: vi.fn(),
  actor: vi.fn(),
  permissions: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
  createClient: mocks.client,
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.actor,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async (id: string) => id,
  getPermissions: mocks.permissions,
}));

import { GET } from './route';

describe('workforce profile visibility', () => {
  const actorId = 'actor-1',
    ownId = 'profile-own',
    otherId = 'profile-other',
    wsId = 'workspace-1';
  let grants: Set<string>;
  let membershipType: 'MEMBER' | 'GUEST';
  let lookupFailure: boolean;
  let adminFrom: ReturnType<typeof vi.fn>;
  let filters: Array<Record<string, string>>;

  beforeEach(() => {
    vi.clearAllMocks();
    grants = new Set();
    membershipType = 'MEMBER';
    filters = [];
    lookupFailure = false;
    mocks.actor.mockResolvedValue({ user: { id: actorId }, authError: null });
    mocks.permissions.mockImplementation(async () => ({
      membershipType,
      containsPermission: (p: string) => grants.has(p),
    }));
    const userQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    mocks.client.mockResolvedValue({ from: vi.fn(() => userQuery) });
    adminFrom = vi.fn((table: string) => {
      const scope: Record<string, string> = {};
      filters.push(scope);
      const query = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn((key: string, value: string) => {
          scope[key] = value;
          return query;
        }),
        maybeSingle: vi.fn(async () => ({
          data:
            table === 'workspace_user_linked_users' &&
            scope.platform_user_id === actorId &&
            scope.virtual_user_id === ownId &&
            scope.ws_id === wsId
              ? { virtual_user_id: ownId }
              : null,
          error: lookupFailure ? { message: 'synthetic lookup failure' } : null,
        })),
        single: vi.fn(async () => ({
          data: {
            id: scope.id,
            ws_id: scope.ws_id,
            full_name: 'Synthetic profile',
            email: 'synthetic@example.invalid',
            national_id: 'synthetic-id',
            workforce_contracts: [],
          },
          error: null,
        })),
      };
      return query;
    });
    mocks.admin.mockResolvedValue({ from: adminFrom });
  });

  const call = (userId = ownId) =>
    GET(new NextRequest('https://example.invalid/workforce/profile'), {
      params: Promise.resolve({ wsId, userId }),
    });

  it('allows the member self-view without profile read grants despite filtered user-session links', async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: ownId,
      email: 'synthetic@example.invalid',
    });
    expect(filters[0]).toEqual({
      platform_user_id: actorId,
      virtual_user_id: ownId,
      ws_id: wsId,
    });
  });

  it('does not turn an existing guest link into member self-profile access', async () => {
    membershipType = 'GUEST';
    expect((await call()).status).toBe(403);
    expect(adminFrom).toHaveBeenCalledTimes(1);
  });

  it('does not use the callers own link to authorize another profile', async () => {
    expect((await call(otherId)).status).toBe(403);
    expect(adminFrom).toHaveBeenCalledTimes(1);
    expect(filters[0]).toEqual({
      platform_user_id: actorId,
      virtual_user_id: otherId,
      ws_id: wsId,
    });
  });

  it('requires profile read scope for a non-self workforce viewer', async () => {
    grants.add('view_workforce');
    expect((await call(otherId)).status).toBe(403);
  });

  it('preserves failed self lookups as server errors', async () => {
    lookupFailure = true;
    expect((await call()).status).toBe(500);
    expect(adminFrom).toHaveBeenCalledTimes(1);
  });

  it('projects another profile using the viewers public grant', async () => {
    grants.add('view_workforce');
    grants.add('view_users_public_info');
    const response = await call(otherId);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ id: otherId, full_name: 'Synthetic profile' });
    expect(body).not.toHaveProperty('email');
    expect(body).not.toHaveProperty('national_id');
  });

  it('requires a verified actor before acquiring the admin client', async () => {
    mocks.actor.mockResolvedValue({
      user: null,
      authError: new Error('synthetic'),
    });
    expect((await call()).status).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
