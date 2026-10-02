import { describe, expect, it, vi } from 'vitest';

vi.mock('./branding-client', () => ({ default: () => null }));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(
    async ({ locale }: { locale: string }) =>
      (key: string) =>
        `${locale}:${key}`
  ),
}));

import { generateMetadata } from './page';

describe('branding page metadata', () => {
  it.each(['en', 'vi'])(
    'uses canonical router URLs and translated previews for %s',
    async (locale) => {
      const metadata = await generateMetadata({
        params: Promise.resolve({ locale }),
      });
      const pathname = locale === 'en' ? '/branding' : '/vi/branding';
      const canonical = String(metadata.alternates?.canonical);
      expect(new URL(canonical).pathname).toBe(pathname);
      expect(metadata.alternates?.languages).toMatchObject({
        'en-US': expect.stringMatching(/\/branding$/),
        'vi-VN': expect.stringMatching(/\/vi\/branding$/),
        'x-default': expect.stringMatching(/\/branding$/),
      });
      expect(metadata.title).toBe(`${locale}:title`);
      expect(metadata.openGraph).toMatchObject({
        url: canonical,
        images: [
          {
            url: `${canonical}/opengraph-image`,
            width: 1200,
            height: 630,
            alt: `${locale}:title`,
          },
        ],
      });
      expect(metadata.twitter).toMatchObject({
        images: [`${canonical}/twitter-image`],
      });
    }
  );
});
