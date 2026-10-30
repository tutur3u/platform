import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import septemberHashes from './fixtures/september-draft-hashes.json';
import { mobileRevisionCopy } from './mobile-revision-copy';
import { getLegalNotice, legalNotice } from './notice';
import { getProposedLegalDocument } from './proposed';
import { getLegalRevision, upcomingLegalRevision } from './revisions';

const kinds = [
  'privacy',
  'terms',
  'dpa',
  'sla',
  'subprocessors',
  'acceptable-use',
  'community-guidelines',
] as const;

describe('pinned November proposal', () => {
  for (const locale of ['en', 'vi'] as const) {
    for (const kind of kinds) {
      it(`${locale}/${kind} preserves the complete September snapshot`, () => {
        const old = getProposedLegalDocument(kind, locale, '2026-09-13-draft');
        expect(
          createHash('sha256').update(JSON.stringify(old)).digest('hex')
        ).toBe(septemberHashes[locale][kind]);
      });
      it(`${locale}/${kind} pins November without replacing existing clauses`, () => {
        const old = getLegalRevision(kind, locale, '2026-09-13-draft');
        const next = getLegalRevision(kind, locale);
        expect(next).toMatchObject(upcomingLegalRevision);
        expect(next.sections.slice(0, old.sections.length)).toEqual(
          old.sections
        );
        expect(next.summaryRows).toEqual(old.summaryRows);
        expect(next.footer).toBe(old.footer);
        expect(
          createHash('sha256').update(JSON.stringify(next)).digest('hex')
        ).toMatchSnapshot();
        expect(getProposedLegalDocument(kind, locale).version).toBe(
          '2026-11-02'
        );
        expect(getProposedLegalDocument(kind, locale)).not.toHaveProperty(
          'effectiveDate'
        );
        if (kind !== 'privacy' && kind !== 'subprocessors')
          expect(next.sections).toEqual(old.sections);
      });
    }
    it(`${locale} includes the exact B/C copy and processor fields`, () => {
      const fixture = readFileSync(
        new URL('./fixtures/mobile-7294.md', import.meta.url),
        'utf8'
      );
      const copy = mobileRevisionCopy[locale];
      const privacy = getLegalRevision('privacy', locale);
      const processors = getLegalRevision('subprocessors', locale);
      const sourceParagraphs = fixture
        .split(`\n${locale.toUpperCase()}\n`)[1]!
        .split('\n')
        .filter((line) => line.startsWith('**'))
        .slice(0, 2);
      expect(copy.paragraphs).toEqual(sourceParagraphs);
      expect(
        privacy.sections.find((section) => section.id === 'privacy-mobile')
          ?.content
      ).toBe(sourceParagraphs.join('\n\n'));
      expect(copy.processors).toHaveLength(2);
      for (const [index, provider] of copy.processors.entries()) {
        expect(fixture).toContain(
          ` - ${locale.toUpperCase()} purpose: "${provider.purpose}"`
        );
        expect(fixture).toContain(
          ` - Data (${locale.toUpperCase()}): ${provider.dataCategories[0]}`
        );
        expect(provider.regions).toEqual(['Provider-operated regions']);
        expect(provider.privacyUrl).toBe(
          'https://firebase.google.com/support/privacy'
        );
        expect(provider.changedAt).toBe('2026-12-02');
        const row = processors.sections.find(
          (section) => section.id === `subprocessors-mobile-${index + 1}`
        );
        expect(row?.title).toBe(provider.name);
        for (const field of [
          provider.purpose,
          ...provider.dataCategories,
          ...provider.regions,
          provider.privacyUrl,
          provider.changedAt,
        ])
          expect(row?.content).toContain(field);
      }
      expect(JSON.stringify(privacy)).not.toMatch(
        /default.on|outside.*EEA|mặc định bật|ngoài.*EEA/iu
      );
      expect(JSON.stringify(privacy)).not.toContain('[changedAt');
    });
  }
  it('keeps publication held with no notice dates', () => {
    expect(legalNotice).toEqual({
      published: false,
      noticeDate: null,
      laterDate: null,
      archiveLinks: null,
    });
    expect(getLegalNotice('en')).toBeNull();
    expect(getLegalNotice('vi')).toBeNull();
  });
});
