import { afterEach, describe, expect, it, vi } from 'vitest';
import { manifest } from './manifest';
import { routeFamily, webRouteTable } from './web-route-table';
import { type CacheLike, createHandler, type Env } from './worker';

const LOCALES = manifest.locales;
const route = (path: string) => routeFamily(path, LOCALES);

/** A concrete URL for a route pattern (`[x]` → `sample`, catch-alls → `a/b`). */
function sampleUrl(pattern: string, optionalEmpty = false) {
  const parts = pattern
    .split('/')
    .filter(Boolean)
    .flatMap((part) => {
      if (/^\[\[\.\.\./u.test(part)) return optionalEmpty ? [] : ['a', 'b'];
      if (/^\[\.\.\./u.test(part)) return ['a', 'b'];
      if (/^\[/u.test(part)) return ['sample-id'];
      return [part];
    });
  return `/${parts.join('/')}`;
}

describe('vinext route table', () => {
  it('routes every app route entry back to its own family', () => {
    for (const entry of webRouteTable.routes) {
      const urls = [sampleUrl(entry.pattern)];
      if (entry.pattern.includes('[[...')) {
        urls.push(sampleUrl(entry.pattern, true));
      }
      for (const url of urls) {
        expect(route(url), `${entry.pattern} via ${url}`).toBe(entry.family);
        if (entry.localized) {
          const localized = url === '/' ? '/vi' : `/vi${url}`;
          expect(route(localized), `${entry.pattern} via ${localized}`).toBe(
            entry.family
          );
        }
      }
    }
  });

  it('names a binding and an asset prefix for every family, and a catch-all', () => {
    const ids = webRouteTable.families.map((family) => family.id);
    expect(ids).toEqual([
      'api-ops',
      'api-core',
      'public-auth',
      'dashboard-apps',
      'dashboard',
      'web-rest',
    ]);
    expect(webRouteTable.fallback).toBe('web-rest');
    for (const family of webRouteTable.families) {
      expect(family.binding).toBe(
        `WEB_FAMILY_${family.id.toUpperCase().replaceAll('-', '_')}`
      );
      expect(family.assetPrefix).toBe(`/_f/${family.id}`);
      expect(route(`/_f/${family.id}/_next/static/chunks/a.js`)).toBe(
        family.id
      );
    }
  });

  it('serves the OpenNext family deny list from api-ops', () => {
    for (const path of [
      '/api/v1/auth/accounts',
      '/api/v1/auth/accounts/switch',
      '/api/notifications/send-immediate',
      '/api/cron/process-notification-batches',
      '/api/v1/infrastructure/internal-accounts/employees',
      '/api/v1/devboxes/runs',
      '/api/v1/users/chatgpt',
      '/api/ai/chatgpt',
      '/api/ai/chatgpt/new',
    ]) {
      expect(route(path), path).toBe('api-ops');
    }
  });

  it('prefers static segments over workspace segments', () => {
    expect(route('/login')).toBe('public-auth');
    expect(route('/vi/login')).toBe('public-auth');
    expect(route('/')).toBe('public-auth');
    expect(route('/en')).toBe('public-auth');
    expect(route('/cite')).toBe('web-rest');
    expect(route('/integrations')).toBe('web-rest');
    expect(route('/vi/integrations')).toBe('web-rest');
    expect(route('/vi/integrations/settings')).toBe('dashboard');
    expect(route('/personal')).toBe('dashboard');
    expect(route('/vi/personal/settings')).toBe('dashboard');
    expect(route('/personal/tasks')).toBe('dashboard-apps');
    expect(route('/vi/personal/tasks/board/123')).toBe('dashboard-apps');
    expect(route('/api/v1/workspaces')).toBe('api-core');
    expect(route('/api/build-info')).toBe('api-core');
  });

  it('keeps framework and non-canonical paths on the catch-all', () => {
    for (const path of [
      '/_next/image',
      '/_vinext/image',
      '//api/cron',
      '/api\\cron',
    ]) {
      expect(route(path), path).toBe('web-rest');
    }
  });

  it('leaves assets that no vinext family builds with their own route', () => {
    for (const path of [
      '/_next/static/chunks/a.js',
      '/_next/static/css/app.css',
      '/_f/public-docs/_next/static/chunks/a.js',
      '/_f/unknown/x.js',
    ]) {
      expect(route(path), path).toBeNull();
    }
  });

  it('keeps unlisted paths with the family that owns their prefix', () => {
    expect(route('/api/cron/daily')).toBe('api-ops');
    expect(route('/api/v1/devboxes/anything/else')).toBe('api-ops');
    expect(route('/api/v1/unknown')).toBe('api-core');
    expect(route('/vi/legal/unknown')).toBe('public-auth');
    expect(route('/personal/tasks/unknown/deep')).toBe('dashboard-apps');
    // An unknown first segment is a workspace slug, as in the Next.js build.
    expect(route('/no/such/page')).toBe('dashboard');
  });

  it('matches unreserved percent-encodings like their decoded form', () => {
    expect(route('/api/cr%6Fn/daily')).toBe('api-ops');
    expect(route('/%6Cogin')).toBe('public-auth');
  });
});

class MemoryCache implements CacheLike {
  async match() {
    return undefined;
  }
  async put() {}
}

describe('vinext family dispatch', () => {
  afterEach(() => vi.unstubAllGlobals());

  function setup(flags: string, extra: Partial<Env> = {}) {
    const web = vi.fn(async (_input: Request) => new Response('web'));
    vi.stubGlobal('fetch', web);
    const calls: { family: string; path: string }[] = [];
    const bindings = Object.fromEntries(
      webRouteTable.families.map((family) => [
        family.binding,
        {
          fetch: async (request: Request) => {
            calls.push({
              family: family.id,
              path: new URL(request.url).pathname,
            });
            return new Response(family.id);
          },
        },
      ])
    );
    const env = {
      PUBLIC_HOST: 'tuturuuu.com',
      GATEWAY_WEB_FAMILIES: flags,
      ...bindings,
      ...extra,
    } as unknown as Env;
    const handle = createHandler({
      cache: () => new MemoryCache(),
      now: () => 0,
      manifest,
    });
    return {
      web,
      calls,
      call: (path: string, init?: RequestInit) =>
        handle(new Request(`https://tuturuuu.com${path}`, init), env),
    };
  }

  const ALL = webRouteTable.families.map((family) => family.id).join(',');

  it('serves every path from a family once every family is flagged', async () => {
    const { web, calls, call } = setup(ALL);
    for (const path of [
      '/',
      '/vi/login',
      '/pricing',
      '/personal/tasks',
      '/api/cron/daily',
      '/api/v1/workspaces',
      '/_f/public-auth/_next/static/chunks/a.js',
      '/no/such/page/anywhere',
    ]) {
      const response = await call(path);
      expect(response.headers.get('x-gateway-cache'), path).toBe('FAMILY');
    }
    expect(web).not.toHaveBeenCalled();
    expect(calls.find((entry) => entry.family === 'public-auth')?.path).toBe(
      '/'
    );
    expect(calls.map((entry) => entry.path)).toContain(
      '/_f/public-auth/_next/static/chunks/a.js'
    );
  });

  it('sends unprefixed Next assets to the web-rest fallback', async () => {
    const { web, calls, call } = setup(ALL);
    await call('/_next/static/chunks/app.js');
    await call('/_f/other-builder/a.js');
    expect(calls.map((entry) => entry.family)).toEqual([
      'web-rest',
      'web-rest',
    ]);
    expect(web).not.toHaveBeenCalled();
  });

  it('routes the flagged API families and sends the rest to web-rest', async () => {
    const { web, calls, call } = setup('api-ops,api-core');
    await call('/api/cron/daily', { method: 'POST' });
    await call('/api/v1/workspaces');
    await call('/vi/login');
    expect(calls.map((entry) => entry.family)).toEqual([
      'api-ops',
      'api-core',
      'web-rest',
    ]);
    expect(web).not.toHaveBeenCalled();
  });

  it('preserves verification proofs for a Mira mutation bound to API Core', async () => {
    const core = vi.fn(async (_request: Request) => new Response('api-core'));
    const { call } = setup('api-core', {
      WEB_FAMILY_API_CORE: { fetch: core },
    });
    const path = '/api/v1/workspaces/ws/chat/conversations/chat/messages';
    const headers = {
      authorization: 'Bearer fixture-only',
      'x-tuturuuu-mobile-client': 'fixture-mobile-proof',
      'x-tuturuuu-turnstile-token': 'fixture-turnstile-proof',
      'x-tuturuuu-app-base': '/untrusted',
    };
    const response = await call(path, { method: 'POST', headers });

    expect(response.headers.get('x-gateway-family')).toBe('api-core');
    expect(core).toHaveBeenCalledTimes(1);
    const sent = core.mock.calls[0]?.[0];
    expect(sent?.headers.get('authorization')).toBe(headers.authorization);
    expect(sent?.headers.get('x-tuturuuu-mobile-client')).toBe(
      headers['x-tuturuuu-mobile-client']
    );
    expect(sent?.headers.get('x-tuturuuu-turnstile-token')).toBe(
      headers['x-tuturuuu-turnstile-token']
    );
    expect(sent?.headers.has('x-tuturuuu-app-base')).toBe(false);

    await call(path, { headers });
    const read = core.mock.calls[1]?.[0];
    expect(read?.headers.has('x-tuturuuu-mobile-client')).toBe(false);
    expect(read?.headers.has('x-tuturuuu-turnstile-token')).toBe(false);
  });

  it('serves an unflagged path from web-rest with no family flagged', async () => {
    const { web, calls, call } = setup('');
    const response = await call('/personal/tasks');
    expect(response.headers.get('x-gateway-family')).toBe('web-rest');
    expect(calls).toEqual([{ family: 'web-rest', path: '/personal/tasks' }]);
    expect(web).not.toHaveBeenCalled();
  });

  it('answers 503 when the web-rest binding is missing', async () => {
    const { web, calls, call } = setup('api-ops', {
      WEB_FAMILY_WEB_REST: undefined,
    });
    const response = await call('/personal/tasks');
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('gateway web family unavailable');
    expect(calls).toHaveLength(0);
    expect(web).not.toHaveBeenCalled();
  });

  it('leaves marketing assets on a configured marketing origin', async () => {
    const { web, calls, call } = setup(ALL, {
      MARKETING_ORIGIN: 'https://marketing.example.workers.dev',
    } as Partial<Env>);
    await call('/assets/hero.png');
    expect(calls).toHaveLength(0);
    expect(new URL(web.mock.calls[0]?.[0].url as string).origin).toBe(
      'https://marketing.example.workers.dev'
    );
  });

  it('ignores GATEWAY_MODE=passthrough and a deprecated WEB_ORIGIN', async () => {
    const { web, calls, call } = setup(ALL, {
      GATEWAY_MODE: 'passthrough',
      WEB_ORIGIN: 'https://origin.tuturuuu.com',
    } as Partial<Env>);
    await call('/api/cron/daily');
    await call('/no/such/page');
    expect(calls).toHaveLength(2);
    expect(web).not.toHaveBeenCalled();
  });
});
