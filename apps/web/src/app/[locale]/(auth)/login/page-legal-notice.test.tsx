import { cleanup, render, screen } from '@testing-library/react';
import type { LegalNoticeConfig } from '@tuturuuu/legal/notice-config';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ config: null as unknown }));
vi.mock('@tuturuuu/legal/notice-config', () => ({
  get legalNotice() {
    return state.config;
  },
}));
vi.mock('@/lib/auth/local-e2e', () => ({
  getLocalE2ESupabaseBrowserConfig: () => null,
  isLocalE2EAuthBypassEnabled: () => false,
}));
vi.mock('./login-content', () => ({ LoginContent: () => <p>login form</p> }));

import Login from './page';

const OPEN: LegalNoticeConfig = {
  published: true,
  noticeDate: '2026-11-11',
  laterDate: '2026-12-11',
  archiveLinks: { en: 'links', vi: 'links' },
};
const CLOSED: LegalNoticeConfig = {
  published: false,
  noticeDate: null,
  laterDate: null,
  archiveLinks: null,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-20T09:00:00+07:00'));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('login page legal notice mount', () => {
  it.each([
    ['open', OPEN, 1],
    ['closed', CLOSED, 0],
  ])(
    'renders the banner only while the window is %s',
    async (_, config, count) => {
      state.config = config;
      render(
        <NextIntlClientProvider locale="en" messages={{}}>
          {await Login()}
        </NextIntlClientProvider>
      );

      const links = screen.queryAllByRole('link', { name: 'See what changed' });
      expect(links).toHaveLength(count);
      if (count) expect(links[0]?.getAttribute('href')).toBe('/legal/changes');
      expect(screen.getByText('login form')).toBeTruthy();
    }
  );
});
