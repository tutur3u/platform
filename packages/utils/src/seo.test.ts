import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tryToParsePath } from 'next/dist/lib/try-to-parse-path';
import { describe, expect, it } from 'vitest';
import { createTuturuuuNextConfig } from './next-config';
import { APP_SEO_POLICY, createSeoHeaders, type SeoApp } from './seo';

function blocked(
  app: SeoApp,
  pathname: string,
  patterns?: string[],
  preview = false
) {
  return createSeoHeaders(app, patterns, {
    VERCEL_ENV: preview ? 'preview' : 'production',
  }).some((rule) => {
    const parsed = tryToParsePath(rule.source);
    expect(parsed.error, rule.source).toBeUndefined();
    return new RegExp(parsed.regexStr ?? '').test(pathname);
  });
}

describe('app indexing boundaries', () => {
  it.each(Object.keys(APP_SEO_POLICY) as SeoApp[])(
    'protects auth and API paths in %s',
    (app) => {
      for (const path of [
        '/login',
        '/vi/login',
        '/en/verify-token',
        '/api/v1/users',
        '/dashboard',
        '/invite/token',
      ]) {
        expect(blocked(app, path), `${app}: ${path}`).toBe(true);
      }
    }
  );

  it('keeps private apps, shared task links, meeting codes and embeds unindexed', () => {
    for (const app of [
      'tasks',
      'meet',
      'parley',
      'chat',
      'ai',
      'infrastructure',
    ] as const) {
      for (const path of [
        '/',
        '/personal',
        '/vi/workspace-id',
        '/shared/task/secret',
        '/r/secret',
      ]) {
        expect(blocked(app, path), `${app}: ${path}`).toBe(true);
      }
    }
    expect(blocked('forms', '/embed/share-code')).toBe(true);
    expect(blocked('forms', '/')).toBe(false);
    expect(blocked('forms', '/f/share-code')).toBe(false);
    expect(blocked('forms', '/f/share-code/responses')).toBe(true);
  });

  it('allows public shops and products but protects buyer transactions', () => {
    for (const prefix of ['', '/vi', '/en']) {
      expect(blocked('storefront', `${prefix}/my-store`)).toBe(false);
      expect(blocked('storefront', `${prefix}/my-store/products/item`)).toBe(
        false
      );
      for (const suffix of [
        'cart',
        'checkout',
        'checkout/success',
        'orders',
        'orders/bearer-token',
      ]) {
        expect(blocked('storefront', `${prefix}/my-store/${suffix}`)).toBe(
          true
        );
      }
    }
  });

  it('limits public education and tool surfaces to their declared pages', () => {
    expect(blocked('learn', '/')).toBe(false);
    expect(blocked('learn', '/personal/reports')).toBe(true);
    expect(blocked('teach', '/personal/attendance')).toBe(true);
    expect(blocked('tools', '/qr')).toBe(false);
    expect(blocked('tools', '/qr/unknown')).toBe(true);
    expect(blocked('nova', '/vi/learn/basic-techniques')).toBe(false);
    expect(blocked('nova', '/vi/challenges')).toBe(true);
    expect(blocked('git', '/-/personal/repositories')).toBe(true);
    expect(blocked('git', '/tutur3u/platform/issues')).toBe(false);
    expect(blocked('lettin', '/worlds/published-world')).toBe(false);
    expect(blocked('lettin', '/personal/wiki/world')).toBe(true);
  });

  it('uses the generated platform allowlist and matches exact route boundaries', () => {
    const paths: string[] = JSON.parse(
      readFileSync(
        resolve(
          __dirname,
          '../../../apps/web/src/lib/seo/public-routes.generated.json'
        ),
        'utf8'
      )
    );
    const patterns = [...paths.map((path) => path.slice(1)), 'changelog/[^/]+'];
    for (const path of paths) {
      expect(blocked('web', path, patterns), path).toBe(false);
      expect(blocked('web', `/vi${path === '/' ? '' : path}`, patterns)).toBe(
        false
      );
    }
    for (const path of [
      '/personal/tasks',
      '/workspace-id',
      '/documents/private-id',
      '/share/document/secret',
      '/ai/chats/private',
      '/pricing/unknown',
    ]) {
      expect(blocked('web', path, patterns), path).toBe(true);
    }
    expect(blocked('web', '/changelog/released', patterns)).toBe(false);
  });

  it('noindexes all preview URLs and preserves the policy after app headers', async () => {
    expect(blocked('tools', '/qr', undefined, true)).toBe(true);
    const config = createTuturuuuNextConfig({
      seoApp: 'learn',
      headers: async () => [
        {
          source: '/login',
          headers: [{ key: 'X-Robots-Tag', value: 'index' }],
        },
      ],
    });
    const rules = await config.headers?.();
    expect(rules?.at(-1)?.headers[0]?.value).toBe(
      'noindex, nofollow, nosnippet'
    );
    expect(config).not.toHaveProperty('seoApp');
  });

  it('registers every Next app and prevents static/metadata route conflicts', () => {
    const root = resolve(__dirname, '../../..');
    for (const app of Object.keys(APP_SEO_POLICY)) {
      const config = readFileSync(
        resolve(root, `apps/${app}/next.config.ts`),
        'utf8'
      );
      expect(config).toContain(`seoApp: '${app}'`);
      for (const file of ['robots', 'sitemap']) {
        expect(
          existsSync(resolve(root, `apps/${app}/src/app/${file}.ts`)) &&
            existsSync(
              resolve(
                root,
                `apps/${app}/public/${file === 'robots' ? 'robots.txt' : 'sitemap.xml'}`
              )
            )
        ).toBe(false);
      }
    }
  });
});
