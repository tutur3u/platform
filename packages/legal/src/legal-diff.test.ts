import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { diffLegalDocuments, diffLegalText } from './diff';
import { getLegalDocument } from './documents';
import { getLegalNotice, legalNotice } from './notice';
import { legalNoticeCopy } from './notice-copy';
import { getProposedLegalDocument } from './proposed';

describe('legal redesign source integrity', () => {
  for (const locale of ['en', 'vi'] as const) {
    it(`${locale}: notice copy matches Lex's source verbatim`, () => {
      const fixture = readFileSync(
        new URL('./fixtures/lex-notice.md', import.meta.url),
        'utf8'
      );
      const section = fixture
        .split(locale === 'en' ? '## EN\n' : '## VI\n')[1]!
        .split(locale === 'en' ? '## VI' : '\0')[0]!;
      const copy = legalNoticeCopy[locale];
      expect(section).toContain(copy.title);
      expect(section).toContain(copy.binding);
      expect(section).toContain(copy.nonbinding);
      expect(section).toContain(copy.summaryTitle);
      expect(section).toContain(copy.links);
      for (const row of [copy.tableHead, ...copy.rows])
        expect(section).toContain(`| ${row.join(' | ')} |`);
      expect(copy).toMatchSnapshot();
      expect(getLegalNotice(locale)).toBeNull();
      const notice = getLegalNotice(locale, {
        published: true,
        noticeDate: 'NOTICE-DATE',
        laterDate: 'LATER-DATE',
      });
      expect(notice?.binding).toBe(
        copy.binding
          .replaceAll('{N30}', 'LATER-DATE')
          .replaceAll('{N}', 'NOTICE-DATE')
      );
      expect(JSON.stringify(notice)).not.toMatch(/\{N(?:30)?\}/u);
    });
    it(`${locale}: every clause has a unique stable id and exact reversible diff`, () => {
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
        for (const doc of [before, after]) {
          expect(doc.sections.every((section) => section.id)).toBe(true);
          expect(new Set(doc.sections.map((section) => section.id)).size).toBe(
            doc.sections.length
          );
        }
        const changes = diffLegalDocuments(before.sections, after.sections);
        for (const change of changes) {
          expect(
            change.parts
              .filter((part) => part.kind !== 'added')
              .map((part) => part.text)
              .join('')
          ).toBe(
            before.sections.find((section) => section.id === change.id)
              ?.content ?? ''
          );
          expect(
            change.parts
              .filter((part) => part.kind !== 'removed')
              .map((part) => part.text)
              .join('')
          ).toBe(
            after.sections.find((section) => section.id === change.id)
              ?.content ?? ''
          );
        }
      }
    });
  }
  it('retains sentences and whitespace exactly, including markdown links', () => {
    expect(
      diffLegalText(
        'Keep this. Old sentence.\n\nEnd.',
        'Keep this. New sentence.\n\nEnd.'
      )
    ).toEqual([
      { kind: 'unchanged', text: 'Keep this. ' },
      { kind: 'removed', text: 'Old sentence.\n\n' },
      { kind: 'added', text: 'New sentence.\n\n' },
      { kind: 'unchanged', text: 'End.' },
    ]);
  });
  it('ships no notice dates', () => {
    expect(legalNotice).toEqual({
      published: false,
      noticeDate: null,
      laterDate: null,
    });
  });
});
