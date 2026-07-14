import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  resolveActor: vi.fn(),
  resolveWorkspaceId: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('../../../lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: mocks.getPermissions,
}));
vi.mock('../../../lib/user-groups/route-helpers', () => ({
  resolveRequestActorAuthUid: mocks.resolveActor,
  resolveUserGroupRouteWorkspaceId: mocks.resolveWorkspaceId,
}));

import { GET } from './route';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

function request() {
  return new Request(
    `https://contacts.tuturuuu.com/api/v1/workspaces/${WORKSPACE_ID}/posts/bootstrap`,
    { headers: { authorization: 'Bearer ttr_app_test' } }
  );
}

describe('Contacts-compatible Posts bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveActor.mockResolvedValue('actor-id');
    mocks.resolveWorkspaceId.mockResolvedValue(WORKSPACE_ID);
    mocks.getPermissions.mockResolvedValue({ containsPermission: vi.fn() });
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: WORKSPACE_ID, timezone: 'Asia/Ho_Chi_Minh' },
      error: null,
    });
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle })),
        })),
      })),
    });
  });

  it('accepts the satellite app-session actor and returns workspace defaults', async () => {
    const req = request();
    const response = await GET(req, {
      params: Promise.resolve({ wsId: WORKSPACE_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      defaultDateRange: {
        end: expect.any(String),
        start: expect.any(String),
      },
      wsId: WORKSPACE_ID,
    });
    expect(mocks.resolveActor).toHaveBeenCalledWith(req);
    expect(mocks.getPermissions).toHaveBeenCalledWith(WORKSPACE_ID, req);
  });

  it('rejects a request without a satellite or Supabase actor', async () => {
    mocks.resolveActor.mockResolvedValue(null);

    const response = await GET(request(), {
      params: Promise.resolve({ wsId: WORKSPACE_ID }),
    });

    expect(response.status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
