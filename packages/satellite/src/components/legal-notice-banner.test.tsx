import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { LegalNoticeConfig } from '@tuturuuu/legal/notice-config';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LEGAL_NOTICE_DISMISS_KEY_PREFIX,
  LegalNoticeBanner,
} from './legal-notice-banner';

const open = (noticeDate: string): LegalNoticeConfig => ({
  published: true,
  noticeDate,
  laterDate: '2026-12-11',
  archiveLinks: { en: 'links', vi: 'links' },
});
const now = () => new Date('2026-11-20T09:00:00+07:00');

function renderBanner(config: LegalNoticeConfig, locale = 'en', href?: string) {
  return render(
    <NextIntlClientProvider locale={locale} messages={{}}>
      <LegalNoticeBanner config={config} href={href} now={now} />
    </NextIntlClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('LegalNoticeBanner', () => {
  it.each([
    [
      'vi',
      'Chúng tôi đã cập nhật Điều khoản và Chính sách quyền riêng tư',
      'Xem thay đổi',
      undefined,
      '/legal/changes',
    ],
    [
      'en',
      "We've updated our Terms and Privacy Policy",
      'See what changed',
      'https://tuturuuu.com/legal/changes',
      'https://tuturuuu.com/legal/changes',
    ],
  ])(
    'renders %s copy with the changes link',
    (locale, line, link, href, expected) => {
      renderBanner(open('2026-11-11'), locale, href);

      expect(screen.getByText(line)).toBeTruthy();
      expect(
        screen.getByRole('link', { name: link }).getAttribute('href')
      ).toBe(expected);
    }
  );

  it('dismisses per notice version and stays dismissed', () => {
    renderBanner(open('2026-11-11'));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByRole('region')).toBeNull();
    expect(
      window.localStorage.getItem(
        `${LEGAL_NOTICE_DISMISS_KEY_PREFIX}2026-11-11`
      )
    ).toBe('1');

    cleanup();
    renderBanner(open('2026-11-11'));
    expect(screen.queryByRole('region')).toBeNull();

    cleanup();
    renderBanner(open('2026-11-12'));
    expect(screen.getByRole('region')).toBeTruthy();
  });

  it('still renders and dismisses when storage throws', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);

    renderBanner(open('2026-11-13'));
    expect(screen.getByRole('region')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('renders nothing while the window is closed', () => {
    const { container } = renderBanner({
      published: false,
      noticeDate: null,
      laterDate: null,
      archiveLinks: null,
    });

    expect(container.innerHTML).toBe('');
  });
});
