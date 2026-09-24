import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppSessionToken } from '../app-session';
import {
  createCentralizedAuthProxy,
  refreshAppSessionForRequest,
} from './index';

const mocks = vi.hoisted(() => ({ getUserById: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    auth: { admin: { getUserById: mocks.getUserById } },
    rpc: async () => ({ data: 'factor', error: null }),
  }),
  createClient: vi.fn(),
}));
const now = Math.floor(Date.now() / 1000);
function request(verifiedAt?: number) {
  const token = createAppSessionToken({
    userId: 'actor',
    targetApp: 'infra',
    mfa:
      verifiedAt === undefined
        ? undefined
        : { sessionId: 'session', verifiedAt, factorId: 'factor' },
  }).token;
  return new NextRequest('https://infra.tuturuuu.com/workspaces', {
    headers: { authorization: `Bearer ${token}` },
  });
}
beforeEach(() => {
  vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'required-mfa-proxy-test');
  mocks.getUserById.mockResolvedValue({
    data: {
      user: {
        id: 'actor',
        app_metadata: {
          tuturuuu_required_mfa: { required: true, verifiedAfter: now - 30 },
        },
      },
    },
    error: null,
  });
});
describe('satellite app session required MFA integration', () => {
  it('blocks an existing app session after policy becomes required', async () => {
    expect(
      await refreshAppSessionForRequest(request(), { targetApp: 'infra' })
    ).toMatchObject({ ok: false, error: 'MFA required' });
  });
  it('accepts current proof, then rejects the same session after admin recovery', async () => {
    const req = request(now - 5);
    expect(
      await refreshAppSessionForRequest(req, { targetApp: 'infra' })
    ).toMatchObject({ ok: true });
    mocks.getUserById.mockResolvedValue({
      data: {
        user: {
          id: 'actor',
          app_metadata: {
            tuturuuu_required_mfa: { required: true, verifiedAfter: now },
          },
        },
      },
      error: null,
    });
    expect(
      await refreshAppSessionForRequest(req, { targetApp: 'infra' })
    ).toMatchObject({ ok: false, error: 'MFA required' });
  });
  it('does not impose MFA after an administrator makes policy optional', async () => {
    mocks.getUserById.mockResolvedValue({
      data: {
        user: {
          id: 'actor',
          app_metadata: {
            tuturuuu_required_mfa: { required: false },
          },
        },
      },
      error: null,
    });
    expect(
      await refreshAppSessionForRequest(request(), { targetApp: 'infra' })
    ).toMatchObject({ ok: true });
  });
});

const proxy = createCentralizedAuthProxy({
  webAppUrl: 'https://tuturuuu.com',
  appSession: { targetApp: 'infra' },
});
it('centralized satellite API preserves session and reports MFA_REQUIRED', async () => {
  const original = request();
  const response = await proxy(
    new NextRequest('https://infra.tuturuuu.com/api/accounts', {
      headers: original.headers,
    })
  );
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ code: 'MFA_REQUIRED' });
  expect(response.headers.get('set-cookie')).toBeNull();
});
it('centralized page routes to enrollment without clearing the authenticated session', async () => {
  const response = await proxy(request());
  expect(response.status).toBe(307);
  expect(response.headers.get('location')).toContain('/login?');
  expect(response.headers.get('location')).toContain('mfa=required');
  expect(response.headers.get('set-cookie')).toBeNull();
});
it('centralized page fails closed without a redirect loop during policy outage', async () => {
  mocks.getUserById.mockRejectedValueOnce(new Error('unavailable'));
  const response = await proxy(request());
  expect(response.status).toBe(503);
  expect(response.headers.get('location')).toBeNull();
  expect(response.headers.get('set-cookie')).toBeNull();
});
