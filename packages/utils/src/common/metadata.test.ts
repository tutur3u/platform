import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createCommonMetadata,
  createPageMetadata,
  NO_INDEX_ROBOTS,
} from './metadata';

const repoRoot = resolve(__dirname, '../../../..');

const config = {
  description: {
    en: 'English product description.',
    vi: 'Mo ta san pham bang tieng Viet.',
  },
  indexable: true,
  keywords: ['team collaboration', 'workflow automation'],
  name: 'Tuturuuu Test',
  url: 'https://test.tuturuuu.com',
};

describe('createCommonMetadata', () => {
  it('builds localized, indexable product metadata', () => {
    const metadata = createCommonMetadata({ config, locale: 'vi' });

    expect(metadata.description).toBe('Mo ta san pham bang tieng Viet.');
    expect(metadata.metadataBase?.toString()).toBe(
      'https://test.tuturuuu.com/'
    );
    expect(metadata.keywords).toEqual([
      'Tuturuuu Test',
      'Tuturuuu',
      'team collaboration',
      'workflow automation',
    ]);
    expect(metadata.robots).toMatchObject({
      follow: true,
      index: true,
    });
    expect(metadata.openGraph).toMatchObject({
      alternateLocale: ['en_US'],
      description: 'Mo ta san pham bang tieng Viet.',
      locale: 'vi_VN',
      siteName: 'Tuturuuu Test',
      title: 'Tuturuuu Test',
    });
    expect(metadata.twitter).toMatchObject({
      card: 'summary_large_image',
      creator: '@tuturuuu',
      site: '@tuturuuu',
    });
  });

  it('uses valid shared brand assets without advertising a missing manifest', () => {
    const metadata = createCommonMetadata({ config, locale: 'en' });

    expect(metadata.icons).toEqual({
      apple: 'https://tuturuuu.com/apple-touch-icon.png',
      icon: 'https://tuturuuu.com/favicon.ico',
      shortcut: 'https://tuturuuu.com/favicon-16x16.png',
    });
    expect(metadata.manifest).toBeUndefined();
    expect(metadata.openGraph).toMatchObject({
      images: [
        {
          alt: 'Tuturuuu Test preview',
          height: 630,
          url: 'https://tuturuuu.com/media/logos/og-image.jpg',
          width: 1200,
        },
      ],
      locale: 'en_US',
    });
  });

  it('prevents private application surfaces from being indexed', () => {
    const metadata = createCommonMetadata({
      config: {
        ...config,
        indexable: false,
      },
      locale: 'en',
    });

    expect(metadata.robots).toEqual({
      follow: false,
      googleBot: {
        follow: false,
        index: false,
      },
      index: false,
    });
  });

  it('includes a manifest only when the application declares one', () => {
    const metadata = createCommonMetadata({
      config: {
        ...config,
        manifest: '/manifest.webmanifest',
      },
      locale: 'en',
    });

    expect(metadata.manifest).toBe('/manifest.webmanifest');
  });
});

describe('createPageMetadata', () => {
  it('builds canonical, hreflang, and social metadata for a localized page', () => {
    const metadata = createPageMetadata({
      baseUrl: 'https://test.tuturuuu.com',
      description: 'Plan and automate team workflows.',
      image: '/media/workflows-og.png',
      locale: 'vi',
      pathname: '/products/workflows',
      title: 'Workflow Automation',
    });

    expect(metadata.alternates).toEqual({
      canonical: 'https://test.tuturuuu.com/vi/products/workflows',
      languages: {
        'en-US': 'https://test.tuturuuu.com/products/workflows',
        'vi-VN': 'https://test.tuturuuu.com/vi/products/workflows',
        'x-default': 'https://test.tuturuuu.com/products/workflows',
      },
    });
    expect(metadata.openGraph).toMatchObject({
      alternateLocale: ['en_US'],
      description: 'Plan and automate team workflows.',
      locale: 'vi_VN',
      siteName: 'Tuturuuu',
      title: 'Workflow Automation',
      url: 'https://test.tuturuuu.com/vi/products/workflows',
      images: [
        {
          alt: 'Workflow Automation',
          height: 630,
          url: 'https://test.tuturuuu.com/media/workflows-og.png',
          width: 1200,
        },
      ],
    });
    expect(metadata.twitter).toMatchObject({
      card: 'summary_large_image',
      creator: '@tuturuuu',
      site: '@tuturuuu',
      title: 'Workflow Automation',
    });
  });

  it('does not override inherited robots unless page indexing is explicit', () => {
    const baseConfig = {
      baseUrl: 'https://test.tuturuuu.com',
      description: 'Private workspace page.',
      locale: 'en',
      pathname: '/workspace',
      title: 'Workspace',
    };

    expect(createPageMetadata(baseConfig).robots).toBeUndefined();
    expect(
      createPageMetadata({ ...baseConfig, indexable: false }).robots
    ).toEqual(NO_INDEX_ROBOTS);
  });

  it('uses the unprefixed English URL configured by the public router', () => {
    const metadata = createPageMetadata({
      baseUrl: 'https://test.tuturuuu.com',
      description: 'The main product landing page.',
      locale: 'en',
      pathname: '/',
      title: 'Tuturuuu',
    });

    expect(metadata.alternates).toEqual({
      canonical: 'https://test.tuturuuu.com/',
      languages: {
        'en-US': 'https://test.tuturuuu.com/',
        'vi-VN': 'https://test.tuturuuu.com/vi',
        'x-default': 'https://test.tuturuuu.com/',
      },
    });
  });

  it('supports apps that never expose locale prefixes', () => {
    const metadata = createPageMetadata({
      baseUrl: 'https://tools.tuturuuu.com',
      description: 'Localized tools on one stable URL.',
      locale: 'vi',
      localePrefix: 'never',
      pathname: '/qr',
      title: 'QR Code Generator',
    });

    expect(metadata.alternates).toEqual({
      canonical: 'https://tools.tuturuuu.com/qr',
    });
    expect(metadata.openGraph).toMatchObject({
      locale: 'vi_VN',
      url: 'https://tools.tuturuuu.com/qr',
    });
  });

  it('supports apps that always expose locale prefixes', () => {
    const metadata = createPageMetadata({
      baseUrl: 'https://example.tuturuuu.com',
      description: 'A prefixed localized page.',
      locale: 'en',
      localePrefix: 'always',
      pathname: '/about',
      title: 'About',
    });

    expect(metadata.alternates).toMatchObject({
      canonical: 'https://example.tuturuuu.com/en/about',
      languages: {
        'en-US': 'https://example.tuturuuu.com/en/about',
        'vi-VN': 'https://example.tuturuuu.com/vi/about',
      },
    });
  });
});

describe('application metadata coverage', () => {
  it('keeps every Next.js application on the shared metadata contract', () => {
    const appsDirectory = resolve(repoRoot, 'apps');
    const nextApps = readdirSync(appsDirectory, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          existsSync(resolve(appsDirectory, entry.name, 'next.config.ts'))
      )
      .map((entry) => entry.name)
      .sort();

    expect(nextApps.length).toBeGreaterThan(0);

    for (const app of nextApps) {
      const appDirectory = resolve(appsDirectory, app, 'src/app');
      const localizedLayout = resolve(appDirectory, '[locale]/layout.tsx');
      const rootLayout = resolve(appDirectory, 'layout.tsx');
      const layoutPath = existsSync(localizedLayout)
        ? localizedLayout
        : rootLayout;

      expect(existsSync(layoutPath), `${app} is missing a root layout`).toBe(
        true
      );
      expect(
        readFileSync(layoutPath, 'utf8'),
        `${app} is not using the shared metadata contract`
      ).toMatch(/(?:create|generate)CommonMetadata/);
    }
  });

  it('covers the non-Next public application shells', () => {
    const tanStackHead = readFileSync(
      resolve(repoRoot, 'apps/tanstack-web/src/lib/platform/app-shell.ts'),
      'utf8'
    );
    const mobileHead = readFileSync(
      resolve(repoRoot, 'apps/mobile/web/index.html'),
      'utf8'
    );
    const docsConfig = JSON.parse(
      readFileSync(resolve(repoRoot, 'apps/docs/docs.json'), 'utf8')
    ) as { description?: string };

    expect(tanStackHead).toContain('max-image-preview:large');
    expect(tanStackHead).toContain("name: 'twitter:site'");
    expect(mobileHead).toContain('name="robots" content="noindex, nofollow"');
    expect(mobileHead).toContain('property="og:image"');
    expect(docsConfig.description).toMatch(/Tuturuuu platform/);
  });

  it('keeps SEO-critical public routes on page-specific metadata', () => {
    const routeFiles = [
      'apps/apps/src/app/[locale]/page.tsx',
      'apps/learn/src/app/[locale]/page.tsx',
      'apps/teach/src/app/[locale]/page.tsx',
      'apps/tools/src/app/[locale]/page.tsx',
      'apps/tools/src/app/[locale]/qr/page.tsx',
      'apps/tools/src/app/[locale]/random/page.tsx',
      'apps/storefront/src/app/[locale]/[storeSlug]/page.tsx',
      'apps/storefront/src/app/[locale]/[storeSlug]/products/[listingId]/page.tsx',
      'apps/nova/src/app/[locale]/(marketing)/layout.tsx',
      'apps/nova/src/app/[locale]/(marketing)/learn/layout.tsx',
    ];

    for (const routeFile of routeFiles) {
      const source = readFileSync(resolve(repoRoot, routeFile), 'utf8');

      expect(
        source,
        `${routeFile} is missing page-specific SEO metadata`
      ).toMatch(/create(?:Page|NovaPage)Metadata/);
    }

    const marketingLayouts = readdirSync(
      resolve(repoRoot, 'apps/web/src/app/[locale]/(marketing)'),
      { recursive: true, withFileTypes: true }
    )
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name === 'layout.tsx' &&
          readFileSync(resolve(entry.parentPath, entry.name), 'utf8').includes(
            'createMarketingMetadata'
          )
      )
      .map((entry) => resolve(entry.parentPath, entry.name));

    expect(marketingLayouts).toHaveLength(34);
    for (const layoutPath of marketingLayouts) {
      expect(readFileSync(layoutPath, 'utf8')).toMatch(/pathname:\s*['`]/);
    }
  });
});
