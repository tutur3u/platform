import { describe, expect, it } from 'vitest';
import { ARCHIVED_LEGAL_VERSIONS } from './archive';
import { getLegalDocument, LEGAL_DOCUMENTS } from './documents';
import {
  MOBILE_PRIVACY_LEGAL_DATE,
  MOBILE_PRIVACY_LEGAL_SOURCE_SHA,
  MOBILE_PRIVACY_REVISION_HISTORY_ENTRY,
  proposeMobilePrivacyLegalPublication,
  reviseMobilePrivacyLegalDocument,
} from './mobile-privacy-revision-2026-11-26';
import { mobileRevisionCopy } from './mobile-revision-copy';
import {
  requireMobilePrivacyReleaseDate,
  upcomingMobilePrivacyRevision,
} from './revisions';
import { SUBPROCESSORS } from './subprocessors';

describe('2026-11-26 mobile privacy alignment and subprocessor reconciliation', () => {
  it.each(['en', 'vi'] as const)(
    '%s privacy policy removes the provisional audit caveat and confirms no mobile ad IDs or cross-app tracking',
    (locale) => {
      const privacy = getLegalDocument('privacy', locale);
      const section5 = privacy.sections.find(
        (section) => section.id === 'privacy-section-5'
      );
      expect(section5?.content).toBeDefined();
      expect(section5?.content).not.toMatch(
        /subject to final provider|kiểm toán cuối cùng/iu
      );
      if (locale === 'en') {
        expect(section5?.content).toContain(
          'We do not sell personal information or share it for cross-context behavioral advertising, and our mobile applications do not collect advertising identifiers (IDFA or Android Advertising ID) or track users across third-party apps or websites.'
        );
      } else {
        expect(section5?.content).toContain(
          'Chúng tôi không bán thông tin cá nhân hoặc chia sẻ cho quảng cáo hành vi xuyên bối cảnh; ứng dụng di động của chúng tôi không thu thập mã định danh quảng cáo (IDFA hoặc Android Advertising ID) và không theo dõi người dùng xuyên suốt ứng dụng hay trang web của bên thứ ba.'
        );
      }
    }
  );

  it.each(['en', 'vi'] as const)(
    '%s privacy policy updates the Vietnam citation to Law No. 91/2025/QH15',
    (locale) => {
      const privacy = getLegalDocument('privacy', locale);
      const rights = privacy.sections.find(
        (section) => section.id === 'privacy-rights'
      );
      expect(rights?.content).not.toMatch(
        /Decree 13\/2023|Nghị định 13\/2023/u
      );
      expect(rights?.content).toContain('91/2025/QH15');
      if (locale === 'en') {
        expect(rights?.content).toContain(
          "Vietnam's Law on Personal Data Protection No. 91/2025/QH15 (effective 1 January 2026) and its implementing rules"
        );
      } else {
        expect(rights?.content).toContain(
          'Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 của Việt Nam (có hiệu lực từ ngày 01/01/2026) và các văn bản hướng dẫn thi hành'
        );
      }
    }
  );

  it.each(['en', 'vi'] as const)(
    '%s privacy policy publishes the PR #7305 mobile Firebase copy and first-party device identifier disclosure',
    (locale) => {
      const privacy = getLegalDocument('privacy', locale);
      expect(privacy.effectiveDate).toBe(MOBILE_PRIVACY_LEGAL_DATE);
      expect(privacy.publishedDate).toBe(MOBILE_PRIVACY_LEGAL_DATE);
      expect(privacy.version).toBe(MOBILE_PRIVACY_LEGAL_DATE);
      const mobile = privacy.sections.find(
        (section) => section.id === 'privacy-mobile'
      );
      expect(mobile).toBeDefined();
      for (const paragraph of mobileRevisionCopy[locale].paragraphs) {
        expect(mobile?.content).toContain(paragraph);
      }
      expect(mobile?.content).toContain('identifierForVendor');
      expect(mobile?.content).toContain('Android ID');
      expect(mobile?.content).not.toMatch(
        /processor|registry|danh sách|bên xử lý/iu
      );
    }
  );

  it('publishes upcomingMobilePrivacyRevision with a pinned release date and archives prior versions', () => {
    expect(upcomingMobilePrivacyRevision.published).toBe(true);
    expect(upcomingMobilePrivacyRevision.effectiveDate).toBe(
      MOBILE_PRIVACY_LEGAL_DATE
    );
    expect(
      requireMobilePrivacyReleaseDate(
        upcomingMobilePrivacyRevision.effectiveDate
      )
    ).toBe(MOBILE_PRIVACY_LEGAL_DATE);
    expect(MOBILE_PRIVACY_LEGAL_SOURCE_SHA).toMatch(/^[0-9a-f]{40}$/u);
    expect(MOBILE_PRIVACY_REVISION_HISTORY_ENTRY.effectiveDate).toBe(
      MOBILE_PRIVACY_LEGAL_DATE
    );
    expect(ARCHIVED_LEGAL_VERSIONS).toEqual(
      expect.arrayContaining([
        {
          effectiveDate: '2026-11-21',
          kind: 'privacy',
          locale: 'en',
          version: '2026-11-21',
        },
        {
          effectiveDate: '2026-11-21',
          kind: 'privacy',
          locale: 'vi',
          version: '2026-11-21',
        },
        {
          effectiveDate: '2026-11-12',
          kind: 'subprocessors',
          locale: 'en',
          version: '2026-11-12',
        },
        {
          effectiveDate: '2026-11-12',
          kind: 'subprocessors',
          locale: 'vi',
          version: '2026-11-12',
        },
      ])
    );
  });

  it('reconciles SUBPROCESSORS and the live bilingual Subprocessor Registry document', () => {
    const names = SUBPROCESSORS.map((provider) => provider.name);
    expect(names).toContain('Firebase (Google)');
    expect(names).toContain('Upstash');
    expect(names).toContain('Anthropic');
    expect(names).toContain('AWS SES');
    expect(names).not.toContain('Sentry');

    const firebase = SUBPROCESSORS.find(
      (provider) => provider.name === 'Firebase (Google)'
    );
    expect(firebase?.privacyUrl).toBe(
      'https://firebase.google.com/support/privacy'
    );
    expect(firebase?.regions).toEqual(['Provider-operated regions']);
    expect(firebase?.purpose).toContain('opt-in');
    expect(firebase?.purpose).toContain('analytics and crash reporting');
    expect(firebase?.changedAt).toBe(MOBILE_PRIVACY_LEGAL_DATE);

    for (const locale of ['en', 'vi'] as const) {
      const doc = getLegalDocument('subprocessors', locale);
      expect(doc.effectiveDate).toBe(MOBILE_PRIVACY_LEGAL_DATE);
      expect(doc.version).toBe(MOBILE_PRIVACY_LEGAL_DATE);
      const overview = doc.sections.find(
        (section) => section.id === 'subprocessors-section-1'
      );
      expect(overview?.content).toContain('Firebase (Google)');
      expect(overview?.content).toContain('Upstash');
      expect(overview?.content).toContain('Anthropic');
      expect(overview?.content).toContain('AWS SES');
      expect(overview?.content).not.toContain('Sentry');
      expect(
        doc.sections.some((section) => section.id === 'subprocessors-mobile-1')
      ).toBe(true);
      expect(
        doc.sections.some((section) => section.id === 'subprocessors-mobile-2')
      ).toBe(true);
    }
  });

  it('is idempotent and leaves source baseline and unrelated documents untouched', () => {
    for (const locale of ['en', 'vi'] as const) {
      for (const kind of ['privacy', 'subprocessors'] as const) {
        const original = LEGAL_DOCUMENTS[locale][kind];
        const before = structuredClone(original);
        const once = reviseMobilePrivacyLegalDocument(original);
        expect(original).toEqual(before);
        expect(reviseMobilePrivacyLegalDocument(once)).toBe(once);
      }
      for (const kind of ['terms', 'dpa', 'sla'] as const) {
        const doc = LEGAL_DOCUMENTS[locale][kind];
        expect(reviseMobilePrivacyLegalDocument(doc)).toBe(doc);
        expect(proposeMobilePrivacyLegalPublication(doc)).toBe(doc);
      }
    }
  });
});
