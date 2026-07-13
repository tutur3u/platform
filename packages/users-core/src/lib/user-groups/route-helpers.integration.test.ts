import { createAppSessionToken } from '@tuturuuu/auth/app-session';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveAuthenticatedSessionUser,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: mocks.createClient,
}));

import { resolveRequestActorAuthUid } from './route-helpers';

describe('Contacts app-session actor integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'contacts-e2e-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves a signed Contacts bearer token without Supabase cookie auth', async () => {
    const actorId = '10000000-0000-4000-8000-000000000001';
    const { token } = createAppSessionToken(
      {
        email: 'contacts-e2e@example.com',
        originApp: 'web',
        targetApp: 'contacts',
        userId: actorId,
      },
      { secret: 'contacts-e2e-secret' }
    );
    const request = new Request(
      'https://contacts.tuturuuu.com/api/v1/workspaces/workspace-1/user-groups/group-1/posts',
      { headers: { authorization: `Bearer ${token}` } }
    );

    await expect(resolveRequestActorAuthUid(request)).resolves.toBe(actorId);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.resolveAuthenticatedSessionUser).not.toHaveBeenCalled();
  });

  it('does not accept a token issued for another satellite', async () => {
    const { token } = createAppSessionToken(
      {
        originApp: 'web',
        targetApp: 'finance',
        userId: '10000000-0000-4000-8000-000000000001',
      },
      { secret: 'contacts-e2e-secret' }
    );
    mocks.createClient.mockResolvedValue({});
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({ user: null });

    const request = new Request(
      'https://contacts.tuturuuu.com/api/v1/workspaces/workspace-1/user-groups/group-1/posts',
      { headers: { authorization: `Bearer ${token}` } }
    );

    await expect(resolveRequestActorAuthUid(request)).resolves.toBeNull();
    expect(mocks.createClient).toHaveBeenCalledWith(request);
  });
});
