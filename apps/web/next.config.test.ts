// @vitest-environment node
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { modifyRouteRegex } from 'next/dist/lib/redirect-status';
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';
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
async function finalConfigHeaders(pathname: string) {
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

  it('caches every committed content-hashed font subset immutably', async () => {
    const files = readdirSync(
      path.join(__dirname, 'public/fonts/subsets')
    ).filter((file) => file.endsWith('.woff2'));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const headers = await finalConfigHeaders(`/fonts/subsets/${file}`);
      expect(headers.get('cache-control'), file).toBe(
        'public, max-age=31536000, immutable'
      );
    }
  });

  it('leaves unhashed or out-of-scope font paths on the default cache policy', async () => {
    for (const pathname of [
      '/fonts/subsets/manifest.json',
      '/fonts/subsets/OFL-notosans.txt',
      '/fonts/subsets/noto-sans-latin-core.woff2',
      '/fonts/subsets/noto-sans-latin-core.7b24cd80.woff2',
      '/fonts/subsets/noto-sans-latin-core.7B24CD8019.woff2x',
      '/fonts/subsets/nested/noto-sans-latin-core.7b24cd8019.woff2',
      '/en/fonts/subsets/noto-sans-latin-core.7b24cd8019.woff2',
      '/fonts/private.7b24cd8019.woff2',
    ]) {
      const headers = await finalConfigHeaders(pathname);
      expect(headers.has('cache-control'), pathname).toBe(false);
    }
  });

  it('does not match percent-encoded spellings, which the route handler refuses', async () => {
    const headers = await finalConfigHeaders('/api/cli/auth/%73tart');

    expect(headers.get('content-security-policy')).toBe(
      "frame-ancestors 'none'"
    );
  });
});
