// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import policies from '../../packages/utils/src/seo-policy.json';
import { robotsForUrl } from '../../packages/utils/src/seo-robots';
import appConfig from './start-bridge.config';

const policy = policies.marketing;
const worker = readFileSync(
  new URL('./cloudflare/worker.ts', import.meta.url),
  'utf8'
);
const publicPaths = [
  '/',
  '/pricing',
  '/privacy',
  '/terms',
  '/acceptable-use',
  '/community-guidelines',
  '/security',
  '/about',
  '/branding',
  '/careers',
  '/contact',
  '/contributors',
  '/partners',
  '/women-in-tech',
  '/products',
  '/blog',
  '/legal/dpa',
  '/legal/sla',
  '/legal/subprocessors',
  '/legal/changes',
  '/legal/changes/full',
  '/security/bug-bounty',
  '/security/policy',
];
const products =
  'ai calendar chat crm documents drive finance forms hive inventory lms mail meet-together qr storefront tasks track workflows'.split(
    ' '
  );
const solutions =
  'construction education healthcare hospitality manufacturing pharmacies realestate restaurants retail'.split(
    ' '
  );
publicPaths.push(
  ...products.map((slug) => `/products/${slug}`),
  ...solutions.map((slug) => `/solutions/${slug}`)
);
const privatePaths = [
  '/app',
  '/auth',
  '/dashboard',
  '/api/test',
  '/login',
  '/unknown',
  '/marketing',
  '/products/private',
  '/legal/private',
  '/solutions/private',
  '/blog/private',
  '/download',
  '/roadmap',
];
const locales = ['', '/vi', '/en'];
const url = (path: string, host = 'tuturuuu.com') =>
  new URL(`https://${host}${path}`);
const headers = async (
  path: string,
  host = 'tuturuuu.com',
  noindex = '0',
  upstream?: string
) =>
  (
    await appConfig.wrapResponse!(
      new Response('<html></html>', {
        headers: upstream ? { 'x-robots-tag': upstream } : {},
      }),
      {
        request: new Request(url(path, host)),
        env: { TUTURUUU_NOINDEX: noindex },
        seoPolicy: policy,
      }
    )
  ).headers;

function assertWiring(source: string, entry: typeof policy) {
  expect(source).toMatch(
    /import seoPolicies from ['"]\.\.\/\.\.\/\.\.\/packages\/utils\/src\/seo-policy\.json['"]/u
  );
  expect(source).toMatch(/const seoPolicy = seoPolicies\.marketing;/u);
  expect(source).toMatch(/seoPolicy,\s*\}/u);
  expect(entry.publicPaths.length).toBeGreaterThan(0);
  expect(entry.publicPatterns.length).toBeGreaterThan(0);
}

// D79: positive behavior plus deliberately broken variants for each boundary.
describe('marketing production indexing', () => {
  it('wires a nonempty source policy into the Worker response policy', () => {
    assertWiring(worker, policy);
    expect(() =>
      assertWiring(worker.replace('seoPolicies.marketing;', 'null;'), policy)
    ).toThrow();
    expect(() =>
      assertWiring(worker, { ...policy, publicPaths: [] })
    ).toThrow();
    expect(() =>
      assertWiring(worker, { ...policy, publicPatterns: [] })
    ).toThrow();
  });

  it('covers every actual marketing page with a gateway-owned public policy', () => {
    const root = new URL('./src/app/[locale]/(marketing)/', import.meta.url);
    function pages(directory: string, segments: string[] = []): string[] {
      return readdirSync(directory, { withFileTypes: true }).flatMap(
        (entry) => {
          if (entry.isDirectory())
            return pages(
              join(directory, entry.name),
              entry.name.startsWith('(') ? segments : [...segments, entry.name]
            );
          return entry.name === 'page.tsx' ? [`/${segments.join('/')}`] : [];
        }
      );
    }
    for (const path of pages(root.pathname))
      expect(publicPaths).toContain(path);
  });

  it('makes all public groups indexable in EN and VI, keeping private paths private', () => {
    for (const locale of locales) {
      for (const path of publicPaths)
        expect(robotsForUrl(policy, url(`${locale}${path}`))).toBeNull();
      for (const path of privatePaths)
        expect(robotsForUrl(policy, url(`${locale}${path}`))).toContain(
          'noindex'
        );
    }
    // Broken policy: the regression must fail the public-page assertion.
    expect(() =>
      expect(
        robotsForUrl(
          { ...policy, publicPaths: [], publicPatterns: [] },
          url('/')
        )
      ).toBeNull()
    ).toThrow();
  });

  it('applies the Worker header policy on public and private requests', async () => {
    for (const locale of locales) {
      for (const path of publicPaths)
        expect((await headers(`${locale}${path}`)).has('x-robots-tag')).toBe(
          false
        );
      for (const path of privatePaths)
        expect(
          (await headers(`${locale}${path}`)).get('x-robots-tag')
        ).toContain('noindex');
    }
    for (const host of [
      'tuturuuu-marketing.workers.dev',
      'staging.tuturuuu.com',
      'marketing.tuturuuu.com',
      'preview.example.com',
      'www.tuturuuu.com',
    ]) {
      expect((await headers('/', host)).get('x-robots-tag')).toContain(
        'noindex'
      );
      expect(robotsForUrl(policy, url('/', host))).toContain('noindex');
    }
    expect(
      (await headers('/', 'tuturuuu.com', '1')).get('x-robots-tag')
    ).toContain('noindex');
    expect(
      (await headers('/', 'tuturuuu.com', '0', 'noindex')).get('x-robots-tag')
    ).toBe('noindex');
    // Broken header resolver: an all-private response cannot pass production.
    const privateHeaders = await headers('/', 'tuturuuu.com', '1');
    expect(() =>
      expect(privateHeaders.has('x-robots-tag')).toBe(false)
    ).toThrow();
  });
});
