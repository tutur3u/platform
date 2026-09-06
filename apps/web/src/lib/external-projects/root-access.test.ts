import {
  CLI_APP_ACCESS_SCOPE,
  CLI_APP_TARGET_APP,
} from '@tuturuuu/auth/cli-session';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  permissions: vi.fn(),
  verify: vi.fn(),
  admin: vi.fn(),
}));
vi.mock('@/lib/api-auth', () => ({ resolveSessionAuthContext: mocks.session }));
vi.mock('@tuturuuu/auth/app-session', () => ({
  verifyAppSessionRequest: mocks.verify,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
}));

import {
  requireExternalControlPlaneAccess,
  verifyCmsOrCliSession,
} from './root-access';

const request = new Request('https://tuturuuu.com/api/v1/admin/external-apps');
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({
    ok: true,
    user: { id: 'verified-user' },
    supabase: {},
  });
  mocks.permissions.mockResolvedValue({ containsPermission: () => false });
  mocks.admin.mockResolvedValue({});
});
describe('external control plane sessions', () => {
  it('authenticates CLI access before checking root permissions and denies ordinary members', async () => {
    const result = await requireExternalControlPlaneAccess(request, 'apps');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.session).toHaveBeenCalledWith(request, {
      allowAppSessionAuth: [
        { targetApp: 'infra' },
        { targetApp: CLI_APP_TARGET_APP, requiredScope: CLI_APP_ACCESS_SCOPE },
      ],
    });
    expect(mocks.permissions).toHaveBeenCalledWith(
      expect.objectContaining({ user: { id: 'verified-user' } })
    );
  });
  it('preserves different Infrastructure and CMS permission gates', async () => {
    mocks.permissions.mockResolvedValue({
      containsPermission: (permission: string) =>
        permission === 'manage_external_projects',
    });
    expect((await requireExternalControlPlaneAccess(request, 'apps')).ok).toBe(
      false
    );
    expect(
      (await requireExternalControlPlaneAccess(request, 'projects')).ok
    ).toBe(true);
  });
  it('does not fall back to cookies when explicit session validation fails', async () => {
    mocks.session.mockResolvedValue({
      ok: false,
      response: Response.json({}, { status: 401 }),
    });
    const result = await requireExternalControlPlaneAccess(request, 'apps');
    expect(result.ok).toBe(false);
    expect(mocks.permissions).not.toHaveBeenCalled();
  });
  it('accepts CMS sessions unchanged and requires the CLI scope for CLI fallback', () => {
    const valid = { ok: true, claims: { sub: 'user' } };
    mocks.verify.mockReturnValueOnce(valid);
    expect(verifyCmsOrCliSession(request)).toBe(valid);
    expect(mocks.verify).toHaveBeenCalledTimes(1);
    mocks.verify.mockReturnValueOnce({ ok: false }).mockReturnValueOnce(valid);
    expect(verifyCmsOrCliSession(request)).toBe(valid);
    expect(mocks.verify).toHaveBeenLastCalledWith(request, {
      targetApp: CLI_APP_TARGET_APP,
      requiredScope: CLI_APP_ACCESS_SCOPE,
    });
  });
});
