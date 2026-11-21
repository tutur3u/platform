import { isCsrfOriginAllowed } from 'next/dist/server/app-render/csrf-protection';
// @vitest-environment node
import { modifyRouteRegex } from 'next/dist/lib/redirect-status';
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';
import { matchHas } from 'next/dist/shared/lib/router/utils/prepare-destination';
import type { NextConfig } from 'next';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/plugin', () => ({
  default: () => (config: unknown) => config,
}));

// The real generator scans and rewrites public SEO files.
vi.mock('../../scripts/generate-public-seo-routes', () => ({
  generate: () => [],
}));

// Next applies every matching config header rule in order before the route
// handler runs; a later rule overwrites an earlier rule's key, and a handler
// cannot replace a header the config already set.
async function finalConfigHeaders(pathname: string, cookie?: string) {
  const { default: nextConfig } = await import('./next.config');
  const rules = (await nextConfig.headers?.()) ?? [];
  const headers = new Map<string, string>();

  for (const rule of rules) {
    // Mirrors buildCustomRoute in next/dist/server/lib/router-utils/filesystem.js.
    const match = getPathMatch(rule.source, {
      regexModifier: (regex) => modifyRouteRegex(regex),
      removeUnnamedParams: true,
      sensitive: false,
      strict: true,
    });
    if (match(pathname) === false) continue;
    const request = { headers: cookie ? { cookie } : {} };
    if (
      (rule.has || rule.missing) &&
      !matchHas(request as never, {}, rule.has, rule.missing)
    ) {
      continue;
    }

    for (const { key, value } of rule.headers) {
      headers.set(key.toLowerCase(), value);
    }
  }

  return headers;
}

describe('web next config headers', () => {
  it('serves the CLI login start route sandboxed despite the anti-framing default', async () => {
    const headers = await finalConfigHeaders('/api/cli/auth/start');

    expect(headers.get('content-security-policy')).toBe(
      "sandbox; default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"
    );
    expect(headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(headers.get('referrer-policy')).toBe('no-referrer');
    expect(headers.get('x-frame-options')).toBe('DENY');
  });

  it('keeps the plain anti-framing policy on other API routes', async () => {
    const headers = await finalConfigHeaders('/api/cli/auth/verify');

    expect(headers.get('content-security-policy')).toBe(
      "frame-ancestors 'none'"
    );
    expect(headers.has('cross-origin-opener-policy')).toBe(false);
  });

  it('does not match percent-encoded spellings, which the route handler refuses', async () => {
    const headers = await finalConfigHeaders('/api/cli/auth/%73tart');

    expect(headers.get('content-security-policy')).toBe(
      "frame-ancestors 'none'"
    );
  });
});

describe('locale-optional auth shell header sources', () => {
  it.each([
    '/login',
    '/en/login',
    '/vi/login',
    '/add-account',
    '/vi/add-account',
  ])('applies the auth shell headers to %s', async (pathname) => {
    const { default: nextConfig } = await import('./next.config');
    const rules = (await nextConfig.headers?.()) ?? [];
    const matched = rules.filter((rule) =>
      getPathMatch(rule.source, {
        regexModifier: (regex) => modifyRouteRegex(regex),
        removeUnnamedParams: true,
        sensitive: false,
        strict: true,
      })(pathname)
    );
    expect(matched.length).toBeGreaterThan(0);
  });

  it.each(['/sso/consent', '/en/sso/consent'])(
    'keeps %s uncacheable and unframeable',
    async (pathname) => {
      const headers = await finalConfigHeaders(pathname);
      expect(headers.get('cache-control')).toBe('no-store');
      expect(headers.get('x-frame-options')).toBe('DENY');
    }
  );

  it.each(['/en/vi/login', '/login/extra', '/en/sso/consent/x'])(
    'does not extend the auth shell sources to %s',
    async (pathname) => {
      const { default: nextConfig } = await import('./next.config');
      const matched = ((await nextConfig.headers?.()) ?? [])
        .filter((rule) =>
          /\/(login|add-account|sso\/consent)$/.test(rule.source)
        )
        .filter((rule) =>
          getPathMatch(rule.source, {
            regexModifier: (regex) => modifyRouteRegex(regex),
            removeUnnamedParams: true,
            sensitive: false,
            strict: true,
          })(pathname)
        );
      expect(matched).toEqual([]);
    }
  );

  it.each(['/login', '/vi/login', '/add-account'])(
    'shares the %s shell through the CDN only without a session cookie',
    async (pathname) => {
      const anonymous = await finalConfigHeaders(pathname, 'NEXT_LOCALE=vi');
      expect(anonymous.get('cdn-cache-control')).toContain('public');
      expect(anonymous.get('vercel-cdn-cache-control')).toContain('public');

      for (const cookie of [
        'sb-abcdefgh-auth-token=x',
        'NEXT_LOCALE=vi; sb-abcdefgh-auth-token.0=x',
        'tuturuuu_web_app_session=x',
        'NEXT_LOCALE=vi; tuturuuu_web_app_session_refresh=x',
      ]) {
        const signedIn = await finalConfigHeaders(pathname, cookie);
        expect(signedIn.get('cache-control')).toBe('private, no-store');
        expect(signedIn.get('cdn-cache-control')).toBe('no-store');
        expect(signedIn.get('vercel-cdn-cache-control')).toBe('no-store');
      }
    }
  );

  it('falls back to private when cookie conditions are ignored', async () => {
    const { default: nextConfig } = await import('./next.config');
    const loginRules = ((await nextConfig.headers?.()) ?? []).filter(
      (rule) => rule.source === '/:locale?/login'
    );
    expect(loginRules.at(-1)?.headers).toContainEqual({
      key: 'CDN-Cache-Control',
      value: 'no-store',
    });
  });

  it('declares one header source per auth shell page', async () => {
    const { default: nextConfig } = await import('./next.config');
    const sources = ((await nextConfig.headers?.()) ?? []).map(
      (rule) => rule.source
    );
    expect(
      sources.filter((source) =>
        /\/(login|add-account|sso\/consent)$/.test(source)
      )
    ).toEqual([
      '/:locale?/login',
      '/:locale?/login',
      '/:locale?/add-account',
      '/:locale?/add-account',
      '/:locale?/sso/consent',
    ]);
  });
});

describe('public gateway server action origin', () => {
  it('admits only the exact public host across the private origin hop', async () => {
    const { default: config } = await import('./next.config');
    const allowed = config.experimental?.serverActions?.allowedOrigins ?? [];
    expect(allowed).toEqual(['tuturuuu.com']);
    expect(isCsrfOriginAllowed('tuturuuu.com', allowed)).toBe(true);
    for (const host of [
      'evil.example',
      'evil.tuturuuu.com',
      'tuturuuu.com.evil.example',
    ]) {
      expect(isCsrfOriginAllowed(host, allowed)).toBe(false);
    }
  });
});

describe('shared web config for the Next.js and vinext builds', () => {
  async function routing(config: NextConfig) {
    return {
      headers: await config.headers?.(),
      redirects: await config.redirects?.(),
      rewrites: await config.rewrites?.(),
    };
  }

  it('gives vinext the same routing and runtime options as Next.js', async () => {
    const { default: nextConfig } = await import('./next.config');
    const { createWebNextConfig } = await import('./next-config.web');
    const vinextConfig = createWebNextConfig({ publicSeoPaths: [] });

    expect(await routing(vinextConfig)).toEqual(await routing(nextConfig));
    for (const key of [
      'cacheComponents',
      'transpilePackages',
      'images',
      'reactCompiler',
      'partialPrefetching',
    ] as const) {
      expect(vinextConfig[key], key).toEqual(nextConfig[key]);
    }
    expect(vinextConfig.experimental?.serverActions).toEqual(
      nextConfig.experimental?.serverActions
    );
    expect(vinextConfig.experimental?.authInterrupts).toBe(true);
    expect(vinextConfig.experimental?.cachedNavigations).toBe(true);
  });

  it('keeps the Next.js-only offline worker build inputs', async () => {
    const { default: nextConfig } = await import('./next.config');
    expect(nextConfig.cacheComponents).toBe(true);
    expect(nextConfig.serverExternalPackages).toContain(
      'chat-state-cloudflare-do'
    );
    expect(nextConfig.serverExternalPackages).toContain('esbuild-wasm');
    expect(nextConfig.outputFileTracingIncludes?.['/serwist/*']).toBeTruthy();
  });
});
