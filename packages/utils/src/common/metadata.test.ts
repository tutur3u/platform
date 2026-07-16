import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCommonMetadata } from './metadata';

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
});
