import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Manifest, manifest } from './manifest';
import { FAMILY_PARITY_HEADERS, inSubtree, matchFamily } from './web-family';
import { type CacheLike, createHandler, type Env } from './worker';

class MemoryCache implements CacheLike {
  entries = new Map<string, Response>();
  async match(request: Request) {
    return this.entries.get(request.url)?.clone();
  }
  async put(request: Request, response: Response) {
    this.entries.set(request.url, response);
  }
}

const WEB_ORIGIN = 'https://web-origin.vercel.app';
const BASE_ENV: Env = { WEB_ORIGIN, PUBLIC_HOST: 'tuturuuu.com' };

type FamilyFetch = (request: Request) => Promise<Response>;

function setup(options: {
  flags?: string;
  bound?: boolean;
  mode?: string;
  family?: FamilyFetch;
  source?: Manifest;
}) {
  const cache = new MemoryCache();
  const web = vi.fn(async (_input: Request) => new Response('web'));
  vi.stubGlobal('fetch', web);
  const family = vi.fn(
    options.family ?? (async (_request: Request) => new Response('family'))
  );
  const env = {
    ...BASE_ENV,
    ...(options.flags === undefined
      ? {}
      : { GATEWAY_WEB_FAMILIES: options.flags }),
    ...(options.mode ? { GATEWAY_MODE: options.mode } : {}),
    ...(options.bound === false
      ? {}
      : { WEB_FAMILY_API_IDENTITY: { fetch: family } }),
  } as unknown as Env;
  const handle = createHandler({
    cache: () => cache,
    now: () => 0,
    manifest: options.source ?? manifest,
  });
  return {
    cache,
    web,
    family,
    call: (path: string, init?: RequestInit, host = 'tuturuuu.com') =>
      handle(new Request(`https://${host}${path}`, init), env),
  };
}

afterEach(() => vi.unstubAllGlobals());

const FAMILY_PATHS = [
  '/api/build-info',
  '/api/health',
  '/api/auth/me',
  '/api/v1/workspaces',
  '/api/v1/workspaces/limits',
  '/api/v1/workspaces/personal',
  '/api/workspaces/invitations',
  '/api/v1/notifications',
  '/api/v1/notifications/unread-count',
  '/api/v1/user/profile',
  '/api/v1/users/me/profile',
  '/api/v1/users/me/avatar/upload-url',
  '/api/v1/users/sessions',
];

const ALWAYS_WEB = [
  '/api/v1/auth/accounts',
  '/api/v1/auth/accounts/switch',
  '/api/cron/daily',
  '/api/notifications/send-immediate',
  '/api/v1/infrastructure/internal-accounts/run',
  '/api/v1/devboxes/abc',
  '/api/ai/chatgpt/new',
  '/_next/image',
  '/api/v1/users/chatgpt',
  '/api/v1/users/me/avatar/upload',
  '/api/v1/users/me/banner/upload',
  '/api/v1/users/me/playgrounds',
  '/api/v1/users/me/playgrounds/p1/preview/3000',
  '/api/v1/users/me/password',
  '/api/v1/users/me/password/reauth',
  '/api/v1/users/me/delete',
  '/api/v1/users/me/email',
  '/api/v1/users/me/identities/link/github',
  // Not owned by api-identity.
  '/api/v1/users',
  '/api/v1/workspaces/ws-1/tasks',
  '/api/v1/workspaces/limitsx',
  '/personal',
  '/',
];

describe('web family dispatch', () => {
  it('keeps every path on WEB_ORIGIN while the flag is empty or unset', async () => {
    for (const flags of [undefined, '', ' , ']) {
      const t = setup({ flags });
      const response = await t.call('/api/v1/users/me/profile');
      expect(await response.text()).toBe('web');
      expect(t.family).not.toHaveBeenCalled();
      expect(t.web.mock.calls[0]?.[0].url).toBe(
        `${WEB_ORIGIN}/api/v1/users/me/profile`
      );
    }
  });

  it.each(FAMILY_PATHS)(
    'serves %s from the flagged, bound family',
    async (path) => {
      const t = setup({ flags: 'api-identity' });
      const response = await t.call(`${path}?q=1`);
      expect(await response.text()).toBe('family');
      expect(response.headers.get('x-gateway-cache')).toBe('FAMILY');
      expect(response.headers.get('x-gateway-family')).toBe('api-identity');
      expect(t.web).not.toHaveBeenCalled();
      expect(t.family.mock.calls[0]?.[0].url).toBe(
        `https://tuturuuu.com${path}?q=1`
      );
    }
  );

  it.each(ALWAYS_WEB)(
    'keeps %s on WEB_ORIGIN with the family on',
    async (path) => {
      const t = setup({ flags: 'api-identity' });
      expect(await (await t.call(path)).text()).toBe('web');
      expect(t.family).not.toHaveBeenCalled();
    }
  );

  it('falls back to WEB_ORIGIN when the flagged family has no binding', async () => {
    const t = setup({ flags: 'api-identity', bound: false });
    expect(await (await t.call('/api/health')).text()).toBe('web');
  });

  it('rolls back by removing the id from the flag', async () => {
    const on = setup({ flags: 'other, api-identity' });
    expect(await (await on.call('/api/health')).text()).toBe('family');
    const off = setup({ flags: 'other' });
    expect(await (await off.call('/api/health')).text()).toBe('web');
    expect(off.family).not.toHaveBeenCalled();
  });

  it('disables every family in passthrough mode', async () => {
    const t = setup({ flags: 'api-identity', mode: 'passthrough' });
    const response = await t.call('/api/health');
    expect(await response.text()).toBe('web');
    expect(response.headers.get('x-gateway-cache')).toBe('PASSTHROUGH');
  });

  it('ignores other hosts and non-canonical paths', async () => {
    const t = setup({ flags: 'api-identity' });
    await t.call('/api/health', undefined, 'web-origin.vercel.app');
    for (const path of [
      '/api/v1/users/me/%70assword',
      '/api/v1/users//me/password',
      '/api/v1/auth/%61ccounts',
    ]) {
      await t.call(path);
    }
    expect(t.family).not.toHaveBeenCalled();
  });

  it('answers 502 when the family binding throws', async () => {
    const t = setup({
      flags: 'api-identity',
      family: async () => {
        throw new Error('down');
      },
    });
    const response = await t.call('/api/health');
    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(t.web).not.toHaveBeenCalled();
  });
});

describe('web family request hygiene', () => {
  it('strips client forwarding headers and states the public origin', async () => {
    const spoofed = [
      'x-forwarded-host',
      'x-forwarded-proto',
      'x-forwarded-for',
      'forwarded',
      'x-real-ip',
      'x-original-url',
      'x-rewrite-url',
      'x-middleware-subrequest',
      'x-nextjs-data',
      'x-tuturuuu-app-base',
      'x-gateway-test',
    ];
    let seen: Request | undefined;
    let body = '';
    const t = setup({
      flags: 'api-identity',
      family: async (request) => {
        seen = request;
        body = await request.text();
        return new Response('family');
      },
    });
    const headers = new Headers(
      spoofed.map((name) => [name, 'evil.example'] as [string, string])
    );
    headers.set('cf-connecting-ip', '192.0.2.1');
    headers.set('cookie', 'fixture_session=1');
    headers.set('authorization', 'Bearer fixture-only');
    headers.set('next-action', 'fixture-action');
    await t.call('/api/v1/users/me/profile', {
      method: 'PATCH',
      headers,
      body: '{"name":"fixture"}',
      redirect: 'manual',
    });
    expect(seen).toBeDefined();
    const sent = seen as Request;
    for (const name of spoofed.filter((n) => !n.startsWith('x-forwarded-'))) {
      expect(sent.headers.has(name), name).toBe(false);
    }
    expect(sent.headers.has('x-forwarded-for')).toBe(false);
    expect(sent.headers.get('x-forwarded-host')).toBe('tuturuuu.com');
    expect(sent.headers.get('x-forwarded-proto')).toBe('https');
    expect(sent.headers.get('x-gateway-hop')).toBe('1');
    expect(sent.headers.get('cf-connecting-ip')).toBe('192.0.2.1');
    expect(sent.headers.get('cookie')).toBe('fixture_session=1');
    expect(sent.headers.get('authorization')).toBe('Bearer fixture-only');
    expect(sent.headers.get('next-action')).toBe('fixture-action');
    expect(sent.method).toBe('PATCH');
    expect(sent.redirect).toBe('manual');
    expect(body).toBe('{"name":"fixture"}');
  });

  it('never caches family responses and returns Set-Cookie as sent', async () => {
    const t = setup({
      flags: 'api-identity',
      family: async () => {
        const headers = new Headers({ 'cache-control': 'public, max-age=60' });
        headers.append('set-cookie', 'a=1; Path=/; HttpOnly; Secure');
        headers.append('set-cookie', 'b=2; Path=/; SameSite=Lax');
        return new Response('family', { headers });
      },
    });
    for (let i = 0; i < 2; i += 1) {
      const response = await t.call('/api/health');
      expect(response.headers.get('x-gateway-cache')).toBe('FAMILY');
      expect(response.headers.get('cache-control')).toBe('public, max-age=60');
      expect(response.headers.getSetCookie()).toEqual([
        'a=1; Path=/; HttpOnly; Secure',
        'b=2; Path=/; SameSite=Lax',
      ]);
    }
    expect(t.family).toHaveBeenCalledTimes(2);
    expect(t.cache.entries.size).toBe(0);
  });
});

describe('web family security header parity', () => {
  it('pins the live Vercel values', () => {
    expect(FAMILY_PARITY_HEADERS).toEqual({
      'strict-transport-security': 'max-age=63072000',
      'referrer-policy': 'same-origin',
    });
  });

  it('fills missing headers and adds no Permissions-Policy', async () => {
    const t = setup({ flags: 'api-identity' });
    const response = await t.call('/api/health');
    expect(response.headers.get('strict-transport-security')).toBe(
      'max-age=63072000'
    );
    expect(response.headers.get('referrer-policy')).toBe('same-origin');
    expect(response.headers.has('permissions-policy')).toBe(false);
  });

  it('never overrides headers the family sends', async () => {
    const own = {
      'strict-transport-security': 'max-age=1',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "frame-ancestors 'none'",
      'x-frame-options': 'DENY',
      'permissions-policy': 'camera=()',
    };
    const t = setup({
      flags: 'api-identity',
      family: async () => new Response('family', { headers: own }),
    });
    const response = await t.call('/api/health');
    for (const [name, value] of Object.entries(own)) {
      expect(response.headers.get(name), name).toBe(value);
    }
  });
});

describe('web family matching', () => {
  const pagesFamily = {
    id: 'pages',
    binding: 'WEB_FAMILY_PAGES',
    localized: true,
    assetPrefix: '/_f/pages',
    exact: ['/billing'],
    prefix: ['/billing/'],
    exclude: ['/billing/export'],
  };

  it('strips the asset prefix and matches locale-prefixed paths', () => {
    const locales = ['en', 'vi'];
    expect(matchFamily('/_f/pages/_next/a.js', pagesFamily, locales)).toBe(
      '/_next/a.js'
    );
    expect(matchFamily('/vi/billing/plans', pagesFamily, locales)).toBe(
      '/vi/billing/plans'
    );
    expect(matchFamily('/fr/billing', pagesFamily, locales)).toBeNull();
    expect(matchFamily('/vi/billing/export', pagesFamily, locales)).toBeNull();
    expect(matchFamily('/_f/pagesx/a.js', pagesFamily, locales)).toBeNull();
  });

  it('lets the global deny list win over any family claim', async () => {
    const source: Manifest = {
      ...manifest,
      webFamilies: {
        deny: ['/api/v1/auth/accounts'],
        families: [
          {
            ...pagesFamily,
            id: 'api-identity',
            binding: 'WEB_FAMILY_API_IDENTITY',
            exact: ['/api/v1/auth/accounts'],
            prefix: ['/api/v1/auth/'],
            exclude: [],
          },
        ],
      },
    };
    const t = setup({ flags: 'api-identity', source });
    await t.call('/api/v1/auth/accounts');
    await t.call('/api/v1/auth/accounts/switch');
    expect(t.family).not.toHaveBeenCalled();
    expect(await (await t.call('/api/v1/auth/otp')).text()).toBe('family');
  });

  it('matches subtrees on segment boundaries', () => {
    expect(inSubtree('/a/b', '/a/b')).toBe(true);
    expect(inSubtree('/a/b/c', '/a/b')).toBe(true);
    expect(inSubtree('/a/b/c', '/a/b/')).toBe(true);
    expect(inSubtree('/a/bc', '/a/b')).toBe(false);
  });

  it('keeps the committed family table well formed', () => {
    const config = manifest.webFamilies;
    expect(config).toBeDefined();
    const ids = new Set<string>();
    for (const family of config?.families ?? []) {
      expect(ids.has(family.id), family.id).toBe(false);
      ids.add(family.id);
      expect(family.binding).toBe(
        `WEB_FAMILY_${family.id.replace(/-/gu, '_').toUpperCase()}`
      );
      for (const prefix of family.prefix)
        expect(prefix.endsWith('/')).toBe(true);
      for (const path of [...family.exact, ...family.prefix]) {
        expect(path.startsWith('/api/') || family.localized, path).toBe(true);
        for (const denied of config?.deny ?? []) {
          expect(inSubtree(path, denied), `${path} vs ${denied}`).toBe(false);
        }
      }
    }
    expect(config?.deny).toContain('/api/v1/auth/accounts');
  });
});
