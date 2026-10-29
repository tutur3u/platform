// @vitest-environment jsdom

import { createMemoryHistory } from '@tanstack/react-router';
import {
  getLegalDocument,
  getProposedLegalDocument,
  legalChangesCopy,
} from '@tuturuuu/legal';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import en from '../messages/en.json';
import vietnamese from '../messages/vi.json';
import { generateMetadata as fullMetadata } from '../src/app/[locale]/(marketing)/legal/changes/full/page';
import { generateMetadata } from '../src/app/[locale]/(marketing)/legal/changes/page';
import { LegalChanges } from '../src/components/legal/legal-changes';
import { isPublicSeoPathname } from '../src/lib/seo/public-routes';
import { nativeLegalPath } from './native-legal';
import { LegalPage } from './start/legal-page';
import { getRouter } from './start/router';

vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale }: { locale: string }) => {
    const copy = (locale === 'vi' ? vietnamese : en).marketingSeo.legal_changes;
    return (name: 'title' | 'description') => copy[name];
  },
}));
vi.mock('@/constants/configs', () => ({
  siteConfig: { name: 'Tuturuuu', url: 'https://tuturuuu.com' },
}));
describe('upcoming legal changes', () => {
  it('resolves all six candidate proposal routes with noindex heads', async () => {
    for (const prefix of ['', '/en', '/vi'])
      for (const suffix of ['', '/full']) {
        const router = getRouter();
        router.update({
          history: createMemoryHistory({
            initialEntries: [`${prefix}/legal/changes${suffix}`],
          }),
          isServer: true,
        });
        await router.load();
        expect(router.state.matches.map((match) => match.status)).toEqual([
          'success',
          'success',
        ]);
        expect(
          router.state.matches.flatMap((match) => match.meta ?? [])
        ).toContainEqual({ name: 'robots', content: 'noindex, nofollow' });
      }
  });

  for (const locale of ['en', 'vi'] as const) {
    it(`${locale} proposals have no effective date and cannot be indexed`, async () => {
      for (const full of [false, true]) {
        const html = renderToStaticMarkup(
          <LegalChanges locale={locale} full={full} />
        );
        expect(html).not.toContain('2026-09-13');
        expect(html).toContain('data-binding-notice');
        expect(html).toContain(
          full
            ? locale === 'vi'
              ? 'Dự kiến'
              : 'Proposed'
            : locale === 'vi'
              ? 'Các cập nhật này chưa có hiệu lực.'
              : 'These updates are not yet in effect.'
        );
        const path = `/legal/changes${full ? '/full' : ''}`;
        expect(isPublicSeoPathname(path)).toBe(false);
        for (const prefix of ['', '/en', '/vi'])
          expect(nativeLegalPath(`${prefix}${path}`)).toBe(true);
        const metadata = await (full ? fullMetadata : generateMetadata)({
          params: Promise.resolve({ locale }),
        });
        expect(metadata.robots).toMatchObject({ index: false });
      }
    });
    it(`${locale} proposal views never show the inherited legal-review footer sentences`, () => {
      const banned =
        /requires legal review|counsel-review draft|cần được rà soát pháp lý|chờ rà soát pháp lý/iu;
      for (const full of [false, true]) {
        const page = new DOMParser().parseFromString(
          renderToStaticMarkup(<LegalChanges locale={locale} full={full} />),
          'text/html'
        );
        expect(page.body.textContent).not.toMatch(banned);
      }
      const full = new DOMParser().parseFromString(
        renderToStaticMarkup(<LegalChanges locale={locale} full />),
        'text/html'
      );
      for (const kind of ['privacy', 'terms'] as const) {
        const footer = full.querySelector(`article[id="${kind}"] footer p`);
        expect(footer?.textContent).not.toMatch(banned);
        expect(footer?.textContent?.length).toBeGreaterThan(0);
        // The in-force footers keep their wording (pinned by the revisions tests).
        expect(getLegalDocument(kind, locale).footer).toMatch(banned);
      }
      if (locale === 'en') {
        expect(
          full.querySelector('article[id="privacy"] footer p')?.textContent
        ).toBe(
          'Draft revision for review; not a newly effective agreement. Questions and rights requests may be sent to privacy@tuturuuu.com.'
        );
        expect(
          full.querySelector('article[id="terms"] footer p')?.textContent
        ).toBe(
          'Draft revision for review; not a newly effective agreement. Enterprise order forms and mandatory consumer law may add or override terms.'
        );
      }
    });
    it(`${locale} unpublished version block shows only Proposed and Not yet in effect`, () => {
      const copy = (locale === 'vi' ? vietnamese : en).legalRedesign;
      const current = getLegalDocument('terms', locale);
      const page = new DOMParser().parseFromString(
        renderToStaticMarkup(<LegalChanges locale={locale} />),
        'text/html'
      );
      expect(page.querySelector('.version-document')?.textContent).toBe(
        `${current.title} ${current.highlightedWord}`
      );
      const [inForce, proposed] = page.querySelectorAll(
        '.version-pair section'
      );
      expect(inForce?.textContent).toContain(current.version);
      expect(inForce?.textContent).toContain(current.effectiveDate);
      expect(inForce?.querySelector('strong')?.textContent).toBe(copy.from);
      expect(proposed?.textContent).toBe(`${copy.to}${copy.notice}`);
      expect(proposed?.querySelector('dl')).toBeNull();
      expect(proposed?.textContent).not.toMatch(/draft|\d{4}-\d{2}-\d{2}/iu);
      expect(page.querySelector('.change-versions')?.textContent).not.toMatch(
        /draft/iu
      );
    });
    it(`${locale} published version block shows the real version and the notice date`, () => {
      const copy = (locale === 'vi' ? vietnamese : en).legalRedesign;
      const page = new DOMParser().parseFromString(
        renderToStaticMarkup(
          <LegalChanges
            locale={locale}
            noticeConfig={{
              published: true,
              noticeDate: 'NOTICE-DATE',
              laterDate: 'LATER-DATE',
              archiveLinks: { [locale]: 'ARCHIVE' },
            }}
          />
        ),
        'text/html'
      );
      const proposed = page.querySelectorAll('.version-pair section')[1];
      expect(proposed?.querySelector('strong')?.textContent).toBe(
        copy.published
      );
      expect(proposed?.querySelector('p')?.textContent).toBe('2026-09-13');
      expect(proposed?.textContent).toContain('NOTICE-DATE');
      expect(proposed?.textContent).not.toMatch(/draft/iu);
    });
    it(`${locale} full proposals show the notice, original draft footers and current-version links`, () => {
      const page = new DOMParser().parseFromString(
        renderToStaticMarkup(<LegalChanges locale={locale} full />),
        'text/html'
      );
      expect(page.querySelector('.change-status p')?.textContent).toBe(
        legalChangesCopy[locale].notInEffect
      );
      expect(page.querySelectorAll('h1')).toHaveLength(1);
      for (const kind of [
        'privacy',
        'terms',
        'dpa',
        'sla',
        'subprocessors',
        'acceptable-use',
        'community-guidelines',
      ] as const) {
        const article = page.querySelector(`article[id="${kind}"]`);
        const document = getProposedLegalDocument(kind, locale);
        expect(article?.querySelector('h2')?.textContent).toBe(
          `${document.title} ${document.highlightedWord}`
        );
        const displayFooter = document.footer
          .split(/(?<=[.!?])\s+/u)
          .filter(
            (sentence) =>
              !/requires legal review|counsel-review draft|cần được rà soát pháp lý|chờ rà soát pháp lý/iu.test(
                sentence
              )
          )
          .join(' ');
        expect(article?.querySelector('footer p')?.textContent).toBe(
          displayFooter
        );
        const path = ['dpa', 'sla', 'subprocessors'].includes(kind)
          ? `legal/${kind}`
          : kind;
        expect(article?.querySelector('footer a')?.getAttribute('href')).toBe(
          `${locale === 'vi' ? '/vi' : ''}/${path}`
        );
        expect(article?.querySelector('footer a')?.textContent).toBe(
          legalChangesCopy[locale].currentVersion
        );
      }
    });
    it(`${locale} canonical pages restore dates and link once to changes`, () => {
      for (const kind of [
        'privacy',
        'terms',
        'dpa',
        'sla',
        'subprocessors',
        'acceptable-use',
        'community-guidelines',
      ] as const) {
        const html = renderToStaticMarkup(
          <LegalPage kind={kind} locale={locale} />
        );
        const page = new DOMParser().parseFromString(html, 'text/html');
        expect(page.querySelector('footer p')?.textContent).toBe(
          getLegalDocument(kind, locale).footer
        );
        expect(html.match(/href="(?:\/vi)?\/legal\/changes"/gu)).toHaveLength(
          1
        );
        expect(html.toLowerCase()).toContain(
          'datetime="' +
            (kind === 'acceptable-use' || kind === 'community-guidelines'
              ? '2026-02-06'
              : '2026-08-15') +
            '"'
        );
      }
    });
  }
});
