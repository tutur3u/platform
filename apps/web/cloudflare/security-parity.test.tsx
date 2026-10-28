// @vitest-environment jsdom
import { createMemoryHistory } from '@tanstack/react-router';
import { createCommonMetadata } from '@tuturuuu/utils/common/metadata';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import en from '../messages/en.json';
import vietnamese from '../messages/vi.json';
import BountyPage, {
  generateMetadata as bountyMetadata,
} from '../src/app/[locale]/(marketing)/security/bug-bounty/page';
import PolicyPage, {
  generateMetadata as policyMetadata,
} from '../src/app/[locale]/(marketing)/security/policy/page';
import { getRouter } from './start/router';
import { SecurityPage } from './start/security-page';

const active = vi.hoisted(() => ({ locale: 'en' }));
const pages = [
  {
    kind: 'security-policy',
    slug: 'security/policy',
    metadata: policyMetadata,
    render: PolicyPage,
  },
  {
    kind: 'bug-bounty',
    slug: 'security/bug-bounty',
    metadata: bountyMetadata,
    render: BountyPage,
  },
] as const;
vi.mock('next-intl/server', () => ({
  getTranslations: async (input: string | { namespace: string }) => {
    const namespace = typeof input === 'string' ? input : input.namespace;
    return (key: string) => {
      let value: unknown = active.locale === 'vi' ? vietnamese : en;
      for (const part of `${namespace}.${key}`.split('.')) {
        if (!value || typeof value !== 'object')
          throw new Error('Missing translation');
        value = Reflect.get(value, part);
      }
      if (typeof value !== 'string')
        throw new Error('Expected translated string');
      return value;
    };
  },
}));
vi.mock('@/components/landing/shared/reveal', () => {
  const Visible = ({ children }: { children: ReactNode }) => <>{children}</>;
  return { Reveal: Visible, RevealGroup: Visible, RevealItem: Visible };
});
vi.mock('@/constants/configs', () => ({
  siteConfig: { name: 'Tuturuuu', url: 'https://tuturuuu.com' },
}));
const paths = pages.flatMap(({ slug }) => [
  `/${slug}`,
  `/en/${slug}`,
  `/vi/${slug}`,
]);

describe('native security heads match canonical Next metadata', () => {
  it.each(paths)(
    '%s preserves SEO copy, locale URLs and every social tag',
    async (path) => {
      const locale = path.startsWith('/vi/') ? 'vi' : 'en';
      const page = pages.find(({ slug }) => path.endsWith(`/${slug}`));
      if (!page) throw new Error(`No metadata fixture for ${path}`);
      active.locale = locale;
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

function documentFor(html: string) {
  return new DOMParser().parseFromString(html, 'text/html');
}
function textTokens(doc: Document) {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const tokens: string[] = [];
  while (walker.nextNode()) {
    tokens.push(
      ...(walker.currentNode.textContent ?? '').split(/\s+/u).filter(Boolean)
    );
  }
  return tokens.sort();
}
describe('security body parity with the current Next pages', () => {
  for (const locale of ['en', 'vi'] as const) {
    for (const page of pages) {
      it(`${locale}/${page.kind}: retains every heading, paragraph, list, metric and researcher`, async () => {
        active.locale = locale;
        const canonical = documentFor(
          renderToStaticMarkup(await page.render())
        );
        const native = documentFor(
          renderToStaticMarkup(
            <SecurityPage kind={page.kind} locale={locale} />
          )
        );
        for (const tag of ['h1', 'h2', 'h3', 'li']) {
          const values = (doc: Document) =>
            [...doc.querySelectorAll(tag)].map((node) =>
              node.textContent?.replace(/\s+/gu, ' ').trim()
            );
          expect(values(native)).toEqual(values(canonical));
        }
        expect(textTokens(native)).toEqual(textTokens(canonical));
        const links = (doc: Document) =>
          [...doc.querySelectorAll('a')].map((link) => [
            link.textContent?.trim(),
            link.getAttribute('href')?.replace(/^\/vi(?=\/)/u, ''),
          ]);
        expect(links(native)).toEqual(links(canonical));
        expect(
          native.querySelectorAll('script, form, input, iframe, [style]')
        ).toHaveLength(0);
        expect(native.body.innerHTML).not.toMatch(/opacity:0|animate-|motion/u);
        if (locale === 'vi') {
          for (const link of native.querySelectorAll('a[href^="/"]'))
            expect(link.getAttribute('href')).toMatch(/^\/vi\//u);
        }
      });
    }
  }
});
