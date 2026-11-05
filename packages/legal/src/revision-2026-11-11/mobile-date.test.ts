import { describe, expect, it } from 'vitest';
import { getLegalDocument } from '../documents';
import { getLegalNotice, type LegalNoticeConfig } from '../notice';
import { legalRevisionChangesCopy } from '../revision-changes';
import { upcomingMobilePrivacyRevision } from '../revisions';
import { REVISION_KINDS, renderRevisionDocument } from './render';

const locales = ['en', 'vi'] as const;
const base = {
  published: true,
  noticeDate: '2026-11-11',
  laterDate: '2026-12-11',
  archiveLinks: {
    en: '[Version of 15 August 2026](/legal/archive/2026-08-15)',
    vi: '[Phiên bản ngày 15 tháng 8 năm 2026](/vi/legal/archive/2026-08-15)',
  },
} satisfies LegalNoticeConfig;

const text = (config: LegalNoticeConfig, locale: 'en' | 'vi') =>
  REVISION_KINDS.map((kind) =>
    getLegalDocument(kind, locale, config)
      .sections.map((s) => s.content)
      .join('\n')
  ).join('\n');
const registry = (config: LegalNoticeConfig, locale: 'en' | 'vi') =>
  getLegalDocument('subprocessors', locale, config).sections.at(-1)!.content;
const leaks = /\{D(_ISO)?\}|\bnull\b|\bundefined\b|NaN/u;

describe('published notice with the mobile date D', () => {
  for (const locale of locales) {
    it(`${locale}: D unset keeps the mobile section and Firebase rows out, with no date`, () => {
      for (const config of [
        base,
        { ...base, mobilePrivacyEffectiveDate: null },
      ]) {
        const privacy = getLegalDocument('privacy', locale, config);
        expect(privacy.sections.some((s) => s.id === 'privacy-mobile')).toBe(
          false
        );
        expect(registry(config, locale)).not.toContain('Firebase');
        expect(text(config, locale)).not.toMatch(leaks);
        const notice = getLegalNotice(locale, config)!;
        expect(notice.mobilePrivacyEffectiveDate).toBeNull();
        expect(JSON.stringify(notice)).not.toMatch(/undefined|\{D/u);
      }
      // The changes page falls back to the pending line (no `time` element).
      expect(upcomingMobilePrivacyRevision.effectiveDate).toBeNull();
      expect(
        legalRevisionChangesCopy[locale].pendingDate.length
      ).toBeGreaterThan(0);
    });

    it(`${locale}: D on or before the notice date releases P12 and the Firebase rows`, () => {
      for (const d of ['2026-11-05', '2026-11-11']) {
        const config = { ...base, mobilePrivacyEffectiveDate: d };
        const privacy = getLegalDocument('privacy', locale, config);
        expect(privacy.sections.some((s) => s.id === 'privacy-mobile')).toBe(
          true
        );
        expect(registry(config, locale)).toContain('Firebase');
        expect(text(config, locale)).not.toMatch(leaks);
        expect(getLegalNotice(locale, config)!.mobilePrivacyEffectiveDate).toBe(
          d
        );
      }
    });

    it(`${locale}: D after the notice date stays held`, () => {
      const config = { ...base, mobilePrivacyEffectiveDate: '2026-11-20' };
      const privacy = getLegalDocument('privacy', locale, config);
      expect(privacy.sections.some((s) => s.id === 'privacy-mobile')).toBe(
        false
      );
      expect(registry(config, locale)).not.toContain('Firebase');
      expect(text(config, locale)).not.toMatch(leaks);
    });

    it(`${locale}: an invalid D string still throws`, () => {
      for (const d of ['', 'date pending', '2026-02-30', '11/11/2026'])
        for (const run of [
          () =>
            getLegalDocument('privacy', locale, {
              ...base,
              mobilePrivacyEffectiveDate: d,
            }),
          () =>
            getLegalNotice(locale, { ...base, mobilePrivacyEffectiveDate: d }),
        ])
          expect(run).toThrow('requires a pinned release date');
    });
  }

  it('refuses to release the mobile items without a date', () => {
    expect(() =>
      renderRevisionDocument('privacy', 'en', { mobileReleased: true })
    ).toThrow('requires the pinned date');
  });
});
