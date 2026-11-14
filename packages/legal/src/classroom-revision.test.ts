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

for (const locale of ['en', 'vi'] as const) {
  it(`requires guardian-aware processing for minor students in ${locale}`, () => {
    const text = (kind: ClassroomLegalKind) =>
      getClassroomLegalProposal(kind, locale)
        .sections.filter((section) => section.id?.includes('-meet-classroom-'))
        .map((section) => section.content)
        .join('\n');
    if (locale === 'en') {
      expect(text('privacy')).toContain(
        'verifiable parent or guardian consent'
      );
      expect(text('privacy')).toContain("the child's own consent");
      expect(text('privacy')).toContain(
        'Tab-switch telemetry and full AI for children'
      );
      expect(text('privacy')).toContain('guardian-consent requirements above');
      expect(text('dpa')).toContain('lawful basis and guardian consent');
    } else {
      expect(text('privacy')).toContain(
        'sự đồng ý có thể xác minh của cha mẹ hoặc người giám hộ'
      );
      expect(text('privacy')).toContain('sự đồng ý của chính trẻ');
      expect(text('privacy')).toContain(
        'Theo dõi chuyển tab và AI đầy đủ cho trẻ em'
      );
      expect(text('privacy')).toContain(
        'yêu cầu về sự đồng ý của người giám hộ nêu trên'
      );
      expect(text('dpa')).toContain(
        'cơ sở pháp lý và sự đồng ý của người giám hộ'
      );
    }
    expect(legalNotice.published).toBe(false);
  });
}
