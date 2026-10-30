import { describe, expect, it } from 'vitest';
import { getLegalDocument } from './documents';
import { getLegalNotice } from './notice';
import { legalRevisionChangesCopy } from './revision-changes';
import {
  getLegalRevision,
  upcomingLegalRevision,
  upcomingMobilePrivacyRevision,
} from './revisions';

describe('mobile privacy release separate from the commercial proposal', () => {
  for (const locale of ['en', 'vi'] as const) {
    it(`${locale} A is exactly in-force privacy plus the shared mobile section`, () => {
      const current = getLegalDocument('privacy', locale);
      const a = getLegalRevision(
        'privacy',
        locale,
        upcomingMobilePrivacyRevision.version
      );
      const b = getLegalRevision(
        'privacy',
        locale,
        upcomingLegalRevision.version
      );
      const section = b.sections.find((item) => item.id === 'privacy-mobile');
      expect(section).toBeDefined();
      expect(a).toEqual({
        ...current,
        ...upcomingMobilePrivacyRevision,
        sections: [...current.sections, section],
      });
      expect(a.sections.at(-1)).toEqual(section);
      expect(a).toMatchSnapshot();
      expect(a.effectiveDate).toBeNull();
      expect(a.published).toBe(false);
      expect(
        a.sections.some((item) => item.id?.startsWith('privacy-proposal'))
      ).toBe(false);
      expect(section?.content).toContain(
        locale === 'en'
          ? 'including a Firebase installation identifier'
          : 'gồm mã định danh bản cài đặt Firebase'
      );
      // Existing in-force transfer/registry text is retained verbatim.
      // The new section and A summary make no processor-list claim.
      expect(section?.content).not.toMatch(
        /processor|registry|danh sách|bên xử lý/iu
      );
      expect(legalRevisionChangesCopy[locale].mobile).not.toMatch(
        /processor|registry|danh sách|bên xử lý/iu
      );
      expect(
        getLegalRevision('subprocessors', locale, upcomingLegalRevision.version)
          .sections.filter((item) =>
            item.id?.startsWith('subprocessors-mobile-')
          )
          .map((item) => item.content)
      ).toEqual([
        expect.stringContaining(upcomingLegalRevision.effectiveDate),
        expect.stringContaining(upcomingLegalRevision.effectiveDate),
      ]);
    });
  }
  it('rejects A for other document kinds', () => {
    expect(() =>
      getLegalRevision('terms', 'en', upcomingMobilePrivacyRevision.version)
    ).toThrow('Mobile revision supports privacy only');
  });
  const publish = (date?: string) =>
    getLegalNotice('en', {
      published: true,
      noticeDate: '2026-11-02',
      laterDate: upcomingLegalRevision.effectiveDate,
      archiveLinks: { en: '[Previous text](/legal/archive)' },
      mobilePrivacyEffectiveDate: date,
    });
  it.each([undefined, '', 'date pending', '2026-02-30'])(
    'refuses publication without a real pinned D: %s',
    (date) => {
      expect(() => publish(date)).toThrow('requires a pinned release date');
    }
  );
  it('accepts publication only with a pinned D', () => {
    expect(publish('2026-11-05')?.mobilePrivacyEffectiveDate).toBe(
      '2026-11-05'
    );
  });
});
