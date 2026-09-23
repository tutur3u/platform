// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppCoordinationToken } from '../app-coordination-token';
import { enforceRequiredMfaRequest } from '../required-mfa-runtime';

const mocks = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
const now = Math.floor(Date.now() / 1000);
function setup() {
  const user = {
    id: 'actor',
    app_metadata: {
      tuturuuu_required_mfa: { required: true, verifiedAfter: now - 30 },
    },
  };
  const getUserById = vi.fn(async (id: string) => ({
    data: { user: id === 'actor' ? user : { id, app_metadata: {} } },
    error: null,
  }));
  const getUser = vi.fn(async () => ({ data: { user }, error: null }));
  const getClaims = vi.fn(async () => ({
    data: { claims: { sub: 'actor', aal: 'aal1' } },
    error: null,
  }));
  mocks.admin.mockResolvedValue({
    rpc: async () => ({ data: 'factor', error: null }),
    auth: { getUser, getClaims, admin: { getUserById } },
  });
  return { getUser, getClaims, getUserById };
}
function request(headers: HeadersInit, path = '/api/v1/workspaces') {
  return new NextRequest(`https://tuturuuu.com${path}`, { headers });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-required-mfa-secret');
});
describe('connected required MFA request enforcement', () => {
  it('denies provider-authenticated AAL1 sessions with fresh required policy', async () => {
    setup();
    const response = await enforceRequiredMfaRequest(
      request({ authorization: 'Bearer eyJprovider' })
    );
    expect(response?.status).toBe(403);
    expect(await response?.json()).toMatchObject({ code: 'MFA_REQUIRED' });
  });
  it('does not borrow assurance from another cookie identity', async () => {
    setup();
    const optional = createAppCoordinationToken({
      userId: 'optional',
      targetApp: 'web',
    }).token;
    const required = createAppCoordinationToken({
      userId: 'actor',
      targetApp: 'infra',
    }).token;
    const response = await enforceRequiredMfaRequest(
      request({
        cookie: `tuturuuu_web_app_session=${optional}; tuturuuu_app_session=${required}`,
      })
    );
    expect(response?.status).toBe(403);
  });
  it('accepts a signed proof after the recovery boundary', async () => {
    setup();
    const token = createAppCoordinationToken({
      userId: 'actor',
      targetApp: 'infra',
      mfa: { factorId: 'factor', sessionId: 'session', verifiedAt: now - 5 },
    }).token;
    expect(
      await enforceRequiredMfaRequest(
        request({ authorization: `Bearer ${token}` })
      )
    ).toBeNull();
  });
  it('fails closed when current policy is unavailable', async () => {
    mocks.admin.mockRejectedValue(new Error('offline'));
    expect(
      (
        await enforceRequiredMfaRequest(
          request({ authorization: 'Bearer eyJprovider' })
        )
      )?.status
    ).toBe(503);
  });
  it('leaves independently authenticated machine requests to their own authentication', async () => {
    expect(
      await enforceRequiredMfaRequest(
        request({ authorization: 'Bearer machine-key' })
      )
    ).toBeNull();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('leaves recovery requests reachable for their own challenge validation', async () => {
    expect(
      await enforceRequiredMfaRequest(
        request(
          { authorization: 'Bearer eyJprovider' },
          '/api/v1/auth/mfa/devices'
        )
      )
    ).toBeNull();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
