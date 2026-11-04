import {
  getLegalDocument,
  type LegalNoticeConfig,
  renderRevisionDocument,
} from '@tuturuuu/legal';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ARCHIVED_KINDS,
  archivePath,
  getArchivedLegalPageConfig,
} from './archive-legal-config';
import { toLegalPageConfig } from './canonical-legal-config';
import { LegalMarkdown } from './legal-markdown';

const published = {
  published: true,
  noticeDate: '2026-11-11',
  laterDate: '2026-12-11',
  mobilePrivacyEffectiveDate: '2026-11-11',
  archiveLinks: { en: 'x', vi: 'x' },
} satisfies LegalNoticeConfig;
const unpublished = {
  published: false,
  noticeDate: null,
  laterDate: null,
} satisfies LegalNoticeConfig;

describe('legal archive 2026-08-15', () => {
  for (const locale of ['en', 'vi'] as const)
    for (const kind of ARCHIVED_KINDS)
      it(`${locale} ${kind}: serves the frozen 2026-08-15 text unchanged`, () => {
        // Pinned to the 2026-08-15 record, not to whatever the live page
        // serves, so it still holds after the notice is published. The pinned
        // hashes live in legal-archive-freeze.test.ts.
        const august = getLegalDocument(kind, locale, unpublished);
        const canonical = toLegalPageConfig(august);
        const archived = getArchivedLegalPageConfig(kind, locale);
        expect(archived).toEqual({ ...canonical, upcomingChanges: undefined });
        expect(
          getArchivedLegalPageConfig(kind, locale).sections.map(
            (s) => s.content
          )
        ).toEqual(august.sections.map((s) => s.content));
        expect(getLegalDocument(kind, locale, published).version).toBe(
          kind === 'sla' ? '2026-08-15' : '2026-11-11'
        );
      });

  it('uses the archive paths that the revised text links to', () => {
    expect(archivePath('en')).toBe('/legal/archive/2026-08-15');
    expect(archivePath('vi')).toBe('/vi/legal/archive/2026-08-15');
    const terms = renderRevisionDocument('terms', 'en');
    expect(terms.sections.map((s) => s.content).join('\n')).toContain(
      '(/legal/archive/2026-08-15)'
    );
  });
});

describe('LegalMarkdown tables', () => {
  it('renders the revision tables as tables with every cell', () => {
    const privacy = renderRevisionDocument('privacy', 'en');
    const retention = privacy.sections.find(
      (s) => s.id === 'privacy-section-3'
    )!.content;
    const html = renderToStaticMarkup(
      <LegalMarkdown>{retention}</LegalMarkdown>
    );
    expect(html).toContain('<table>');
    expect(html).toContain('<th scope="col">Data</th>');
    expect(html).toContain('<td>Backups</td>');
    expect(html).not.toContain('| Data |');
  });

  it('leaves non-table markdown as before', () => {
    expect(
      renderToStaticMarkup(<LegalMarkdown>{'a | b\n\n* item'}</LegalMarkdown>)
    ).toBe('<p>a | b</p><ul><li>item</li></ul>');
  });
});
