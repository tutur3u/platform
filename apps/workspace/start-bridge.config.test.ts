import { readFileSync } from 'node:fs';
import { NextResponse } from '@tuturuuu/start-bridge/next/server';
import {
  bridgeErrorResponse,
  createBridgeHandler,
} from '@tuturuuu/start-bridge/start/handler';
import { afterEach, describe, expect, it, vi } from 'vitest';
import config, {
  DEFAULT_WEB_API_ORIGIN,
  resolveWebApiOrigin,
  selectWorkspaceApiOrigin,
  WEB_API_HOSTS,
  type WorkspaceApiEnv,
} from './start-bridge.config';

describe('resolveWebApiOrigin', () => {
  it('keeps the production Web origin when INTERNAL_WEB_API_ORIGIN is unset', () => {
    expect(resolveWebApiOrigin({})).toBe(DEFAULT_WEB_API_ORIGIN);
    expect(DEFAULT_WEB_API_ORIGIN).toBe('https://tuturuuu.com');
  });

  it.each([
    ...WEB_API_HOSTS.map((host) => `https://${host}`),
    'https://tuturuuu.com/',
    'https://TUTURUUU.COM',
  ])('accepts the known Web origin %s', (origin) => {
    expect(resolveWebApiOrigin({ INTERNAL_WEB_API_ORIGIN: origin })).toBe(
      new URL(origin).origin
    );
  });

  it.each([
    ['plain http', 'http://tuturuuu.com'],
    ['a satellite host', 'https://workspace.tuturuuu.com'],
    ['a lookalike suffix', 'https://tuturuuu.com.evil.example'],
    ['a lookalike prefix', 'https://eviltuturuuu.com'],
    ['an attacker host', 'https://central.invalid'],
    ['a port', 'https://tuturuuu.com:8443'],
    ['credentials', 'https://user:pass@tuturuuu.com'],
    ['credentials hiding the host', 'https://tuturuuu.com@evil.example'],
    ['a path', 'https://tuturuuu.com/api'],
    ['a query', 'https://tuturuuu.com/?next=1'],
    ['a fragment', 'https://tuturuuu.com/#x'],
    ['an empty value', ''],
    ['a blank value', '   '],
    ['a non-URL', 'tuturuuu.com'],
    ['a loopback http origin', 'http://127.0.0.1:7803'],
    ['a default https port', 'https://tuturuuu.com:443'],
    ['an empty port', 'https://tuturuuu.com:'],
    ['an empty query', 'https://tuturuuu.com?'],
    ['an empty fragment', 'https://tuturuuu.com#'],
    ['a trailing dot', 'https://tuturuuu.com.'],
    ['surrounding whitespace', ' https://tuturuuu.com '],
    ['a trailing newline', 'https://tuturuuu.com\n'],
    ['a trailing slash run', 'https://tuturuuu.com//'],
    ['a backslash path', 'https://tuturuuu.com\\@evil.example'],
    ['a hyphenated lookalike', 'https://evil-tuturuuu.com'],
    ['a lookalike subdomain', 'https://tuturuuu.com.evil.test'],
    ['a lookalike userinfo', 'https://evil.test@tuturuuu.com'],
    ['a non-http scheme', 'ftp://tuturuuu.com'],
    ['a protocol-relative value', '//tuturuuu.com'],
  ])('fails closed on %s', (_label, origin) => {
    expect(() =>
      resolveWebApiOrigin({ INTERNAL_WEB_API_ORIGIN: origin })
    ).toThrow(/INTERNAL_WEB_API_ORIGIN/u);
  });

  it('admits an extra https Web host named in TUTURUUU_WEB_API_HOSTS', () => {
    const env = {
      INTERNAL_WEB_API_ORIGIN: 'https://web-staging.example.com',
      TUTURUUU_WEB_API_HOSTS: ' Web-Staging.Example.com , other.example.com ',
    };

    expect(resolveWebApiOrigin(env)).toBe('https://web-staging.example.com');
    expect(
      resolveWebApiOrigin({
        ...env,
        INTERNAL_WEB_API_ORIGIN: 'https://other.example.com',
      })
    ).toBe('https://other.example.com');
  });

  it('keeps https mandatory and ignores malformed allowlist entries', () => {
    expect(() =>
      resolveWebApiOrigin({
        INTERNAL_WEB_API_ORIGIN: 'http://web-staging.example.com',
        TUTURUUU_WEB_API_HOSTS: 'web-staging.example.com',
      })
    ).toThrow(/INTERNAL_WEB_API_ORIGIN/u);
    for (const entry of [
      '*',
      '*.example.com',
      'localhost',
      'a b.example.com',
    ]) {
      expect(() =>
        resolveWebApiOrigin({
          INTERNAL_WEB_API_ORIGIN: 'https://evil.example.com',
          TUTURUUU_WEB_API_HOSTS: entry,
        })
      ).toThrow(/INTERNAL_WEB_API_ORIGIN/u);
    }
  });

  it('does not treat the allowlist as a way to reach an unlisted host', () => {
    expect(() =>
      resolveWebApiOrigin({
        INTERNAL_WEB_API_ORIGIN: 'https://evil.example.com',
        TUTURUUU_WEB_API_HOSTS: 'web-staging.example.com',
      })
    ).toThrow(/INTERNAL_WEB_API_ORIGIN/u);
  });
});

const worker = { waitUntil() {} };
const assets = { fetch: async () => new Response('asset') };

function handlerFor() {
  const page = vi.fn(async () => new Response('page'));
  const fetcher = vi.fn<typeof fetch>(async () => new Response('upstream'));
  vi.stubGlobal('fetch', fetcher);
  // The same origin wiring as cloudflare/worker.ts.
  const handler = createBridgeHandler<
    { ASSETS: typeof assets } & WorkspaceApiEnv,
    typeof worker
  >({
    mounts: {
      app: 'workspace',
      rootHosts: ['workspace.tuturuuu.com'],
      mountHosts: ['tuturuuu.com'],
      basePath: '/workspace',
      ...config.mounts,
    },
    proxy: async () => NextResponse.next(),
    start: { fetch: page },
    apiOrigin: config.apiOrigin,
    assets: (env) => env.ASSETS,
    centralApiOrigin: (env) => resolveWebApiOrigin(env),
  });
  return { handler, page, fetcher };
}

const request = (path: string) =>
  new Request(`https://workspace.tuturuuu.com${path}`);

afterEach(() => vi.unstubAllGlobals());

describe('web API origin on the Worker', () => {
  it('forwards /api to the canonical Web origin when unset', async () => {
    const { handler, fetcher } = handlerFor();

    const response = await handler(
      request('/api/v1/mobile/version'),
      { ASSETS: assets },
      worker
    );

    expect(response.status).toBe(200);
    expect(fetcher.mock.calls.map(([call]) => (call as Request).url)).toEqual([
      'https://tuturuuu.com/api/v1/mobile/version',
    ]);
  });

  it('forwards /api to an allowlisted staging Web origin', async () => {
    const { handler, fetcher } = handlerFor();

    await handler(
      request('/api/v1/mobile/version'),
      {
        ASSETS: assets,
        INTERNAL_WEB_API_ORIGIN: 'https://web.tutur3u.com',
      },
      worker
    );
    await handler(
      request('/api/v1/mobile/version'),
      {
        ASSETS: assets,
        INTERNAL_WEB_API_ORIGIN: 'https://web-extra.example.com',
        TUTURUUU_WEB_API_HOSTS: 'web-extra.example.com',
      },
      worker
    );

    expect(fetcher.mock.calls.map(([call]) => (call as Request).url)).toEqual([
      'https://web.tutur3u.com/api/v1/mobile/version',
      'https://web-extra.example.com/api/v1/mobile/version',
    ]);
  });

  it.each([
    ['an attacker origin', 'https://evil.example'],
    ['a blank value', ''],
    ['whitespace', '   '],
    ['a downgrade', 'http://tuturuuu.com'],
    ['a lookalike', 'https://tuturuuu.com.evil.test'],
    ['userinfo', 'https://tuturuuu.com@evil.test'],
    ['a port', 'https://tuturuuu.com:8443'],
    ['a path', 'https://tuturuuu.com/api'],
  ])(
    'refuses /api and pages and never forwards with %s',
    async (_label, origin) => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { handler, page, fetcher } = handlerFor();
      const env = { ASSETS: assets, INTERNAL_WEB_API_ORIGIN: origin };
      const refusal = await bridgeErrorResponse().text();

      for (const path of ['/api/v1/mobile/version', '/login']) {
        const response = await handler(request(path), env, worker);

        expect(response.status).toBe(500);
        expect(await response.text()).toBe(refusal);
      }

      expect(fetcher).not.toHaveBeenCalled();
      expect(page).not.toHaveBeenCalled();
      if (origin.trim())
        expect(String(logged.mock.calls)).not.toContain(origin.trim());
      logged.mockRestore();
    }
  );

  it('keeps the origin read behind the shared assertion in cloudflare/worker.ts', () => {
    const source = readFileSync(
      new URL('./cloudflare/worker.ts', import.meta.url),
      'utf8'
    );

    expect(source).toContain(
      'centralApiOrigin: (env) => resolveWebApiOrigin(env)'
    );
    expect(source).not.toMatch(/env\.INTERNAL_WEB_API_ORIGIN\s*\?\?/u);
    // The startup gate runs before the handler inside the failure boundary.
    const gate = source.indexOf('resolveWebApiOrigin(env);');
    const call = source.indexOf('await (await handler)(request, env, ctx)');
    expect(gate).toBeGreaterThan(source.indexOf('try {'));
    expect(gate).toBeLessThan(call);
    expect(source.slice(call)).toContain('bridgeErrorResponse()');
  });
});

describe('workspace start-bridge config', () => {
  it('resolves the /api forward origin through the same assertion', () => {
    const request = new Request('https://workspace.tuturuuu.com/api/v1/x');
    const context = { path: '/api/v1/x' };

    expect(config.apiOrigin).toBe(selectWorkspaceApiOrigin);
    expect(selectWorkspaceApiOrigin(request, { ...context, env: {} })).toBe(
      DEFAULT_WEB_API_ORIGIN
    );
    expect(() =>
      selectWorkspaceApiOrigin(request, {
        ...context,
        env: { INTERNAL_WEB_API_ORIGIN: 'https://central.invalid' },
      })
    ).toThrow(/INTERNAL_WEB_API_ORIGIN/u);
  });

  it('rejects unknown hosts instead of serving the canonical root', () => {
    expect(config.mounts?.unknownHost).toBe('reject');
  });
});
