import { generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it, vi } from 'vite-plus/test';
import { BudgetExhausted, ProviderError } from './collector';
import { githubCollector } from './github';
import {
  createGithubAppTokenSource,
  githubAppTokenSource,
  importGithubAppKey,
  parseGithubAppCredentials,
  privateKeyToPkcs8,
  signGithubAppJwt,
  TOKEN_REFRESH_MARGIN_MS,
} from './github-app-auth';

// Disposable key pair generated per test run; no real credential is used.
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PKCS1 = pair.privateKey.export({
  format: 'pem',
  type: 'pkcs1',
}) as string;
const PKCS8 = pair.privateKey.export({
  format: 'pem',
  type: 'pkcs8',
}) as string;
const T0 = Date.parse('2026-11-24T03:00:00Z');
const TOKEN = `ghs_${'a'.repeat(36)}`;

function decode(part: string) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

function verifies(jwt: string) {
  const [header, payload, signature] = jwt.split('.');
  return verify(
    'RSA-SHA256',
    Buffer.from(`${header}.${payload}`),
    pair.publicKey,
    Buffer.from(signature!, 'base64url')
  );
}

function setup(
  respond: (call: number) => Response = () =>
    Response.json(
      {
        expires_at: new Date(clock.now + 3_600_000).toISOString(),
        token: TOKEN,
      },
      { status: 201 }
    )
) {
  const requests: { auth: string | null; body: unknown; url: string }[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    requests.push({
      auth: new Headers(init?.headers).get('Authorization'),
      body: init?.body ? JSON.parse(String(init.body)) : null,
      url: String(input),
    });
    return respond(requests.length);
  });
  const deps = {
    deadline: Number.MAX_SAFE_INTEGER,
    fetch: fetchMock,
    now: () => clock.now,
  };
  return { deps, requests };
}

const clock = { now: T0 };
const credentials = {
  appId: '123456',
  installationId: '987654',
  privateKeyPem: PKCS1,
};

describe('GitHub App JWT', () => {
  it.each([
    ['PKCS#1', PKCS1],
    ['PKCS#8', PKCS8],
  ])('signs a verifiable RS256 JWT from a %s key', async (_, pem) => {
    const jwt = await signGithubAppJwt(
      '123456',
      await importGithubAppKey(pem),
      T0
    );
    const [header, payload] = jwt.split('.');
    expect(decode(header!)).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(decode(payload!)).toEqual({
      exp: T0 / 1000 + 540,
      iat: T0 / 1000 - 60,
      iss: '123456',
    });
    expect(verifies(jwt)).toBe(true);
  });

  it('wraps PKCS#1 into the same PKCS#8 bytes Node exports', () => {
    const der = pair.privateKey.export({ format: 'der', type: 'pkcs8' });
    expect(Buffer.from(privateKeyToPkcs8(PKCS1))).toEqual(Buffer.from(der));
  });

  it('rejects malformed keys without a provider request', async () => {
    await expect(
      importGithubAppKey(
        '-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----'
      )
    ).rejects.toBeInstanceOf(ProviderError);
    const { deps, requests } = setup();
    const source = createGithubAppTokenSource({
      ...credentials,
      privateKeyPem:
        '-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----',
    });
    await expect(source.mint(deps)).rejects.toBeInstanceOf(ProviderError);
    expect(requests).toHaveLength(0);
  });

  it('parses only a complete, well-formed configuration', () => {
    const env = {
      GITHUB_APP_ID: ' 123456 ',
      GITHUB_APP_INSTALLATION_ID: '987654',
      GITHUB_APP_PRIVATE_KEY: PKCS1.replace(/\n/g, '\\n'),
    };
    expect(parseGithubAppCredentials(env)).toEqual({
      appId: '123456',
      installationId: '987654',
      privateKeyPem: PKCS1.trim(),
    });
    expect(
      parseGithubAppCredentials({ ...env, GITHUB_APP_ID: 'abc' })
    ).toBeNull();
    expect(
      parseGithubAppCredentials({ ...env, GITHUB_APP_INSTALLATION_ID: '' })
    ).toBeNull();
    expect(
      parseGithubAppCredentials({ ...env, GITHUB_APP_PRIVATE_KEY: 'x' })
    ).toBeNull();
  });
});

describe('GitHub App installation token', () => {
  it('exchanges a JWT for a token down-scoped to platform Actions read', async () => {
    clock.now = T0;
    const { deps, requests } = setup();
    const source = createGithubAppTokenSource(credentials);
    expect(await source.mint(deps)).toBe(TOKEN);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe(
      'https://api.github.com/app/installations/987654/access_tokens'
    );
    expect(requests[0]!.body).toEqual({
      permissions: { actions: 'read', metadata: 'read' },
      repositories: ['platform'],
    });
    expect(verifies(requests[0]!.auth!.replace('Bearer ', ''))).toBe(true);
  });

  it('caches the token until five minutes before expiry, then refreshes', async () => {
    clock.now = T0;
    const { deps, requests } = setup();
    const source = createGithubAppTokenSource(credentials);
    expect(source.cached(clock.now)).toBeNull();
    await source.mint(deps);
    clock.now = T0 + 3_600_000 - TOKEN_REFRESH_MARGIN_MS - 1;
    expect(source.cached(clock.now)).toBe(TOKEN);
    clock.now += 1;
    expect(source.cached(clock.now)).toBeNull();
    await source.mint(deps);
    expect(requests).toHaveLength(2);
    source.invalidate();
    expect(source.cached(clock.now)).toBeNull();
  });

  it('shares one cache per installation across runs in an isolate', () => {
    expect(githubAppTokenSource(credentials)).toBe(
      githubAppTokenSource({ ...credentials })
    );
    expect(
      githubAppTokenSource({ ...credentials, installationId: '1' })
    ).not.toBe(githubAppTokenSource(credentials));
  });

  it.each([
    ['an HTTP error', () => new Response('bad credentials', { status: 401 })],
    ['rate limiting', () => new Response('slow down', { status: 429 })],
    [
      'a missing token',
      () =>
        Response.json({ expires_at: '2027-01-01T00:00:00Z' }, { status: 201 }),
    ],
    [
      'a malformed token',
      () =>
        Response.json(
          { expires_at: '2027-01-01T00:00:00Z', token: 'bad token' },
          { status: 201 }
        ),
    ],
    [
      'an expired token',
      () =>
        Response.json(
          { expires_at: '2026-01-01T00:00:00Z', token: TOKEN },
          { status: 201 }
        ),
    ],
    [
      'a redirect',
      () =>
        new Response(null, {
          headers: { Location: 'https://example.test' },
          status: 302,
        }),
    ],
  ])('fails closed and caches nothing on %s', async (_, respond) => {
    clock.now = T0;
    const { deps } = setup(respond);
    const source = createGithubAppTokenSource(credentials);
    await expect(source.mint(deps)).rejects.toBeInstanceOf(ProviderError);
    expect(source.cached(clock.now)).toBeNull();
  });
});

describe('GitHub collector with app auth', () => {
  const window = { since: T0 - 3_600_000, until: T0 - 3_600_000 + 15 * 60_000 };

  function collectorSetup(listing: () => Response) {
    clock.now = T0;
    const calls: string[] = [];
    const { deps } = setup((n) =>
      n === 1
        ? Response.json(
            {
              expires_at: new Date(T0 + 3_600_000).toISOString(),
              token: TOKEN,
            },
            { status: 201 }
          )
        : listing()
    );
    const source = createGithubAppTokenSource(credentials);
    const collector = githubCollector({
      ...deps,
      auth: { kind: 'app', source },
    });
    let budget = 4;
    const call = async <T>(request: () => Promise<T>) => {
      if (budget-- <= 0) throw new BudgetExhausted();
      calls.push('request');
      return request();
    };
    return { call, calls, collector, deps, source };
  }

  it('spends one budgeted request on the mint and lists with the token', async () => {
    const h = collectorSetup(() =>
      Response.json({ total_count: 0, workflow_runs: [] })
    );
    const result = await h.collector.collect(h.call, window);
    expect(result.truncated).toBe(false);
    expect(h.calls).toHaveLength(2);
    const fetches = vi.mocked(h.deps.fetch).mock.calls;
    expect(new Headers(fetches[1]![1]?.headers).get('Authorization')).toBe(
      `Bearer ${TOKEN}`
    );
  });

  it('drops the cached token when the listing is rejected', async () => {
    const h = collectorSetup(() => new Response('nope', { status: 401 }));
    await expect(h.collector.collect(h.call, window)).rejects.toBeInstanceOf(
      ProviderError
    );
    expect(h.source.cached(clock.now)).toBeNull();
  });
});
