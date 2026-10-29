import { createMemoryHistory } from '@tanstack/react-router';
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
        expect(html).not.toMatch(
          /2026-08-15|August 15, 2026|Effective |Có hiệu lực từ/u
        );
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
        expect(html).not.toMatch(
          /Draft for review|draft requires|counsel-review draft|Bản dự thảo|bản dự thảo/u
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
