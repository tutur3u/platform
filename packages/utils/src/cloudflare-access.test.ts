// @vitest-environment node
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cloudflareAccessIssuer,
  stripCloudflareAccessCredentials,
  verifyCloudflareAccessRequest,
  withCloudflareAccessServiceToken,
} from './cloudflare-access';

const team = 'fixture-team.cloudflareaccess.com';
const audience = 'fixture-aud';
let signing: CryptoKey;
let other: CryptoKey;
let jwks: { keys: unknown[] };

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  signing = pair.privateKey;
  other = (await generateKeyPair('RS256')).privateKey;
  jwks = {
    keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' }],
  };
});
afterEach(() => vi.unstubAllGlobals());

function stubCerts() {
  const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === `https://${team}/cdn-cgi/access/certs`)
      return Response.json(jwks);
    return new Response('unexpected', { status: 599 });
  });
  vi.stubGlobal('fetch', fetchSpy);
  return fetchSpy;
}

async function token(
  options: { key?: CryptoKey; aud?: string; iss?: string; exp?: string } = {}
) {
  return new SignJWT({ email: 'staff@tuturuuu.com' })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuedAt()
    .setIssuer(options.iss ?? `https://${team}`)
    .setAudience(options.aud ?? audience)
    .setExpirationTime(options.exp ?? '5m')
    .sign(options.key ?? signing);
}

const request = (jwt?: string) =>
  new Request('https://calendar.staging.tutur3u.com/', {
    headers: jwt ? { 'cf-access-jwt-assertion': jwt } : {},
  });

describe('verifyCloudflareAccessRequest', () => {
  it('accepts an RS256 token from the team issuer for the app AUD', async () => {
    const fetchSpy = stubCerts();
    expect(
      await verifyCloudflareAccessRequest(request(await token()), {
        teamDomain: team,
        audience,
      })
    ).toBe(true);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it.each([
    ['missing header', async () => undefined],
    ['wrong key', async () => token({ key: other })],
    ['wrong audience', async () => token({ aud: 'other-aud' })],
    [
      'wrong issuer',
      async () => token({ iss: 'https://evil.cloudflareaccess.com' }),
    ],
    ['expired', async () => token({ exp: '-1m' })],
    ['garbage', async () => 'not.a.jwt'],
  ])('rejects %s', async (_label, make) => {
    stubCerts();
    expect(
      await verifyCloudflareAccessRequest(request(await make()), {
        teamDomain: team,
        audience,
      })
    ).toBe(false);
  });

  it('rejects an HS256 token even when it names the team issuer', async () => {
    stubCerts();
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer(`https://${team}`)
      .setAudience(audience)
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('x'.repeat(32)));
    expect(
      await verifyCloudflareAccessRequest(request(forged), {
        teamDomain: team,
        audience,
      })
    ).toBe(false);
  });

  it.each([
    [{ teamDomain: undefined, audience }],
    [{ teamDomain: team, audience: undefined }],
    [{ teamDomain: team, audience: ' ' }],
    [{ teamDomain: 'evil.example.com', audience }],
  ])('fails closed on configuration %j', async (config) => {
    const fetchSpy = stubCerts();
    expect(
      await verifyCloudflareAccessRequest(request(await token()), config)
    ).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('cloudflareAccessIssuer', () => {
  it.each([
    'fixture-team.cloudflareaccess.com.evil.invalid',
    'a.b.cloudflareaccess.com',
    'fixture-team.cloudflareaccess.com:444',
    'fixture-team.cloudflareaccess.com/path',
    'user@fixture-team.cloudflareaccess.com',
    'FIXTURE-team.cloudflareaccess.com',
  ])('rejects %s', (value) => {
    expect(cloudflareAccessIssuer(value)).toBeNull();
  });
  it('accepts an exact team host', () => {
    expect(cloudflareAccessIssuer(team)?.origin).toBe(`https://${team}`);
  });
});

describe('stripCloudflareAccessCredentials', () => {
  it('removes Access headers and cookies by exact parsed name', () => {
    const headers = stripCloudflareAccessCredentials(
      new Headers({
        'Cf-Access-Jwt-Assertion': 'a',
        'CF-ACCESS-AUTHENTICATED-USER-EMAIL': 'b',
        'cf-access-client-id': 'c',
        'cf-access-client-secret': 'd',
        'cf-access-other': 'kept',
        cookie:
          ' CF_Authorization=a;CF_AppSession=b; CF_Binding=c; CF_AuthorizationX=kept; sb=1',
      })
    );
    expect([...headers.keys()].sort()).toEqual(['cf-access-other', 'cookie']);
    expect(headers.get('cookie')).toBe('CF_AuthorizationX=kept; sb=1');
  });
  it('drops an empty cookie header', () => {
    const headers = stripCloudflareAccessCredentials(
      new Headers({ cookie: 'CF_Authorization=a' })
    );
    expect(headers.has('cookie')).toBe(false);
  });
});

describe('withCloudflareAccessServiceToken', () => {
  const issuer = 'https://tutur3u.com';
  const credentials = { clientId: 'id', clientSecret: 'secret' };
  it('requires an exact origin and a non-following redirect mode', () => {
    const ok = withCloudflareAccessServiceToken(
      new Request(`${issuer}/api`, { redirect: 'manual' }),
      issuer,
      credentials
    );
    expect(ok.ok && ok.request.headers.get('cf-access-client-id')).toBe('id');
    expect(
      withCloudflareAccessServiceToken(
        new Request(`${issuer}/api`),
        issuer,
        credentials
      )
    ).toEqual({ ok: false, reason: 'redirect' });
    expect(
      withCloudflareAccessServiceToken(
        new Request(`${issuer}.evil.invalid/api`, { redirect: 'manual' }),
        issuer,
        credentials
      )
    ).toEqual({ ok: false, reason: 'origin-mismatch' });
    expect(
      withCloudflareAccessServiceToken(
        new Request(`${issuer}/api`, { redirect: 'manual' }),
        `${issuer}/`,
        credentials
      )
    ).toEqual({ ok: false, reason: 'origin-mismatch' });
    expect(
      withCloudflareAccessServiceToken(
        new Request(`${issuer}/api`, { redirect: 'manual' }),
        issuer,
        { clientId: 'id' }
      )
    ).toEqual({ ok: false, reason: 'missing-token' });
  });
});
