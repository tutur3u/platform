import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  binding: vi.fn(),
  permissions: vi.fn(),
  member: vi.fn(),
  sessionToken: vi.fn(),
  bearer: vi.fn(),
}));
const wsId = '11111111-1111-4111-8111-111111111111';
vi.mock('@tuturuuu/auth/app-coordination', () => ({
  getBearerAppCoordinationToken: mocks.bearer,
  verifyAppCoordinationToken: () => ({
    ok: true,
    claims: {
      sub: 'user',
      target_app: 'yoola',
      scopes: ['external-projects:publish'],
    },
  }),
}));
vi.mock('@tuturuuu/auth/app-session', () => ({
  getAppSessionTokenFromRequest: mocks.sessionToken,
  verifyAppSessionRequest: () => ({
    ok: true,
    claims: { sub: 'user', target_app: 'cms' },
  }),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({}),
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'user' } }, error: null }),
    },
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
  normalizeWorkspaceId: async () => '11111111-1111-4111-8111-111111111111',
  verifyWorkspaceMembershipType: mocks.member,
}));
vi.mock('./binding-state', () => ({
  resolveWorkspaceExternalProjectBinding: mocks.binding,
  getDefaultCanonicalExternalProjectId: vi.fn(),
}));
vi.mock('./store', () => ({}));

import { requireWorkspaceExternalProjectAccess } from './access';

const request = new Request('https://example.com/studio');
beforeEach(() => {
  vi.clearAllMocks();
  mocks.permissions.mockResolvedValue({ containsPermission: () => false });
  mocks.member.mockResolvedValue({ ok: true, membershipType: 'MEMBER' });
  mocks.sessionToken.mockReturnValue(null);
  mocks.bearer.mockReturnValue(null);
});
describe.each(['app-session', 'app-token', 'cookie'])(
  'binding read order for %s',
  (transport) => {
    function run() {
      if (transport === 'app-session')
        mocks.sessionToken.mockReturnValue('session');
      if (transport === 'app-token') mocks.bearer.mockReturnValue('token');
      return requireWorkspaceExternalProjectAccess({
        request,
        wsId,
        mode: 'read',
      });
    }
    it('does not read a binding for a caller without the required permission', async () => {
      const access = await run();
      expect(access.ok).toBe(false);
      if (!access.ok) expect(access.response.status).toBe(403);
      expect(mocks.binding).not.toHaveBeenCalled();
    });
    it('does not read a binding after a permission lookup failure', async () => {
      const error = new Error('permission lookup failed');
      mocks.permissions.mockRejectedValueOnce(error);
      await expect(run()).rejects.toBe(error);
      expect(mocks.binding).not.toHaveBeenCalled();
    });
    if (transport !== 'cookie') {
      it('checks membership before reading the binding even with a granted permission', async () => {
        mocks.permissions.mockResolvedValue({ containsPermission: () => true });
        mocks.member.mockResolvedValue({
          ok: false,
          error: 'membership_missing',
        });
        const access = await run();
        expect(access.ok).toBe(false);
        if (!access.ok) expect(access.response.status).toBe(403);
        expect(mocks.binding).not.toHaveBeenCalled();
      });
    }
  }
);
