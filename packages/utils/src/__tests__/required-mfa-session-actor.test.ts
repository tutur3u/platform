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
const providerCookie = (accessToken: string) =>
  `sb-project-auth-token=base64-${Buffer.from(
    JSON.stringify({ access_token: accessToken })
  ).toString('base64url')}`;
const appToken = (userId: string) =>
  createAppCoordinationToken({ userId, targetApp: 'web' }).token;

function setup() {
  const required = {
    tuturuuu_required_mfa: { required: true, verifiedAfter: now - 30 },
  };
  const user = (id: string) => ({
    id,
    app_metadata: id === 'mfa-required' ? required : {},
  });
  const getUser = vi.fn(async (token: string) =>
    token === 'eyJrevoked'
      ? { data: { user: null }, error: { code: 'session_not_found' } }
      : {
          data: {
            user: user(token === 'eyJrequired' ? 'mfa-required' : 'member'),
          },
          error: null,
        }
  );
  mocks.admin.mockResolvedValue({
    rpc: async () => ({ data: 'factor', error: null }),
    auth: {
      getUser,
      getClaims: async () => ({
        data: { claims: { sub: 'mfa-required', aal: 'aal1' } },
        error: null,
      }),
      admin: {
        getUserById: async (id: string) => ({ data: { user: user(id) } }),
      },
    },
  });
  return { getUser };
}

async function sessionActorOf(headers: HeadersInit) {
  const sessionActor = vi.fn();
  const bearerActor = vi.fn();
  const response = await enforceRequiredMfaRequest(
    new NextRequest('https://tuturuuu.com/api/v1/users/me/hidden-workspaces', {
      headers,
    }),
    bearerActor,
    { onVerifiedSessionActor: sessionActor }
  );
  return { response, sessionActor, bearerActor };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-session-actor-secret');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
});

describe('verified browser session actor', () => {
  it('reports the provider-verified user of a cookie-only browser request', async () => {
    const { getUser } = setup();
    const { response, sessionActor, bearerActor } = await sessionActorOf({
      cookie: providerCookie('eyJcookie'),
    });
    expect(response).toBeNull();
    expect(sessionActor).toHaveBeenCalledExactlyOnceWith('member');
    expect(bearerActor).not.toHaveBeenCalled();
    expect(getUser).toHaveBeenCalledExactlyOnceWith('eyJcookie');
  });

  it('reports one actor when the provider and app cookies agree', async () => {
    setup();
    const { sessionActor } = await sessionActorOf({
      cookie: `${providerCookie('eyJcookie')}; tuturuuu_web_app_session=${appToken('member')}`,
    });
    expect(sessionActor).toHaveBeenCalledExactlyOnceWith('member');
  });

  it('reports no actor when cookie credentials belong to different users', async () => {
    setup();
    const { response, sessionActor } = await sessionActorOf({
      cookie: `${providerCookie('eyJcookie')}; tuturuuu_web_app_session=${appToken('other-member')}`,
    });
    expect(response).toBeNull();
    expect(sessionActor).not.toHaveBeenCalled();
  });

  it('never reports a cookie actor for a request carrying an Authorization header', async () => {
    setup();
    for (const authorization of ['Bearer eyJcookie', 'Bearer machine-key']) {
      const { sessionActor } = await sessionActorOf({
        authorization,
        cookie: providerCookie('eyJcookie'),
      });
      expect(sessionActor).not.toHaveBeenCalled();
    }
  });

  it('rejects a decodable cookie whose session the provider revoked', async () => {
    setup();
    const { response, sessionActor } = await sessionActorOf({
      cookie: providerCookie('eyJrevoked'),
    });
    expect(response?.status).toBe(401);
    expect(sessionActor).not.toHaveBeenCalled();
  });

  it('reports no actor when the session fails required MFA', async () => {
    setup();
    const { response, sessionActor } = await sessionActorOf({
      cookie: providerCookie('eyJrequired'),
    });
    expect(response?.status).toBe(403);
    expect(sessionActor).not.toHaveBeenCalled();
  });

  it('reports nothing for a request without credentials', async () => {
    const { response, sessionActor } = await sessionActorOf({});
    expect(response).toBeNull();
    expect(sessionActor).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
