import { describe, expect, it } from 'vitest';
import {
  getClassroomLegalProposal,
  type ClassroomLegalKind,
} from './classroom-revision';
import { getLegalDocument } from './documents';
import { legalNotice } from './notice';

const kinds: ClassroomLegalKind[] = [
  'privacy',
  'terms',
  'dpa',
  'subprocessors',
];
for (const locale of ['en', 'vi'] as const) {
  describe(`classroom proposal ${locale}`, () => {
    for (const kind of kinds) {
      it(`${kind} is separate and preserves every current section`, () => {
        const before = structuredClone(getLegalDocument(kind, locale));
        const draft = getClassroomLegalProposal(kind, locale);
        expect(draft.sections.slice(0, before.sections.length)).toEqual(
          before.sections
        );
        expect(draft.sections).toHaveLength(before.sections.length + 2);
        expect(draft).toMatchObject({
          published: false,
          effectiveDate: null,
          publishedDate: null,
          reviewRequired: true,
          version: '2026-11-10-meet-classroom',
        });
        expect(getLegalDocument(kind, locale)).toEqual(before);
        expect(legalNotice.published).toBe(false);
      });
    }
    it('includes the exact plan allowances without setting prices', () => {
      const terms = getClassroomLegalProposal('terms', locale).sections.at(
        -1
      )!.content;
      for (const row of [
        '| FREE | 10 | 40 min | 10 meetings | 0 | 1 GB | No |',
        '| PLUS | 50 | 4 h | 40 h | 10 h | 20 GB | Yes |',
        '| PRO | 50 | 8 h | 160 h | 40 h | 100 GB | Yes |',
        '| ENTERPRISE | 100 | 12 h | 600 h | 160 h | 1 TB | Yes |',
      ])
        expect(terms).toContain(row);
      expect(terms).not.toMatch(/\$\d|USD|VND|₫/);
    });
  });
}
