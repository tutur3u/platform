import { createMemoryHistory } from '@tanstack/react-router';
import { createCommonMetadata } from '@tuturuuu/utils/common/metadata';
import { describe, expect, it, vi } from 'vitest';
import en from '../messages/en.json';
import vietnamese from '../messages/vi.json';
import { generateMetadata as privacyMetadata } from '../src/app/[locale]/(marketing)/privacy/layout';
import { generateMetadata as termsMetadata } from '../src/app/[locale]/(marketing)/terms/layout';
import { getRouter } from './start/router';

vi.mock('next-intl/server', () => ({
  getTranslations: async ({
    locale,
    namespace,
  }: {
    locale: string;
    namespace: string;
  }) => {
    const messages = locale === 'vi' ? vietnamese : en;
    const kind = namespace === 'marketingSeo.privacy' ? 'privacy' : 'terms';
    return (key: 'title' | 'description') => messages.marketingSeo[kind][key];
  },
}));
vi.mock('@/constants/configs', () => ({
  siteConfig: { name: 'Tuturuuu', url: 'https://tuturuuu.com' },
}));

const paths = [
  '/privacy',
  '/terms',
  '/en/privacy',
  '/en/terms',
  '/vi/privacy',
  '/vi/terms',
];

describe('native legal route heads match canonical Next metadata', () => {
  it.each(paths)(
    '%s preserves SEO copy, locale URLs and every social tag',
    async (path) => {
      const locale = path.startsWith('/vi/') ? 'vi' : 'en';
      const generateMetadata = path.endsWith('/privacy')
        ? privacyMetadata
        : termsMetadata;
      const expected = await generateMetadata({
        params: Promise.resolve({ locale }),
      });
      const common = createCommonMetadata({
        config: {
          name: 'Tuturuuu',
          url: 'https://tuturuuu.com',
          description: { en: '' },
          keywords: [],
          indexable: true,
        },
        locale,
      });
      const router = getRouter();
      router.update({
        history: createMemoryHistory({ initialEntries: [path] }),
        isServer: true,
      });
      await router.load();
      const matches = router.state.matches;
      expect(matches.map((match) => match.status)).toEqual([
        'success',
        'success',
      ]);
      const meta = matches.flatMap((match) => match.meta ?? []);
      const links = matches.flatMap((match) => match.links ?? []);
      const values = new Map(
        meta.flatMap((tag) => {
          if (!tag) return [];
          if ('title' in tag) return [['title', tag.title]];
          if ('name' in tag) return [[tag.name, tag.content]];
          if ('property' in tag) return [[tag.property, tag.content]];
          return [];
        })
      );
      const title =
        typeof common.title === 'object' &&
        common.title &&
        'template' in common.title
          ? common.title.template
          : '%s';
      expect(values.get('title')).toBe(
        title?.replace('%s', String(expected.title))
      );
      expect(values.get('description')).toBe(expected.description);
      expect(links.filter((link) => link?.rel === 'canonical')).toEqual([
        { rel: 'canonical', href: expected.alternates?.canonical },
      ]);
      expect(
        Object.fromEntries(
          links
            .filter((link) => link?.rel === 'alternate')
            .map((link) => [link?.hrefLang, link?.href])
        )
      ).toEqual(expected.alternates?.languages);
      expect(values.get('robots')).toBe('noindex, nofollow');
      expect({
        type: values.get('og:type'),
        url: values.get('og:url'),
        locale: values.get('og:locale'),
        alternateLocale: [values.get('og:locale:alternate')],
        siteName: values.get('og:site_name'),
        title: values.get('og:title'),
        description: values.get('og:description'),
        images: [
          {
            url: values.get('og:image'),
            width: Number(values.get('og:image:width')),
            height: Number(values.get('og:image:height')),
            alt: values.get('og:image:alt'),
          },
        ],
      }).toEqual(expected.openGraph);
      expect({
        card: values.get('twitter:card'),
        title: values.get('twitter:title'),
        description: values.get('twitter:description'),
        images: [values.get('twitter:image')],
        creator: values.get('twitter:creator'),
        site: values.get('twitter:site'),
      }).toEqual(expected.twitter);
      const kind = path.endsWith('/privacy') ? 'privacy' : 'terms';
      const prefix = locale === 'vi' ? '/vi' : '';
      expect(expected.alternates?.canonical).toBe(
        `https://tuturuuu.com${prefix}/${kind}`
      );
      expect(expected.alternates?.languages).toEqual({
        'en-US': `https://tuturuuu.com/${kind}`,
        'vi-VN': `https://tuturuuu.com/vi/${kind}`,
        'x-default': `https://tuturuuu.com/${kind}`,
      });
    }
  );
});
