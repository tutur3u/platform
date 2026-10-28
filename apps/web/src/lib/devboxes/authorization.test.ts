import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));
const mocks = vi.hoisted(() => ({
  sessionToken: vi.fn(),
  verify: vi.fn(),
  resolveSession: vi.fn(),
  identity: vi.fn(),
  permissions: vi.fn(),
  claims: vi.fn(),
  rpc: vi.fn(),
  getUser: vi.fn(),
  issue: vi.fn(),
}));
vi.mock('@tuturuuu/auth/app-session', () => ({
  getAppSessionTokenFromRequest: mocks.sessionToken,
  createAppSessionUser: (claims: { sub: string }) => ({ id: claims.sub }),
}));
vi.mock('@tuturuuu/auth/cli-session', () => ({
  verifyCliAccessToken: mocks.verify,
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveSession,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({ auth: { getClaims: mocks.claims } }),
  createAdminClient: async () => ({
    auth: { admin: { getUserById: mocks.getUser } },
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
}));
vi.mock('./identity-store', async (original) => ({
  ...(await original<typeof import('./identity-store')>()),
  resolveDevboxIdentity: mocks.identity,
  identityRpc: mocks.rpc,
  issueDevboxAccessToken: mocks.issue,
}));

import { DELETE as revoke } from '@/app/api/v1/devboxes/access-tokens/[tokenId]/route';
import {
  GET as listTokens,
  POST as mint,
} from '@/app/api/v1/devboxes/access-tokens/route';
import { POST as accept } from '@/app/api/v1/devboxes/grant/accept/route';
import { requireDevboxActor } from './authorization';

const userId = '11111111-1111-4111-8111-111111111111';
const tokenId = '22222222-2222-4222-8222-222222222222';
const accessToken = `tdba_${'a'.repeat(64)}`;
const now = () => Math.floor(Date.now() / 1000);
const identity = () => ({
  enabled: true,
  grant: {
    revoked_at: null,
    suspended: false,
    id: '33333333-3333-4333-8333-333333333333',
    user_id: userId,
    status: 'active',
    accepted_at: new Date(Date.now() - 120000).toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    sessions_not_before: new Date(Date.now() - 120000).toISOString(),
    require_mfa: true,
  },
  token: {
    id: tokenId,
    user_id: userId,
    grant_id: '33333333-3333-4333-8333-333333333333',
    scopes: ['devbox:read', 'devbox:run'],
  },
});
const request = (
  path = '/runs',
  method = 'GET',
  headers: Record<string, string> = {},
  body?: unknown
) =>
  new Request(`https://example.test/api/v1/devboxes${path}`, {
    method,
    headers: {
      ...headers,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.sessionToken.mockReturnValue(null);
  mocks.permissions.mockResolvedValue({ membershipType: 'GUEST' });
  mocks.resolveSession.mockResolvedValue({ user: { id: userId } });
  mocks.claims.mockImplementation(async () => ({
    data: {
      claims: {
        sub: userId,
        iat: now(),
        aal: 'aal2',
        session_id: 'web-session',
        amr: [
          { method: 'password', timestamp: now() },
          { method: 'totp', timestamp: now() },
        ],
      },
    },
  }));
  mocks.identity.mockImplementation(async () => identity());
  mocks.getUser.mockResolvedValue({
    data: { user: { id: userId } },
    error: null,
  });
  mocks.rpc.mockResolvedValue(true);
  mocks.issue.mockResolvedValue({ id: tokenId, token: accessToken });
});
describe('devbox web credential matrix', () => {
  it('anonymous is 401', async () => {
    mocks.resolveSession.mockResolvedValue({ user: null });
    const req = request('/runs', 'POST', {}, { command: ['true'] });
    const clone = vi.spyOn(req, 'clone');
    const result = await requireDevboxActor(req);
    expect(result.ok || result.response.status).toBe(401);
    expect(clone).not.toHaveBeenCalled();
  });
  it('agent read is personal before any root membership lookup', async () => {
    mocks.permissions.mockResolvedValue({ membershipType: 'MEMBER' });
    const result = await requireDevboxActor(
      request('/runs', 'GET', { 'X-Devbox-Access-Token': accessToken })
    );
    expect(result).toMatchObject({
      ok: true,
      actor: { kind: 'personal', tokenId },
    });
    expect(mocks.permissions).not.toHaveBeenCalled();
  });
  it.each(['POST', 'GET'])(
    'agent never gets fleet authority (%s)',
    async (method) => {
      const result = await requireDevboxActor(
        request('/agents/register', method, {
          'X-Devbox-Access-Token': accessToken,
        })
      );
      expect(result.ok || result.response.status).toBe(403);
      expect(mocks.permissions).not.toHaveBeenCalled();
    }
  );
  it.each([null, { ...identity(), token: null }])(
    'invalid/revoked token is 401 even for root owner',
    async (value) => {
      mocks.identity.mockResolvedValue(value);
      const result = await requireDevboxActor(
        request('/runs', 'GET', { 'X-Devbox-Access-Token': accessToken })
      );
      expect(result.ok || result.response.status).toBe(401);
      expect(mocks.permissions).not.toHaveBeenCalled();
    }
  );
  it.each(['pending', 'revoked', 'suspended'])(
    'rejects %s grant',
    async (status) => {
      const value = identity();
      value.grant.status = status;
      mocks.identity.mockResolvedValue(value);
      const result = await requireDevboxActor(
        request('/runs', 'GET', { 'X-Devbox-Access-Token': accessToken })
      );
      expect(result.ok || result.response.status).toBe(403);
    }
  );
  it('unknown or undeployed grant data fails closed', async () => {
    mocks.identity.mockResolvedValue(null);
    expect((await listTokens(request('/access-tokens'))).status).toBe(403);
  });
  it('rejects expired grant and disabled switch', async () => {
    const value = identity();
    value.grant.expires_at = '2000-01-01T00:00:00Z';
    mocks.identity.mockResolvedValue(value);
    expect((await listTokens(request('/access-tokens'))).status).toBe(403);
    mocks.identity.mockResolvedValue({ ...identity(), enabled: false });
    expect((await listTokens(request('/access-tokens'))).status).toBe(403);
  });
  it('runner tokens never authenticate a user', async () => {
    const result = await requireDevboxActor(
      request('/runs', 'GET', {
        'X-Devbox-Runner-Token': `tdbx_${'a'.repeat(64)}`,
      })
    );
    expect(result.ok || result.response.status).toBe(401);
    expect(mocks.permissions).not.toHaveBeenCalled();
  });
  it('rejects ambiguous agent plus CLI credentials', async () => {
    mocks.sessionToken.mockReturnValue('cli-session');
    const result = await requireDevboxActor(
      request('/runs', 'GET', { 'X-Devbox-Access-Token': accessToken })
    );
    expect(result.ok || result.response.status).toBe(400);
  });
  it('root session behavior is unchanged and requires no identity storage', async () => {
    mocks.permissions.mockResolvedValue({ membershipType: 'MEMBER' });
    const result = await requireDevboxActor(request('/runs', 'POST'));
    expect(result).toMatchObject({ ok: true, actor: { kind: 'fleet' } });
    expect(mocks.identity).not.toHaveBeenCalled();
  });
});
describe('acceptance and token routes', () => {
  it('accepts only the authenticated subject, ignoring any supplied user id/email', async () => {
    const value = identity();
    value.grant.status = 'pending';
    value.enabled = false;
    mocks.identity.mockResolvedValue(value);
    expect(
      (
        await accept(
          request(
            '/grant/accept',
            'POST',
            {},
            { userId: 'attacker', email: 'forged@example.invalid' }
          )
        )
      ).status
    ).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('accept_devbox_personal_grant', {
      p_user_id: userId,
    });
  });
  it('another signed-in user cannot accept the bound grant', async () => {
    mocks.resolveSession.mockResolvedValue({ user: { id: 'other-user' } });
    expect((await accept(request('/grant/accept', 'POST'))).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('mint requires recent step-up and MFA', async () => {
    mocks.claims.mockResolvedValue({
      data: {
        claims: {
          sub: userId,
          iat: now(),
          aal: 'aal1',
          amr: [{ method: 'password', timestamp: now() - 1000 }],
        },
      },
    });
    expect(
      (
        await mint(
          request(
            '/access-tokens',
            'POST',
            {},
            { label: 'agent', scopes: ['devbox:run'] }
          )
        )
      ).status
    ).toBe(403);
    expect(mocks.issue).not.toHaveBeenCalled();
  });
  it('web refresh time cannot replace primary authentication', async () => {
    mocks.claims.mockResolvedValue({
      data: {
        claims: {
          sub: userId,
          iat: now(),
          aal: 'aal2',
          session_id: 'web-session',
          amr: [
            { method: 'password', timestamp: now() - 1000 },
            { method: 'token_refresh', timestamp: now() },
          ],
        },
      },
    });
    expect(
      (
        await mint(
          request(
            '/access-tokens',
            'POST',
            {},
            { label: 'agent', scopes: ['devbox:run'] }
          )
        )
      ).status
    ).toBe(403);
  });
  it('mints a seven-day default token with no-store', async () => {
    const response = await mint(
      request(
        '/access-tokens',
        'POST',
        {},
        { label: 'agent', scopes: ['devbox:run'] }
      )
    );
    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.issue).toHaveBeenCalledWith(
      userId,
      expect.any(Number),
      {
        label: 'agent',
        scopes: ['devbox:run'],
        expiresInDays: 7,
      },
      false
    );
  });
  it('cannot mint from a pre-cutoff CLI session', async () => {
    mocks.sessionToken.mockReturnValue('cli-session');
    mocks.verify.mockResolvedValue(undefined);
    mocks.verify.mockReturnValue({
      ok: true,
      claims: {
        sub: userId,
        iat: now() - 200,
        auth_time: now() - 200,
        mfa: { verifiedAt: now(), sessionId: 's' },
      },
    });
    expect(
      (
        await mint(
          request(
            '/access-tokens',
            'POST',
            {},
            { label: 'agent', scopes: ['devbox:run'] }
          )
        )
      ).status
    ).toBe(403);
    expect(mocks.issue).not.toHaveBeenCalled();
  });
  it('refresh iat cannot bypass original authentication cutoff', async () => {
    mocks.sessionToken.mockReturnValue('cli-session');
    mocks.verify.mockReturnValue({
      ok: true,
      claims: {
        sub: userId,
        iat: now(),
        auth_time: now(),
        mfa: { verifiedAt: now() - 200, sessionId: 's' },
      },
    });
    expect(
      (
        await mint(
          request(
            '/access-tokens',
            'POST',
            {},
            { label: 'agent', scopes: ['devbox:run'] }
          )
        )
      ).status
    ).toBe(403);
  });
  it.each(['/access-tokens', '/grant/accept', '/runs'])(
    'enforces CSRF despite global mode off: %s',
    async (path) => {
      vi.stubEnv('TTR_CSRF_MODE', 'off');
      const result = await requireDevboxActor(
        request(path, 'POST', {
          cookie: 'sb-example-auth-token=present',
          origin: 'https://attacker.test',
          'sec-fetch-site': 'cross-site',
        })
      );
      expect(result.ok || result.response.status).toBe(403);
      if (!result.ok)
        expect(await result.response.json()).toMatchObject({
          code: 'CSRF_REJECTED',
        });
    }
  );
  it('list and revoke are session subject scoped', async () => {
    const response = await listTokens(request('/access-tokens'));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('list_devbox_access_tokens', {
      p_user_id: userId,
    });
    const revoked = await revoke(
      request(`/access-tokens/${tokenId}`, 'DELETE'),
      { params: Promise.resolve({ tokenId }) }
    );
    expect(revoked.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('revoke_devbox_access_token', {
      p_id: tokenId,
      p_user_id: userId,
    });
  });
  it('agent credentials cannot mint or revoke tokens', async () => {
    expect(
      (
        await mint(
          request('/access-tokens', 'POST', {
            'X-Devbox-Access-Token': accessToken,
          })
        )
      ).status
    ).toBe(403);
    expect(
      (
        await revoke(
          request(`/access-tokens/${tokenId}`, 'DELETE', {
            'X-Devbox-Access-Token': accessToken,
          }),
          { params: Promise.resolve({ tokenId }) }
        )
      ).status
    ).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.issue).not.toHaveBeenCalled();
  });
});
