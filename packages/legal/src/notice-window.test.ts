import { describe, expect, it } from 'vitest';
import type { LegalNoticeConfig } from './notice';
import {
  isLegalNoticeWindowOpen,
  legalNoticeBannerCopy,
} from './notice-window';

const open: LegalNoticeConfig = {
  published: true,
  noticeDate: '2026-11-11',
  laterDate: '2026-12-11',
  archiveLinks: { en: 'links', vi: 'links' },
};

// Asia/Ho_Chi_Minh is UTC+7, so local midnight is 17:00 UTC the day before.
const vn = (date: string, time = '00:00') =>
  new Date(`${date}T${time}:00+07:00`);

describe('isLegalNoticeWindowOpen', () => {
  it('is closed the day before noticeDate', () => {
    expect(isLegalNoticeWindowOpen(open, vn('2026-11-10', '23:59'))).toBe(
      false
    );
  });

  it('opens at the start of noticeDate in Asia/Ho_Chi_Minh', () => {
    expect(isLegalNoticeWindowOpen(open, vn('2026-11-11'))).toBe(true);
    // 17:00 UTC on 10 Nov is already 11 Nov in Vietnam.
    expect(
      isLegalNoticeWindowOpen(open, new Date('2026-11-10T17:00:00Z'))
    ).toBe(true);
  });

  it('stays open through the end of laterDate', () => {
    expect(isLegalNoticeWindowOpen(open, vn('2026-12-11', '23:59'))).toBe(true);
  });

  it('is closed the day after laterDate', () => {
    expect(isLegalNoticeWindowOpen(open, vn('2026-12-12'))).toBe(false);
  });

  it('is closed while the notice is unpublished', () => {
    expect(
      isLegalNoticeWindowOpen(
        {
          published: false,
          noticeDate: null,
          laterDate: null,
          archiveLinks: null,
        },
        vn('2026-11-20')
      )
    ).toBe(false);
  });

  it('is closed for malformed dates instead of throwing', () => {
    expect(
      isLegalNoticeWindowOpen(
        { ...open, noticeDate: 'NOTICE-DATE' },
        vn('2026-11-20')
      )
    ).toBe(false);
  });

  it('ships the banner line and link in both locales', () => {
    expect(legalNoticeBannerCopy.vi).toEqual({
      message: 'Chúng tôi đã cập nhật Điều khoản và Chính sách quyền riêng tư',
      link: 'Xem thay đổi',
      dismiss: 'Đóng',
    });
    expect(legalNoticeBannerCopy.en).toEqual({
      message: "We've updated our Terms and Privacy Policy",
      link: 'See what changed',
      dismiss: 'Dismiss',
    });
  });
});
