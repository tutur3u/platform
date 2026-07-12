import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAppSessionUser: vi.fn(),
  createClient: vi.fn(),
  getPermissions: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  verifyAppSessionRequest: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  createAppSessionUser: mocks.createAppSessionUser,
  verifyAppSessionRequest: mocks.verifyAppSessionRequest,
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveAuthenticatedSessionUser,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: mocks.createClient,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
}));

import { getUserGroupRoutePermissions } from './route-auth';

describe('user group route app-session auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes a verified Contacts app-session actor into permissions', async () => {
    const request = new Request(
      'https://contacts.tuturuuu.com/api/v1/workspaces/ws-1/user-groups/group-1'
    );
    const actor = { email: 'owner@example.com', id: 'user-1' };
    const permissions = { wsId: 'ws-1' };

    mocks.verifyAppSessionRequest.mockReturnValue({
      claims: { sub: actor.id },
      ok: true,
    });
    mocks.createAppSessionUser.mockReturnValue(actor);
    mocks.getPermissions.mockResolvedValue(permissions);

    await expect(getUserGroupRoutePermissions('ws-1', request)).resolves.toBe(
      permissions
    );

    expect(mocks.verifyAppSessionRequest).toHaveBeenCalledWith(request, {
      targetApp: ['contacts', 'platform', 'teach'],
    });
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user: actor,
      wsId: 'ws-1',
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
