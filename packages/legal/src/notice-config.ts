import type { LegalLocale } from './types.js';

export type LegalNoticeConfig =
  | {
      published: false;
      noticeDate: null;
      laterDate: null;
      archiveLinks?: null;
    }
  | {
      published: true;
      noticeDate: string;
      laterDate: string;
      mobilePrivacyEffectiveDate?: string;
      // Markdown for the "Previous text" link line, per locale. Publish gate:
      // Lex approves the real archive URLs before publication; do not invent
      // them. Publishing without the rendered locale's entry throws.
      archiveLinks: Partial<Record<LegalLocale, string>>;
    };

// Only the release owner may enable this after the user's explicit notice go.
export const legalNotice: LegalNoticeConfig = {
  published: false,
  noticeDate: null,
  laterDate: null,
  archiveLinks: null,
};
