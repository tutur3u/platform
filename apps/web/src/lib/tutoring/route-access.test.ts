import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  attachSupabaseAuthUser: vi.fn(),
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getAppSessionUserFromRequest: vi.fn(),
  getPermissions: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  attachSupabaseAuthUser: mocks.attachSupabaseAuthUser,
  getAppSessionUserFromRequest: mocks.getAppSessionUserFromRequest,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
  createClient: mocks.createClient,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
}));

const workspaceId = '42529372-c669-4833-bb32-2cab1f4ffd83';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPermissions.mockResolvedValue({ wsId: workspaceId });
});

describe('tutoring route access', () => {
  it('uses a verified Contacts session as the permission actor', async () => {
    const request = new Request(
      `https://contacts.tuturuuu.com/api/${workspaceId}`
    );
    const user = {
      id: 'd58e0b8c-5fe8-4b3f-9f16-4137890b738d',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-01-01T00:00:00.000Z',
    };
    const admin = { kind: 'admin' };
    const supabase = { kind: 'actor-bound' };
    mocks.getAppSessionUserFromRequest.mockReturnValue(user);
    mocks.createAdminClient.mockResolvedValue(admin);
    mocks.attachSupabaseAuthUser.mockReturnValue(supabase);

    const { createTutoringRequestClient, resolveTutoringRouteAccess } =
      await import('./route-access');
    const result = await resolveTutoringRouteAccess(request, workspaceId);

    expect(mocks.getAppSessionUserFromRequest).toHaveBeenCalledWith(request, {
      targetApp: ['contacts', 'platform'],
    });
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user,
      wsId: workspaceId,
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(result).toMatchObject({ user, normalizedWsId: workspaceId });

    await expect(createTutoringRequestClient(request, user)).resolves.toBe(
      supabase
    );
    expect(mocks.createAdminClient).toHaveBeenCalledWith({
      noCookie: true,
      auditActorId: user.id,
    });
  });

  it('retains Supabase request authentication for central web and API clients', async () => {
    const request = new Request(`https://tuturuuu.com/api/${workspaceId}`);
    const supabase = { kind: 'request-bound' };
    mocks.getAppSessionUserFromRequest.mockReturnValue(null);
    mocks.createClient.mockResolvedValue(supabase);

    const { createTutoringRequestClient, resolveTutoringRouteAccess } =
      await import('./route-access');
    const result = await resolveTutoringRouteAccess(request, workspaceId);

    expect(mocks.getPermissions).toHaveBeenCalledWith({
      request,
      wsId: workspaceId,
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(result).toMatchObject({ user: null, normalizedWsId: workspaceId });

    await expect(createTutoringRequestClient(request, null)).resolves.toBe(
      supabase
    );
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
