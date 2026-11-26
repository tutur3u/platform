import { mobileRevisionCopy } from './mobile-revision-copy';
import type { LegalDocument, LegalLocale, LegalSection } from './types';

export const MOBILE_PRIVACY_LEGAL_SOURCE_SHA =
  'b876ab30c3f4a3be126021880b787d0bb187c9e5';
export const MOBILE_PRIVACY_LEGAL_DATE = '2026-11-26';

export const MOBILE_PRIVACY_REVISION_HISTORY_ENTRY = {
  effectiveDate: MOBILE_PRIVACY_LEGAL_DATE,
  publishedDate: MOBILE_PRIVACY_LEGAL_DATE,
  version: MOBILE_PRIVACY_LEGAL_DATE,
  sourceSha: MOBILE_PRIVACY_LEGAL_SOURCE_SHA,
  kinds: ['privacy', 'subprocessors'] as const,
  summary: {
    en: 'Removed the provisional advertising-technology audit caveat and confirmed no mobile advertising IDs or cross-app tracking; published mobile Firebase Analytics, Crashlytics, Cloud Messaging, Installations and first-party device identifier disclosures; updated Vietnam legal citation to Law No. 91/2025/QH15; reconciled the subprocessor registry (added Firebase (Google), Upstash, Anthropic and AWS SES; removed unused Sentry).',
    vi: 'Gỡ bỏ điều khoản dự phòng về kiểm toán công nghệ quảng cáo và xác nhận ứng dụng di động không thu thập mã định danh quảng cáo hay theo dõi xuyên ứng dụng; công bố thông tin về Firebase Analytics, Crashlytics, Cloud Messaging, Installations và mã định danh thiết bị bên thứ nhất trên ứng dụng di động; cập nhật dẫn chiếu pháp luật Việt Nam sang Luật số 91/2025/QH15; đối soát danh mục bên xử lý phụ (bổ sung Firebase (Google), Upstash, Anthropic và AWS SES; gỡ bỏ Sentry không sử dụng).',
  },
} as const;

const noSaleReplacements: Record<
  LegalLocale,
  readonly [oldText: string, newText: string]
> = {
  en: [
    'We do not sell personal information or share it for cross-context behavioral advertising, subject to final provider and advertising-technology audit before publication.',
    'We do not sell personal information or share it for cross-context behavioral advertising, and our mobile applications do not collect advertising identifiers (IDFA or Android Advertising ID) or track users across third-party apps or websites.',
  ],
  vi: [
    'Chúng tôi không bán thông tin cá nhân hoặc chia sẻ cho quảng cáo hành vi xuyên bối cảnh, với điều kiện tuyên bố này được xác nhận trong kiểm toán cuối cùng về nhà cung cấp và công nghệ quảng cáo.',
    'Chúng tôi không bán thông tin cá nhân hoặc chia sẻ cho quảng cáo hành vi xuyên bối cảnh; ứng dụng di động của chúng tôi không thu thập mã định danh quảng cáo (IDFA hoặc Android Advertising ID) và không theo dõi người dùng xuyên suốt ứng dụng hay trang web của bên thứ ba.',
  ],
};

const vietnamLawReplacements: Record<
  LegalLocale,
  readonly [oldText: string, newText: string]
> = {
  en: [
    "Rights under Vietnam's Decree 13/2023, the GDPR and UK GDPR",
    "Rights under Vietnam's Law on Personal Data Protection No. 91/2025/QH15 (effective 1 January 2026) and its implementing rules, the GDPR and UK GDPR",
  ],
  vi: [
    'Quyền theo Nghị định 13/2023 của Việt Nam, GDPR/UK GDPR',
    'Quyền theo Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 của Việt Nam (có hiệu lực từ ngày 01/01/2026) và các văn bản hướng dẫn thi hành, GDPR/UK GDPR',
  ],
};

const subprocessorListReplacements: Record<
  LegalLocale,
  readonly [oldText: string, newText: string]
> = {
  en: [
    'The current registry includes **Supabase, Vercel, Cloudflare, OpenAI, Google Cloud, Microsoft, Polar, Resend, and Sentry**.',
    'The current registry includes **Supabase, Vercel, Cloudflare, Upstash, OpenAI, Anthropic, Google Cloud, Firebase (Google), Microsoft, Polar, AWS SES, and Resend**.',
  ],
  vi: [
    'Danh mục hiện tại gồm **Supabase, Vercel, Cloudflare, OpenAI, Google Cloud, Microsoft, Polar, Resend và Sentry**.',
    'Danh mục hiện tại gồm **Supabase, Vercel, Cloudflare, Upstash, OpenAI, Anthropic, Google Cloud, Firebase (Google), Microsoft, Polar, AWS SES và Resend**.',
  ],
};

const mobileDeviceIdentifierParagraph: Record<LegalLocale, string> = {
  en: "**Device identifiers for authentication and security.** When you sign in, approve multi-factor authentication or QR login, or register a device for push notifications, the mobile app sends a first-party device identifier (such as Apple's identifierForVendor on iOS or Android ID on Android) to Tuturuuu servers, linked to your account for authentication security, anti-abuse protection and push-device registration.",
  vi: '**Mã định danh thiết bị cho xác thực và bảo mật.** Khi bạn đăng nhập, phê duyệt xác thực đa yếu tố hoặc đăng nhập bằng mã QR, hoặc đăng ký thiết bị nhận thông báo đẩy, ứng dụng di động gửi mã định danh thiết bị bên thứ nhất (như identifierForVendor trên iOS hoặc Android ID trên Android) đến máy chủ Tuturuuu, gắn với tài khoản của bạn để bảo mật xác thực, chống lạm dụng và đăng ký thiết bị nhận thông báo đẩy.',
};

function buildLiveMobileSection(locale: LegalLocale): LegalSection {
  return {
    id: 'privacy-mobile',
    title: locale === 'vi' ? 'Ứng dụng di động' : 'Mobile app',
    content: [
      ...mobileRevisionCopy[locale].paragraphs,
      mobileDeviceIdentifierParagraph[locale],
    ].join('\n\n'),
    icon: 'bell',
    tone: 'blue',
  };
}

function buildLiveFirebaseSubprocessorSections(
  locale: LegalLocale
): LegalSection[] {
  return mobileRevisionCopy[locale].processors.map((provider, index) => ({
    id: `subprocessors-mobile-${index + 1}`,
    title: provider.name,
    content: [
      provider.purpose,
      provider.dataCategories.join('; '),
      provider.regions.join('; '),
      `[Firebase](${provider.privacyUrl})`,
      MOBILE_PRIVACY_LEGAL_DATE,
    ].join('\n\n'),
    icon: 'server',
    tone: 'blue',
  }));
}

function replaceExactOnce(
  content: string,
  [oldText, newText]: readonly [string, string]
): string {
  return content.includes(oldText)
    ? content.replace(oldText, newText)
    : content;
}

/** Applies the 2026-11-26 mobile privacy alignment and subprocessor reconciliation. */
export function reviseMobilePrivacyLegalDocument(
  document: LegalDocument
): LegalDocument {
  if (document.kind === 'privacy') {
    const locale = document.locale;
    let changed = false;
    const sections = document.sections.map((section) => {
      if (section.id === 'privacy-section-5') {
        const updated = replaceExactOnce(
          section.content,
          noSaleReplacements[locale]
        );
        if (updated !== section.content) {
          changed = true;
          return { ...section, content: updated };
        }
      }
      if (section.id === 'privacy-rights') {
        const updated = replaceExactOnce(
          section.content,
          vietnamLawReplacements[locale]
        );
        if (updated !== section.content) {
          changed = true;
          return { ...section, content: updated };
        }
      }
      return section;
    });
    const hasMobileSection = sections.some(
      (section) => section.id === 'privacy-mobile'
    );
    if (!hasMobileSection) {
      changed = true;
      sections.push(buildLiveMobileSection(locale));
    }
    if (!changed) return document;
    return { ...document, sections };
  }

  if (document.kind === 'subprocessors') {
    const locale = document.locale;
    let changed = false;
    const sections = document.sections.map((section) => {
      if (section.id === 'subprocessors-section-1') {
        const updated = replaceExactOnce(
          section.content,
          subprocessorListReplacements[locale]
        );
        if (updated !== section.content) {
          changed = true;
          return { ...section, content: updated };
        }
      }
      return section;
    });
    const ids = new Set(sections.map((section) => section.id));
    const missing = buildLiveFirebaseSubprocessorSections(locale).filter(
      (section) => !ids.has(section.id)
    );
    if (missing.length > 0) {
      changed = true;
      sections.push(...missing);
    }
    if (!changed) return document;
    return { ...document, sections };
  }

  return document;
}

/** Dated canonical publication metadata for Privacy Policy and Subprocessor Registry. */
export function proposeMobilePrivacyLegalPublication(
  document: LegalDocument
): LegalDocument {
  if (document.kind !== 'privacy' && document.kind !== 'subprocessors')
    return document;
  return {
    ...reviseMobilePrivacyLegalDocument(document),
    effectiveDate: MOBILE_PRIVACY_LEGAL_DATE,
    publishedDate: MOBILE_PRIVACY_LEGAL_DATE,
    version: MOBILE_PRIVACY_LEGAL_DATE,
    reviewRequired: true,
  };
}
