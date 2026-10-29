import { PRIVATE_ROBOTS_HEADER } from '@tuturuuu/utils/seo';
import type { NextConfig } from 'next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/plugin', () => ({
  default: () => (config: NextConfig) => config,
}));

const WEB_ORIGIN = 'https://web.contract.test';

type HeaderRule = {
  source: string;
  headers: Array<{ key: string; value: string }>;
};

async function loadConfig() {
  vi.resetModules();
  const mod = await import('../../next.config');
  return mod.default as NextConfig;
}

function headerRulesFor(rules: HeaderRule[], key: string) {
  return rules.filter((rule) =>
    rule.headers.some((header) => header.key === key)
  );
}

/** Evaluates a Next `/:path(<regex>)` source against an app pathname. */
function sourceMatches(source: string, pathname: string) {
  const prefix = '/:path(';
  if (source === '/:path*') return true;
  expect(source.startsWith(prefix) && source.endsWith(')')).toBe(true);
  const inner = source.slice(prefix.length, -1);
  return new RegExp(`^(?:${inner})$`, 'i').test(pathname.replace(/^\//, ''));
}

describe('playground next.config contract', () => {
  beforeEach(() => {
    vi.stubEnv('INTERNAL_WEB_API_ORIGIN', WEB_ORIGIN);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('hides the framework fingerprint header', async () => {
    const config = await loadConfig();
    expect(config.poweredByHeader).toBe(false);
  });

  it('denies framing of every playground path', async () => {
    const config = await loadConfig();
    const rules = (await config.headers?.()) as HeaderRule[];
    const [cspRule] = headerRulesFor(rules, 'Content-Security-Policy');

    expect(cspRule?.headers).toEqual([
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
      { key: 'X-Frame-Options', value: 'DENY' },
    ]);
    for (const pathname of [
      '/',
      '/tool-calling',
      '/api/ai/object-generation',
      '/api/ai/tool-calling',
      '/api/build-info',
      '/api/v1/workspaces/ws/anything',
    ]) {
      expect(sourceMatches(cspRule?.source ?? '', pathname), pathname).toBe(
        true
      );
    }
  });

  it('adds no app-specific framable exceptions beyond the platform list', async () => {
    const config = await loadConfig();
    const rules = (await config.headers?.()) as HeaderRule[];
    const [cspRule] = headerRulesFor(rules, 'Content-Security-Policy');
    const framable = '/api/v1/workspaces/ws/external-projects/assets/a/webgl';

    expect(sourceMatches(cspRule?.source ?? '', framable)).toBe(false);
    expect(headerRulesFor(rules, 'Content-Security-Policy')).toHaveLength(1);
  });

  it('sets the private robots header in next.config for every unlisted playground path', async () => {
    const config = await loadConfig();
    const rules = (await config.headers?.()) as HeaderRule[];
    const robots = headerRulesFor(rules, 'X-Robots-Tag');

    expect(robots).toEqual([
      {
        source: '/:path*',
        headers: [{ key: 'X-Robots-Tag', value: PRIVATE_ROBOTS_HEADER }],
      },
    ]);
  });

  it('proxies only unmatched /api paths to web, after local routes', async () => {
    const config = await loadConfig();
    const rewrites = await config.rewrites?.();

    expect(rewrites).toEqual({
      beforeFiles: [],
      afterFiles: [],
      fallback: [
        {
          source: '/api/:path*',
          destination: `${WEB_ORIGIN}/api/:path*`,
        },
      ],
    });
  });

  it('defaults the proxied web origin to production tuturuuu.com when deployed', async () => {
    vi.unstubAllEnvs();
    for (const name of [
      'INTERNAL_WEB_API_ORIGIN',
      'WEB_APP_URL',
      'NEXT_PUBLIC_WEB_APP_URL',
      'NEXT_PUBLIC_APP_URL',
    ]) {
      vi.stubEnv(name, '');
    }
    vi.stubEnv('NODE_ENV', 'production');
    const config = await loadConfig();
    const rewrites = (await config.rewrites?.()) as {
      fallback: Array<{ destination: string }>;
    };

    expect(rewrites.fallback[0]?.destination).toBe(
      'https://tuturuuu.com/api/:path*'
    );
  });

  it('only optimizes remote images over https', async () => {
    const config = await loadConfig();
    const patterns = config.images?.remotePatterns ?? [];

    expect(patterns.length).toBeGreaterThan(0);
    for (const pattern of patterns) {
      expect(pattern.protocol).toMatch(/^https:?$/);
    }
  });

  it('declares no custom redirects', async () => {
    const config = await loadConfig();
    expect(config.redirects).toBeUndefined();
  });
});
