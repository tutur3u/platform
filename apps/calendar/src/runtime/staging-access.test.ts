// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarWorkerEnvironment } from './worker-contract';

const token = {
  CF_ACCESS_CLIENT_ID: 'fixture-client.access',
  CF_ACCESS_CLIENT_SECRET: 'fixture-secret-value',
};
const env: CalendarWorkerEnvironment = {
  ASSETS: { fetch: async () => new Response('asset') },
  ...token,
};

async function load(profile: 'production' | 'staging') {
  vi.resetModules();
  vi.stubEnv('CALENDAR_DEPLOYMENT_PROFILE', profile);
  return import('./staging-access');
}

function forwarded(url: string, init: RequestInit = {}) {
  return new Request(url, {
    redirect: 'manual',
    ...init,
    headers: {
      cookie:
        'CF_Authorization=user-jwt; tuturuuu_app_session=s; CF_AppSession=a; CF_Binding=b; xCF_Authorization=kept',
      'cf-access-jwt-assertion': 'user-jwt',
      'cf-access-authenticated-user-email': 'staff@tuturuuu.com',
      'cf-access-client-id': 'client-supplied',
      'cf-access-client-secret': 'client-supplied',
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

const fetchSpy = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Calendar owner forwards and the Access service token', () => {
  it('attaches the service token only on the exact issuer origin', async () => {
    const { prepareOwnerRequest } = await load('staging');
    const prepared = prepareOwnerRequest(
      forwarded('https://web.tutur3u.com/api/v1/workspaces'),
      env
    );
    expect(prepared).toBeInstanceOf(Request);
    const request = prepared as Request;
    expect(request.headers.get('cf-access-client-id')).toBe(
      token.CF_ACCESS_CLIENT_ID
    );
    expect(request.headers.get('cf-access-client-secret')).toBe(
      token.CF_ACCESS_CLIENT_SECRET
    );
    expect(request.headers.get('cf-access-jwt-assertion')).toBeNull();
    expect(
      request.headers.get('cf-access-authenticated-user-email')
    ).toBeNull();
    expect(request.headers.get('cookie')).toBe(
      'tuturuuu_app_session=s; xCF_Authorization=kept'
    );
    expect(request.redirect).toBe('manual');
  });

  // V4: no prefix, suffix, scheme or port lookalike receives the token.
  it.each([
    'https://web.tutur3u.com.evil.invalid/api/x',
    'https://evil.web.tutur3u.com/api/x',
    'http://web.tutur3u.com/api/x',
    'https://web.tutur3u.com:8443/api/x',
    'https://tasks.tutur3u.com/api/x',
    'https://tuturuuu.com/api/x',
  ])('sends no token to %s', async (url) => {
    const { prepareOwnerRequest } = await load('staging');
    const request = prepareOwnerRequest(forwarded(url), env) as Request;
    expect(request).toBeInstanceOf(Request);
    expect(request.headers.get('cf-access-client-id')).toBeNull();
    expect(request.headers.get('cf-access-client-secret')).toBeNull();
    expect(request.headers.get('cf-access-jwt-assertion')).toBeNull();
    expect(request.headers.get('cookie')).toBe(
      'tuturuuu_app_session=s; xCF_Authorization=kept'
    );
  });

  it('refuses to attach the token to a redirect-following request', async () => {
    const { prepareOwnerRequest } = await load('staging');
    const result = prepareOwnerRequest(
      forwarded('https://web.tutur3u.com/api/x', {
        redirect: 'follow',
      }),
      env
    );
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(503);
  });

  it('fails closed without contacting the issuer when the token is missing', async () => {
    const { fetchOwner } = await load('staging');
    const response = await fetchOwner(
      forwarded('https://web.tutur3u.com/api/x'),
      { ASSETS: env.ASSETS, CF_ACCESS_CLIENT_ID: token.CF_ACCESS_CLIENT_ID }
    );
    expect(response.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // N18: an issuer redirect is returned, never followed with the token.
  it('returns an issuer redirect without following it', async () => {
    fetchSpy.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'https://evil.invalid/collect' },
      })
    );
    const { fetchOwner } = await load('staging');
    const response = await fetchOwner(
      forwarded('https://web.tutur3u.com/api/x'),
      env
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://evil.invalid/collect'
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const sent = fetchSpy.mock.calls[0]?.[0] as Request;
    expect(new URL(sent.url).origin).toBe('https://web.tutur3u.com');
    expect(sent.redirect).toBe('manual');
    expect(response.headers.get('cf-access-client-secret')).toBeNull();
  });

  it('production strips Access credentials and never adds a token', async () => {
    const { prepareOwnerRequest } = await load('production');
    const request = prepareOwnerRequest(
      forwarded('https://web.tutur3u.com/api/x'),
      env
    ) as Request;
    expect(request.headers.get('cf-access-client-id')).toBeNull();
    expect(request.headers.get('cf-access-client-secret')).toBeNull();
    expect(request.headers.get('cf-access-jwt-assertion')).toBeNull();
  });
});
