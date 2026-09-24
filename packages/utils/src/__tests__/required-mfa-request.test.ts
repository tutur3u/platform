// @vitest-environment node
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppCoordinationToken } from '../app-coordination-token';
import { checkRequiredAccountMfa } from '../required-mfa-request';

const now = Math.floor(Date.now() / 1000);
const policy = {
  tuturuuu_required_mfa: { required: true, verifiedAfter: now - 30 },
};
const user = { id: 'actor', app_metadata: policy };
function fixture() {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'not', 'order', 'limit'])
    query[method] = vi.fn(() => query);
  query.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const getUser = vi.fn().mockResolvedValue({ data: { user }, error: null });
  const getClaims = vi.fn().mockResolvedValue({
    data: {
      claims: {
        sub: 'actor',
        aal: 'aal2',
        session_id: 'session',
        amr: [{ method: 'totp', timestamp: now - 10 }],
      },
    },
    error: null,
  });
  const getUserById = vi
    .fn()
    .mockResolvedValue({ data: { user }, error: null });
  const from = vi.fn(() => query);
  const dependencies = {
    createUserClient: vi.fn().mockResolvedValue({
      auth: { getUser, getClaims },
    } as unknown as TypedSupabaseClient),
    createAdminClient: vi.fn().mockResolvedValue({
      auth: { admin: { getUserById } },
      from,
      rpc: vi.fn().mockResolvedValue({ data: 'factor', error: null }),
    } as unknown as TypedSupabaseClient),
    nowSeconds: () => now,
  };
  const request = new Request('https://tuturuuu.com/api/v1/workspaces', {
    headers: { authorization: 'Bearer supabase-session' },
  });
  return {
    dependencies,
    request,
    getUser,
    getClaims,
    getUserById,
    query,
    from,
  };
}

beforeEach(() =>
  vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'required-mfa-test-secret')
);

describe('fresh account assurance', () => {
  it('allows current provider-verified MFA', async () => {
    const f = fixture();
    expect(
      await checkRequiredAccountMfa(f.request, f.dependencies, {
        userId: 'actor',
      })
    ).toEqual({
      status: 'allowed',
      userId: 'actor',
      proof: { sessionId: 'session', verifiedAt: now - 10, factorId: 'factor' },
    });
    expect(f.dependencies.createAdminClient).toHaveBeenCalled();
  });

  it('rejects assurance for a different resolved route principal', async () => {
    const f = fixture();
    expect(
      await checkRequiredAccountMfa(f.request, f.dependencies, {
        userId: 'another-actor',
      })
    ).toEqual({ status: 'invalid' });
  });

  it('does not fetch claims for an account without the policy', async () => {
    const f = fixture();
    f.getUser.mockResolvedValue({
      data: { user: { ...user, app_metadata: {} } },
      error: null,
    });
    expect(
      (
        await checkRequiredAccountMfa(f.request, f.dependencies, {
          userId: 'actor',
        })
      ).status
    ).toBe('allowed');
    expect(f.getClaims).not.toHaveBeenCalled();
  });

  it('ignores user-controlled metadata', async () => {
    const f = fixture();
    f.getUser.mockResolvedValue({
      data: {
        user: {
          ...user,
          user_metadata: { tuturuuu_required_mfa: { required: false } },
        },
      },
      error: null,
    });
    f.getClaims.mockResolvedValue({
      data: { claims: { sub: 'actor', aal: 'aal1', session_id: 'session' } },
      error: null,
    });
    expect(
      (
        await checkRequiredAccountMfa(f.request, f.dependencies, {
          userId: 'actor',
        })
      ).status
    ).toBe('required');
  });

  it.each([
    { aal: 'aal1', amr: [{ method: 'password', timestamp: now }] },
    { aal: 'aal2', amr: [{ method: 'totp', timestamp: now - 30 }] },
    { aal: 'aal2', amr: [{ method: 'totp', timestamp: now + 10 }] },
    { aal: 'aal2', amr: [{ method: 'totp', timestamp: now - 100 }], iat: now },
  ])('rejects stale, absent and future proof %j', async (claims) => {
    const f = fixture();
    f.getClaims.mockResolvedValue({
      data: { claims: { sub: 'actor', session_id: 'session', ...claims } },
      error: null,
    });
    expect(
      (
        await checkRequiredAccountMfa(f.request, f.dependencies, {
          userId: 'actor',
        })
      ).status
    ).toBe('required');
  });

  it('rejects claims for a different actor', async () => {
    const f = fixture();
    f.getClaims.mockResolvedValue({
      data: { claims: { sub: 'another-user' } },
      error: null,
    });
    expect(
      (
        await checkRequiredAccountMfa(f.request, f.dependencies, {
          userId: 'actor',
        })
      ).status
    ).toBe('invalid');
  });

  it('fails closed when fresh identity lookup throws', async () => {
    const f = fixture();
    f.getUser.mockRejectedValue(new Error('offline'));
    expect(
      (
        await checkRequiredAccountMfa(f.request, f.dependencies, {
          userId: 'actor',
        })
      ).status
    ).toBe('unavailable');
  });

  it('rechecks changed policy for an already signed app token', async () => {
    const f = fixture();
    const { token } = createAppCoordinationToken({
      userId: 'actor',
      targetApp: 'mail',
      mfa: { factorId: 'factor', sessionId: 'session', verifiedAt: now - 10 },
    });
    const request = new Request(f.request.url, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(
      (
        await checkRequiredAccountMfa(request, f.dependencies, {
          userId: 'actor',
          appToken: token,
        })
      ).status
    ).toBe('allowed');
    f.getUserById.mockResolvedValue({
      data: {
        user: {
          ...user,
          app_metadata: {
            tuturuuu_required_mfa: { required: true, verifiedAfter: now },
          },
        },
      },
      error: null,
    });
    expect(
      (
        await checkRequiredAccountMfa(request, f.dependencies, {
          userId: 'actor',
          appToken: token,
        })
      ).status
    ).toBe('required');
    expect(f.getUserById).toHaveBeenCalledTimes(2);
    expect(f.from).not.toHaveBeenCalled();
    expect(f.dependencies.createUserClient).not.toHaveBeenCalled();
  });

  it('does not accept an app token with no MFA evidence', async () => {
    const f = fixture();
    const { token } = createAppCoordinationToken({
      userId: 'actor',
      targetApp: 'mail',
    });
    const request = new Request(f.request.url, {
      headers: { cookie: `tuturuuu_app_session=${token}` },
    });
    expect(
      (
        await checkRequiredAccountMfa(request, f.dependencies, {
          userId: 'actor',
          appToken: token,
        })
      ).status
    ).toBe('required');
  });

  it('does not trust an invalid app token', async () => {
    const f = fixture();
    const token = 'ttr_app_invalid';
    const request = new Request(f.request.url, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(
      (
        await checkRequiredAccountMfa(request, f.dependencies, {
          userId: 'actor',
          appToken: token,
        })
      ).status
    ).toBe('invalid');
    expect(f.dependencies.createAdminClient).not.toHaveBeenCalled();
  });

  it('scopes mobile approval lookup to the exact actor and session', async () => {
    const f = fixture();
    f.getClaims.mockResolvedValue({
      data: { claims: { sub: 'actor', aal: 'aal1', session_id: 'session' } },
      error: null,
    });
    f.query.maybeSingle!.mockResolvedValue({
      data: {
        approved_at: new Date((now - 5) * 1000).toISOString(),
        approval_metadata: {
          requiredMfaProof: {
            sessionId: 'source-session',
            factorId: 'factor',
            verifiedAt: now - 5,
          },
          mobileMfaValidUntil: new Date((now + 60) * 1000).toISOString(),
        },
      },
      error: null,
    });
    expect(
      (
        await checkRequiredAccountMfa(f.request, f.dependencies, {
          userId: 'actor',
        })
      ).status
    ).toBe('allowed');
    expect(f.query.eq).toHaveBeenCalledWith('approver_user_id', 'actor');
    expect(f.query.eq).toHaveBeenCalledWith(
      'request_metadata->>requesterSessionId',
      'session'
    );
    expect(f.query.eq).toHaveBeenCalledWith(
      'approval_metadata->>approverSessionId',
      'session'
    );
    expect(f.query.not).toHaveBeenCalledWith('consumed_at', 'is', null);
  });

  it.each(['invalid', new Date((now - 1) * 1000).toISOString()])(
    'rejects unusable mobile approval expiry %s',
    async (expiry) => {
      const f = fixture();
      f.getClaims.mockResolvedValue({
        data: { claims: { sub: 'actor', aal: 'aal1', session_id: 'session' } },
        error: null,
      });
      f.query.maybeSingle!.mockResolvedValue({
        data: {
          approved_at: new Date((now - 5) * 1000).toISOString(),
          approval_metadata: { mobileMfaValidUntil: expiry },
        },
        error: null,
      });
      expect(
        (
          await checkRequiredAccountMfa(f.request, f.dependencies, {
            userId: 'actor',
          })
        ).status
      ).toBe('required');
    }
  );
  it('keeps mobile proof precision consistent with signed integer timestamps', async () => {
    const f = fixture();
    f.getClaims.mockResolvedValue({
      data: { claims: { sub: 'actor', aal: 'aal1', session_id: 'session' } },
      error: null,
    });
    f.query.maybeSingle!.mockResolvedValue({
      data: {
        approved_at: new Date((now - 30) * 1000 + 500).toISOString(),
        approval_metadata: {
          requiredMfaProof: {
            sessionId: 'source-session',
            factorId: 'factor',
            verifiedAt: now - 5,
          },
          mobileMfaValidUntil: new Date((now + 60) * 1000).toISOString(),
        },
      },
      error: null,
    });
    expect(
      (
        await checkRequiredAccountMfa(f.request, f.dependencies, {
          userId: 'actor',
        })
      ).status
    ).toBe('required');
  });
});
