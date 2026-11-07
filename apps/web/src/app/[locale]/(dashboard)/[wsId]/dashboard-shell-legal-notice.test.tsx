import { cleanup, render, screen } from '@testing-library/react';
import type { LegalNoticeConfig } from '@tuturuuu/legal/notice-config';
import { NextIntlClientProvider } from 'next-intl';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ config: null as unknown }));
vi.mock('@tuturuuu/legal/notice-config', () => ({
  get legalNotice() {
    return state.config;
  },
}));
vi.mock('@/hooks/use-lazy-client-component', () => ({
  useLazyClientComponent: () => null,
}));
vi.mock('@/context/sidebar-context', () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

import { DashboardShellClient } from './dashboard-shell-client';

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

describe('dashboard shell legal notice mount', () => {
  it.each([
    ['open', OPEN, 1],
    ['closed', CLOSED, 0],
  ])('renders the banner only while the window is %s', (_, config, count) => {
    state.config = config;
    const props = {
      isGuestWorkspace: true,
      links: [],
      personalWorkspacePrompt: <p>personal prompt</p>,
      sidebarBehavior: 'expanded',
      user: { id: 'user' },
      workspace: { id: 'ws' },
      wsId: 'ws',
    } as unknown as ComponentProps<typeof DashboardShellClient>;
    render(
      <NextIntlClientProvider locale="vi" messages={{}}>
        <DashboardShellClient {...props}>{null}</DashboardShellClient>
      </NextIntlClientProvider>
    );

    const links = screen.queryAllByRole('link', { name: 'Xem thay đổi' });
    expect(links).toHaveLength(count);
    if (count) expect(links[0]?.getAttribute('href')).toBe('/legal/changes');
    expect(screen.getByText('personal prompt')).toBeTruthy();
  });
});
