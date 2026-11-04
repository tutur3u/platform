import { cleanup, render, screen } from '@testing-library/react';
import type { LegalNoticeConfig } from '@tuturuuu/legal/notice-config';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ config: null as unknown }));
vi.mock('@tuturuuu/legal/notice-config', () => ({
  get legalNotice() {
    return state.config;
  },
}));
vi.mock('@tuturuuu/ui/custom/satellite-shell', () => ({
  SatelliteShell: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock('@tuturuuu/ui/custom/use-satellite-shell', () => ({
  useSatelliteShell: () => ({
    isCollapsed: false,
    navState: { currentLinks: [], titleHistory: [] },
    setAppsLauncherOpen: vi.fn(),
    setWorkspaceSelectVisible: vi.fn(),
    workspaceSelectVisible: false,
  }),
}));
vi.mock('@tuturuuu/ui/custom/sidebar-footer-actions', () => ({
  SidebarFooterActions: () => null,
}));
vi.mock('@tuturuuu/ui/custom/tuturuuu-logo', () => ({
  TuturuuLogo: () => null,
}));
vi.mock('./apps-launcher', () => ({ AppsLauncherDialog: () => null }));
vi.mock('next/navigation', () => ({ usePathname: () => '/ws' }));
vi.mock('../constants/common', () => ({
  SIDEBAR_COLLAPSED_COOKIE_NAME: 'sidebar-collapsed',
}));
vi.mock('./sidebar-structure-content', () => ({
  SidebarStructureContent: () => null,
}));
vi.mock('../context/sidebar-context', () => ({
  getSidebarCookieOptions: () => ({}),
  useSidebar: () => ({ behavior: 'expanded', handleBehaviorChange: vi.fn() }),
}));

import { SidebarStructure } from './sidebar-structure';

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

describe('SidebarStructure legal notice mount', () => {
  it.each([
    ['open', OPEN, 1],
    ['closed', CLOSED, 0],
  ])('renders the banner only while the window is %s', (_, config, count) => {
    state.config = config;
    render(
      <NextIntlClientProvider locale="en" messages={{}} onError={() => {}}>
        <SidebarStructure
          actions={null}
          appId="calendar"
          links={[]}
          userPopover={null}
          workspace={null}
          wsId="ws"
        >
          <p>app content</p>
        </SidebarStructure>
      </NextIntlClientProvider>
    );

    const links = screen.queryAllByRole('link', { name: 'See what changed' });
    expect(links).toHaveLength(count);
    if (count)
      expect(links[0]?.getAttribute('href')).toBe(
        'https://tuturuuu.com/legal/changes'
      );
    expect(screen.getByText('app content')).toBeTruthy();
  });
});
