// Explicit `.js` specifiers keep this subpath valid under NodeNext consumers.
import type { LegalNoticeConfig } from './notice-config.js';
import type { LegalLocale } from './types.js';

export const LEGAL_NOTICE_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// `en-CA` formats as YYYY-MM-DD, so calendar days compare as strings.
const vietnamDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: LEGAL_NOTICE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// The in-app notice window is driven by the same `legalNotice` config that
// publishes /legal/changes: open from noticeDate through laterDate inclusive,
// as calendar days in Vietnam. Unpublished or malformed config stays closed.
export function isLegalNoticeWindowOpen(
  config: LegalNoticeConfig,
  now: Date
): boolean {
  if (!config.published) return false;
  const { noticeDate, laterDate } = config;
  if (!ISO_DATE.test(noticeDate) || !ISO_DATE.test(laterDate)) return false;
  if (Number.isNaN(now.getTime())) return false;
  const today = vietnamDay.format(now);
  return noticeDate <= today && today <= laterDate;
}

export const legalNoticeBannerCopy: Record<
  LegalLocale,
  { message: string; link: string; dismiss: string }
> = {
  en: {
    message: "We've updated our Terms and Privacy Policy",
    link: 'See what changed',
    dismiss: 'Dismiss',
  },
  vi: {
    message: 'Chúng tôi đã cập nhật Điều khoản và Chính sách quyền riêng tư',
    link: 'Xem thay đổi',
    dismiss: 'Đóng',
  },
};
