// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  diffLegalDocuments,
  getLegalDocument,
  getLegalNotice,
  getProposedLegalDocument,
  legalNoticeCopy,
} from '@tuturuuu/legal';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LegalChanges } from '../src/components/legal/legal-changes';
import { LegalMarkdown } from '../src/components/legal/legal-markdown';
import { RedlineView } from '../src/components/legal/redline-view';

describe('legal notice presentation', () => {
  for (const locale of ['en', 'vi'] as const)
    for (const published of [false, true])
      for (const full of [false, true]) {
        it(`${locale}, published=${published}, full=${full}: notice cannot collapse and exact diffs are accessible`, () => {
          const noticeConfig = published
            ? {
                published: true as const,
                noticeDate: 'NOTICE',
                mobilePrivacyEffectiveDate: '2026-11-05',
                laterDate: 'LATER',
                archiveLinks: { [locale]: 'ARCHIVE' },
              }
            : { published: false as const, noticeDate: null, laterDate: null };
          const html = renderToStaticMarkup(
            <LegalChanges
              locale={locale}
              full={full}
              noticeConfig={noticeConfig}
            />
          );
          const page = new DOMParser().parseFromString(html, 'text/html');
          const binding = page.querySelector('[data-binding-notice]');
          expect(binding).not.toBeNull();
          expect(binding?.closest('details,[hidden]')).toBeNull();
          expect(page.querySelectorAll('h1')).toHaveLength(1);
          expect(page.querySelector('del .sr-only')?.textContent).toContain(
            locale === 'vi' ? 'Đã xóa:' : 'Removed:'
          );
          expect(page.querySelector('ins .sr-only')?.textContent).toContain(
            locale === 'vi' ? 'Đã thêm:' : 'Added:'
          );
          expect(
            page.querySelector(
              `nav[aria-label="${locale === 'vi' ? 'Ngôn ngữ' : 'Language'}"] a[href^="/vi/"]`
            )
          ).not.toBeNull();
          // Acceptable Use and Community Guidelines are left out of the diff
          // until their clause ids pair; no clause may read as "Removed".
          expect(page.querySelector('#changes-acceptable-use')).toBeNull();
          expect(
            page.querySelector('#changes-community-guidelines')
          ).toBeNull();
          expect(
            page.querySelector('.change-toc a[href$="acceptable-use"]')
          ).toBeNull();
          expect(page.querySelectorAll('.change-document')).toHaveLength(5);
          // The nav marks the proposal with a decorative dot only while unpublished.
          expect(
            page.querySelector('.legal-hub-nav .proposed-dot') === null
          ).toBe(published);
          expect(page.querySelector('.lawyer-review')).toBeNull();
          expect(html).not.toMatch(
            /NOT LAWYER-REVIEWED|Summary pending Lex review|CHƯA ĐƯỢC LUẬT SƯ|đang chờ Lex|requires legal review|counsel-review draft|cần được rà soát pháp lý|chờ rà soát pháp lý/iu
          );
          if (published) {
            expect(binding?.textContent).toContain('NOTICE');
            expect(binding?.textContent).toContain('LATER');
            if (!full) {
              const summary = page.querySelector(
                '.change-layout > div > .change-summary'
              );
              expect(summary?.querySelectorAll('tbody tr')).toHaveLength(10);
              expect(summary?.textContent).toContain(
                getLegalNotice(locale, noticeConfig)?.nonbinding
              );
              expect(summary?.textContent).toContain('ARCHIVE');
              expect(html).not.toContain('ARCHIVE_LINKS');
            }
          } else {
            expect(binding?.textContent).not.toContain('NOTICE');
            // Unpublished state is Variant 1 only: no Lex notice copy.
            expect(html).not.toContain(legalNoticeCopy[locale].nonbinding);
            expect(page.body.textContent).not.toContain(
              legalNoticeCopy[locale].title
            );
          }
        });
      }
  for (const locale of ['en', 'vi'] as const)
    it(`${locale}: rendered redlines retain exact clause wording`, () => {
      const normalize = (text: string) => text.replace(/\s+/gu, ' ').trim();
      const parse = (html: string) =>
        new DOMParser().parseFromString(html, 'text/html');
      const readable = (node: Element) => {
        const copy = document.createElement('div');
        copy.append(node.cloneNode(true));
        for (const block of copy.querySelectorAll('p,li,blockquote'))
          block.append(' ');
        return copy.textContent ?? '';
      };
      for (const kind of [
        'terms',
        'privacy',
        'dpa',
        'sla',
        'subprocessors',
        'acceptable-use',
        'community-guidelines',
      ] as const) {
        const before = getLegalDocument(kind, locale),
          after = getProposedLegalDocument(kind, locale);
        for (const change of diffLegalDocuments(
          before.sections,
          after.sections
        )) {
          const page = parse(
            renderToStaticMarkup(
              <RedlineView locale={locale} change={change} />
            )
          );
          for (const [doc, excluded] of [
            [before, 'added'],
            [after, 'removed'],
          ] as const) {
            const actual = [...page.querySelectorAll('[data-legal-part]')]
              .filter(
                (node) => node.getAttribute('data-legal-part') !== excluded
              )
              .map((node) => readable(node))
              .join('');
            const content =
              doc.sections.find((section) => section.id === change.id)
                ?.content ?? '';
            const expected = parse(
              renderToStaticMarkup(<LegalMarkdown>{content}</LegalMarkdown>)
            ).body;
            const expectedText = readable(expected);
            expect(normalize(actual)).toBe(normalize(expectedText));
          }
        }
      }
    });
  it('prints expanded inline redlines and link targets', () => {
    const css = readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../src/components/legal/legal-changes.css'
      ),
      'utf8'
    );
    const compact = css.replace(/\s+/gu, '');
    expect(css).toContain('@media print');
    expect(compact).toContain('content-visibility:visible');
    expect(compact).toContain('break-inside:avoid');
    expect(css).toContain('attr(href)');
  });
});
