import { createMemoryHistory } from '@tanstack/react-router';
import { createCommonMetadata } from '@tuturuuu/utils/common/metadata';
import { describe, expect, it, vi } from 'vitest';
import en from '../messages/en.json';
import vietnamese from '../messages/vi.json';
import { generateMetadata as acceptableUseMetadata } from '../src/app/[locale]/(marketing)/acceptable-use/layout';
import { generateMetadata as communityGuidelinesMetadata } from '../src/app/[locale]/(marketing)/community-guidelines/layout';
import { generateMetadata as dpaMetadata } from '../src/app/[locale]/(marketing)/legal/dpa/layout';
import { generateMetadata as slaMetadata } from '../src/app/[locale]/(marketing)/legal/sla/layout';
import { generateMetadata as subprocessorsMetadata } from '../src/app/[locale]/(marketing)/legal/subprocessors/layout';
import { generateMetadata as privacyMetadata } from '../src/app/[locale]/(marketing)/privacy/layout';
import { generateMetadata as termsMetadata } from '../src/app/[locale]/(marketing)/terms/layout';
import { getRouter } from './start/router';

const pages = [
  {
    kind: 'privacy',
    slug: 'privacy',
    seoKey: 'privacy',
    metadata: privacyMetadata,
  },
  { kind: 'terms', slug: 'terms', seoKey: 'terms', metadata: termsMetadata },
  {
    kind: 'acceptable-use',
    slug: 'acceptable-use',
    seoKey: 'acceptable_use',
    metadata: acceptableUseMetadata,
  },
  {
    kind: 'dpa',
    slug: 'legal/dpa',
    seoKey: 'legal_dpa',
    metadata: dpaMetadata,
  },
  {
    kind: 'sla',
    slug: 'legal/sla',
    seoKey: 'legal_sla',
    metadata: slaMetadata,
  },
  {
    kind: 'subprocessors',
    slug: 'legal/subprocessors',
    seoKey: 'legal_subprocessors',
    metadata: subprocessorsMetadata,
  },
  {
    kind: 'community-guidelines',
    slug: 'community-guidelines',
    seoKey: 'community_guidelines',
    metadata: communityGuidelinesMetadata,
  },
] as const;

vi.mock('next-intl/server', () => ({
  getTranslations: async ({
    locale,
    namespace,
  }: {
    locale: string;
    namespace: string;
  }) => {
    const messages = locale === 'vi' ? vietnamese : en;
    const key = namespace.replace(
      'marketingSeo.',
      ''
    ) as keyof typeof messages.marketingSeo;
    const copy = messages.marketingSeo[key] as {
      title: string;
      description: string;
    };
    return (name: 'title' | 'description') => copy[name];
  },
}));
vi.mock('@/constants/configs', () => ({
  siteConfig: { name: 'Tuturuuu', url: 'https://tuturuuu.com' },
}));

const paths = pages.flatMap(({ slug }) => [
  `/${slug}`,
  `/en/${slug}`,
  `/vi/${slug}`,
]);

describe('native public legal heads match canonical Next metadata', () => {
  it.each(paths)(
    '%s preserves SEO copy, locale URLs and every social tag',
    async (path) => {
      const locale = path.startsWith('/vi/') ? 'vi' : 'en';
      const page = pages.find(({ slug }) => path.endsWith(`/${slug}`));
      if (!page) throw new Error(`No metadata fixture for ${path}`);
      const expected = await page.metadata({
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
      expect(values.get('robots')).toBe('noindex, nofollow');
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
      const prefix = locale === 'vi' ? '/vi' : '';
      expect(expected.alternates?.canonical).toBe(
        `https://tuturuuu.com${prefix}/${page.slug}`
      );
      expect(expected.alternates?.languages).toEqual({
        'en-US': `https://tuturuuu.com/${page.slug}`,
        'vi-VN': `https://tuturuuu.com/vi/${page.slug}`,
        'x-default': `https://tuturuuu.com/${page.slug}`,
      });
    }
  );
});
