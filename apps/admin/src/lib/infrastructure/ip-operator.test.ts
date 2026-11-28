import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  verify: vi.fn(),
  lookup: vi.fn(),
  permissions: vi.fn(),
  bind: vi.fn(),
}));

vi.mock('@tuturuuu/auth/cli-session', () => ({
  verifyCliAccessToken: mock.verify,
}));
vi.mock('@tuturuuu/auth/app-session', () => ({
  getAppSessionClaimsFromRequest: () => null,
}));
vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  resolveSatelliteRequestActor: () => null,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => ({ auth: { admin: { getUserById: mock.lookup } } }),
}));
vi.mock('@tuturuuu/utils/required-mfa-lineage', () => ({
  bindCurrentMfaFactor: mock.bind,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mock.permissions,
}));
vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  getUpstashRestRedisClient: () => ({
    incrRateWindow: () => ({ n: 1, ttlMs: 60000 }),
  }),
}));

import { authorizeIpOperator } from './ip-operator';

const request = new Request(
  'https://infrastructure.example/api/v1/infrastructure/blocked-ips',
  {
    headers: { authorization: 'Bearer ttr_app_fixture' },
  }
);
const actor = {
  id: 'staff-id',
  email: 'staff@tuturuuu.com',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  identities: [{ provider: 'email' }],
};
function grants(...allowed: string[]) {
  mock.permissions.mockResolvedValue({
    membershipType: 'MEMBER',
    containsPermission: (permission: string) => allowed.includes(permission),
  });
}

describe('infrastructure IP operator authorization', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mock.lookup.mockResolvedValue({ data: { user: actor }, error: null });
    const mfa = {
      sessionId: 'session',
      verifiedAt: Math.floor(Date.now() / 1000),
    };
    mock.verify.mockReturnValue({
      ok: true,
      claims: { origin_app: 'cli', sub: actor.id, email: actor.email, mfa },
    });
    mock.bind.mockImplementation(
      async (_db, _actor, proof, allowInitialBinding) =>
        allowInitialBinding || proof.factorId
          ? { ...proof, factorId: 'factor' }
          : null
    );
    grants('view_infrastructure', 'manage_workspace_roles');
  });

  it('refuses a signed bearer from an account whose current identity is not staff', async () => {
    mock.lookup.mockResolvedValue({
      data: { user: { ...actor, email: 'former@example.com' } },
      error: null,
    });
    const result = await authorizeIpOperator(request);
    expect(result.ok ? 200 : result.response.status).toBe(403);
    expect(mock.permissions).not.toHaveBeenCalled();
  });

  it('refuses reads without view permission', async () => {
    grants('manage_workspace_roles');
    const result = await authorizeIpOperator(request);
    expect(result.ok ? 200 : result.response.status).toBe(403);
  });

  it('allows a viewer to read and refuses mutations without manage permission', async () => {
    grants('view_infrastructure');
    expect((await authorizeIpOperator(request)).ok).toBe(true);
    const result = await authorizeIpOperator(request, true);
    expect(result.ok ? 200 : result.response.status).toBe(403);
  });

  it('binds fresh signed CLI MFA when account-wide MFA is optional', async () => {
    expect((await authorizeIpOperator(request, true)).ok).toBe(true);
    expect(mock.bind).toHaveBeenCalledWith(
      expect.anything(),
      actor.id,
      expect.not.objectContaining({ factorId: expect.anything() }),
      true
    );
  });

  it('requires a pinned factor in signed proofs under the account-wide policy', async () => {
    mock.lookup.mockResolvedValue({
      data: {
        user: {
          ...actor,
          app_metadata: {
            tuturuuu_required_mfa: { required: true, verifiedAfter: 0 },
          },
        },
      },
      error: null,
    });
    const result = await authorizeIpOperator(request, true);
    expect(result.ok ? 200 : result.response.status).toBe(403);
    expect(mock.bind).toHaveBeenCalledWith(
      expect.anything(),
      actor.id,
      expect.anything(),
      false
    );
  });

  it('requires a currently bound MFA factor for mutations', async () => {
    expect((await authorizeIpOperator(request, true)).ok).toBe(true);
    mock.bind.mockResolvedValue(null);
    const result = await authorizeIpOperator(request, true);
    expect(result.ok ? 200 : result.response.status).toBe(403);
  });
});
