// @vitest-environment node
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
    const match = getPathMatch(rule.source, {
      removeUnnamedParams: true,
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
});
