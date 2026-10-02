import { describe, expect, it, vi } from 'vitest';
import english from '../../../../messages/en.json';
import vietnamese from '../../../../messages/vi.json';

vi.mock('@/components/portfolio/portfolio', () => ({ Portfolio: () => null }));
vi.mock('@tuturuuu/utils/launchable-apps', () => ({ LAUNCHABLE_APPS: [] }));
vi.mock('next-intl/server', () => ({
  getLocale: vi.fn(),
  getMessages: vi.fn(),
  getTranslations: vi.fn(
    async ({ locale, namespace }: { locale: string; namespace: string }) => {
      expect(namespace).toBe('portfolio');
      const copy = locale === 'vi' ? vietnamese.portfolio : english.portfolio;
      return (key: string) => {
        if (key === 'title') return copy.title;
        if (key === 'description') return copy.description;
        throw new Error(`Unexpected portfolio metadata key: ${key}`);
      };
    }
  ),
}));

import { generateMetadata } from './page';

describe('portfolio public metadata', () => {
  it.each(['en', 'vi'] as const)(
    'resolves actual %s copy and reciprocal canonical URLs',
    async (locale) => {
      const metadata = await generateMetadata({
        params: Promise.resolve({ locale }),
      });
      const copy = locale === 'vi' ? vietnamese.portfolio : english.portfolio;
      expect(metadata.title).toBe(copy.title);
      expect(metadata.description).toBe(copy.description);
      expect(metadata.alternates?.canonical).toBe(
        `https://tuturuuu.com${locale === 'vi' ? '/vi' : ''}/portfolio`
      );
      expect(metadata.alternates?.languages).toMatchObject({
        'en-US': 'https://tuturuuu.com/portfolio',
        'vi-VN': 'https://tuturuuu.com/vi/portfolio',
        'x-default': 'https://tuturuuu.com/portfolio',
      });
      expect(metadata.robots).toMatchObject({ index: true, follow: true });
    }
  );
});
