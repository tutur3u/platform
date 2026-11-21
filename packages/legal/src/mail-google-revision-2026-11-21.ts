import type { LegalDocument, LegalLocale, LegalSection } from './types';

export const MAIL_GOOGLE_LEGAL_SOURCE_SHA =
  '9849f219a9b8026dcd1dad6ca457609d77fbbe4a';
export const MAIL_GOOGLE_LEGAL_DATE = '2026-11-21';
export const MAIL_GOOGLE_USER_DATA_POLICY_URL =
  'https://developers.google.com/terms/api-services-user-data-policy';
export const MAIL_GOOGLE_PERMISSIONS_URL =
  'https://myaccount.google.com/permissions';

/** References resolve at MAIL_GOOGLE_LEGAL_SOURCE_SHA. */
export const MAIL_GOOGLE_REVISION_EVIDENCE: Readonly<
  Record<string, readonly string[]>
> = {
  'mail-google-user-data': [
    // Gmail access is limited to the gmail.modify scope.
    'apps/mail/src/lib/mail/connected/config.ts:3',
    // Connection credentials are sealed with AES-256-GCM under MAIL_CONNECTED_ACCOUNTS_KEY.
    'apps/mail/src/lib/mail/connected/crypto.ts:4',
    'apps/mail/src/lib/mail/connected/crypto.ts:12',
    'apps/mail/src/lib/mail/connected/oauth.ts:162',
    // Disconnect deletes the mail_connected_accounts row holding the tokens.
    'apps/mail/src/lib/mail/connected/route.ts:55',
    'apps/mail/src/lib/mail/connected/route.ts:57',
    'apps/mail/src/lib/mail/connected/route.ts:59',
  ],
};

type Addition = readonly [id: string, title: string, content: string];

const copy: Record<LegalLocale, readonly Addition[]> = {
  en: [
    [
      'mail-google-user-data',
      'Google user data in Tuturuuu Mail',
      `When you connect a Gmail account, Tuturuuu Mail accesses your Gmail messages, labels and drafts through the Gmail API to show, organize and send your mail at your direction. Tuturuuu's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy (${MAIL_GOOGLE_USER_DATA_POLICY_URL}), including the Limited Use requirements. We do not use Gmail data for advertising, do not sell it, and do not use it to train generalized AI/ML models. Connection credentials are encrypted at rest. You can disconnect at any time in Mail settings or at ${MAIL_GOOGLE_PERMISSIONS_URL}, after which we stop accessing your account and delete the stored tokens.`,
    ],
  ],
  vi: [
    [
      'mail-google-user-data',
      'Dữ liệu người dùng Google trong Tuturuuu Mail',
      `Khi bạn kết nối một tài khoản Gmail, Tuturuuu Mail truy cập thư, nhãn và thư nháp Gmail của bạn qua Gmail API để hiển thị, sắp xếp và gửi thư theo chỉ dẫn của bạn. Việc Tuturuuu sử dụng và chuyển giao thông tin nhận được từ Google API tuân thủ Google API Services User Data Policy (${MAIL_GOOGLE_USER_DATA_POLICY_URL}), bao gồm các yêu cầu Limited Use. Chúng tôi không dùng dữ liệu Gmail cho quảng cáo, không bán dữ liệu này và không dùng dữ liệu này để huấn luyện các mô hình AI/ML tổng quát. Thông tin xác thực của kết nối được mã hóa khi lưu trữ. Bạn có thể ngắt kết nối bất cứ lúc nào trong phần cài đặt Mail hoặc tại ${MAIL_GOOGLE_PERMISSIONS_URL}; sau đó chúng tôi ngừng truy cập tài khoản của bạn và xóa các token đã lưu.`,
    ],
  ],
};

/** Appends the Mail Google user data disclosure to the Privacy Policy only. */
export function reviseMailGoogleLegalDocument(
  document: LegalDocument
): LegalDocument {
  if (document.kind !== 'privacy') return document;
  const ids = new Set(document.sections.map((section) => section.id));
  const missing = copy[document.locale].filter(([id]) => !ids.has(id));
  if (!missing.length) return document;
  return {
    ...document,
    sections: [
      ...document.sections,
      ...missing.map(([id, title, content]): LegalSection => ({
        id,
        title,
        content,
        icon: 'lock',
        tone: 'green',
      })),
    ],
  };
}

/** Dated canonical publication metadata for the Privacy Policy; legal review remains required. */
export function proposeMailGoogleLegalPublication(
  document: LegalDocument
): LegalDocument {
  if (document.kind !== 'privacy') return document;
  return {
    ...reviseMailGoogleLegalDocument(document),
    effectiveDate: MAIL_GOOGLE_LEGAL_DATE,
    publishedDate: MAIL_GOOGLE_LEGAL_DATE,
    version: MAIL_GOOGLE_LEGAL_DATE,
    reviewRequired: true,
  };
}
